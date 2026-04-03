# 18. Monetization 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのMonetization（課金・収益設計）に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Stripe、Premium機能ゲーティング、betaテスター制度等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: lib/stargazer/subscriptionTier.ts, lib/stripe.ts, lib/auth/betaTesters.ts, app/api/checkout/, app/api/stripe/webhook/, app/api/auto-pricing/, app/api/rendezvous/[candidateId]/premium-report/, app/api/ceo/dashboard/, app/api/ceo/expansion-monitor/, components/pricing/AutoPricingWidget.tsx
- 重要: CEO方針で「マネタイズ設計は後回し」と明記。現段階は仮説検証のみ
```

---

## 1. この機能の役割

Aneurasyncの将来の収益基盤。現在は `free` / `premium` の2ティア設計が `lib/stargazer/subscriptionTier.ts` に定義されているが、CEO方針により「マネタイズ設計は後回し」。beta テスター3人は premium 全機能バイパス。EC（Drops販売）は Stripe 決済で稼働中（one-time payment）。サブスクリプション決済は未実装。

---

## 2. 現状の事実

### サブスクリプション設計

- **ティア**: `free` / `premium` の2階層（`lib/stargazer/subscriptionTier.ts`）
- **Premium 判定**: `rendezvous_profiles.is_premium`（boolean）+ `premium_expires_at`（timestamp）
- **DB参照**: `getStargazerTier()` が `rendezvous_profiles` テーブルを参照。Stargazer 固有テーブルではない

### 機能ゲーティング（18機能）

| 区分 | 機能 | 制限内容 |
|------|------|---------|
| **Premium限定（2機能）** | `decision_oracle`, `psyche_signature` | free ユーザーは利用不可 |
| **Free制限付き（5機能）** | `blind_spot`（1回/日）, `prophecy`（1回/日）, `unseen_map`（基本のみ）, `alter`（5ターン/日）, `ghost_resonance`（1回/日） | 回数/範囲制限 |
| **Free全開放（11機能）** | `inner_weather`, `values_discovery`, `core_wound`, `parts_dialogue`, `transformation`, `life_events`, `micro_ema`, `act_hexaflex`, `transform_simulation`, `dream_journal`, `circadian_rhythm` | 制限なし |

### beta テスター

- **定義**: `lib/auth/betaTesters.ts` に3メールアドレスがハードコード
  - `aneurasync@outlook.com`
  - `hikariharada86@icloud.com`
  - `zawane0903@gmail.com`
- **判定**: `isBetaTesterEmail()` で premium 全バイパス

### Stripe 基盤

- **ライブラリ**: `lib/stripe.ts`（API Version `2025-12-15.clover`、シングルトン）
- **用途**: one-time payment（Drops購入）のみ。サブスク未実装
- **Webhook**: `checkout.session.completed` / `expired` / `async_payment` / `charge.refunded`
- **通貨**: JPY

### 関連エンドポイント

| API | 用途 |
|-----|------|
| `app/api/checkout/session/` | Stripe Checkout セッション作成 |
| `app/api/stripe/webhook/` | Stripe Webhook 処理 |
| `app/api/auto-pricing/` | 自動価格設定 |
| `app/api/rendezvous/[candidateId]/premium-report/` | Premium Report（`is_premium` 判定あり） |
| `app/api/ceo/dashboard/` | CEO ダッシュボード |
| `app/api/ceo/expansion-monitor/` | 拡張モニター |
| `components/pricing/AutoPricingWidget.tsx` | 価格設定UI |

---

## 3. 世界トップ比較

| サービス | モデル | Free体験 | 有料体験 | 課金理由 |
|---------|--------|---------|---------|---------|
| **Spotify** | Freemium | 広告付き+シャッフルのみ | 無制限+オフライン+高音質 | 「不便の解消」+「体験の向上」 |
| **Headspace** | Freemium | 限定コンテンツ | 全コンテンツ+パーソナライズ | 「もっと深く」 |
| **Duolingo** | Freemium+広告 | Heart制限+広告 | 無制限+AI tutor+オフライン | 「制限解除」+「AI支援」 |
| **Tinder** | Freemium+階層 | スワイプ制限 | Plus/Gold/Platinum の3階層 | 「もっと出会える」段階的強化 |
| **ChatGPT** | Freemium | GPT-3.5制限 | GPT-4無制限+プラグイン | 「より高度なAI」 |
| **Notion** | Freemium | 個人無制限 | チーム機能+API | 「チーム利用」 |

---

## 4. 測定指標

| 指標 | Aneurasync 現状値 | Spotify | Headspace | Duolingo |
|------|-------------------|---------|-----------|----------|
| ティア数 | 2（free/premium） | 2 | 2 | 3（Free/Super/Max） |
| Premium限定機能 | 2 | 全機能 | 全コンテンツ | 無制限+AI |
| Free制限機能 | 5 | 広告+シャッフル | 限定コンテンツ | Heart+広告 |
| Free全開放機能 | 11 | N/A | N/A | N/A |
| 決済方式 | one-time（Drops）のみ | サブスク | サブスク | サブスク |
| サブスク決済 | **未実装** | 実装済み | 実装済み | 実装済み |
| beta テスター管理 | ソースコードにハードコード（3人） | N/A | N/A | N/A |
| 価格 | **未設定** | 980円/月 | 1,580円/月 | 1,100円/月 |
| Premium Report | あり（Rendezvous内） | N/A | N/A | N/A |
| Auto-pricing | あり（用途不明） | N/A | N/A | N/A |

---

## 5. 全問題点

### P1: 課金基盤の未成熟とコードの先行実装
CEO方針「後回し」にもかかわらず、`subscriptionTier.ts`（304行）に18機能のゲーティングが実装済み。premium 判定が `rendezvous_profiles.is_premium` に依存し、Stargazer 固有のサブスクテーブルが存在しない。将来のサブスク導入時にスキーマ変更が必要。

### P2: beta テスターのソースコードハードコード
3つのメールアドレスが `lib/auth/betaTesters.ts` にハードコード。ソースコード管理上のセキュリティリスク（メールアドレスがGitリポジトリに永続化）。テスター追加/削除にデプロイが必要。

### P3: Free で11機能が全開放。Premium の価値提案が弱い
18機能中11機能が Free で全開放。Premium 限定は `decision_oracle` と `psyche_signature` の2機能のみ。Free ユーザーが「お金を払う理由」が不明確。

### P4: サブスクリプション決済が未実装
Stripe は one-time payment（Drops購入）のみ対応。`premium` ティアが存在するのにサブスク決済導線がない。`is_premium` を `true` にする手段が手動 DB 操作のみ。

### P5: Premium 判定が Rendezvous テーブルに依存
`getStargazerTier()` が `rendezvous_profiles` テーブルの `is_premium` を参照。Stargazer（自己理解OS）のサブスクが Rendezvous（マッチング）のテーブルに依存する設計の不整合。

### P6: Auto-pricing の位置づけ不明
`app/api/auto-pricing/` と `AutoPricingWidget.tsx` が存在するが、Drops の価格設定用か、将来のサブスク価格用か不明。使用状況が未確認。

### P7: 課金仮説の文書化なし
「何に対していくら払うか」の仮説が文書化されていない。beta テスターのフィードバックから課金仮説を検証する計画もない。

---

## 6. 全改善案

### A. beta テスターの環境変数化
`lib/auth/betaTesters.ts` のハードコードメールアドレスを `.env.local` の `BETA_TESTER_EMAILS` 環境変数に移動。ソースコードからメールアドレスを除去。

### B. 課金仮説リストの作成
`docs/monetization-hypotheses.md` に以下を整理:
- 仮説1: Alter 無制限は月額980円で払う価値があるか
- 仮説2: Premium Report 単体で500円の価値があるか
- 仮説3: Decision Oracle は「判断支援」として課金対象になるか
- 検証方法: beta テスターへのヒアリング項目

### C. Premium 判定の独立テーブル化設計
`rendezvous_profiles.is_premium` から `user_subscriptions` テーブルへの移行設計。`tier`, `expires_at`, `payment_method`, `stripe_subscription_id` カラム。実装は後回し。

### D. beta 期間中の全機能 Free 開放
`subscriptionTier.ts` の Free 制限を一時的に全解除。beta テスターは全員 `isBetaTesterEmail()` でバイパスされるため実質影響なし。ただし、一般ユーザー（将来）向けの制限構造は維持。

### E. Free / Premium 境界線の再設計仮説
「制限解除」ではなく「体験深化」モデル:
- Free: 自分を知る（観測 + 基本インサイト）
- Premium: 自分をもっと深く知る（AI判断支援 + 詳細分析 + パターン予測）

### F. サブスク決済基盤の設計書作成
Stripe Subscription API を使ったサブスク導線の技術設計書。Checkout Session（subscription mode）→ Customer Portal → Webhook（`invoice.paid`, `customer.subscription.deleted`）。実装は beta 後。

---

## 7. 改善案への反証

### A反証: 環境変数化は3人の管理に過剰
3人のメールアドレスをわざわざ `.env` に移すのは工数対効果が低い。Git リポジトリがプライベートなら、ソースコードにメールアドレスがあっても実害は少ない。

### B反証: 課金仮説は beta 体験データがないと立てられない
beta テスターがまだ十分に機能を使っていない段階で課金仮説を立てても、検証不可能な空論になる。まず使ってもらってからヒアリングすべき。

### C反証: テーブル設計は beta フェーズでは不要
`rendezvous_profiles.is_premium` の依存は技術的負債だが、beta 3人の段階では問題にならない。サブスク導入が確定してからスキーマ設計しても遅くない。

### D反証: Free 制限解除は将来の Premium 化時に反発を生む
「無料で使えてたのに有料化」はユーザーの最大の不満要因。beta 期間でも Free 制限構造を体験させておくことで、将来の Premium 化への心理的準備ができる。

### E反証: 境界線再設計は企画工数が膨大
「体験深化」モデルの設計は、18機能全ての「Free版 vs Premium版」を定義する必要がある。beta フェーズでは時期尚早。

### F反証: 設計書作成も不要。Stripe Docs が十分
Stripe Subscription の実装は公式ドキュメントが充実。独自設計書を書く工数は Stripe Docs を読む工数と重複。実装時に Stripe Docs を参照すれば十分。

---

## 8. 反証後の再修正

### A再修正
メールアドレスのセキュリティリスクは「プライベートリポジトリ」前提でも、将来のオープンソース化やチームメンバー追加時にリスクが顕在化する。最低限の対応として `.env.local` 移動を推奨。工数は30分未満。

### B再修正
完全な仮説リストではなく「3つの質問」レベル。beta テスターに「この機能にお金を払うか？」を聞く準備。体験データの蓄積と並行して質問を準備する。

### D再修正
Free 制限は現状維持。beta テスターは `isBetaTesterEmail()` で全バイパスされるため、一般ユーザーが来た場合の体験として制限構造は必要。

---

## 9. 確定改善

### 9-1. beta テスターメールアドレスの環境変数化
`lib/auth/betaTesters.ts` のハードコード3メールアドレスを `.env.local` の `BETA_TESTER_EMAILS` 環境変数に移動。`isBetaTesterEmail()` の実装を環境変数参照に変更。

### 9-2. 課金仮説の初期メモ作成
`docs/monetization-hypotheses.md` に以下の3質問を記録:
1. 「Alter の無制限利用に月額いくらまで払えるか？」
2. 「自分の判断パターンの予測（Decision Oracle）に価値を感じるか？」
3. 「Aneurasync で最も『お金を払ってでも使いたい』と感じた機能は？」

---

## 10. 要検証改善

### 10-1. Free 制限5機能の制限到達率
beta テスターは全員バイパスのため、一般ユーザーが制限に到達する頻度は未知。beta テスターのバイパス前の利用データ（仮に制限があった場合何回使うか）を推定。

### 10-2. Premium Report の利用率
`app/api/rendezvous/[candidateId]/premium-report/` の呼び出し頻度。beta テスターが実際に利用しているか確認。

### 10-3. Auto-pricing の使用状況と用途
`app/api/auto-pricing/` の呼び出し元と頻度を確認。`AutoPricingWidget.tsx` の組み込み先ページを特定。Drops 価格設定用であれば EC パックとの整合を確認。

---

## 11. 要判断改善

### 11-1. Premium 判定テーブルの独立化タイミング
`rendezvous_profiles.is_premium` → `user_subscriptions` テーブルへの移行を、サブスク導入確定時に行うか、事前に設計だけしておくか。CEO判断。

### 11-2. サブスク決済基盤の設計開始タイミング
beta 後の「マネタイズ設計」フェーズまで設計を完全に延期するか、beta 中に技術設計だけ進めるか。CEO判断。

### 11-3. Free / Premium 境界線の思想
「制限解除」モデル（Duolingo型: Free の不便を解消）vs「体験深化」モデル（Headspace型: Free で十分、Premium でもっと深く）の選択。Aneurasync の世界観には後者が適合するが、収益性は前者が高い。CEO判断。

---

## 12. 修正時の副作用 / 依存関係

| 改善 | 影響範囲 | 副作用リスク |
|------|---------|------------|
| beta テスター環境変数化 | `lib/auth/betaTesters.ts` + `.env.local` + `.env.example` | Vercel 環境変数の設定追加必要。デプロイ時に `BETA_TESTER_EMAILS` 未設定だと全員 Free に |
| 課金仮説メモ | `docs/monetization-hypotheses.md`（新規） | なし（文書のみ） |
| Premium テーブル独立化 | `subscriptionTier.ts` の `getStargazerTier()` + `rendezvous_profiles` の `is_premium` 参照箇所全て + DB マイグレーション | マイグレーションは CEO 承認必要。RLS ポリシーの追加。`premium-report` API の参照先変更 |
| Free 制限変更 | `subscriptionTier.ts` の `FEATURE_GATES` + 各機能の制限表示UI | 制限表示の文言修正。`upgradePrompt` テキストの更新 |
| サブスク導入 | `lib/stripe.ts` 拡張 + 新 API エンドポイント + Stripe Dashboard 設定 + Webhook ハンドラ追加 | 課金関連変更は CEO 承認必要。テスト環境での検証必須 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

| 区分 | 対象 | 理由 |
|------|------|------|
| **削る** | ソースコード内の beta テスターメールアドレス | セキュリティ衛生。`.env` に移動 |
| **残す** | `free` / `premium` 2ティア構造 | 将来のサブスク基盤。削除コスト > 維持コスト |
| **残す** | Stripe 基盤（`lib/stripe.ts`、Webhook 処理） | one-time + 将来のサブスク両方で必要 |
| **残す** | `FEATURE_GATES` の18機能定義 | ゲーティング構造は資産。値の調整のみで将来対応可能 |
| **残す** | Premium Report エンドポイント | Premium の価値を示すコンテンツ。将来の課金対象候補 |
| **強化** | 課金仮説の文書化 | beta テスターへのヒアリング準備 |
| **統合** | Premium 判定（rendezvous_profiles → 独立テーブル、将来） | Stargazer / Rendezvous の関心分離 |

---

## 14. この機能が世界トップを超えるための最終条件

Spotify の Freemium モデルが成功したのは「Free で十分使える → でも Premium はもっといい」という体験設計。Aneurasync の場合:

1. **課金理由が「制限解除」ではなく「体験の深化」**: Free で「自分を知る」体験 → Premium で「自分をもっと深く知る + 判断を支援してもらう」体験。制限を解除するのではなく、新しい体験層を開放する
2. **AI が課金の中核**: ChatGPT Plus のように「より高度な AI（Alter の深い応答、Decision Oracle の予測精度）」が Premium の価値。トークン量/モデル品質で自然な差別化
3. **観測データが蓄積するほど Premium の価値が上がる**: 「3ヶ月分のデータがあるからこそ見える判断パターン」「半年分の矛盾分析」等、時間とともに Premium の価値が自然に増大するモデル
4. **beta テスターが「お金を払ってでも使いたい」と言う機能が1つ以上ある**: 仮説ではなく実証。beta フィードバックから課金対象を特定

現段階は beta フェーズであり、全ての課金設計は仮説。「何に対していくら払うか」を検証することが最優先。
