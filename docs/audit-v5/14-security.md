# Security / Auth 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのSecurity/Auth関連に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（全APIルートの認証、Supabase RLS、Stripe webhook等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: middleware.ts(不在), next.config.js, 全APIルートの認証パターン, Supabase RLS設定
```

---

## 1. この機能の役割

ユーザーデータ（性格45軸、顔写真、行動記録、マッチングデータ）を保護するセキュリティ基盤。Supabase Auth + RLSで認証・認可。369 APIルートの保護。Stripe決済のWebhook検証。

Aneurasyncが扱うデータは極めてセンシティブ: 深層心理プロファイル（Stargazer 45軸）、顔写真・体型データ（Phenotype）、行動記録（Origin）、マッチング履歴（Rendezvous）。これらの漏洩は個人の内面情報の流出に等しく、通常のWebアプリよりも高いセキュリティ水準が求められる。

---

## 2. 現状の事実

- **middleware.ts**: プロジェクトルートに存在しない
- **CSPヘッダー**: ソースコード内にContent-Security-Policy設定なし（0箇所）
- **Supabase Auth**: 140箇所でcreateServerClient/createClient使用
- **レート制限**: 14箇所で関連キーワード検出。Alter APIの429（日次上限）が主。汎用レート制限ミドルウェアなし
- **dangerouslySetInnerHTML**: 5箇所
- **入力バリデーション**: 140+箇所で何らかのバリデーション実施
- **.env管理**: .gitignoreに.env*含む。.env.localはgit追跡外（確認済み）
- **betaテスター**: 3メールアドレスがlib/auth/betaTesters.tsにハードコード
- **環境変数**: 41個（Stripe 2, Supabase 5, Storage 4, AI 4, Auth 2, Admin 4, Timezone 2, Push 3, Redis 3, Deploy 2, Other 10+）
- **Supabaseテーブル**: 288テーブル参照
- **Stripe Webhook**: checkout.session.completed, expired, async_payment系, charge.refundedを処理
- **remotePatterns hostname**: "**"（全ホスト許可）
- **bodySizeLimit**: "100mb"
- **CORS設定**: 明示的なCORS設定なし（Next.js APIルートのデフォルト動作に依存）

---

## 3. 世界トップ比較

| 基準 | 要件 | 特徴 |
|------|------|------|
| OWASP Top 10 (2021) | XSS防御（CSP必須）、認証一元化、レート制限、入力検証、セキュリティヘッダー | Webアプリセキュリティの国際基準 |
| Vercel Security | middleware.ts推奨、CSP推奨、画像ホスト制限 | Next.jsプラットフォームのベストプラクティス |
| Stripe Best Practices | Webhook署名検証、冪等性キー、PCI DSS準拠 | 決済セキュリティの最高基準 |
| SOC 2 Type II | アクセス制御、監査ログ、暗号化 | SaaS企業の信頼性基準 |
| GDPR / 個人情報保護法 | データ最小化、同意管理、削除権 | 日本・EUの個人情報保護 |

---

## 4. 測定指標

| 指標 | 現状値 | OWASP推奨 | Vercel推奨 | 金融グレード |
|------|--------|-----------|------------|-------------|
| CSPヘッダー | なし | 必須 | 推奨 | 必須 |
| middleware.ts | なし | 認証一元化推奨 | 推奨 | 必須 |
| 汎用レート制限 | なし | 必須 | 推奨 | 必須 |
| dangerouslySetInnerHTML | 5 | 最小限+サニタイズ | 最小限 | 0推奨 |
| 認証方式 | 個別(369ルート) | 一元管理 | middleware | 一元管理 |
| APIルート総数 | 369 | N/A | N/A | N/A |
| Supabase Auth使用 | 140 | N/A | N/A | N/A |
| Supabaseテーブル | 288 | N/A | N/A | N/A |
| 環境変数 | 41 | N/A | N/A | N/A |
| CORS設定 | デフォルト | 明示的設定 | 明示的設定 | 明示的設定 |
| セキュリティヘッダー | 未確認 | X-Frame-Options等必須 | 推奨 | 必須 |
| 画像ホスト制限 | 全許可(**) | ホワイトリスト | ホワイトリスト | ホワイトリスト |

---

## 5. 全問題点

1. **CSPヘッダー完全不在**: XSS防御層ゼロ。悪意あるスクリプトインジェクションへの防御がブラウザ側で効かない。Stargazerデータ（性格45軸）やOriginデータ（行動記録）の窃取リスク
2. **middleware.ts不在**: 369 APIルートの認証チェックが個別実装。1箇所の認証チェック漏れ=未認証アクセス可能。140箇所のcreateServerClient呼び出しの一貫性が保証されない
3. **汎用レート制限なし**: AI生成系API（Alter, Origin ai-draft, go-deeper等）が無制限コール可能。LLMのAPI呼び出しコスト攻撃リスク。1ユーザーが大量リクエストを送信してLLMコストを発生させられる
4. **dangerouslySetInnerHTML 5箇所のサニタイズ未確認**: XSS脆弱性の直接的リスク。サニタイズライブラリ（DOMPurify等）の使用有無が不明
5. **betaテスター3メールがソースコードにハードコード**: git履歴に個人メールアドレスが残存。公開リポジトリになった場合に個人情報流出
6. **288テーブルのRLSポリシー網羅性が未監査**: Supabase RLSはテーブル単位でポリシーを設定。1テーブルでもポリシー漏れがあれば、そのテーブルの全データにアクセス可能（RLSがデフォルトdenyかpermitかに依存）
7. **remotePatterns hostname:"**"**: 全ホストからの画像読み込み許可。SSRF(Server-Side Request Forgery)のリスク。内部ネットワークの画像URLを指定されると内部リソースにアクセスされる可能性
8. **bodySizeLimit:"100mb"**: 100MBのServer Actionペイロードを受け付ける。メモリ圧迫によるDoSリスク
9. **CORS設定がデフォルト**: Next.js APIルートのデフォルトCORSポリシーに依存。意図しないオリジンからのAPIアクセスを制御できない
10. **セキュリティヘッダー（X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security等）の設定が未確認**: クリックジャッキング等への防御が不明

---

## 6. 全改善案

A. **CSPヘッダー設定**: next.config.jsのheadersまたはmiddleware.tsで設定。default-src 'self'から開始し、段階的に緩和
B. **middleware.ts導入**: 認証ルート保護の一元化。Supabase Auth Helperのmiddlewareパターン活用
C. **AI生成系APIに汎用レート制限追加**: Upstash Rate Limit活用。ユーザー単位で1分あたりN回の制限
D. **dangerouslySetInnerHTML 5箇所のサニタイズ確認**: 各箇所でDOMPurify等のサニタイズを通しているか確認。未サニタイズなら追加
E. **betaテスターメールのDB化**: lib/auth/betaTesters.tsのハードコードメールを.envに移動。長期的にはSupabaseテーブルで管理
F. **Supabase RLSポリシーの網羅監査**: 288テーブルのうち個人データを含むテーブルを優先。stargazer_*, rendezvous_*, origin_*から着手
G. **remotePatterns ホワイトリスト化**: 実際に使用されている画像ホスト（Supabase Storage, Unsplash等）のみ許可
H. **bodySizeLimit引き下げ**: 100MBが必要な根拠を確認。ファイルアップロードはSupabase Storageの直接アップロードで対応し、Server Actionは10MBに引き下げ
I. **セキュリティヘッダー追加**: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Strict-Transport-Security設定
J. **CORS明示設定**: 許可オリジンを明示的に設定

---

## 7. 改善案への反証

- **A反証**: CSP設定は外部リソース（Sentry, Supabase, CDN, Google Fonts等）の全ドメインをallow listに追加する必要がある。不完全なCSPは正常な機能を壊す
- **B反証**: 369ルートの認証移行は大規模リファクタ。既存の個別認証ロジックとmiddlewareの二重実行リスク
- **C反証**: Upstashは既にcaching用に導入済みだが、rate limiting用の追加設定が必要。Upstash Rate Limitパッケージの追加導入
- **E反証**: 3メールなら.envで十分。DB化はオーバーエンジニアリング。テスターが増えた時にDB化すればよい
- **F反証**: 288テーブル全監査は膨大。Supabaseはデフォルトでforce_row_level_security=trueにしていれば、ポリシー未設定テーブルは全データdeny

---

## 8. 反証後の再修正

- **A再修正**: CSPはreport-only モードで開始。まず違反レポートを収集し、必要なドメインを特定してからenforcementに切り替え。段階的導入で機能破壊を回避
- **B再修正**: 全369ルートではなく、認証が必須な主要グループ（/api/stargazer/, /api/rendezvous/, /api/origin/等）から段階的適用。既存ルートは個別認証を維持しつつ、middlewareで二重チェック（安全側に倒す）
- **E再修正**: .env移動で十分。ソースコードからは即削除。git履歴はforce pushなしで新コミットで上書き。公開リポジトリ化する前にgit filter-branchを検討
- **F再修正**: 288テーブル全部ではなく、個人データを含むテーブルを優先監査。Supabaseダッシュボードでforce_row_level_securityの設定状況を確認

---

## 9. 確定改善

1. **CSPヘッダー設定（report-onlyモード）**: Content-Security-Policy-Report-Only で違反レポート収集を開始。enforcement前に影響範囲を把握
2. **dangerouslySetInnerHTML 5箇所のサニタイズ確認**: 各箇所のコードを読み、サニタイズの有無を確認。未サニタイズならDOMPurifyを追加
3. **remotePatterns hostname:"**"のホワイトリスト化**: 画像ホスト調査 → 明示的ホワイトリスト作成
4. **betaテスターメールのソースコードからの削除**: lib/auth/betaTesters.tsのハードコードメールを.envへ移動

---

## 10. 要検証改善

1. **369ルートのうち認証チェック漏れのルート数**: 全API route.tsをgrepし、createServerClient/createClientの呼び出しがないルートを特定
2. **288テーブルのRLSポリシー適用率**: Supabaseダッシュボードでforce_row_level_security設定を確認
3. **AI生成系APIの現在のリクエスト頻度**: ログ/Sentryで確認。レート制限の閾値設計の根拠に
4. **bodySizeLimit 100MBの使用箇所**: Server Actionで大容量データを送信している箇所の特定
5. **dangerouslySetInnerHTML 5箇所の入力ソース**: ユーザー入力が直接渡されているか、サーバー生成コンテンツのみか

---

## 11. 要判断改善

1. **middleware.ts導入の範囲とタイミング**: 認証のみ vs 認証+セキュリティヘッダー+レート制限。段階的導入の計画
2. **Upstashレート制限の適用範囲**: AI生成系のみ vs 全APIルート。閾値設計（1分N回の具体値）
3. **bodySizeLimit引き下げの影響**: 100MB→10MBに変更した場合に壊れる機能がないか確認
4. **公開リポジトリ化の計画**: git履歴のクリーンアップ（betaメール等）が必要かどうか

---

## 12. 修正時の副作用 / 依存関係

| 修正 | 影響範囲 | 副作用 |
|------|----------|--------|
| CSP設定 | 全ページの外部リソース読み込み | 不完全なallow listは画像/フォント/スクリプトの読み込みを阻害。report-onlyで先行確認 |
| middleware導入 | 全ルートのレスポンス | Supabase Auth Helperの設定。セッション管理の変更。既存ルートとの二重認証リスク |
| レート制限 | AI生成系APIのユーザー体験 | 閾値が低すぎるとpower userの体験を阻害。高すぎると防御効果なし |
| betaメール移動 | lib/auth/betaTesters.ts、import元 | .env読み込みに変更。テスト環境での.env設定確認が必要 |
| hostname変更 | next.config.js、全画像表示 | 実使用ホスト漏れで画像が表示されなくなる。本番反映前に全画面確認 |
| bodySizeLimit変更 | Server Action全箇所 | 大容量アップロードが壊れる可能性。ファイルアップロードフローの確認 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

| 分類 | 対象 |
|------|------|
| 削る | hostname:"**"（ホワイトリスト化）、ソースコード内betaテスターメール |
| 残す | Supabase Auth基盤、Stripe Webhook検証、.env管理体制、RLSベースの認可 |
| 強化 | CSP（新規追加）、認証一元化（middleware）、レート制限（AI API）、RLS監査、セキュリティヘッダー |
| 統合 | 認証ロジック（369ルート個別 → middleware一元化） |

---

## 14. この機能が世界トップを超えるための最終条件

OWASP Top 10の全項目クリアは最低ライン。Aneurasyncが扱うデータの特殊性を考慮し、金融グレードのセキュリティを目指す。

具体的に:

1. **CSPでXSS防御**: ブラウザ側での不正スクリプト実行を完全ブロック
2. **middleware.tsで認証一元化**: 369ルートの1箇所の漏れも許容しない構造
3. **全AI APIにレート制限**: LLMコスト攻撃を構造的に防止
4. **RLS完全監査**: 288テーブルの個人データテーブルで全ポリシー確認
5. **セキュリティヘッダー完備**: X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy

ユーザーの性格45軸データ + 顔写真 + 行動記録 + マッチング履歴という、他のどのWebアプリよりもセンシティブなデータを扱うプロダクトとして、「このアプリに自分の内面を預けても大丈夫だ」とユーザーが信頼できるセキュリティ基盤。セキュリティは機能ではなく、信頼の前提条件。
