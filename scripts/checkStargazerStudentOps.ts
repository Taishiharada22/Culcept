import "server-only";

import dotenv from "dotenv";
import {
  backfillStargazerTeacherOutputs,
  evaluateStargazerShadowPromotionCandidate,
  getStargazerShadowHealthSummary,
  getStargazerStudentProgressTrends,
  recordStargazerStudentMonitorSnapshot,
  runStargazerShadowWarmup,
  runStargazerArtifactSampleChecks,
} from "@/lib/stargazer/studentOps";

dotenv.config({ path: ".env.local" });

process.env.AI_EXPORT_ENABLED = process.env.AI_EXPORT_ENABLED || "true";
process.env.AI_TRAINING_ARTIFACTS_ENABLED =
  process.env.AI_TRAINING_ARTIFACTS_ENABLED || "true";

async function main() {
  const lookbackHours = Number(process.env.STARGAZER_STUDENT_OPS_LOOKBACK_HOURS ?? "168");
  const sampleSize = Number(process.env.STARGAZER_STUDENT_OPS_SAMPLE_SIZE ?? "3");
  const limit = Number(process.env.STARGAZER_STUDENT_OPS_LIMIT ?? "300");

  const teacherBackfill = await backfillStargazerTeacherOutputs({
    lookbackHours,
  });
  const warmup = await runStargazerShadowWarmup({
    lookbackHours,
  });
  const sampleChecks = await runStargazerArtifactSampleChecks({
    lookbackHours,
    sampleSize,
    limit,
  });
  const [shadowHealth, promotionReview] = await Promise.all([
    getStargazerShadowHealthSummary({ lookbackHours }),
    evaluateStargazerShadowPromotionCandidate({ lookbackHours }),
  ]);
  const snapshot = await recordStargazerStudentMonitorSnapshot({
    lookbackHours,
    shadowHealth,
    promotionReview,
  });
  const trends = await getStargazerStudentProgressTrends({
    lookbackDays: Math.max(7, Math.ceil(lookbackHours / 24)),
  });

  console.log(
    JSON.stringify(
      {
        teacherBackfill,
        warmup,
        shadowHealth,
        snapshot,
        trends,
        promotionReview: {
          eligible: promotionReview.eligible,
          reason: promotionReview.reason,
          candidate: promotionReview.candidate,
          rolloutPlan: promotionReview.rolloutPlan,
          failedChecks: promotionReview.checks.filter((check) => !check.passed),
        },
        sampleChecks,
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
