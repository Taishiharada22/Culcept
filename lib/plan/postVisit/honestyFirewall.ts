/**
 * lib/plan/postVisit/honestyFirewall.ts
 *   — 評価OS / ②-7: honesty firewall 機械化（false-aliveness / 件数なしスコア / context欠落 / raw PII の pure guard）
 *
 * ★狙い: ③（ranking 反映）へ進む **前の preflight guard** として使える pure helper 群。
 *   「観測不足なのに断定」「evidence 件数なしのスコア」「contextSnapshot 無しの条件付き readout」「raw PII 混入」を機械検出。
 * ★pure・決定論。UI にはまだ出さない・ranking/DB に配線しない。検出と強制（null 化）のみ。
 */

export interface HonestyViolation {
  readonly rule: string;
  readonly detail: string;
}

/** rule1: スコア（値）があるなら evidence 件数 > 0 が必須（件数なし単独スコア禁止）。 */
export function checkScoreHasEvidence(args: { readonly hasScore: boolean; readonly evidenceCount: number }): HonestyViolation | null {
  if (args.hasScore && !(args.evidenceCount > 0)) {
    return { rule: "score_without_evidence", detail: `スコアがあるのに evidenceCount=${args.evidenceCount}（件数なしスコア禁止）` };
  }
  return null;
}

/** rule2: state=insufficient なら値を **強制 null**（断定させない・false-aliveness 防止）。 */
export function enforceInsufficientNull<T>(state: string, value: T | null): T | null {
  return state === "insufficient" ? null : value;
}

/** rule3: 条件付き readout は contextSnapshot 由来の文脈がある時のみ（文脈欠落で条件付きを出さない）。 */
export function checkConditionalHasContext(args: { readonly isConditional: boolean; readonly hasContext: boolean }): HonestyViolation | null {
  if (args.isConditional && !args.hasContext) {
    return { rule: "conditional_without_context", detail: "contextSnapshot 無しで条件付き readout を出そうとした" };
  }
  return null;
}

// ── rule4: raw PII / exact 値の検出（redaction guard 補強）──
/** 構造体で混入を禁じるキー（生 PII / exact 値）。 */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "address", "locationText", "notes", "companions", "companionNames", "rawName", "name",
  "lat", "lng", "latitude", "longitude", "gps", "gpsLat", "gpsLng",
  "gapMinutes", "exactGapMinutes", "dwellMinutes", "exactDwell", "stayMinutes",
]);
/** 文字列に住所/郵便番号らしさがあるか（heuristic）。 */
const POSTAL_RE = /〒?\s*\d{3}-?\d{4}/;
const ADDRESS_RE = /(都|道|府|県).*(区|市|町|村|丁目|番地|\d)/;

/** 任意の値から raw PII / exact 値の混入を検出（pure・shadow guard）。 */
export function detectRawPii(value: unknown, path = "$"): HonestyViolation[] {
  const out: HonestyViolation[] = [];
  if (value == null) return out;
  if (typeof value === "string") {
    if (POSTAL_RE.test(value)) out.push({ rule: "raw_pii_postal", detail: `${path} に郵便番号らしき文字列` });
    if (ADDRESS_RE.test(value)) out.push({ rule: "raw_pii_address", detail: `${path} に住所原文らしき文字列` });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...detectRawPii(v, `${path}[${i}]`)));
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k)) out.push({ rule: "raw_pii_key", detail: `${path}.${k}（禁止キー＝生 PII/exact 値）` });
      out.push(...detectRawPii(v, `${path}.${k}`));
    }
  }
  return out;
}

export interface PreflightInput {
  /** スコア提示の有無と evidence 件数。 */
  readonly score?: { readonly hasScore: boolean; readonly evidenceCount: number };
  /** 条件付き readout かと文脈有無。 */
  readonly conditional?: { readonly isConditional: boolean; readonly hasContext: boolean };
  /** ranking/表示に渡そうとしている payload（raw PII 検出対象）。 */
  readonly payload?: unknown;
}

/**
 * ③（ranking 反映/表示）前の preflight honesty guard（pure）。
 *   全ルール違反を集約。ok=false なら ranking/表示に渡してはいけない。
 */
export function preflightHonesty(input: PreflightInput): { readonly ok: boolean; readonly violations: HonestyViolation[] } {
  const violations: HonestyViolation[] = [];
  if (input.score) {
    const v = checkScoreHasEvidence(input.score);
    if (v) violations.push(v);
  }
  if (input.conditional) {
    const v = checkConditionalHasContext(input.conditional);
    if (v) violations.push(v);
  }
  if (input.payload !== undefined) violations.push(...detectRawPii(input.payload));
  return { ok: violations.length === 0, violations };
}
