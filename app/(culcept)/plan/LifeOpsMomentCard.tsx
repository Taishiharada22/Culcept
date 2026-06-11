"use client";
/**
 * /plan — A-4-c39 Life Ops Moment Read-only Surface（「今の一枚」・**純 read-only・最大 1 件**）
 *
 * 設計: docs/life-ops-moment-readonly-surface-a4-c39-mini-design.md
 *
 * 役割: 既存 Life Ops Moment VM（compute 済み）の **surfaced を read-only で表示するだけ**の小 card。
 *   focus/recovery 沈黙・Morning 代表との重複制御・cap 1 は VM 側で済んでおり、本 component は表示のみ。
 *
 * 厳守:
 *   - **page が surfaced 非 null の時だけ渡す**＝本 component に届いた時点で必ず表示対象（沈黙時は呼ばれない）。
 *   - 表示は **phrase + cautions のみ**（kind/suppression/silencedCount は受け取らない＝props に存在しない）。
 *   - **button/form/link/onClick ゼロ**（純観測面・disabled chip も置かない）。
 *   - **R4 / writer / server action / notification / timer / polling の import ゼロ**（presentational のみ）。
 */

export function LifeOpsMomentCard({
  moment,
}: {
  /** page が surfaced から抽出（phrase は label 内包の完成文・cautions は VM 由来固定句）。 */
  moment: { readonly phrase: string; readonly cautions: readonly string[] };
}) {
  return (
    <section className="mb-3 rounded-xl border border-violet-200 bg-violet-50/40 px-4 py-3" data-testid="lifeops-moment-card">
      <h2 className="text-[13px] font-bold text-violet-900">今の一枚</h2>
      <p className="mt-1 text-[12px] text-gray-800" data-testid="lifeops-moment-phrase">
        {moment.phrase}
      </p>
      {moment.cautions.length > 0 && (
        <ul className="mt-1 space-y-0.5" data-testid="lifeops-moment-cautions">
          {moment.cautions.map((c, i) => (
            <li key={i} className="text-[10px] text-gray-500">
              ・{c}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
