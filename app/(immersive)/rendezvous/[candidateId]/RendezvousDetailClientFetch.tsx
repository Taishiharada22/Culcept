"use client";

/**
 * RendezvousDetailClientFetch
 * Fallback client component that fetches candidate detail when server-side fetch fails.
 */

import { useState, useEffect } from "react";
import type { RendezvousDetailDTO } from "@/lib/rendezvous/types";
import RendezvousDetailClient from "./RendezvousDetailClient";

const C = {
  sync: "#4AEAFF",
  t3: "rgba(255,255,255,0.32)",
};

type Props = {
  candidateId: string;
};

export default function RendezvousDetailClientFetch({ candidateId }: Props) {
  const [detail, setDetail] = useState<RendezvousDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/rendezvous/${candidateId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const d = data?.detail ?? data ?? null;
        if (d) {
          setDetail(d);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [candidateId]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#060510",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: C.sync,
              opacity: 0.5,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontSize: 11,
              color: C.t3,
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
            }}
          >
            {"\u8AAD\u307F\u8FBC\u307F\u4E2D..."}
          </span>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.3); }
          }
        `}</style>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#060510",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 20,
        }}
      >
        <svg width={48} height={48} viewBox="0 0 48 48" fill="none">
          <circle
            cx={24}
            cy={24}
            r={18}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <circle cx={24} cy={24} r={3} fill="rgba(255,255,255,0.16)" />
        </svg>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "rgba(255,255,255,0.58)",
          }}
        >
          {"\u30C7\u30FC\u30BF\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F"}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.32)",
          }}
        >
          {"\u6642\u9593\u3092\u304A\u3044\u3066\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044"}
        </span>
      </div>
    );
  }

  return <RendezvousDetailClient detail={detail} />;
}
