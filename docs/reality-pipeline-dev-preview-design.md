# Reality Pipeline — Operator-only Read-only Dev Preview（**Design / Preflight・docs-only**）

> 2026-06-09 / Build Unit / CEO 指示「Operator-only Read-only Dev Preview に進む前に Design / Preflight を挟む。docs-only・route 実装に入らない」。
> **docs-only**。route/page/apply/PlanClient/notification/production には進まない。
> 前提: Live Reader 4-A〜4-E-b 完了（real anchor + seeded memory の full pipeline を staging で実証済）。既存パターン: `app/(culcept)/plan/dev-second-self`（A1-7-34/35 の triple-guard dev preview）。

---

## 0. 結論
**既存の operator-only triple-guard dev-preview パターン（dev-second-self）をそのまま踏襲**し、`RealityPipelineEnvelope`（既に redacted）を operator が**観測するだけ**の read-only page を作る。**plan を書き換えない・通知しない・apply しない・user-facing でない**。route 実装は本 design 承認後に CEO 判断。

## 1. Preview の目的
- `RealityPipelineEnvelope`（readiness/recommended/影響/counts/trigger/permission/draft summary/stopReasons）を**人間が観測するだけ**。
- **plan を書き換えない**（read-only・apply なし）。**通知しない**。**user-facing ではない**（operator-only・dev/staging 限定）。
- ＝「脳が実データで何を判断したか」を安全に目視する観測面。

## 2. Guard（triple-guard + auth + flag・**dev-second-self と同一**）
| 層 | 条件 |
|---|---|
| ① host triple-guard | `isCandidateActionsPreviewHostAllowed({ hostMode: REALITY_CANDIDATE_ACTIONS_DEV_HOST, supabaseUrl })`：hostMode==="true" ∧ staging allowlist(`hjcrvndumgiovyfdacwc`) ∧ **production deny(`aljav…`)** → false なら `notFound()` |
| ② auth（operator-only） | `supabaseServer().auth.getUser()`：user 無→read/run しない（空表示）。**owner-RLS**（自分のデータのみ） |
| ③ flag | **`REALITY_PIPELINE_PREVIEW`（server default OFF・NEXT_PUBLIC なし）**。OFF→read/run しない（disabled 表示） |
- **service_role 禁止**（supabaseServer の anon+auth client）。**production hard block**（triple-guard で notFound）。**no apply / no write**（read-only）。
- write は**しない**（将来 controlled seed smoke が要れば別 GO・本 preview には含めない）。

## 3. Data source
- **real anchors read**：`createSupabaseWorldStateSourcePorts(supabase, user.id, date)`（column-restricted・owner-RLS）。
- **real M1/M3 read**：`createSupabaseMemorySourcePorts(supabase, user.id)` → `assembleMemoryItems`。
- **context = fixture 注入**（dev 既定値・**実 context reader は作らない**・server で energy/weather 読めないため）。
- **memory seed は preview 実装では行わない**（既存データを read するのみ）。seeded preview smoke が要れば**別 GO**。

## 4. UI 表示するもの（envelope は既に redacted）
readiness ／ recommended tier ／ **memory influence summary**（usableContexts count + confidence low/tentative）／ hardConstraints count ／ availableWindows count ／ trigger（kind + headline）／ permission verdict ／ **ChangeSet draft summary のみ**（id + opCount）／ stopReasons ／ **redaction status**（PASS/FAIL の computed 表示）。

## 5. UI 表示してはいけないもの
raw rows ／ title/location ／ PII ／ seedRef ／ utterance ／ personality ／ trait/fixed_preference ／ **full ChangeSet payload** ／ **apply button**（一切置かない）。
→ envelope は summary-only ゆえ構造的に raw を持たないが、**client には envelope（要約）のみ渡す**（MemoryItem/WorldState/ChangeSet 実体は渡さない）。

## 6. route 実装時の禁止
PlanClient 接続 ／ route/API で write ／ ChangeSet apply ／ notification/native ／ production ／ REALITY_ALTER_BRIDGE_LIVE enable ／ user-facing 公開。

## 7. smoke plan
- **flag OFF** → page は read/run せず disabled 表示（または triple-guard で notFound）。
- **triple-guard NG（非 staging/production）** → `notFound()`（404）。
- **flag ON + operator（auth user）** → envelope 表示。
- **non-operator（auth なし）** → read/run しない（空表示）。
- **production block** → triple-guard で notFound（production ref）。
- **redaction check** → 表示内容に raw/PII/title/location/apply-button が出ないことを test/smoke で確認。
- **apply/write 0** → page は read のみ・mutation コードを持たない。
- **tsc / reality tests green**。

## 8. stop 条件
production ref ／ service_role が必要 ／ apply に進みそう ／ write が必要 ／ PlanClient 接続が必要 ／ route/API で mutation ／ raw/PII/title/location が UI に出る ／ envelope 以外（MemoryItem/ChangeSet 実体）を client に渡す必要 ／ REALITY_ALTER_BRIDGE_LIVE enable。

## 9. implementation slice 案
| slice | 内容 | gate |
|---|---|---|
| **P-A flag** | `PLAN_FLAGS.realityPipelinePreview`（`REALITY_PIPELINE_PREVIEW` server default OFF） | pure flag・no-gate |
| **P-B server page** | `app/(culcept)/plan/dev-reality-pipeline/page.tsx`（force-dynamic・triple-guard→notFound・auth→operator・flag ON 時のみ real anchor+M1/M3 read → assemble → fixture context → `runRealityPipeline` → **redacted envelope のみ** client へ） | 🔒 **route/page 追加 + 実 read = CEO route gate** |
| **P-C client component** | `RealityPipelinePreviewClient.tsx`（envelope 要約を表示・**apply button なし**・raw なし・redaction status） | UI（route gate に含む） |
| **P-D fixture test** | client を fixture envelope で render し **raw/PII/title/apply-button が出ない**ことを assert ＋ guard 関数 test | pure test・no-gate |
| **P-E controlled staging smoke** | operator login + flag ON で page が envelope を表示・redaction・apply/write 0・flag OFF/non-operator/production block | 🔒 **staging page render = CEO smoke gate** |

→ **no-gate で先行可能**：P-A（flag）+ P-D（client の純粋 render fixture test・client は route に依存しない設計にすれば pure test 可）。**route/page 本体（P-B/P-C/P-E）は CEO route gate**。

---

## 10. 報告事項（CEO 判断用）
- **preview 実装に進む場合の最小 scope**：P-A flag + P-D client fixture render test（**no-gate・pure**）→ その後 P-B/P-C route/page（CEO route gate）→ P-E staging smoke（CEO smoke gate）。
- **preview 実装時の stop gate**：route/page 追加 + 実 read（P-B）・staging page render（P-E）・PlanClient/apply/write/notification/native/production/enable/user-facing。
- 本 design は **route を作らない**（docs のみ）。real read も**しない**（4-E で実証済の reader を再利用するだけ）。
