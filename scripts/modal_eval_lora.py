"""
Modal LoRA eval — run held-out eval directly on Modal GPU.

Loads Qwen2.5-7B-Instruct + LoRA adapter, runs inference on all eval cases,
returns results as JSON. No need for a separate server.

Usage:
  modal run scripts/modal_eval_lora.py --run-name alter-voice-v1
"""

import modal
import os
import json

app = modal.App("aneurasync-lora-eval")

adapter_vol = modal.Volume.from_name("lora-adapters", create_if_missing=True)

eval_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.1",
        "transformers==4.46.3",
        "peft==0.13.2",
        "accelerate==1.1.1",
        "bitsandbytes==0.44.1",
    )
)

BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"


@app.function(
    image=eval_image,
    gpu="L4",
    timeout=3600,
    volumes={"/adapters": adapter_vol},
)
def run_inference(eval_cases_json: str, run_name: str = "alter-voice-v1") -> str:
    """Run inference on eval cases using base model + LoRA adapter."""
    import time
    from pathlib import Path
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    adapter_path = f"/adapters/{run_name}"
    if not Path(adapter_path).exists():
        raise FileNotFoundError(f"Adapter not found at {adapter_path}")

    print(f"Loading base model {BASE_MODEL}...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype="bfloat16",
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )

    print(f"Loading LoRA adapter from {adapter_path}...")
    model = PeftModel.from_pretrained(model, adapter_path)
    model.eval()

    eval_cases = json.loads(eval_cases_json)
    results = []
    total = len(eval_cases)

    for i, case in enumerate(eval_cases):
        case_id = case["id"]
        system_prompt = case.get("system_prompt") or ""
        user_prompt = case["prompt_text"]
        require_json = case.get("require_json", False)

        messages = []
        if system_prompt.strip():
            sys_text = system_prompt.strip()
            if require_json:
                sys_text += "\n\nYou must return exactly one valid JSON value. Return JSON only. Do not use markdown fences."
            messages.append({"role": "system", "content": sys_text})
        elif require_json:
            messages.append({"role": "system", "content": "You must return exactly one valid JSON value. Return JSON only. Do not use markdown fences."})
        messages.append({"role": "user", "content": user_prompt.strip()})

        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048).to(model.device)

        start = time.time()
        try:
            import torch
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=2048,
                    temperature=0.3,
                    do_sample=True,
                    pad_token_id=tokenizer.pad_token_id,
                )
            # Decode only the generated tokens (exclude input)
            generated = outputs[0][inputs["input_ids"].shape[1]:]
            text = tokenizer.decode(generated, skip_special_tokens=True).strip()
            latency_ms = int((time.time() - start) * 1000)

            # Try to parse JSON if needed
            structured = None
            if require_json and text:
                try:
                    import re
                    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
                    structured = json.loads(json_match.group(1).strip() if json_match else text)
                except Exception:
                    pass

            results.append({
                "id": case_id,
                "text": text,
                "structured": structured,
                "latency_ms": latency_ms,
                "error": None,
            })
        except Exception as e:
            latency_ms = int((time.time() - start) * 1000)
            results.append({
                "id": case_id,
                "text": "",
                "structured": None,
                "latency_ms": latency_ms,
                "error": str(e),
            })

        if (i + 1) % 10 == 0 or i + 1 == total:
            print(f"Progress: {i+1}/{total} ({(i+1)/total*100:.0f}%)")

    return json.dumps(results, ensure_ascii=False)


BATCH_SIZE = 25  # Small batches to survive preemption


@app.local_entrypoint()
def main(run_name: str = "alter-voice-v1"):
    """Load eval cases from Supabase, run inference on Modal in small batches."""
    import sys
    sys.path.insert(0, ".")

    # Load .env.local manually (no dotenv dependency)
    env_path = os.path.join(os.getcwd(), ".env.local")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

    import urllib.request

    supabase_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    # Load eval cases via PostgREST
    print("Loading held-out eval cases from Supabase...")
    url = (
        f"{supabase_url}/rest/v1/student_eval_cases"
        "?select=id,task_type,domain,difficulty,prompt_text,system_prompt,gold_response,gold_structured"
        "&quality_tier=eq.gold"
        "&order=created_at"
        "&limit=10000"
    )
    req = urllib.request.Request(url, headers={
        "apikey": service_role,
        "Authorization": f"Bearer {service_role}",
    })
    with urllib.request.urlopen(req) as resp:
        cases = json.loads(resp.read().decode())
    print(f"Loaded {len(cases)} eval cases")

    # Classify tasks to set require_json
    structured_patterns = [
        "utterance_reading", "prediction", "question_generation", "question_expansion",
        "lens_discovery", "adaptive_q2", "observation_analysis", "free_text_analysis",
        "partner_dynamic_questions", "observation_reaction",
    ]

    for c in cases:
        c["require_json"] = any(p in c["task_type"] for p in structured_patterns)

    # Run inference on Modal in small batches to survive preemption
    all_results = []
    # Check for existing partial results
    partial_path = f"exports/modal-inference-{run_name}-partial.json"
    done_ids = set()
    if os.path.exists(partial_path):
        with open(partial_path) as f:
            all_results = json.loads(f.read())
            done_ids = {r["id"] for r in all_results}
        print(f"Resuming: {len(done_ids)} cases already done")

    remaining = [c for c in cases if c["id"] not in done_ids]
    print(f"Sending {len(remaining)} remaining cases to Modal in batches of {BATCH_SIZE}...")

    for i in range(0, len(remaining), BATCH_SIZE):
        batch = remaining[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(remaining) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"\nBatch {batch_num}/{total_batches} ({len(batch)} cases)...")

        batch_json = json.dumps(batch, ensure_ascii=False)
        results_json = run_inference.remote(batch_json, run_name)
        batch_results = json.loads(results_json)
        all_results.extend(batch_results)

        # Save partial results after each batch
        with open(partial_path, "w") as f:
            json.dump(all_results, f, ensure_ascii=False)
        print(f"  Saved {len(all_results)} total results")

    results = all_results
    result_map = {r["id"]: r for r in results}

    # Save raw inference results
    os.makedirs("exports", exist_ok=True)
    raw_path = f"exports/modal-inference-{run_name}.json"
    with open(raw_path, "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Raw inference saved to {raw_path}")

    # Now run the eval rubric locally via the existing eval script
    # Build a combined file for the eval runner
    combined = []
    errors = 0
    for c in cases:
        r = result_map.get(c["id"])
        if not r or r.get("error"):
            errors += 1
            continue
        combined.append({
            "case": c,
            "student_response": r["text"],
            "student_structured": r.get("structured"),
            "latency_ms": r["latency_ms"],
        })

    combined_path = f"exports/modal-eval-combined-{run_name}.json"
    with open(combined_path, "w") as f:
        json.dump(combined, f, ensure_ascii=False, indent=2)

    print(f"\nInference complete: {len(combined)} succeeded, {errors} errors")
    print(f"Combined data saved to {combined_path}")
    print(f"\nTo evaluate, run:")
    print(f"  npx tsx scripts/eval-modal-results.ts {combined_path}")
