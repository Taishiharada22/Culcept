"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { FriendReport, TraitComparison, FrictionPoint } from "@/lib/genome/friendCompatibility";

/* ── カラーパレット ── */
const C = {
  s1: "#ffffff", s2: "#f5f6fa",
  t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc",
  neural: "#8B5CF6", pulse: "#EC4899",
  green: "#10B981", amber: "#F59E0B", red: "#EF4444",
};

/* ── スコアに応じた色 ── */
function scoreColor(score: number): string {
  if (score >= 75) return C.green;
  if (score >= 50) return C.neural;
  if (score >= 35) return C.amber;
  return C.pulse;
}

/* ══════════════════════════════════════════════
   4軸レーダーチャート（友達比較用）
   ══════════════════════════════════════════════ */
function CompareRadar4({
  mine,
  theirs,
  myName,
  theirName,
}: {
  mine: { personality: number; vibe: number; style: number; values: number };
  theirs: { personality: number; vibe: number; style: number; values: number };
  myName?: string;
  theirName?: string;
}) {
  const cx = 70, cy = 70, r = 50;
  const axes = [
    { key: "personality" as const, label: "性格", angle: -Math.PI / 2 },
    { key: "vibe" as const, label: "雰囲気", angle: 0 },
    { key: "style" as const, label: "スタイル", angle: Math.PI / 2 },
    { key: "values" as const, label: "価値観", angle: Math.PI },
  ];

  const toPoints = (data: typeof mine) =>
    axes.map(({ key, angle }) => {
      const v = (data[key] / 100) * r;
      return `${cx + v * Math.cos(angle)},${cy + v * Math.sin(angle)}`;
    }).join(" ");

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 140 140" className="w-full max-w-[220px] mx-auto">
        {/* Grid */}
        {[0.33, 0.66, 1.0].map((level) => (
          <polygon key={level}
            points={axes.map(({ angle }) => `${cx + r * level * Math.cos(angle)},${cy + r * level * Math.sin(angle)}`).join(" ")}
            fill="none" stroke={`${C.t4}40`} strokeWidth="0.3" />
        ))}
        {axes.map(({ key, angle }) => (
          <line key={key} x1={cx} y1={cy}
            x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)}
            stroke={`${C.t4}30`} strokeWidth="0.3" />
        ))}
        {/* 自分 */}
        <polygon points={toPoints(mine)} fill={`${C.neural}15`} stroke={C.neural} strokeWidth="1.2" strokeOpacity="0.6" />
        {/* 相手 */}
        <polygon points={toPoints(theirs)} fill={`${C.pulse}15`} stroke={C.pulse} strokeWidth="1.2" strokeOpacity="0.6" />
        {/* ラベル */}
        {axes.map(({ key, label, angle }) => {
          const lx = cx + (r + 15) * Math.cos(angle);
          const ly = cy + (r + 15) * Math.sin(angle);
          return <text key={key} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            fill={C.t3} fontSize="7">{label}</text>;
        })}
      </svg>
      {/* 凡例 */}
      <div className="flex justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full" style={{ background: C.neural }} />
          <span style={{ fontSize: 11, color: C.t3 }}>{myName ?? "あなた"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full" style={{ background: C.pulse }} />
          <span style={{ fontSize: 11, color: C.t3 }}>{theirName ?? "相手"}</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   スコアリング ── 大きな数字表示
   ══════════════════════════════════════════════ */
function OverallScoreDisplay({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <motion.div
      className="text-center py-6"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <p style={{ fontSize: 10, color: C.t4, letterSpacing: "0.12em", marginBottom: 8 }}>
        COMPATIBILITY SCORE
      </p>
      <p style={{
        fontSize: 56, fontWeight: 800, letterSpacing: "-0.02em",
        background: `linear-gradient(135deg, ${color}, ${C.pulse})`,
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>
        {score}
      </p>
      <p style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>
        {score >= 75 ? "最高の相性！" : score >= 55 ? "とても良い相性" : score >= 40 ? "補い合える関係" : "刺激的な関係"}
      </p>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════
   カテゴリスコアカード
   ══════════════════════════════════════════════ */
function CategoryCard({
  label,
  icon,
  score,
  detail,
  delay,
}: {
  label: string;
  icon: string;
  score: number;
  detail: string;
  delay: number;
}) {
  const color = scoreColor(score);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-4"
      style={{ background: C.s1, border: `1px solid ${C.s2}`, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{label}</span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color }}>{score}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: `${C.t4}25`, overflow: "hidden", marginBottom: 8 }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, delay: delay + 0.2, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 2, background: color, opacity: 0.7 }}
        />
      </div>
      <p style={{ fontSize: 12, color: C.t3, lineHeight: 1.5 }}>{detail}</p>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════
   特性比較バー
   ══════════════════════════════════════════════ */
function TraitComparisonBar({ comparison, delay }: { comparison: TraitComparison; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="rounded-xl p-4"
      style={{ background: C.s1, border: `1px solid ${C.s2}` }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: C.t1, marginBottom: 8 }}>{comparison.axisLabel}</p>
      <div className="space-y-2">
        {/* 自分のバー */}
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, color: C.neural, width: 40, flexShrink: 0 }}>あなた</span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: `${C.t4}20`, overflow: "hidden" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${comparison.myScore}%` }}
              transition={{ duration: 0.6, delay: delay + 0.1 }}
              style={{ height: "100%", borderRadius: 3, background: C.neural, opacity: 0.6 }}
            />
          </div>
          <span style={{ fontSize: 10, color: C.t3, width: 24, textAlign: "right", fontFamily: "monospace" }}>
            {comparison.myScore}
          </span>
        </div>
        {/* 相手のバー */}
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, color: C.pulse, width: 40, flexShrink: 0 }}>相手</span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: `${C.t4}20`, overflow: "hidden" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${comparison.friendScore}%` }}
              transition={{ duration: 0.6, delay: delay + 0.2 }}
              style={{ height: "100%", borderRadius: 3, background: C.pulse, opacity: 0.6 }}
            />
          </div>
          <span style={{ fontSize: 10, color: C.t3, width: 24, textAlign: "right", fontFamily: "monospace" }}>
            {comparison.friendScore}
          </span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.5 }}>{comparison.insight}</p>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════
   摩擦ポイントカード
   ══════════════════════════════════════════════ */
function FrictionCard({ point, delay }: { point: FrictionPoint; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-4"
      style={{ background: `${C.amber}06`, border: `1px solid ${C.amber}20` }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: C.amber, marginBottom: 8 }}>
        {point.situation}
      </p>
      <div className="space-y-2 mb-3">
        <div className="flex items-start gap-2">
          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: C.neural }} />
          <p style={{ fontSize: 11, color: C.t2 }}>{point.myReaction}</p>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: C.pulse }} />
          <p style={{ fontSize: 11, color: C.t2 }}>{point.friendReaction}</p>
        </div>
      </div>
      <div className="rounded-lg px-3 py-2" style={{ background: `${C.amber}08` }}>
        <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>アドバイス:</span> {point.advice}
        </p>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════
   メインコンポーネント
   ══════════════════════════════════════════════ */

interface Props {
  report: FriendReport;
  myName?: string;
  friendName?: string;
  onShareClick?: () => void;
}

export default function FriendCompatibilityReport({ report, myName, friendName, onShareClick }: Props) {
  const radarMine = useMemo(() => ({
    personality: report.categories.personality.score,
    vibe: report.categories.vibe.score,
    style: report.categories.style.score,
    values: report.categories.values.score,
  }), [report.categories]);

  // 友達はoverall基準で中央に寄せる
  const radarTheirs = useMemo(() => ({
    personality: Math.round(report.categories.personality.score * 0.7 + 15),
    vibe: Math.round(report.categories.vibe.score * 0.7 + 15),
    style: Math.round(report.categories.style.score * 0.7 + 15),
    values: Math.round(report.categories.values.score * 0.7 + 15),
  }), [report.categories]);

  return (
    <div className="space-y-6 pb-8">
      {/* 全体スコア */}
      <div className="rounded-2xl overflow-hidden" style={{ background: C.s1, border: `1px solid ${C.s2}`, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <OverallScoreDisplay score={report.overallScore} />
      </div>

      {/* レーダーチャート */}
      <div className="rounded-2xl p-6" style={{ background: C.s1, border: `1px solid ${C.s2}` }}>
        <p style={{ fontSize: 10, color: C.t4, letterSpacing: "0.1em", textAlign: "center", marginBottom: 12 }}>
          COMPATIBILITY RADAR
        </p>
        <CompareRadar4 mine={radarMine} theirs={radarTheirs} myName={myName} theirName={friendName} />
      </div>

      {/* 4カテゴリスコア */}
      <div className="space-y-3">
        <p style={{ fontSize: 13, fontWeight: 600, color: C.t1, paddingLeft: 4 }}>カテゴリ別スコア</p>
        <CategoryCard label="性格" icon="🧠" score={report.categories.personality.score} detail={report.categories.personality.detail} delay={0.1} />
        <CategoryCard label="雰囲気" icon="✨" score={report.categories.vibe.score} detail={report.categories.vibe.detail} delay={0.15} />
        <CategoryCard label="スタイル" icon="👗" score={report.categories.style.score} detail={report.categories.style.detail} delay={0.2} />
        <CategoryCard label="価値観" icon="💎" score={report.categories.values.score} detail={report.categories.values.detail} delay={0.25} />
      </div>

      {/* 最高の組み合わせ */}
      {report.strengths.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl p-5"
          style={{ background: `${C.green}06`, border: `1px solid ${C.green}20` }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: C.green, marginBottom: 10 }}>
            最高の組み合わせ
          </p>
          <div className="space-y-2">
            {report.strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span style={{ fontSize: 12, color: C.green, marginTop: 1, flexShrink: 0 }}>+</span>
                <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{s}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* おすすめアクティビティ */}
      {report.bestActivities.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl p-5"
          style={{ background: C.s1, border: `1px solid ${C.s2}` }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: C.t1, marginBottom: 10 }}>
            おすすめアクティビティ
          </p>
          <div className="flex flex-wrap gap-2">
            {report.bestActivities.map((a, i) => (
              <span key={i} style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 16,
                background: `${C.neural}08`, color: C.t2,
                border: `1px solid ${C.neural}15`,
              }}>
                {a}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* 特性比較 */}
      {report.traitComparisons.length > 0 && (
        <div className="space-y-3">
          <p style={{ fontSize: 13, fontWeight: 600, color: C.t1, paddingLeft: 4 }}>特性比較</p>
          {report.traitComparisons.map((tc, i) => (
            <TraitComparisonBar key={tc.axis} comparison={tc} delay={0.4 + i * 0.05} />
          ))}
        </div>
      )}

      {/* 気をつけポイント */}
      {report.frictionPoints.length > 0 && (
        <div className="space-y-3">
          <p style={{ fontSize: 13, fontWeight: 600, color: C.t1, paddingLeft: 4 }}>気をつけポイント</p>
          {report.frictionPoints.map((fp, i) => (
            <FrictionCard key={i} point={fp} delay={0.5 + i * 0.05} />
          ))}
        </div>
      )}

      {/* 注意事項 */}
      {report.watchOuts.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="rounded-2xl p-5"
          style={{ background: `${C.amber}04`, border: `1px solid ${C.amber}15` }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: C.amber, marginBottom: 10 }}>
            覚えておいてほしいこと
          </p>
          <div className="space-y-2">
            {report.watchOuts.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <span style={{ fontSize: 12, color: C.amber, marginTop: 1, flexShrink: 0 }}>!</span>
                <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{w}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* シェアボタン */}
      {onShareClick && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-center pt-2"
        >
          <button
            onClick={onShareClick}
            className="px-8 py-3.5 rounded-xl text-sm font-medium transition-all active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`,
              color: "white",
              boxShadow: `0 4px 16px ${C.neural}30`,
            }}
          >
            この相性をシェアする
          </button>
        </motion.div>
      )}

      {/* フッター */}
      <div className="text-center pt-2">
        <p style={{ fontSize: 9, color: C.t4 }}>
          Aneurasync Genome Card -- 深層相性レポート
        </p>
      </div>
    </div>
  );
}
