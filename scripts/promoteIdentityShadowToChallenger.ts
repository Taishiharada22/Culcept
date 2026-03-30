import dotenv from "dotenv";
import {
  evaluateIdentityShadowPromotionCandidate,
  promoteIdentityShadowToChallenger,
} from "@/lib/identity/studentOps";

dotenv.config({ path: ".env.local" });

async function main() {
  const lookbackHours = Number(process.env.IDENTITY_HEALTH_LOOKBACK_HOURS ?? 168);
  const trafficWeight = Number(process.env.IDENTITY_CHALLENGER_TRAFFIC_WEIGHT ?? 5);

  const review = await evaluateIdentityShadowPromotionCandidate({
    lookbackHours,
  });

  if (!review.eligible) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "candidate_not_eligible",
          review,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const mutation = await promoteIdentityShadowToChallenger({
    modelKey: review.candidate.modelKey,
    modelVersion: review.candidate.modelVersion,
    trafficWeight,
    notes: "promoted via scripts/promoteIdentityShadowToChallenger.ts",
  });

  if (!mutation.ok) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "promotion_mutation_failed",
          review,
          mutation,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        review,
        mutation,
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
