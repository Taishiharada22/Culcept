#!/usr/bin/env python3
"""
RunPod self-contained inference script.
Downloads adapter from Supabase, runs inference, uploads results.
Passed as env vars: SUPABASE_URL, SUPABASE_KEY, DONE_IDS (comma-separated)
"""
import json
import os
import sys
import time
import urllib.request
import urllib.parse

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
ADAPTER_DIR = "/workspace/adapter"
RESULTS_PATH = "/workspace/results.json"

def supabase_headers():
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}

def download_adapter():
    """Download adapter files from Supabase Storage."""
    os.makedirs(ADAPTER_DIR, exist_ok=True)

    # List files in the adapter bucket path
    files = [
        "adapter_config.json", "added_tokens.json", "merges.txt",
        "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json",
        "training_args.bin", "vocab.json", "README.md",
    ]
    chunks = ["adapter_chunk_aa", "adapter_chunk_ab", "adapter_chunk_ac", "adapter_chunk_ad"]

    for fname in files + chunks:
        url = f"{SUPABASE_URL}/storage/v1/object/ml-artifacts/adapter-alter-voice-v1/{fname}"
        req = urllib.request.Request(url, headers=supabase_headers())
        out_path = os.path.join(ADAPTER_DIR, fname)
        print(f"Downloading {fname}...")
        try:
            with urllib.request.urlopen(req) as resp:
                with open(out_path, "wb") as f:
                    f.write(resp.read())
            print(f"  OK ({os.path.getsize(out_path) / 1024 / 1024:.1f}MB)")
        except Exception as e:
            print(f"  FAILED: {e}")
            if fname not in chunks and fname != "README.md":
                sys.exit(1)

    # Reassemble adapter_model.safetensors from chunks
    print("Reassembling adapter_model.safetensors...")
    with open(os.path.join(ADAPTER_DIR, "adapter_model.safetensors"), "wb") as out:
        for chunk in chunks:
            chunk_path = os.path.join(ADAPTER_DIR, chunk)
            with open(chunk_path, "rb") as f:
                out.write(f.read())
            os.remove(chunk_path)

    size = os.path.getsize(os.path.join(ADAPTER_DIR, "adapter_model.safetensors"))
    print(f"  Reassembled: {size / 1024 / 1024:.1f}MB")


def load_eval_cases():
    """Load held-out eval cases from Supabase."""
    url = (
        f"{SUPABASE_URL}/rest/v1/student_eval_cases"
        "?select=id,task_type,domain,difficulty,prompt_text,system_prompt,gold_response,gold_structured"
        "&quality_tier=eq.gold"
        "&order=created_at"
        "&limit=10000"
    )
    req = urllib.request.Request(url, headers=supabase_headers())
    with urllib.request.urlopen(req) as resp:
        cases = json.loads(resp.read().decode())
    return cases


def run_inference(cases):
    """Run inference using base model + LoRA adapter."""
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"

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

    print(f"Loading LoRA adapter from {ADAPTER_DIR}...")
    model = PeftModel.from_pretrained(model, ADAPTER_DIR)
    model.eval()

    # Classify structured tasks
    structured_patterns = [
        "utterance_reading", "prediction", "question_generation", "question_expansion",
        "lens_discovery", "adaptive_q2", "observation_analysis", "free_text_analysis",
        "partner_dynamic_questions", "observation_reaction",
    ]

    results = []
    total = len(cases)
    for i, case in enumerate(cases):
        require_json = any(p in case["task_type"] for p in structured_patterns)
        system_prompt = case.get("system_prompt") or ""
        user_prompt = case["prompt_text"]

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
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=2048,
                    temperature=0.3,
                    do_sample=True,
                    pad_token_id=tokenizer.pad_token_id,
                )
            generated = outputs[0][inputs["input_ids"].shape[1]:]
            text = tokenizer.decode(generated, skip_special_tokens=True).strip()
            latency_ms = int((time.time() - start) * 1000)

            structured = None
            if require_json and text:
                try:
                    import re
                    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
                    structured = json.loads(m.group(1).strip() if m else text)
                except Exception:
                    pass

            results.append({
                "id": case["id"], "text": text, "structured": structured,
                "latency_ms": latency_ms, "error": None,
            })
        except Exception as e:
            results.append({
                "id": case["id"], "text": "", "structured": None,
                "latency_ms": int((time.time() - start) * 1000), "error": str(e),
            })

        if (i + 1) % 10 == 0 or i + 1 == total:
            print(f"Progress: {i+1}/{total} ({(i+1)/total*100:.0f}%)")
            # Save intermediate results
            with open(RESULTS_PATH, "w") as f:
                json.dump(results, f, ensure_ascii=False)

    return results


def upload_results(results):
    """Upload results to Supabase Storage."""
    data = json.dumps(results, ensure_ascii=False).encode()
    url = f"{SUPABASE_URL}/storage/v1/object/ml-artifacts/results-alter-voice-v1.json"
    req = urllib.request.Request(url, data=data, method="POST", headers={
        **supabase_headers(),
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Results uploaded ({len(data)/1024:.1f}KB)")
    except urllib.error.HTTPError:
        # Try PUT (upsert) if POST fails
        req = urllib.request.Request(url, data=data, method="PUT", headers={
            **supabase_headers(),
            "Content-Type": "application/json",
        })
        with urllib.request.urlopen(req) as resp:
            print(f"Results uploaded via PUT ({len(data)/1024:.1f}KB)")


def main():
    # Filter out already-done cases
    done_ids_str = os.environ.get("DONE_IDS", "")
    done_ids = set(done_ids_str.split(",")) if done_ids_str else set()
    print(f"Already done: {len(done_ids)} cases")

    print("=== Step 1: Download adapter ===")
    download_adapter()

    print("\n=== Step 2: Load eval cases ===")
    all_cases = load_eval_cases()
    cases = [c for c in all_cases if c["id"] not in done_ids]
    print(f"Total: {len(all_cases)}, Remaining: {len(cases)}")

    if not cases:
        print("All cases already done!")
        return

    print("\n=== Step 3: Install dependencies ===")
    os.system("pip install torch transformers peft accelerate bitsandbytes -q")

    print("\n=== Step 4: Run inference ===")
    results = run_inference(cases)

    print(f"\n=== Step 5: Upload results ===")
    upload_results(results)

    errors = sum(1 for r in results if r.get("error"))
    print(f"\nDone! {len(results)} results ({errors} errors)")
    print(f"Results saved to {RESULTS_PATH}")


if __name__ == "__main__":
    main()
