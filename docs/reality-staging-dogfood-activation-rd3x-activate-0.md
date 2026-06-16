# RD3x-ACTIVATE-0 — Staging Dogfood Activation Plan / GO Package

- 日付: 2026-06-16 / 位置づけ: RD3c（write path）+ RD3x-P1（consume loop）+ RD3x-P2（operator preview safe boolean）の後、**「operator seed を実 DB に write → 実 read で durationValue → operator preview に safe boolean として true で見えるか」を実データで確認する activation**。細かい設計 slice を増やさず 1 枚に統合（CEO 方針）。
- 規律: **staging apply は CEO gate**・**production apply 絶対 NO**・**service_role 禁止**・**createClient 禁止**・**linked remote ref `aljavfujeqcwnqryjmhl`（=production）不接触**・**`supabase db push` 未実行**。本書は実装ではなく **GO package**。
- 方法（CEO ①②③④⑤⑥⑦⑧）: 前提（「seed は書けて読めて preview に出るか」）を **ephemeral 実 DB で end-to-end 実証**し、staging apply の判断材料を file:line / smoke 結果で固める。

---

## 0. 中核結論（前提を疑った結果）

| # | 結論 | 根拠 |
|---|---|---|
| **A1（linchpin）** | **write→read→safe boolean の loop は ephemeral 実 DB で end-to-end PASS**。実 glue write → 実 reader read → `buildOperatorDayRealPayload`(flag ON) → **`leaveByComputedPresent=true`（実データ）**。 | `tests/unit/operatorSeedActivationSmoke.test.ts` #3-#7 |
| **A2** | **残る gap は「persistent な DB が無い」だけ**。logic は全て揃い実証済。Docker 停止で local persistent 不可 → **staging apply が唯一の persistent 経路**（= CEO gate）。 | RD3c-P3-local preflight / 本 smoke |
| **A3** | **real read dependency は本 slice で実装済**（`createSupabaseOperatorDurationSeedReader`・server-only・owner-RLS select・full row → `DurationConfirmationRowV0`）。**page への runtime 注入は staging apply 後**（reachable な DB が前提）。 | `lib/plan/reality/integration/duration-confirmation-source.ts` |
| **A4** | **RLS は operator_seed を一般 user read に漏らさない**（`owner_select` = general_user_confirmed × production ゆえ seed 構造排除）。ephemeral で実証。 | migration L149-154 / smoke #5 |
| **A5** | **safe boolean に exact instant / raw anchor は出ない**。real payload で leak guard 0・raw locationText/title/sourceId/exact ISO 非露出を実証。 | smoke #7 |

→ **結論**: activation の本体（loop closure on real DB）は **autonomous に証明完了**。残るは **persistent DB を得る staging apply（CEO 判断）** と、その後の **page runtime 注入**。本 package で CEO は「staging apply するか」を判断できる。

---

## 1. Preflight 結果（read-only・実行済）

| 項目 | 結果 | 根拠 |
|---|---|---|
| **linked remote ref** | **`aljavfujeqcwnqryjmhl` = production（aljav）**。**現 link は production を指す** → `supabase db push --linked` は **production に当たる＝絶対 NO**。staging apply は **ref を hjcr に切替えた上で CEO 実行**が必要（autonomous 不可）。 | `supabase/.temp/project-ref` |
| **staging ref** | `hjcrvndumgiovyfdacwc`（hjcr）。`CAPTURE_STAGING_REF_ALLOWLIST` 唯一要素。 | `lib/plan/shift/devFixtureHost.ts:18` |
| **production ref（denylist）** | `aljavfujeqcwnqryjmhl`（aljav）。gate が hard block。staging≠production を smoke #2 で確認。 | `:20` / capture-gate / smoke #2 |
| **migration diff** | `supabase/migrations/20260616100000_duration_confirmations.sql`（193 行）。CREATE TABLE + 12 CHECK + 3 index + partial unique index + 5 RLS policy + updated_at trigger。**新規 table のみ**・external_anchors / 他 table **不変**（additive）。 | migration file |
| **rollback 方針** | `DROP TABLE duration_confirmations CASCADE;`（破壊的だが **external_anchors / 他 table 不変**・anchor 不変）。new table ゆえ rollback clean。 | migration L17 |
| **operator allowlist** | `REALITY_OPERATOR_SEED_USER_IDS`（server-only・auth UUID・空=fail-closed）。gate が `USER_NOT_OPERATOR` で block。 | `lib/plan/featureFlags.ts` / operator-duration-seed-gate |
| **flag** | write: `REALITY_OPERATOR_SEED_WRITE_ENABLED`（default OFF）／ preview: `REALITY_OPERATOR_PREVIEW_LEAVEBY`（default OFF・RD3x-P2）。両 **production OFF**。 | featureFlags |
| **gate（write）** | `evaluateOperatorDurationSeedGate`: FLAG_OFF → PRODUCTION_NODE_ENV → PRODUCTION_PROJECT_REF(aljav) → NO_OPERATOR_ALLOWLIST → NO_USER → USER_NOT_OPERATOR → allow{staging|dogfood}。**production ref / production nodeEnv は必ず block**。 | operator-duration-seed-gate:49-66 |

---

## 2. Apply 判断

| 経路 | 可否 | 理由 |
|---|---|---|
| **local persistent apply** | ❌ 不可 | **Docker 停止**（local Supabase stack 起動不可）。 |
| **ephemeral apply（proxy）** | ✅ 実行済 | ephemeral Postgres に migration apply → write/read/RLS/safe boolean を end-to-end 実証（remote 不接触）。**activation logic は persistent 不要で証明可能**。 |
| **staging apply（hjcr）** | ⏸ **CEO gate** | **autonomous 不可**: 現 link は production(aljav)。staging apply は ①link を hjcr に切替 ②`supabase db push`（or `migration up --linked`）③CEO 承認・の 3 点が必要。本 package は GO 待ち。 |
| **production apply（aljav）** | 🚫 **絶対 NO** | CEO 方針・gate hard block・課金/法務/対外と同格の本番変更。 |

**本 slice の apply 実績**: **ephemeral のみ**（実 persistent/remote/staging/production apply **なし**）。

---

## 3. Autonomous 実証（ephemeral end-to-end activation smoke）

`tests/unit/operatorSeedActivationSmoke.test.ts`（**8/8 PASS**）— mock でない実 DB。

| # | 検証 | 結果 |
|---|---|---|
| #1 | ephemeral 起動・migration apply・RLS 有効・partial unique index | PASS |
| #2 | ref 定数: staging(hjcr)≠production(aljav)・denylist | PASS |
| #3 | **operator seed real write**（実 glue → 実 DB）→ readback `operator_seed/staging/learningEligible=false/productionEligible=false` | PASS |
| #4 | **real read**（実 reader → 実 DB）→ operator 自身が当日 active seed を full row 取得 | PASS |
| #5 | **RLS: 一般 user(B) read に operator_seed が漏れない**（owner_select 構造排除・直接 count も 0） | PASS |
| #6 | 別日 read → `[]`（fail-safe・raw を出さない） | PASS |
| #7 | **end-to-end: flag ON + 実 reader 注入 → `leaveByComputedPresent=true`（実データ）**・leak violation 0・exact ISO instant 非露出・raw anchor（locationText/title/sourceId）非露出 | PASS |
| #8 | flag OFF → reader を読まず `leaveByComputedPresent=false` | PASS |

**chain（実 DB）**: glue write（operator_seed・staging env・learningEligible=false）→ `createSupabaseOperatorDurationSeedReader.listActiveByOwnerForDate`（owner-RLS select *）→ `flatRowToConfirmation` → `buildOperatorDayRealPayload`（flag ON・real anchor honest supply）→ consume → computed leaveBy → **safe boolean true**。

---

## 4. Real read dependency injection（実装済 + staging 注入 design）

- **実装済（本 slice）**: `createSupabaseOperatorDurationSeedReader(client)` / `OperatorDurationSeedReaderV0.listActiveByOwnerForDate(userId, subjectiveDate)` / `flatRowToConfirmation`（server-only・`duration-confirmation-source.ts`・`.from` 隔離維持）。raw row/durationValue/exact timestamp を **client に出さない**（呼び元が safe boolean に潰す）・read 失敗は `[]`（raw DB error 非露出）。
- **staging 注入（apply 後・別 GO）**: dev-reality-surface operator preview page が `listDurationConfirmations: (uid) => reader.listActiveByOwnerForDate(uid, subjectiveDate)` を注入（**injected user-RLS server client・service_role 禁止・createClient は server util 経由**）。**product `/plan` / Alter tab には注入しない**。
- **現状の production 安全**: page は real reader 未注入 + flag OFF → **production の `leaveByComputedPresent` は常に false**（honest・空表示）。

---

## 5. Staging runbook（CEO 承認後に実行する手順・本 package では未実行）

1. ref 切替: link を **hjcr（staging）** に向ける（production aljav から外す）。切替後 `supabase/.temp/project-ref` が hjcr であることを確認。
2. migration diff 再確認（staging 既存 schema との差分が「新規 table のみ」であること）。
3. apply: `supabase db push`（or `migration up --linked`）— **staging のみ**・**service_role 不使用**。
4. real write smoke（staging）: allowlisted operator で operator_seed を 1 件 write → readback で `operator_seed/staging/false/false` 確認 → supersede 確認。
5. RLS smoke（staging）: 別 user で operator_seed が read に出ないこと確認。
6. real read + preview: page に reader 注入（flag ON・operator のみ）→ `leaveByComputedPresent` が実 staging データで true 確認。
7. rollback 準備: 異常時 `DROP TABLE duration_confirmations CASCADE;`（staging のみ）。

---

## 6. 止める条件（どれかなら即停止）

- staging ref が production(aljav) と混ざる（link が production を指したまま）。
- migration diff が「新規 table のみ」でない（既存 table 改変が出る）。
- RLS が operator_seed を owner 一般 read へ漏らす。
- seed write/read が safe に通らない（raw error/UUID/SQL が露出）。
- safe boolean に exact timestamp / departure line が混入する。
- product `/plan` / Alter / notification / contact / action に影響が出そうになる。

---

## 7. NO GO 継続

product `/plan` 接続 ／ Alter tab 接続 ／ exact timestamp 表示 ／ departure line ／ notification ／ user-facing copy 追加 ／ external route API ／ currentLocation ／ production apply ／ production deploy ／ service_role ／ createClient ／ raw anchor(title/locationText/sourceId/externalUid/companions) の client 露出 ／ raw DB error の露出。

---

## 8. CEO 判断ポイント（GO package）

1. **staging apply（hjcr）を承認するか** — autonomous 不可・ref 切替 + push + CEO 承認が必要。承認なら §5 runbook を実行。
2. apply 後に **page real reader 注入 + flag ON（operator only）** を承認するか（別 GO）。
3. activation が staging で確認できたら、初めて次を判断: **Alter dev-only preview（safe boolean/status のみ）／ departure line boundary docs ／ product `/plan` 接続（後段）**。

- 本書はコードを含まない（real read adapter / activation smoke は実装済・本書は GO package）。staging apply / page 注入 / 上記次段は **CEO 専管**。

---

## 9. RD3x-ACTIVATE-1 実行記録（staging apply 完了・2026-06-16・code `d5aa8de6f`）

**CEO RD3x-ACTIVATE-1 GO**（linked ref を staging[hjcr] へ切替済を CEO 確認）。staging に apply を実行し、operator preview の `leaveByComputedPresent=true` が **staging real data** で成立することを実証。

| 項目 | 結果 |
|---|---|
| linked ref 確認 | `supabase/.temp/project-ref` = **`hjcrvndumgiovyfdacwc`**（staging）。`supabase projects list` の ● = `culcept-staging`。production(aljav) 非接触。push 直前に再確認。 |
| auth | `supabase` CLI authenticated（`projects list` 成功）。**service_role 不使用**。 |
| migration diff（dry-run） | `db push --dry-run` → 2 pending: `20260615100000_external_anchors_start_time_provenance`（**未記載・additive**: external_anchors nullable 4列 ADD + 3 CHECK + RPC CREATE OR REPLACE）+ `20260616100000_duration_confirmations`。**想定外検知→CEO に AskUserQuestion→「両方 apply」承認**。 |
| apply 結果 | `supabase db push` → 両 migration apply 成功（staging のみ・`Finished supabase db push`）。 |
| rollback | `DROP TABLE duration_confirmations CASCADE;`（staging のみ・external_anchors の 4列は別途 DROP COLUMN）。 |
| staging real smoke | `tests/unit/operatorSeedStagingActivation.test.ts` **8/8 PASS**（実 staging DB・anon key + STAGING_USER_A real auth・service_role 不使用）。 |
| operator seed write/read | #2 real glue write → environment=staging・#3 real reader read → operator_seed/learningEligible=false/upper=20 取得。 |
| owner read 漏洩なし | #4 構造的事実（seed=operator_seed×staging＝applied owner_select[general×production]が排除する class）。**第二ユーザー実測は STAGING_USER_B 認証不可で staging 未実測**（ephemeral RD3x-ACTIVATE-0 #5 で real RLS 実証済・staging は同一 policy を apply）。 |
| supersede chain | #5 同一 scope 再 seed → active 1（最新 upper=25・履歴保持）。 |
| gate reject | #6 non-operator → `gate_user_not_operator`・#7 production url → `gate_production_project_ref`。 |
| leaveByComputedPresent real-data | **#8 flag ON + 実 reader 注入 → `leaveByComputedPresent=true`（staging real data）**・leak 0・exact ISO/raw anchor(locationText/title/sourceId)/uid 非露出・leavebyinstant/timecontract/departureline/notification 不在。 |
| page real reader injection | `app/(culcept)/plan/dev-reality-surface/page.tsx`: **flag-gated（`realityOperatorPreviewLeaveBy`・default OFF）**・operator preview path のみ・user-session client（`supabaseServer()`・**service_role/createClient なし**）で `createSupabaseOperatorDurationSeedReader` 注入。OFF→注入せず false（read なし）。**user-facing copy 追加なし**（payload field のみ・client 表示は別 GO）。 |
| 不変 | product `/plan`/Alter 非接続・departure line/exact timestamp/notification なし・external API/currentLocation なし・**production apply/deploy なし**・raw anchor/DB error 非露出。 |
| 残注記 | (1) STAGING_USER_B 認証不可（staging の 2nd-user 非漏洩は未実測・ephemeral 実証済）。(2) page client が boolean を**表示**するのは別 GO（本 slice は data 層注入まで）。(3) `supabase/.temp/*`（project-ref=hjcr 等 CLI cache）は env 状態ゆえ本コミットに含めない。 |
