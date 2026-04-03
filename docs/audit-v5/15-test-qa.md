# Test / QA 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのTest/QA関連に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（CI/CD、Sentry、TypeScript設定等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: .github/workflows/, tests/e2e/, *.test.ts/*.test.tsx全ファイル, tsconfig.json, playwright.config.ts, eslint.config.mjs
```

---

## 1. この機能の役割

642,437行のコードベースの品質保証。ユニットテスト、E2Eテスト、CI/CD、型チェック、リンティング、エラーモニタリングで品質を担保。本番環境の安定性とリグレッション防止。

テスト基盤はAneurasyncの「壊れない」ことを保証する唯一の仕組みであり、145ページ x 369 APIルートの全組み合わせでリグレッションを防ぐ。

---

## 2. 現状の事実

- **テストファイル**: 55個（.test.ts / .test.tsx / .spec.ts / .spec.tsx）
- **E2Eテスト**: Playwright。23 specファイル（tests/e2e/）
  - 対象: anonymous auth, API health, auth redirect, battle, calendar, genome card, home sections, my-style, origin, personal color, presence, rendezvous, stargazer(5 specs)
- **CI/CD**: 2ワークフロー
  - ci.yml: PR/push to main → lint + unit tests。Node 24、ubuntu-latest、timeout 10分
  - expire-orders.yml: cron 5分毎（注文期限切れ処理）
- **CIコマンド**: `npm run lint` + `npm run test:unit`。E2E自動実行なし
- **Sentry**: global-error.tsxでcaptureException。next.config.jsでwithSentryConfig
- **TypeScript**: tsconfig.json strict:true。ただしnext.config.js ignoreBuildErrors:true
- **テストカバレッジ計測**: なし（istanbul/c8等未導入）
- **Visual regression**: なし（Chromatic/Percy等未導入）
- **テストフレームワーク**: Vitest（ユニット）+ Playwright（E2E）
- **テストデータ管理**: 未確認（fixture/factory/seed等）
- **モック戦略**: 未確認（Supabase/LLM APIのモック方法）

---

## 3. 世界トップ比較

| サービス | テスト戦略 | 特徴 |
|----------|-----------|------|
| Stripe | カバレッジ90%+、自動E2E、visual regression | テストが文化。全PRでカバレッジゲート |
| Vercel | E2E CI必須、カバレッジゲート | Next.jsプラットフォームとして自らの推奨を実践 |
| Linear | E2E + visual regression + performance budget | UIの見た目変更を自動検出 |
| Netflix | Chaos engineering、canary deploy、A/Bテスト基盤 | 本番環境の耐障害性をテスト |
| Figma | 単体テスト + E2E + visual snapshot | WebAssembly部分の特殊テスト含む |
| Google | mutation testing、property-based testing | テストの「テスト」を実施 |

---

## 4. 測定指標

| 指標 | 現状値 | Stripe | Vercel推奨 | 業界標準 |
|------|--------|--------|------------|---------|
| テストファイル数 | 55 | N/A | N/A | N/A |
| E2E spec数 | 23 | N/A | 主要フロー全カバー | 主要フロー |
| CI自動テスト | unit+lint | unit+integration+E2E | unit+E2E | unit+E2E |
| E2E CI自動 | なし | あり | 推奨 | 推奨 |
| strict mode | true | true | true | true |
| ignoreBuildErrors | true | false | false | false |
| カバレッジ計測 | なし | 90%+ | 推奨 | 60%+ |
| visual regression | なし | あり | 推奨 | 任意 |
| テスト/コード比率 | 55/642K行 | N/A | N/A | N/A |
| CI timeout | 10分 | N/A | N/A | N/A |

---

## 5. 全問題点

1. **E2EテストがCIに含まれない**: 23 specが存在するがCI自動実行なし。PR マージ時にE2Eリグレッションを自動検出できない。手動実行に依存
2. **テストファイル55個 / 642,437行 = 極めて低いテスト密度**: 仮にテスト1ファイルあたり50行のテストコードとしても2,750行。カバレッジは推定1%未満
3. **ignoreBuildErrors:true + strict:true の矛盾**: TypeScript strict:trueの型安全性をignoreBuildErrorsが無効化。CIのtsc --noEmitで型チェックしているが、ビルドプロセスとの整合性なし
4. **テストカバレッジ計測なし**: 品質の定量評価が不可能。どの機能がテスト済みで、どの機能がテストされていないかが不明
5. **Sentryがglobal-error.tsxのみ**: APIルート（369個）のサーバーサイドエラー監視が不明。LLM API呼び出しのエラーレート、Supabaseクエリのエラー等が計測されていない可能性
6. **Visual regressionなし**: Glassmorphism UIの見た目変更を自動検出不可。CSSの1行変更が全画面に影響するリスクをテストで捕捉できない
7. **ci.ymlのtimeout 10分**: テスト増加に伴いタイムアウトリスク。E2E追加で確実に10分を超える
8. **テストデータ管理の体系化不明**: Supabaseのテストデータ（fixture/seed）がどう管理されているか未確認。テスト間のデータ干渉リスク
9. **LLM APIのモック戦略不明**: Alter, Origin ai-draft等のLLM呼び出しをテストでどうモックしているか未確認。実APIを叩いているならテスト毎にコスト発生

---

## 6. 全改善案

A. **CIにE2Eテスト実行追加**: Playwright GitHub Actionでsmoke test（主要フロー3-5 spec）をPR毎に実行
B. **テストカバレッジ計測導入**: Vitest + c8/istanbulでカバレッジ計測。PRにカバレッジレポート表示
C. **ignoreBuildErrors解消**: OOM根本原因調査。incremental compilation活用、--max-old-space-size拡張
D. **APIルートへのSentryトランザクション追加**: 全369ルートのエラーとパフォーマンスを計測
E. **Visual regression導入**: Chromatic（Storybook連携）またはPlaywright visual comparison
F. **新規コードのテスト必須ルール制定**: PRレビューでテストファイルの有無をチェック
G. **ci.yml timeout拡大**: 10分→20分（E2E追加を見据えて）
H. **テストデータ管理の体系化**: Supabase test fixture/factoryパターンの導入
I. **LLM APIモック戦略の確立**: MSW(Mock Service Worker)でLLMレスポンスをモック

---

## 7. 改善案への反証

- **A反証**: E2E CIはCI時間大幅増加。Playwrightの実行は1 specあたり30秒-2分。5 specで5-10分追加。PRのフィードバック速度低下
- **B反証**: カバレッジ計測は数値目標のための計測になりがち。「カバレッジ60%」を達成するための意味のないテスト（assert true）が増えるリスク。低カバレッジでもE2Eで品質は保てる
- **C反証**: OOM根本解決はtsc/Next.jsの問題。642,437行のプロジェクトではtscのメモリ使用量が構造的に大きい。プロダクトコードの分割以外の解決策が限られる
- **E反証**: Chromatic等の外部サービスはコスト追加（月額$149-$349/team）。Playwright visual comparisonは無料だがスナップショット管理が煩雑
- **F反証**: テスト必須ルールはPRレビューの負荷増加。βフェーズのスピードを優先すべき時期にテスト強制は逆効果の可能性

---

## 8. 反証後の再修正

- **A再修正**: 全23 specではなくsmoke test（home, auth, stargazerの3 spec）のみCI実行。残りはnightly job（深夜に全E2E実行、失敗時にSlack通知）。CI時間増加は3-5分程度に抑制
- **B再修正**: 全体カバレッジの数値目標ではなく、新規PRの diff部分のみカバレッジ計測。既存コードは遡求しない。新規コードの品質のみ可視化
- **C再修正**: incremental compilationの活用確認（tsconfig.jsonのincremental:true + .tsbuildinfo）。CI環境で--max-old-space-size=4096を設定。それでもOOMなら段階的にignoreBuildErrorsを解消（特定ディレクトリのみtsc対象にする等）
- **E再修正**: Playwright visual comparison（無料）で開始。スナップショットはgit LFSで管理。Chromaticは規模拡大後に検討
- **F再修正**: テスト必須は強制ではなくPRテンプレートでのチェックリスト項目（任意）として導入。強制はβ後

---

## 9. 確定改善

1. **CIにPlaywright smoke test追加**: home, auth, stargazerの3 specをPR毎に実行。GitHub Actionsのplaywright.ymlを新規作成またはci.ymlに追加
2. **APIルートへのSentryエラーモニタリング追加**: 主要APIルート（/api/stargazer/, /api/alter/, /api/origin/）にSentry.captureExceptionを追加
3. **ci.yml timeout 10分→20分に拡大**: E2E追加とテスト増加に備える

---

## 10. 要検証改善

1. **OOMの発生条件**: CIログでOOMがどのフェーズ（tsc/next build/webpack）で発生するか。incremental compilation(.tsbuildinfo)の有無
2. **55テストファイルのカバー範囲**: どの機能がテスト済みか。テストファイル一覧と対応機能のマッピング
3. **Sentry error volume**: 現在のエラー発生頻度。監視追加の優先順位付け
4. **LLM APIモックの現状**: テストでLLM APIを実際に呼んでいるか、モックしているか
5. **23 E2Eスペックの実行時間**: 全spec実行にかかる時間。CI追加時の影響見積もり

---

## 11. 要判断改善

1. **テストカバレッジ計測導入の優先度**: βフェーズでは不要か、品質可視化のために早期導入か
2. **Visual regression導入のタイミング**: Glassmorphism UIの安定度次第。UIが頻繁に変わるフェーズではスナップショット更新が煩雑
3. **ignoreBuildErrors解消の方法**: OOM対策とセットで実施するか。--max-old-space-sizeで解決するか
4. **nightly E2Eジョブの導入**: 全23 specを深夜実行するcronジョブの必要性

---

## 12. 修正時の副作用 / 依存関係

| 修正 | 影響範囲 | 副作用 |
|------|----------|--------|
| E2E CI追加 | .github/workflows/ci.yml or 新規yml | Playwright GitHub Actionのセットアップ。シークレット設定（SUPABASE_URL, SUPABASE_ANON_KEY等）。CI実行時間3-5分増加 |
| Sentry追加 | 各APIルートのtry/catch | Sentry SDK呼び出し追加。微小なレイテンシ増加。エラーvolume増加によるSentry課金影響 |
| timeout拡大 | .github/workflows/ci.yml | GitHub Actions料金への影響（分課金制。ただしOSS/無料枠の範囲内なら影響なし） |
| テストデータ管理 | テスト環境のSupabase | テスト用データベースの準備。本番DBとの分離確認 |
| visual regression | テストインフラ | スナップショットファイルのgit管理。リポジトリサイズ増加 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

| 分類 | 対象 |
|------|------|
| 削る | なし（テスト基盤で削除すべきものはない） |
| 残す | 55テストファイル、23 E2E spec、Sentry基盤、Vitest + Playwright構成、strict:true |
| 強化 | CI E2E自動化（smoke test 3 spec追加）、Sentryカバレッジ（APIルート対応）、timeout拡大、テストデータ管理 |
| 統合 | なし |

---

## 14. この機能が世界トップを超えるための最終条件

Stripe級のテスト文化の確立。具体的には:

1. **全PRでE2E smoke自動実行**: マージ前にhome/auth/stargazerの基本フローが壊れていないことを保証
2. **新規コードのテスト伴走**: 新機能追加時にテストファイルも同時に追加する文化。強制ではなくPRテンプレートで促進
3. **カバレッジの可視化**: 数値目標ではなく「どこがテストされていないか」の可視化。盲点の特定
4. **Sentryで全APIエラー監視**: 369ルートのエラーをリアルタイム監視。エラーレートの閾値超えでアラート
5. **ignoreBuildErrors:false**: 型安全性がビルドプロセスに完全統合。型エラー=ビルド失敗=マージ不可

642,437行のコードベースを安全にイテレーションし続けられるCI/CD基盤。「壊れたらすぐわかる」「壊れたら自動で止まる」が当たり前の状態。

最終的な目標: テストが「やらなければならない義務」ではなく「安心して変更できる自由」として機能すること。Aneurasyncの45軸深層観測データやマッチングアルゴリズムのような複雑なロジックを、テストがあるからこそ大胆にリファクタリングできる状態。
