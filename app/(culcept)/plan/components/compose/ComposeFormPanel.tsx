"use client";

/**
 * ComposeFormPanel — 右の「質問形式」予定作成パネル（P4・理想画像順序）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * 順序（理想画像）: ① なにをする？ ② どこで？ ③ 誰と？
 *   - ① 右端に内容別アイコン（activityIcon 推定・表示専用）
 *   - ② 左に location アイコン ＋ 実候補検索（PlaceCandidatesPanel・当初仕様）
 *   - ③ 左に people アイコン、右に ＋（履歴呼び出しは後続）。companions は draft 表示専用
 *
 * 範囲外（このパネル）: ④ 予定カード / ⑤ 時間（ComposeTimeField） / ⑥ 完了（sheet）。
 *   動かせなさは日付横の SVG トグルへ移動（本パネルから撤去）。
 */

import { useMemo, useState } from "react";

import { classifyActivityIconKey } from "@/lib/plan/compose/activityIcon";
import type { ComposeDraftCore } from "@/lib/plan/compose/composeDraft";
import {
  deriveTitlePlaceGroups,
  type LocationUsage,
} from "@/lib/plan/compose/locationHistory";

import { PlaceCandidatesPanel } from "../PlaceCandidatesPanel";
import { useBiasContext } from "../_useBiasContext";
import { ActivityIcon, LocationIcon, PeopleIcon, PlusIcon } from "./composeIcons";
import { LocationHistoryChips } from "./LocationHistoryChips";

export interface ComposeFormPanelProps {
  core: ComposeDraftCore;
  onCoreChange?: (patch: Partial<ComposeDraftCore>) => void;
  /** ④ Phase 1a: 過去 anchor の場所利用ログ（client-side・任意）。panel が title 連動で集計。 */
  locationUsages?: LocationUsage[];
}

export function ComposeFormPanel({
  core,
  onCoreChange,
  locationUsages,
}: ComposeFormPanelProps) {
  const { biasContext } = useBiasContext();
  const activityKey = classifyActivityIconKey(core.title);
  const companions = core.companions ?? [];

  // ① 活動SVG popover 用: その予定の「よく行く（常連）＋最近（開拓）」を reactive に導出。
  const placeGroups = useMemo(
    () => deriveTitlePlaceGroups(locationUsages ?? [], core.title),
    [locationUsages, core.title],
  );
  const hasPlaceGroups =
    placeGroups.frequent.length > 0 || placeGroups.recent.length > 0;
  const titleTrim = core.title.trim();
  // ① 活動SVG クリックで「この予定なら、ここでは？」候補を出す popover の開閉。
  const [showPlaces, setShowPlaces] = useState(false);
  const titleShort = titleTrim.length > 12 ? `${titleTrim.slice(0, 12)}…` : titleTrim;
  const pickLocation = (text: string, category?: ComposeDraftCore["locationCategory"]) => {
    onCoreChange?.(category ? { locationText: text, locationCategory: category } : { locationText: text });
  };

  return (
    <div data-testid="compose-form-panel" className="space-y-3">
      {/* ① なにをする？ — 右端の内容別アイコンを**クリック → この予定の場所候補** */}
      <Question label="なにをする？">
        <div className="relative">
          <input
            type="text"
            data-testid="compose-field-title"
            value={core.title}
            onChange={(e) => onCoreChange?.({ title: e.target.value })}
            placeholder="クライアントミーティング / 企画書 等"
            className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-9 text-sm focus:outline-none focus-visible:border-slate-300"
          />
          <button
            type="button"
            data-testid="compose-activity-places-trigger"
            data-enabled={titleTrim ? "true" : "false"}
            aria-label="この予定の場所候補"
            aria-expanded={showPlaces}
            title={
              titleTrim
                ? "この予定でよく行く場所"
                : "予定を入力すると候補が出ます"
            }
            disabled={!titleTrim}
            onClick={() => setShowPlaces((v) => !v)}
            className={
              "absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition " +
              (titleTrim
                ? "text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700"
                : "cursor-not-allowed text-slate-300")
            }
          >
            <ActivityIcon iconKey={activityKey} />
          </button>
        </div>
        {/* 活動SVG クリック → その予定の場所候補（「よく行く（常連）＋最近（開拓）」・両方 title 連動）。
            1タップで「どこで？」に反映。長押しで詳細。自動確定なし・外部検索なし・履歴 derive。 */}
        {showPlaces && titleTrim && (
          <div
            data-testid="compose-activity-places"
            className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2"
          >
            <p className="mb-1 text-[11px] font-medium text-indigo-500">
              「{titleShort}」の場所
            </p>
            {hasPlaceGroups ? (
              <LocationHistoryChips
                frequent={placeGroups.frequent}
                forTitle={placeGroups.recent}
                forTitleLabel="最近"
                onPick={(chip) => {
                  pickLocation(chip.text, chip.category);
                  setShowPlaces(false);
                }}
              />
            ) : (
              <p className="text-[11px] text-slate-400">
                この予定の場所履歴はまだありません
              </p>
            )}
          </div>
        )}
      </Question>

      {/* ② どこで？ — 左に location アイコン ＋ 実候補検索 */}
      <Question label="どこで？">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            <LocationIcon />
          </span>
          <input
            type="text"
            data-testid="compose-field-location"
            value={core.locationText}
            onChange={(e) => onCoreChange?.({ locationText: e.target.value })}
            placeholder="例: 渋谷オフィス 会議室B / カフェ"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus-visible:border-slate-300"
          />
        </div>
        {/* どこで欄: 履歴チップ（よく行く）は廃止 → 活動SVG popover に集約（CEO 2026-06-03）。
            ここは手入力 + 既存 PlaceCandidatesPanel（/api/plan/places/search・非強制・自己 gate）のみ。 */}
        <PlaceCandidatesPanel
          query={core.locationText}
          title={core.title}
          biasContext={biasContext}
          sensitive={false}
          onSelect={(canonicalText) =>
            onCoreChange?.({ locationText: canonicalText })
          }
          onSkip={() => undefined}
        />
      </Question>

      {/* ③ 誰と？ — 左に people アイコン、右に ＋（任意・draft 表示専用） */}
      <Question label="誰と？">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            <PeopleIcon />
          </span>
          <input
            type="text"
            data-testid="compose-field-companions"
            value={companions.join("、")}
            onChange={(e) =>
              onCoreChange?.({
                companions: e.target.value
                  .split(/[、,]/)
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0),
              })
            }
            placeholder="田中さん、山本さん 等（任意）"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-9 text-sm focus:outline-none focus-visible:border-slate-300"
          />
          <button
            type="button"
            data-testid="compose-companions-add"
            aria-label="よく入れる人から追加"
            title="よく入れる人から追加（履歴は後続）"
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <PlusIcon />
          </button>
        </div>
      </Question>
    </div>
  );
}

function Question({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      {children}
    </div>
  );
}
