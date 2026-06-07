# A0-1 — reason → local insight（pure / readiness layer）closeout

> 2026-06-08 / Build Unit / 自律バッチ（CEO 方向確定: 魂継続・補正: UI まで自律しない・pure/readiness + mini-design で停止）
> 前段: A0 理由観測（`759a983b`）。本層は捕捉した reason を **structured insight** に束ねる pure 基盤。

---

## 1. 何を実装したか
`lib/plan/mobility/mobilityReasonInsight.ts`（pure・READ のみ・Date 不使用・additive・**新規ファイルのみ**）:
- `buildReasonInsights(store, opts?)` / `buildReasonInsightForLeg(store, legKey, opts?)`。
- A0 の `HypothesisFeedbackEntry.reason` を **leg 単位で観測のみ集約** → `ReasonInsightResult = ReasonInsight | NotEnoughReasonSignal`。
- `ReasonInsight`: `{legKey, dominantReason, dominantMode, *Count(internal), totalReasonObservations(internal), strength: "emerging"|"established"}`。
- **readiness gate**: `minObservations=3`（★1-2 件は出さない）+ reason/mode の **strict majority**（2-2 等 tie は出さない）+ established は `≥5 件 ∧ share≥0.67`。条件未満は `not_enough_signal{observed}`。
- `excludeLegKeys` で sensitive/hidden を対象外にできる。

## 2. 何を実装していないか（★scope 厳守・CEO「今回やらないこと」）
- reflection UI / 「この区間では〜しがち」user-facing 表示（次 = UI mini-design・CEO 判断後）。
- copy 生成（本層は **structured result のみ**・「よく/いつも」等の強語を作らない）。
- Alter 接続 / Stargazer 合流 / DB / belief 学習反映 / reason→仮説文 即反映。
- OD 単位集約（本層は **legKey のみ**＝per-leg/OD 境界を曖昧にしない。OD は将来 observation-store join）。

## 3. tests / tsc
- `mobilityReasonInsight.test.ts` **RI1-RI14**: reason なし無視 / 後方互換 / sparse(2)→not_enough / sufficient(3)→emerging / established / reason 偏りなし→not_enough / mode 偏りなし→not_enough / 2-2 tie→not_enough / **per-leg 独立** / **excludeLegKeys** / single-leg / 決定的 / **trait/強語を含まない** / config 閾値。
- mobility suite PASS・**tsc footprint 0**（mobilityReasonInsight エラー 0・total 55 不変）。

## 4. production / DB / env / GitHub 不接触確認
- pure 関数のみ・localStorage すら読まない（store を引数で受ける）・DB/network/env/Google/Alter/Stargazer/Reality 不接触・production/Vercel/GitHub/push/PR なし。

## 5. HARD GATE（CEO 指定）全 PASS
| gate | 対応 |
|---|---|
| 1-2 件 sparse で insight を出す | `minObservations=3` + strict majority（RI3/RI8） |
| 人格診断・trait 表現 | structured のみ・per-leg・強語/人格語なし（RI13） |
| reason が mode preference を上書き | belief を読まない・書かない（本層は belief 非依存） |
| per-leg/OD 境界が曖昧 | **legKey のみ**・OD は扱わない（RI9 で leg 独立確認） |

## 6. 着地・ブランチ
- code branch: `claude/dr-a0-insight`（main 由来）。**main 着地は本 closeout commit 後に判断**（pure layer・additive・未配線）。
  - ※本バッチは「pure layer + readiness + tests + closeout + UI mini-design」。pure layer の main 着地は安全（既存 pure 着地と同パターン）だが、CEO 補正「UI 実装は次判断」に従い、pure の main 着地もまとめて行う（未配線＝production 不変）。

## 7. 次（UI mini-design・別 doc）
`…-a0-2-reason-reflection-ui-mini-design.md` を提出。reflection UI は **insight status のみ・not_enough_signal は無表示**・仮説トーン・per-leg・trait なし・smoke + copy review gate。**実装は次の CEO 判断**。
