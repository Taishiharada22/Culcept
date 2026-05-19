# Alter Plan W1-Z — Production Migration Decision Memo

**作成日**: 2026-05-19
**Status**: 判断資料（CEO 判断起点、本 PR では migration apply / 実装変更を行わない）
**関連**:
  - `docs/alter-plan-foundation-design.md`（Plan 機能の全体設計）
  - `docs/alter-plan-a2-atomicity-tradeoff.md` §10（A-2 best-effort → W1-Y staging 達成までの軌跡）
  - `docs/alter-plan-w1y-rpc-atomicity-mini-design.md`（W1-Y RPC-first + fallback の設計）
  - `supabase/migrations/20260519100000_create_external_anchor_bundle.sql`（apply 対象 migration、staging 着地済み）
  - `docs/alter-plan-beta-readiness.md`（β との連動）
**branch**: `docs/alter-plan-beta-readiness-pack`
**実装範囲**: **docs only**。production migration apply / fallback path 削除 / orphan logger 削除 / 他 migration / 実装変更を一切含まない

---

## 1. 現状（W1-Y staging で達成したこと）

2026-05-19 時点で **W1-Y staging atomicity COMPLETE**:

| 項目 | 状態 |
|------|------|
| Postgres function `create_external_anchor_bundle(UUID, JSONB, JSONB)` | staging に apply 済み |
| Supabase Repository | **RPC-first + fallback** 実装着地（PR #204 merge 済み） |
| Fallback 条件 | 「function 不在」class のみ（PGRST202 / 42883 / message-based "could not find the function"） |
| Fallback **しない** 条件 | PGRST100 / PGRST203 / 42501 / 23xxx / その他（CEO 補正 #1 反映済み） |
| Staging A-5 smoke | 18 / 18 PASSED, `rpc_fallback` 0, `orphan_source` 0 |
| Production migration | **未 apply**（CEO 判断待ち、本 PR の判断対象） |

### 残り技術負債（W1-Z 以降）

| 負債 | 解消 wave |
|------|-----------|
| Production の atomicity（client-side sequential + compensating delete） | W1-Z（本 doc が判断資料） |
| Repository の fallback path（function 不在時の legacy 経路） | W1-Z**+**（production migration apply 完了後の cleanup wave） |
| `SupabaseRepoLogEvent.orphan_source` / `compensating_delete_attempted` 型 | W1-Z+（同上） |
| Mock client の rpc handler 未登録時 default PGRST202 挙動 | W1-Z+（test fixture 整理、影響極小） |

W1-Z は **production migration apply の 1 wave** に限定。fallback / logger 削除は別 wave。

---

## 2. W1-Z とは

**W1-Z = production Supabase に W1-Y migration を apply する 1 アクション**。具体：

1. Supabase Dashboard で `supabase/migrations/20260519100000_create_external_anchor_bundle.sql` を production に対して実行
2. `pg_proc` で function 存在検証
3. production smoke で RPC path 経由を確認、`rpc_fallback` log が出ないこと確認

これ以上でも以下でもない。**コード変更なし** / **migration SQL 不変更** / **他 migration 同時 apply なし**。

---

## 3. 判断 frame: 4 つの timing 候補

| timing | apply 時期 | β との関係 |
|--------|------------|------------|
| **A** | β 開始前（今すぐ） | β は完全 atomic 環境で開始 |
| **B** | β 期間中 | mid-flight migration |
| **C** | β 完了後 | β raw data で判断 |
| **D** | apply しない（永続 fallback） | A-2 fallback で運用継続 |

### 各 timing の trade-off

#### A. β 開始前 apply

**Pros**:
- β user は完全 atomic 環境で体験。orphan source 発生 0 が物理保証
- 観測対象から「fallback path の有無」変数を除外できる
- production environment が staging と同等になり、staging smoke 結果を production 動作の証拠として使える

**Cons**:
- β 開始が apply + smoke + 検証分（数時間〜1 日）後ろ倒し
- apply 中の production deploy 衝突 risk（Vercel と同時着地で race）
- β 観測で「production で fallback がどう動くか」の生データが取れない

**適合条件**: β 開始までに余裕がある + 「対外公開前に技術完全形」を CEO が優先する場合

#### B. β 期間中 apply

**Pros**:
- β data に「apply 前 fallback path / apply 後 RPC path」両方の観測
- β user の体験中に apply で「production の挙動が改善された」ことを内部で確認できる

**Cons**:
- mid-flight migration の risk（β user が migration apply 中に anchor 操作するとどうなるか不確実）
- β observation の variable が増え、原因切り分けが困難
- CEO 操作タイミング設計の負荷

**適合条件**: β 規模が小さく時間帯コントロールできる場合（CEO が β user に「23:00-23:30 は使わないで」と言える関係性）

#### C. β 完了後 apply

**Pros**:
- β raw data で「production の fallback path が現実に何件発火したか」を確認できる
- もし `rpc_fallback` 0 / `orphan_source` 0 なら、apply の urgency が下がる（→ D 検討余地）
- apply 中の deploy 衝突 risk が β 期間中より低い（β は無 active user で apply 可）
- β fix wave / 機能追加 wave と並列着地可能

**Cons**:
- β 中の production は A-2 fallback で動く（orphan 発生 risk が極めて低いが 0 ではない）
- β 観測で「fallback path が動いたことの user 影響」が見えたら apply urgency が判明

**適合条件**: β observation 自体を最大化し、apply 判定を data driven にする場合（**最も合理的な default**）

#### D. apply しない（永続 fallback）

**Pros**:
- 実装コスト 0
- CEO 操作不要
- production の状態 stable

**Cons**:
- `rpc_fallback` log が production で永続発火（Sentry noise）
- orphan_source 発生 risk が永続（極めて低確率だが 0 ではない）
- 「staging では atomic、production では best-effort」の分裂が永続
- 将来の wave で fallback path 削除 cleanup が永遠にできない

**適合条件**: β observation で `rpc_fallback` 0 / `orphan_source` 0 が確認され、CEO が「現状の運用品質で十分」と判断した場合。**理論上は valid な選択肢**。

---

## 4. Trigger criteria — β observation signal を W1-Z action にマップ

β 完了後（または β 期間中の中間観測）の signal から W1-Z timing を triggered で判定：

| β observation signal | 推奨 W1-Z timing | 理由 |
|----------------------|------------------|------|
| `rpc_fallback` 0 ∧ `orphan_source` 0（14 日） | **D 候補**（または C 保険 apply） | A-2 fallback で運用できる証拠。D は valid。保険として C 推奨 |
| `rpc_fallback` 散発（user 体験影響 0） ∧ `orphan_source` 0 | **C** | β 後 apply、urgency 中 |
| `rpc_fallback` 多発 ∨ orphan 検出（実害なし、log のみ） | **C 即時** | β 完了直後 apply 推奨 |
| **`orphan_source` 1 件でも user UI で「空 source」表示** | **A 即時 or β stop → A** | hard-warning、`docs/alter-plan-beta-readiness.md` §11 playbook 発火 |
| anchor INSERT 失敗率 > 10%（network 別問題） | timing と独立、別途 cause investigation | apply で解決しない症状の可能性 |

### Trigger criteria の運用

- β 期間中: weekly に CEO が log を確認、上表に該当しないか check
- β 完了後: bundle data で CEO 最終判断（A / B / C / D のいずれか）
- 判断後の apply / 不 apply は別 PR / 別 wave

---

## 5. Apply 手順（参照、`docs/alter-plan-w1y-rpc-atomicity-mini-design.md` §9 と同等）

apply 実行は CEO 操作。本 doc は手順を再確認する判断資料。

### Step 1. CEO 判断後の前提確認

- [ ] PR #204（W1-Y）が origin/main 着地済み（2026-05-19 確認済み、commit c298ee7c）
- [ ] staging で migration 既 apply、smoke 18/18 PASS（2026-05-19 確認済み）
- [ ] CEO が timing（A / B / C）を確定、β との衝突なし
- [ ] production deploy queue が空（Vercel / 他 PR と衝突しない）

### Step 2. production Supabase Dashboard で migration apply

1. https://supabase.com/dashboard/project/<production-ref>/sql/new
2. `supabase/migrations/20260519100000_create_external_anchor_bundle.sql` の内容を貼り付け
3. "Run" 実行
4. 期待結果: `CREATE FUNCTION` 成功メッセージ + `REVOKE ALL ON FUNCTION ... FROM PUBLIC` + `GRANT EXECUTE ON FUNCTION ... TO authenticated` 完了

### Step 3. function 存在確認（SQL Editor）

```sql
SELECT
  proname,
  prosecdef AS is_security_definer,
  prokind,
  proacl
FROM pg_proc
WHERE proname = 'create_external_anchor_bundle';
-- 期待: 1 行
--   proname = 'create_external_anchor_bundle'
--   is_security_definer = false （SECURITY INVOKER 維持）
--   prokind = f （function）
--   proacl に authenticated=X が含まれる
```

### Step 4. production smoke で RPC path 動作確認

CEO 実機操作 or A-5 smoke production 版（apply 後設計）：

1. Aneurasync production で anchor 1 件登録
2. Supabase Dashboard `external_anchors` テーブルで該当行確認
3. Sentry / structured log で `rpc_fallback` イベントが出ていないこと確認（apply 後は出るべきでない）

### Step 5. β との連動

- Stage 1（staging）で β 進行中なら影響なし
- Stage 2（production β）進行中なら、apply 中の user 操作影響を CEO が事前周知
- apply 完了後、β 観測指標 7（`rpc_fallback`）が 0 になっていることを confirm

---

## 6. Rollback 手順

apply 後に問題発覚した場合の rollback：

```sql
-- production Supabase Dashboard SQL Editor で実行
DROP FUNCTION IF EXISTS create_external_anchor_bundle(UUID, JSONB, JSONB);
```

### Rollback 後の挙動

- Repository の `client.rpc("create_external_anchor_bundle", ...)` 呼び出しが PGRST202 を返す
- `shouldFallbackFromRpcError` が true を返す
- `logger({ kind: 'rpc_fallback', reason: 'function_missing', ... })` が発火
- Repository は legacy sequential path（source INSERT → anchors INSERT → compensating delete）に fall through
- API は ok を返す（user 体験は維持される）

### Rollback の検証

```bash
# A-5 staging smoke を production 想定で再実行
npm run smoke:staging  # （A-5 docs 参照）
# 期待: 18/18 PASS, log に rpc_fallback 発火（fallback 動作の証拠）
```

---

## 7. Smoke 手順

apply 前 / 後 / rollback 後の各タイミングで smoke 実行：

| タイミング | 期待 |
|-----------|------|
| apply 前（現状） | 18/18 PASS, `rpc_fallback` 発火（fallback path 動作） |
| apply 後 | 18/18 PASS, `rpc_fallback` 発火**しない**（RPC path 動作） |
| rollback 後 | 18/18 PASS, `rpc_fallback` 発火（fallback path 復活） |

詳細手順: `docs/alter-plan-a2-rls-smoke.md` / `docs/alter-plan-a4-ci-integration-mini-design.md` / `docs/alter-plan-a5-auto-trigger-mini-design.md`

---

## 8. Rollback Drill（CEO 事前演習の推奨）

apply の心理的 cost を下げるため、**staging で 1 回 rollback drill を実施することを推奨**。

### Drill 手順

1. staging で現状確認: function exists, smoke PASS, `rpc_fallback` 0
2. `DROP FUNCTION IF EXISTS create_external_anchor_bundle(UUID, JSONB, JSONB);` 実行
3. function 不在確認（§5 Step 3 SQL の結果 0 行）
4. staging smoke 再走 → 18/18 PASS, `rpc_fallback` 発火（fallback 動作確認）
5. migration SQL を再 apply（`CREATE OR REPLACE` で冪等）
6. function exists 再確認、smoke 再走 → `rpc_fallback` 0 に戻る

### Drill の効果

- CEO が「rollback は実行可能」「rollback 後も system は動く」を体感
- production apply 時の不安が低減
- 本番事故時の手順が筋肉記憶に入る
- 所要時間: 30 分以内（staging のみで完結）

### Drill の risk

- staging 一時的に fallback path 経由になる（30 分以内）
- 内部 β 進行中なら一時影響あり → β user 不在の時間帯に実施推奨

---

## 9. Fallback Path 削除 wave（W1-Z+、本 W1-Z の対象外）

production migration apply 完了後の cleanup wave。**本 W1-Z では実施しない**：

### スコープ（W1-Z+ 別 PR）

| 対象 | 内容 |
|------|------|
| `lib/plan/external-anchor-repository-supabase.ts` | sequential path（§3 source INSERT 以降）削除、RPC-only に簡約 |
| `lib/plan/external-anchor-repository-supabase.ts` | `SupabaseRepoLogEvent.orphan_source` / `compensating_delete_attempted` 型削除 |
| `lib/plan/supabase-error-mapping.ts` | `shouldFallbackFromRpcError` 削除（または warning-only mode に） |
| `tests/unit/plan/externalAnchorSupabaseRepository.test.ts` | compensating delete / orphan_source / `rpc_fallback` 関連テスト削除 |
| `tests/fixtures/mockSupabaseClient.ts` | rpc handler 未登録時の PGRST202 default 挙動を「test bug 検出」に変更 |

### 前提条件

- production migration apply 完了（W1-Z 実施済み）
- production smoke で `rpc_fallback` 0 が 1 週間継続
- 全 β user の体験が atomic 環境で完結（β 期間中の log で fallback path 不使用を確認）

### やらない理由（W1-Z で同時着地しない）

- W1-Z = migration apply のみ（1 アクション）に限定し、各 wave のスコープを最小に保つ
- 万一 production で問題発覚した時、rollback で fallback path が即時復活する必要
- CEO 判断の粒度を「apply するか / しないか」「fallback 削除するか / しないか」に分離

---

## 10. W1-Z でやらないこと（明示）

CEO 制約 / GPT 補正の制約を re-state：

- ❌ migration SQL の変更（現行 `20260519100000_create_external_anchor_bundle.sql` のまま）
- ❌ 他 migration の同時 apply
- ❌ `SECURITY DEFINER` 化（`SECURITY INVOKER` 維持）
- ❌ RLS bypass
- ❌ fallback path 削除（W1-Z+ 別 wave）
- ❌ `orphan_source` / `compensating_delete_attempted` logger 削除（W1-Z+ 別 wave）
- ❌ service_role / DB password / connection string 使用
- ❌ Repository interface 変更
- ❌ API route / UI / DraftPlan / Home / nav / W1-6 / W1-8 改修
- ❌ 他 migration 同時 apply（A-2 / W1-Y 以外の migration 追加）
- ❌ env 変更（`STARGAZER_*` flags 等）
- ❌ A-2 / W1-Y 既存 docs の structural rewrite（参照リンクのみ追加可）

---

## 11. CEO 判断ガイド — Decision Tree

```
β を開始する？

├── No
│   ├── W1-Z 単独判断（β 文脈なし）
│   │   ├── 現状の運用品質で十分？
│   │   │   ├── Yes → D（永続 fallback）
│   │   │   └── No → A（技術完全形優先で apply）
│   │   └── 別 wave 優先で W1-Z 保留 → 後日再判断
│
├── Yes（β 開始）
│   ├── Stage 1（staging）から開始？
│   │   ├── Yes（推奨）
│   │   │   ├── Stage 1 期間中: W1-Z apply 不要（staging は既に apply 済み）
│   │   │   ├── Stage 1 完了 → Stage 2 遷移判定（β doc §9）
│   │   │   │   ├── Stage 2 GO → Stage 2 開始前に A apply 推奨（production も atomic 化）
│   │   │   │   └── Stage 2 NO-GO → β は Stage 1 で終了、W1-Z は別判断
│   │   │   └── β 観測で signal 確認 → C / D 決定（§4 trigger criteria）
│   │   │
│   │   └── No（Stage 2 直行）
│   │       ├── A（production も atomic 化、apply 推奨）
│   │       └── apply しない D で進行 → β 観測 → C 後追い apply
│   │
│   └── apply 中 deploy 衝突 risk vs β user 体験影響を CEO 衡量
```

### 推奨 default route

CEO の今月の成功条件と整合する default は：

1. **β を Stage 1（staging）で開始**（staging は W1-Y apply 済み、atomicity 担保済み）
2. Stage 1 完了 / 遷移基準 OK → **Stage 2 開始前に W1-Z apply（A 相当）**
3. Stage 2 観測 → W1-Z+ (fallback 削除) の判断材料を集める
4. β 完了後 → W1-Z+ wave 着手 or 保留

### 別 default（β を出さない場合）

CEO が β を保留する場合：

- W1-Z は urgency 中（A-2 fallback で運用継続できる）
- 別 wave（Counselor / Origin / Stargazer 改善 / etc.）を優先
- W1-Z は時間が空いた時に 30 分の単独 wave で apply 可能

---

## 12. β / W1-Z の優先順位（本 PR の核心提案）

CEO が「β 準備」と「W1-Z」のどちらを先行させるべきかの推奨：

### 推奨: **β 準備を先行**（GPT 補正と整合）

理由：
1. **今月の成功条件 #2「初期ユーザー獲得」が CEO 北極星**。W1-Z は技術負債解消で北極星ではない
2. **W1-Z は β の前提条件ではない**（staging で β を開始する限り、staging は既に W1-Y apply 済み）
3. **β 観測 data が W1-Z timing 判断の最良の input**（§4 trigger criteria）
4. **本 PR の docs only スコープに整合**（β 開始は docs merge 後、W1-Z apply は β 後）

### 例外: 「先に W1-Z 解禁」が合理的なケース

- CEO が β を当面出さない決断をした場合（W1-Z 単独判断、§11 decision tree 左枝）
- CEO が「対外公開前に技術完全形」を最優先する場合（A timing）
- staging だけでなく production も atomic にしてから β を始めたい（Stage 1 後の遷移時に apply）

---

## 13. 結論

W1-Z は **β 観測 signal の関数として判定すべき triggered decision**。gut feeling の「やるべきかどうか」ではない。

- staging で `rpc_fallback` 0、`orphan_source` 0 が既に実証されている（PR #204 smoke 結果）
- production も同等の挙動を示すだろうという仮説は、β 観測でのみ実証可能
- β 観測 data が出揃った時点で W1-Z timing は自動的に確定する

**CEO が本 PR で判断すべきは「W1-Z timing」ではなく「β を出すか / どの Stage から出すか」**。W1-Z timing は β observation の従属変数。
