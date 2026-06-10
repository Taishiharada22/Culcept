"use client";
/**
 * /plan — A-4-c23 Life Ops Mainline Minimal Card（**staging gated・presentational・最小**）
 *
 * 設計: docs/life-ops-mainline-minimal-card-a4-c23-mini-design.md（§2/§4/§5）
 *
 * 役割: 本線「生活まわり」card。headline + Morning 代表 ≤3 + rail（後で/不要/完了※）だけを表示する。
 *   card prop が無ければ何も描かない（gate OFF/候補 0 → 構造的に不在）。
 *
 * 厳守:
 *   - **本線文言**（「予定には追加しません」「生活提案の学習にだけ使います」「完了にすると、しばらくこの提案を控えます」軸）。
 *     「preview 限定」「本線には反映されません」は使わない。
 *   - presentational（useState/fetch/onClick なし・form + server action submit のみ）。done は 2 段階（rail は confirm field なし）。
 *   - mobile 390px: rail は flex-wrap + compact chip（折返し許容）。
 *   - handle/raw/internal counts/flag 名/source 名は受け取らず・表示しない（DTO が構造的に持たない）。
 */
import type { LifeOpsMainlineCardDto } from "@/lib/plan/reality/lifeops/lifeops-mainline-card";

export type LifeOpsMainlineResultToken = "ok" | "ok_done" | "gate_off" | "duplicate_cooldown" | "insert_failed" | "invalid" | "denied";
const MAINLINE_MESSAGES: Record<LifeOpsMainlineResultToken, string> = {
  ok: "記録しました。予定には追加しません（生活提案の学習にだけ使います）",
  ok_done: "完了を記録しました。しばらくこの提案を控えます（予定には追加しません）",
  gate_off: "記録は実行されていません（設定が無効です）",
  duplicate_cooldown: "少し前に同じ記録があります（重複防止のため記録しませんでした）",
  insert_failed: "記録できませんでした",
  invalid: "この操作は受け付けられませんでした（候補が変わったか、無効な操作です）",
  denied: "操作できません（ログインが必要です）",
};

export function LifeOpsMainlineCard({
  card,
  feedbackAction,
  actionResult,
  pendingDone,
}: {
  card: LifeOpsMainlineCardDto;
  feedbackAction: (formData: FormData) => Promise<void>;
  actionResult?: LifeOpsMainlineResultToken;
  pendingDone?: { readonly candidateKey: string; readonly label: string };
}) {
  return (
    <section className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3" data-testid="lifeops-mainline-card">
      <h2 className="text-[13px] font-bold text-emerald-900">生活まわり</h2>
      <p className="mt-1 text-[12px] text-gray-800">{card.headline}</p>

      <ul className="mt-2 space-y-1.5">
        {card.items.map((item) => (
          <li key={item.candidateKey} className="text-[12px] text-gray-800">
            <span className="font-medium">{item.label}</span>
            <span className="ml-1 text-[11px] text-gray-500">{item.phrase}</span>
            {/* rail: 後で/不要 は即時 submit・完了※ は stage-1（confirm field なし＝押しても記録されず確認へ） */}
            <form action={feedbackAction} className="mt-0.5 inline-flex flex-wrap items-center gap-1" data-testid="lifeops-mainline-rail">
              <input type="hidden" name="candidateKey" value={item.candidateKey} />
              {item.actions.map((a) =>
                a.requiresConfirmation ? (
                  <button
                    key={a.action}
                    type="submit"
                    name="action"
                    value={a.action}
                    data-testid="lifeops-mainline-stage1"
                    className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] leading-none text-amber-800"
                  >
                    {a.uiLabel}※
                  </button>
                ) : (
                  <button
                    key={a.action}
                    type="submit"
                    name="action"
                    value={a.action}
                    data-testid="lifeops-mainline-button"
                    className="rounded-full border border-emerald-300 bg-white px-1.5 py-0.5 text-[10px] leading-none text-emerald-700"
                  >
                    {a.uiLabel}
                  </button>
                ),
              )}
            </form>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[10px] text-gray-500" data-testid="lifeops-mainline-footnote">
        ※完了は実際に終わった時だけ。予定には追加せず、次回以降の提案調整に使います。
      </p>

      {/* A-4-c24: 成功（ok/ok_done）だけ成功色。duplicate/invalid 等は amber・非 bold＝過剰な成功表示を出さない */}
      {actionResult && (
        <p
          className={`mt-1 text-[11px] ${actionResult === "ok" || actionResult === "ok_done" ? "font-bold text-emerald-700" : "text-amber-700"}`}
          data-testid="lifeops-mainline-result"
          data-result-kind={actionResult === "ok" || actionResult === "ok_done" ? "success" : "notice"}
        >
          {MAINLINE_MESSAGES[actionResult]}
        </p>
      )}

      {/* done 明示確認（c18 PRG 2 段階・stage-2 form だけが confirm field を持つ・戻る=plain link） */}
      {pendingDone && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2" data-testid="lifeops-mainline-done-confirm">
          <p className="text-[12px] font-bold text-amber-800">「{pendingDone.label}」を完了として記録しますか？</p>
          <p className="mt-0.5 text-[11px] text-amber-700">完了にすると、しばらくこの提案を控えます。予定には追加しません。</p>
          <div className="mt-1.5 flex items-center gap-2">
            <form action={feedbackAction} className="inline-flex">
              <input type="hidden" name="candidateKey" value={pendingDone.candidateKey} />
              <input type="hidden" name="confirm" value={`done:${pendingDone.candidateKey}`} />
              <button
                type="submit"
                name="action"
                value="done"
                data-testid="lifeops-mainline-done-confirm-submit"
                className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[11px] font-bold leading-none text-amber-900"
              >
                記録する
              </button>
            </form>
            <a href="/plan" data-testid="lifeops-mainline-done-confirm-cancel" className="text-[11px] text-gray-500 underline">
              戻る
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
