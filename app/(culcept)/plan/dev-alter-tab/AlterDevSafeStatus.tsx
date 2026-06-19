/**
 * AlterDevSafeStatus — RD3x-P6: Alter dev-only **safe boolean status** 表示（dev-only・presentational）
 *
 * 正本設計: docs/reality-staging-dogfood-activation-rd3x-activate-0.md / CEO RD3x-P6 GO
 *
 * 厳守:
 *   - **schema-state boolean のみ**表示（`leaveByComputedPresent`）。**exact timestamp / 出発時刻 / 間に合う / 遅れる /
 *     departure line は出さない**（props は boolean だけ・internal object/ref を受け取らない）。
 *   - dev-only（page の三重ガード + flag の下流）。product `/plan` 本線・Alter 本線には出さない。
 *   - read-only / no-action（onClick/送信/書込/通知なし・presentational のみ）。
 */

export function AlterDevSafeStatus({ present }: { present: boolean }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50/70 px-3 py-1.5" data-testid="alter-dev-safe-status">
      <p className="text-[10px] text-amber-700" data-testid="alter-dev-leaveby-computed-present">
        内部計算オブジェクト: {present ? "あり" : "なし"}（dev観測のみ・Alter）
      </p>
    </div>
  );
}
