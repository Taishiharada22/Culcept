/**
 * E1 hero — 実予定 1 件の「成立判定 + 理由」（pure・column-restricted・no LLM）
 *
 * 設計: docs/reality-os-e1-hero-canary-preflight.md（最小 hero・CEO 2026-06-28）。
 *
 * Reality Judgment Engine をユーザー体験へ繋ぐ最小スライス。**privacy 規律（Stage 4-B-1A）を厳守**:
 *   - 入力は column-restricted な anchor（id/start_time/end_time/rigidity のみ）。
 *     **title / location は読まない・出さない**（FORBIDDEN 列）。
 *   - 時間的成立（重なり / 余白）だけで feasible / caution / unknown を honest に出す。
 *     場所名・出発時刻（leaveBy）・3案・task は v0 では出さない（別 hero・別 GO）。
 *   - 数値を確定値に化けさせない: confidence は heuristic（low）止まり・判定不能は unknown。
 *
 * 不変: pure（DB/IO/fetch/LLM/Date.now なし）。reader だけが client を持つ（実 client 注入は GO 後）。
 *   raw 列を読まない・返さない（reader の SELECT は許可列のみ）。
 */

import {
  ANCHOR_TABLE,
  ANCHOR_COLUMNS_SQL,
  type ColumnRestrictedAnchorRow,
  type SupabaseLikeClient,
} from "@/lib/plan/reality/integration/dev-runtime-adapter";

export type HeroFeasibilityStatus = "feasible" | "caution" | "unknown";

/** controlled reasonCode（生 evidence を出さない・presenter で日本語化）。 */
export type HeroReasonCode =
  | "overlap_conflict"
  | "tight_adjacency"
  | "has_room"
  | "standalone"
  | "insufficient_time_data";

export interface HeroAnchorReadoutV0 {
  readonly anchorId: string;
  readonly status: HeroFeasibilityStatus;
  readonly reasonCodes: readonly HeroReasonCode[];
  readonly confidence: "low" | "unknown";
  readonly isUnknown: boolean;
}

/** "HH:mm" または ISO 文字列から「分（0-1439）」を取り出す。失敗時 null。 */
function toMinutes(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/(?:^|T)(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

const TIGHT_GAP_MIN = 15;

/**
 * column-restricted な anchor 集合（caller が当日へ scope 済み）から、target 1 件の時間的成立を判定。
 * 重なり→caution(overlap) / 近接<15分→caution(tight) / 余白→feasible(has_room) /
 * 単独→feasible(standalone) / 時刻不明→unknown。場所・task は見ない（honest）。
 */
export function evaluateHeroAnchorFeasibility(
  rows: readonly ColumnRestrictedAnchorRow[],
  targetAnchorId: string,
): HeroAnchorReadoutV0 {
  const target = rows.find((r) => r.id === targetAnchorId);
  const tStart = target ? toMinutes(target.start_time) : null;
  if (!target || tStart === null) {
    return { anchorId: targetAnchorId, status: "unknown", reasonCodes: ["insufficient_time_data"], confidence: "unknown", isUnknown: true };
  }
  const tEnd = toMinutes(target.end_time) ?? tStart + 60; // 終了不明は 60 分と仮置き（heuristic）

  const others = rows
    .filter((r) => r.id !== targetAnchorId)
    .map((r) => ({ start: toMinutes(r.start_time), end: toMinutes(r.end_time) }))
    .filter((r): r is { start: number; end: number | null } => r.start !== null);

  if (others.length === 0) {
    return { anchorId: targetAnchorId, status: "feasible", reasonCodes: ["standalone"], confidence: "low", isUnknown: false };
  }

  let overlap = false;
  let tight = false;
  for (const o of others) {
    const oStart = o.start;
    const oEnd = o.end ?? oStart + 60;
    if (tStart < oEnd && oStart < tEnd) {
      overlap = true;
      continue;
    }
    const gap = oStart >= tEnd ? oStart - tEnd : tStart - oEnd; // 隣接 gap
    if (gap >= 0 && gap < TIGHT_GAP_MIN) tight = true;
  }

  if (overlap) {
    return { anchorId: targetAnchorId, status: "caution", reasonCodes: ["overlap_conflict"], confidence: "low", isUnknown: false };
  }
  if (tight) {
    return { anchorId: targetAnchorId, status: "caution", reasonCodes: ["tight_adjacency"], confidence: "low", isUnknown: false };
  }
  return { anchorId: targetAnchorId, status: "feasible", reasonCodes: ["has_room"], confidence: "low", isUnknown: false };
}

// ── presenter（reasonCode → 日本語・決定的写像・LLM なし・指示形を使わない） ──

const STATUS_LABEL: Record<HeroFeasibilityStatus, string> = {
  feasible: "この予定は時間的に成立しています",
  caution: "この予定は時間的に注意が要りそうです",
  unknown: "時間情報が不足していて判定できません",
};
const REASON_TEXT: Record<HeroReasonCode, string> = {
  overlap_conflict: "他の予定と時間が重なっています",
  tight_adjacency: "前後の予定との間隔が短めです",
  has_room: "前後の予定との間に余裕があります",
  standalone: "この時間帯に他の予定はありません",
  insufficient_time_data: "開始・終了時刻が読み取れませんでした",
};
const CONFIDENCE_BAND: Record<HeroAnchorReadoutV0["confidence"], string> = {
  low: "推定（手がかりは時刻のみ・低め）",
  unknown: "判定不能",
};

export interface HeroCanarySurfaceV0 {
  readonly statusLabel: string;
  readonly reasonText: readonly string[];
  readonly confidenceBand: string;
  readonly isUnknown: boolean;
}

/** readout → 表示 VM（決定的・raw/reasonCode 生値は出さない）。 */
export function presentHeroAnchorReadout(readout: HeroAnchorReadoutV0): HeroCanarySurfaceV0 {
  return {
    statusLabel: STATUS_LABEL[readout.status],
    reasonText: readout.reasonCodes.map((c) => REASON_TEXT[c]),
    confidenceBand: CONFIDENCE_BAND[readout.confidence],
    isUnknown: readout.isUnknown,
  };
}

// ── reader（column-restricted・実 client 注入は GO 後・mock test 可） ──

export interface HeroAnchorReader {
  /** owner の anchor を **許可列のみ** read（fail-open []）。raw を読まない。 */
  readColumnRestrictedAnchors(userId: string): Promise<readonly ColumnRestrictedAnchorRow[]>;
}

/** 実 client（SupabaseLikeClient）を column-restricted reader に包む。SELECT は許可列のみ。 */
export function createSupabaseHeroAnchorReader(client: SupabaseLikeClient): HeroAnchorReader {
  return {
    async readColumnRestrictedAnchors(userId) {
      const res = await client.from(ANCHOR_TABLE).select(ANCHOR_COLUMNS_SQL).eq("user_id", userId);
      if (res.error || !res.data) return []; // fail-open
      return res.data;
    },
  };
}

/**
 * seam（fixture→live 分岐の live 側）: reader 経由で target 1 件の hero surface を組む。
 * flag ∧ canaryUser ∧ read guard を満たした時だけ呼ぶ（本関数は flag を見ない・pure 合成）。
 */
export async function composeHeroCanarySurface(
  reader: HeroAnchorReader,
  userId: string,
  targetAnchorId: string,
): Promise<HeroCanarySurfaceV0> {
  const rows = await reader.readColumnRestrictedAnchors(userId);
  return presentHeroAnchorReadout(evaluateHeroAnchorFeasibility(rows, targetAnchorId));
}

/**
 * viewer の anchor 全件から **最も早い開始**を target に hero surface を組む（v0 の「1 件」選択）。
 * anchor 0 件 / 時刻なし → null（hero なし）。reader が column-restricted・fail-open。
 */
export async function composeHeroCanaryForViewer(
  reader: HeroAnchorReader,
  userId: string,
): Promise<HeroCanarySurfaceV0 | null> {
  const rows = await reader.readColumnRestrictedAnchors(userId);
  const dated = rows.filter((r) => toMinutes(r.start_time) !== null);
  if (dated.length === 0) return null;
  const target = [...dated].sort((a, b) => (toMinutes(a.start_time)! - toMinutes(b.start_time)!))[0]!;
  return presentHeroAnchorReadout(evaluateHeroAnchorFeasibility(rows, target.id));
}
