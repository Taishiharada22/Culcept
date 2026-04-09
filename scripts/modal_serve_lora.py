"""
Modal vLLM inference server for Qwen2.5-7B-Instruct + LoRA adapter.

Usage:
  # Start server (stays running for 15 min after last request)
  modal serve scripts/modal_serve_lora.py

  # Or deploy persistently
  modal deploy scripts/modal_serve_lora.py

  # Then hit from eval runner:
  PROVIDER=local ENDPOINT=https://aneurasync-lora-serve--inference.modal.run MODEL=Qwen/Qwen2.5-7B-Instruct \
    npx tsx scripts/run-baseline-eval.ts
"""

import modal

app = modal.App("aneurasync-lora-serve")

adapter_vol = modal.Volume.from_name("lora-adapters", create_if_missing=True)

vllm_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "vllm==0.6.4.post1",
        "fastapi[standard]",
    )
)

BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"
ADAPTER_NAME = "alter-voice-v1"


@app.function(
    image=vllm_image,
    gpu="A100-40GB",
    container_idle_timeout=900,  # 15 min idle → shutdown
    allow_concurrent_inputs=10,
    volumes={"/adapters": adapter_vol},
)
@modal.asgi_app()
def inference():
    """Serve Qwen2.5-7B-Instruct + LoRA via vLLM OpenAI-compatible API."""
    import os
    from pathlib import Path

    from vllm.entrypoints.openai.api_server import build_async_engine_client
    from vllm.entrypoints.openai.run_batch import run_batch

    # Use vLLM's built-in OpenAI server
    adapter_path = f"/adapters/{ADAPTER_NAME}"
    if not Path(adapter_path).exists():
        raise FileNotFoundError(
            f"Adapter not found at {adapter_path}. Run modal_train_lora.py first."
        )

    from vllm import AsyncEngineArgs, AsyncLLMEngine
    from vllm.entrypoints.openai.api_server import (
        build_app,
    )
    from vllm.entrypoints.openai.serving_chat import OpenAIServingChat
    from vllm.entrypoints.openai.serving_models import OpenAIServingModels

    # vLLM with LoRA
    engine_args = AsyncEngineArgs(
        model=BASE_MODEL,
        enable_lora=True,
        max_lora_rank=16,
        max_loras=1,
        trust_remote_code=True,
        max_model_len=4096,
        dtype="bfloat16",
    )

    engine = AsyncLLMEngine.from_engine_args(engine_args)

    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    import uuid
    import time

    app = FastAPI()

    @app.post("/v1/chat/completions")
    async def chat_completions(request: Request):
        from vllm import SamplingParams
        from vllm.lora.request import LoRARequest

        body = await request.json()
        messages = body.get("messages", [])
        max_tokens = body.get("max_tokens", 2048)
        temperature = body.get("temperature", 0.3)

        # Format chat messages using tokenizer template
        from transformers import AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

        sampling_params = SamplingParams(
            temperature=temperature,
            max_tokens=max_tokens,
        )

        lora_request = LoRARequest(
            lora_name=ADAPTER_NAME,
            lora_int_id=1,
            lora_path=adapter_path,
        )

        request_id = str(uuid.uuid4())
        start = time.time()

        results = []
        async for output in engine.generate(prompt, sampling_params, request_id, lora_request=lora_request):
            results.append(output)

        final = results[-1] if results else None
        text = final.outputs[0].text if final else ""
        latency_ms = int((time.time() - start) * 1000)

        return JSONResponse({
            "id": request_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": BASE_MODEL,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": len(prompt) // 4,  # rough estimate
                "completion_tokens": len(text) // 4,
                "total_tokens": (len(prompt) + len(text)) // 4,
            },
        })

    @app.get("/v1/models")
    async def list_models():
        return JSONResponse({
            "object": "list",
            "data": [{"id": BASE_MODEL, "object": "model"}],
        })

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app
