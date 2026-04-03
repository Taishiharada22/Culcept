# My Page / Profile 改善パック

## この機能を改善させるための依頼文

```
以下はAneurasyncのMyPage/Profile機能に関する独立監査パックです。
- この機能だけを対象にしてください
- 他機能との依存は考慮してください（Stargazer profile、Origin、通知システム等）
- 全問題点を洗い出してください
- 全改善案を出してください
- 必ず反証してください
- 無難な改善ではなく、世界トップを超える案まで出してください
- 対象: app/(culcept)/my-page/(6ファイル), app/api/notifications/(7ルート), 各profile API
```

---

## 1. この機能の役割

ユーザーの観測進捗・プロフィール・通知を一覧するマイページ。Identity Progress（5領域: origin/genome/presence/style/phenotype の完了度%とインサイト）を表示し、観測レベル（5段階: 未観測→覚醒→探索→深化→統合）を可視化する。各機能への導線ハブとして機能し、「自分はどこまで自分を理解したか」の全体マップを提供する。

---

## 2. 現状の事実

### My Page
- **ページ**: 6ファイル（page.tsx, MyPageClient.tsx(617行), loading.tsx, notifications/page.tsx, notifications/NotificationClient.tsx, notifications/loading.tsx）
- **データ取得**: 5 Supabase並行クエリ（stargazer_profiles, stargazer_resolved_types, stargazer_observations count, notifications unread, origin_snapshots）
- **Identity Progress 5領域**:
  - origin — Origin機能の観測完了度%+インサイト
  - genome — Genome Card生成/共有完了度%+インサイト
  - presence — Presence分析完了度%+インサイト
  - style — My-Style/Calendar分析完了度%+インサイト
  - phenotype — 外見分析完了度%+インサイト
- **観測レベル5段階**: 未観測 → 覚醒 → 探索 → 深化 → 統合
- **メニュー項目**: Notifications, Stargazer, Genome Card, Origin

### 通知システム
- **APIルート**: 7個（list, [id], preferences, send, subscribe, unread-count, test）
- **Push通知**: VAPID対応（Web Push API）
- **通知種類**: マッチング通知、観測リマインダー、Counselorメッセージ等

### Profile関連API（分散配置）
1. `/api/stargazer/profile` — 性格プロフィール（45軸+アーキタイプ）
2. `/api/my-style/body-profile` — スタイルプロフィール
3. `/api/body-color/profile` — パーソナルカラープロフィール
4. `/api/eye-profile/` — 目分析プロフィール
5. `/api/aneurasync/face-phenotype/` — 顔型プロフィール
6. `/api/aneurasync/hair-phenotype/` — 髪分析プロフィール
7. `/api/origin/life-profile` — Origin生活プロフィール

### アカウント管理
- `/api/account/delete` — アカウント削除API

---

## 3. 世界トップ比較

| サービス | プロフィール設計 | 進捗可視化 | 通知設計 | 差別化要素 |
|----------|-----------------|------------|---------|------------|
| **Instagram** | プロフィール+投稿グリッド+フォロワー数 | なし | いいね/DM/フォロー | シンプル、視覚的 |
| **Spotify** | 再生履歴+プレイリスト | Wrapped年次レポート | 新リリース/おすすめ | データの物語化 |
| **LinkedIn** | プロフィール完成度バー+推薦+スキル | 完成度% | 求人/つながり/閲覧 | プロフェッショナル文脈 |
| **Duolingo** | レベル+連続日数+バッジ+リーグ | リーグ制+XP | 学習リマインダー | ゲーミフィケーション |
| **Apple Health** | ヘルスダッシュボード+トレンド | リング+月次サマリー | 目標達成 | 多軸統合 |

---

## 4. 測定指標

| 指標 | Aneurasync | Instagram | Spotify | Duolingo | LinkedIn |
|------|-----------|-----------|---------|----------|----------|
| メインクライアント行数 | 617 | N/A | N/A | N/A | N/A |
| 進捗トラッキング領域 | 5 | なし | 1（Wrapped） | 1（言語） | 1（プロフィール完成度） |
| 観測レベル段階 | 5 | なし | なし | 30+ | なし |
| プロフィールAPI数 | 7（分散） | 1 | 1 | 1 | 1 |
| 通知APIルート | 7 | N/A | N/A | N/A | N/A |
| Push通知 | VAPID | FCM | FCM | FCM | FCM |
| レポート機能 | なし | 年次まとめ | Wrapped | 週次レポート | 週次閲覧数 |

---

## 5. 全問題点

1. **Profile APIが7箇所に分散**（stargazer, style, body-color, eye, face-phenotype, hair-phenotype, origin）。MyPageで全プロフィールを統合表示するには7回のAPI呼び出しが必要。応答時間・エラーハンドリングが複雑化
2. **617行のMyPageClientは比較的コンパクト**だが、5領域の進捗計算ロジック+観測レベル算出+メニュー表示+通知バッジが1ファイルに混在
3. **通知システムは7ルートあるがPush通知の実際の送信/受信実績が不明**。VAPID鍵設定済みだが、実ユーザーへの送信成功率データなし
4. **観測レベル5段階の算出ロジックが独自**（MyPageClient内のlines 42-73推定）。StargazerのstreakLevelとの関係が不明瞭。2つの「レベル」概念が混在
5. **メニュー項目が4個のみ**（Notifications, Stargazer, Genome Card, Origin）。Calendar/My-Style/Rendezvous/Presenceへの直接導線がない。ユーザーが「あの機能どこ？」と迷う
6. **アカウント削除API（/api/account/delete）のデータ消去範囲が不明**。GDPR/個人情報保護法対応の観点で全テーブルからの削除確認が必要
7. **Identity Progress 5領域の完了度%算出ロジック**が透明でない。ユーザーが「何をすれば%が上がるか」を理解できない
8. **通知preferences APIの設定粒度**。ユーザーが通知タイプごとにON/OFFできるか未確認
9. **月次/年次レポート機能がない**。蓄積されたデータの振り返り体験が不在
10. **MyPageへのアクセス頻度/滞在時間が未計測**。ハブとして機能しているか不明

---

## 6. 全改善案

**A. Profile統合API作成**
7分散APIを1エンドポイントに統合したMyPage専用集約API。サーバーサイドで7 APIの応答をPromise.allで並行取得し、1レスポンスに統合

**B. メニュー項目拡充**
「あなたの全機能」セクションとして全機能（Stargazer, Origin, Calendar, My-Style, Genome Card, Rendezvous, Presence, Phenotype）への導線を配置。Home QuickAccessとは目的が異なる（QuickAccess=日常使い、MyPage=全体俯瞰）

**C. 観測レベルとストリークレベルの関係整理**
2つのレベル概念を統一するか、明確な棲み分けを文書化。ユーザーに「あなたのレベル」が1つだけ見えるようにする

**D. 通知送信/受信実績ダッシュボード**
管理画面にPush通知の送信成功率/開封率/クリック率を表示。通知品質の改善サイクル構築

**E. Identity Progress内訳表示**
各領域の「次のアクション」を明示。「Originであと2回記録すると探索レベルに到達」のようなガイダンス

**F. 月次レポート**
Spotify Wrapped的な月次振り返り。「今月の観測回数」「新しく分かったこと」「あなたの成長」を1ページにまとめる

**G. アカウント削除のデータ消去範囲文書化**
全テーブルからの削除対象リスト作成。GDPR対応の観点でソフトデリート/ハードデリートの方針明確化

**H. MyPageアクセス頻度計測**
ページビュー+滞在時間+メニュークリック率をPostHog等で計測

**I. 通知設定UI改善**
通知タイプ別のON/OFF設定画面。頻度設定（毎日/週1/月1）。静かな時間帯設定

---

## 7. 改善案への反証

**A反証**: 統合APIは新規エンドポイント追加。既存7 APIは他画面（Genome Card表示、Rendezvousカード閲覧等）でも使われており廃止不可。統合APIは「追加」であり全体のAPI数が増える

**B反証**: メニュー項目を増やすとHome QuickAccessと重複。ユーザーは「どこから行けばいいか」更に混乱する可能性

**C反証**: ストリークレベルはStargazerのゲーミフィケーション。観測レベルはMyPageの全体進捗。目的が異なるため統一は不適切

**E反証**: 「次のアクション」表示は過度な誘導。ユーザーの自発的探索を阻害する

**F反証**: βフェーズで月次レポートは時期尚早。1ヶ月分のデータで意味のあるレポートが作れるか疑問

**G反証**: プライバシーポリシー/データ消去は法務領域。Build Unitの範囲外

---

## 8. 反証後の再修正

**A再修正**: 既存APIはそのまま維持。MyPage専用の「集約API」を1本追加。サーバーコンポーネントのpage.tsxで7クエリを並行実行する現行方式（既にSupabase直クエリで並行取得している場合）であれば、REST API統合より既存方式の方が効率的

**B再修正**: メニューではなく「あなたの観測マップ」として5領域の進捗グラフ内に各機能へのリンクを埋め込む。Identity Progress自体が導線になる設計

**C再修正**: 統一ではなく表示位置の分離。MyPageでは「観測レベル」のみ表示。Stargazer画面では「ストリークレベル」のみ表示。両方同時に見える場所を作らない

**E再修正**: 「次のアクション」は強制ではなくオプション。「次のステップを見る」ボタンで展開

**F再修正**: 月次ではなく「10回観測記念レポート」のようなマイルストーン型

---

## 9. 確定改善

1. **メニュー項目にCalendar/My-Style/Rendezvous/Presenceへの導線追加** — Identity Progress 5領域グラフ内にリンクを埋め込む形で実装
2. **Push通知の送信/受信実績計測開始** — 管理画面またはログベースで成功率を可視化
3. **Identity Progress各領域の「次のステップ」オプション表示** — 「何をすれば進むか」をユーザーに明示

---

## 10. 要検証改善

1. **Profile統合APIの応答時間** — 現行5並行Supabaseクエリ vs 集約API 1本のパフォーマンス比較
2. **観測レベルとストリークレベルの表示重複** — 両方が見えるUI箇所があるか確認
3. **アカウント削除のデータ消去範囲** — 全テーブルからの削除対象リスト作成
4. **通知preferencesの設定粒度** — 通知タイプ別ON/OFFが可能か現行UIで確認
5. **MyPageアクセス頻度** — β開始後にPostHog等で計測

---

## 11. 要判断改善（CEO判断）

1. **月次/マイルストーンレポート機能の開発優先度** — 「自己理解の蓄積を可視化」は核心だが、β初期の優先度
2. **Profile統合APIの実装タイミング** — 7分散APIの集約は工数対効果の判断
3. **アカウント削除のデータ消去ポリシー** — ソフトデリート（論理削除）vs ハードデリート（物理削除）の方針
4. **通知頻度の初期設定** — デフォルト全ON vs 必要最小限

---

## 12. 修正時の副作用 / 依存関係

| 改善項目 | 副作用・依存 |
|----------|-------------|
| メニュー/導線追加 | lib/navigation.tsのMAIN_NAVとHOME_QUICK_NAVとの整合確認。3箇所にナビゲーションが存在すると保守コスト増 |
| Push通知計測 | Service Worker（sw.js）の設定確認。通知送信ログのテーブル追加が必要な可能性 |
| Identity Progress内訳 | 各機能の「完了条件」定義が必要。Origin/Genome/Presence/Style/Phenotype各チームとの合意 |
| 統合API | 各profile APIへの依存。1つでも障害発生時の統合APIのエラーハンドリング設計 |
| レポート機能 | Stargazer/Origin/Calendar等の月次集計ロジック新規開発。データ量に応じたクエリ最適化 |

---

## 13. 削るもの / 残すもの / 強化するもの / 統合するもの

### 削る
- なし（MyPageは6ファイルと軽量。過剰な機能はない）

### 残す
- 5領域Identity Progress
- 5段階観測レベル
- 通知システム（7ルート+VAPID Push）
- 5並行Supabaseクエリ方式（パフォーマンス検証前は変更しない）

### 強化
- 全機能への導線（Identity Progressグラフ内リンク）
- 通知計測基盤
- Identity Progressの「次のステップ」表示
- MyPageアクセス頻度計測

### 統合
- 7 Profile APIの集約ビュー（新規追加として検討。既存APIは維持）

---

## 14. この機能が世界トップを超えるための最終条件

Spotify WrappedやDuolingoのバッジシステムが示しているのは「蓄積の可視化が継続のモチベーションになる」ということ。LinkedIn のプロフィール完成度バーが示しているのは「次の一歩が明確だと行動率が上がる」ということ。

Aneurasyncが超えるための条件は2つ。

**条件1: 「自己理解マップ」としての唯一性**
5領域のIdentity Progressが「作業的なチェックリスト」ではなく「自分の全体像が見える地図」として機能すること。MyPageを開く度に「こんなに自分を理解できている」と実感できる。LinkedInの完成度バーは「履歴書を埋める作業」だが、Aneurasyncの進捗は「自分を知る旅の現在地」。この違いをUI/コピーで明確に伝える。

**条件2: 蓄積データの物語化**
Spotify Wrappedが年末に「あなたの1年」を語るように、Aneurasyncは「あなたの自己理解の進化」を語る。「3月はanalytical傾向が強まった」「先週のOrigin記録から新しいパターンが見つかった」のように、データが自分の物語になる体験。マイルストーンレポートがこの役割を担う。
