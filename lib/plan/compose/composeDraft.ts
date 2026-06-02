/**
 * composeDraft — 予定追加 2カラム体験の UI 内部状態モデル + reducer（pure）。A-0-2。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.1 / §4.2 / A-0-2
 *
 * ComposeDraftState を内部正本とし、AnchorFormState / buildAnchorInputFromForm は
 * 「保存境界」でのみ再利用する（A-1 では保存変換は未実装＝A-4 預け）。
 * これにより新 UI 固有状態（未配置 / 配置済み未保存 / 仮 end 等）を旧フォームに
 * 寄せ過ぎず、かつ persisted contract を 1 ビットも変えない。
 *
 * 範囲外（A-1）: React / DOM、保存 POST、PlanClient、flag 分岐、AddAnchorModal。
 */

import type { AnchorRigidity } from "@/lib/plan/external-anchor";
import type { LocationCategory } from "@/lib/plan/location-category";
import {
  type ComposeTimeConstraint,
  resolvePlacement,
} from "@/lib/plan/compose/composeTimeResolver";

export interface ComposeDraftCore {
  title: string;
  /** 「カフェ」だけでも可。空文字は配置不可（必須 = title + 何らかの場所文言）。 */
  locationText: string;
  rigidity: AnchorRigidity | "";
  locationCategory?: LocationCategory;
  /** 誰と（P4・draft 表示専用・任意）。保存は migration 後（現状は未永続化＝保存時に除外）。 */
  companions?: string[];
}

export type ComposePlacement =
  | { status: "unplaced" }
  | {
      status: "placed";
      startMin: number;
      /** null = 未保存（開いた長さ）=「未定 / 開始のみ」 */
      endMin: number | null;
      crossesMidnight: boolean;
      edgeClamped: boolean;
    };

export interface ComposeDraftState {
  id: string;
  core: ComposeDraftCore;
  time: ComposeTimeConstraint;
  placement: ComposePlacement;
}

export interface ComposeState {
  drafts: ComposeDraftState[];
}

export function emptyComposeState(): ComposeState {
  return { drafts: [] };
}

export function emptyDraftCore(): ComposeDraftCore {
  return { title: "", locationText: "", rigidity: "", companions: [] };
}

/** 配置可能か = title 非空 + 場所文言 非空（CEO 必須 = 何を + どこで）。 */
export function isPlaceable(draft: ComposeDraftState): boolean {
  return (
    draft.core.title.trim().length > 0 &&
    draft.core.locationText.trim().length > 0
  );
}

/** 未保存の placed draft があるか（日付切替ブロック判定・A-0-3）。 */
export function hasUnsavedPlaced(state: ComposeState): boolean {
  return state.drafts.some((d) => d.placement.status === "placed");
}

export type ComposeAction =
  | {
      type: "add";
      id: string;
      core?: Partial<ComposeDraftCore>;
      time?: ComposeTimeConstraint;
    }
  | { type: "updateCore"; id: string; patch: Partial<ComposeDraftCore> }
  | { type: "setTime"; id: string; time: ComposeTimeConstraint }
  | { type: "place"; id: string; dropStartMin: number }
  | { type: "unplace"; id: string }
  | { type: "remove"; id: string };

/**
 * pure reducer。id は外部生成（Date.now / Math.random を内部で使わず決定論的）。
 */
export function composeReducer(
  state: ComposeState,
  action: ComposeAction,
): ComposeState {
  switch (action.type) {
    case "add": {
      if (state.drafts.some((d) => d.id === action.id)) return state; // 冪等
      const draft: ComposeDraftState = {
        id: action.id,
        core: { ...emptyDraftCore(), ...action.core },
        time: action.time ?? { mode: "none" },
        placement: { status: "unplaced" },
      };
      return { drafts: [...state.drafts, draft] };
    }
    case "updateCore":
      return mapDraft(state, action.id, (d) => ({
        ...d,
        core: { ...d.core, ...action.patch },
      }));
    case "setTime":
      return mapDraft(state, action.id, (d) => ({ ...d, time: action.time }));
    case "place":
      return mapDraft(state, action.id, (d) => {
        if (!isPlaceable(d)) return d; // 必須未充足は配置しない
        const r = resolvePlacement(d.time, { dropStartMin: action.dropStartMin });
        return {
          ...d,
          placement: {
            status: "placed",
            startMin: r.startMin,
            endMin: r.endMin,
            crossesMidnight: r.crossesMidnight,
            edgeClamped: r.edgeClamped,
          },
        };
      });
    case "unplace":
      return mapDraft(state, action.id, (d) => ({
        ...d,
        placement: { status: "unplaced" },
      }));
    case "remove":
      return { drafts: state.drafts.filter((d) => d.id !== action.id) };
  }
}

function mapDraft(
  state: ComposeState,
  id: string,
  fn: (d: ComposeDraftState) => ComposeDraftState,
): ComposeState {
  return { drafts: state.drafts.map((d) => (d.id === id ? fn(d) : d)) };
}
