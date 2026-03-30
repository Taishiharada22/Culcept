"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvCard,
  RvGlowCard,
  RvButton,
  RvBadge,
  RV_COLORS,
  RV_CATEGORY_COLORS,
  RV_CATEGORY_LABELS,
  type RvCategory,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// MissionListClient — 協同ミッション一覧 + 参加
// =============================================================================

type MissionTemplate = {
  type: string;
  title: string;
  description: string;
  icon: string;
  turnsRequired: number;
};

type ActiveMission = {
  id: string;
  type: string;
  state: string;
  category: string;
};

const CATEGORIES: RvCategory[] = ["romantic", "friendship", "cocreation", "community", "partner"];

export default function MissionListClient() {
  const router = useRouter();
  const [category, setCategory] = useState<RvCategory>("friendship");
  const [templates, setTemplates] = useState<MissionTemplate[]>([]);
  const [activeMissions, setActiveMissions] = useState<ActiveMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/rendezvous/mission/available?category=${category}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setTemplates(d.templates);
          setActiveMissions(d.activeMissions);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category]);

  const handleJoin = async (missionType: string) => {
    if (joining) return;
    setJoining(missionType);
    try {
      const res = await fetch("/api/rendezvous/mission/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, missionType }),
      });
      const data = await res.json();
      if (data.ok && data.missionId) {
        router.push(`/rendezvous/mission/${data.missionId}`);
      }
    } catch {
      // ignore
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-5 py-6 pb-28" style={{ background: RV_COLORS.base }}>
      <div className="mb-2">
        <h1 className="text-xl font-bold" style={{ color: RV_COLORS.text }}>
          協同ミッション
        </h1>
        <p className="text-xs mt-1" style={{ color: RV_COLORS.textSub }}>
          匿名の誰かと一緒に何かを作る。終わったあとに「続けたい？」
        </p>
      </div>

      {/* カテゴリ選択 */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className="rounded-full px-3 py-1 text-xs font-bold transition-all"
            style={{
              backgroundColor: category === cat ? `${RV_CATEGORY_COLORS[cat]}18` : RV_COLORS.surfaceMuted,
              color: category === cat ? RV_CATEGORY_COLORS[cat] : RV_COLORS.textMuted,
              border: `1px solid ${category === cat ? `${RV_CATEGORY_COLORS[cat]}40` : "transparent"}`,
            }}
          >
            {RV_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* アクティブミッション */}
      {activeMissions.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-bold mb-2" style={{ color: RV_COLORS.textSub }}>
            進行中のミッション
          </p>
          {activeMissions.map((m) => (
            <RvCard
              key={m.id}
              onClick={() => router.push(`/rendezvous/mission/${m.id}`)}
              accentBorder={`${RV_COLORS.accent}40`}
              className="mb-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold" style={{ color: RV_COLORS.text }}>
                    {m.type}
                  </p>
                  <RvBadge category={m.category as RvCategory} className="mt-1" />
                </div>
                <span className="text-xs" style={{ color: RV_COLORS.accent }}>
                  {m.state === "waiting" ? "相手を待機中" : "進行中"} →
                </span>
              </div>
            </RvCard>
          ))}
        </div>
      )}

      {/* ミッション一覧 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl animate-pulse"
              style={{ background: RV_COLORS.surfaceMuted }}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t, i) => (
            <motion.div
              key={t.type}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <RvCard elevated>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{t.icon}</span>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold mb-1" style={{ color: RV_COLORS.text }}>
                      {t.title}
                    </h3>
                    <p className="text-xs leading-relaxed mb-2" style={{ color: RV_COLORS.textSub }}>
                      {t.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: RV_COLORS.textMuted }}>
                        {t.turnsRequired}ターン
                      </span>
                      <RvButton
                        variant="secondary"
                        onClick={() => handleJoin(t.type)}
                        disabled={joining === t.type}
                        className="text-xs !px-3 !py-1.5"
                      >
                        {joining === t.type ? "参加中..." : "参加する"}
                      </RvButton>
                    </div>
                  </div>
                </div>
              </RvCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
