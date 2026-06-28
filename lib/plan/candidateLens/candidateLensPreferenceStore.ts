/**
 * lib/plan/candidateLens/candidateLensPreferenceStore.ts
 *   — Candidate Lens / Phase 3-b: Preference **shadow 記録**（localStorage only・記録のみ・resolver 未供給）
 *
 * ★スコープ厳守（CEO 2026-06-16・P3-b 条件付き GO）:
 *   - **記録だけ**。記録した preference を resolver に渡さない／候補順位・比較表・行順・UI 表示を一切変えない（P3-c 別 GO）。
 *   - **localStorage only**。DB / Supabase write / server action / 外部 API / migration なし。production では絶対に write しない。
 * ★privacy（CEO 修正条件）: `selectedPlaceKey` / `comparedAgainstKey` は **opaque key**（場所名・住所・座標を含まない不可読 hash）。
 *   生の場所名・住所・座標・placeId・予定タイトル本文・userId は保存しない。
 * ★不変: client-only / SSR・localStorage 不在/破損/quota は fail-open / flag default OFF / production hard block / fire-and-forget。
 */
import { isAneuraObserveProdEnabled } from "@/lib/plan/aneuraReadoutGate";
import { normalizeLocationText } from "@/lib/plan/mobility/mobilityObservationStore";
import type { PreferenceObservation } from "@/lib/plan/candidateLens/candidateLensPreferenceObs";

/** ★shadow 記録 flag（P3-b・default OFF・dev-only・production hard block）。default は false。 */
export const PLACE_CANDIDATE_LENS_PREF_OBS_ENABLED = false;
export function isCandidateLensPrefObsEnabled(): boolean {
  return (PLACE_CANDIDATE_LENS_PREF_OBS_ENABLED && process.env.NODE_ENV !== "production") || isAneuraObserveProdEnabled(); // observe master flag で本番解放（default OFF・localStorage のみ）
}

/**
 * ★preference 供給(apply) flag（P3-c・obs flag と**独立**・default OFF・production hard block）。
 *   obs ON / apply OFF（shadow のまま）も、obs OFF / apply OFF も可能。apply OFF / production / insufficient は canonical 表示。
 */
export const PLACE_CANDIDATE_LENS_PREF_APPLY_ENABLED = false;
export function isCandidateLensPrefApplyEnabled(): boolean {
  // ★P3-c apply は OBSERVE master（localStorage 観測=P3-b）から **decouple**（2026-06-28）。
  //   OBSERVE を本番解放しても apply（候補/③比較表の行順を変える preference 供給）は開かない。
  //   apply の本番解放は独自 P3-c GO を要する＝obs と独立・default OFF・production hard block。
  return PLACE_CANDIDATE_LENS_PREF_APPLY_ENABLED && process.env.NODE_ENV !== "production";
}

const PREF_OBS_KEY = "aneurasync.candidateLens.prefObs.v1";
const RING_MAX = 200; // ★直近 200 件で ring（無制限肥大を防止）

// ───────────────────────── opaque key（場所名を不可読 hash に・privacy 核） ─────────────────────────

/**
 * cyrb53: 高品質・決定論・同期の非暗号 hash（53bit）。依存なし。
 *   同じ場所 → 同じ key（集計/再選検出が働く）／出力は数値由来で**元の場所名 substring を含まない**。
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * ★場所テキスト → opaque key（人間可読な場所名/住所を含まない）。
 *   normalize（表記揺れ吸収）→ cyrb53 hash → base36（`p` prefix）。空/不正は null。
 *   ※ normalizeLocationText 自体は可読（場所名そのまま）だが、その**結果を保存せず hash した値のみ**を保存する。
 */
export function opaquePlaceKey(text: string | null | undefined): string | null {
  const norm = normalizeLocationText(text);
  if (norm == null) return null;
  return `p${cyrb53(norm).toString(36)}`;
}

// ───────────────────────── localStorage I/O（fail-open・client-only） ─────────────────────────

function getStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** 配列としてパース（fail-open・壊れていれば空）。最低限の形チェックのみ（過剰検証しない）。 */
function parseObservations(raw: string | null): PreferenceObservation[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (o): o is PreferenceObservation =>
        o != null && typeof o === "object" && typeof (o as PreferenceObservation).selectedPlaceKey === "string" && typeof (o as PreferenceObservation).at === "number",
    );
  } catch {
    return [];
  }
}

/** 全観測を読む（client・fail-open・read-only）。 */
export function loadPreferenceObservations(): readonly PreferenceObservation[] {
  const ls = getStorage();
  if (!ls) return [];
  try {
    return parseObservations(ls.getItem(PREF_OBS_KEY));
  } catch {
    return [];
  }
}

/**
 * 観測を 1 件 append（★shadow 記録・fire-and-forget・flag OFF/production は no-op）。
 *   ring(直近 RING_MAX)に丸める。quota/破損は fail-open。**resolver には渡さない**。
 */
export function recordPreferenceObservation(obs: PreferenceObservation): void {
  if (!isCandidateLensPrefObsEnabled()) return; // ★flag OFF / production では何もしない
  const ls = getStorage();
  if (!ls) return;
  try {
    const next = ringAppend(parseObservations(ls.getItem(PREF_OBS_KEY)), obs);
    ls.setItem(PREF_OBS_KEY, JSON.stringify(next));
  } catch {
    /* quota 等は fail-open */
  }
}

/** ★ring 付与（pure・record が使う実ロジック・直近 max 件に丸める）。 */
export function ringAppend(
  list: readonly PreferenceObservation[],
  obs: PreferenceObservation,
  max: number = RING_MAX,
): PreferenceObservation[] {
  return [...list, obs].slice(-max);
}

/** 観測ログを全消去（rollback / opt-out 用・client・fail-open）。 */
export function clearPreferenceObservations(): void {
  const ls = getStorage();
  if (!ls) return;
  try {
    ls.removeItem(PREF_OBS_KEY);
  } catch {
    /* fail-open */
  }
}
