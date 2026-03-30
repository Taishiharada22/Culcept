// app/sns/profile/_components/RelationalPrism.tsx
// 関係プリズム — データ駆動の関係性ナラティブ + 静的フォールバック
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RelationshipCategoryView } from "@/lib/stargazer/relationshipNarratives";

/* ────────────────────────────────────────────── static fallback */

interface RelationType {
  icon: string;
  key: string;
  nameJa: string;
  nameEn: string;
  description: string;
  gradient: string;
}

const RELATION_TYPES: RelationType[] = [
  { icon: "🪞", key: "mirror", nameJa: "鏡", nameEn: "mirror", description: "深い理解、同じ盲点", gradient: "from-sky-50 to-blue-50" },
  { icon: "🌑", key: "shadow", nameJa: "影", nameEn: "shadow", description: "同じ恐れ、違う対処", gradient: "from-slate-50 to-gray-100" },
  { icon: "🧩", key: "complement", nameJa: "補完", nameEn: "complement", description: "同じ手段、違う目的", gradient: "from-emerald-50 to-teal-50" },
  { icon: "🎓", key: "teacher", nameJa: "師匠", nameEn: "teacher", description: "同じ言語、違う深度", gradient: "from-amber-50 to-yellow-50" },
  { icon: "🗡️", key: "rhythm_gap", nameJa: "リズムのずれ", nameEn: "rhythm gap", description: "普段は合う、ストレス下で壊れる", gradient: "from-orange-50 to-red-50" },
  { icon: "🔤", key: "language_gap", nameJa: "言語のずれ", nameEn: "language gap", description: "同じ恐れ、説明できないズレ", gradient: "from-purple-50 to-fuchsia-50" },
  { icon: "⚔️", key: "comrade", nameJa: "戦友", nameEn: "comrade", description: "危機で信頼、同じストレス応答", gradient: "from-rose-50 to-pink-50" },
  { icon: "👽", key: "alien", nameJa: "異星人", nameEn: "alien", description: "全て違う、最大の成長", gradient: "from-violet-50 to-indigo-50" },
];

const CARD =
  "relative overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-lg shadow-black/8 backdrop-blur-xl";

const CATEGORY_GRADIENT: Record<string, string> = {
  family: "from-amber-50 to-orange-50",
  friend: "from-sky-50 to-blue-50",
  romantic: "from-rose-50 to-pink-50",
  spouse: "from-violet-50 to-fuchsia-50",
  colleague: "from-slate-50 to-gray-50",
  stranger: "from-emerald-50 to-teal-50",
  close: "from-indigo-50 to-violet-50",
  distant: "from-gray-50 to-slate-100",
};

/* ────────────────────────────────────────────── Mini Radar */

function MiniRadar({ dimensions }: { dimensions: { label: string; score: number }[] }) {
  const size = 120;
  const center = size / 2;
  const radius = 40;
  const count = dimensions.length;
  if (count < 3) return null;
  const angleStep = (Math.PI * 2) / count;

  const pointAt = (i: number, value: number) => {
    const angle = i * angleStep - Math.PI / 2;
    const r = (value / 100) * radius;
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
  };

  const polygon = dimensions.map((d, i) => {
    const p = pointAt(i, d.score);
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-[100px] w-[100px] flex-shrink-0">
      {/* Grid */}
      {[33, 66, 100].map((level) => (
        <polygon
          key={level}
          points={dimensions.map((_, i) => {
            const p = pointAt(i, level);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="0.5"
        />
      ))}
      {/* Data polygon */}
      <polygon
        points={polygon}
        fill="rgba(139,92,246,0.15)"
        stroke="rgba(139,92,246,0.6)"
        strokeWidth="1.5"
      />
      {/* Labels */}
      {dimensions.map((d, i) => {
        const p = pointAt(i, 130);
        return (
          <text
            key={d.label}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            fontSize="6"
            fontWeight="600"
            fill="#64748b"
          >
            {d.label.slice(0, 3)}
          </text>
        );
      })}
    </svg>
  );
}

/* ────────────────────────────────────────────── Expandable Category Card */

function CategoryCard({
  view,
  index,
}: {
  view: RelationshipCategoryView;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const gradient = CATEGORY_GRADIENT[view.category] ?? "from-white to-slate-50";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.45 }}
      className={`${CARD} p-4 bg-gradient-to-br ${gradient} cursor-pointer`}
      onClick={() => setExpanded((p) => !p)}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{view.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-slate-700">{view.label}</div>
            <motion.span
              animate={{ rotate: expanded ? 90 : 0 }}
              className="text-xs text-slate-400"
            >
              ▸
            </motion.span>
          </div>
          <p className="text-[12px] text-slate-500 leading-relaxed mt-1 line-clamp-2">
            {view.summary}
          </p>
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/50 space-y-4">
              {/* Radar + impressions */}
              <div className="flex items-start gap-4">
                <MiniRadar
                  dimensions={view.radar.map((r) => ({
                    label: r.label,
                    score: r.score,
                  }))}
                />
                <div className="flex-1 space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    第一印象 Top 3
                  </div>
                  {view.impressionTop3.map((imp, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-slate-600 leading-relaxed"
                    >
                      {imp}
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail panels */}
              <div className="grid gap-2">
                {[
                  { label: "居心地", text: view.comfort, color: "bg-emerald-50 border-emerald-200/60" },
                  { label: "誤解されやすい点", text: view.misunderstanding, color: "bg-amber-50 border-amber-200/60" },
                  { label: "場面", text: view.scene, color: "bg-sky-50 border-sky-200/60" },
                  { label: "話し方", text: view.speechPattern, color: "bg-violet-50 border-violet-200/60" },
                ].map((panel) =>
                  panel.text ? (
                    <div
                      key={panel.label}
                      className={`rounded-xl border p-3 ${panel.color}`}
                    >
                      <div className="text-[10px] font-bold text-slate-500 mb-1">
                        {panel.label}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {panel.text}
                      </p>
                    </div>
                  ) : null
                )}
              </div>

              {/* Misunderstanding reduction */}
              {view.misunderstandingReduction && (
                <div className="rounded-xl border border-violet-200/60 bg-gradient-to-br from-violet-50/60 to-fuchsia-50/60 p-3">
                  <div className="text-[10px] font-bold text-violet-500 mb-1">
                    誤解を減らす一手
                  </div>
                  <p className="text-[11px] text-slate-700 leading-relaxed font-medium">
                    {view.misunderstandingReduction}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ────────────────────────────────────────────── main */

export default function RelationalPrism({
  data,
}: {
  data?: RelationshipCategoryView[] | null;
}) {
  // データ駆動モード
  if (data && data.length > 0) {
    return (
      <section className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="bg-gradient-to-r from-violet-700 via-fuchsia-600 to-pink-500 bg-clip-text text-[22px] font-black tracking-[-0.02em] text-transparent">
            関係プリズム
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            8つの場面で現れる、あなたの関係のかたち
          </p>
        </motion.div>

        <div className="space-y-3">
          {data.map((view, i) => (
            <CategoryCard key={view.category} view={view} index={i} />
          ))}
        </div>
      </section>
    );
  }

  // 静的フォールバック
  return (
    <section className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="text-lg font-bold text-slate-800">関係プリズム</h2>
        <p className="text-xs text-slate-500">
          あなたと他者の関係の8類型
        </p>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RELATION_TYPES.map((rt, i) => (
          <motion.div
            key={rt.key}
            className={`${CARD} p-4 bg-gradient-to-br ${rt.gradient}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.45 }}
            whileHover={{ y: -3, scale: 1.02 }}
          >
            <div className="text-2xl mb-2">{rt.icon}</div>
            <div className="text-sm font-bold text-slate-700 mb-0.5">
              {rt.nameJa}
            </div>
            <div className="text-[10px] text-slate-400 mb-2">{rt.nameEn}</div>
            <p className="text-[11px] text-slate-500 leading-snug">
              {rt.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
