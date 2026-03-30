# Flow Audit — ユーザージャーニー検証

Build Unit の構造監査官として、指定されたユーザーフローの全データ依存を検証してください。

対象フロー: $ARGUMENTS

## 検証内容

指定されたフローに沿って、ユーザーが辿る画面遷移を特定し、各画面で必要なデータが正しく供給されているかを検証する。

### 検証観点

1. **ページ遷移の接続**: リンク/ルーティングが正しく繋がっているか
2. **データ依存**: 各画面が必要とするデータが、前画面 or API から供給されるか
3. **状態引き継ぎ**: 画面間で引き継がれるべき状態（query params, localStorage, context）が正しく渡されるか
4. **エッジケース**: データ未取得時、エラー時、未認証時の分岐が存在するか
5. **書き込みフロー**: ユーザー入力 → API POST → DB保存 → 画面反映が繋がっているか

## 手順

### Step 1: フローの画面遷移を特定

1. 該当機能のページファイルを特定（`app/(culcept)/` or `app/`）
2. 各ページの `<Link>`, `router.push()`, `redirect()` を追跡
3. 画面遷移図を構築

### Step 2: 各画面のデータ要件を特定

1. Server Component: Supabase クエリで何を取得しているか
2. Client Component: fetch/useSWR で何を取得しているか
3. Props: 親から何を受け取っているか
4. State: localStorage / URL params から何を読んでいるか

### Step 3: データ供給の検証

各画面のデータ要件に対して:
- そのデータを返す API が存在するか
- API が返すフィールドに必要なものが含まれるか
- 認証が必要な API に認証トークンが渡されるか
- エラーレスポンス時のフォールバックがあるか

### Step 4: 書き込みフローの検証（フォーム等がある場合）

- UI の form/input → submit handler → fetch POST の接続
- API 側の受け取り → バリデーション → DB 保存の接続
- 保存後の画面反映（リダイレクト / revalidate / 状態更新）

## 出力フォーマット

```
## Flow Audit: {フロー名} [日付]

### フロー図

[1] /stargazer (StargazerHome)
  │ データ: profile, observationState
  │ API: GET /api/stargazer/profile ✅
  │      GET /api/stargazer/daily-observation ✅
  ↓ ボタン「観測を始める」
[2] /stargazer/observe (内部状態遷移)
  │ データ: questions, currentIndex
  │ API: GET /api/stargazer/pool ✅
  │ 状態: localStorage "sg_session" ⚠️ 未検出
  ↓ 回答完了
[3] POST /api/stargazer/observations
  │ リクエスト: { answers: [...] } ✅
  │ DB保存: stargazer_observations ✅
  │ レスポンス: { insights: [...] } ✅
  ↓ リダイレクト
[4] /stargazer/results
  │ データ: insights, profile (更新後)
  │ API: GET /api/stargazer/insights ❌ ← 未実装
  │ 問題: insights データの供給元がない

### 問題一覧

| # | 画面 | 問題種別 | 詳細 | 影響度 |
|---|------|---------|------|--------|
| 1 | [4] results | API未実装 | insights 取得 API が存在しない | 🔴 画面表示不可 |
| 2 | [2] observe | 状態引き継ぎ | session state の保存先未確認 | 🟡 途中離脱で消失 |

### データ依存マトリクス

| 画面 | 必要データ | 供給元 | 状態 |
|------|-----------|--------|------|
| [1] Home | profile | GET /api/stargazer/profile | ✅ |
| [1] Home | observationState | GET /api/stargazer/daily-observation | ✅ |
| [2] Observe | questions | GET /api/stargazer/pool | ✅ |
| [4] Results | insights | ??? | ❌ |

### 推奨アクション（優先順）
1. 🔴 /api/stargazer/insights エンドポイントの実装
2. 🟡 観測セッション状態の永続化方式を決定
```

## 代表的なフロー（引数のヒント）

- `stargazer-observation`: 観測開始→質問回答→結果表示
- `rendezvous-matching`: プロフィール→マッチング→メッセージ
- `onboarding`: 初回ログイン→基本設定→ホーム到達
- `genome-card-exchange`: カード生成→共有→受け取り
- `origin-diary`: 日記入力→保存→履歴表示
- `body-color-diagnosis`: 診断開始→撮影→結果表示

## 注意

- 画面数が多いフローは主要パス（happy path）のみ詳細検証、分岐は存在確認のみ
- 認証が必要なフローは「未認証時のリダイレクト」も確認
- フォーム送信→DB保存→画面反映の「書き込みループ」は特に重点検証
