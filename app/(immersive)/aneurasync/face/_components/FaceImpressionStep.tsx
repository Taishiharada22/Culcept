"use client";

import ImpressionStep from "./ImpressionStep";
import { FACE_IMPRESSION_AXES } from "@/lib/face/impressionAxes";
import type { FaceImpressionScores } from "@/types/face-phenotype";

interface Props {
  userImage: string;
  existing?: FaceImpressionScores;
  onComplete: (scores: FaceImpressionScores) => void;
}

export default function FaceImpressionStep({
  userImage,
  existing,
  onComplete,
}: Props) {
  return (
    <ImpressionStep
      title="顔全体"
      icon="✨"
      axes={FACE_IMPRESSION_AXES}
      userImage={userImage}
      existing={existing as Record<string, number> | undefined}
      onComplete={(scores) =>
        onComplete({
          warm_cool: scores.warm_cool ?? 0,
          soft_sharp: scores.soft_sharp ?? 0,
          mature_youthful: scores.mature_youthful ?? 0,
          cute_cool: scores.cute_cool ?? 0,
          friendly_mysterious: scores.friendly_mysterious ?? 0,
        })
      }
    />
  );
}
