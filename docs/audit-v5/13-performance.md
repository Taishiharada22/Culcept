# Performance / Loading 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのPerformance/Loading関連に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（全画面のロード時間、API応答、バンドルサイズ等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: next.config.js, 全loading.tsx/error.tsx, Suspense使用箇所, dynamic import箇所
```

---

## 1. この機能の役割

145ページ、369 APIルート、642,437行のコードベースのパフォーマンス基盤。ローディング状態、エラーハンドリング、コード分割、画像最適化、メモ化を管理。Next.js 15 App Router + Turbopackで構築。

パフォーマンスは「感じさせない技術」であり、ユーザーが「自分を見つめる」体験に没入できるかどうかの前提条件。遅延やエラーは没入を破壊する。

---

## 2. 現状の事実

- **loading.tsx**: 10個
  - calendar, sns/profile, genome-card, culcept, origin, my-page, rendezvous, stargazer, immersive, legal
- **error.tsx**: 1個（app/error.tsxのみ。全145ページで共有）
- **global-error.tsx**: 1個（Sentry captureException付き）
- **not-found.tsx**: 9個
- **Suspense**: 29箇所
- **dynamic import**: 58箇所
- **next/image**: 16箇所（imgタグ使用数は未計測）
- **React.memo/useMemo**: 700箇所
- **middleware.ts**: なし
- **next.config.js設定**:
  - `ignoreBuildErrors: true`（OOM防止、CIでtsc --noEmit別途検証）
  - `bodySizeLimit: "100mb"`（Server Action用）
  - `hostname: "**"`（全リモートホスト許可）
  - Turbopack有効
  - Three.js外部化（serverExternalPackages）
  - Sentry統合（withSentryConfig）
  - outputFileTracingExcludes: public/cards

---

## 3. 世界トップ比較

| サービス | パフォーマンス特性 | 特徴 |
|----------|-------------------|------|
| Vercel公式推奨 | error.tsx全レイアウト、middleware必須、CSP設定、画像最適化 | Next.jsのベストプラクティスの基準 |
| Linear | LCP<1s, FID<50ms | 極限まで最適化。Server Componentsフル活用 |
| Stripe Dashboard | skeleton loading全画面 | loading状態が美しい。体感速度が速い |
| Google | Core Web Vitals基準策定者 | LCP<2.5s, FID<100ms, CLS<0.1 |
| Figma | WebAssembly + Canvas | 重い処理をWASMに逃がす |

---

## 4. 測定指標

| 指標 | 現状値 | Next.js推奨 | Vercel推奨 | Google基準 |
|------|--------|------------|------------|-----------|
| error.tsx | 1 | レイアウト毎 | レイアウト毎 | N/A |
| loading.tsx | 10 | ページ毎推奨 | N/A | N/A |
| loading未設定ページ | 135 | 0 | N/A | N/A |
| Suspense | 29 | 積極的推奨 | N/A | N/A |
| dynamic import | 58 | 必要箇所 | N/A | N/A |
| next/image | 16 | 全画像推奨 | 全画像推奨 | N/A |
| middleware.ts | なし | 認証用推奨 | 推奨 | N/A |
| 画像ホスト制限 | **(全許可) | ホワイトリスト | ホワイトリスト | N/A |
| Server Action上限 | 100MB | 1MB(default) | N/A | N/A |
| ignoreBuildErrors | true | false推奨 | false推奨 | N/A |
| memo/useMemo | 700 | 必要箇所のみ | N/A | N/A |
| LCP | 未計測 | N/A | N/A | <2.5s |
| FID | 未計測 | N/A | N/A | <100ms |
| CLS | 未計測 | N/A | N/A | <0.1 |

---

## 5. 全問題点

1. **error.tsx 1個のみ**: Stargazer観測中のエラーとEC決済中のエラーで同一画面が表示される。機能固有のリカバリ（「観測を再開する」「決済に戻る」等）が不可能
2. **loading.tsx 10個 vs ページ135未設定**: 135ページでローディング状態が定義されておらず、白画面またはデフォルトのSuspense fallbackが表示される
3. **ignoreBuildErrors: true**: 型エラーがビルドをブロックしない。型安全性がCIのtsc --noEmitに依存しており、ビルドプロセスとの整合性が保証されない
4. **hostname:"**"（全ホスト許可）**: 任意の外部ホストからの画像読み込み許可。パフォーマンス面では、最適化対象外の巨大画像が読み込まれるリスク。セキュリティ面では画像経由の攻撃リスク
5. **bodySizeLimit:"100mb"**: 一般的デフォルト(1MB)の100倍。Server Actionで100MBのペイロードを受け付けることで、メモリ圧迫やDoSのリスク
6. **middleware.ts不在**: 認証チェックが369ルート個別実装。各ルートでのcreateServerClient呼び出しが140箇所。レスポンス前の一元的なパフォーマンス計測やキャッシュ制御が不可能
7. **next/image 16箇所のみ**: imgタグが多数使われている可能性。next/imageの自動最適化（WebP変換、遅延読み込み、サイズ最適化）が適用されない画像がある
8. **React.memo/useMemo 700箇所**: 過剰メモ化の可能性。不要なメモ化はメモリ消費を増加させ、GC負荷を上げる。React 19のコンパイラ最適化との競合も懸念
9. **Sentry統合がglobal-error.tsxのみ**: APIルート（369個）でのエラー計測が不明。サーバーサイドのパフォーマンスボトルネック特定が困難
10. **Core Web Vitals未計測**: LCP/FID/CLSの実測値がない。パフォーマンス改善の基準線が不在

---

## 6. 全改善案

A. **主要レイアウトグループにerror.tsx追加**: Stargazer/Rendezvous/Origin/EC用の4個。各々に機能固有のリカバリ導線を提供
B. **remotePatterns hostname:"**"をホワイトリスト化**: 実際に使用されている画像ホストを調査し、そのリストのみ許可
C. **bodySizeLimit確認と引き下げ**: 100MBが必要な理由を確認。不要なら10MBに引き下げ
D. **middleware.ts導入**: 認証一元化 + レスポンスヘッダー（Cache-Control等）の一元設定
E. **imgタグの使用箇所調査→next/image置換**: 特にLCPに影響するヒーロー画像を優先
F. **過剰メモ化の調査**: 700箇所のうち、propsが変わらないコンポーネントのmemoを抽出してサンプリング確認
G. **ignoreBuildErrors解消**: OOM根本原因調査。incremental compilation、--max-old-space-size拡張
H. **APIルートへのSentryトランザクション追加**: パフォーマンス計測とエラー監視
I. **Core Web Vitals計測基盤導入**: Vercel Analytics or web-vitals ライブラリ + PostHog送信
J. **主要ページへのloading.tsx追加**: 未設定135ページのうち、アクセス頻度上位10ページに優先追加

---

## 7. 改善案への反証

- **A反証**: error.tsx 4個追加は各レイアウトグループの構造理解が前提。レイアウト構造が複雑な場合、error.tsxの配置場所の判断が困難
- **D反証**: 369ルートの認証ロジックをmiddlewareに移動するリファクタは大規模。既存のcreateServerClient 140箇所との整合性確認が必要
- **E反証**: imgタグが外部ソースの画像の場合、next/imageのremotePatterns設定が必要。hostname:"**"解消（B）と連動する
- **F反証**: 700箇所のmemo精査は膨大な作業。過剰メモ化でもパフォーマンスへの実害は小さいケースが多い。React 19 Compilerが自動最適化する予定
- **G反証**: OOMの根本原因はtsc自体のメモリ使用量。プロジェクトの規模（642,437行）を考えるとtscのOOMは構造的問題

---

## 8. 反証後の再修正

- **A再修正**: レイアウトグループの構造を先に調査。(culcept)レイアウト配下のサブレイアウトを確認してからerror.tsxを配置
- **D再修正**: 全369ルートではなく、新規ルートからmiddleware適用。既存は段階的移行。初期は認証チェックのみ（パフォーマンス計測は後追い）
- **F再修正**: 700箇所全部ではなく、Home画面のReact.memo使用箇所（最もレンダリング頻度が高い）に絞ってサンプリング
- **G再修正**: incremental compilation有効化確認。tsconfig.jsonのincremental:trueが既にある場合は.tsbuildinfo活用を確認。OOMがCI環境固有なら--max-old-space-size=4096で対応

---

## 9. 確定改善

1. **error.tsx追加（3個）**: Stargazer, Rendezvous, Origin/Calendar用。各々に「機能に戻る」リカバリボタンを設置
2. **remotePatterns hostname:"**"をホワイトリスト化**: 実使用ホスト調査 → 明示的なホワイトリスト作成
3. **Core Web Vitals計測基盤導入**: web-vitals + reportWebVitals でLCP/FID/CLSの基準線取得

---

## 10. 要検証改善

1. **imgタグの使用箇所数とnext/image化の影響**: grepでimg src=を計測。LCP要素がimgタグかどうか確認
2. **700箇所のmemo/useMemoの必要性サンプリング調査**: Home画面のmemo使用を10箇所サンプリング
3. **bodySizeLimit 100MBの根拠確認**: Server Actionで大容量データを送信している箇所の特定
4. **OOMの発生条件特定**: CIログでOOMがどのフェーズ（tsc/next build/webpack）で発生するか確認
5. **loading未設定135ページのアクセス頻度**: アクセスログでtop 10を特定

---

## 11. 要判断改善

1. **middleware.ts導入のタイミングと範囲**: 認証のみ vs 認証+キャッシュ制御+パフォーマンス計測
2. **ignoreBuildErrors解消の優先度**: OOM対策とセットで実施するか、別途対応するか
3. **過剰メモ化の修正優先度**: React 19 Compilerの動向を見てから対応するか

---

## 12. 修正時の副作用 / 依存関係

| 修正 | 影響範囲 | 副作用 |
|------|----------|--------|
| error.tsx追加 | レイアウトグループの構造 | error.tsxはそのレイアウトグループ配下の全ページに影響。既存のglobal-error.tsxとの優先順位確認 |
| hostname変更 | next.config.js | 実使用ホスト漏れがあると画像が表示されなくなる。本番反映前に全画像表示の確認必要 |
| middleware導入 | 全ルートのレスポンス | Supabase Auth Helperのmiddlewareパターン導入。既存の認証ロジックとの二重実行リスク |
| memo削除 | 対象コンポーネントの再レンダリング | 不要なmemo削除でも、意図的なメモ化だった場合にレンダリング回数増加 |
| Core Web Vitals | app/layout.tsx | reportWebVitals関数追加。微小なバンドルサイズ増加 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

| 分類 | 対象 |
|------|------|
| 削る | hostname:"**"（ホワイトリスト化）、不要なmemo（検証後） |
| 残す | Turbopack、Three.js外部化、Sentry統合、dynamic import 58箇所、loading.tsx 10個 |
| 強化 | error.tsx（1→4）、画像最適化（next/image活用）、エラー監視（Sentry APIルート対応）、Core Web Vitals計測 |
| 統合 | 認証ロジック（middleware化） |

---

## 14. この機能が世界トップを超えるための最終条件

Vercel公式推奨の全項目クリアは最低ライン。その上で:

1. **全レイアウトにerror.tsx**: 機能固有のリカバリ導線で、エラーが「体験の中断」ではなく「安心して戻れる場所」になる
2. **middleware.tsで一元管理**: 認証・キャッシュ・計測がmiddlewareで完結。369ルートの個別実装ゼロ
3. **Core Web Vitals全指標green**: LCP<2.5s, FID<100ms, CLS<0.1。理想はLCP<1.5s
4. **ignoreBuildErrors:false**: 型安全性がビルドプロセスに完全統合
5. **loading状態が世界観の一部**: Stripe的なskeleton loading。白画面ゼロ。ローディング中もGlassmorphismの美しさが保たれる

パフォーマンスが「感じさせない」レベルに到達すること。ユーザーが「自分を見つめる」体験に没入している間、技術基盤は完全に透明であるべき。
