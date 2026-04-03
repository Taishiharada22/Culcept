# 第3部: 個別改善依頼文集
## 各機能を別Claudeセッションに投げるための依頼文

> **使い方**: 各セクションの依頼文をコピーし、対応するパックファイル（01-19）の全文と一緒に新しいClaudeセッションに貼り付ける。

---

## 01. Home画面

### 対象範囲
`app/AneurasyncHome.tsx`（738行）、`app/_home/`、`hooks/useHomeData.ts`、`components/home/`

### 現状の主問題
- 情報レイヤー9個、CTA 6個は競合（Replika: 2レイヤー、Pi: 1レイヤー）の3-9倍
- useState 22個の単一コンポーネント
- 13 APIエンドポイント並行発火
- 初回ユーザー（観測0回）のHome画面が空白に縮退する可能性

### 依頼文
```
添付の監査パック「01-home.md」に基づき、AneurasyncのHome画面を改善してください。

対象ファイル:
- app/AneurasyncHome.tsx（738行）
- app/_home/（定数・hook・ユーティリティ）
- hooks/useHomeData.ts（11 useQuery、13 APIエンドポイント）
- components/home/（51ファイル）

必須タスク:
1. 監査パックの「確定改善」3件を全て実装してください
2. InstrumentRail.tsxが他画面でも使われていないか確認し、完全未使用なら削除
3. ContextReelのデータ不足時フォールバック（観測0回ユーザー向け）を実装
4. AnswerCardのスケルトンローディングを実装

追加で洗い出すべき論点:
- InlineInnerWeather 2箇所の設計意図確認と統合可否
- useState 22個のカスタムhook分離方針
- Suggestion chips 4個の動的化設計
- 13 API並行発火の初回ロード影響

世界トップ比較:
- Replika（情報レイヤー2）、Pi（1）、ChatGPT（3）、Spotify Home（パーソナライズ6-8セクション）
- Aneurasyncが「チャットアプリのホーム」ではなく「パーソナライズされた自己理解ダッシュボード」として機能するための設計

反証必須: 全改善案に対して反証→再修正のプロセスを経てください。
完全改善設計を出すこと: 無難な修正ではなく、世界トップを超える設計まで提案してください。

注意:
- 他機能との依存（Alter, Stargazer ContextReel, useHomeData等）を考慮
- CLAUDE.mdの「State Safety Rule」に従いgit操作を行うこと
- UIラベルは日本語
```

---

## 02. Alter（AI対話エンジン）

### 対象範囲
`hooks/useAlterChat.ts`、`app/api/stargazer/alter/route.ts`（4,123行）、`lib/stargazer/alterHomeAdapter.ts`（5,746行）、`components/home/AskHero.tsx`、`components/home/AnswerCard.tsx`

### 現状の主問題
- 会話履歴がReact stateのみ。リロードで消失。DB永続化なし
- 4,123行の単一ルートファイル（Phase分割がファイル内に留まる）
- 日次5回上限。Daily Guidance Engine利用で即消費
- リトライロジックなし

### 依頼文
```
添付の監査パック「02-alter.md」に基づき、AneurasyncのAlter（AI対話エンジン）を改善してください。

対象ファイル:
- hooks/useAlterChat.ts（251行、MAX_DAILY_ROUNDS=5）
- app/api/stargazer/alter/route.ts（4,123行、5Phase パイプライン）
- lib/stargazer/alterHomeAdapter.ts（5,746行、ForceBalance+ActionShape+P1-Aルーター）
- components/home/AskHero.tsx, AnswerCard.tsx, AlterFollowup.tsx

必須タスク:
1. alter/route.tsをPhase別モジュールに分割（route.tsはオーケストレーションのみ）
2. 残り回数のUI明示を実装（useAlterChat.tsのremainingRoundsをAskHeroに表示）
3. リトライロジック追加（1回リトライ、3秒待機）

追加で洗い出すべき論点:
- 会話履歴のDB永続化 vs 意図的非永続の設計判断
- Talk画面（/talk/）とHome Composerの二重構造の整理
- clarifyモードの上限除外ロジックの正確性
- βテスターバイパスのスケーラビリティ

世界トップ比較:
- ChatGPT（無制限、DB永続、スレッド管理）、Pi（無制限、会話永続、共感重視）
- Alterの差別化=「45軸性格モデルに基づく個人化された判断支援」

反証必須・完全改善設計を出すこと。
注意: lib/stargazer/alterHomeAdapter.tsは核エンジン。変更時は既存eval（35ケースPASS90%）を壊さないこと。
```

---

## 03. Stargazer（観測エンジン）

### 対象範囲
`lib/stargazer/`（201ファイル）、`app/(immersive)/stargazer/`（10サブページ）、`app/api/stargazer/`

### 現状の主問題
- 201ファイルの規模に対してユーザー面ページは10個。エンジンの深さとUI表出のギャップ
- dead codeの可能性（201ファイル中の未参照モジュール）
- ストリーク「アンロック」と「No identity locks」設計原則の潜在的矛盾

### 依頼文
```
添付の監査パック「03-stargazer.md」に基づき、AneurasyncのStargazer（観測エンジン）を改善してください。

対象ディレクトリ:
- lib/stargazer/（201ファイル、45軸ベイズモデル、矛盾検出、IRT、ストリーク）
- app/(immersive)/stargazer/（10サブページ）
- app/api/stargazer/（profile, alter, inner-weather, prophecy, blind-spot等）

必須タスク:
1. 201ファイルの依存グラフ作成（APIやUIから参照されていないモジュールの特定）
2. サブページ10個のアクセス計測追加
3. 適応的質問選択4系統（adaptiveQuestionPool, adaptiveQ2, intraSessionAdapter, lensDiscovery）の使い分けルール明文化

追加で洗い出すべき論点:
- ストリークUIコピーの「アンロック」的表現 vs 「精度向上」的表現の確認
- 品質スコア重み（0.25/0.20/0.25/0.15/0.15）の根拠
- アーキタイプ重み減衰速度（weight=1/(1+obsCount*0.08)）の最適性
- 初回5問での暫定アーキタイプ表示の精度リスク

世界トップ比較:
- MBTI（4軸、1回完結）、16Personalities（5因子、静的）、Crystal（7軸、LinkedIn連携）
- Stargazerは45軸×ベイズ×矛盾検出×IRTで技術的には到達済み。課題はUX表出。

反証必須・完全改善設計を出すこと。
注意: Stargazerは全機能（Alter, Origin, Rendezvous, Calendar, Genome Card）のデータ基盤。変更は全機能に波及する可能性。
```

---

## 04. Onboarding

### 対象範囲
`components/home/HomeTour.tsx`、`components/home/ValuesOnboardingOverlay.tsx`（32,147B）

### 現状の主問題
- 10ステップ（Tour5+Values5）は競合の3倍以上
- 初回Aha Momentまで3日（Duolingo: 5分）
- 価値観32選択肢はHick's Law違反

### 依頼文
```
添付の監査パック「04-onboarding.md」に基づき、Aneurasyncのオンボーディングを改善してください。

対象ファイル:
- components/home/HomeTour.tsx（5ステップスポットライトツアー）
- components/home/ValuesOnboardingOverlay.tsx（32,147B、5ステップ、価値観32個）
- AneurasyncHome.tsx内のツアー起動ロジック（lines 298-315）

必須タスク:
1. ステップ別完了率計測のanalytics event送信を実装
2. HomeTourの5ターゲット要素（data-tour属性）が現行Home画面に存在するか確認・修正
3. 価値観選択「TOP8 + もっと見る」UI変更を実装

追加で洗い出すべき論点:
- 10ステップ→5-6ステップへの削減設計
- 初回Aha Moment前倒し（初回5問回答で暫定インサイト表示）の具体設計
- romantic dealbreakerステップのスキップ可能化
- Progressive onboarding（初回最小限、2-3日目に追加質問）

世界トップ比較:
- Duolingo（3ステップ、5分Aha）、Headspace（3ステップ、3分Aha）、Spotify（3ステップ、2分Aha）

反証必須・完全改善設計を出すこと。
注意: Stargazer初期データへの影響を考慮。ステップ削減がStargazer精度を下げないか検証。
```

---

## 05. Origin（ジャーナル/日記）

### 対象範囲
`app/(culcept)/origin/`（118ファイル）、`app/api/origin/`（17ルート）、`lib/origin/`（95ファイル）

### 現状の主問題
- OriginPageClient.tsx 75,257バイトの巨大単一クライアント
- β運用・機能凍結中（新機能追加禁止）
- Stargazer連携パイプラインの動作確認未実施

### 依頼文
```
添付の監査パック「05-origin.md」に基づき、AneurasyncのOrigin（ジャーナル/日記）を改善してください。

重要制約: β運用・機能凍結中（2026-03-29 Go）。新機能追加禁止。バグ修正と計測改善のみ許可。

対象:
- app/(culcept)/origin/（118ファイル、OriginPageClient.tsx 75,257B）
- app/api/origin/（17ルート、ai-draft, go-deeper等）
- lib/origin/（95ファイル、5サブシステム: Memory/DailyOrbit/LifeProfile/Timeline/Analysis）

必須タスク（凍結範囲内）:
1. Stargazer連携パイプライン（lib/origin/stargazerPipeline.ts）の動作確認テスト作成
2. β KPIクエリ（scripts/origin-beta-kpis.sql）の定期実行設定確認
3. AI機能（ai-draft, go-deeper）のLLMコスト計測追加

反証必須・完全改善設計を出すこと。凍結解除後の分割計画も策定。
```

---

## 06. Rendezvous（マッチング/ソーシャル）

### 対象範囲
`app/(immersive)/rendezvous/`（46ファイル）、`app/api/rendezvous/`（123ルート）、`lib/rendezvous/`（138ファイル）

### 現状の主問題
- 123 APIルートはスタンドアロンアプリ級（全369ルートの33%）
- 8種マッチングアルゴリズムはβプールサイズで全て有効に機能しない
- WebRTC/サウンド/ハプティクスの利用率未計測

### 依頼文
```
添付の監査パック「06-rendezvous.md」に基づき、AneurasyncのRendezvousを改善してください。

対象:
- app/api/rendezvous/（123ルート）
- lib/rendezvous/（138ファイル、8種マッチングアルゴリズム）
- app/(immersive)/rendezvous/（46ファイル、3枠設計）

必須タスク:
1. 123 APIルートのフロントエンド参照マップ作成（実際に呼ばれるルートの特定）
2. AI Counselor利用率の計測追加
3. Phase 0（既知ペア検証）の精度KPI設定（7指標の目標値定義）

世界トップ比較: Tinder, Hinge, Bumble, Pairs
差別化: 45軸深層データ×AI Counselor×3枠設計

反証必須・完全改善設計を出すこと。
注意: 価値仮説検証フェーズ。「刺さるか・続くか・広がるか」の観測に集中。機能追加ではなく計測と最適化。
```

---

## 07. Calendar / My-Style

### 対象範囲
`app/(culcept)/calendar/`（49ファイル）、`app/(immersive)/my-style/`（87ファイル）、`lib/shared/`（6ファイル）

### 現状の主問題
- 共有データ層（lib/shared/）のテスト不在
- Stargazer連携（mood/stress/energy）の影響度未計測
- 2機能の境界が不明瞭

### 依頼文
```
添付の監査パック「07-calendar-mystyle.md」に基づき、Calendar/My-Styleを改善してください。

対象:
- app/(culcept)/calendar/（49ファイル、APIルート9個）
- app/(immersive)/my-style/（87ファイル、APIルート6個）
- lib/shared/（6ファイル: location, wardrobe, wearEvents, styleProfile, deepDrill, timeOfDay）

必須タスク:
1. 共有データ層のテスト追加（型安全性確認）
2. Calendar→My-Style相互リンク強化（既存bridgeルート活用）

世界トップ比較: Cladwell, Acloset, ZOZOTOWN
反証必須・完全改善設計を出すこと。
```

---

## 08. MyPage / Profile

### 依頼文
```
添付の監査パック「08-mypage-profile.md」に基づき改善。対象: app/(culcept)/my-page/（6ファイル）、app/api/notifications/（7ルート）。必須: メニュー導線追加、Push通知計測。世界トップ: Spotify Wrapped。反証必須・完全改善設計を出すこと。
```

---

## 09. Genome Card

### 依頼文
```
添付の監査パック「09-genome-card.md」に基づき改善。対象: app/(culcept)/genome-card/（21ファイル）、app/api/genome-card/（5ルート）。必須: completeness%内訳表示、OGイメージ確認。世界トップ: Spotify Blend。反証必須・完全改善設計を出すこと。
```

---

## 10. Presence / Phenotype / 外見分析系

### 依頼文
```
添付の監査パック「10-presence-phenotype.md」に基づき改善。対象: app/(culcept)/sns/profile/（33ファイル）、app/(culcept)/body-color/（16ファイル）、Phenotype API 10ルート。必須: 結果「活用先」セクション追加、初回ガイド改善。世界トップ: Perfect Corp。反証必須・完全改善設計を出すこと。
```

---

## 11. Navigation / 情報設計

### 依頼文
```
添付の監査パック「11-navigation.md」に基づき改善。対象: lib/navigation.ts、全page.tsx（145個）。必須: ラベル/アイコン統一、backHref全ページ確認。世界トップ: Instagram（5タブシンプル）+ Notion（パンくず）。反証必須・完全改善設計を出すこと。
```

---

## 12. Design System / UI

### 依頼文
```
添付の監査パック「12-design-system.md」に基づき改善。対象: components/ui/glassmorphism-design.tsx（1,010行）、components/ui/design-system.tsx（604行、import1箇所）、lib/design-tokens.ts、CSS。必須: design-system.tsx削除、未使用@keyframes削除、ESLintルール追加。世界トップ: Stripe, Linear。反証必須・完全改善設計を出すこと。インラインスタイル8,524箇所、ハードコード色2,333箇所の段階的解消計画。
```

---

## 13. Performance / Loading

### 依頼文
```
添付の監査パック「13-performance.md」に基づき改善。対象: next.config.js、全loading.tsx（10個）、error.tsx（1個）。必須: error.tsx 3個追加、hostname ホワイトリスト化、Core Web Vitals計測。世界トップ: Vercel推奨設定。反証必須・完全改善設計を出すこと。ignoreBuildErrors:true、bodySizeLimit:100MB、middleware.ts不在の解消計画。
```

---

## 14. Security / Auth

### 依頼文
```
添付の監査パック「14-security.md」に基づき改善。対象: 全369 APIルートの認証、next.config.js、Supabase RLS。必須: CSPヘッダー設定、dangerouslySetInnerHTML確認、hostnameホワイトリスト化、βテスターメール.env移動。世界トップ: OWASP Top 10全クリア。反証必須・完全改善設計を出すこと。ユーザーの性格45軸+顔写真+行動記録という極めてセンシティブなデータを扱うことを考慮。
```

---

## 15. Test / QA

### 依頼文
```
添付の監査パック「15-test-qa.md」に基づき改善。対象: .github/workflows/ci.yml、tests/e2e/（23 spec）、全55テストファイル。必須: CI E2E smoke追加（3 spec）、Sentry APIルート監視、timeout拡大。世界トップ: Stripe（カバレッジ90%+）。反証必須・完全改善設計を出すこと。642,437行のコードベースを安全にイテレーションするCI/CD基盤設計。
```

---

## 16. Brand / Copy / Tone

### 依頼文
```
添付の監査パック「16-brand-copy.md」に基づき改善。対象: app/layout.tsx、lib/constants.ts、全UIテキスト。必須: OGイメージ確認、トーン3原則策定、Suggestion chipsトーン調整。世界トップ: Headspace。反証必須・完全改善設計を出すこと。「あなたの本質を、観測しつづける。」の世界観を全UIで一貫させる設計。
```

---

## 17. EC / Drops / Shops / Auction

### 依頼文
```
添付の監査パック「17-ec-commerce.md」に基づき改善。対象: app/(culcept)/drops/、shops/、auction/（計21ページ）、lib/stripe.ts。必須: expire-orders webhook化検討、利用率計測。重要制約: CEO方針「マネタイズ後回し」。核体験（Stargazer/Alter/Origin）との乖離を分析し、β期間の位置づけ提案。反証必須・完全改善設計を出すこと。
```

---

## 18. Monetization

### 依頼文
```
添付の監査パック「18-monetization.md」に基づき改善。対象: lib/stargazer/subscriptionTier.ts、lib/auth/betaTesters.ts、Stripe設定。必須: βテスター.env移動、課金仮説リスト作成。重要制約: CEO方針「マネタイズ後回し」。Free/Premium境界設計の仮説整理。反証必須・完全改善設計を出すこと。
```

---

## 19. Accessibility / i18n

### 依頼文
```
添付の監査パック「19-accessibility-i18n.md」に基づき改善。対象: 全tsxのaria/role属性、i18n/request.ts、messages/、FocusTrap。必須: GlassModal FocusTrap追加、prefers-reduced-motion対応。世界トップ: WCAG 2.1 AA。反証必須・完全改善設計を出すこと。sr-only 6箇所は642K行に対して極めて少ない。Glassmorphismの半透明UIはカラーコントラスト不足リスク高。
```

---

## 個別改善用パック一覧

| # | パック | 主問題 | 改善目標 | 閉じる問題か | 他機能依存 |
|---|-------|--------|---------|-------------|-----------|
| 01 | Home | 情報過多、初回空白 | パーソナライズドダッシュボード | ほぼ閉じる | Alter, Stargazer, useHomeData |
| 02 | Alter | 非永続、巨大ファイル | 個人化判断支援AI | ファイル分割は閉じる。永続化はDB設計 | Stargazer, Home |
| 03 | Stargazer | UI表出不足、dead code | エンジン深度=体験深度 | 依存グラフは閉じる。UI拡充は他機能連動 | 全機能のデータ基盤 |
| 04 | Onboarding | 10ステップ、Aha3日 | 初回セッション内Aha | ステップ削減は閉じる。Aha前倒しはStargazer依存 | Stargazer, Home |
| 05 | Origin | 75KB Client、β凍結 | 計測強化、分割計画 | 閉じる（凍結内） | Stargazer pipeline |
| 06 | Rendezvous | 123API過剰、8アルゴ | 検証に必要な最小限 | 参照マップは閉じる。絞り込みはCEO判断 | Stargazer 45軸 |
| 07 | Calendar/MyStyle | テスト不在、境界不明 | 共有層品質、相互リンク | 閉じる | lib/shared/, Stargazer |
| 08 | MyPage | 導線不足、API分散 | 全機能ハブ | 閉じる | 全機能へのリンク |
| 09 | Genome Card | completeness不透明 | カード交換体験 | 閉じる | Stargazer archetype |
| 10 | Presence/Phenotype | 活用先不明 | 分析→活用の導線 | 閉じる | Calendar, Genome Card |
| 11 | Navigation | 4セット17項目 | 迷わない情報設計 | ラベル統一は閉じる。構造見直しは全機能影響 | 全機能 |
| 12 | Design System | 8,524インライン | トークンベース統一 | DS削除は閉じる。インライン移行は長期 | 全画面UI |
| 13 | Performance | error.tsx 1個、hostname全許可 | Vercel推奨クリア | 閉じる | middleware→Security |
| 14 | Security | CSP不在、middleware不在 | OWASP Top 10クリア | CSP/hostnameは閉じる。middlewareは段階的 | 全API |
| 15 | Test/QA | E2E CI不在 | 安全なイテレーション基盤 | 閉じる | CI設定 |
| 16 | Brand/Copy | トーンガイド不在 | ブランド一貫体験 | ガイド策定は閉じる。全UI適用は長期 | 全UIテキスト |
| 17 | EC | 核体験と乖離 | β期間の位置づけ | 閉じる（凍結判断） | Navigation, Stargazer |
| 18 | Monetization | 設計未定 | 仮説整理 | 閉じる（仮説リストのみ） | subscriptionTier |
| 19 | Accessibility | sr-only 6、FocusTrap 1 | WCAG 2.1 AA | FocusTrapは閉じる。全体対応は長期 | 全UIコンポーネント |
