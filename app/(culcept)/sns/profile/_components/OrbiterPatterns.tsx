// app/sns/profile/_components/OrbiterPatterns.tsx
// Orbiter 横断パターン — 選択傾向・引力層・摩擦感度
"use client";

import { motion } from "framer-motion";

/* ────────────────────────────────────────────── types */

interface AttractionLayer {
  layer: string;
  topAxes: string[];
  pattern: string;
  sampleCount: number;
  confidence: number;
}

interface Era {
  type: string;
  label: string;
  startDate: string;
  decisionCount: number;
  characterization: string;
}

interface FrictionTrigger {
  cautionCode: string;
  sensitivity: number;
  outcome: string;
  sampleCount: number;
}

interface OrbiterPatternsProps {
  attractionLayers: AttractionLayer[];
  eras: Era[];
  currentEra: { type: string; label: string } | null;
  frictionTriggers: FrictionTrigger[];
  existentialEssence: string | null;
  existentialSections: { title: string; content: string }[];
}

/* ────────────────────────────────────────────── constants */

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

const GLASS =
  "rounded-[24px] border border-white/70 bg-white/72 shadow-lg shadow-black/8 backdrop-blur-xl p-5";

const LAYER_LABELS: Record<string, string> = {
  stated: "言葉の好み",
  instant: "瞬間の反応",
  sustained: "持続する引力",
  healthy: "健全な選択",
};

const ERA_ICONS: Record<string, string> = {
  exploration: "🔭",
  focus: "🎯",
  wandering: "🌊",
  deepening: "🔬",
  crystallization: "💎",
};

/* ────────────────────────────────────────────── helpers */

function sensitivityColor(v: number) {
  if (v > 0.7) return { bar: "bg-rose-400", text: "text-rose-600" };
  if (v >= 0.4) return { bar: "bg-amber-400", text: "text-amber-600" };
  return { bar: "bg-slate-400", text: "text-slate-500" };
}

function hasAnyData(props: OrbiterPatternsProps): boolean {
  return (
    !!props.existentialEssence ||
    props.existentialSections.length > 0 ||
    props.attractionLayers.length > 0 ||
    props.eras.length > 0 ||
    props.frictionTriggers.length > 0
  );
}

/* ────────────────────────────────────────────── sub-sections */

function EssenceSection({
  essence,
  sections,
}: {
  essence: string | null;
  sections: { title: string; content: string }[];
}) {
  if (!essence && sections.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      className={GLASS}
    >
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400">
        存在の要約
      </h3>

      {essence && (
        <p className="mb-4 text-center text-lg font-medium leading-relaxed text-slate-700">
          &ldquo;{essence}&rdquo;
        </p>
      )}

      {sections.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {sections.slice(0, 4).map((s) => (
            <div
              key={s.title}
              className="rounded-2xl border border-white/60 bg-white/50 p-3"
            >
              <p className="mb-1 text-[11px] font-semibold text-slate-500">
                {s.title}
              </p>
              <p className="text-xs leading-relaxed text-slate-600">
                {s.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function AttractionLayersSection({ layers }: { layers: AttractionLayer[] }) {
  if (layers.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1, ease: EASE_OUT_EXPO }}
      className={GLASS}
    >
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400">
        引力の構造
      </h3>

      <div className="flex flex-col gap-3">
        {layers.map((l) => {
          const label = LAYER_LABELS[l.layer] ?? l.layer;
          return (
            <div
              key={l.layer}
              className="rounded-2xl border border-white/60 bg-white/40 p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  {label}
                </span>
                <span className="text-[10px] text-slate-400">
                  n={l.sampleCount}
                </span>
              </div>

              {/* top axes badges */}
              <div className="mb-2 flex flex-wrap gap-1">
                {l.topAxes.map((ax) => (
                  <span
                    key={ax}
                    className="rounded-full border border-indigo-200/60 bg-indigo-50/70 px-2 py-0.5 text-[10px] font-medium text-indigo-600"
                  >
                    {ax}
                  </span>
                ))}
              </div>

              <p className="mb-2 text-xs leading-relaxed text-slate-500">
                {l.pattern}
              </p>

              {/* confidence bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className="h-full rounded-full bg-indigo-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(l.confidence * 100)}%` }}
                  transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
                />
              </div>
              <p className="mt-1 text-right text-[10px] text-slate-400">
                確信度 {Math.round(l.confidence * 100)}%
              </p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function EraTimelineSection({
  eras,
  currentEra,
}: {
  eras: Era[];
  currentEra: { type: string; label: string } | null;
}) {
  if (eras.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT_EXPO }}
      className={GLASS}
    >
      <h3 className="mb-4 text-xs font-semibold tracking-wider text-slate-400">
        選択の時代
      </h3>

      {/* horizontal scroll timeline */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-center gap-0" style={{ minWidth: "max-content" }}>
          {eras.map((era, i) => {
            const isCurrent =
              currentEra &&
              era.type === currentEra.type &&
              era.label === currentEra.label;
            const icon = ERA_ICONS[era.type] ?? "⭐";

            return (
              <div key={`${era.type}-${i}`} className="flex items-center">
                {/* dot + label */}
                <div className="flex flex-col items-center">
                  <motion.div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${
                      isCurrent
                        ? "bg-indigo-100 ring-2 ring-indigo-400 ring-offset-2 shadow-[0_0_12px_rgba(99,102,241,0.35)]"
                        : "bg-white/60 border border-slate-200"
                    }`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      duration: 0.4,
                      delay: 0.25 + i * 0.08,
                      ease: EASE_OUT_EXPO,
                    }}
                  >
                    {icon}
                  </motion.div>
                  <p
                    className={`mt-1.5 max-w-[80px] text-center text-[10px] leading-tight ${
                      isCurrent
                        ? "font-bold text-indigo-600"
                        : "font-medium text-slate-500"
                    }`}
                  >
                    {era.label}
                  </p>
                  <p className="text-[9px] text-slate-400">{era.startDate}</p>
                  <p className="text-[9px] text-slate-400">
                    {era.decisionCount}回の選択
                  </p>
                </div>

                {/* connector line */}
                {i < eras.length - 1 && (
                  <div className="mx-1 h-px w-8 bg-slate-200" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* current era characterization */}
      {currentEra && eras.length > 0 && (
        <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
          <p className="text-[11px] font-semibold text-indigo-500">
            現在の時代
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            {eras.find(
              (e) =>
                e.type === currentEra.type && e.label === currentEra.label
            )?.characterization ?? currentEra.label}
          </p>
        </div>
      )}
    </motion.div>
  );
}

function FrictionSection({ triggers }: { triggers: FrictionTrigger[] }) {
  if (triggers.length === 0) return null;

  const sorted = [...triggers]
    .sort((a, b) => b.sensitivity - a.sensitivity)
    .slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: EASE_OUT_EXPO }}
      className={GLASS}
    >
      <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-400">
        摩擦の感度マップ
      </h3>

      <div className="flex flex-col gap-2.5">
        {sorted.map((t) => {
          const pct = Math.round(t.sensitivity * 100);
          const col = sensitivityColor(t.sensitivity);

          return (
            <div key={t.cautionCode}>
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">
                  {t.cautionCode}
                </span>
                <span className={`text-[10px] font-semibold ${col.text}`}>
                  {pct}%
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className={`h-full rounded-full ${col.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
                />
              </div>

              <p className="mt-0.5 text-[10px] text-slate-400">
                {t.outcome}（n={t.sampleCount}）
              </p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────── main */

export default function OrbiterPatterns(props: OrbiterPatternsProps) {
  if (!hasAnyData(props)) return null;

  const allEmpty =
    !props.existentialEssence &&
    props.existentialSections.length === 0 &&
    props.attractionLayers.length === 0 &&
    props.eras.length === 0 &&
    props.frictionTriggers.length === 0;

  if (allEmpty) return null;

  const showEmpty =
    props.attractionLayers.length === 0 &&
    props.eras.length === 0 &&
    props.frictionTriggers.length === 0 &&
    !props.existentialEssence &&
    props.existentialSections.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {showEmpty ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
          className={GLASS}
        >
          <p className="text-center text-sm leading-relaxed text-slate-400">
            Orbiterでの観測を始めると、
            <br />
            あなたの選択パターンが見えてきます
          </p>
        </motion.div>
      ) : (
        <>
          <EssenceSection
            essence={props.existentialEssence}
            sections={props.existentialSections}
          />
          <AttractionLayersSection layers={props.attractionLayers} />
          <EraTimelineSection eras={props.eras} currentEra={props.currentEra} />
          <FrictionSection triggers={props.frictionTriggers} />
        </>
      )}
    </div>
  );
}
