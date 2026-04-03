# Home画面 改善パック

## この機能を改善させるための依頼文
```
以下はAneurasyncのHome画面に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Alter, Stargazer, ContextReel等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象ファイル: app/AneurasyncHome.tsx, app/_home/, hooks/useHomeData.ts, components/home/
```

## 1. この機能の役割
Aneurasyncの全体験の起点。ユーザーがアプリを開いて最初に触れる画面。Alter（AI対話）への入口であり、ContextReel（インサイト巡回）を通じてStargazer観測結果のサーフェシング、InlineInnerWeather（心の天気）の表示、QuickAccess（下部ナビ）からの各機能への導線を担う。「自己理解OS」のダッシュボードではなく「会話キャンバス」として設計されている。

## 2. 現状の事実
- ファイル: `app/AneurasyncHome.tsx`（738行）
- useState: 22個、useRef: 5個、useMemo: 3個、dynamic import: 4個
- 描画コンポーネント13種: HomeHeader, LoginIntroAnimation, InlineInnerWeather(x2), ZoneErrorBoundary(x2), AlterFollowup, AnswerCard, ContextReel, AskHero, HomeQuickAccess, InlineCelebration, PostObservationReveal, HomeTour, ValuesOnboardingOverlay
- InstrumentRailはHome画面に存在しない（grep 0件確認済み。ファイルは存在するが未使用）
- データフェッチ: useHomeData hook経由で11 useQuery → 13 APIエンドポイント並行発火
- 初回表示の情報レイヤー9: ALTERラベル+Sync%, InlineInnerWeather(compact), InlineInnerWeather(full), AlterFollowup, AnswerCard, 挨拶タイプライター, ContextReel, Suggestion chips(4個固定), Composer
- CTA: 送信ボタン(1) + サジェスションチップ(4) + スクロールトップ(1) = 6個
- Suggestion chips固定: 「今日どう動く？」「なんでこうなる？」「仕事の進め方」「今日の服」
- 条件非表示: ContextReel(会話未開始時のみ), InlineCelebration(ストリーク到達時), PostObservationReveal(観測後), AlterFollowup(前回セッション有時)
- HomeQuickAccess: 下部固定ナビ
- localStorageキー使用: alter_greet_typed, alter_proposal_feedback, aneurasync_alter_daily_v1等

## 3. 世界トップ比較
- Replika: ホーム=チャット画面のみ。情報レイヤー2、CTA 1。極限シンプル
- Character.ai: キャラ選択→チャット。ホームはキャラ一覧グリッド
- Pi: 単一チャット画面。余計な情報ゼロ。挨拶→会話
- ChatGPT: チャット+サイドバー履歴。ホームは過去会話一覧
- Spotify Home: パーソナライズされたセクション x 6-8。スクロール型。各セクション横スワイプ
- Instagram Home: フィード+ストーリーズ。2レイヤーのみ

## 4. 測定指標
| 指標 | 現状値 | Replika | Pi | ChatGPT |
|------|--------|---------|-----|---------|
| 情報レイヤー数 | 9 | 2 | 1 | 3 |
| CTA数 | 6 | 1 | 1 | 2 |
| useState数 | 22 | N/A | N/A | N/A |
| API並行発火数 | 13 | N/A | N/A | N/A |
| 描画コンポーネント数 | 13 | N/A | N/A | N/A |
| 条件非表示コンポーネント | 4 | N/A | N/A | N/A |
| ファイル行数 | 738 | N/A | N/A | N/A |

## 5. 全問題点
1. InlineInnerWeatherが2箇所描画（compact + full）。同一データの重複表示
2. 初回ユーザー（観測0回）のHome画面: ContextReelデータなし、AnswerCardデータなし→挨拶+空白+Composerに縮退する可能性
3. 13 API並行発火は初回ロード時のネットワーク負荷。特にモバイル3G環境
4. useState 22個は単一コンポーネントとしてReact再レンダリングの頻度が高い
5. Suggestion chips 4個固定。ユーザーの観測段階（streak level）や時間帯に無関係
6. ContextReelの10スロットのうち、observer(3日)時点で実データが入るスロット数が不明
7. 738行の単一コンポーネントで全状態管理。カスタムhookへの分離が部分的（useHomeDerivedState, useAlterChat）
8. InstrumentRailが存在するが未使用。dead codeの兆候
9. localStorageに依存する状態（ツアー完了、フィードバック）がデバイス間で同期しない

## 6. 全改善案
A. InlineInnerWeather統合: 2箇所→1箇所。展開/折りたたみで切替
B. 初回ユーザー専用レイアウト: 観測0回時の導入コンテンツ設計
C. API発火の優先度制御: 画面上部のデータを優先、下部は遅延発火
D. useState分離: 22個を3-4個のカスタムhookに整理
E. 動的Suggestion chips: ストリークレベル x 時間帯で内容を変更
F. ContextReelのフォールバック: データ不足時の代替表示（「まず最初の観測を始めよう」等）
G. InstrumentRail削除（使われていないなら）
H. localStorage→DB同期: ツアー完了等のフラグをサーバーサイドに
I. AnswerCardのスケルトン表示: データロード中のローディングUI

## 7. 改善案への反証
A反証: InlineInnerWeather 2箇所は意図的設計の可能性（compactはバーに常時表示、fullは詳細入力用）→UI的に別目的なら統合不適切
B反証: 初回ユーザーが少ない段階（betaフェーズ）で初回UXに投資する優先度は低い可能性
C反証: React Queryのキャッシュにより2回目以降は並行発火でも瞬時。初回のみの問題
D反証: useState分離はリファクタであり機能改善ではない。ユーザー体験に直接影響しない
E反証: 動的chips実装コスト vs 4個固定で十分な可能性。betaフェーズでは固定で検証すべき
H反証: localStorage→DB同期はSupabase RLSの設計追加が必要。コスト高

## 8. 反証後の再修正
A再修正: compact版とfull版の目的が異なるか確認。異なるなら別コンポーネントとして明確化。同一目的なら統合
B再修正: 初回UXは「初回Aha Moment」に直結するため優先度は高い。ただし「最小限の変更」で対応（ContextReelのフォールバック追加のみ）
C再修正: staleTimeの確認。初回ロードのWaterfall分析実施が先
E再修正: betaフェーズでは固定維持。ただし「今日の服」は観測データ不足時に無意味→観測0回時は別chipに差替え

## 9. 確定改善
1. InstrumentRail.tsxの参照確認→未使用なら削除
2. ContextReelのデータ不足時フォールバック追加（「観測を始めると、ここにあなたのインサイトが表示されます」）
3. AnswerCardのスケルトンローディング追加

## 10. 要検証改善
1. 初回ユーザー（観測0回）のHome画面レンダリングをテストアカウントで実確認
2. ContextReelの表示スロット数をストリークレベル別に計測
3. 13 API並行発火の初回ロード時間計測（3G throttle）
4. InlineInnerWeather 2箇所の設計意図確認

## 11. 要判断改善
1. Suggestion chipsの動的化（betaフェーズでの投資判断）
2. useState 22個のhook分離（リファクタ優先度）
3. localStorage→DB同期のタイミング

## 12. 修正時の副作用 / 依存関係
- ContextReelフォールバック追加 → ContextReelコンポーネント自体の修正が必要
- InstrumentRail削除 → 他画面で使われていないか確認必要
- API発火順序変更 → useHomeData.tsのuseQuery設定変更。他hookでの参照に影響
- InlineInnerWeather統合 → innerWeatherデータの流れ確認（API: /api/stargazer/inner-weather）

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの
- 削る: InstrumentRail（未使用確認後）、InlineInnerWeather重複の1箇所
- 残す: Composer + AskHero（核体験）、HomeQuickAccess（ナビ）、HomeTour/ValuesOnboarding（初回フロー）
- 強化: ContextReel（フォールバック追加、段階的開示）、Suggestion chips（将来の動的化）
- 統合: InlineInnerWeather 2箇所→1箇所（目的確認後）

## 14. この機能が世界トップを超えるための最終条件
Home画面が「チャットアプリのホーム」ではなく「パーソナライズされた自己理解ダッシュボード」として機能すること。具体的には: (1) ContextReelが全ストリークレベルで有意な表示を行い、(2) Suggestion chipsがユーザーの現在の観測状態を反映し、(3) 初回ユーザーでも「このアプリは自分を理解してくれる」と感じるファーストインプレッションを達成すること。Spotifyの「あなただけのホーム」体験をAI自己理解文脈で実現する。
