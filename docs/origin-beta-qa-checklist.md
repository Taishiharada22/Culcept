# Origin Beta QA チェックリスト

## 前提条件
- [ ] Migration `20260329300000_origin_entry_records.sql` が本番 Supabase に適用済み
- [ ] `stargazer_analytics` テーブルに `origin` feature のイベントが書き込み可能

---

## 1. 認証あり環境での Entry 同期

### 1-1. 初回同期（ローカル → サーバー）
- [ ] ログイン状態で Origin ページを開く
- [ ] EntryGate で判断カテゴリを選択
- [ ] Supabase の `origin_entry_records` テーブルに行が追加されている
- [ ] `stargazer_analytics` に `origin_entry_recorded` イベントが記録されている

### 1-2. サーバー → ローカル同期
- [ ] Supabase で直接レコードを1件追加（別の日付）
- [ ] Origin ページを再読み込み
- [ ] localStorage の `origin_entry_records_v1` にサーバーのレコードが反映されている

### 1-3. 同日更新（上書き）
- [ ] 当日のエントリーを Supabase 側で別カテゴリに変更（recorded_at を最新に）
- [ ] Origin ページを再読み込み
- [ ] サーバー側のカテゴリが表示されている（サーバーが新しいため）

### 1-4. 複数端末シミュレーション
- [ ] 端末A: ブラウザで「仕事の判断」を選択
- [ ] 端末B: シークレットウインドウで同アカウントログイン → Origin を開く
- [ ] 端末B の localStorage に端末A のレコードが反映されている
- [ ] 端末B で「人間関係」を選択（別日 or 同日）
- [ ] 端末A で Origin を再読み込み → 端末B のレコードが反映されている

### 1-5. オフライン復帰
- [ ] DevTools > Network > Offline にする
- [ ] EntryGate でカテゴリ選択 → localStorage に保存されることを確認
- [ ] Network を Online に戻す
- [ ] Origin ページを再読み込み
- [ ] `origin_sync_completed` イベントで `uploaded: 1` が記録されている

---

## 2. 仮説→検証ループの実地 QA

### 2-1. 証拠カード表示
- [ ] 3日以上のエントリーがある状態で Origin の profile タブを開く
- [ ] 証拠カード（種/芽/証拠）が表示されている
- [ ] `origin_evidence_card_shown` イベントが記録されている

### 2-2. 問いかけ表示 → 仮説選択
- [ ] 14日以上のエントリー + 例外検出がある状態
- [ ] 「パターンの変化を検出」カードが表示される
- [ ] `origin_inquiry_shown` イベントが記録されている
- [ ] 仮説の選択肢をタップ → 「この仮説で観測を始める」ボタンが表示
- [ ] ボタンをタップ → 観測提案が表示
- [ ] `origin_hypothesis_created` イベントが記録されている

### 2-3. 検証結果の表示 → 確定
- [ ] 仮説作成から3日以上経過後に Origin を開く
- [ ] 「仮説の検証結果」カードが表示される
- [ ] `origin_hypothesis_evaluated` イベントが記録されている
- [ ] 「合っている」「まだ不明」「違った」のいずれかをタップ
- [ ] 「検証結果を記録しました」フィードバックが表示される
- [ ] `origin_verification_confirmed` イベントが記録されている
- [ ] 証拠カードに検証バッジが反映されている

---

## 3. イベント計測の確認

Supabase の `stargazer_analytics` テーブルで以下のイベントが全て記録されることを確認:

| イベント | 発火タイミング | 主要 metadata |
|---|---|---|
| `origin_page_view` | Origin ページ表示時 | — |
| `origin_entry_recorded` | EntryGate で選択完了時 | category, depthLevel, densityScore |
| `origin_sync_completed` | サーバー同期完了時 | uploaded, localUpdated, total |
| `origin_sync_conflict` | マージ競合（サーバー優先）時 | localCount, serverCount, mergedCount |
| `origin_evidence_card_shown` | 証拠カード表示時 | count, growths |
| `origin_inquiry_shown` | 問いかけカード表示時 | cardId, growth |
| `origin_hypothesis_created` | 仮説確定時 | cardId, selectedOption, hasFreeText |
| `origin_hypothesis_evaluated` | 自動検証実行時 | hypothesisId, result, confidence |
| `origin_verification_confirmed` | ユーザー検証確定時 | hypothesisId, aiProposal, userResult, agreed |

---

## 4. 継続率・理解度の検証指標（β運用で追跡）

- **D1/D3/D7 リテンション**: `origin_page_view` の再訪率
- **エントリー完了率**: `origin_entry_recorded` / `origin_page_view`
- **検証ループ完走率**: `origin_verification_confirmed` / `origin_hypothesis_created`
- **AI一致率**: `origin_verification_confirmed` の `agreed: true` の割合
- **同期信頼性**: `origin_sync_conflict` の頻度（低いほど良い）
