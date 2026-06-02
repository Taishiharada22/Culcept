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

import { classifyActivityIconKey } from "@/lib/plan/compose/activityIcon";
import type { ComposeDraftCore } from "@/lib/plan/compose/composeDraft";
import type { LocationHistory } from "@/lib/plan/compose/locationHistory";

import { PlaceCandidatesPanel } from "../PlaceCandidatesPanel";
import { useBiasContext } from "../_useBiasContext";
import { ActivityIcon, LocationIcon, PeopleIcon, PlusIcon } from "./composeIcons";
import { LocationHistoryChips } from "./LocationHistoryChips";

export interface ComposeFormPanelProps {
  core: ComposeDraftCore;
  onCoreChange?: (patch: Partial<ComposeDraftCore>) => void;
  /** ④ Phase 1a: 過去 anchor から導出した「よく行く/最近」場所（client-side・任意）。 */
  locationHistory?: LocationHistory;
}

export function ComposeFormPanel({
  core,
  onCoreChange,
  locationHistory,
}: ComposeFormPanelProps) {
  const { biasContext } = useBiasContext();
  const activityKey = classifyActivityIconKey(core.title);
  const companions = core.companions ?? [];

  return (
    <div data-testid="compose-form-panel" className="space-y-3">
      {/* ① なにをする？ — 右端に内容別アイコン */}
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
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-400">
            <ActivityIcon iconKey={activityKey} />
          </span>
        </div>
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
        {/* ④ Phase 1a: 未入力時に「よく行く/最近」を提示（外部検索の上）。1タップで text+category を確定。自動確定しない。 */}
        {core.locationText.trim().length === 0 && locationHistory && (
          <LocationHistoryChips
            history={locationHistory}
            onPick={(chip) =>
              onCoreChange?.(
                chip.category
                  ? { locationText: chip.text, locationCategory: chip.category }
                  : { locationText: chip.text },
              )
            }
          />
        )}
        {/* 当初仕様: 既存 PlaceCandidatesPanel（/api/plan/places/search）。非強制・自己 gate */}
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
