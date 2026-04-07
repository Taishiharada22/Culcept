# P4-6.5 Canary QA 手順

## 前提条件

1. **migration 実行**: `20260408100000_counterfactual_shadow_log.sql` を適用済みであること
2. **env 設定**: `.env.local` に `STARGAZER_COUNTERFACTUAL_LIVE=true` を追加
3. **テストユーザー**: Phase 4+ / Trust 3+ の状態に設定済み

## Step 0: テストユーザーを Phase 4 / Trust 3+ に設定

```sql
-- Supabase SQL Editor で実行
-- 対象ユーザーの alter_growth を Phase 4 / Trust 十分に設定
UPDATE stargazer_alter_growth
SET
  hdm_phase_state = jsonb_set(
    hdm_phase_state,
    '{currentPhase}',
    '4'
  ),
  "trustLevel" = 0.8  -- deriveTrustLevel で 3+ になる水準
WHERE user_id = '<TEST_USER_ID>';
```

確認:
```sql
SELECT user_id, hdm_phase_state->>'currentPhase' AS phase, "trustLevel"
FROM stargazer_alter_growth
WHERE user_id = '<TEST_USER_ID>';
```

## Step 1: 基本発火テスト

1. テストユーザーでログイン
2. Alter に判断系の質問を投げる（例: 「転職しようか迷ってる」「上司に本音を言うべきか」）
3. ブラウザの DevTools Console で以下を確認:
   - `[P4-6]` プレフィックスのログが出力されていること
   - `Gate BLOCKED` ではなく、LLM 呼び出しが走っていること

## Step 2: 安全な統合の確認

期待動作:
- Gate PASS → micro-LLM 発火 → integration decision
- `adopted` → 応答に「別の角度」的な視点が自然に織り込まれている
- **候補テキストがそのまま引用されていない**（Alter が再構成している）
- 禁止表現（「確実に」「間違いなく」「絶対に」）が含まれていない
- 心理学用語（「プロテクター」「IFS」「防衛機制」等）が露出していない

## Step 3: post-check の動作確認

応答テキストに問題がある場合（稀だが確認が必要）:
- Console に `[P4-6] Post-check FAILED` が出る
- フォールバック再生成が走る
- `p4_live_integrated` が `false` に戻る

## Step 4: Gate BLOCK の確認

Phase 0-3 / Trust 0-2 のユーザーでは:
- `[P4-6] Gate BLOCKED: reason=...` がログに出ること
- 応答に counterfactual の影響がないこと

## Step 5: kill switch の確認

1. `.env.local` から `STARGAZER_COUNTERFACTUAL_LIVE=true` を削除（or `=false`）
2. Phase 4+ ユーザーで質問を投げる
3. P4-6 関連のログが **一切出ない** ことを確認

## Step 6: Supabase ログの確認

```sql
SELECT * FROM stargazer_counterfactual_shadow_log
ORDER BY created_at DESC
LIMIT 20;
```

確認項目:
- レコードが挿入されていること
- `decision` が期待値（adopted / rejected / weakened）であること
- `latency_ms` が 800ms 以下であること
- `violation_types` が空配列（安全な候補の場合）

## Step 7: main analytics の確認

```sql
SELECT
  metadata->>'p4_live_integrated' AS integrated,
  metadata->>'p4_decision' AS decision,
  created_at
FROM stargazer_analytics
WHERE event = 'home_alter_judgment'
  AND metadata->>'p4_decision' IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

## Go 条件（全て満たされたら有効化を広げる）

- [ ] shadow / live log が正常に Supabase に入っている
- [ ] rejected_post_check が異常に高くない
- [ ] latency 増分が許容範囲
- [ ] rupture / dignity 系の悪化がない
- [ ] 手動 QA で「別角度」の出し方に違和感が少ない

## No-Go 条件（1つでも強く出たら即 `COUNTERFACTUAL_LIVE=false`）

- [ ] exile に近い表現が混ざる
- [ ] candidate の横流し感がある（Alter が再構成せず引用している）
- [ ] latency が目立って悪化する
- [ ] ユーザー視点より候補視点が主役になる
- [ ] dignity / rupture が悪化する
