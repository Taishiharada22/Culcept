/**
 * lib/plan/mobility/paceCaptureOptIn.ts — A1-7: GPS pace capture **専用**の明示 opt-in（汎用 location opt-in と分離）
 *
 * ★なぜ別 opt-in か（informed consent・最重要）:
 *   汎用 location opt-in（journey の `aneurasync.location-opt-in.v1`）は「現在地を 1 回使う」等の同意。
 *   「現在地ボタンに許可した」≠「終日 GPS で移動を継続記録してよい」。後者を汎用同意に便乗させると
 *   無断で継続捕捉が始まる＝consent 違反。よって pace capture は **別キーの明示 opt-in** を持つ。
 *   既存 opt-in *system*（型・read/write・banner パターン）は再利用しつつ、同意自体は分離する。
 *
 * ★安全境界: client-only / SSR・破損は fail-open（default not_asked）/ DB・network 不使用 / versioned key /
 *   raw GPS は一切保存しない（本 store は同意状態のみ・derived movement event は別 store）。
 *
 * 状態は journey の LocationOptInState を再利用（A1-6b core gate が同型を受けるため・v0 は not_asked/granted/declined）。
 */
import type { LocationOptInState } from "@/lib/alter-morning/journey/locationOptIn";

export const PACE_CAPTURE_OPT_IN_KEY = "aneurasync.plan.pace-capture-opt-in.v1";

/** localStorage に保存される同意レコード（移動記録への明示同意のみ・座標は持たない）。 */
export interface PaceCaptureOptInRecord {
  readonly state: LocationOptInState;
  /** granted になった時刻（debug 用）。 */
  readonly grantedAt?: string;
  readonly updatedAt: string;
}

function makeDefault(): PaceCaptureOptInRecord {
  return { state: "not_asked", updatedAt: new Date().toISOString() };
}

function isValidState(value: unknown): value is LocationOptInState {
  return value === "not_asked" || value === "granted" || value === "snoozed" || value === "declined";
}

function isValidRecord(value: unknown): value is PaceCaptureOptInRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isValidState(v.state)) return false;
  if (typeof v.updatedAt !== "string") return false;
  if (v.grantedAt != null && typeof v.grantedAt !== "string") return false;
  return true;
}

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** record を読む（client・fail-open＝不在/破損は not_asked）。 */
export function readPaceCaptureOptIn(): PaceCaptureOptInRecord {
  const ls = getStorage();
  if (!ls) return makeDefault();
  try {
    const raw = ls.getItem(PACE_CAPTURE_OPT_IN_KEY);
    if (raw == null) return makeDefault();
    const parsed = JSON.parse(raw);
    if (!isValidRecord(parsed)) return makeDefault();
    return parsed;
  } catch {
    return makeDefault();
  }
}

/** record を書く（client・fail-open・updatedAt 自動）。 */
export function writePaceCaptureOptIn(record: Omit<PaceCaptureOptInRecord, "updatedAt">): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.setItem(PACE_CAPTURE_OPT_IN_KEY, JSON.stringify({ ...record, updatedAt: new Date().toISOString() }));
  } catch {
    /* quota / private mode は fail-open */
  }
}

/**
 * 有効な opt-in 状態（pure）。v0 は snooze を使わないので record.state をそのまま返す。
 * （journey と違い pace capture は snooze 概念を持たない＝明示 granted/declined/not_asked のみ）
 */
export function getPaceCaptureOptInState(record: PaceCaptureOptInRecord): LocationOptInState {
  return record.state;
}

/** client 便利: 現在の opt-in 状態を読む。 */
export function loadPaceCaptureOptInState(): LocationOptInState {
  return getPaceCaptureOptInState(readPaceCaptureOptIn());
}

/** ★明示同意: 移動の記録を許可（banner「許可する」）。 */
export function markPaceCaptureGranted(nowMs: number = Date.now()): void {
  writePaceCaptureOptIn({ state: "granted", grantedAt: new Date(nowMs).toISOString() });
}

/** 明示拒否 / 取り消し（banner「今はしない」/「記録を止める」）。可逆。 */
export function markPaceCaptureDeclined(): void {
  writePaceCaptureOptIn({ state: "declined" });
}

/** not_asked に戻す（再 opt-in 経路・自動 grant しない）。 */
export function resetPaceCaptureOptIn(): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.removeItem(PACE_CAPTURE_OPT_IN_KEY);
  } catch {
    /* fail-open */
  }
}
