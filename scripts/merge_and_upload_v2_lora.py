"""
Merge v2 LoRA adapter into Qwen2.5-7B-Instruct base model and upload to HuggingFace.

Runs on a GPU environment (RunPod pod or similar). Outputs merged safetensors.

Prerequisites:
  - v2 LoRA adapter at --adapter-path (local or HF repo)
  - Base model: Qwen/Qwen2.5-7B-Instruct (auto-downloaded if not cached)
  - HF_TOKEN env var with write access to --hf-repo
  - GPU with ~20GB VRAM (for load + merge)
  - Disk: ~30GB free (base 14GB + merged 14GB)

Adapter status (2026-04-20):
  Confirmed alive on RunPod Pod `international_violet_whippet` (A100).
  Primary path:  /workspace/adapter-v2/checkpoint-120/
  Local backup:  adapter-v2-checkpoint-120.tar.gz (secondary source)
  → Use primary path as --adapter-path. No retraining needed.

Usage:
  # Option 1 (recommended): adapter already on RunPod pod
  HF_TOKEN=hf_xxx python merge_and_upload_v2_lora.py \
    --adapter-path /workspace/adapter-v2/checkpoint-120 \
    --output-dir /workspace/adapter-v2-merged \
    --hf-repo <hf-user>/qwen2.5-7b-instruct-alter-v2

  # Option 2: save locally only (no HF upload)
  python merge_and_upload_v2_lora.py \
    --adapter-path ./exports/adapter-v2 \
    --output-dir ./exports/adapter-v2-merged \
    --no-upload

Output:
  - {output-dir}/ : merged model in safetensors (bf16, ~14GB)
  - {output-dir}/tokenizer.json etc : tokenizer files
  - (optional) HF Hub private repo with the same content

Verification after merge:
  - Load merged model + tokenizer
  - Run a sanity prompt through generate()
  - Confirm Japanese output and no Chinese contamination on 1 sample
"""

import argparse
import os
import sys
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel


def merge_adapter(
    base_model_id: str,
    adapter_path: str,
    output_dir: str,
    dtype: torch.dtype = torch.bfloat16,
) -> None:
    print(f"[1/5] Loading base model: {base_model_id} (dtype={dtype})", flush=True)
    base = AutoModelForCausalLM.from_pretrained(
        base_model_id,
        torch_dtype=dtype,
        device_map="auto",
        trust_remote_code=True,
    )

    print(f"[2/5] Attaching LoRA adapter: {adapter_path}", flush=True)
    peft_model = PeftModel.from_pretrained(base, adapter_path)

    print("[3/5] Running merge_and_unload()", flush=True)
    merged = peft_model.merge_and_unload()

    print(f"[4/5] Saving merged model to: {output_dir}", flush=True)
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    merged.save_pretrained(
        output_dir,
        safe_serialization=True,
        max_shard_size="5GB",
    )

    print("[5/5] Saving tokenizer", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(base_model_id, trust_remote_code=True)
    tokenizer.save_pretrained(output_dir)

    print(f"[done] merged model at {output_dir}", flush=True)


def sanity_check(output_dir: str) -> bool:
    """Quick generation test to confirm merged model works."""
    print("\n[sanity] Loading merged model for generation test", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(output_dir, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        output_dir,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )

    messages = [
        {"role": "system", "content": "あなたは Alter です。短く、定型挨拶なしで応答してください。"},
        {"role": "user", "content": "今日は曇りで、気分が少し沈んでる"},
    ]

    prompt = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=200,
            temperature=0.4,
            top_p=0.9,
            repetition_penalty=1.15,
            do_sample=True,
        )

    text = tokenizer.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
    print(f"\n[sanity] generated:\n{text}\n", flush=True)

    # Basic quality checks
    if len(text.strip()) < 20:
        print("[sanity] FAIL: output too short", flush=True)
        return False

    # Chinese contamination check
    import re
    chinese_only = re.search(r"[\u4e00-\u9fff]{5,}", text) and not re.search(
        r"[\u3040-\u309f\u30a0-\u30ff]", text
    )
    if chinese_only:
        print("[sanity] FAIL: chinese contamination", flush=True)
        return False

    print("[sanity] PASS", flush=True)
    return True


def upload_to_hf(output_dir: str, hf_repo: str, private: bool = True) -> None:
    from huggingface_hub import HfApi, create_repo

    token = os.environ.get("HF_TOKEN")
    if not token:
        print("[upload] ERROR: HF_TOKEN env var not set", flush=True)
        sys.exit(1)

    print(f"[upload] Creating/verifying repo: {hf_repo} (private={private})", flush=True)
    create_repo(hf_repo, token=token, private=private, exist_ok=True)

    print(f"[upload] Uploading {output_dir} → {hf_repo}", flush=True)
    api = HfApi(token=token)
    api.upload_folder(
        folder_path=output_dir,
        repo_id=hf_repo,
        commit_message="Add merged Qwen2.5-7B + Alter v2 LoRA",
    )
    print(f"[upload] Done. URL: https://huggingface.co/{hf_repo}", flush=True)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--base-model", default="Qwen/Qwen2.5-7B-Instruct")
    p.add_argument("--adapter-path", required=True, help="LoRA adapter directory")
    p.add_argument("--output-dir", required=True, help="Where to save merged model")
    p.add_argument("--hf-repo", default=None, help="e.g. user/qwen2.5-7b-alter-v2")
    p.add_argument("--no-upload", action="store_true")
    p.add_argument("--skip-sanity", action="store_true")
    args = p.parse_args()

    # Validate adapter exists
    if not Path(args.adapter_path).exists():
        print(f"ERROR: adapter path does not exist: {args.adapter_path}", flush=True)
        sys.exit(1)

    merge_adapter(args.base_model, args.adapter_path, args.output_dir)

    if not args.skip_sanity:
        ok = sanity_check(args.output_dir)
        if not ok:
            print("Sanity check failed. Skipping upload.", flush=True)
            sys.exit(2)

    if not args.no_upload:
        if not args.hf_repo:
            print("ERROR: --hf-repo required for upload (or use --no-upload)", flush=True)
            sys.exit(1)
        upload_to_hf(args.output_dir, args.hf_repo)

    print("\n✅ All steps completed.", flush=True)


if __name__ == "__main__":
    main()
