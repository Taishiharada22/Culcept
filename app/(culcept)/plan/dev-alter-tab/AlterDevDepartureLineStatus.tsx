/**
 * AlterDevDepartureLineStatus — RD3g-P1: **L2 dev-only departure line candidate** の safe boolean 表示（dev-only・presentational）
 *
 * 正本設計: docs/reality-departure-line-boundary-design-rd3g-0.md（RD3g-P1・L2 dev-only preview）
 *
 * 厳守:
 *   - **schema-state boolean のみ**表示（`departureLineCandidatePresent`・Gate B presence）。**exact timestamp / 出発時刻 /
 *     間に合う / 遅れる / 必ず / 保証 / departure line そのものは出さない**（props は boolean だけ・internal object/ref/instant を受け取らない）。
 *   - 文言は `内部出発線候補`（user-facing 文言にしない・出発目安/HH:MM は出さない）。
 *   - dev-only（page の三重ガード + 専用 flag realityOperatorDepartureLinePreview の下流）。product `/plan` 本線・Alter 本線には出さない。
 *   - read-only / no-action（onClick/送信/書込/通知/予約なし・presentational のみ）。
 */

export function AlterDevDepartureLineStatus({ present }: { present: boolean }) {
  return (
    <div className="border-b border-sky-200 bg-sky-50/70 px-3 py-1.5" data-testid="alter-dev-departure-line-status">
      <p className="text-[10px] text-sky-700" data-testid="alter-dev-departure-line-candidate-present">
        内部出発線候補: {present ? "あり" : "なし"}（dev観測のみ・Alter）
      </p>
    </div>
  );
}
