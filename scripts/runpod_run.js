/**
 * RunPod LoRA inference — Pod作成 → SSH → 実行 → 結果回収 → Pod停止
 *
 * Usage:
 *   node scripts/runpod_run.js
 *
 * 完全自動。Pod作成、ファイル転送、推論実行、結果回収、Pod停止まで一貫。
 */

require("dotenv").config({ path: ".env.local" });
const fs = require("fs");
const { execSync } = require("child_process");

const RUNPOD_KEY = (process.env.RUNPOD_API_KEY || "").replace(/['"]/g, "");
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/['"]/g, "");
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/['"]/g, "");

async function gql(query) {
  const res = await fetch(`https://api.runpod.io/graphql?api_key=${RUNPOD_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForPod(podId) {
  for (let i = 0; i < 120; i++) {
    const r = await gql(`{ pod(input: { podId: "${podId}" }) { id desiredStatus runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort type } } } }`);
    const pod = r.data?.pod;
    const sshPort = pod?.runtime?.ports?.find((p) => p.privatePort === 22);
    if (sshPort?.ip && sshPort?.publicPort) {
      return { ip: sshPort.ip, port: sshPort.publicPort };
    }
    process.stdout.write(".");
    await sleep(10000);
  }
  throw new Error("Pod failed to start within 20 minutes");
}

function ssh(ip, port, cmd) {
  const sshCmd = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${port} root@${ip} '${cmd}'`;
  return execSync(sshCmd, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, timeout: 600000 });
}

function scp(ip, port, localPath, remotePath) {
  const cmd = `scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P ${port} ${localPath} root@${ip}:${remotePath}`;
  return execSync(cmd, { encoding: "utf-8", timeout: 300000 });
}

function scpFrom(ip, port, remotePath, localPath) {
  const cmd = `scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P ${port} root@${ip}:${remotePath} ${localPath}`;
  return execSync(cmd, { encoding: "utf-8", timeout: 300000 });
}

async function main() {
  // Already-done case IDs
  const partial = JSON.parse(fs.readFileSync("exports/modal-inference-alter-voice-v1-partial.json", "utf-8"));
  console.log(`Already completed: ${partial.length}/198 cases`);
  console.log(`Remaining: ${198 - partial.length} cases`);

  // Step 1: Create pod
  console.log("\n=== Step 1: Creating RunPod GPU Pod ===");
  const createResult = await gql(`
    mutation {
      podFindAndDeployOnDemand(input: {
        name: "aneurasync-lora-eval"
        imageName: "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04"
        gpuTypeId: "NVIDIA RTX A6000"
        cloudType: SECURE
        gpuCount: 1
        volumeInGb: 50
        containerDiskInGb: 30
        startSsh: true
      }) {
        id costPerHr desiredStatus
      }
    }
  `);

  if (createResult.errors) {
    console.error("Pod creation failed:", JSON.stringify(createResult.errors, null, 2));
    process.exit(1);
  }

  const podId = createResult.data.podFindAndDeployOnDemand.id;
  const costPerHr = createResult.data.podFindAndDeployOnDemand.costPerHr;
  console.log(`Pod ${podId} created ($${costPerHr}/hr)`);

  // Step 2: Wait for SSH access
  console.log("\n=== Step 2: Waiting for SSH access ===");
  const { ip, port } = await waitForPod(podId);
  console.log(`\nSSH ready: ${ip}:${port}`);

  try {
    // Step 3: Upload inference script and adapter
    console.log("\n=== Step 3: Uploading files ===");

    // Upload inference script
    scp(ip, port, "scripts/runpod_inference.py", "/workspace/inference.py");
    console.log("  Uploaded inference.py");

    // Upload adapter (154MB) - direct SCP is simplest
    ssh(ip, port, "mkdir -p /workspace/adapter");
    const adapterDir = "exports/adapter-alter-voice-v1/alter-voice-v1";
    const adapterFiles = fs.readdirSync(adapterDir).filter((f) => !f.startsWith("adapter_chunk_"));
    for (const f of adapterFiles) {
      scp(ip, port, `${adapterDir}/${f}`, `/workspace/adapter/${f}`);
      const size = fs.statSync(`${adapterDir}/${f}`).size;
      console.log(`  Uploaded ${f} (${(size / 1024 / 1024).toFixed(1)}MB)`);
    }

    // Step 4: Install deps and run inference
    console.log("\n=== Step 4: Installing dependencies ===");
    const installOut = ssh(ip, port, "pip install transformers peft accelerate bitsandbytes -q 2>&1 | tail -3");
    console.log(installOut);

    // Prepare env and done IDs
    const doneIds = partial.map((r) => r.id).join(",");
    const envVars = [
      `SUPABASE_URL='${SUPABASE_URL}'`,
      `SUPABASE_KEY='${SUPABASE_KEY}'`,
      `DONE_IDS='${doneIds}'`,
    ].join(" ");

    console.log("\n=== Step 5: Running inference ===");
    console.log("This will take ~15-20 minutes...\n");

    // Run inference (this will take a while)
    const inferenceOut = ssh(ip, port, `cd /workspace && ${envVars} python inference.py 2>&1`);
    console.log(inferenceOut);

    // Step 5: Download results
    console.log("\n=== Step 6: Downloading results ===");
    scpFrom(ip, port, "/workspace/results.json", "exports/runpod-inference-alter-voice-v1.json");
    console.log("Results downloaded to exports/runpod-inference-alter-voice-v1.json");

  } finally {
    // Step 6: Stop pod (always, even on error)
    console.log("\n=== Step 7: Stopping pod ===");
    await gql(`mutation { podStop(input: { podId: "${podId}" }) { id desiredStatus } }`);
    console.log(`Pod ${podId} stopped.`);
    console.log("To terminate (free up resources):");
    console.log(`  node -e "require('dotenv').config({path:'.env.local'});fetch('https://api.runpod.io/graphql?api_key='+process.env.RUNPOD_API_KEY.replace(/[\\\"']/g,''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'mutation{podTerminate(input:{podId:\\"${podId}\\"})}'})}).then(r=>r.json()).then(d=>console.log(d))"`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
