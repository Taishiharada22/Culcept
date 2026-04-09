"""
Modal LoRA fine-tuning for Qwen2.5-7B-Instruct.

Usage:
  modal run scripts/modal_train_lora.py \
    --train-file exports/train-2026-04-09-alter-voice-gold.jsonl \
    --val-file exports/val-2026-04-09-alter-voice-gold.jsonl \
    --run-name alter-voice-v1

Output:
  LoRA adapter weights saved to Modal Volume "lora-adapters"
  at /adapters/{run_name}/
"""

import modal
import os

app = modal.App("aneurasync-lora-train")

# Persistent volume for adapter weights
adapter_vol = modal.Volume.from_name("lora-adapters", create_if_missing=True)

# Image with training dependencies
train_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.1",
        "transformers==4.46.3",
        "peft==0.13.2",
        "datasets==3.1.0",
        "accelerate==1.1.1",
        "bitsandbytes==0.44.1",
        "trl==0.12.2",
        "wandb==0.18.7",
    )
)

BASE_MODEL = "Qwen/Qwen2.5-7B-Instruct"


@app.function(
    image=train_image,
    gpu="A100-80GB",
    timeout=3600,
    volumes={"/adapters": adapter_vol},
)
def train(train_jsonl: bytes, val_jsonl: bytes, run_name: str = "alter-voice-v1"):
    """Run SFT LoRA training on Qwen2.5-7B-Instruct."""
    import json
    import tempfile
    from pathlib import Path

    from datasets import Dataset
    from peft import LoraConfig, TaskType
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer

    # Write data to temp files
    tmpdir = Path(tempfile.mkdtemp())
    train_path = tmpdir / "train.jsonl"
    val_path = tmpdir / "val.jsonl"
    train_path.write_bytes(train_jsonl)
    val_path.write_bytes(val_jsonl)

    def load_chat_dataset(path: Path) -> Dataset:
        """Load JSONL with {messages: [...]} format into Dataset."""
        records = []
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            records.append({"messages": obj["messages"]})
        return Dataset.from_list(records)

    train_ds = load_chat_dataset(train_path)
    val_ds = load_chat_dataset(val_path)
    print(f"Train: {len(train_ds)} examples, Val: {len(val_ds)} examples")

    # Load model with 4-bit quantization for memory efficiency
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

    # LoRA config — same hyperparams as Together run for fair comparison
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=16,
        lora_alpha=32,
        lora_dropout=0.0,
        target_modules="all-linear",
        bias="none",
    )

    # Training config
    output_dir = tmpdir / "output"
    sft_config = SFTConfig(
        output_dir=str(output_dir),
        num_train_epochs=3,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,  # effective batch = 8
        learning_rate=1e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        max_grad_norm=1.0,
        logging_steps=5,
        eval_strategy="epoch",
        save_strategy="epoch",
        bf16=True,
        max_seq_length=2048,
        gradient_checkpointing=True,
        seed=42,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        peft_config=lora_config,
        processing_class=tokenizer,
    )

    print("Starting training...")
    trainer.train()

    # Save adapter
    adapter_path = Path(f"/adapters/{run_name}")
    adapter_path.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(adapter_path))
    tokenizer.save_pretrained(str(adapter_path))
    adapter_vol.commit()

    print(f"Adapter saved to volume at /adapters/{run_name}")

    # Return training metrics
    metrics = trainer.state.log_history
    return {
        "run_name": run_name,
        "adapter_path": f"/adapters/{run_name}",
        "train_examples": len(train_ds),
        "val_examples": len(val_ds),
        "epochs": 3,
        "final_metrics": metrics[-1] if metrics else {},
    }


@app.local_entrypoint()
def main(
    train_file: str = "exports/train-2026-04-09-alter-voice-gold.jsonl",
    val_file: str = "exports/val-2026-04-09-alter-voice-gold.jsonl",
    run_name: str = "alter-voice-v1",
):
    """Local entrypoint — reads files locally and sends to Modal."""
    train_data = open(train_file, "rb").read()
    val_data = open(val_file, "rb").read()

    print(f"Uploading {len(train_data)} bytes train, {len(val_data)} bytes val")
    result = train.remote(train_data, val_data, run_name)
    print(f"\nTraining complete!")
    print(f"  Run: {result['run_name']}")
    print(f"  Adapter: {result['adapter_path']}")
    print(f"  Final metrics: {result.get('final_metrics', {})}")
