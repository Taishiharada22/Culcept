/**
 * leaveByLeakTokens — RD2f-wiring-P1（2026-06-15）: leaveBy 系 internal field の **共有 leak-token list**（pure・const のみ）
 *
 * 正本設計: docs/reality-leaveby-assembly-wiring-rd2f-assembly-wiring-0.md §6
 *
 * 思想: `ern.leaveByComputed`（internal LeaveByComputationV0・exact ISO instant 含む）が client DTO / surface / copy に
 *   万一 serialize された場合に **lowercased JSON 走査で機械検出**するための token 集合。`dogfoodPreview.LEAK_TOKENS` /
 *   `operatorDayPreview.REAL_LEAK_TOKENS` / `surfaceProjection.FORBIDDEN_TOKENS` の 3 つの serialization guard に spread する
 *   （非対称解消・F4）。
 *
 * 選定原則（false positive 回避）:
 *   - **internal-only field 名のみ**を入れる。bare "leaveby" は **入れない**: 既存 `ern.leaveBy`（display RealityAttribute<string>・
 *     現状 null）が `"leaveby":{...}` として正規に serialize され得るため、bare "leaveby" は legit 構造を誤検出する。
 *   - 下記 6 token は `LeaveByComputationV0`（internal）にのみ現れる → safe payload には出ない → false positive なし。
 *   - copySurface.FORBIDDEN_LEXICON は **rendered 日本語 copy 文面**を走査する別レイヤ（既に word-level "leaveby"/"eta" を持つ）
 *     ため、field 名 token は追加しない（copy 文面に field 名は現れない）。
 *
 * 全 token は lowercase（guard 側が JSON.stringify(payload).toLowerCase() で比較）。
 */
export const LEAVEBY_LEAK_TOKENS: ReadonlyArray<string> = [
  "leavebycomputed",
  "leavebyinstant",
  "arrivaltargetinstant",
  "timecontract",
  "sourcetimeestimateref",
  "bufferref",
];
