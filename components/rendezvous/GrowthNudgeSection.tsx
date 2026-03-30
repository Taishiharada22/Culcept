"use client";

/**
 * GrowthNudgeSection
 * Self-fetching wrapper for GrowthNudge.
 * Fetches nudge from /api/rendezvous/[candidateId]/nudge
 */

import { useState, useEffect } from "react";
import GrowthNudge from "./GrowthNudge";

type Props = {
  candidateId: string;
};

export default function GrowthNudgeSection({ candidateId }: Props) {
  const [nudge, setNudge] = useState<{
    nudgeText: string;
    nudgeType: string;
    nudgeId: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`/api/rendezvous/${candidateId}/nudge`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.nudge) {
          setNudge({
            nudgeText: data.nudge.nudge_text ?? data.nudge.nudgeText ?? "",
            nudgeType: data.nudge.nudge_type ?? data.nudge.nudgeType ?? "general",
            nudgeId: data.nudge.id ?? "",
          });
        }
      })
      .catch(() => {});
  }, [candidateId]);

  if (!nudge || dismissed) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <GrowthNudge
        nudgeText={nudge.nudgeText}
        nudgeType={nudge.nudgeType}
        candidateId={candidateId}
        onFeedback={async (feedback) => {
          try {
            await fetch(`/api/rendezvous/${candidateId}/nudge`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nudgeId: nudge.nudgeId,
                feedback,
              }),
            });
          } catch {
            // ignore
          }
          setDismissed(true);
        }}
      />
    </div>
  );
}
