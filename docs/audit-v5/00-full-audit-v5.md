# Aneurasync 全体監査 V5 — 設計判断用完成版
## 2026-04-03

> **目的**: そのまま設計判断に使える監査。事実と評価を完全分離。全19カテゴリー同密度。
> **読み方**: 第1部=全体俯瞰、第2部=クロスカテゴリー分析、第3部=優先順位と実行計画

---

## 第1部: プロダクト全体の事実

### コードベース規模

| 指標 | 数値 |
|------|------|
| 総行数（TS/TSX） | 642,437 |
| ページ数（page.tsx） | 145 |
| APIルート数 | 369 |
| コンポーネント数 | 340+ |
| Supabaseテーブル参照数 | 288 |
| 環境変数 | 41 |
| localStorageキー | 101 |
| デザインシステム | 2（実質1） |
| テストファイル | 55（unit） + 23（E2E） |
| CIワークフロー | 2 |

### 機能別規模

| 機能 | lib/ ファイル数 | API ルート数 | ページ数 | コンポーネント数 |
|------|----------------|-------------|---------|----------------|
| Stargazer | 201 | 50+ | 10 | 30+ |
| Rendezvous | 138 | 123 | 46 | 27 |
| Origin | 95 | 17 | 118 | 115 |
| My-Style | 42 | 6 | 87 | 47 |
| Calendar | 27 | 9 | 49 | 23 |
| EC（Drops/Shops） | — | 6 | 21 | 23 |
| Genome Card | — | 5 | 21 | 16 |
| Presence | 4 | 10 | 33 | 19 |
| Home | — | 13(fetch) | 1 | 13(render) |

### 技術基盤の事実

| 項目 | 状態 | 備考 |
|------|------|------|
| middleware.ts | **不在** | 369ルート個別認証 |
| CSPヘッダー | **なし** | XSS防御層ゼロ |
| error.tsx | **1個のみ** | 145ページ共有 |
| loading.tsx | 10個 | 主要レイアウトカバー |
| ignoreBuildErrors | **true** | OOM防止。CIでtsc別途 |
| hostname制限 | **"**"（全許可）** | 本番リスク |
| bodySizeLimit | **100MB** | デフォルト1MBの100倍 |
| TypeScript strict | true | 有効 |
| Sentry | 有効 | global-error.tsxのみ |
| React.memo/useMemo | 700箇所 | 高採用率 |
| インラインスタイル | **8,524箇所** | トークン活用率低 |
| ハードコード色値 | **2,333箇所** | テーマ変更不可 |
| design-system.tsx | **import 1箇所** | 事実上dead code |

---

## 第2部: クロスカテゴリー分析

### 2-1. 全19カテゴリーの問題・改善サマリー

| # | カテゴリー | 問題数 | 改善案数 | 確定 | 要検証 | 要判断 | 主問題 |
|---|-----------|--------|---------|------|--------|--------|--------|
| 1 | Home | 9 | 9 | 3 | 4 | 3 | 情報レイヤー9、useState22、初回空白 |
| 2 | Alter | 9 | 9 | 3 | 4 | 3 | 会話非永続、4,123行単一ファイル |
| 3 | Stargazer | 8 | 8 | 3 | 4 | 3 | 201ファイルvs UI10ページ、dead code |
| 4 | Onboarding | 8 | 8 | 3 | 3 | 4 | 10ステップ、初回Aha3日 |
| 5 | Origin | 7 | 6 | 3 | 4 | 3 | 75KB単一Client、β凍結中 |
| 6 | Rendezvous | 8 | 6 | 3 | 4 | 3 | 123API、8アルゴリズム過剰 |
| 7 | Calendar/MyStyle | 6 | 5 | 2 | 3 | 2 | 共有データ層テスト不在 |
| 8 | MyPage/Profile | 6 | 5 | 2 | 3 | 2 | 7API分散、導線不足 |
| 9 | Genome Card | 6 | 5 | 2 | 3 | 2 | completeness不透明 |
| 10 | Presence/Phenotype | 6 | 6 | 2 | 3 | 2 | 結果活用先不明 |
| 11 | Navigation | 6 | 6 | 2 | 3 | 3 | 4セット17項目、深度7 |
| 12 | Design System | 7 | 6 | 3 | 3 | 3 | 8,524インラインスタイル |
| 13 | Performance | 8 | 8 | 3 | 4 | 3 | error.tsx 1個、hostname全許可 |
| 14 | Security | 8 | 8 | 4 | 3 | 3 | CSP不在、middleware不在 |
| 15 | Test/QA | 7 | 7 | 3 | 3 | 3 | E2E CI不在、カバレッジなし |
| 16 | Brand/Copy | 6 | 6 | 3 | 3 | 3 | トーンガイド不在 |
| 17 | EC/Commerce | 6 | 5 | 2 | 3 | 3 | 核体験との乖離 |
| 18 | Monetization | 7 | 6 | 2 | 3 | 3 | 設計未定（CEO方針「後回し」） |
| 19 | Accessibility | 8 | 6 | 3 | 3 | 3 | sr-only 6箇所、FocusTrap 1個 |
| **合計** | | **136** | **125** | **51** | **63** | **53** | |

### 2-2. 確定改善一覧（即実行可、51件）

**セキュリティ基盤（最優先）:**
1. CSPヘッダー設定（default-src 'self'から開始）
2. dangerouslySetInnerHTML 5箇所のサニタイズ確認
3. remotePatterns hostname:"**"のホワイトリスト化
4. βテスターメールのソースコード削除（.envへ移動）

**品質基盤:**
5. CIにPlaywright smoke test追加（3 spec）
6. APIルートへのSentryエラーモニタリング追加
7. ci.yml timeout 10→15分に拡大
8. error.tsx追加（Stargazer/Rendezvous/EC用の3個）

**デザイン基盤:**
9. design-system.tsx（604行）削除、参照1箇所を移行
10. 未使用@keyframes特定・削除
11. ESLintルールで新規style={{の警告追加

**Home画面:**
12. InstrumentRail.tsx参照確認→未使用なら削除
13. ContextReelデータ不足時フォールバック追加
14. AnswerCardスケルトンローディング追加

**Alter:**
15. alter/route.ts Phase別モジュール分割
16. 残り回数のUI明示
17. リトライロジック追加（1回、3秒待機）

**Stargazer:**
18. 201ファイル依存グラフ作成
19. サブページ10個のアクセス計測追加
20. 適応的質問選択4系統の使い分けルール明文化

**Onboarding:**
21. ステップ別完了率計測（analytics event）
22. HomeTourターゲットと現行Home画面の整合確認
23. 価値観選択「TOP8 + もっと見る」UI変更

**Origin:**
24. Stargazer連携パイプライン動作確認テスト
25. β KPIクエリ定期実行設定確認
26. AI機能LLMコスト計測追加

**Rendezvous:**
27. 123 APIルートのフロントエンド参照マップ作成
28. AI Counselor利用率計測追加
29. Phase 0精度KPI設定

**Calendar/MyStyle:**
30. 共有データ層テスト追加
31. Calendar→MyStyle相互リンク強化

**MyPage:**
32. メニューにCalendar/MyStyle/Rendezvous/Presence導線追加
33. Push通知送信/受信実績計測

**Genome Card:**
34. completeness%内訳表示追加
35. SNS共有OGイメージ実装状況確認

**Presence/Phenotype:**
36. Phenotype結果「活用先」セクション追加
37. Presence初回アクセスガイド改善

**Navigation:**
38. MAIN_NAV/HOME_QUICK_NAVラベル/アイコン統一確認
39. backHref/backLabel全深層ページ確認

**Brand:**
40. OGイメージ設定状況確認・追加
41. トーン3原則策定（docs/brand-tone-guide.md）
42. Suggestion chipsトーン確認・調整

**EC:**
43. expire-ordersのStripe webhookベース化検討
44. EC関連ページの利用率計測

**Monetization:**
45. βテスターソースコード削除（.envへ）
46. 課金仮説リスト作成

**Accessibility:**
47. GlassModalにFocusTrap追加
48. Home Composer aria-label確認
49. prefers-reduced-motion対応（globals.css）

**Performance（追加）:**
50. Sentry APIルート監視追加
51. Core Web Vitals計測基盤

### 2-3. 要判断事項一覧（CEO決裁、53件の主要なもの）

| # | 事項 | 影響範囲 | 判断基準 |
|---|------|---------|---------|
| 1 | Alter会話履歴DB永続化 vs 意図的非永続 | Alter, Home | 「毎回フレッシュ」が核体験に必要か |
| 2 | 初回Aha Moment前倒し（暫定アーキタイプ） | Onboarding, Stargazer | 精度リスク vs 離脱率 |
| 3 | Alter日次5回上限の調整 | Alter, LLMコスト | β利用実態データ後 |
| 4 | EC 21ページのβ期間位置づけ | EC, Navigation | CEO方針「マネタイズ後回し」との整合 |
| 5 | i18n方針（日本特化 vs 国際化準備） | Accessibility, Brand | 市場戦略 |
| 6 | middleware.ts導入範囲 | Security, Performance, 全API | 369ルートリファクタ規模 |
| 7 | ストリーク「アンロック」とNo identity locks整合 | Stargazer, Brand | UIコピーの表現方法 |
| 8 | Rendezvousアルゴリズム絞り込み | Rendezvous | βプールサイズ |
| 9 | CalendarとMyStyleの統合/分離 | Calendar, MyStyle | UX方針 |
| 10 | ダークモード対応時期 | Design System | ユーザー要望 |

---

## 第3部: 4層変化サマリー

### Layer 1: 体験の変化

| 変化 | 現状 | 目標 | 対象パック |
|------|------|------|-----------|
| 初回Aha Moment前倒し | 3日後 | 初回セッション内 | 04, 03, 01 |
| オンボーディング軽量化 | 10ステップ | 5-6ステップ | 04 |
| 会話の記憶/継続性 | リロード消失 | DB永続 or 意図的明示 | 02 |
| エラーリカバリ文脈化 | 全画面共通1個 | 機能別4個 | 13 |
| Home段階的開示 | 9レイヤー常時 | ストリーク応じて増加 | 01 |
| MyPage全機能導線 | 4項目のみ | 全機能到達可能 | 08 |

### Layer 2: 構造の変化

| 変化 | 現状 | 目標 | 対象パック |
|------|------|------|-----------|
| デザインシステム統一 | 2（223:1） | 1 | 12 |
| ナビラベル統一 | 不一致の可能性 | 同一機能=同一ラベル | 11 |
| Alterファイル分割 | 4,123行1ファイル | Phase別モジュール | 02 |
| Originクライアント分割 | 75KB 1ファイル | タブ別動的import | 05 |
| EC-核体験接続 | 分離（14.5%孤立） | Stargazer活用 or 凍結 | 17 |
| 認証一元化 | 369ルート個別 | middleware.ts | 13, 14 |
| Profile API統合 | 7箇所分散 | 集約ビュー追加 | 08 |

### Layer 3: 技術基盤の変化

| 変化 | 現状 | 目標 | 対象パック |
|------|------|------|-----------|
| CSPヘッダー | なし | default-src 'self'以上 | 14 |
| 画像ホスト制限 | 全許可 | ホワイトリスト | 13, 14 |
| E2E CI自動化 | 手動のみ | smoke on PR | 15 |
| AIレート制限 | Alterのみ5回/日 | 全AI API | 14 |
| インラインスタイル | 8,524箇所 | 新規0原則+段階移行 | 12 |
| FocusTrap | 1箇所 | 全モーダル | 19 |
| Sentryカバレッジ | global-errorのみ | 全APIルート | 15 |

### Layer 4: ブランド/コピーの変化

| 変化 | 現状 | 目標 | 対象パック |
|------|------|------|-----------|
| トーンガイド | なし（Alterのみ） | 全UI適用3原則 | 16 |
| OGイメージ | 要確認 | ブランドOG | 16 |
| i18n方針 | 2言語（実質1） | 日本特化確定 or ロードマップ | 19 |
| ストリーク表現 | 「アンロック」的 | 「精度向上」的 | 03, 16 |
| UIコピー管理 | 5+箇所分散 | レビュープロセス統一 | 16 |

---

## 第4部: 全体最適 vs 個別最適の衝突

| # | 衝突 | 機能A | 機能B | 解決方針 |
|---|------|-------|-------|---------|
| 1 | Homeシンプル化 vs Stargazer露出 | Home | Stargazer | 段階的開示で両立 |
| 2 | Alter強化 vs 観測動機 | Alter | Stargazer | Alterが観測を誘導する設計 |
| 3 | Rendezvous強化 vs 自己理解軸 | Rendezvous | 核体験 | 「観測データの応用」として位置づけ |
| 4 | EC強化 vs 核体験集中 | EC | Stargazer/Alter/Origin | β期間は凍結 |
| 5 | middleware化 vs 全ルート影響 | Security | 全機能 | 段階的適用 |
| 6 | DS統一 vs 開発速度 | Design System | 全機能 | 新規コードのみ適用 |
| 7 | Onboarding軽量化 vs 初期データ | Onboarding | Stargazer | 最小データで暫定インサイト |
| 8 | ナビシンプル化 vs 機能発見 | Navigation | 全機能 | 頻度ベース選定+検索導線 |
| 9 | i18n方針 vs 国際化選択肢 | Accessibility | 市場戦略 | 基盤残し、コピー品質のみ判断 |
| 10 | E2E CI vs PR速度 | Test/QA | 開発速度 | smoke CIのみ、fullはnightly |

---

## 第5部: 実行優先順位

### Phase A: 即時（1-2週間）— セキュリティ・品質基盤

確定改善 #1-11（CSP、hostname、βテスター、error.tsx、design-system削除、E2E CI）

### Phase B: 短期（2-4週間）— 核体験改善

確定改善 #12-29（Home、Alter分割、Stargazer計測、Onboarding軽量化、Origin/Rendezvous計測）

### Phase C: 中期（1-2ヶ月）— 構造改善

確定改善 #30-51 + 要検証項目の検証実施 + CEO判断事項の意思決定

### Phase D: 長期 — 要判断事項の実行

middleware.ts、会話永続化、ダークモード、EC再定義等

---

## 総括

Aneurasyncは「自己理解OS」として、消費者向け性格診断の深度（45軸ベイズ × 矛盾検出 × IRT適応）で前例のないエンジンを構築している。

**強み（世界トップを超えている点）:**
- Stargazer: 45軸×ベイズ更新×矛盾4種検出×IRT適応選択。MBTI/Big Fiveを根本的に超越
- Alter: ForceBalance+ActionShape判断エンジン。汎用チャットボットと一線を画す
- Origin-Stargazer連携: 日記が観測データになるパイプライン。Day One/Reflectlyにない構造

**弱み（世界トップに及ばない点）:**
- セキュリティ基盤: CSP不在、middleware不在。OWASP基準で重大ギャップ
- 初回体験: Aha Momentまで3日。Duolingo(5分)の100倍
- テスト基盤: E2E CI不在。642K行に対してテスト55ファイル
- デザインシステム: 8,524インラインスタイル。トークン活用率低

**最重要判断（CEO）:**
1. Alter会話の永続化方針
2. 初回Aha Momentの前倒し可否
3. EC機能のβ期間位置づけ
4. middleware.ts導入の決断

全19カテゴリーの個別監査パックは `docs/audit-v5/01-19` に格納。各パックは独立して別セッションに投入可能。
