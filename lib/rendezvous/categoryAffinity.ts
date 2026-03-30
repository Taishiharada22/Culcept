import type { MatchingVector, RendezvousCategory } from "./types";
import { similarityScore, mixedFitScore } from "./similarityScore";

export function computeCategoryAffinity(params: {
  category: RendezvousCategory;
  selfVector: MatchingVector;
  otherVector: MatchingVector;
}): number {
  const { category, selfVector, otherVector } = params;

  switch (category) {
    case "romantic":
      return (
        similarityScore(selfVector.distance_need, otherVector.distance_need) *
          0.4 +
        similarityScore(selfVector.depth_speed, otherVector.depth_speed) *
          0.3 +
        similarityScore(
          selfVector.emotional_openness,
          otherVector.emotional_openness,
        ) *
          0.3
      );

    case "friendship":
      return (
        similarityScore(
          selfVector.conversation_temperature,
          otherVector.conversation_temperature,
        ) *
          0.5 +
        similarityScore(
          selfVector.social_energy,
          otherVector.social_energy,
        ) *
          0.5
      );

    case "cocreation":
      return (
        mixedFitScore(selfVector.initiative, otherVector.initiative, 0.6) *
          0.4 +
        similarityScore(
          selfVector.conflict_directness,
          otherVector.conflict_directness,
        ) *
          0.3 +
        mixedFitScore(
          selfVector.structure_preference,
          otherVector.structure_preference,
          0.4,
        ) *
          0.3
      );

    case "community":
      return (
        similarityScore(
          selfVector.social_energy,
          otherVector.social_energy,
        ) *
          0.4 +
        similarityScore(
          selfVector.structure_preference,
          otherVector.structure_preference,
        ) *
          0.3 +
        similarityScore(
          selfVector.emotional_openness,
          otherVector.emotional_openness,
        ) *
          0.3
      );

    /**
     * パートナー親和性: 「一緒に暮らせるか」を測る
     * romanticが「惹かれるか」なら、partnerは「生活を共にできるか」
     */
    case "partner":
      return (
        similarityScore(
          selfVector.stability_need,
          otherVector.stability_need,
        ) *
          0.25 +
        similarityScore(
          selfVector.distance_need,
          otherVector.distance_need,
        ) *
          0.20 +
        similarityScore(
          selfVector.conflict_directness,
          otherVector.conflict_directness,
        ) *
          0.20 +
        similarityScore(
          selfVector.structure_preference,
          otherVector.structure_preference,
        ) *
          0.20 +
        similarityScore(
          selfVector.emotional_openness,
          otherVector.emotional_openness,
        ) *
          0.15
      );
  }
}
