# 17. EC / Drops / Shops / Auction 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのEC/Drops/Shops/Auction機能に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Stargazerデータ、パーソナルカラー、Calendar連携等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: app/(culcept)/drops/, app/(culcept)/shops/, app/(culcept)/auction/, app/(culcept)/orders/, app/(culcept)/checkout/, app/(culcept)/my-drops/, app/(culcept)/products/, app/api/checkout/, app/api/stripe/, app/api/external-shop/, app/api/auto-pricing/, app/api/cron/expire-orders/, lib/stripe.ts, components/drops/, components/pricing/AutoPricingWidget.tsx
- 重要: CEO方針で「マネタイズ設計は後回し」と明記されている点を考慮
```

---

## 1. この機能の役割

ファッションアイテムの販売（Drops）、ショップ管理（Shops）、オークション（Auction）、注文管理（Orders）を提供するEC機能群。Stripe決済（API Version 2025-12-15.clover）で支払い処理。Aneurasyncの核（自己理解OS）との接続点は、`shops/me/products/[id]/fit-color/` のパーソナルカラー x 体型分析が唯一。自己理解エンジンの「出力先」としての将来的位置づけを持つが、現段階ではCEO方針「マネタイズ設計は後回し」により優先度は低い。

---

## 2. 現状の事実

### ECページ構成（21ページ / 全145ページ中 = 14.5%）

| カテゴリ | ページ数 | パス |
|---------|---------|------|
| Drops | 4 | `/drops`, `/drops/[id]`, `/drops/[id]/edit`, `/drops/new` |
| Shops | 11 | `/shops`, `/shops/[slug]`, `/shops/[slug]/edit`, `/shops/new`, `/shops/luxury`, `/shops/me`, `/shops/me/analytics`, `/shops/me/drafts`, `/shops/me/imported`, `/shops/me/insights`, `/shops/me/products`, `/shops/me/products/[id]/fit-color` |
| Products | 1 | `/products` |
| Auction | 1 | `/auction` |
| Orders | 1 | `/orders` |
| Checkout | 1 | `/checkout/success` |
| My-drops | 1 | `/my-drops` |
| **合計** | **21** | |

### EC API

| API | 用途 |
|-----|------|
| `app/api/checkout/session/` | Stripe Checkout セッション作成 |
| `app/api/stripe/webhook/` | Stripe Webhook 処理（checkout.session.completed/expired/async_payment/charge.refunded） |
| `app/api/external-shop/import/` | 外部ショップ商品インポート |
| `app/api/external-shop/copy-to-drop/` | 外部商品を Drop にコピー |
| `app/api/auto-pricing/` | 自動価格設定 |
| `app/api/cron/expire-orders/` | 期限切れ注文処理 |

### 技術基盤

- **Stripe**: `lib/stripe.ts`。API Version `2025-12-15.clover`。シングルトンパターン。Webhook Secret 分離
- **Drops コンポーネント**: `components/drops/` に4ファイル
- **Auto-pricing**: `components/pricing/AutoPricingWidget.tsx`
- **Cron ジョブ**: `.github/workflows/expire-orders.yml`（5分毎実行、GitHub Actions経由でcurl）
- **注文ステータス**: `pending` / `paid` / `expired` / `failed` / `refunded` / `paid_conflict`
- **外部ショップインポート**: OGタグ/JSON-LD からメタデータ抽出（`extractProductFacts.ts`, `extractSiteFacts.ts`, `generateShopCopy.ts`）
- **CEO方針**: 「マネタイズ設計は後回し」「課金・決済変更はCEO承認必要」

---

## 3. 世界トップ比較

| サービス | 領域 | パーソナライズ | 特徴 |
|---------|------|--------------|------|
| **ZOZOTOWN** | EC特化 | パーソナルカラー x 体型 → 推薦 | 大規模カタログ、ZOZOSUIT による採寸 |
| **Depop** | C2Cファッション | ソーシャルフィード型推薦 | 若年層、出品者=インフルエンサー |
| **Grailed** | 中古ファッション | ブランド/サイズ/スタイルフィルタ | 認証済みブランド品、コミュニティ重視 |
| **StockX** | スニーカー/ストリート | 入札制、相場チャート | 株式市場型UI、リアルタイム価格 |
| **YNAP (NET-A-PORTER)** | ラグジュアリー | AI スタイリスト推薦 | パーソナルショッパー、編集型コンテンツ |

---

## 4. 測定指標

| 指標 | Aneurasync 現状値 | ZOZOTOWN | StockX | Depop |
|------|-------------------|----------|--------|-------|
| ECページ比率（対全機能） | 14.5%（21/145ページ） | 100% | 90%+ | 80%+ |
| Stargazer 45軸データ活用 | fit-color のみ（限定的） | パーソナルカラー連携 | なし | なし |
| 決済方式 | Stripe one-time | 多数決済手段 | 多数 | Stripe |
| 商品形態 | Drops + Shops + Auction | 在庫販売 | 入札制 | C2C |
| 外部インポート | OGタグ/JSON-LD抽出 | N/A | N/A | N/A |
| 注文期限切れ処理 | GitHub Actions cron 5分毎 | サーバーサイド | サーバーサイド | サーバーサイド |
| Drops コンポーネント | 4 | N/A | N/A | N/A |
| 自動価格設定 | AutoPricingWidget あり | 独自アルゴリズム | 市場連動 | 出品者任意 |

---

## 5. 全問題点

### P1: リソース配分の不整合
CEO方針「マネタイズ後回し」にもかかわらず、EC が全145ページ中21ページ（14.5%）を占有。6つのAPIエンドポイント、4つのDropsコンポーネント、1つのCronジョブ、Stripe Webhook処理が稼働中。核体験（Stargazer/Alter/Origin = 自己理解OS）の開発・保守リソースを消費。

### P2: Stargazer 45軸データとの断絶
45軸の性格観測データと EC の接続が `fit-color`（パーソナルカラー x 体型）の1箇所のみ。「あなたの判断スタイルに合う服」「あなたの価値観に合うブランド」といった自己理解 OS ならではの推薦が存在しない。ECとしての差別化要因がない。

### P3: GitHub Actions Cron の非効率
`expire-orders.yml` が5分毎に GitHub Actions を起動し、Vercel の API エンドポイントに curl。実行料金コスト + Vercel Cold Start のオーバーヘッド。Stripe Webhook（`checkout.session.expired`）で処理すれば Cron 自体が不要になる可能性。

### P4: オークション機能の中途半端さ
`/auction` は1ページのみ。`drop_bids` テーブルは存在するが、リアルタイム入札更新、落札確定フロー、入札履歴表示等のオークション体験が限定的。StockX やヤフオクと比較して機能不足。

### P5: Shops 管理ツールの肥大化
Shops 配下に11ページ（analytics, insights, drafts, products, imported, fit-color 等）。店舗運営SaaS レベルの管理機能。自己理解 OS との関連が薄く、EC SaaS（Shopify, BASE）と競合する領域に踏み込んでいる。

### P6: Auto-pricing の位置づけ不明
`app/api/auto-pricing/` と `AutoPricingWidget.tsx` が存在するが、Drops 向けなのかサブスク向けなのか、アルゴリズムの根拠が不明。使用箇所と実際の利用頻度が未確認。

---

## 6. 全改善案

### A. EC 21ページのナビゲーション格下げ
メインナビゲーション（`lib/navigation.ts`）から EC 導線を外し、設定画面やプロフィール内からのみアクセス可能にする。コードは維持し、beta テスターが探せばアクセスできる状態。

### B. expire-orders の Stripe Webhook ベース化
`checkout.session.expired` Webhook で注文期限切れを処理。`expire-orders.yml` Cron ジョブを廃止。GitHub Actions 料金と Vercel Cold Start を削減。

### C. fit-color と Stargazer 45軸データの接続設計
将来的な「性格 x パーソナルカラー x 体型 x 行動パターン → ファッション推薦」パイプラインの設計書作成。実装は beta 後。

### D. Shops 管理 11ページの凍結判断
analytics, insights, drafts 等の店舗管理機能を beta 期間中に凍結（ナビから非表示）するか、維持するかの判断。

### E. EC 機能を「自己理解の出力先」として再定義
「Stargazer 観測 → スタイル提案 → 購入」の導線を設計。EC = 売り場ではなく、EC = 「自分を知った結果の体現」として位置づけ。

---

## 7. 改善案への反証

### A反証: ナビ格下げで beta テスターが EC を検証できない
beta テスターの中にショップオーナーがいる場合、EC 機能の検証が必要。ナビから外すと「見つけられない」問題が発生。beta 期間中の EC 検証計画が不明な状態でナビを変更するのは早計。

### B反証: Stripe Webhook のみでは全ケースをカバーできない
Stripe Webhook は配信保証がない（リトライはするが最終的に失敗する可能性）。Cron はフォールバックとして機能する。Webhook のみに依存するとデータ不整合リスク。

### C反証: 設計書作成も beta フェーズでは不要
CEO方針「マネタイズ後回し」。設計書を書く工数すら核体験の検証に回すべき。設計は beta 後に十分な知見を得てから。

### D反証: Shops 凍結は既存データの喪失リスク
beta テスターが既に Shops にデータを入力している場合、凍結でアクセス不能になるとユーザー体験を損なう。データの有無を確認してから判断すべき。

### E反証: 再定義は企画・設計工数が膨大
「自己理解の出力先」としての EC 再定義は、プロダクトビジョンの根幹に関わる。beta フェーズの「検証」タスクを超えている。

---

## 8. 反証後の再修正

### A再修正
ナビ完全非表示ではなく「セカンダリ位置に移動」。Home の Instrument Rail からは外すが、マイページ内からアクセス可能にする。beta テスターへの影響を最小化。

### B再修正
Webhook をプライマリ、Cron をフォールバック（頻度を5分→60分に下げる）のハイブリッド構成。Webhook 処理を `app/api/stripe/webhook/` に追加し、`expire-orders.yml` の実行間隔を下げてコスト削減。

### D再修正
凍結ではなく「beta 期間中の利用実態計測」。アクセスログで Shops 管理11ページの実利用率を確認してから凍結判断。データがゼロなら凍結しても影響なし。

---

## 9. 確定改善

### 9-1. expire-orders Cron の最適化
Stripe Webhook（`checkout.session.expired`）をプライマリ処理に追加。`expire-orders.yml` の実行間隔を5分から60分に変更し、フォールバック専用に格下げ。GitHub Actions コスト削減。

### 9-2. EC 関連ページの利用率計測
21ページ全てにアクセスログ（既存の analytics 基盤、または Vercel Analytics）を確認。利用率ゼロのページを特定。

---

## 10. 要検証改善

### 10-1. fit-color が Stargazer データを実際に使用しているか
`shops/me/products/[id]/fit-color/` が参照するデータソースを確認。Stargazer の45軸データを使用しているか、パーソナルカラー + 体型のみか。

### 10-2. Stripe Webhook で expire 処理が技術的に可能か
`checkout.session.expired` イベントの配信タイミングと信頼性を確認。Stripe ドキュメントで `expires_after_completion` の挙動を検証。

### 10-3. Auto-pricing の使用状況
`app/api/auto-pricing/` の呼び出し元と利用頻度を確認。`AutoPricingWidget.tsx` がどのページに組み込まれているか特定。

---

## 11. 要判断改善

### 11-1. EC 機能の beta 期間中の位置づけ
ナビ配置変更（セカンダリ化）、機能凍結、現状維持のいずれか。beta テスターの EC 検証計画の有無に依存。CEO判断。

### 11-2. 45軸 → ファッション推薦パイプラインの開発優先度
核体験検証完了後、EC を「自己理解の出力先」として再定義するか、EC を完全に切り離すか。プロダクトビジョンに関わる判断。CEO判断。

### 11-3. オークション機能の存続 / 凍結
1ページ + `drop_bids` テーブルのみの中途半端な状態を、拡充するか凍結するか。利用実態がゼロなら凍結が合理的。CEO判断。

---

## 12. 修正時の副作用 / 依存関係

| 改善 | 影響範囲 | 副作用リスク |
|------|---------|------------|
| ナビ配置変更 | `lib/navigation.ts` の `HOME_QUICK_NAV` / `MAIN_NAV` | EC 導線の消失。beta テスターへの事前通知必要 |
| expire-orders Webhook 化 | `app/api/stripe/webhook/route.ts` の拡張 | Webhook ハンドラの複雑化。既存の `checkout.session.completed` 処理との競合確認 |
| Cron 間隔変更 | `.github/workflows/expire-orders.yml` | 注文期限切れの検出遅延（最大60分）。ユーザー体験への影響は「expired」表示のタイミングのみ |
| fit-color 連携変更 | `shops/me/products/[id]/fit-color/`, Stargazer profile API | Profile API の応答スキーマ拡張。既存の fit-color UI の修正 |
| Auto-pricing 凍結 | `components/pricing/AutoPricingWidget.tsx`, `app/api/auto-pricing/` | Widget を使用しているページのUI崩れ確認 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

| 区分 | 対象 | 理由 |
|------|------|------|
| **削る** | `expire-orders.yml` の5分間隔（→60分 or 廃止） | コスト削減。Webhook がプライマリになるため |
| **削る** | メインナビからの EC 導線（beta 期間中） | 核体験への集中。ユーザーの注意分散防止 |
| **残す** | Stripe 基盤（`lib/stripe.ts`, Webhook 処理） | 将来のマネタイズ基盤。削除コスト > 維持コスト |
| **残す** | Drops / Shops コード全体 | 将来の EC 再定義用。コードは資産 |
| **残す** | `drop_bids` テーブル | DB スキーマの変更はリスク。テーブル残置のコストはゼロ |
| **強化** | fit-color → Stargazer 連携（将来） | 自己理解 OS x EC の唯一の差別化ポイント |
| **統合** | EC → 「自己理解の出力先」として再定義（将来） | EC SaaS との差別化。Aneurasync でしかできない購買体験 |

---

## 14. この機能が世界トップを超えるための最終条件

ZOZOTOWN が「体型データ → 服の推薦」を実現したように、Aneurasync が「45軸性格 x パーソナルカラー x 体型 x 行動パターン x 状態変動 → 世界で唯一のファッション推薦」を実現すること。具体的には:

1. **観測データ → 購買理由の可視化**: 「あなたがこの服を選ぶ理由は、判断軸の『安全志向 x 新規性欲求』のバランスから」
2. **状態連動推薦**: 「今日のエネルギー状態では、comfort 重視のアイテムが最適」（Calendar x Origin x EC の三点連携）
3. **ワードローブ AI**: 「あなたの既存の服と最も組み合わせやすいアイテム」（My-Style x Calendar x EC の連携）
4. **自己理解の体現としての購買**: 買い物 = 自分を知る行為。「この服を選んだ自分」が新しい自己理解のデータポイントになる

ただし、これは beta 後の将来像。現段階は核体験（Stargazer/Alter/Origin）の検証が最優先。EC は「温存して育てる」フェーズ。
