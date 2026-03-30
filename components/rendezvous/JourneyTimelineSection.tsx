"use client";

/**
 * JourneyTimelineSection
 * Self-fetching wrapper for JourneyTimeline.
 * Fetches score history from /api/rendezvous/[candidateId]/trajectory
 */

import { useState, useEffect } from "react";
import JourneyTimeline from "./JourneyTimeline";

type Props = {
  candidateId: string;
};

export default function JourneyTimelineSection({ candidateId }: Props) {
  const [points, setPoints] = useState<
    Array<{ date: string; score: number; milestone?: string }>
  >([]);

  useEffect(() => {
    fetch(`/api/rendezvous/${candidateId}/trajectory`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.history?.length > 0) {
          setPoints(
            data.history.map((h: { computed_at: string; score: number; milestone?: string }) => ({
              date: h.computed_at,
              score: h.score,
              milestone: h.milestone,
            })),
          );
        }
      })
      .catch(() => {});
  }, [candidateId]);

  if (points.length < 2) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          padding: 16,
          borderRadius: 14,
          background: "rgba(255,255,255,0.8)",
          border: "1px solid rgba(99,102,241,0.08)",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(30,30,60,0.5)",
            marginBottom: 8,
            margin: "0 0 8px",
          }}
        >
          関係性の軌跡
        </p>
        <JourneyTimeline points={points} />
      </div>
    </div>
  );
}
