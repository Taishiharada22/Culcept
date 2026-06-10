# Life Ops — A-4-c25 Production Source Safety / Fixture Kill-Switch Mini-Design

> 2026-06-11 / CEO・GPT GO（Claude の c24 先行指摘起点・**案 B 採用→後に案 A**）。production enable/deny 解除/production write/notification/R4/push=なし。

---

## 1. Fixture source audit（read-only）

- **注入点は単一**: `lifeops-preview-compute.ts` の `args.inputs ?? fixtureLifeOpsInputs(nowMs)`（lib/app 全走査で他参照なし）。
- inputs を渡さない caller = ①dev preview page ②dev preview actions ③**mainline model helper**（c23）の 3 つ＝全て fixture 使用。
- 環境切替の現状: **存在しない**（caller が host 三重ガード/mainline gate で staging 限定なだけで、compute 自体は環境非依存）。
- **production 混入経路**: 現在は mainline gate の production deny が唯一の防壁＝**deny を解除した瞬間、mainline model が無言で fixture を流す**
  （表示側 card だけでなく **server action 再検証側も同じ fixture を再構築**するため、偽造 candidateKey が fixture 候補に一致し write まで通る）。
- LifeOpsInputs fields = cadence/upcomingEvents/deadline の 3 つ。dailyUpkeep は field 未存在（将来追加でも real_only の空 base で自動 0）。

## 2. 案比較と採用

| 案 | 内容 | 判定 |
|---|---|---|
| A 実 source 接続を先に | 正攻法だが slice 大・deny 解除がさらに遠のく | 後続 |
| **B fixture kill-switch** | production では base 候補を空に。real（feedback 由来）が 0 なら card 自体 null。配管を production-safe にし、嘘候補リスク 0 | **採用（CEO 方針）** |

## 3. Source policy（pure・URL 由来・**flag では開けない**）

```ts
resolveLifeOpsSourceMode({supabaseUrl}) =
  staging allowlist → "fixture_allowed"（dev/operator preview・staging mainline dogfood）
  production deny list → "real_only"
  不明 host / 未設定 → "real_only"（fail-safe・unknown 環境でも fixture を出さない）
```
- **意図的に env flag を設けない**: 「fixture allow flag」が存在すると production で誤設定 1 つで嘘候補が出る footgun になる。
  staging は URL allowlist で恒久 fixture_allowed（dogfood 用途）・それ以外は構造的に real_only＝**設定ミスで開かない kill-switch**。
- real_only の base inputs = `{}`（fixture の deadline/event/cadence 全て 0）。**real channel（feedback 由来 cadence/suppression）はその上に merge**
  → 実 done 履歴があれば cycle 候補だけが正当に出る・なければ collector 0 → `buildLifeOpsMainlineCardDto` が **null = card 非表示**（c23 既存契約）。
  action rail も card と共に不在・writer は既存 gate（production deny）で不可＝「real source 0 なら card/rail/writer 全て不発」。

## 4. 適用位置（page/actions の同一性が構造保証）

`computeLifeOpsMainlineModel`（**page 表示と action 再検証の単一 helper**・c23）内で mode を解決し base inputs を選択:
`fixture_allowed → undefined（compute 既定 fixture）/ real_only → {}`。
→ 偽造 candidateKey でも real_only では fixture 候補が**再構築されない**（reps に存在しない→unknown_candidate）。
dev preview（page/actions）は host 三重ガードで staging 限定のため**不変更**（test で fixture 維持を lock）。

## 5. Gate 整理（4 分離・deny 解除の前提）

| gate | 実体 | production |
|---|---|---|
| ①card visibility | `isLifeOpsMainlineAllowed`（mainline∧planRouteLive∧staging∧!prod） | deny（解除=別 CEO gate） |
| ②source safety | `resolveLifeOpsSourceMode`（URL 由来・flag なし） | **real_only 恒久**（deny 解除後も fixture 不可） |
| ③writer | `isLifeOpsFeedbackWriteAllowed`（master∧write∧staging∧!prod） | deny（解除=別 CEO gate・real source 成立後） |
| ④read 系 | master∧feedback/cadence flags | flag 運用（OFF なら real channel も空→card null） |
→ 将来の deny 解除は①③の deny 条項を**個別に**外す（②は外さない＝fixture は production に永久に出ない）。

## 6. 変更ファイル
新 `lifeops-source-policy.ts`（pure）／`lifeops-mainline-model.ts`（mode 適用）／新 test `realityLifeopsSourcePolicy.test.ts`（GPT 12 lock）／docs/log。
preview compute・dev preview page/actions・card builder・writer は**不変更**。
