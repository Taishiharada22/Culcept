# RD3c-P3a-wire-0 — Supabase Repository / Operator Gate Wiring Design（docs-only）

- 日付: 2026-06-16 / 位置づけ: RD3c-P3a（`createOperatorDurationSeed` pure orchestration・`3cd5ee1de`）を **実 DB（duration_confirmations）に接続**する repository 実装・operator gate・local/staging 境界の実装前設計。**まだ実装ではない**。
- 規律: 本書は**コードを書かない**。Supabase repository 実装・実 DB write・server action・API route・UI/dev panel・local persistent apply・remote/staging/production apply には進まない。
- 方法（CEO ①②③④⑤⑥⑦⑧）: 既存 PRM repository / capture-gate / static-safety を file:line で grounding し、**前提（operator gate は JWT claim か allowlist か）を疑った上で**、既存パターンに最小整合する wiring を導く。

---

## 0. 中核発見（grounded・前提を疑った結果）

| # | 発見 | 根拠 |
|---|---|---|
| **F1（linchpin・前提を疑った帰結）** | **既存 operator/canary gate は JWT claim でなく pure allowlist gate**: `evaluateCaptureGate`（`capture-gate.ts:97-130`）= kill → flag → project ref（unresolved→block）→ **production nodeEnv block / production ref(aljav) block** → **staging ref(hjcr) allowlist** → requestedUserId → **canary allowlist**。→ **RD3c-P2a migration draft の `reality_operator` JWT claim は既存パターンと乖離**（custom claim 発行 infra が必要・重い）。**user-RLS + allowlist gate に revise すべき**。 | capture-gate:97-130 |
| **F2** | **real Supabase repository pattern**: `import "server-only"` + **injected user-RLS client**（`from(table)` interface・`createClient しない`）+ **service_role 禁止** + error → safe status（`{ok:false}`・**raw error/UUID を return/throw/log しない**）+ return は count/id のみ。 | supabase-prm-learning-event-repository.ts:1-70 |
| **F3** | **static-safety table 隔離**: `lib/plan/reality` を recursive scan し「ある table を query する `.from` を持つのは指定 source 1 file のみ」を強制（`realitySeedSource.test.ts:228-241` / `realityDurationEvidenceSource.test.ts:235`）。→ **duration_confirmations の `.from` query は `lib/plan/reality/integration/` の指定 source 1 file に隔離し、対応 static-safety test を追加**。 | realitySeedSource:228-241 |
| **F4** | **pure orchestration は realityCore（`.from` なし）**: `operatorDurationSeedWrite.ts`（RD3c-P3a）は repository 注入で Supabase 非 import。static-safety scan 対象（reality）外。→ **orchestration（realityCore・pure）と repository impl（reality/integration・query）を分離**（PRM の insert-contract / supabase-repository 分離と同形）。 | operatorDurationSeedWrite.ts |
| **F5** | **DB は partial unique index で duplicate-active を構造防止可能**: 3-call sequential（find→supersede→insert）は race で 2 active 行を生み得る。`UNIQUE(...) WHERE superseded_by IS NULL AND revoked_at IS NULL` で **同一 scope の active を 1 行に DB 強制**できる（P2a migration への additive 追加）。 | P2a migration（index 設計） |
| **F6** | **ephemeral Postgres で repository smoke 可能**: RD3c-P2a-DB smoke で insert/CHECK/RLS/rollback を ephemeral で実証済。repository の insert/find/supersede + unique index + user-RLS も ephemeral で smoke 可（Docker/local persistent 不要）。 | §12.1 P2a-DB smoke |

→ **結論**: ①repository impl は **direct sequential + partial unique index（v0・simple+DB guard）**、staging 多操作者は **single RPC transaction（upgrade）**。②operator gate は **capture-gate 同型の pure allowlist gate**（JWT claim を使わない）→ **migration RLS を user-RLS に revise**。③query は reality/integration の指定 source に隔離 + static-safety test。④v0 は **server-only function のみ**（route/server action/UI なし）。

---

## 1. Supabase repository 実装案

`OperatorDurationSeedRepositoryV0`（RD3c-P3a port）の Supabase 実装 = `createSupabaseOperatorDurationSeedRepository(client, ownerUserId)`（`import "server-only"`・injected user-RLS client・`createClient しない`・PRM 同形）。

| method | 実装 | 備考 |
|---|---|---|
| `insert(row)` | `client.from('duration_confirmations').insert({...row(flat 化), user_id: ownerUserId})` → `.select('id').single()` | user_id は **server-resolved**（operator の auth.uid()）・RLS WITH CHECK が二重強制。scope/governance を flat 列に展開（型は flat row mapper） |
| `findActiveByScope(userId, scope)` | `.from('duration_confirmations').select('id').match({user_id, target_node_id, subjective_date, transport_mode, temporal_scope_ref}).is('superseded_by', null).is('revoked_at', null)` | active のみ |
| `markSuperseded(id, byId)` | `.from('duration_confirmations').update({superseded_by: byId}).eq('id', id).eq('user_id', ownerUserId)` | owner-RLS で他人行不可 |

### 実装案比較
| option | 原子性 | race | partial failure | 複雑度 | apply | 推奨 |
|---|---|---|---|---|---|---|
| **direct sequential（PRM 同形・3 call）** | ✗ | あり（find→insert 窓） | あり（insert 後 supersede 失敗で chain 欠落） | 低 | table のみ | **v0 ★**（+ partial unique index 必須） |
| **single RPC `create_operator_duration_seed`（SECURITY INVOKER transaction）** | ✓ | なし | なし（1 tx） | 中（RPC + apply） | RPC 追加 | **upgrade（staging 多操作者）** |
| transaction RPC | ✓ | なし | なし | 中 | RPC | = single RPC |
| local-only in-memory（dogfood） | — | — | — | 最低 | なし | dev fixture（RD3a 既済・real DB でない） |

**推奨 v0 = direct sequential + partial unique index**（§7）。race 窓は単一 operator dogfood で極小・partial unique index が **2 active を DB で構造拒否**（worst case = clean conflict error → safe code）。**staging 多操作者は single RPC（SECURITY INVOKER・transaction）に upgrade**（race/partial を原子化・service_role 不使用）。

### rollback 方針
table DROP（P2a smoke 実証済）+ RPC 追加時は `DROP FUNCTION`。repository コードは barrel 非 export・未配線ゆえ revert は file 削除のみ。

---

## 2. operator gate 設計

**capture-gate 同型の pure allowlist gate**（JWT claim を使わない・F1）: `evaluateOperatorSeedGate(input): { isOperator, resolvedEnvironment } | { blocked, reason }`。

- 判定場所: **server-only glue 層**（route でなく server-only function）。`auth.getUser()` で actor 確定 → gate に env inputs（nodeEnv / supabaseUrl ref / operator allowlist / requestedUserId=auth.uid()）を渡す。
- gate ロジック（capture-gate 流用）: kill/flag → project ref（unresolved→block）→ **production nodeEnv block** → **production ref(aljav) block** → **staging/dogfood ref allowlist** → **operator allowlist（`PLAN_FLAGS.realityOperatorSeedUserIds` 新規 env・空=fail-closed）**。
- `reality_operator` JWT claim は **使わない**（migration RLS を user-RLS に revise・§4）。custom claim 発行 infra 不要。
- **client から isOperator を受け取らない**（gate が server で resolve・`createOperatorDurationSeed` の `deps.isOperator`/`resolvedEnvironment` は gate 出力）。
- production block: nodeEnv=production OR production ref → `blocked`（isOperator に到達しない）。

---

## 3. environment gate 設計

- **dogfood / staging のみ**（production reject）。
- environment は **server 側で決定**（supabaseUrl ref + nodeEnv から導出: staging ref(hjcr)→`staging`、dev/local→`dogfood`、production ref/nodeEnv→block）。**client input 不可**。
- `createOperatorDurationSeed` の `deps.resolvedEnvironment` に渡す（production は gate で既に block・二重防御で orchestration も production reject）。
- **remote apply とは別**（environment はデータの governance ラベル・apply 先 DB とは独立概念）。

---

## 4. RLS / policy 整合（**migration draft revise を提案**）

**現 draft（claim-based）の問題**: operator policy が `reality_operator` JWT claim 前提（F1 で乖離・infra 重い）。

**提案 revise（user-RLS・既存パターン整合）**:
```sql
-- DROP: duration_confirmations_operator_select / _operator_insert（claim-based）
-- ADD（user-RLS・operator は自分の seed を own）:
CREATE POLICY duration_confirmations_seed_owner_select ON duration_confirmations
  FOR SELECT USING (
    auth.uid() = user_id
    AND provenance_kind IN ('operator_seed','dogfood_seed','staging_seed')
    AND environment IN ('dogfood','staging')
  );
CREATE POLICY duration_confirmations_seed_owner_insert ON duration_confirmations
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND provenance_kind IN ('operator_seed','dogfood_seed','staging_seed')
    AND environment IN ('dogfood','staging')
    AND learning_eligible = false
  );
CREATE POLICY duration_confirmations_seed_owner_update ON duration_confirmations
  FOR UPDATE USING (auth.uid() = user_id AND provenance_kind IN ('operator_seed','dogfood_seed','staging_seed'))
  WITH CHECK (auth.uid() = user_id);  -- supersede（superseded_by 更新）用
```
整合:
- **operator_seed.user_id = operator の auth.uid()**（operator が自分の seed を own・dogfood/staging dev session）。
- **owner read（general×production）に operator_seed が漏れない**（general policy は `general_user_confirmed ∧ production` ゆえ seed を構造排除・P2a-DB smoke で実証済）。
- **service_role を使わない**（user-RLS client 注入・F2）。
- **operator policy（allowlist gate）が無い環境では write 不可**: gate が fail-closed（allowlist 空→block）+ RLS WITH CHECK（seed×dogfood/staging×eligible=false）。
- **local DB smoke と整合**: P2a-DB smoke の RLS を user-RLS 版に置換して再 smoke。
- **migration file 変更**: P2a migration の operator policy 2 つを user-RLS 3 policy に置換 + partial unique index 追加（§7）。**この diff は RD3c-P3a-wire 実装 slice で適用**（本 docs では diff を明示のみ・file 変更しない）。

---

## 5. local DB apply / smoke 方針

- **P3a-wire 実装前に local migration apply が必要か**: **ephemeral Postgres で足りる**（F6）。repository の insert/find/supersede + partial unique index + user-RLS を ephemeral で smoke 可能（P2a-DB harness 拡張）。
- **local persistent Supabase apply は不要**（Docker 不在環境でも ephemeral で検証可）。
- **remote/staging/production apply は NO**（絶対）。
- **smoke 項目（P3a-wire 実装時）**: ①revised RLS で apply rc=0 ②operator(auth.uid()=user) が自分の operator_seed insert 可 ③他 user の seed read 不可 ④owner(general) read に seed 漏れず ⑤findActiveByScope が active のみ返す ⑥markSuperseded で superseded_by 更新 ⑦**partial unique index が 2nd active を reject** ⑧supersede 後の insert は active 1 行 ⑨service_role 不使用 ⑩rollback(DROP) clean。

---

## 6. server action / API route 方針

- **v0 = server-only function のみ**（route/server action/UI を作らない）。wire 構成:
  - `lib/plan/reality/integration/duration-confirmation-source.ts`（**指定 source**・`.from('duration_confirmations')` を隔離・F3）= repository impl（insert/find/supersede）。
  - server-only glue（`createOperatorDurationSeedServer(input, ctx)` 相当）= `evaluateOperatorSeedGate` → user-RLS client（注入）→ `createSupabaseOperatorDurationSeedRepository` → `createOperatorDurationSeed`（RD3c-P3a）。
- **API route は作らない**（operator seed は user-facing endpoint でない・public 攻撃面を増やさない）。
- **server action も v0 では作らない**（呼び出しは dev-only operator context = guarded dev route 内 server 関数 or script・next slice）。
- **UI / dev panel は作らない**（RD3c-P3b・別 gate）。
- **client payload shape**: v0 は **client payload なし**（input は server-constructed・operator context から scope/duration を server で組む）。将来 dev panel（P3b）で client payload を許す場合も **raw duration（pre-ceil seconds）/ raw anchor / raw location / coordinate / title / companions を受け取らない**（scope は opaque ref のみ・duration は 5 分単位 upper・leak validation 通過）。

---

## 7. audit / supersede 設計

- **duplicate scope → supersede**（物理 delete しない・RD3c-P3a orchestration 済）: 同一 scope の既存 active を `markSuperseded` → 新 insert → 旧 `superseded_by = 新 id`。
- **partial unique index（追加）**: `CREATE UNIQUE INDEX duration_confirmations_active_scope_uniq ON duration_confirmations (user_id, target_node_id, subjective_date, transport_mode, temporal_scope_ref) WHERE superseded_by IS NULL AND revoked_at IS NULL;` → **同一 scope の active を DB で 1 行強制**（race でも 2 active 不可能）。
- `revoked_at`（手動失効・active から除外）と `superseded_by`（新 seed に置換）は**別軸**（両者 active から除外）。
- **audit trail**: createdBySlice（'RD3c-P3a'）保持・supersede chain（旧→新 id）保持・物理 delete しない。
- sequential の partial failure（insert 後 supersede 更新失敗）→ partial unique index があれば次回 find が旧 active を拾い再 supersede（self-heal）。RPC upgrade で原子化。

---

## 8. failure mode 設計（safe error code・raw DB error を client に出さない）

| failure | safe code | 扱い |
|---|---|---|
| non-operator | `not_operator` | orchestration が reject（gate fail-closed） |
| production environment | `environment_production_not_allowed` | gate + orchestration 二重 reject |
| RLS reject（insert WITH CHECK 不一致） | `rls_denied` | repository が error→safe code（raw 出さない） |
| active duplicate conflict（unique index 違反） | `active_duplicate_conflict` | repository が PG unique violation→safe code |
| invalid scope | `validation_failed`（violations 同梱・safe code 列挙） | orchestration validation |
| invalid duration | `validation_failed` | orchestration validation |
| raw leak | `validation_failed`（leak key のみ・raw echo なし） | orchestration leak validation |
| DB insert failure（network/auth/PG error） | `db_insert_failed` | repository catch→safe code（**raw error message を return/throw/log しない**・F2） |
| supersede failure | `supersede_failed` | repository catch→safe code（partial unique index が self-heal の余地） |
| partial failure（supersede 一部成功） | `partial_supersede`（insert は成功扱い・supersededIds に成功分のみ） | unique index で次回整合・audit に記録 |

**全 failure で raw DB error / UUID / SQL を client に出さない**（safe code + （validation のみ）safe violation 列挙）。write は **fail-closed**（成功を偽装しない・`{ok:false, code}`）。

---

## 9. 実装分割案（リスク別・各々別 GO）

| slice | 内容 | 触る | apply |
|---|---|---|---|
| **RD3c-P3a-wire-a**（migration RLS revise + index） | P2a migration draft の operator policy を user-RLS 3 policy に置換 + partial unique index 追加 + revised ephemeral RLS smoke | migration draft + smoke | **NO（draft・ephemeral のみ）** |
| **RD3c-P3a-wire-b**（repository impl・指定 source） | `reality/integration/duration-confirmation-source.ts`（`.from` 隔離・PRM 同形）+ flat row mapper + static-safety test + ephemeral repository smoke | new source + tests | NO（注入・未配線） |
| **RD3c-P3a-wire-c**（operator gate + server-only glue） | `evaluateOperatorSeedGate`（capture-gate 同型）+ server-only glue（gate→client→repo→orchestration）。route/UI なし | new gate + glue + tests | NO |
| RD3c-P3a-wire-d（local persistent apply・staging） | 実 staging apply + 実 write smoke | — | **別 CEO gate（staging）** |
| RD3c-P3b（dev panel） | operator dev UI | UI | 別 gate |

**推奨順**: **wire-a（RLS revise + index・ephemeral smoke）→ wire-b（repository + static-safety）→ wire-c（gate + server-only glue）→ wire-d（staging apply・別 gate）→ P3b（dev panel）**。

---

## 10. Department Responsibility Matrix（RD3c-P3a-wire-0・docs 契約）

| 部門 | 役割 | 責務 |
|---|---|---|
| **Build/Mobility** | R | repository 実装案・RPC vs sequential・glue 構成・static-safety 隔離 |
| **Permission** | C | operator gate(allowlist・claim 不使用)・RLS user-RLS revise・service_role 禁止・client から isOperator 受けない |
| **Risk** | C | race/partial failure・partial unique index・failure mode safe code・raw error 非露出 |
| **Communication** | C | seed を user-facing/notification に出さない・raw duration/location 受けない |
| **CEO** | A | wire-a/b/c 各実装 GO・wire-d staging apply GO・remote/production apply gate |

---

## 11. RD3c-P3a-wire 実装 GO 可否 自己判定

- **GO 可（wire-a/b/c を順に・各 docs→実装）**: 既存 precedent（PRM repository・capture-gate・plan_seed_duration_evidences・P2a-DB smoke）に最小整合・ephemeral smoke で検証可・remote apply なし。
- **前提を疑った修正**: ①migration RLS を **claim-based → user-RLS** に revise（既存パターン整合・infra 軽量）。②query を reality/integration 指定 source に隔離（static-safety 整合）。③v0 は **server-only function のみ**（route/server action/UI なし・攻撃面最小）。
- **race/partial failure** は partial unique index（DB 構造防止）+ 将来 RPC で原子化。**raw DB error を client に出さない**（safe code）。
- **HOLD 継続**: 実 DB write（local persistent/staging/production apply）・server action・API route・UI/dev panel・user confirmation write・remote/production apply（各 CEO gate）。
- 本書はコードを含まない。GO は CEO 専管。

---

## 12. 実装反映（RD3c-P3a-wire-AB）

- **2026-06-16 RD3c-P3a-wire-AB 実装**（code `fc6cd124c`・matrix §5 参照・CEO 方針で wire-a+wire-b を束ね）: §1 repository（direct sequential）・§4 RLS revise（claim→user-RLS）・§7 partial unique index を実装。
  - 実装ファイル: `supabase/migrations/20260616100000_duration_confirmations.sql`（revise・**未 apply**: seed_owner 3 policy + partial unique index・reality_operator claim 廃止）・`lib/plan/reality/integration/duration-confirmation-source.ts`（server-only repository・指定 source）・`tests/unit/durationConfirmationSource.test.ts`（11 PASS）。
  - **ephemeral DB smoke 全 PASS**: revised RLS apply・seed_owner insert・general read 遮断・**duplicate active reject(partial unique index)**・supersede→insert・rollback clean（remote/production 不接触・service_role 不使用）。
  - **本 slice 範囲外（後続 gate）**: operator gate + server-only glue（**wire-c**）・staging 実 apply + 実 write smoke（**wire-d**・別 CEO gate）・dev panel（**P3b**）。RPC upgrade（staging 多操作者）は §1 の将来 option。

## 13. 実装反映（RD3c-P3a-wire-C）

- **2026-06-16 RD3c-P3a-wire-C 実装**（code `f41ca017a`・matrix §5 参照）: §2 operator gate・§3 environment gate・§6 server-only glue を実装。
  - 実装ファイル: `lib/plan/featureFlags.ts`（`realityOperatorSeedWriteEnabled` + `realityOperatorSeedUserIds`）・`lib/plan/reality/operator-duration-seed-gate.ts`（pure gate・capture-gate 同型・JWT claim 不使用）・`lib/plan/reality/integration/operator-duration-seed-glue.ts`（server-only glue）・`tests/unit/operatorDurationSeedGlue.test.ts`（16 PASS）。
  - **server が user/environment/provenance を固定**: gate（flag/nodeEnv/ref/allowlist/user）→ environment server-resolve（staging/dogfood・production deny）→ glue が userId/confirmedBy=auth.uid() 固定 → orchestration が provenance/learningEligible 固定。client から isOperator/environment/provenance を受けない。
  - **本 slice 範囲外（後続 gate）**: staging 実 apply + 実 write smoke（**wire-d**・別 CEO gate）・operator dev panel（**P3b**）・API route/server action（呼び出し面・必要時 別 slice）。glue は未配線（barrel 非 export）。
