# オンボーディング 改善パック

## この機能を改善させるための依頼文
```
以下はAneurasyncのオンボーディングに関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（HomeTour→Home画面、ValuesOnboarding→Stargazer初期データ等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象ファイル: components/home/HomeTour.tsx, components/home/ValuesOnboardingOverlay.tsx, components/rendezvous/RendezvousOnboarding.tsx, components/rendezvous/onboarding/OnboardingFlow.tsx
```

## 1. この機能の役割
新規ユーザーがAneurasyncの核体験（自己理解の深化）に到達するまでの導線。HomeTour（画面要素の紹介）→ValuesOnboarding（初期価値観データ収集）→初回Stargazer観測への誘導。「自己理解OS」の最初の接点であり、継続率に直結。

## 2. 現状の事実
- HomeTour: 5ステップスポットライトツアー。ターゲット: orbit-dock, alter-oneliner, ask-hero, rendezvous, deep-identity
- ValuesOnboardingOverlay: 32,147バイト。HomeTour完了後に起動。5ステップ（values/passions/career/lifestyle+prefecture/romantic dealbreaker）。価値観32個、趣味10+個。localStorage + API同期
- Rendezvousオンボーディング: 3独立コンポーネント（RendezvousOnboarding, OnboardingFlow, PartnerOnboardingHub）
- 完了フラグ: aneurasync_values_onboarding_done_v1（localStorage）
- 起動条件: DB hydrationチェック後、未表示ならshowHomeTour=true（AneurasyncHome.tsx lines 298-315）
- 初回Aha Momentまで: 3日（observer到達、ストリーク3日）
- 途中離脱からの復帰: localStorageフラグのみ（デバイス変更で再表示）

## 3. 世界トップ比較
- Duolingo: 3ステップ（言語選択→レベルテスト→1レッスン）、5分で初回Aha Moment（「学べた！」）
- Headspace: 3ステップ（目的選択→呼吸体験→完了）、3分でAha Moment
- Notion: 2ステップ（テンプレート選択→即利用）、即時Aha Moment
- TikTok: 0ステップ。アルゴリズムが即座にFYPを生成
- Spotify: 3ステップ（好きなアーティスト選択→プレイリスト生成→即再生）、2分でAha Moment

## 4. 測定指標
| 指標 | 現状値 | Duolingo | Headspace | Spotify |
|------|--------|----------|-----------|---------|
| ステップ数 | 10（Tour5+Values5） | 3 | 3 | 3 |
| 初回Aha Moment | 3日 | 5分 | 3分 | 2分 |
| 初回選択肢最大数 | 32（価値観） | 20（言語） | 5（目的） | 10+（アーティスト） |
| データ保存先 | localStorage+API | サーバー | サーバー | サーバー |
| 途中離脱復帰 | localStorageフラグ | サーバー記録 | サーバー記録 | サーバー記録 |

## 5. 全問題点
1. 10ステップは競合の3倍以上。離脱率の高さが想定される
2. 価値観32選択肢はHick's Lawにより選択困難
3. 初回Aha Moment 3日は競合の100倍以上の時間
4. localStorageフラグのみ。デバイス変更で再表示、2台持ちで状態不一致
5. HomeTourのターゲット要素（orbit-dock, alter-oneliner等）が現在のHome画面に存在するか未確認
6. ValuesOnboardingの「romantic dealbreaker」ステップがRendezvous未使用ユーザーに不要
7. Rendezvousオンボーディングが独立3コンポーネント。メインオンボーディングとの整合性不明
8. betaフェーズでの完了率計測がない

## 6. 全改善案
A. ステップ数削減: 10→5。HomeTour3ステップ + Values2ステップ
B. 価値観選択肢: 32→TOP8「よく選ばれる」+ 「もっと見る」
C. 初回Aha Moment前倒し: 初回5問回答で暫定インサイト表示
D. フラグDB同期: localStorage→Supabase user_metadata
E. HomeTourターゲットの現状確認と更新
F. romantic dealbreakerステップの条件付き表示（Rendezvous興味ありの場合のみ）
G. ステップ別完了率計測の追加
H. Progressive onboarding: 初回は最小限、2-3日目に追加質問

## 7. 改善案への反証
A反証: 5ステップでは初期データ不足。Stargazerの精度向上に必要なデータ量が不足する
B反証: TOP8だけでは個性が表現できない。32選択肢だからこそ「自分を表現できた」感覚
C反証: 5問での暫定インサイトは誤りリスク。「間違った自己認識」を与える
D反証: Supabase user_metadataは容量制限あり。フラグが増えると管理困難
F反証: romantic dealbreaker除外するとRendezvous利用開始時に再度入力が必要

## 8. 反証後の再修正
A再修正: Tour3 + Values3 = 6ステップ。passionsとcareerを1ステップに統合
B再修正: 「TOP8 + もっと見る」でデフォルト表示を軽くしつつ、全32選択可能
C再修正: 「まだ数問ですが」の免責表示付きで暫定インサイト提供。Duolingoも初回レベル推定は暫定
F再修正: romantic dealbreakerはスキップ可能にする（後からSettings/Rendezvousで入力可能と明示）

## 9. 確定改善
1. ステップ別完了率計測の追加（analytics event送信）
2. HomeTourターゲット要素（data-tour属性）と現行Home画面の整合確認
3. 価値観選択「TOP8 + もっと見る」UI変更

## 10. 要検証改善
1. 現行HomeTour 5ステップの各ステップ完了率
2. ValuesOnboarding各ステップの離脱率
3. 初回5問暫定インサイトの精度（Stargazerチームと協議）

## 11. 要判断改善
1. ステップ数の削減幅（10→6 or 10→5）
2. 初回Aha Momentの前倒し（暫定インサイトのリスク許容）
3. romantic dealbreakerのスキップ可能化
4. Progressive onboarding導入の時期

## 12. 修正時の副作用 / 依存関係
- ステップ削減 → ValuesOnboardingの保存データ構造変更、初期データに依存する機能への影響確認
- 暫定インサイト → Stargazer profile APIの変更、Home ContextReelの条件分岐追加
- Tour target更新 → Home画面のdata-tour属性との整合
- analytics追加 → lib/constants.tsのANALYTICS_EVENTS拡張

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの
- 削る: 32選択肢のデフォルト全表示
- 残す: HomeTour基盤、ValuesOnboarding基盤、Rendezvousオンボーディング（独立維持）
- 強化: 完了率計測、初回Aha Moment、ステップ体験の軽量化
- 統合: passions + careerステップ

## 14. この機能が世界トップを超えるための最終条件
Duolingoは「5分で学べた感覚」、Spotifyは「2分で自分だけのプレイリスト」。Aneurasyncが超えるには: 初回セッション内に「自分って、そういう傾向があるんだ」という気づきを提供すること。10ステップの入力苦行ではなく、5問の回答で暫定インサイト→「もっと知りたい」→継続観測のフックを作る。オンボーディング自体が「最初の観測体験」になること。
