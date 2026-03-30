import dotenv from "dotenv";
import {
  backfillOrbiterTeacherOutputs,
  getOrbiterShadowHealthSummary,
  listRecentOrbiterArtifactSampleChecks,
  runOrbiterShadowWarmup,
  runOrbiterArtifactSampleChecks,
} from "@/lib/orbiter/studentOps";

dotenv.config({ path: ".env.local" });

process.env.AI_EXPORT_ENABLED = "true";
process.env.AI_TRAINING_ARTIFACTS_ENABLED = "true";

async function main() {
  const lookbackHours = Number(process.env.ORBITER_HEALTH_LOOKBACK_HOURS ?? 168);
  const backfillLimit = Number(process.env.ORBITER_TEACHER_BACKFILL_LIMIT ?? 8);
  const warmupMaxActions = Number(process.env.ORBITER_SHADOW_WARMUP_MAX_ACTIONS ?? 1);
  const sampleSize = Number(process.env.ORBITER_ARTIFACT_SAMPLE_SIZE ?? 3);
  const limit = Number(process.env.ORBITER_ARTIFACT_EXPORT_LIMIT ?? 100);

  const backfill = await backfillOrbiterTeacherOutputs({
    lookbackHours,
    limit: backfillLimit,
  });
  const warmup = await runOrbiterShadowWarmup({
    lookbackHours,
    maxActions: warmupMaxActions,
  });
  const sampleChecks = await runOrbiterArtifactSampleChecks({
    lookbackHours,
    sampleSize,
    limit,
  });
  const [health, recentSampleChecks] = await Promise.all([
    getOrbiterShadowHealthSummary({
      lookbackHours,
    }),
    listRecentOrbiterArtifactSampleChecks({ limit: 4 }),
  ]);

  console.log(
    JSON.stringify(
      {
        backfill,
        warmup,
        health,
        sampleChecks,
        recentSampleChecks,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
