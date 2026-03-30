"use client";

/**
 * Connection Universe Page
 * 接続の全体像をCanvas力学グラフで可視化
 * 「マッチ数」の不安が「成長する星座」の豊かさに置き換わる
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import ConnectionUniverse, {
  type ConnectionNode,
} from "@/components/rendezvous/ConnectionUniverse";
import UniverseNodeOverlay from "@/components/rendezvous/UniverseNodeOverlay";

export default function UniversePage() {
  const router = useRouter();
  const [connections, setConnections] = useState<ConnectionNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<ConnectionNode | null>(null);

  useEffect(() => {
    fetch("/api/rendezvous/universe")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          // Map API response to ConnectionNode shape
          const nodes: ConnectionNode[] = (res.connections ?? []).map(
            (c: any) => ({
              id: c.id,
              name: c.displayName ?? c.name ?? "Unknown",
              avatarUrl: c.avatarUrl ?? null,
              category: c.category,
              state: c.state,
              syncPercent: c.syncPercent ?? 50,
              messageCount: c.messageCount ?? 0,
              isActive:
                c.isActive ??
                (c.state === "mutual_liked" || c.state === "chat_opened"),
            }),
          );
          setConnections(nodes);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleNodeTap = useCallback(
    (id: string) => {
      const node = connections.find((c) => c.id === id);
      if (node) setSelectedNode(node);
    },
    [connections],
  );

  const handleNavigate = useCallback(
    (candidateId: string) => {
      setSelectedNode(null);
      router.push(`/rendezvous/${candidateId}`);
    },
    [router],
  );

  const activeCount = connections.filter(
    (c) => c.state === "mutual_liked" || c.state === "chat_opened",
  ).length;

  const avgSync =
    connections.length > 0
      ? Math.round(
          connections.reduce((s, c) => s + c.syncPercent, 0) /
            connections.length,
        )
      : 0;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(180deg, #F8F9FE, #F0F1F8)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#1E1E3C",
              margin: 0,
            }}
          >
            Connection Universe
          </h1>
          <p
            style={{
              fontSize: 11,
              color: "rgba(30,30,60,0.4)",
              margin: "2px 0 0",
            }}
          >
            あなたの接続の星座
          </p>
        </div>
        <Link
          href="/rendezvous"
          style={{
            fontSize: 11,
            color: "#6366F1",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          リストへ
        </Link>
      </div>

      {/* Stats bar */}
      {!loading && connections.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "0 20px 12px",
          }}
        >
          {[
            { label: "合計", value: connections.length },
            { label: "アクティブ", value: activeCount },
            { label: "平均SYNC", value: `${avgSync}%` },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.7)",
                backdropFilter: "blur(8px)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#1E1E3C",
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "rgba(30,30,60,0.4)",
                  marginTop: 1,
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Universe Canvas */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 12, color: "rgba(30,30,60,0.3)" }}>
            観測中...
          </p>
        </div>
      ) : connections.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>&#x2728;</p>
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "rgba(30,30,60,0.5)",
            }}
          >
            まだ接続がありません
          </p>
          <p
            style={{
              fontSize: 11,
              color: "rgba(30,30,60,0.35)",
              marginTop: 4,
            }}
          >
            Rendezvousで新しい軌道を見つけましょう
          </p>
        </div>
      ) : (
        <div style={{ padding: "0 8px" }}>
          <ConnectionUniverse
            connections={connections}
            onNodeTap={handleNodeTap}
          />
        </div>
      )}

      {/* Legend */}
      {connections.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "12px 20px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {[
            { color: "#EC4899", label: "恋愛" },
            { color: "#6366F1", label: "友人" },
            { color: "#F59E0B", label: "共創" },
            { color: "#8B5CF6", label: "繋がり" },
          ].map(({ color, label }) => (
            <div
              key={label}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                }}
              />
              <span style={{ fontSize: 10, color: "rgba(30,30,60,0.45)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Node overlay */}
      <AnimatePresence>
        {selectedNode && (
          <UniverseNodeOverlay
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onNavigate={handleNavigate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
