# Aneurasync 製品監査 V5 — 設計判断用ドキュメント集
## 2026-04-03

### 構成

| # | ファイル | 対象 | 問題数 | 改善案数 | 確定 | 要検証 | 要判断 |
|---|---------|------|--------|---------|------|--------|--------|
| 01 | [Home](01-home.md) | Home画面 | 9 | 9 | 3 | 4 | 3 |
| 02 | [Alter](02-alter.md) | AI対話エンジン | 9 | 9 | 3 | 4 | 3 |
| 03 | [Stargazer](03-stargazer.md) | 観測エンジン | 8 | 8 | 3 | 4 | 3 |
| 04 | [Onboarding](04-onboarding.md) | オンボーディング | 8 | 8 | 3 | 3 | 4 |
| 05 | [Origin](05-origin.md) | ジャーナル/日記 | 7 | 6 | 3 | 4 | 3 |
| 06 | [Rendezvous](06-rendezvous.md) | マッチング/ソーシャル | 8 | 6 | 3 | 4 | 3 |
| 07 | [Calendar/MyStyle](07-calendar-mystyle.md) | コーデ/スタイル分析 | 6 | 5 | 2 | 3 | 2 |
| 08 | [MyPage/Profile](08-mypage-profile.md) | マイページ/プロフィール | 6 | 5 | 2 | 3 | 2 |
| 09 | [Genome Card](09-genome-card.md) | カード交換 | 6 | 5 | 2 | 3 | 2 |
| 10 | [Presence/Phenotype](10-presence-phenotype.md) | 外見分析/人物ミラー | 6 | 6 | 2 | 3 | 2 |
| 11 | [Navigation](11-navigation.md) | ナビゲーション/情報設計 | 6 | 6 | 2 | 3 | 3 |
| 12 | [Design System](12-design-system.md) | UI/デザインシステム | 7 | 6 | 3 | 3 | 3 |
| 13 | [Performance](13-performance.md) | パフォーマンス/ローディング | 8 | 8 | 3 | 4 | 3 |
| 14 | [Security](14-security.md) | セキュリティ/認証 | 8 | 8 | 4 | 3 | 3 |
| 15 | [Test/QA](15-test-qa.md) | テスト/品質保証 | 7 | 7 | 3 | 3 | 3 |
| 16 | [Brand/Copy](16-brand-copy.md) | ブランド/コピー/トーン | 6 | 6 | 3 | 3 | 3 |
| 17 | [EC/Commerce](17-ec-commerce.md) | EC/Drops/Shops | 6 | 5 | 2 | 3 | 3 |
| 18 | [Monetization](18-monetization.md) | 課金/収益設計 | 7 | 6 | 2 | 3 | 3 |
| 19 | [Accessibility/i18n](19-accessibility-i18n.md) | アクセシビリティ/国際化 | 8 | 6 | 3 | 3 | 3 |
| — | [全体監査](00-full-audit-v5.md) | 全カテゴリー横断 | — | — | — | — | — |

### 使い方

1. **全体判断**: `00-full-audit-v5.md` を読む
2. **個別改善**: 各パック（01-19）を別のClaudeセッションに投入
3. **依頼文**: 各パック冒頭の「この機能を改善させるための依頼文」をそのままコピー

### 全機能一覧表

| 機能名 | 現状スコア(/10) | 世界トップ水準 | 問題総数 | 改善案総数 | 確定 | 要検証 | 要判断 | 主な副作用リスク | 個別投入価値 |
|--------|----------------|--------------|---------|-----------|------|--------|--------|----------------|-------------|
| Home | 6 | Spotify Home | 9 | 9 | 3 | 4 | 3 | API発火順序、ContextReel | ★★★ |
| Alter | 5 | ChatGPT/Pi | 9 | 9 | 3 | 4 | 3 | 会話永続化、LLMコスト | ★★★ |
| Stargazer | 8 | 前例なし(独自) | 8 | 8 | 3 | 4 | 3 | ストリーク/No-locks整合 | ★★★ |
| Onboarding | 4 | Duolingo | 8 | 8 | 3 | 3 | 4 | Stargazer初期データ | ★★★ |
| Origin | 6 | Day One+AI | 7 | 6 | 3 | 4 | 3 | beta凍結中 | ★★ |
| Rendezvous | 5 | Hinge | 8 | 6 | 3 | 4 | 3 | プールサイズ依存 | ★★★ |
| Calendar/MyStyle | 6 | Cladwell | 6 | 5 | 2 | 3 | 2 | Stargazer連携 | ★★ |
| MyPage/Profile | 5 | Spotify Wrapped | 6 | 5 | 2 | 3 | 2 | Profile API統合 | ★★ |
| Genome Card | 6 | Spotify Blend | 6 | 5 | 2 | 3 | 2 | Stargazerデータ | ★★ |
| Presence/Phenotype | 6 | Perfect Corp | 6 | 6 | 2 | 3 | 2 | プライバシー | ★★ |
| Navigation | 5 | Instagram/Notion | 6 | 6 | 2 | 3 | 3 | 全画面影響 | ★★ |
| Design System | 4 | Stripe/Linear | 7 | 6 | 3 | 3 | 3 | 全画面UI | ★★★ |
| Performance | 5 | Vercel推奨 | 8 | 8 | 3 | 4 | 3 | middleware導入 | ★★★ |
| Security | 3 | OWASP Top10 | 8 | 8 | 4 | 3 | 3 | CSP/認証全ルート | ★★★ |
| Test/QA | 4 | Stripe | 7 | 7 | 3 | 3 | 3 | CI時間増 | ★★★ |
| Brand/Copy | 5 | Headspace | 6 | 6 | 3 | 3 | 3 | 全UIテキスト | ★★ |
| EC/Commerce | 4 | ZOZOTOWN | 6 | 5 | 2 | 3 | 3 | ナビ変更 | ★ |
| Monetization | 3 | Spotify Freemium | 7 | 6 | 2 | 3 | 3 | Premium境界 | ★ |
| Accessibility | 3 | WCAG 2.1 AA | 8 | 6 | 3 | 3 | 3 | 全UI修正 | ★★ |

### 個別セッション投入優先度

**最優先（★★★）**: Security → Test/QA → Design System → Home → Alter → Onboarding → Stargazer → Rendezvous → Performance
**重要（★★）**: Origin → Calendar/MyStyle → Navigation → Accessibility → Brand/Copy → MyPage → Genome Card → Presence
**後回し（★）**: EC/Commerce → Monetization

### 全体最適 vs 個別最適の衝突マトリクス

| 衝突 | 機能A | 機能B | 内容 | 解決方針 |
|------|-------|-------|------|---------|
| 1 | Home（シンプル化） | Stargazer（露出増） | HomeをシンプルにするとContextReelのインサイト表示が減り、Stargazerの価値が伝わらない | 段階的開示で両立: 初回はシンプル、観測進行でリッチに |
| 2 | Alter（強化） | Stargazer（観測導線） | Alterを強化すると「Alterに聞けばいい」でStargazer観測のモチベーション低下 | Alterが「もっと精度を上げたい→観測しよう」と誘導する設計 |
| 3 | Rendezvous（強化） | 自己理解OS（軸） | Rendezvousを強化するとマッチングアプリの印象が強まり、自己理解OSの軸がぶれる | Rendezvousを「観測データの応用」として位置づけ。マッチング≠出会い系、マッチング=自己理解の出力 |
| 4 | EC（強化） | 核体験（集中） | EC強化は核体験（Stargazer/Alter/Origin）からリソースを奪う | CEO方針通りbetaフェーズでは凍結。核体験検証後にEC再定義 |
| 5 | Security（middleware化） | 全機能（認証変更） | middleware.ts導入は369ルート全ての認証フロー変更 | 段階的適用: 新規ルートから。既存は並行期間後に移行 |
| 6 | Design System（統一） | 開発速度 | インラインスタイル禁止は既存開発者の慣習変更 | 新規コードのみ適用。ESLintルールで段階的移行 |
| 7 | Onboarding（軽量化） | Stargazer（初期データ） | ステップ削減は初期データ不足→Stargazer精度低下 | 最小限のデータ収集で暫定インサイト→「もっと知りたい」→継続 |
| 8 | Navigation（シンプル化） | 全機能（発見性） | ナビセット削減は一部機能の発見困難 | 頻度ベースでメインナビに残す機能を選定。検索/発見は別導線 |
| 9 | Accessibility（i18n方針） | 市場戦略 | 日本特化→en.json削除は国際化の選択肢を閉じる | i18n基盤構造は残し、en.jsonのコピー品質のみ判断 |
| 10 | Test/QA（E2E CI化） | 開発速度 | E2E CI追加はPRフィードバック時間増（+3-5分） | smoke testのみCI。Full E2Eはnightly |
