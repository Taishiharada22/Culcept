# Life Ops L-3 — Candidate Engine mini-design【設計監査ゲート・自律実装しない】

> 2026-06-09 / Life Ops 縦トラック（branch `claude/life-ops-vertical`）
> 参照: `docs/life-ops-boundary-and-handoff.md` §2 L-3・§4 統合契約・§5 / Appendix A.3・A.7 / L-1・L-2 mini-design。
> **停止理由**: L-3 は「何を提案するか」＝体験直結 + 横エンジン(R2/R4)接続 + データ源 が絡む。CEO 方針「L-3 手前で設計監査」。
> **CEO 監査承認（2026-06-09）**: ①候補化閾値＝**beyond_typical 以上（控えめ）** ／ ③データ源＝**当面テスト注入で pure 先行**（新規収集なし）。②permissionLevelHint・④R2 は返すだけ＝提案で進行。
> → **pure 候補生成（注入データ）だけ実装可**。R2 接続(④)・実データ源(③)・L-4 イベント根拠は引き続き別 slice/調整。

---

## 0. 一行
L-3 は L-1 カテゴリ × L-2 経過段階から「**そろそろ整えどきの候補**」を `LifeOpsCandidate[]`（§4）に組み、横 R2/R4 に渡す。場所/移動/配置/trigger/イベント根拠は持たない。

## 1. ゴールから逆算（最終体験の分解と L-3 の持ち分）
最終体験例（A.7）「前回カットから31日。今週金曜新宿通過で移動最小。来週人と会うので今週中に整えると印象維持ライン」を分解:
| 要素 | 担当 |
|---|---|
| 「前回カットから31日・標準約42日」（周期根拠） | **L-3（dueReason=cycle）** |
| 「今週金曜新宿通過で移動最小」（場所/移動/配置） | **横 R2 + 場所軸**（L-3 は知らない） |
| 「来週人と会うので今週中に」（イベント近接） | **L-4 予定前準備**（L-3 は周期のみ） |
| 「印象維持ライン」（中立表現） | L-2 phase の presenter（L-8/横） |
→ L-3 の持ち分は **周期由来の候補生成だけ**。残りは横/L-4 が重ねる（§4）。

## 2. スコープ
**作る（pure）**: cadence observation(注入) → `computeCadenceStatus`(L-2) → 閾値で候補化 → `LifeOpsCandidate[]`。
**作らない**: イベント根拠(L-4) / 場所・移動・suggestedWindow 確定(横 R2) / 配置・trigger(横 R2/R4) / lastCompletedAt の**収集源**（別 slice・監査） / UI(L-8) / 予約(L-6)。

## 3. LifeOpsCandidate 型（§4 契約の具体化・提案）
```ts
import type { LifeOpsCategoryId, LifeOpsDefaultMaxLevelHint, LifeOpsRiskFlag } from "./category-model";
import type { BeautyMenu, CadencePhase } from "./cadence-model";

/** 周期由来の due 根拠（**事実のみ**・「行くべき」を持たない）。event 根拠は L-4 が別途付与。 */
export interface CycleDueReason {
  readonly kind: "cycle";
  readonly elapsedDays: number;
  readonly typicalIntervalDays: number;
  readonly phase: CadencePhase; // nearing/beyond_typical/well_beyond のみ候補化対象
}

/** §4 candidate。横エンジンが配置・trigger・場所解決する入力。 */
export interface LifeOpsCandidate {
  readonly category: LifeOpsCategoryId;
  readonly menu: BeautyMenu | null;
  readonly dueReason: CycleDueReason;            // L-3 は cycle のみ
  readonly suggestedWindow: null;                // L-3 は決めない（横 R2 が予定/移動から）。契約のため型保持
  readonly placeQuery: string | null;            // L-1 placeQueryHint をそのまま
  readonly permissionLevelHint: LifeOpsDefaultMaxLevelHint; // L-1 hint。**確定は L-7**（命名で非正本を明示）
  readonly riskFlags: readonly LifeOpsRiskFlag[];// L-1 typicalRiskFlags をそのまま
}
```
※ §4 原文は `permissionLevel`。L-1/R5/L-7 の二重定義誤認を防ぐため **`permissionLevelHint`** に命名（監査ポイント②）。

## 4. 候補生成ロジック（断定しない・控えめ）
```
入力: { categoryId, menu, lastCompletedAtISO|null }[]（注入）+ nowISO
各観測について:
  spec = getCadenceSpec(categoryId, menu)（無ければ skip）
  status = computeCadenceStatus(spec, lastCompletedAtISO, nowISO)
  status.phase が candidate 化閾値以上 → LifeOpsCandidate を組む（spec/L-1 から placeQuery/risk/level hint を写す）
  unknown / within_typical → 候補にしない（断定しない・履歴なしで急かさない）
出力: LifeOpsCandidate[]（phase 強い順 or 定義順）
```
- **候補化閾値（提案・控えめ）**: `beyond_typical` 以上。`nearing` は L-4 イベント近接と重なった時のみ前倒し（L-4 統合後）。＝出しすぎない安全側。
- dueReason は事実（経過/標準/phase）。「行け」judgment は付けない（L-3 は候補の種を出すだけ）。

## 5. §4 横エンジン接続（再実装しない）
- L-3 は `LifeOpsCandidate[]` を**返すだけ**。**R2 が** memory/予定/移動から配置・suggestedWindow 確定・3 案化。**R4 が** trigger 発火・通知内容。**場所解決**は場所軸。
- L-3 は記憶/配置/trigger/場所の machinery を**作らない・import しない**（§4 厳守）。

## 6. 監査ポイント（CEO 判断を仰ぐ・実装前に確定したい）
1. **候補化の積極性**: `beyond_typical` 以上（控えめ・推奨）か、`nearing` から（先回り強め）か。プロダクト体験の積極度。
2. **permissionLevel の扱い**: L-3 は `permissionLevelHint` を運ぶだけ／確定は L-7、で良いか（§4 原文 `permissionLevel` の解釈）。
3. **lastCompletedAt のデータ源（最重要）**: 「前回いつ行ったか」をどこから得るか。(a) ユーザー記録（L0・新規 UI）/ (b) 既存 calendar の予定タイトル推定 / (c) 当面はテスト注入のみで pure ロジック先行。→ (a)(b) は新規データ収集 or 外部依存で **CEO ゲート/別監査**。
4. **横 R2 への受け渡し API**: `LifeOpsCandidate[]` を R2 のどの入口に渡すか（本流セッションと契約擦り合わせ・二重実装回避）。

## 7. なぜここで止まるか
①体験直結（何を・どの積極度で提案するか）②横 R2/R4 接続契約 ③データ源（新規収集＝CEO ゲート）── いずれも自律範囲外。**監査・承認後に L-3 実装**（pure 部分: 候補生成ロジック → unit test → tsc → commit）。データ源(3)と R2 接続(4)は別 slice で本流と調整。

---
**停止**: L-1・L-2 は実装着地。L-3 は本 mini-design で停止し、§6 の 1〜4 の判断を待つ。
