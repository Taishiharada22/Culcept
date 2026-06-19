/**
 * AlterDevDepartureLineTimestamp — RD3g-P2（2026-06-19）: dev-only departure HH:MM timestamp band。
 *
 * Gate B 全 AND を満たした computed leaveBy の leaveByInstant から **HH:MM のみ**（日付・秒・TZ offset なし）を受け取り、
 * dev 観測バンドとして表示する。null の場合は「なし」と表示する。
 *
 * 厳守:
 *  - boolean props または string | null のみ受け取る（内部 LeaveByComputationV0 object を受け取らない）。
 *  - full ISO instant / 出発時刻 / 間に合う / 遅れる / 必ず / 保証 等の確定 copy を DOM に出さない。
 *  - dev 観測のみ（product /plan 本線・Alter 本線・notification・action に接続しない）。
 */

export function AlterDevDepartureLineTimestamp({ timestamp }: { timestamp: string | null }) {
  return (
    <div className="border-b border-purple-200 bg-purple-50/70 px-3 py-1.5" data-testid="alter-dev-departure-line-timestamp">
      <p className="text-[10px] text-purple-700" data-testid="alter-dev-departure-line-timestamp-value">
        出発候補時刻: {timestamp ?? "なし"}（dev観測のみ・Alter）
      </p>
    </div>
  );
}
