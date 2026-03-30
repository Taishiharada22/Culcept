"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  EventContext, EventType, VenueType, TransportMode,
  CrowdLevel, AcStrength, WindLevel, SunExposure,
} from "../_lib/vcTypes";
import {
  EVENT_TYPE_LABELS, EVENT_TYPE_ICONS,
  TRANSPORT_LABELS, TRANSPORT_ICONS,
} from "../_lib/vcTypes";
import type { IntentBadge } from "../_lib/vcIntent";

/* ═══════════════════════════════════════════════
   Chip セレクター
   ═══════════════════════════════════════════════ */
function ChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  renderLabel,
}: {
  label: string;
  options: T[];
  value: T | undefined;
  onChange: (v: T) => void;
  renderLabel: (v: T) => string;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
              value === opt
                ? "bg-purple-50 text-purple-600 border-purple-300/60 font-medium"
                : "bg-white/60 text-gray-500 border-gray-200/50 hover:border-gray-300"
            }`}
          >
            {renderLabel(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Slider
   ═══════════════════════════════════════════════ */
function MiniSlider({
  label,
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium text-gray-500">{label}</span>
        <span className="text-[9px] text-gray-400">{Math.round(value * 100)}%</span>
      </div>
      <div className="flex items-center gap-2">
        {leftLabel && <span className="text-[8px] text-gray-400 shrink-0 w-8">{leftLabel}</span>}
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
          className="flex-1 h-1.5 accent-purple-500 cursor-pointer"
        />
        {rightLabel && <span className="text-[8px] text-gray-400 shrink-0 w-8 text-right">{rightLabel}</span>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   EventProfileForm
   ═══════════════════════════════════════════════ */
interface EventProfileFormProps {
  profile: Partial<EventContext>;
  onChange: (patch: Partial<EventContext>) => void;
  badges: IntentBadge[];
}

const EVENT_TYPES: EventType[] = [
  "work", "date", "friends", "party", "sports",
  "travel", "outdoor", "formal", "interview", "errand", "home",
];
const VENUE_TYPES: VenueType[] = ["indoor", "outdoor", "mixed"];
const TRANSPORTS: TransportMode[] = ["train", "walk", "bicycle", "car", "bus", "taxi"];
const CROWD_LEVELS: CrowdLevel[] = ["low", "med", "high"];
const AC_STRENGTHS: AcStrength[] = ["none", "low", "med", "high"];
const WIND_LEVELS: WindLevel[] = ["low", "med", "high"];
const SUN_EXPOSURES: SunExposure[] = ["none", "low", "med", "high"];

const CROWD_LABELS: Record<CrowdLevel, string> = { low: "少ない", med: "普通", high: "混雑" };
const AC_LABELS: Record<AcStrength, string> = { none: "なし", low: "弱", med: "普通", high: "強" };
const WIND_LABELS: Record<WindLevel, string> = { low: "弱い", med: "普通", high: "強い" };
const SUN_LABELS: Record<SunExposure, string> = { none: "なし", low: "少し", med: "普通", high: "強い" };
const VENUE_LABELS: Record<VenueType, string> = { indoor: "屋内", outdoor: "屋外", mixed: "両方" };

/** Badge色 → tailwind class */
const BADGE_COLORS: Record<IntentBadge["color"], string> = {
  purple: "bg-purple-50/80 text-purple-600 border-purple-200/50",
  blue: "bg-blue-50/80 text-blue-600 border-blue-200/50",
  cyan: "bg-cyan-50/80 text-cyan-600 border-cyan-200/50",
  amber: "bg-amber-50/80 text-amber-600 border-amber-200/50",
  rose: "bg-rose-50/80 text-rose-600 border-rose-200/50",
  emerald: "bg-emerald-50/80 text-emerald-600 border-emerald-200/50",
  gray: "bg-gray-100/80 text-gray-600 border-gray-200/50",
};

export default function EventProfileForm({
  profile,
  onChange,
  badges,
}: EventProfileFormProps) {
  const [showDetail, setShowDetail] = React.useState(false);

  const patch = (p: Partial<EventContext>) => onChange(p);

  return (
    <div className="space-y-4">
      {/* ── 必須セクション ── */}
      <div className="space-y-3">
        {/* シーン */}
        <ChipSelect
          label="シーン"
          options={EVENT_TYPES}
          value={profile.type}
          onChange={(v) => patch({ type: v })}
          renderLabel={(v) => `${EVENT_TYPE_ICONS[v]} ${EVENT_TYPE_LABELS[v]}`}
        />

        {/* 屋内外 */}
        <ChipSelect
          label="屋内外"
          options={VENUE_TYPES}
          value={profile.venue}
          onChange={(v) => patch({ venue: v })}
          renderLabel={(v) => VENUE_LABELS[v]}
        />

        {/* 移動手段 */}
        <ChipSelect
          label="主な移動手段"
          options={TRANSPORTS}
          value={profile.mainTransport}
          onChange={(v) => patch({ mainTransport: v })}
          renderLabel={(v) => `${TRANSPORT_ICONS[v]} ${TRANSPORT_LABELS[v]}`}
        />

        {/* 座り/歩き */}
        <div className="grid grid-cols-2 gap-3">
          <MiniSlider
            label="座る割合"
            value={profile.sitRatio ?? 0.3}
            onChange={(v) => patch({ sitRatio: v })}
            leftLabel="少"
            rightLabel="多"
          />
          <MiniSlider
            label="歩く割合"
            value={profile.walkRatio ?? 0.3}
            onChange={(v) => patch({ walkRatio: v })}
            leftLabel="少"
            rightLabel="多"
          />
        </div>
      </div>

      {/* ── Intent バッジ（リアルタイム） ── */}
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-1">
          {badges.map((b, i) => (
            <span
              key={i}
              className={`text-[10px] px-2 py-0.5 rounded-full border ${BADGE_COLORS[b.color]}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* ── 詳細トグル ── */}
      <button
        type="button"
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 transition"
      >
        <motion.span
          animate={{ rotate: showDetail ? 90 : 0 }}
          className="inline-block"
        >
          ▶
        </motion.span>
        詳細設定
      </button>

      {/* ── 詳細セクション ── */}
      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden space-y-4"
          >
            {/* 移動 */}
            <div className="space-y-3 rounded-xl bg-gray-50/40 border border-gray-200/30 p-3">
              <p className="text-[10px] font-bold text-gray-500 tracking-wider">移動</p>
              <ChipSelect
                label="混雑度"
                options={CROWD_LEVELS}
                value={profile.crowdLevel}
                onChange={(v) => patch({ crowdLevel: v })}
                renderLabel={(v) => CROWD_LABELS[v]}
              />
              <MiniSlider
                label="歩行距離 (km)"
                value={(profile.walkDistanceKm ?? 1) / 10}
                onChange={(v) => patch({ walkDistanceKm: Math.round(v * 100) / 10 })}
                leftLabel="0"
                rightLabel="10km"
              />
            </div>

            {/* 環境 */}
            <div className="space-y-3 rounded-xl bg-gray-50/40 border border-gray-200/30 p-3">
              <p className="text-[10px] font-bold text-gray-500 tracking-wider">環境</p>
              <ChipSelect
                label="冷房強さ"
                options={AC_STRENGTHS}
                value={profile.acStrength}
                onChange={(v) => patch({ acStrength: v })}
                renderLabel={(v) => AC_LABELS[v]}
              />
              <div className="grid grid-cols-2 gap-3">
                <ChipSelect
                  label="風"
                  options={WIND_LEVELS}
                  value={profile.windLevel}
                  onChange={(v) => patch({ windLevel: v })}
                  renderLabel={(v) => WIND_LABELS[v]}
                />
                <ChipSelect
                  label="日差し"
                  options={SUN_EXPOSURES}
                  value={profile.sunExposure}
                  onChange={(v) => patch({ sunExposure: v })}
                  renderLabel={(v) => SUN_LABELS[v]}
                />
              </div>
              <MiniSlider
                label="雨リスク"
                value={profile.rainRisk ?? 0}
                onChange={(v) => patch({ rainRisk: v })}
                leftLabel="晴"
                rightLabel="雨"
              />
              <MiniSlider
                label="汗リスク"
                value={profile.sweatRisk ?? 0}
                onChange={(v) => patch({ sweatRisk: v })}
                leftLabel="低"
                rightLabel="高"
              />
            </div>

            {/* 印象 */}
            <div className="space-y-3 rounded-xl bg-gray-50/40 border border-gray-200/30 p-3">
              <p className="text-[10px] font-bold text-gray-500 tracking-wider">印象</p>
              <MiniSlider
                label="目立ち度"
                value={profile.attentionLevel ?? 0.3}
                onChange={(v) => patch({ attentionLevel: v })}
                leftLabel="控えめ"
                rightLabel="主役"
              />
              <MiniSlider
                label="デート感"
                value={profile.romanceLevel ?? 0}
                onChange={(v) => patch({ romanceLevel: v })}
                leftLabel="なし"
                rightLabel="高"
              />
              <MiniSlider
                label="信頼感"
                value={profile.trustNeed ?? 0.3}
                onChange={(v) => patch({ trustNeed: v })}
                leftLabel="低"
                rightLabel="高"
              />
            </div>

            {/* イベント（写真/食事/プレゼン） */}
            <div className="space-y-3 rounded-xl bg-gray-50/40 border border-gray-200/30 p-3">
              <p className="text-[10px] font-bold text-gray-500 tracking-wider">特別な瞬間</p>
              <MiniSlider
                label="📸 写真を撮る"
                value={profile.photoMoment ?? 0}
                onChange={(v) => patch({ photoMoment: v })}
                leftLabel="なし"
                rightLabel="たくさん"
              />
              <MiniSlider
                label="🍽️ 食事あり"
                value={profile.mealMoment ?? 0}
                onChange={(v) => patch({ mealMoment: v })}
                leftLabel="なし"
                rightLabel="メイン"
              />
              <MiniSlider
                label="🎤 注目される場面"
                value={profile.presentationMoment ?? 0}
                onChange={(v) => patch({ presentationMoment: v })}
                leftLabel="なし"
                rightLabel="メイン"
              />
            </div>

            {/* 快適性 */}
            <div className="space-y-3 rounded-xl bg-gray-50/40 border border-gray-200/30 p-3">
              <p className="text-[10px] font-bold text-gray-500 tracking-wider">快適性</p>
              <MiniSlider
                label="快適さ重視"
                value={profile.comfortPriority ?? 0.5}
                onChange={(v) => patch({ comfortPriority: v })}
                leftLabel="見た目"
                rightLabel="楽さ"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
