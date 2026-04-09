#!/usr/bin/env python3
"""
LoRA v2: Train + Inference on single RunPod pod.
- Train: Qwen2.5-7B-Instruct + LoRA (r=16, alpha=32)
- Inference: 198 eval cases with 4-bit quant
- Results saved to /workspace/v2_results.json
"""
import json, os, sys, time

# ============================================================
# Phase 1: Training
# ============================================================
def train():
    import torch
    from datasets import load_dataset
    from peft import LoraConfig, get_peft_model
    from transformers import (
        AutoModelForCausalLM, AutoTokenizer, 
        BitsAndBytesConfig, TrainingArguments
    )
    from trl import SFTTrainer
    
    BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"
    OUTPUT_DIR = "/workspace/adapter-v2"
    
    print("=== Phase 1: Training ===", flush=True)
    print(f"Loading tokenizer...", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    print(f"Loading model (bf16)...", flush=True)
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )
    
    lora_config = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05,
        target_modules="all-linear",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    print("Loading datasets...", flush=True)
    train_ds = load_dataset("json", data_files="/workspace/train.jsonl", split="train")
    val_ds = load_dataset("json", data_files="/workspace/val.jsonl", split="train")
    print(f"Train: {len(train_ds)}, Val: {len(val_ds)}", flush=True)
    
    def formatting_func(example):
        return tokenizer.apply_chat_template(example["messages"], tokenize=False)
    
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=3,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=1e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.1,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,
        bf16=True,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        max_grad_norm=1.0,
        report_to="none",
    )
    
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        formatting_func=formatting_func,
        max_seq_length=2048,
        packing=False,
    )
    
    print("Starting training...", flush=True)
    start = time.time()
    result = trainer.train()
    elapsed = time.time() - start
    print(f"Training done in {elapsed:.0f}s", flush=True)
    print(f"Train loss: {result.training_loss:.4f}", flush=True)
    
    # Save adapter
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"Adapter saved to {OUTPUT_DIR}", flush=True)
    
    # Free memory
    del model, trainer
    torch.cuda.empty_cache()
    import gc; gc.collect()
    print("Memory freed", flush=True)
    return OUTPUT_DIR


# ============================================================
# Phase 2: Inference
# ============================================================
def inference(adapter_dir):
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    import urllib.request
    
    SUPABASE_URL = os.environ["SUPABASE_URL"]
    SUPABASE_KEY = os.environ["SUPABASE_KEY"]
    BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"
    RESULTS_PATH = "/workspace/v2_results.json"
    
    print("\n=== Phase 2: Inference ===", flush=True)
    
    # Load eval cases
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    url = (f"{SUPABASE_URL}/rest/v1/student_eval_cases"
           "?select=id,task_type,domain,difficulty,prompt_text,system_prompt,gold_response,gold_structured"
           "&quality_tier=eq.gold&order=created_at&limit=10000")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        cases = json.loads(resp.read().decode())
    print(f"Eval cases: {len(cases)}", flush=True)
    
    # Load model with 4-bit quant for inference
    print("Loading model (4-bit)...", flush=True)
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype="bfloat16", bnb_4bit_use_double_quant=True)
    
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL, quantization_config=bnb_config,
        device_map="auto", trust_remote_code=True)
    model = PeftModel.from_pretrained(model, adapter_dir)
    model.eval()
    print("Model ready", flush=True)
    
    structured_patterns = [
        "utterance_reading", "prediction", "question_generation", "question_expansion",
        "lens_discovery", "adaptive_q2", "observation_analysis", "free_text_analysis",
        "partner_dynamic_questions", "observation_reaction",
    ]
    
    results = []
    total = len(cases)
    import re
    
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
                    max_new_tokens=384,
                    temperature=0.4,
                    do_sample=True,
                    top_p=0.9,
                    repetition_penalty=1.15,
                    pad_token_id=tokenizer.pad_token_id,
                )
            generated = outputs[0][inputs["input_ids"].shape[1]:]
            text = tokenizer.decode(generated, skip_special_tokens=True).strip()
            latency_ms = int((time.time() - start) * 1000)
            
            structured = None
            if require_json and text:
                try:
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
        
        # Save every case
        with open(RESULTS_PATH, "w") as f:
            json.dump(results, f, ensure_ascii=False)
        
        elapsed = time.time() - start
        print(f"[{i+1}/{total}] {case['id'][:8]}... {elapsed:.1f}s len={len(results[-1]['text'])}", flush=True)
    
    errors = sum(1 for r in results if r.get("error"))
    print(f"\nDone! {len(results)} results, {errors} errors", flush=True)
    return RESULTS_PATH


# ============================================================
# Main
# ============================================================
if __name__ == "__main__":
    phase = os.environ.get("PHASE", "all")
    
    if phase in ("train", "all"):
        adapter_dir = train()
    else:
        adapter_dir = "/workspace/adapter-v2"
    
    if phase in ("infer", "all"):
        inference(adapter_dir)
    
    print("\n=== ALL DONE ===", flush=True)
