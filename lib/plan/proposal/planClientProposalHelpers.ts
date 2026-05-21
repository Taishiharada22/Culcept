/**
 * PlanClient Proposal Helpers — Phase 3-J-6e-1。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §0.4 Phase 3 解決 3 軸 / §10.2 Smoke 21
 *
 * 役割:
 *   PlanClient (= 本格 state 接続 layer) で computeProposals を呼ぶための
 *   pure helper 群。 PlanClient は本 helper を経由することで
 *   computeProposals 入力を整形する責務だけを持つ (= helper 自体は副作用なし)。
 *
 *   J-6e-1 では **proposal の表示まで**。 accept / modify / dismiss の wiring は
 *   J-6e-2/3/4 で順次着手。
 *
 * 不変原則:
 *   - pure (= 副作用なし、 input mutate なし)
 *   - localStorage 直接 access しない (= PlanClient 側で storage adapter 経由)
 *   - TestOverrideContext production import 禁止 (= 本 file は production helper)
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import type { ProposedAnchor } from "./proposalTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// firstUseDate proxy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * anchor の最古 confirmedAt を firstUseDate (= "YYYY-MM-DD") として返す。
 *
 * 設計思想:
 *   - 本来 firstUseDate は user の Plan 初回利用日 (= 利用開始の真値)
 *   - 但し本 commit (J-6e-1) では localStorage write 禁止のため、 真値を保存できない
 *   - 代替: 最古 anchor.confirmedAt を proxy (= user が Plan を **使い始めた時刻**)
 *   - anchor が 0 件 → fallback = `nowIso` (= 今日、 Onboarding Quietude active = silent)
 *
 * 性質:
 *   - production 環境: user が anchor を持ち始めて 8 日経過 → Onboarding Quietude 解除
 *   - 新規 user (anchor 0): silent (= 自然な cold start 尊重、 Invariant 36)
 *   - 既存 user (anchor あり): 最古 anchor を基準に経過日数判定
 *
 * 注意:
 *   - nowIso は ISO 8601 (= "YYYY-MM-DDTHH:mm:ss.sssZ") を期待
 *   - 出力は ISO 日付 ("YYYY-MM-DD")
 *
 * @param anchors - 全 anchor list
 * @param nowIso - 現在時刻 ISO 8601 (= anchor 0 件時の fallback 用)
 * @returns "YYYY-MM-DD" 形式の firstUseDate
 */
export function computeFirstUseDateFromAnchors(
  anchors: ReadonlyArray<ExternalAnchor>,
  nowIso: string,
): string {
  if (anchors.length === 0) {
    // 新規 user → 今日 fallback (= Onboarding Quietude active = silent)
    return toDateOnly(nowIso) ?? "1970-01-01";
  }

  // confirmedAt 最古を抽出
  let oldest: string | null = null;
  for (const a of anchors) {
    if (typeof a.confirmedAt !== "string" || a.confirmedAt.length === 0) continue;
    if (oldest === null || a.confirmedAt < oldest) {
      oldest = a.confirmedAt;
    }
  }

  if (oldest === null) {
    return toDateOnly(nowIso) ?? "1970-01-01";
  }

  return toDateOnly(oldest) ?? "1970-01-01";
}

/**
 * ISO 8601 datetime string から "YYYY-MM-DD" 部分を抽出。 不正なら null。
 */
function toDateOnly(iso: string): string | null {
  // "YYYY-MM-DD..." の prefix 10 文字を返す (= "YYYY-MM-DDT..." or "YYYY-MM-DD")
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// proposalsByDate map 構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ProposedAnchor[] を date 単位で group 化する。
 *
 * 規約:
 *   - draft.date が "YYYY-MM-DD" string の proposal のみ取込
 *   - draft.date 不在 / 非 string → skip (= silent)
 *   - 同 date に複数 proposal → 順序維持で配列
 *   - 入力順を保つ (= computeProposals 上流で sort 済 = confidence desc + evidence desc)
 *
 * UI 側 (= CalendarTab / MapTab) の selectFirstProposalForDate は先頭を取るので、
 * sort 順がそのまま 「max 1 chip / day」 の優先順位になる。
 */
export function groupProposalsByDate(
  proposals: ReadonlyArray<ProposedAnchor>,
): Record<string, ProposedAnchor[]> {
  const map: Record<string, ProposedAnchor[]> = {};
  for (const p of proposals) {
    const date = p.draft.date;
    if (typeof date !== "string" || date.length === 0) continue;
    if (!map[date]) map[date] = [];
    map[date].push(p);
  }
  return map;
}
