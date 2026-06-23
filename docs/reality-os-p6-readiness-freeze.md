# RO P6 — ◎-readiness Freeze + Exception Ledger

**前提（CEO 2026-06-23/24）**: このセッションは **production に行かない**。production 接続 / flag 点火 / 実ユーザー資産投入 / DB apply / deploy は **一切しない**。
本書は「このセッションでできる全 readiness が完了したか」を最終監査し、残りを **production-only / live-only 例外**として凍結する。

監査日: 2026-06-24 / branch: `claude/task-store-migration-on-a9eedce69-20260623`（local commit のみ・origin/main 不変）。

---

## 1. read-only 監査対象 と evidence

| 層 | 実体 | 規模（grep 実測） |
|---|---|---|
| P1 IR spine + P2/P3-0a kernel | `lib/plan/realityCore/*.ts` | **40 file** |
| P3 composer/surface/presenter + P5 adapter + P4 mapper | `lib/plan/realityPipeline/*.ts` | **6 file** |
| P3-9 UI dormant seam | `app/(culcept)/plan/components/realityOs/*.tsx` | **1 panel** + page.tsx prop-drill |
| test | `tests/unit/realityOs*/canonicalTaskRow/...` | **47 file**（freeze invariants 含む） |

---

## 2. P1〜P5/P4 の到達点

| Phase | 成果 | 状態 |
|---|---|---|
| **P1 IR spine** | commitmentSignal/movementReality/realityInstant/decisionDebt/momentSnapshot/realityGraphSnapshot/realityFrame/realityJudgmentInput/realityDiff/realityChange（L1-L7） | ✅ pure kernel 着地 |
| **P2 kernels** | predictionLedger/taskMinimalProgress/workOverrunRisk/futureSimulation | ✅ pure 着地 |
| **P3-0a judgment** | feasibilityJudgment/collapseRisk/proposalRoute/realityLearningSignal/correctionGradient | ✅ pure 着地 |
| **P3-1/2/3 composer** | realityPipelineSurface/proposalRouteScenarioMapper/realityOsFixturePipeline | ✅ fixture E2E |
| **P3-8 surface/presenter** | realityOsSurfaceContract（frozen v0）/realityOsSurfacePresenter（redacted JP VM） | ✅ contract 適合 |
| **P3-9 UI dormant seam** | RealityOsSurfacePanel + page→PlanClient→CoAlterTab prop-drill | ✅ flag OFF で非描画 |
| **P5 asset adapter** | realityOsAssetProviders（port + fixture + live stub） | ✅ flip-to-production seam |
| **P4 persistence** | canonicalTaskRow（projection + dry-run validator） | ✅ DB apply 前 readiness |

---

## 3. 完了扱いにできる範囲（このセッションで「実装可能なもの」は全て完了）

- pipeline 全段（ExternalAnchor → IR → judgment → proposal route → scenario → surface → redacted display VM）が **fixture で E2E に通る**。
- UI seam が **flag OFF で dormant**・ON で fixture display を描画（real asset 非接続）。
- asset adapter が **port 差し替えだけで live 化できる形**（依存逆転）。
- persistence が **保存行の形 + dry-run self-check** まで（実 INSERT 直前）。
- 不変条件（redaction / honest-unknown / contract / flag OFF / persistence dry-run）が **freeze invariants test で固定**。

---

## 4. まだ未完だが production-only / live-only に分類される範囲

すべて **CEO GO + 別 session** 案件（このセッションでは原理的に実装不可＝production/DB/実資産が要る）:

1. asset live provider 実装（Supabase calendar / canonical_tasks read / sensor energy / route・weather provider）
2. canonical_tasks migration 昇格（sql.draft 起こし）+ staging apply + production apply
3. staging dry-run 11 step（CREATE+RLS+trigger / extraction / dedup / parentId two-pass / RLS smoke 3 ケース / projection / rollback rehearsal）
4. prediction ledger / correction の DB schema 設計（現状 型のみ）
5. flag 点火（`REALITY_OS_SURFACE_PROD=true` 等）
6. deploy

---

## 5. このセッションで実装可能なのに残っているもの

**なし。** 上記 §4 は全て production / DB / 実資産 / deploy を要し、本セッション前提（非接続）では実装不可。
pure / fixture / docs / dry-run の範囲で作れるものは P1-P6 で出し切った。

---

## 6. Exception Ledger（flip-to-production 例外台帳）

| # | 凍結項目 | 現状（dormant/stub/dry-run） | flip 操作 | 承認 |
|---|---|---|---|---|
| E1 | UI surface flag | `realityOsSurfaceProd=false`（server-only・NEXT_PUBLIC なし） | env `REALITY_OS_SURFACE_PROD=true` | CEO |
| E2 | asset live provider | `createLiveAssetSourceStub()` = 全 asset UNAVAILABLE | live port 実装（calendar/task/sensor/route）+ 注入差し替え | CEO + 別 session |
| E3 | canonical_tasks 物理 | migration 0件・sql.draft 不在 | sql.draft 起こし → `<ts>_canonical_tasks.sql` 昇格 | CEO |
| E4 | DB apply | staging/production 未 apply | staging dry-run 11 step → production apply gate | CEO（staging 先・backup・link 二重確認） |
| E5 | RLS 実適用 | owner-only 4 policy 未適用 | staging で適用 + RLS smoke 3 ケース（自分 read 可 / 他者 reject / production-url reject） | CEO |
| E6 | prediction ledger / correction schema | 型のみ・schema 未設計 | schema 設計（別 GO） | CEO + 別 session |
| E7 | deploy | local commit のみ | origin push → 本番 deploy | CEO |

→ **この 7 項目以外に production との差分はない。** ◎ は E1-E7 の flip のみで到達する。

---

## 7. flip-to-◎ checklist（順序付き・全て CEO GO）

1. **E3** sql.draft 起こし → migration 昇格
2. **E4+E5** staging で apply + RLS smoke（dry-run 11 step・本 P4 の `canonicalTaskRowDryRunViolations` が前段 self-check）
3. **E2** asset live provider 実装（port 差し替え）→ projection 検証（DB行→CanonicalTaskV0→realityNode→violations=[]）
4. **E6** prediction ledger schema（必要時）
5. **E1** `REALITY_OS_SURFACE_PROD=true` 点火
6. **E4** production apply（CEO gate）
7. **E7** deploy

各段で本セッションの pure 成果（contract / dry-run / fixture E2E / freeze invariants test）が回帰ガードとして機能する。

---

## 8. 不変条件 checklist（freeze invariants test で機械固定）

| 不変条件 | 確認 | test |
|---|---|---|
| surface flag default OFF | `realityOsSurfaceProd=false`（env 未点火） | INV-1 |
| redaction（raw evidence/graph/ledger/raw reasonCode 非露出） | display JSON に `evidenceRefs/ledger/graph/_shift/asset:/fixture:/snapshot` なし | INV-2 |
| surface contract 適合 | `surfaceContractViolations=[]` | INV-3 |
| asset live = unavailable | live stub → unavailable（非接続 honest） | INV-4 |
| persistence dry-run | 適合行 `[]` / 不正行検出 | INV-5 |
| permissionBoundary 緩めない | `Math.min`（permission-model） | （既存・本セッション不触） |

---

## 9. 非接続の最終確認（grep 実測）

| 禁止 | 実測 |
|---|---|
| `fetch(` 実呼び出し | **0** |
| DB write（`.insert/.upsert/.update/.delete`） | **0** |
| supabase 実 import / `createClient()` | **0 / 0** |
| `process.env` 直読み（featureFlags 以外） | **0** |
| `Date.now()/new Date()`（realityCore） | **0**（instant 注入） |
| NEXT_PUBLIC で RO flag 漏れ | **0**（server-only） |

---

## 10. 結論

**このセッションでできる元構想（Reality OS pipeline の production-shaped readiness）は完了。**
ExternalAnchor → IR → judgment → proposal → scenario → redacted surface → UI dormant seam → asset adapter → persistence dry-run まで、
**pure / fixture / docs / dry-run の範囲で出し切った**。残差は §6 の 7 例外（全て production / DB / 実資産 / deploy・CEO GO）のみ。
◎ は E1-E7 を flip するだけで到達する状態に凍結した。
