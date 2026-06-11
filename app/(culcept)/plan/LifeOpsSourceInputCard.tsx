"use client";
/**
 * /plan — A-4-c33/c34 Life Ops Structured Source Input Card（**staging gated・期限+周期・候補 card とは独立**）
 *
 * 設計: docs/life-ops-source-input-ui-a4-c33-mini-design.md / docs/life-ops-cadence-input-ui-a4-c34-mini-design.md
 *
 * 役割: 「生活まわりを登録」の最小入口。**source 0 件（候補 card null）でも表示される**＝初回登録の bootstrap。
 *   c34: 種類 switcher（client state）は置かず、**期限 form と周期 form を縦に並べる**（presentational 維持・JS 不要）。
 *
 * 厳守:
 *   - **自由文入力欄を持たない**（text/textarea/title/memo/note/placeQuery 等が構造的に不存在・render lock）。
 *     入力要素は select / date / number / hidden のみ。
 *   - 期限 form: categoryId+dueDateISO。周期 form: cadenceOption（`cadenceKey()` 形式・**L-2 spec 実在 5 組のみ**）+
 *     lastCompletedAtISO（必須）+ typicalIntervalDays（任意・1..730）。occurrence/confidence/status/user_id の field なし。
 *   - presentational（useState/fetch/onClick なし・form + server action submit のみ）。390px: flex-wrap。
 */

export type LifeOpsSourceInputResultToken = "ok" | "already_exists" | "invalid" | "gate_off" | "denied";
export type LifeOpsSourceInputSourceType = "deadline" | "cadence";

/** type 共通文言。 */
const COMMON_MESSAGES: Partial<Record<LifeOpsSourceInputResultToken, string>> = {
  ok: "登録しました。生活まわりの提案に反映します。",
  gate_off: "登録は実行されていません（設定が無効です）",
  denied: "操作できません（ログインが必要です）",
};
/** type 別文言（duplicate/validation・A-4-c34）。 */
const TYPED_MESSAGES: Record<LifeOpsSourceInputSourceType, Partial<Record<LifeOpsSourceInputResultToken, string>>> = {
  deadline: {
    already_exists: "同じ期限はすでに登録されています。",
    invalid: "期限日を確認してください。",
  },
  cadence: {
    already_exists: "同じ周期はすでに登録されています。",
    invalid: "前回の日付を確認してください。",
  },
};

export function LifeOpsSourceInputCard({
  categories,
  cadenceOptions,
  inputAction,
  result,
  resultSourceType = "deadline",
}: {
  /** 期限 picker（辞書 money_admin group 由来・server が導出して渡す）。 */
  categories: readonly { readonly id: string; readonly label: string }[];
  /** 周期 picker（L-2 listMvpCadences 由来・server が導出して渡す）。 */
  cadenceOptions: readonly { readonly value: string; readonly label: string }[];
  inputAction: (formData: FormData) => Promise<void>;
  result?: LifeOpsSourceInputResultToken;
  /** result の出どころ（page が allowlist 検証済み・文言の出し分けにのみ使用）。 */
  resultSourceType?: LifeOpsSourceInputSourceType;
}) {
  const message = result ? (COMMON_MESSAGES[result] ?? TYPED_MESSAGES[resultSourceType][result]) : undefined;
  return (
    <section className="mb-3 rounded-xl border border-sky-200 bg-sky-50/40 px-4 py-3" data-testid="lifeops-source-input-card">
      <h2 className="text-[13px] font-bold text-sky-900">生活まわりを登録</h2>

      {/* 期限（A-4-c33・不変） */}
      <form action={inputAction} className="mt-2 flex flex-wrap items-center gap-2" data-testid="lifeops-source-input-form">
        <input type="hidden" name="sourceType" value="deadline" />
        <span className="text-[11px] font-medium text-sky-800">期限</span>
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

      {/* 周期（A-4-c34・lastCompletedAt 必須・interval 任意=L-9 予約） */}
      <form action={inputAction} className="mt-2 flex flex-wrap items-center gap-2" data-testid="lifeops-cadence-input-form">
        <input type="hidden" name="sourceType" value="cadence" />
        <span className="text-[11px] font-medium text-sky-800">周期</span>
        <label className="text-[11px] text-gray-600">
          対象
          <select name="cadenceOption" required className="ml-1 rounded border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-800">
            {cadenceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-gray-600">
          前回やった日
          <input type="date" name="lastCompletedAtISO" required className="ml-1 rounded border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-800" />
        </label>
        <label className="text-[11px] text-gray-600">
          周期日数（任意）
          <input
            type="number"
            name="typicalIntervalDays"
            min={1}
            max={730}
            step={1}
            className="ml-1 w-16 rounded border border-sky-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-800"
          />
        </label>
        <button type="submit" className="rounded-full border border-sky-300 bg-white px-2 py-0.5 text-[11px] leading-none text-sky-700" data-testid="lifeops-cadence-input-submit">
          登録
        </button>
      </form>

      <p className="mt-1.5 text-[10px] text-gray-500" data-testid="lifeops-source-input-footnote">
        予定には追加しません。生活提案の材料として使います。
      </p>
      {result && message && (
        <p
          className={`mt-1 text-[11px] ${result === "ok" ? "font-bold text-emerald-700" : "text-amber-700"}`}
          data-testid="lifeops-source-input-result"
          data-result-kind={result === "ok" ? "success" : "notice"}
        >
          {message}
        </p>
      )}
    </section>
  );
}
