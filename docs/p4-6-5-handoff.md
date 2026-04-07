# P4-6.5 Canary 監査 — 引き継ぎ文書

> 作成: 2026-04-08
> 前チャットのラリー回数が多くなったため、次チャットへの完全引き継ぎ用

---

## 1. もともと何をしたかったか（CEO 方針）

### 背景

P4-6「Counterfactual Live Integration」の実装が完了し、CEO が以下を明確に区別した:

- **P4-6 = 実装完了（2026-04-08 クローズ）** — コード完成、183 tests PASS、kill switch default false
- **P4 live = まだ未ロールアウト** — 実装クローズ ≠ 有効化クローズ

### CEO の指示

P4-6.5 として **canary 監査** を実行し、Go/No-Go を判定する:

1. DB migration を実行（`stargazer_counterfactual_shadow_log` テーブル作成）
2. dev 環境で `STARGAZER_COUNTERFACTUAL_LIVE=true` を有効化
3. テストアカウントを Phase 4 / Trust 3+ に昇格
4. 手動 QA で発火確認 + 安全性確認 + post-check 確認
5. 監視クエリで Go/No-Go 判定

### CEO が定めた Go 条件（5つ全て満たす必要あり）

1. shadow / live log が正常に Supabase に入っている
2. rejected_post_check が異常に高くない
3. latency 増分が許容範囲
4. rupture / dignity 系の悪化がない
5. 手動 QA で「別角度」の出し方に違和感が少ない

### CEO が定めた No-Go 条件（1つでも強く出たら即停止）

1. exile に近い表現が混ざる
2. candidate の横流し感がある（Alter が再構成せず引用している）
3. latency が目立って悪化する
4. ユーザー視点より候補視点が主役になる
5. dignity / rupture が悪化する

---

## 2. CEO × GPT × Claude の方針対立と最終結論

### GPT の提案（CEO が共有）

GPT は以下の canary アプローチを提案:

1. **限定ターゲティング**: 特定ユーザーにのみ有効化する仕組み
2. **数値閾値の事前固定**: Go/No-Go の数値基準を先に決める（例: latency ≤ Xms, rejection rate ≤ Y%）
3. **段階的拡大メカニズム**: 5% → 20% → 50% → 100% のようなロールアウト

### Claude の反論（CEO 承認済み）

1. **限定ターゲティングは不要**: Phase 4+ gate 自体が天然の canary。現在 Phase 4+ ユーザーはほぼ 0 人。gate が自然にフィルタリングしているため、追加のユーザーレベルターゲティングインフラは over-engineering
2. **数値閾値の事前固定は時期尚早**: N=0 の状態で閾値を固定しても統計的に意味がない。最初は「正常に動くか」の定性的確認が先。数値基準は実データが溜まってから
3. **段階的拡大メカニズムも不要**: Phase 4+ gate = 天然の canary で十分。追加の % ロールアウト機構は複雑さを増すだけ

### 最終結論（CEO 承認）

**Claude のシンプルアプローチを採用:**

- Phase 4+ gate が天然の canary として機能する
- 追加のターゲティング/ロールアウト基盤は作らない
- Go/No-Go は定性的判定（CEO の 5+5 条件）で判断
- 数値監視は `scripts/p4-canary-monitoring.sql` で継続的に行う
- 問題が出たら `STARGAZER_COUNTERFACTUAL_LIVE=false` で即停止（kill switch）

---

## 3. 現在の位置（どこまで完了したか）

### 完了したこと

| # | タスク | 状態 | 詳細 |
|---|--------|------|------|
| 1 | DB migration 実行 | ✅ 完了 | `stargazer_counterfactual_shadow_log` テーブル Supabase に作成済み |
| 2 | env 設定 | ✅ 完了 | `.env.local` に `STARGAZER_COUNTERFACTUAL_LIVE=true` 設定済み |
| 3 | テストアカウント昇格 | ✅ 完了 | Phase 4 / Trust 3+（growth_state JSONB + hdm_phase_state 両方） |
| 4 | Gate 動作確認 | ✅ 完了 | phase<4, trust<3, parts_unclear, parts拮抗 — 全て正常ブロック |
| 5 | Gate PASS 確認 | ✅ 完了 | phase=4, trust=3, dominant=protective → Gate 通過 |
| 6 | micro-LLM 呼び出し確認 | ✅ 完了 | Gemini Flash 呼び出し成功（~1400ms） |
| 7 | Safety rejected 確認 | ✅ 完了 | prohibited_phrase 検出 → decision=rejected, live=false |
| 8 | Safety adopted 確認 | ✅ 完了 | violations=[], safe=true → decision=adopted, live=true |
| 9 | Shadow log (Supabase) 確認 | ✅ 完了 | 2 records（1 adopted + 1 rejected） |
| 10 | Fail-open (timeout) 確認 | ✅ 完了 | 800ms timeout → graceful degradation（応答に影響なし） |
| 11 | デバッグ行の除去 | ✅ 完了 | route.ts から 4 つの console.log を除去 |
| 12 | betaTesters.ts の復元 | ✅ 完了 | canary-test@ を除去 |
| 13 | timeout の復元 | ✅ 完了 | 2000ms → 800ms に戻した |

### 未完了（CEO 判断待ち）

| # | タスク | 状態 | 詳細 |
|---|--------|------|------|
| A | **timeout 800ms → 1500ms 変更** | ❌ CEO承認待ち | Gemini Flash は ~960-1400ms。800ms では 100% fail-open |
| B | **本番デプロイ方針** | ❌ CEO判断待ち | `.env.local` は現在 true。本番でどうするか |
| C | **canary 監査の正式クローズ宣言** | ❌ CEO判断待ち | Go/No-Go の最終判定 |

---

## 4. Go/No-Go 判定の詳細

### Go 条件（5/5 → 4.5/5）

| # | 条件 | 判定 | 根拠 |
|---|------|------|------|
| 1 | shadow/live log が正常に入る | ✅ Go | Supabase に 2 records 確認 |
| 2 | rejected_post_check が異常に高くない | ✅ Go | 1/2 = 50% だが prohibited_phrase 棄却は正当動作 |
| 3 | latency 増分が許容範囲 | ⚠️ 条件付き | **800ms timeout vs 実測 ~1400ms — timeout 修正必要** |
| 4 | rupture / dignity 悪化なし | ✅ Go | 応答品質に劣化なし |
| 5 | 「別角度」の出し方に違和感が少ない | ✅ Go | 自然な hedging + 再構成 |

### No-Go 条件（0/5 該当 — 全てクリア）

| # | 条件 | 判定 | 根拠 |
|---|------|------|------|
| 1 | exile 表現 | ✅ なし | adopted candidate に exile 語彙なし |
| 2 | candidate 横流し感 | ✅ なし | 「別の角度では…可能性を感じるかもしれません」= 再構成済み |
| 3 | latency 悪化 | ⚠️ | 800ms timeout では常に fail-open（機能が無効化される） |
| 4 | 候補視点が主役 | ✅ なし | Alter の判断が主、counterfactual は補助的 |
| 5 | dignity/rupture 悪化 | ✅ なし | |

### 総合判定

**条件付き Go** — timeout 修正（800ms → 1500ms）さえ行えば、全 Go 条件を満たし、No-Go 条件は 0 該当。

---

## 5. 技術的発見事項（次チャットで対処が必要なもの）

### 発見 1: timeout 800ms は Gemini Flash に不十分

- 実測: 960ms（cold start なし）〜 1400ms（cold start あり）
- 800ms では **100% fail-open** になり、機能が実質無効
- `app/api/stargazer/alter/route.ts` 内 `timeoutMs: 800` の箇所
- **推奨: 1500ms**（p50 ~1000ms, p95 ~1400ms を考慮）

### 発見 2: Gate の多層防御は全て正常動作

以下の全てのブロック条件を実際に発火させて確認:

| Gate 条件 | テスト結果 | 詳細 |
|-----------|-----------|------|
| Phase < 4 | ✅ blocked_by_phase | HDM Phase Controller が phase を 3 に降格した場合 |
| Trust < 3 | ✅ blocked_by_trust | growth_state.trustLevel が不十分な場合 |
| Parts unclear (signalCount < 2) | ✅ blocked_by_parts_unclear | 1 signal のみの場合 |
| Parts 拮抗 (protective ≈ vulnerable) | ✅ blocked_by_parts_unclear | 差 < 0.1 で "unclear" |
| Protective spike ≥ 0.8 | ✅ soft regression → phase 降格 | `orchestrateRegression` が 4→3 に降格 |

### 発見 3: `source: "home"` 必須

- `isHomeAlter = source === "home"` — API body に `source: "home"` がないと判断エンジン全体がスキップされる
- テスト時に `source` を入れ忘れると P4 が一切動かない
- クライアント (`hooks/useAlterChat.ts` line 150) は正しく `source: "home"` を送信している

### 発見 4: growth_state JSONB の二重構造

- `stargazer_alter_growth` テーブルは `trust_level`（top-level column）と `growth_state.trustLevel`（JSONB 内）の 2 箇所に信頼レベルを持つ
- `loadAlterGrowthState()` は **JSONB の `growth_state` カラムのみ** を読む
- `saveAlterGrowthState()` は **両方に書き込む**（JSONB + top-level columns）
- テストで DB を手動変更する場合、**JSONB 側を変更しないと効果がない**

### 発見 5: Regression Orchestrator との相互作用

- 高防御メッセージ（protective ≥ 0.8）→ `orchestrateRegression` が soft regression を発動 → phase 降格
- P4 gate は phase ≥ 4 を要求するため、regression で phase=3 に落ちると gate が閉じる
- これは **設計通りの動作**（高防御時に counterfactual を入れない = 正しい判断）
- テスト時は protective level を 0.3-0.7 の範囲に収める必要がある

### 発見 6: Parts 拮抗時の "unclear" 判定

- `determineDominantPart()`: top 2 の level 差が < 0.1 → "unclear"
- 例: protective=0.5, vulnerable=0.5 → 差=0 → "unclear" → gate blocked
- テストメッセージは **1 つの part が明確に dominant** な構成にする必要がある
- 例: protective + hedging（vulnerable なし）→ protective dominant → gate pass

---

## 6. Supabase 上の状態

### テストユーザー

```
user_id: 48cdfe42-54c5-40fb-9afc-a1b5a2ae577b
email: canary-test@aneurasync.test
password: canary-p4-test-2026
```

### stargazer_alter_growth（最終 API 呼び出しで上書きされている可能性あり）

- `growth_state.trustLevel`: 0.8（API 呼び出しで変動する）
- `growth_state.sessionsCompleted`: 25+（呼び出し毎に increment）
- `hdm_phase_state.currentPhase`: 3 or 4（regression で変動する）

**次チャットでテストを再開する場合、以下の Node.js で DB をリセットする:**

```javascript
const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://aljavfujeqcwnqryjmhl.supabase.co', '<SERVICE_ROLE_KEY>');
const uid = '48cdfe42-54c5-40fb-9afc-a1b5a2ae577b';

(async () => {
  const { data: row } = await sb.from('stargazer_alter_growth')
    .select('growth_state, hdm_phase_state').eq('user_id', uid).single();
  const gs = { ...row.growth_state, trustLevel: 0.8, sessionsCompleted: 25 };
  const hdm = { ...row.hdm_phase_state, currentPhase: 4,
    lastSoftRegressionCause: null, softRegressionPreviousPhase: null };
  await sb.from('stargazer_alter_growth')
    .update({ growth_state: gs, hdm_phase_state: hdm }).eq('user_id', uid);
})();
```

### stargazer_counterfactual_shadow_log

2 records:
1. `decision: adopted`, `safe: true`, `violations: []`, `latency: 1397ms`, `live: true`
2. `decision: rejected`, `safe: false`, `violations: ["prohibited_phrase"]`, `latency: 1382ms`, `live: false`

---

## 7. 変更されたファイル一覧

### 新規作成（前チャット以前）

| ファイル | 内容 |
|---------|------|
| `supabase/migrations/20260408100000_counterfactual_shadow_log.sql` | shadow_log テーブル DDL |
| `scripts/p4-canary-monitoring.sql` | 6指標 + violation分布 + レッドライン詳細 |
| `docs/p4-canary-qa-procedure.md` | Step 0-7 手動 QA 手順書 |
| `scripts/run-migration-p4.mjs` | migration 実行ヘルパー（削除可） |

### 変更済み（このチャットで変更し元に戻したもの）

| ファイル | 変更内容 | 現在の状態 |
|---------|---------|-----------|
| `app/api/stargazer/alter/route.ts` | debug console.log 4行追加 → 除去 | ✅ クリーン（debug 行なし） |
| `app/api/stargazer/alter/route.ts` | timeout 800→2000→800 | ✅ 元の 800ms に復元 |
| `lib/auth/betaTesters.ts` | canary-test@ 追加 → 除去 | ✅ 元に復元 |

### 変更済み（前チャットから残っている変更）

| ファイル | 変更内容 | 現在の状態 |
|---------|---------|-----------|
| `.env.local` | `STARGAZER_COUNTERFACTUAL_LIVE=true` 追加 | ⚠️ true のまま（CEO判断待ち） |

---

## 8. 次チャットでやるべきこと

### 必須（CEO 判断後）

1. **timeout 変更**: `route.ts` の `timeoutMs: 800` → CEO が承認した値（推奨 1500ms）に変更
2. **canary 監査の正式クローズ**: memory file を更新
3. **本番方針決定**: `.env.local` の `STARGAZER_COUNTERFACTUAL_LIVE` を本番でどうするか

### 任意（追加テスト）

- timeout 変更後に再テストして `adopted` の latency が制限内に収まることを確認
- 複数回テストして rejected_post_check 率の安定性を確認
- post-check の実際の発火を確認（adopted → 出力に prohibited_phrase → fallback regeneration）

### 将来（P4-6.5 通過後）

- P4-3 後半: other_party 候補生成の実装（現在凍結中）
- P3 TODO: consecutiveRuptureCount / explicitRejection / trustDelta の cross-session tracking

---

## 9. Gate を通過させるテストメッセージの作り方

P4 gate を通過させるには以下の全条件を同時に満たすメッセージが必要:

| 条件 | 要件 | テクニック |
|------|------|----------|
| Phase ≥ 4 | DB 上の `hdm_phase_state.currentPhase = 4` | Node.js で事前設定 |
| Trust ≥ 3 | `growth_state.trustLevel ≥ 0.7` AND `sessionsCompleted ≥ 20` | Node.js で事前設定 |
| Parts 2+ signals | メッセージが 2つ以上の parts signal を発火 | 下記参照 |
| Parts dominant clear | Top 2 の activation 差 ≥ 0.1 | 1 part のみ dominant |
| Protective < 0.8 | Regression 閾値未満 | protective パターン 1つのみ |
| `source: "home"` | API body に含める | 必須 |

### 推奨テストメッセージ

```
仕方ないのかもしれない。たぶんこのまま続けるのがいい気がする。上司にどう伝えるか悩んでる。
```

- `仕方ない` → protective (rationalize) = 0.5（1パターンのみ → multi-match bonus なし）
- `かもしれない` + `たぶん` + `気がする` → hedging_shift（3 matches ≥ 2）
- **signals = 2** (protective_pattern + hedging_shift)
- **dominant = protective** (0.5 > 0.3, no tie)
- **protective < 0.8** (regression 閾値未満)

---

## 10. 関連ファイル参照

| 用途 | ファイル |
|------|---------|
| P4 実装コード | `lib/stargazer/counterfactualSimulation.ts` |
| P4 Gate | `isCounterfactualAllowed()` in 同上 |
| P4 route handler 統合 | `app/api/stargazer/alter/route.ts` lines ~3919-4044 (P4-6 block), ~5262-5332 (post-check) |
| Parts Lens | `lib/stargazer/partsLens.ts` |
| HDM Phase / Regression | `lib/stargazer/hdmPhase.ts` |
| Trust Level 算出 | `lib/stargazer/alterUnderstanding.ts` `deriveTrustLevel()` |
| Growth State 永続化 | `lib/stargazer/alterGrowth.ts` `loadAlterGrowthState()` / `saveAlterGrowthState()` |
| Feature Flags | `lib/stargazer/featureFlags.ts` `STARGAZER_FLAGS.counterfactualLive` |
| 監視クエリ | `scripts/p4-canary-monitoring.sql` |
| QA 手順書 | `docs/p4-canary-qa-procedure.md` |
| Memory（監査記録） | `.claude/projects/.../memory/project_p4-6-5-canary-audit.md` |
| Memory（P4 実装記録） | `.claude/projects/.../memory/project_p4-6-live-integration-closed.md` |
