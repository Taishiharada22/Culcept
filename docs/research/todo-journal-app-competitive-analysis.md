## リサーチレポート: Todo / 日記ジャーナルアプリ 競合分析

日付: 2026-03-29

### 要約（3行以内）
Todoアプリは自然言語入力とAI音声キャプチャが差別化の主軸に移行。日記アプリはAIによる振り返り深掘りと感情パターン分析が2026年のトレンド。両領域とも「ストリーク/習慣化」がエンゲージメントの核であり、Aneurasyncの観測ループ設計に直接応用可能。

---

# Part 1: Todoアプリ（トップ3）

---

## 1. Todoist

### 基本情報
- 開発: Doist（独立・ブートストラップ企業、40か国約100名）
- ユーザー: 5,000万人以上、累計20億タスク完了
- 価格: 無料 / Pro $7/月 / Business $10/ユーザー/月

### コア機能
| 機能 | 詳細 |
|------|------|
| タスク追加 | Quick Add（自然言語入力が業界最高水準）、100以上のルール、300正規化、10言語対応 |
| 完了 | チェックマーク式、優先度4段階（P1-P4） |
| 繰り返し | 自然言語で設定可能（例: "every second Thursday at 3pm"） |
| サブタスク | あり（タスク分解も可能） |
| ラベル/タグ | ラベル、フィルター（自然言語でカスタムフィルター生成可能） |
| プロジェクト分類 | プロジェクト + セクション構造 |

### UX特徴
- **自然言語入力**: 業界No.1。日付・繰り返し・優先度・プロジェクトを文章から自動抽出
- **ドラッグ並替え**: 対応
- **スワイプ操作**: モバイルで日程変更等のスワイプ対応
- **ウィジェット**: iOS / Android / Apple Watch / WearOS 対応
- **クロスプラットフォーム**: Web, iOS, Android, macOS, Windows, Linux（業界唯一の全プラットフォーム対応）

### エンゲージメント施策
- **Karma（カルマ）ポイント**: タスク完了・高度機能利用で獲得。Beginner → Enlightenment（上位0.05%のみ到達）の8段階レベル
- **ストリーク**: 日次/週次の目標達成連続記録。土日除外設定やバケーションモードあり
- **統計/振り返り**: Productivityビューで日次・週次の完了数、Karma推移を可視化
- **Karma減少**: 4日以上のタスク遅延で減点

### AI機能
- **Todoist Ramble（2026年1月GA）**: 音声→構造化タスク変換。Gemini 2.5 Flash Live（Vertex AI）使用。38言語対応。ベータ3週間で76,000ユーザー、290,000セッション。新規ユーザーの課金率5倍
- **Task Assist**: サブタスク提案、複雑タスクの分解支援
- **Filter Assist**: 自然言語からカスタムフィルター生成
- **Email Assist**: メール転送→構造化タスク変換
- プライバシー: 音声は保存・学習に不使用。SOC 2 Type II認証

---

## 2. TickTick

### 基本情報
- 開発: Appest Inc.
- 価格: 無料（寛大な無料枠）/ Premium $35.99/年

### コア機能
| 機能 | 詳細 |
|------|------|
| タスク追加 | 自然言語日付解析あり |
| 完了 | チェック式 |
| 繰り返し | 柔軟な繰り返し設定 |
| サブタスク | 無料で1タスクあたり19個まで |
| ラベル/タグ | タグ対応 |
| プロジェクト分類 | リスト（無料で9個まで）+ フォルダ |

### UX特徴
- **ポモドーロタイマー**: 全タスクに統合。セッション/休憩時間カスタマイズ、日別集計あり
- **習慣トラッカー**: タスクと同列で習慣を管理。ストリーク、統計、パターン分析
- **カレンダービュー & タイムブロッキング**: タスクを時間帯にドラッグ配置（Todoistにない強み）
- **アイゼンハワーマトリクス**: 緊急度/重要度の4象限ビュー
- **ウィジェット**: iOS / Android対応
- **クロスプラットフォーム**: Web, iOS, Android, macOS, Windows

### エンゲージメント施策
- **達成スコア**: タスク完了・ポモドーロ・習慣チェックインで上昇。遅延で減少。レベルアップで限定テーマ獲得
- **ストリーク**: 習慣ごとのチェックインストリーク + カレンダー表示
- **統計**: ベスト作業日、最集中時間帯、完了率、週/月単位の振り返り（Premium: 6週間/月分）
- **バッジ**: マイルストーン達成で獲得
- **プログレスバー**: ゴール・タスクの進捗を視覚化

### AI機能
- **2026年時点で目立ったAI機能なし**。従来の強み（ポモドーロ、習慣、カレンダー）に注力

---

## 3. Things 3

### 基本情報
- 開発: Cultured Code（ドイツ、少数精鋭チーム）
- 価格: 買い切り Mac $50 / iPhone $10 / iPad $20（合計$80、サブスクなし）
- **Apple専用**

### コア機能
| 機能 | 詳細 |
|------|------|
| タスク追加 | Magic Plus（ドラッグ操作で即座に作成）、自然言語日付入力（Jump Start） |
| 完了 | チェック式 |
| 繰り返し | カレンダー間隔 or 完了後間隔 |
| サブタスク | チェックリスト形式で対応 |
| ラベル/タグ | タグ対応 |
| プロジェクト分類 | Areas（生活領域）→ Projects の2層構造（GTD準拠） |

### UX特徴
- **Today & This Evening**: 今日のタスクと夕方タスクを分離。メインリストをクリーンに保つ
- **Quick Find**: 全データ横断のインクリメンタル検索
- **Jump Start**: ポップアップで日付・リマインダーを自然言語設定
- **Apple深度統合**: Siri、Apple Watch、Shortcuts対応
- **極限の速度**: タスク作成・検索・ナビゲーションが瞬時
- **美しいデザイン**: Apple Design Awardクラスの洗練されたUI

### エンゲージメント施策
- **ゲーミフィケーションなし**: Karma/ポイント/バッジは一切なし
- **ログブック**: 完了タスクの履歴閲覧のみ
- **哲学**: 「ツールではなく思考をクリアにする」ことに徹底特化

### AI機能
- **AI機能なし**（2026年時点）。Apple Reminders側がApple Intelligence統合を進める中、Things 3は洗練・安定性に注力
- **制限事項**: コラボ機能なし、ファイル添付不可、時間トラッキングなし、Windows/Android/Web版なし

---

# Part 2: 日記/ジャーナルアプリ（トップ3）

---

## 4. Day One

### 基本情報
- 開発: Automattic（2021年買収、WordPress親会社）
- 受賞: Apple App of the Year、15万以上の5つ星レビュー
- 価格: $49.99/年（年額のみ、月額なし）
- プラットフォーム: iOS, macOS, Android, Windows（2025年対応）, Web

### コア機能
| 機能 | 詳細 |
|------|------|
| テキスト入力 | リッチテキスト + マークダウン |
| 写真添付 | 写真・動画・音声対応 |
| 位置情報 | 自動記録 + 地図ビュー |
| 天気自動記録 | あり |
| テンプレート | Prompt Packs（テーマ別ジャーナリングプロンプト集） |
| その他 | Apple Watch quick-capture、IFTTT連携（Spotify/フィットネス等の自動ログ） |

### UX特徴
- **リッチテキスト + マークダウン**: 両対応
- **タグ**: 自動タグ（天気、位置、音楽）+ 手動タグ
- **検索**: 全文検索
- **カレンダービュー**: 日付別ブラウジング
- **印刷書籍化**: ジャーナルから物理書籍を作成可能
- **iOS 26**: Liquid Glass UI対応

### エンゲージメント施策
- **On This Day**: 過去の同日エントリをフラッシュバック表示（最も強力なリテンション機能）
- **ストリーク**: 連続記録日数の表示
- **リマインダー**: 記録促進通知
- **振り返り通知**: 過去エントリの再発見

### AI機能（Day One Labs経由）
- **Go Deeper**: 書いた内容に基づく動的な深掘りプロンプト生成
- **AI画像生成**: エントリ内容からカスタム画像を生成
- **AIタイトル提案**: エントリ内容からタイトル候補を生成
- **AIエントリ要約**: 個別エントリの要約生成
- **AI複数エントリ要約**: 同日の複数年エントリを統合要約
- **音声書き起こし**: 録音→テキスト変換（AI処理版はLabs）
- プライバシー: オプトイン制、内容はAI学習不使用、HTTPS経由処理後即削除

---

## 5. Journey

### 基本情報
- 開発: Two App Studio
- 実績: 10万以上の5つ星レビュー、Google Playで100万DL超
- 価格: $29.99/年
- プラットフォーム: iOS, Android, macOS, Windows, Web, Chrome OS

### コア機能
| 機能 | 詳細 |
|------|------|
| テキスト入力 | リッチテキスト + マークダウン |
| 写真添付 | 写真、動画、音声対応 |
| 位置情報 | 地図ビュー（Atlas） |
| 天気自動記録 | あり |
| テンプレート | 60以上のガイド付きジャーナリングプログラム（専門コーチ監修） |
| その他 | 気分トラッキング、Google Drive同期、エンドツーエンド暗号化 |

### UX特徴
- **クロスプラットフォーム**: 最広範（6プラットフォーム + Chrome OS）
- **マルチメディア**: 写真・動画・音声の複合ジャーナリング
- **気分トラッカー**: 感情パターンの長期追跡
- **Atlas（地図ビュー）**: 記録場所の地図表示
- **iOS 26**: Liquid Glass対応

### エンゲージメント施策
- **コーチプログラム**: 自己発見、成長、マインドフルネス、感謝等のテーマ別プログラム（デイリープロンプト）
- **リマインダー**: 記録促進通知
- **気分統計**: 感情パターンの可視化

### AI機能
- **Odyssey AI**: GPTベースの対話型記憶探索。過去エントリに質問し、パターン・気分・目標進捗のインサイトを取得
- **Reflections（2026新機能）**: エントリへのフォローアップ質問でより深い執筆を促進（Apple Intelligence対応デバイスではオンデバイス・オフラインAI）

---

## 6. Notion（日記テンプレート利用）

### 基本情報
- 開発: Notion Labs
- 価格: 無料 / Plus $10/ユーザー/月 / Business $15 / Enterprise（AI追加は別料金）
- プラットフォーム: Web, iOS, Android, macOS, Windows

### コア機能
| 機能 | 詳細 |
|------|------|
| テキスト入力 | ブロックベースのリッチエディタ |
| 写真添付 | 画像・動画・ファイル埋め込み |
| 位置情報 | なし（手動記録のみ） |
| 天気自動記録 | なし |
| テンプレート | 膨大なコミュニティテンプレート（年間プランナー、習慣トラッカー、気分記録等）。400ページ超のものも |

### UX特徴
- **極度の柔軟性**: データベース + ページ + ビューの組合せで任意の日記構造を構築可能
- **リッチテキスト + マークダウン**: ブロック単位の編集
- **タグ**: データベースプロパティで自由設計
- **検索**: 全ワークスペース横断検索
- **カレンダービュー**: データベースビューとして提供
- **テンプレートボタン**: ワンクリックで日次テンプレート複製

### エンゲージメント施策
- **標準のエンゲージメント施策なし**: リマインダー・ストリーク・On This Dayは組み込みなし
- **自作可能**: データベースとフォーミュラで独自のストリーク計算や統計ダッシュボードを構築可能
- **コミュニティ**: テンプレートギャラリーの充実度が継続利用のモチベーション

### AI機能
- **Notion AI（別料金）**: テキスト要約、文法修正、翻訳、ドラフト生成、アクションアイテム抽出
- **Ask AI**: 任意のテキストを選択→要約/説明/書き換え
- **AIデータベースプロパティ**: AI要約、AIキーワード、AI翻訳の自動付与
- **カスタムエージェント（2026新機能）**: トリガー/スケジュールベースの自動化エージェント（$10/1,000クレジット）

---

# Part 3: 比較サマリー

## Todoアプリ比較

| 観点 | Todoist | TickTick | Things 3 |
|------|---------|----------|----------|
| 自然言語入力 | 業界最高 | 良好 | 限定的 |
| AI機能 | Ramble（音声→タスク）、Task/Filter/Email Assist | なし | なし |
| ポモドーロ | なし | 統合済み | なし |
| 習慣トラッキング | なし | 統合済み | なし |
| カレンダー/タイムブロック | 限定的 | 強力 | なし |
| ゲーミフィケーション | Karma + ストリーク + レベル | 達成スコア + バッジ + ストリーク | なし |
| プラットフォーム | 全OS | 主要OS | Apple専用 |
| 価格モデル | サブスク | サブスク（安価） | 買い切り |
| 哲学 | 機能+AI拡張 | オールインワン生産性 | ミニマル美学 |

## 日記アプリ比較

| 観点 | Day One | Journey | Notion（テンプレート） |
|------|---------|---------|----------------------|
| 位置/天気自動記録 | あり | あり | なし |
| On This Day | あり（最強のリテンション施策） | なし | なし（自作可） |
| AI深掘り | Go Deeper（プロンプト生成） | Odyssey AI（対話型探索） | Ask AI（汎用） |
| ガイド付きプログラム | Prompt Packs | 60+コーチプログラム | コミュニティテンプレート |
| 気分トラッキング | 限定的 | あり | テンプレート依存 |
| カスタマイズ性 | 低 | 中 | 極高 |
| プライバシー | AIオプトイン、即削除 | E2E暗号化 | データはNotion管理 |
| 価格 | $49.99/年（高め） | $29.99/年 | 無料～$10+/月+AI |

---

# Part 4: Aneurasync へのインサイト

### 発見事項
1. **音声→構造化が次の入力フロンティア**: Todoistの Ramble は3週間で29万セッション、課金率5倍。「話すだけで記録」は強力
2. **ゲーミフィケーションは二極化**: Todoist/TickTickはKarma/スコアで習慣化を促進。Things 3は一切排除し「思考の明晰さ」で勝負
3. **On This Day は最強のリテンション施策**: Day Oneの「過去の今日」は感情的な再接続を生み、継続率に直結
4. **AIコーチ/深掘りが差別化の鍵**: JourneyのOdyssey AI（過去エントリへの質問）とDay OneのGo Deeper（動的プロンプト）が新潮流
5. **ポモドーロ+習慣のオールインワン**: TickTickの統合アプローチは「アプリ疲れ」を防ぎ、$36/年で高コスパ
6. **構造化 vs 自由度のトレードオフ**: Day One/Journeyは構造化体験、Notionは自由度。ターゲットにより最適解が異なる

### インサイト（Aneurasyncへの示唆）
- **Stargazer観測 + On This Day**: 「1年前の今日、あなたはこう判断していた」は自己理解アプリとして最も刺さるリテンション施策になり得る
- **音声観測の可能性**: Rambleの成功は「話すだけで深層観測」の実現可能性を示唆。観測質問への音声回答→AI構造化は検討価値あり
- **ストリーク設計**: 観測の継続性はデータ精度に直結。「観測ストリーク」は機能的にもエンゲージメント的にも合理的
- **AIの役割の違い**: Todoアプリは「入力の自動化」、日記アプリは「振り返りの深化」にAIを使用。Aneurasyncは後者（深化）が本質に近い
- **ゲーミフィケーション不採用の選択肢**: Things 3の成功は「ポイント/バッジなしでも洗練UXで勝てる」ことを証明。Aneurasyncの世界観にはこちらが合う可能性

### 推奨アクション
1. **「過去の観測」振り返り機能の優先検討**: On This Day型の「1年前の自分」表示をOrigin/Stargazerに組み込む
2. **観測ストリークの導入検討**: ただしゲーミフィケーション的ではなく「観測精度が上がる」という本質的価値と紐づける
3. **音声観測のフィージビリティ調査**: Gemini/Whisper等を使った「話すだけで観測」のプロトタイプ検討
4. **AI深掘りの強化**: Day OneのGo Deeper / JourneyのOdyssey AI的な「過去データへの対話型質問」をStargazerに応用

### 情報ソース
- [Todoist Ramble発表 - TechCrunch](https://techcrunch.com/2026/01/21/todoists-app-now-lets-you-add-tasks-to-your-to-do-list-by-speaking-to-its-ai/)
- [Todoist Review 2026](https://max-productive.ai/ai-tools/todoist/)
- [Todoist Karma](https://www.todoist.com/karma)
- [Todoist Gamification Case Study](https://trophy.so/blog/todoist-gamification-case-study)
- [TickTick Review 2026](https://work-management.org/to-do-list/ticktick-review/)
- [TickTick Features](https://ticktick.com/features?language=en_us)
- [TickTick Achievement Scores](https://support.ticktick.com/hc/en-us/articles/360016494591-Achievement-Scores-Statistics-)
- [TickTick Gamification Case Study](https://trophy.so/blog/ticktick-gamification-case-study)
- [Things 3 Review 2025](https://productivewithchris.com/tools/things-3/)
- [Things 3 Review - Cloudwards](https://www.cloudwards.net/things-review/)
- [Things 3 Review - TechRadar](https://www.techradar.com/reviews/things-3)
- [Day One AI Features](https://dayoneapp.com/guides/labs/ai-features/)
- [Day One Alternatives 2026](https://blog.mylifenote.ai/day-one-journal-alternative/)
- [Best AI Journaling Apps 2026](https://www.aijournalapp.ai/blog/best-ai-journal-apps/)
- [Journey.Cloud](https://journey.cloud/)
- [Journey App Review](https://riyahspeaks.com/journey-app-review/)
- [Best Journaling Apps 2026](https://www.reflection.app/blog/best-journaling-apps)
- [Notion AI Overview 2026](https://pradeepsingh.com/notion-ai/)
- [Notion AI Product Page](https://www.notion.com/product/ai)
- [Best Notion Journal Templates 2026](https://www.notioneverything.com/blog/notion-journal-templates)
