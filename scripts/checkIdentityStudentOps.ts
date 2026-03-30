import dotenv from "dotenv";
import {
  backfillIdentityTeacherOutputs,
  backfillIdentityShadowEvaluations,
  evaluateIdentityShadowPromotionCandidate,
  inspectIdentityRolloutState,
  listRecentIdentityArtifactSampleChecks,
  runIdentityArtifactSampleChecks,
  runIdentityShadowWarmup,
} from "@/lib/identity/studentOps";

dotenv.config({ path: ".env.local" });

process.env.AI_EXPORT_ENABLED = "true";
process.env.AI_TRAINING_ARTIFACTS_ENABLED = "true";

async function main() {
  const lookbackHours = Number(process.env.IDENTITY_HEALTH_LOOKBACK_HOURS ?? 168);
  const backfillLimit = Number(process.env.IDENTITY_TEACHER_BACKFILL_LIMIT ?? 8);
  const warmupMaxActions = Number(process.env.IDENTITY_SHADOW_WARMUP_MAX_ACTIONS ?? 3);
  const sampleSize = Number(process.env.IDENTITY_ARTIFACT_SAMPLE_SIZE ?? 3);
  const limit = Number(process.env.IDENTITY_ARTIFACT_EXPORT_LIMIT ?? 100);

  const backfill = await backfillIdentityTeacherOutputs({
    lookbackHours,
    limit: backfillLimit,
  });
  const warmup = await runIdentityShadowWarmup({
    lookbackHours,
    maxActions: warmupMaxActions,
  });
  const evalBackfill = await backfillIdentityShadowEvaluations({
    lookbackHours,
  });
  const sampleChecks = await runIdentityArtifactSampleChecks({
    lookbackHours,
    sampleSize,
    limit,
  });
  const [promotionReview, recentSampleChecks, rolloutState] = await Promise.all([
    evaluateIdentityShadowPromotionCandidate({
      lookbackHours,
    }),
    listRecentIdentityArtifactSampleChecks({ limit: 4 }),
    inspectIdentityRolloutState({
      lookbackHours,
    }),
  ]);
  const health = promotionReview.health;

  console.log(
    JSON.stringify(
      {
        backfill,
        warmup,
        evalBackfill,
        health,
        rolloutState,
        promotionReview,
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
