/**
 * C Tier1-A — Safe Travel Link 型（**pure types only・inert metadata のみ**）
 *
 * 設計正本: docs/t11-c-tier1-safe-links-maps-url-design.md（§3 Tier1-A・§11 + CEO 補正: inert を型で明示）
 *
 * 役割: user/manual 由来の外部 URL を **inert metadata**（href にしない・fetch しない・生成しない）として保持し、
 *   confirmed destination/entity に基づく eligibility を持たせるだけの型。
 *
 * ★ inert を型表面で明示（rendered/fetched だけに頼らない）:
 *   - `inert: true` / `actionable: false`
 *   - 外部参照は `externalReference.value`（**`url` という field 名を使わない**＝href 化を誘発しない）
 *   - **持たない**: href / generatedUrl / booking / live price・availability / cancellation /
 *     private user state(red_line/preference) / M2/Stargazer / raw userId。
 */

export type SafeTravelLinkSource = "user_provided" | "manual_official" | "manual_maps";

export type SafeTravelLinkEligibility =
  | "eligible" // confirmed destination or confirmed entity・valid url
  | "ineligible_unconfirmed" // destination は在るが confirmed でない
  | "ineligible_no_destination" // destination が無い
  | "invalid_url"; // 非 http(s) 等の syntactic 不正（inert で carry・href にしない）

/** inert 外部参照（href にしない・fetch しない・改変しない）。field 名で inert を明示。 */
export interface SafeTravelExternalReference {
  kind: "url";
  /** ★ inert value（href にしない・取得しない・そのまま carry）。`url` でなく `value`。 */
  value: string;
  inert: true;
}

/** 中立診断（任意・private/url 生値を含めない）。 */
export interface SafeTravelLinkDiagnostic {
  eligibility: SafeTravelLinkEligibility;
  reason?: string;
}

/** ★ inert safe-link metadata（Tier1-A）。href/生成/外部遷移を**構造的に持たない**。 */
export interface SafeTravelLinkIntent {
  source: SafeTravelLinkSource;
  /** inert 外部参照（href field を持たない） */
  externalReference: SafeTravelExternalReference;
  /** 表示ラベル（中立・予約語を含まない＝caller 責務） */
  label: string;
  eligibility: SafeTravelLinkEligibility;
  /** ★ 明示 inert markers（rendered/fetched だけに頼らない） */
  inert: true;
  actionable: false;
  rendered: false;
  fetched: false;
  // 非所持（意図的欠落）: href / generatedUrl / booking / calendar / action /
  //   livePrice / availability / cancellation / redLine / preference / m2 / stargazer / userId
}
