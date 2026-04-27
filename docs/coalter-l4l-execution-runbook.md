# CoAlter Stage 4 L4-l Execution Runbook

**status**: ACTIVE (2026-04-28 起草、CEO ops 4 step 用)
**正本依存**: layout plan v0.3 §7.12-§7.14 / runtime contract §3 / 統合契約 §2 / master §5 / 退役計画 doc / Core UX v1.1 §6.4
**非責務**: 実行タイミングは CEO 業判定。本書は技術手順のみ。

---

## §0 メタ

### §0.1 本書の目的

CoAlter Stage 4 L4-l (本番 flip + production deploy) を **CEO が事故なく実行する**ための手順書。実装側は L4-pre-3 まで完了済 (commit `431d2074`)。本書は L4-l execution の **ops 4 step** + **post-flip smoke checks** + **rollback procedure** を最小単位で正本化する。

### §0.2 前提条件 (実行前 必須)

- ✅ Stage 0.5 〜 Stage 4 L4-pre-3 全 commit chain landing 済
- ✅ 累積 coalter unit tests **1798 PASS**
- ✅ tsc clean (presence + instrumentation scope errors = 0)
- ✅ ChatClient.tsx 累積 diff = `+14 / -1` (production behavior 1 bit 不変)
- ✅ 不可触対象 (coalterDispatch / Orchestrator / engine / CoAlterCard / production ChatClient main flow) touch ゼロ
- ⏳ Stage 3 L3-j CEO 観測フェーズ合格 (Track A 視覚 + Track B 構造検証 8/8 PASS)
- ⏳ Anthropic API key 取得済 (`sk-ant-...`)
- ⏳ Supabase project 接続情報 (`SUPABASE_DB_URL` 等の env が `.env.local` で稼働中)

### §0.3 対象 commit chain (実装側 100% 完了)

```
Stage 0.5  bfcf6c5b  legacy CoAlterCard 退役計画 doc
Stage 1   199556fd → 01f8948b  L1-a 〜 L1-k (preview 静的試作、10 commits)
Stage 2   761ff749 → 25d15497  L2-a 〜 L2-m + L2-f (executor 骨格、13 commits)
Stage 3   eb4cdc98 → 7ba141ff  L3-a 〜 L3-i (preview E2E、5 commits、41 シナリオ)
Stage 4   ec34180a → 2d88593d  L4-a 〜 L4-k (本番マウント、11 commits)
L4-pre    6ff3beb3 → 431d2074  L4-pre-1/2/3 (LLM/Sentry/instrumentation、3 commits)
合計      43 implementation commits + migration files 2 件
```

### §0.4 不可触範囲 (本書で touch しない)

- 既存 `lib/coalter/coalterDispatch.ts` / `coalterOrchestrator.ts` / `engine.ts`
- 既存 `components/coalter/CoAlterCard.tsx` 本体
- 既存 doc (master design / Core UX / UI spec / runtime contract / integration contract / handoff doc / 退役計画 doc / layout plan v0.3)
- 統合契約 §1.6 / §3.6 / runtime §1.7 / §2.9 / §3.7 / Core UX §15.2 不可侵条文

### §0.5 用語

- **flag flip**: `.env.local` で `COALTER_PRESENCE_EXECUTOR=true` 等を設定し production 経路を有効化する操作
- **smoke check**: flip 直後に異常なし確認のための minimal verification
- **observation period**: flip 後 1 rev (約 1 週間) の telemetry 観測期間
- **rollback**: flag を OFF に戻し production behavior を完全復旧する操作 (1 minute 以内)

---

## §1 Pre-flight checks (実行前 verification)

### §1.1 ローカル build / test 確認

```bash
cd /Users/haradataishi/Culcept-coalter

# 全 unit tests PASS 再確認 (累積 1798 件)
npm run test:unit

# tsc errors = 0 再確認
NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit | grep -E "lib/coalter/presence|app/components/chat" | head -5
# ↑ 何も出力されないこと (errors = 0)

# build 成功確認
npm run build
```

合格条件:
- `1798 PASS` (test count、L4-pre-3 完了時点)
- tsc 出力に `lib/coalter/presence` または `app/components/chat` scope の error 行が無い
- `npm run build` が exit 0

### §1.2 環境変数 事前列挙

`.env.local` に以下が**既に設定済**であること (CoAlter 関連は未設定で OK、本 §2 で追加):

| 既存 必須 | 用途 | 確認方法 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 接続 | `cat .env.local \| grep NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | migration push / RLS bypass | (機密、export 既知) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry breadcrumb 送信先 | 既存設定 (instrumentation-client.ts 経路で必要) |

CoAlter L4-l flip で **新規追加** する 4 件 (本 §2 で値を入れる):

| 新規 | 既定値 | flip 値 |
|---|---|---|
| `COALTER_PRESENCE_EXECUTOR` | OFF | `true` |
| `COALTER_LEGACY_CARD_AUTO_INSERT` | ON | `false` |
| `COALTER_PRESENCE_SPEECH_LLM` | OFF | `true` |
| `ANTHROPIC_API_KEY` | (未設定) | `sk-ant-...` |

### §1.3 Supabase project 接続確認

```bash
# Supabase CLI version 確認 (>= 1.x 推奨)
npx supabase --version

# linked project 確認
npx supabase projects list
# ↑ 想定 project が linked 表示されること

# 既存 migration history 確認 (drift がないこと)
npx supabase migration list
# ↑ remote と local が一致、L4-l 対象 2 migration が未 apply のこと:
#   20260428100000_coalter_presence_states.sql
#   20260428100100_coalter_memory_items.sql
```

合格条件: 上記 2 migration が **`local` 列にあり、`remote` 列に無い** (未 apply 状態)。

### §1.4 Anthropic API key 取得 + 動作確認

1. Anthropic console (https://console.anthropic.com/) にログイン
2. API Keys → Create Key、`coalter-prod` 等の識別名で作成、`sk-ant-...` を取得
3. 動作確認 (本 step は curl で 1 回のみ、L4-l deploy 前):

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: sk-ant-YOUR_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "ping"}]
  }' | head -3
# ↑ 200 response + content.text が返ることを確認
```

合格条件: HTTP 200 + 何らかの text content。エラー時は API key を再発行。

### §1.5 Stage 3 観測フェーズ合格 再確認

- Track A (CEO 視覚): Stage 1 preview スクショ確認済 + Stage 3 spot-check 済
- Track B (構造検証): Explore agent 8/8 PASS 完了

未確認の場合は本 §1.5 で確認後に §2 へ進む。

---

## §2 Step 1: `.env.local` 編集

### §2.1 編集内容 (正確な diff)

```diff
# 既存内容は維持。以下 4 行を追加:

+ COALTER_PRESENCE_EXECUTOR=true
+ COALTER_LEGACY_CARD_AUTO_INSERT=false
+ COALTER_PRESENCE_SPEECH_LLM=true
+ ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_FROM_§1.4
```

### §2.2 反映確認 (deploy 前にローカルで verify)

```bash
# .env.local 反映状態でローカル起動
npm run dev

# 別 terminal で curl 確認:
# (a) presence executor flag が ON になっていること
curl -s http://localhost:3000/api/coalter/presence/state?pair_id=test-only | head -5
# ↑ 503 ではない response (flag ON で 501 not_implemented_until_l4_l 想定)
# ↑ 503 が返るなら flag が反映されていない、env 再確認

# (b) telemetry endpoint も flag ON を反映:
curl -s -X POST http://localhost:3000/api/coalter/presence/telemetry \
  -H "content-type: application/json" \
  -d '{"events":[]}' | head -3
# ↑ 200 + {"accepted":0,"total":0,"persisted":false} 想定 (flag OFF なら 503)
```

合格条件: 503 が出ないこと (flag が確実に ON)。

### §2.3 production env vars 反映 (Vercel)

Vercel Dashboard → Project Settings → Environment Variables で同 4 件を **Production** scope に追加 (Preview / Development には入れない、本書では production 限定の flip):

| Key | Value | Environments |
|---|---|---|
| `COALTER_PRESENCE_EXECUTOR` | `true` | Production |
| `COALTER_LEGACY_CARD_AUTO_INSERT` | `false` | Production |
| `COALTER_PRESENCE_SPEECH_LLM` | `true` | Production |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (Sensitive) | Production |

`ANTHROPIC_API_KEY` は **Sensitive** チェックを入れる (Vercel Dashboard で値が hidden 表示)。

---

## §3 Step 2: Supabase migration push + troubleshooting

### §3.1 push 実行

```bash
cd /Users/haradataishi/Culcept-coalter
npx supabase db push
```

期待出力:
```
Connecting to remote database...
Applying migration 20260428100000_coalter_presence_states.sql ... ok
Applying migration 20260428100100_coalter_memory_items.sql ... ok
Finished supabase db push.
```

### §3.2 反映 verification

```bash
npx supabase migration list
# ↑ 2 migration が remote と local 両方に表示されること (drift = 0)
```

または Supabase Studio → Table Editor で `coalter_presence_states` / `coalter_memory_items` 2 table が存在することを目視。

### §3.3 トラブルシューティング

#### §3.3.1 migration conflict (timestamp 重複)

症状: `migration X conflicts with migration Y`

原因: 他の Phase で同 timestamp の migration を後発で作成

対処:
1. 本 L4-l 対象 2 migration の timestamp が最新であることを確認 (`ls -la supabase/migrations/2026042810*.sql`)
2. conflict している migration が本 L4-l 対象でない場合は、その migration を先に apply してから再試行

#### §3.3.2 RLS policy error

症状: `policy "X" already exists` または `function gen_random_uuid() does not exist`

対処:
1. `gen_random_uuid()` が必要 → Supabase Studio で `create extension if not exists "pgcrypto";` を 1 度実行
2. policy 重複は `drop policy if exists` が migration 内に書かれているため発生しないはず。発生時は migration 内の policy 名を確認、別 phase の同名 policy と衝突なら rename

#### §3.3.3 FK error (`coalter_pair_states does not exist`)

原因: 既存 `coalter_pair_states` table が無い (master §5 既存 migration が未 apply)

対処: master §5 の coalter_pair_states migration を先に apply、その後 L4-l 2 migration を再 push

#### §3.3.4 rollback (本書 §7 参照)

migration apply 後の rollback は migration を逆 SQL で undo する手作業。本書 §7 で詳細。

---

## §4 Step 3: Realtime publication 登録

### §4.1 SQL Editor で実行

Supabase Studio → SQL Editor に以下を貼り付け、Run:

```sql
alter publication supabase_realtime add table public.coalter_presence_states;
alter publication supabase_realtime add table public.coalter_memory_items;
```

期待: `Success. No rows returned.` × 2

### §4.2 verification query

同 SQL Editor で実行:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('coalter_presence_states', 'coalter_memory_items');
```

期待 result: 2 rows (両 table が表示される)

### §4.3 トラブルシューティング

#### §4.3.1 `relation does not exist`

原因: §3 migration が未完了

対処: §3 を再実行 (migration list で 2 migration が remote にあることを確認)

#### §4.3.2 `permission denied for publication supabase_realtime`

原因: 接続 user が service_role でない

対処: Supabase Studio (dashboard.supabase.com 経由) は自動的に service_role 接続のため通常発生しない。CLI/直接接続時は `SUPABASE_SERVICE_ROLE_KEY` 経由で接続

---

## §5 Step 4: Production deploy + 起動後 smoke check

### §5.1 deploy 実行

```bash
cd /Users/haradataishi/Culcept-coalter
git status   # working tree clean を確認 (M next-env.d.ts は無視)
vercel deploy --prod
```

期待: `https://[your-project].vercel.app` deployment が完了。所要時間 2-5 分。

### §5.2 deploy 直後 smoke check (1 分以内)

#### §5.2.1 production URL 直接 GET

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://[your-domain]/
# ↑ 200 を期待
```

#### §5.2.2 Sentry dashboard 確認

Sentry project → Issues / Discover で:
- 過去 5 分以内の **error spike** が無いこと
- 過去 5 分以内の **breadcrumb category=`coalter.*`** が出始めていること (ペアが talk page を開いた場合)

#### §5.2.3 production startup wiring 反映確認

Vercel logs (`vercel logs`) で:
```
✓ Sentry server config loaded
(L4-pre-3 wiring が静かに走るため、明示 log は出ない。エラー log がないことを確認)
```

エラー出力例:
- `ANTHROPIC_API_KEY is missing` → §2 env 設定漏れ
- `coalter_presence_states does not exist` → §3 migration 漏れ
- `realtime channel error` → §4 publication 登録漏れ

### §5.3 deploy 後 5 分以内に異常検出時の即時 rollback

→ 本書 §7 へ移行

---

## §6 Post-flip smoke checks (15 分以内に完了)

### §6.1 flag invariant 確認

production console / curl で以下を実行 (任意の talk thread URL):

```bash
# 任意の認証済 session でブラウザ DevTools → Console:
# (本 check は CEO の test pair で実行、smoke 用)
fetch('/api/coalter/presence/state?pair_id=YOUR_TEST_PAIR_ID')
  .then(r => r.json()).then(console.log)
# ↑ flag ON 反映済なら 501 not_implemented_until_l4_l (Stage 4 stub) ではなく
#   実 Supabase fetch 結果の SharedState (initialSharedState) が返ること
```

### §6.2 Sentry breadcrumb 受信確認 (state_transition 1 件発火試行)

CEO の test pair で talk page を開く → 何か発言 (`PresenceSignalWiring` が implicit signal を fire → `productionSignalBus` に publish → `presenceReducer` が S0→S1 遷移 → telemetry.emitPresenceStateTransition → Sentry.addBreadcrumb)。

Sentry dashboard で:
- breadcrumb category=`coalter.presence` の event が記録されている
- data フィールドに `from: "S0"` / `to: "S1"` が含まれている

### §6.3 LLM call 動作確認 (safe な test pair で 1 発話確認)

CEO の test pair が S2 (Pattern A) に到達した時:
- 上部レイヤーに発話 card が出現
- 文面が **「正しい」「すべき」「素晴らしい」等の §2 禁止語彙を含まない** こと (目視)
- 文面が 1-2 文、14-40 文字程度 (Pattern A の LengthOverride 整合)

### §6.4 二重表示禁止確認 (統合契約 §1.6-4)

- 上部レイヤー S5 発話と handoff 送信メッセージが**自動コピーされていない**こと
- HandoffButton tap 時のみメインチャットに転送される (1 回きり broadcast)

### §6.5 §11 絶対禁止 5 項目 visual 確認 (Core UX v1.1)

- 裁判官にならない (どちらが正しいか判定する文面がない)
- メインチャットの主役を奪わない (上部レイヤーが過度に主張しない)
- いきなり提案で逃がさない (S5 関係保護を経ずに S7 提案が出ない)
- 連投しない (active utterance ≤ 1 が UI で確認できる)
- 何でも Daily/Travel にしない (暗黙 signal で mode 昇格していない)

5 項目すべて違反ゼロ → smoke check pass、観測フェーズへ移行 (§8)。

---

## §7 Rollback procedure (異常検出時、1 minute 復旧)

### §7.1 即時 rollback (env 1 行変更)

`.env.local` (および Vercel Production env) で:

```diff
- COALTER_PRESENCE_EXECUTOR=true
+ COALTER_PRESENCE_EXECUTOR=false
```

それ以外 3 件 (`LEGACY_CARD_AUTO_INSERT` / `PRESENCE_SPEECH_LLM` / `ANTHROPIC_API_KEY`) は **触らない** (rollback の最小範囲、再 flip 時に再利用するため)。

### §7.2 redeploy

```bash
vercel deploy --prod
```

所要時間 2-5 分。`COALTER_PRESENCE_EXECUTOR=false` で:
- `UpperLayerMount` → null render (DOM 影響ゼロ、既存 talk page UI 復旧)
- `PresenceSignalWiring` の useEffect → early return (signal 発火停止)
- `productionSignalBus` への publish 停止
- `legacyCardAutoInsertEnabled` は ON のまま (= 旧 CoAlterCard 自動挿入が復活、移行期挙動)

### §7.3 検証 (rollback 完了確認)

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://[your-domain]/api/coalter/presence/state?pair_id=test
# ↑ 503 presence_executor_disabled 期待 (flag OFF 反映)
```

Sentry breadcrumb の `coalter.*` category が rollback 後 5 分以内に**新規発生していない** ことを確認 (production 影響ゼロ復旧)。

### §7.4 DB schema は残す

migration push で apply された 2 table (`coalter_presence_states` / `coalter_memory_items`) は **削除しない**。data はゼロのまま残置 (再 flip 時に再利用)。schema drift によって既存挙動への影響はゼロ。

### §7.5 decision-log 記録

`docs/decision-log.md` に:

```
[2026-MM-DD] [CEO] [L4-l rollback] [理由: ___] [次再 flip 判断: ___]
```

を追記。CEO の業判定。

---

## §8 観測フェーズ運用 (1 rev = 約 1 週間)

### §8.1 telemetry 8 項目の見方 (Sentry breadcrumb category 別)

| category | 計測項目 | 異常検出基準 (例値、CEO が tune) |
|---|---|---|
| `coalter.presence` | state 遷移 | 1 ペア / 日あたり 0 件 (= 完全未動作) なら異常 |
| `coalter.pattern` | Pattern 使用分布 | A 使用率 0% (= S2 で発話されない) なら異常 |
| `coalter.consent` | 同意・再有効化率 | enable 後 24h 以内 active 化 0% なら adoption 失敗 |
| `coalter.legacy` | legacy fallback 率 | dispatcherUsed=true 比率が想定 (90%+) を割り込むなら異常 |
| `coalter.mode` | mode 昇格・降格率 | manual_switch だけ 100% (auto 0%) は §11.5 違反疑い |
| `coalter.rejection` | 拒否分類別件数 | coalter_retreat 多発 (10%+) は介入過剰 |
| `coalter.urgent` | 緊急介入発火率 | 1 ペア / 日あたり 5 件超は false positive 疑い |
| `coalter.ratelimit` | 連投抑制発火率 | 0 件 (= 連投チェックが機能していない) は異常 |

数値は **暫定**。観測 1 rev で実値を取り、本書 v0.2 で更新候補。

### §8.2 Sentry Discover query 例 (8 項目別 daily count)

```
event.category:"coalter.presence" AND timestamp:>=now-7d
event.category:"coalter.pattern"  AND timestamp:>=now-7d
...
```

### §8.3 異常検出時の即対応

- §8.1 の異常基準を 2 day 連続で満たす → CEO 短判断、必要なら §7 rollback
- 異常基準を満たさない → 観測継続

### §8.4 ペア観測投入の段階的拡大 (CEO 業判定)

L4-l 直後は **CEO の 1 test pair のみ** で smoke check (§6)。問題なければ:

```
day 0   : test pair 1 件 (CEO 自身)
day 1-2 : test pair 3-5 件 (招待制 closed group、CEO 知人)
day 3-4 : 異常基準クリアなら 10-20 ペア
day 5-7 : 異常基準クリアなら全 production ペア
```

各 step で §8.1 異常基準確認、満たさない場合は **段階拡大を停止 → 必要なら §7 rollback**。

CEO 方針 (CLAUDE.md): 「初期ユーザー獲得 — テストユーザーに触ってもらいフィードバックを得る」「大規模マーケティングは今はやらない、ただし少人数の初期検証ユーザー獲得 (知人・招待制) は行う」。本書 §8.4 はこの方針整合。

---

## §9 L4-m 着手判定基準

### §9.1 1 rev 観測の合格条件

以下 **すべて満たす** → L4-m 別審議に進める:

1. observation period 7 day 以上経過
2. §8.1 telemetry 8 項目すべて異常基準クリア
3. §6 smoke check 5 項目すべて違反ゼロ継続
4. CEO の visual 確認で v1.1 §11 絶対禁止 5 項目 違反ゼロ
5. ペア観測対象 ≥ 5 ペア で 7 day 連続稼働
6. rollback 発生 0 回 (rollback したら observation period reset)

### §9.2 L4-m 着手前の prerequisite 整理

L4-m = legacy CoAlterCard 削除。実行内容 (CEO 別審議で実施):

- ChatClient.tsx の line 1751-1769 (legacy 自動挿入経路) を削除
- `lib/coalter/CoAlterCard.tsx` を削除 (= production 経路から完全 unmount)
- `legacyCardAutoInsertEnabled` flag を `lib/coalter/flags.ts` から削除
- 退役計画 doc の「実行済」section に sha + 日付を追記

### §9.3 L4-m を急がない論理的理由

- legacy CoAlterCard は flag OFF で既に dead code (production 影響ゼロ)
- L4-l flip 後の 1 rev 観測中は **rollback 容易性を優先** (legacy を残しておけば即復活可)
- legacy 削除後は rollback path が `lib/coalter` 削除 file 復元になり困難化
- CEO 業判定で「flip 後の挙動が完全に安定」と判断後でないと L4-m 着手しない

### §9.4 L4-m 別審議 trigger

CEO が以下に基づき trigger:

1. §9.1 合格条件 6/6 すべて満たす
2. ペア観測対象 ≥ 50 ペア (本格運用 scale 到達)
3. L4-l rollback の必要性が「実質ゼロ」と判断できる安定期間 (≥ 14 day) 経過

別審議 trigger 後、本書とは別に L4-m execution runbook を起草 (本書範囲外)。

---

## §10 本書の closeout 条件

CEO による L4-l + L4-m **両方完了** + ペア観測安定 (≥ 50 ペア / 14 day) で本書は closeout。
closeout 後は `docs/coalter-l4l-execution-runbook-closed.md` に rename して history archive。

CoAlter プラン §10.2 完了 = 本書 closeout = goal 到達。

---

## §11 引用元 doc 一覧 (本書が正本として参照したもの)

| 引用元 | 該当箇所 |
|---|---|
| `docs/coalter-implementation-plan-layout.md` v0.3 | §0.3 commit chain / §7.12-7.14 / §10.2 完了条件 |
| `docs/coalter-runtime-contract-2026-04-24.md` | §3 cooldown / §1.7 不可侵 / §2 shared state |
| `docs/coalter-integration-contract-2026-04-24.md` | §1.6 二重表示禁止 / §2 availability |
| `docs/coalter-master-design.md` | §5 起動・介入モデル (5 状態) |
| `docs/coalter-core-ux-layered-presence.md` v1.1 | §8 S0-S8 / §11 絶対禁止 5 項目 |
| `docs/coalter-presence-state-ui-spec.md` | §6 拒否 3 分類 / §8 共有メモリ / §8.5-§8.6 緊急介入 |
| `docs/coalter-speech-template.md` | §1.2.1 6 項目 / §1.3 / §2 共通禁止 |
| `docs/coalter-legacy-cardplacement-retirement-plan.md` | §1 退役対象 line 1741-1759 |
| `CLAUDE.md` | §0.4 不可触 / §8.4 ペア観測段階拡大方針 |

数値・閾値は引用元から継承、本書で新規提案しない。

---

**END OF RUNBOOK**
