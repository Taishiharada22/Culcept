/**
 * C Tier1-A — Safe Travel Link helper（**pure・inert metadata のみ・href/生成/fetch なし**）
 *
 * 設計正本: docs/t11-c-tier1-safe-links-maps-url-design.md（§6/§11 + CEO 補正）
 *
 * 役割: user/manual URL を **inert metadata** として安全に保持し、confirmed destination/entity に基づく
 *   eligibility を付すだけ。**fetch/read/scrape/正規化/Maps 生成/href/外部遷移を一切しない**。
 *
 * ★ premise note（①）: CEO は input に `destinationConfirmed: boolean` を示唆したが、eligibility は
 *   `ineligible_unconfirmed` と `ineligible_no_destination` の 2 値を区別する必要があるため、boolean でなく
 *   **`destinationStatus: confirmed|unconfirmed|missing`**（provider の 3 状態と整合）を採る。
 *
 * 厳守:
 *   - syntactic check のみ（trim + `^https?://` 判定）。**URL を fetch/read/scrape/正規化しない**。
 *   - **Maps URL を生成しない**・**href にしない**・**official site を推定しない**・availability/price/cancellation を推定しない。
 *   - confirmed destination or confirmed entity が無ければ **ineligible**（出す判断材料のみ）。
 *   - **private red_line/preference・raw userId・M2/Stargazer を URL に入れない**（そもそも URL を構築しない＝user URL を inert carry）。
 *   - fetch/API/DB/Supabase/Maps・Places/web search/M2/CoAlter/`/talk`/app・UI を import しない。
 */

import type {
  SafeTravelLinkEligibility,
  SafeTravelLinkIntent,
  SafeTravelLinkSource,
} from "./safe-link-types";

export interface BuildSafeTravelLinkInput {
  /** inert 外部 URL（href にしない・fetch しない）。field 名で inert を明示。 */
  inertUrl: string;
  source: SafeTravelLinkSource;
  label: string;
  /** provider 3 状態（confirmed のみ eligible 候補）。 */
  destinationStatus: "confirmed" | "unconfirmed" | "missing";
  /** 任意・明示束縛された entity が confirmed か。 */
  entityConfirmed?: boolean;
}

/** http(s) のみ許可（syntactic・fetch しない）。空白・非 http は不可。 */
function isSyntacticHttpUrl(raw: string): boolean {
  return /^https?:\/\/\S+$/.test(raw) && !/\s/.test(raw);
}

/**
 * inert safe-link intent を組む（**href/生成/fetch なし**）。
 *   - 空/非文字列 → null。
 *   - 非 http(s) → eligibility `invalid_url`（inert carry・href にしない）。
 *   - valid http(s) → confirmed(destination or entity)→`eligible` / missing→`ineligible_no_destination` / 他→`ineligible_unconfirmed`。
 */
export function buildSafeTravelLinkIntent(input: BuildSafeTravelLinkInput): SafeTravelLinkIntent | null {
  if (!input || typeof input.inertUrl !== "string") return null;
  const value = input.inertUrl.trim();
  if (value.length === 0) return null;

  const inertBase = {
    source: input.source,
    label: input.label,
    inert: true as const,
    actionable: false as const,
    rendered: false as const,
    fetched: false as const,
  };

  // 非 http(s)（syntactic）→ invalid_url（inert・href にしない・実行しない）
  if (!isSyntacticHttpUrl(value)) {
    return { ...inertBase, externalReference: { kind: "url", value, inert: true }, eligibility: "invalid_url" };
  }

  // valid http(s)：confirmed destination or entity でのみ eligible。proposed/unconfirmed/missing は ineligible。
  let eligibility: SafeTravelLinkEligibility;
  if (input.destinationStatus === "confirmed" || input.entityConfirmed === true) {
    eligibility = "eligible";
  } else if (input.destinationStatus === "missing") {
    eligibility = "ineligible_no_destination";
  } else {
    eligibility = "ineligible_unconfirmed";
  }

  return { ...inertBase, externalReference: { kind: "url", value, inert: true }, eligibility };
}
