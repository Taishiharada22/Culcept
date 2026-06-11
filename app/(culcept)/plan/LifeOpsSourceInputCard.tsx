"use client";
/**
 * /plan — A-4-c33 Life Ops Structured Source Input Card（**staging gated・deadline first・候補 card とは独立**）
 *
 * 設計: docs/life-ops-source-input-ui-a4-c33-mini-design.md（§1-2）
 *
 * 役割: 「生活まわりを登録」の最小入口。**source 0 件（候補 card null）でも表示される**＝初回登録の bootstrap。
 *   種類 = 辞書 money_admin group 由来の enum picker（表示名は辞書 label）・期限日 = date input・[登録] のみ。
 *
 * 厳守:
 *   - **自由文入力欄を持たない**（text/textarea/title/memo/note/placeQuery 等が構造的に不存在・render lock）。
 *     入力要素は select / date / hidden(sourceType) のみ。
 *   - client から送るのは sourceType/categoryId/dueDateISO（+将来 menu）だけ（occurrence/confidence/status/user_id の field なし）。
 *   - presentational（useState/fetch/onClick なし・form + server action submit のみ）。390px: flex-wrap。
 */

export type LifeOpsSourceInputResultToken = "ok" | "already_exists" | "invalid" | "gate_off" | "denied";
const INPUT_MESSAGES: Record<LifeOpsSourceInputResultToken, string> = {
  ok: "登録しました。生活まわりの提案に反映します。",
  already_exists: "同じ期限はすでに登録されています。",
  invalid: "期限日を確認してください。",
  gate_off: "登録は実行されていません（設定が無効です）",
  denied: "操作できません（ログインが必要です）",
};

export function LifeOpsSourceInputCard({
  categories,
  inputAction,
  result,
}: {
  /** 辞書 money_admin group 由来（server が listLifeOpsDeadlineInputCategories で導出して渡す）。 */
  categories: readonly { readonly id: string; readonly label: string }[];
  inputAction: (formData: FormData) => Promise<void>;
  result?: LifeOpsSourceInputResultToken;
}) {
  return (
    <section className="mb-3 rounded-xl border border-sky-200 bg-sky-50/40 px-4 py-3" data-testid="lifeops-source-input-card">
      <h2 className="text-[13px] font-bold text-sky-900">生活まわりを登録</h2>
      <form action={inputAction} className="mt-2 flex flex-wrap items-center gap-2" data-testid="lifeops-source-input-form">
        <input type="hidden" name="sourceType" value="deadline" />
        <label className="text-[11px] text-gray-600">
          種類
          <select name="categoryId" required className="ml-1 rounded border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-800">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-gray-600">
          期限日
          <input type="date" name="dueDateISO" required className="ml-1 rounded border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-800" />
        </label>
        <button type="submit" className="rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[11px] leading-none text-sky-700" data-testid="lifeops-source-input-submit">
          登録
        </button>
      </form>
      <p className="mt-1.5 text-[10px] text-gray-500" data-testid="lifeops-source-input-footnote">
        予定には追加しません。生活提案の材料として使います。
      </p>
      {result && (
        <p
          className={`mt-1 text-[11px] ${result === "ok" ? "font-bold text-emerald-700" : "text-amber-700"}`}
          data-testid="lifeops-source-input-result"
          data-result-kind={result === "ok" ? "success" : "notice"}
        >
          {INPUT_MESSAGES[result]}
        </p>
      )}
    </section>
  );
}
