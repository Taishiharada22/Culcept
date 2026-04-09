/**
 * RunPod Pod launcher for LoRA inference.
 *
 * Creates a GPU Pod, uploads inference script, runs it, polls for results.
 *
 * Usage:
 *   node scripts/runpod_launch.js
 */

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");

const RUNPOD_KEY = (process.env.RUNPOD_API_KEY || "").replace(/['"]/g, "");
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/['"]/g, "");
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/['"]/g, "");

// Already-done case IDs
const partial = JSON.parse(fs.readFileSync("exports/modal-inference-alter-voice-v1-partial.json", "utf-8"));
const doneIds = partial.map((r) => r.id).join(",");

async function graphql(query, variables = {}) {
  const res = await fetch(`https://api.runpod.io/graphql?api_key=${RUNPOD_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function createPod() {
  // The inference script as a base64-encoded string
  const scriptContent = fs.readFileSync("scripts/runpod_inference.py", "utf-8");
  const scriptB64 = Buffer.from(scriptContent).toString("base64");

  // Startup command: decode script, install deps, run
  const startupCmd = [
    `echo '${scriptB64}' | base64 -d > /workspace/inference.py`,
    `pip install torch transformers peft accelerate bitsandbytes -q 2>&1 | tail -1`,
    `cd /workspace && python inference.py 2>&1 | tee /workspace/inference.log`,
    `echo "INFERENCE_DONE" >> /workspace/inference.log`,
  ].join(" && ");

  const query = `
    mutation {
      podFindAndDeployOnDemand(input: {
        name: "aneurasync-lora-eval"
        imageName: "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04"
        gpuTypeId: "NVIDIA RTX A6000"
        gpuCount: 1
        volumeInGb: 50
        containerDiskInGb: 30
        minVcpuCount: 4
        minMemoryInGb: 16
        env: [
          { key: "SUPABASE_URL", value: "${SUPABASE_URL}" }
          { key: "SUPABASE_KEY", value: "${SUPABASE_KEY}" }
          { key: "DONE_IDS", value: "${doneIds}" }
        ]
        dockerArgs: "bash -c '${startupCmd.replace(/'/g, "'\\''")}'"
      }) {
        id
        name
        runtime { gpus { id } }
        desiredStatus
        imageName
        costPerHr
      }
    }
  `;

  return graphql(query);
}

async function main() {
  console.log(`Done IDs: ${partial.length}`);
  console.log(`Supabase URL: ${SUPABASE_URL.slice(0, 30)}...`);
  console.log(`Creating RunPod pod...`);

  const result = await createPod();

  if (result.errors) {
    console.error("Pod creation failed:", JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }

  const pod = result.data?.podFindAndDeployOnDemand;
  console.log(`Pod created: ${pod.id}`);
  console.log(`Cost: $${pod.costPerHr}/hr`);
  console.log(`\nThe pod will:`);
  console.log(`  1. Download adapter from Supabase Storage`);
  console.log(`  2. Load Qwen2.5-7B-Instruct + LoRA`);
  console.log(`  3. Run inference on ${198 - partial.length} remaining cases`);
  console.log(`  4. Upload results to Supabase Storage`);
  console.log(`\nMonitor at: https://www.runpod.io/console/pods`);
  console.log(`\nWhen done, run:`);
  console.log(`  node scripts/runpod_download_results.js`);
  console.log(`\nTo terminate pod:`);
  console.log(`  node -e "require('dotenv').config({path:'.env.local'}); fetch('https://api.runpod.io/graphql?api_key='+process.env.RUNPOD_API_KEY.replace(/[\\\"']/g,''), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:'mutation { podTerminate(input: {podId: \\"${pod.id}\\"}) }'})}).then(r=>r.json()).then(d=>console.log(d))"`);
}

main();
