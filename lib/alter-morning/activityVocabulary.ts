/**
 * Activity Vocabulary — アクティビティ語彙テーブル
 *
 * ユーザーが自然な日本語で書いた予定テキスト（「コード修正」「英語の勉強」「買い物に行く」）を
 * 構造化されたカテゴリ・所要時間・場所属性に正規化する。
 *
 * types.ts の DEFAULT_DURATION_MAP を置き換える包括的なテーブル。
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// カテゴリ型定義
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ActivityCategory =
  | "work_code"        // コーディング・プログラミング
  | "work_design"      // デザイン・設計
  | "work_meeting"     // ミーティング・会議
  | "work_document"    // 資料作成・ドキュメント
  | "work_email"       // メール・連絡
  | "work_general"     // 一般的な仕事
  | "study_language"   // 語学学習
  | "study_exam"       // 資格・試験勉強
  | "study_reading"    // 読書・文献
  | "study_academic"   // 学校の勉強・宿題
  | "study_general"    // 一般的な勉強
  | "errand_shopping"  // 買い物
  | "errand_medical"   // 通院
  | "errand_admin"     // 手続き（役所・銀行）
  | "errand_grooming"  // 美容院・理髪
  | "errand_general"   // 一般的な用事
  | "life_cleaning"    // 掃除・片付け
  | "life_laundry"     // 洗濯
  | "life_cooking"     // 料理・食事準備
  | "life_rest"        // 休憩・仮眠
  | "life_general"     // 一般的な生活
  | "exercise_gym"     // ジム・筋トレ
  | "exercise_run"     // ランニング・ジョギング
  | "exercise_yoga"    // ヨガ・ストレッチ
  | "exercise_sports"  // スポーツ全般
  | "exercise_walk"    // 散歩・ウォーキング
  | "social_meal"      // 友人・知人との食事
  | "social_drink"     // 飲み会
  | "social_date"      // デート
  | "social_event"     // イベント・パーティ
  | "social_general"   // 一般的な社交
  | "creative_art"     // 絵・デザイン制作
  | "creative_music"   // 音楽
  | "creative_writing" // 執筆・ブログ
  | "creative_photo"   // 写真・動画
  | "creative_general" // 一般的な創作
  | "entertainment"    // 娯楽（映画・ゲーム等）
  | "travel"           // 旅行・移動
  | "other";           // その他

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// アクティビティエントリ型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ActivityEntry {
  /** 正規化されたアクティビティ名 */
  canonical: string;
  /** ユーザーが使いそうな表現のリスト */
  aliases: string[];
  /** カテゴリ */
  category: ActivityCategory;
  /** デフォルト所要時間（分） */
  defaultDurationMin: number;
  /** 屋内か屋外か */
  venue?: "indoor" | "outdoor" | "either";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// アクティビティテーブル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ACTIVITY_TABLE: ActivityEntry[] = [

  // ──────────────────────────────────────────────────────────────────────────
  // 仕事 — コーディング・プログラミング (work_code)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "コーディング",
    aliases: ["コーディング", "コード書く", "コード書き", "プログラミング", "プログラム"],
    category: "work_code",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "コード修正",
    aliases: ["コード修正", "バグ修正", "バグフィックス", "bugfix", "bug fix", "修正作業"],
    category: "work_code",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "実装",
    aliases: ["実装", "機能実装", "新機能", "フィーチャー", "feature"],
    category: "work_code",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "デバッグ",
    aliases: ["デバッグ", "デバック", "debug", "障害調査", "原因調査", "トラブルシューティング"],
    category: "work_code",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "コードレビュー",
    aliases: ["コードレビュー", "レビュー", "PR確認", "プルリク確認", "review"],
    category: "work_code",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "テスト",
    aliases: ["テスト", "テスト書く", "テストコード", "ユニットテスト", "E2Eテスト", "テスト実行", "動作確認"],
    category: "work_code",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "デプロイ",
    aliases: ["デプロイ", "リリース", "リリース作業", "deploy", "本番反映", "ステージング"],
    category: "work_code",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "設計",
    aliases: ["設計", "アーキテクチャ", "システム設計", "DB設計", "テーブル設計", "技術設計"],
    category: "work_code",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "DB作業",
    aliases: ["DB作業", "データベース", "マイグレーション", "SQL", "クエリ"],
    category: "work_code",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "API開発",
    aliases: ["API開発", "API実装", "API", "エンドポイント", "バックエンド開発"],
    category: "work_code",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "フロント実装",
    aliases: ["フロント実装", "フロントエンド", "UI実装", "画面実装", "コンポーネント作成"],
    category: "work_code",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "バックエンド",
    aliases: ["バックエンド", "サーバーサイド", "サーバー実装"],
    category: "work_code",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "インフラ作業",
    aliases: ["インフラ", "インフラ作業", "サーバー作業", "AWS", "クラウド設定", "環境構築"],
    category: "work_code",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "リファクタリング",
    aliases: ["リファクタリング", "リファクタ", "コード整理", "コード改善"],
    category: "work_code",
    defaultDurationMin: 90,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 仕事 — デザイン・設計 (work_design)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "UIデザイン",
    aliases: ["UIデザイン", "UXデザイン", "UI設計", "UX設計", "画面デザイン", "ワイヤーフレーム", "モックアップ"],
    category: "work_design",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "デザイン作業",
    aliases: ["デザイン", "デザイン作業", "Figma", "フィグマ", "バナー作成", "素材作成"],
    category: "work_design",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "企画設計",
    aliases: ["企画設計", "サービス設計", "仕様策定", "要件定義", "仕様書"],
    category: "work_design",
    defaultDurationMin: 90,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 仕事 — ミーティング・会議 (work_meeting)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "ミーティング",
    aliases: ["ミーティング", "MTG", "mtg", "ミーティン"],
    category: "work_meeting",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "会議",
    aliases: ["会議", "社内会議", "定例", "定例会議", "朝会", "チームミーティング"],
    category: "work_meeting",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "打ち合わせ",
    aliases: ["打ち合わせ", "打合せ", "うちあわせ"],
    category: "work_meeting",
    defaultDurationMin: 60,
    venue: "either",
  },
  {
    canonical: "面談",
    aliases: ["面談", "1on1", "ワンオンワン", "個人面談", "上司面談"],
    category: "work_meeting",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "面接",
    aliases: ["面接", "採用面接", "転職面接", "オンライン面接", "Web面接"],
    category: "work_meeting",
    defaultDurationMin: 60,
    venue: "either",
  },
  {
    canonical: "商談",
    aliases: ["商談", "クライアント打ち合わせ", "顧客ミーティング", "取引先訪問"],
    category: "work_meeting",
    defaultDurationMin: 60,
    venue: "either",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 仕事 — 資料作成・ドキュメント (work_document)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "資料作成",
    aliases: ["資料作成", "資料", "資料作り", "資料づくり"],
    category: "work_document",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "プレゼン準備",
    aliases: ["プレゼン準備", "プレゼン", "プレゼン資料", "発表準備", "発表資料"],
    category: "work_document",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "スライド作成",
    aliases: ["スライド作成", "スライド", "パワポ", "PowerPoint", "Keynote", "GoogleSlides"],
    category: "work_document",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "企画書",
    aliases: ["企画書", "企画書作成", "提案書", "提案書作成"],
    category: "work_document",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "報告書",
    aliases: ["報告書", "レポート作成", "報告書作成", "週報", "日報", "月報"],
    category: "work_document",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "ドキュメント",
    aliases: ["ドキュメント", "ドキュメント整理", "ドキュメント作成", "マニュアル", "手順書"],
    category: "work_document",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "議事録",
    aliases: ["議事録", "議事録作成", "メモ整理"],
    category: "work_document",
    defaultDurationMin: 30,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 仕事 — メール・連絡 (work_email)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "メール",
    aliases: ["メール", "メール返信", "メール確認", "メール処理", "メール対応"],
    category: "work_email",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "Slack確認",
    aliases: ["Slack確認", "Slack", "スラック", "チャット確認", "チャット返信", "Teams確認"],
    category: "work_email",
    defaultDurationMin: 20,
    venue: "indoor",
  },
  {
    canonical: "連絡対応",
    aliases: ["連絡対応", "返信", "連絡", "電話対応", "問い合わせ対応"],
    category: "work_email",
    defaultDurationMin: 20,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 仕事 — 一般 (work_general)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "仕事",
    aliases: ["仕事", "お仕事", "業務", "出勤", "出社"],
    category: "work_general",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "事務作業",
    aliases: ["事務作業", "事務", "雑務", "庶務", "デスクワーク"],
    category: "work_general",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "経理",
    aliases: ["経理", "経理作業", "帳簿", "会計", "確定申告"],
    category: "work_general",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "請求書",
    aliases: ["請求書", "請求書作成", "見積書", "見積もり", "見積もり作成", "納品書"],
    category: "work_general",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "営業",
    aliases: ["営業", "営業活動", "テレアポ", "新規開拓", "顧客訪問"],
    category: "work_general",
    defaultDurationMin: 120,
    venue: "either",
  },
  {
    canonical: "作業",
    aliases: ["作業", "PC作業", "パソコン作業"],
    category: "work_general",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "バイト",
    aliases: ["バイト", "アルバイト", "シフト"],
    category: "work_general",
    defaultDurationMin: 240,
    venue: "either",
  },
  {
    canonical: "リモートワーク",
    aliases: ["リモートワーク", "在宅勤務", "テレワーク", "リモート"],
    category: "work_general",
    defaultDurationMin: 120,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 勉強 — 語学 (study_language)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "英語学習",
    aliases: ["英語", "英語の勉強", "英語勉強", "English", "英語学習"],
    category: "study_language",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "英会話",
    aliases: ["英会話", "英会話レッスン", "オンライン英会話", "英語レッスン"],
    category: "study_language",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "TOEIC",
    aliases: ["TOEIC", "トーイック", "TOEIC対策", "TOEIC勉強"],
    category: "study_language",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "TOEFL",
    aliases: ["TOEFL", "トーフル", "TOEFL対策", "TOEFL勉強"],
    category: "study_language",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "中国語",
    aliases: ["中国語", "中国語の勉強", "中国語学習", "HSK"],
    category: "study_language",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "韓国語",
    aliases: ["韓国語", "韓国語の勉強", "韓国語学習", "ハングル", "TOPIK"],
    category: "study_language",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "語学学習",
    aliases: ["語学", "語学学習", "外国語", "言語学習", "単語帳", "単語暗記"],
    category: "study_language",
    defaultDurationMin: 45,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 勉強 — 資格・試験 (study_exam)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "資格勉強",
    aliases: ["資格勉強", "資格の勉強", "資格取得", "資格対策"],
    category: "study_exam",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "試験勉強",
    aliases: ["試験勉強", "テスト勉強", "期末勉強", "中間勉強", "模試"],
    category: "study_exam",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "受験勉強",
    aliases: ["受験勉強", "受験対策", "入試対策", "受験"],
    category: "study_exam",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "簿記",
    aliases: ["簿記", "簿記の勉強", "日商簿記"],
    category: "study_exam",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "FP",
    aliases: ["FP", "ファイナンシャルプランナー", "FP勉強"],
    category: "study_exam",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "基本情報",
    aliases: ["基本情報", "基本情報技術者", "応用情報", "情報処理試験"],
    category: "study_exam",
    defaultDurationMin: 60,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 勉強 — 読書・文献 (study_reading)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "読書",
    aliases: ["読書", "本を読む", "本読み", "本読む"],
    category: "study_reading",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "技術書",
    aliases: ["技術書", "技術書読む", "技術書読み", "参考書", "専門書"],
    category: "study_reading",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "論文",
    aliases: ["論文", "論文読む", "論文執筆", "論文書く", "文献調査", "文献読み"],
    category: "study_reading",
    defaultDurationMin: 90,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 勉強 — 学校 (study_academic)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "宿題",
    aliases: ["宿題", "課題", "課題提出", "レポート提出"],
    category: "study_academic",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "レポート",
    aliases: ["レポート", "レポート書く", "レポート書き"],
    category: "study_academic",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "予習",
    aliases: ["予習", "予習する", "事前学習"],
    category: "study_academic",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "復習",
    aliases: ["復習", "復習する", "見直し", "おさらい"],
    category: "study_academic",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "数学",
    aliases: ["数学", "数学の勉強", "計算", "線形代数", "微積"],
    category: "study_academic",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "物理",
    aliases: ["物理", "物理の勉強", "物理学"],
    category: "study_academic",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "化学",
    aliases: ["化学", "化学の勉強"],
    category: "study_academic",
    defaultDurationMin: 60,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 勉強 — 一般 (study_general)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "勉強",
    aliases: ["勉強", "勉強する", "学習", "自習", "独学"],
    category: "study_general",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "オンライン講座",
    aliases: ["オンライン講座", "Udemy", "YouTube学習", "動画学習", "講座", "セミナー受講"],
    category: "study_general",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "研究",
    aliases: ["研究", "研究活動", "ゼミ準備", "ゼミ"],
    category: "study_general",
    defaultDurationMin: 120,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 用事 — 買い物 (errand_shopping)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "買い物",
    aliases: ["買い物", "お買い物", "買い出し", "ショッピング"],
    category: "errand_shopping",
    defaultDurationMin: 30,
    venue: "outdoor",
  },
  {
    canonical: "スーパー",
    aliases: ["スーパー", "スーパー行く", "スーパー行き", "スーパーに行く", "食材買い出し", "食材買い物"],
    category: "errand_shopping",
    defaultDurationMin: 30,
    venue: "outdoor",
  },
  {
    canonical: "コンビニ",
    aliases: ["コンビニ", "コンビニ行く", "コンビニに行く"],
    category: "errand_shopping",
    defaultDurationMin: 15,
    venue: "outdoor",
  },
  {
    canonical: "日用品買い物",
    aliases: ["日用品", "日用品買い物", "ドラッグストア", "ドラスト", "薬局で買い物", "ホームセンター"],
    category: "errand_shopping",
    defaultDurationMin: 30,
    venue: "outdoor",
  },
  {
    canonical: "服買い物",
    aliases: ["服買い", "服を買う", "服買う", "洋服買い", "アパレル", "服屋"],
    category: "errand_shopping",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "家電買い物",
    aliases: ["家電", "家電量販店", "ヨドバシ", "ビックカメラ", "電気屋"],
    category: "errand_shopping",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "百均",
    aliases: ["百均", "100均", "ダイソー", "セリア", "キャンドゥ"],
    category: "errand_shopping",
    defaultDurationMin: 20,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 用事 — 通院 (errand_medical)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "歯医者",
    aliases: ["歯医者", "歯科", "歯医者に行く", "歯科検診", "歯のクリーニング"],
    category: "errand_medical",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "病院",
    aliases: ["病院", "病院に行く", "通院", "診察", "受診"],
    category: "errand_medical",
    defaultDurationMin: 90,
    venue: "outdoor",
  },
  {
    canonical: "内科",
    aliases: ["内科", "内科受診", "かかりつけ"],
    category: "errand_medical",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "眼科",
    aliases: ["眼科", "眼科受診", "目医者", "コンタクト処方"],
    category: "errand_medical",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "皮膚科",
    aliases: ["皮膚科", "皮膚科受診"],
    category: "errand_medical",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "整形外科",
    aliases: ["整形外科", "整骨院", "接骨院"],
    category: "errand_medical",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "心療内科",
    aliases: ["心療内科", "メンタルクリニック", "カウンセリング"],
    category: "errand_medical",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "薬局",
    aliases: ["薬局", "処方箋", "薬をもらう"],
    category: "errand_medical",
    defaultDurationMin: 20,
    venue: "outdoor",
  },
  {
    canonical: "健康診断",
    aliases: ["健康診断", "健診", "人間ドック"],
    category: "errand_medical",
    defaultDurationMin: 120,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 用事 — 手続き (errand_admin)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "役所",
    aliases: ["役所", "市役所", "区役所", "町役場", "役場", "区役所に行く", "住民票"],
    category: "errand_admin",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "銀行",
    aliases: ["銀行", "銀行に行く", "ATM", "口座", "振込"],
    category: "errand_admin",
    defaultDurationMin: 30,
    venue: "outdoor",
  },
  {
    canonical: "郵便局",
    aliases: ["郵便局", "郵便", "荷物出す", "荷物受け取り", "宅配便"],
    category: "errand_admin",
    defaultDurationMin: 20,
    venue: "outdoor",
  },
  {
    canonical: "手続き",
    aliases: ["手続き", "届出", "申請", "契約", "解約手続き"],
    category: "errand_admin",
    defaultDurationMin: 60,
    venue: "either",
  },
  {
    canonical: "引っ越し",
    aliases: ["引っ越し", "引越し", "引越", "荷造り", "梱包"],
    category: "errand_admin",
    defaultDurationMin: 240,
    venue: "either",
  },
  {
    canonical: "車検",
    aliases: ["車検", "車の点検", "車メンテナンス", "オイル交換", "タイヤ交換"],
    category: "errand_admin",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "修理",
    aliases: ["修理", "修理に出す", "修理依頼"],
    category: "errand_admin",
    defaultDurationMin: 60,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 用事 — 美容・理容 (errand_grooming)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "美容院",
    aliases: ["美容院", "美容室", "ヘアサロン", "サロン", "カット", "髪切る", "髪切り"],
    category: "errand_grooming",
    defaultDurationMin: 90,
    venue: "outdoor",
  },
  {
    canonical: "床屋",
    aliases: ["床屋", "理容室", "バーバー", "理髪店"],
    category: "errand_grooming",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "ネイル",
    aliases: ["ネイル", "ネイルサロン", "ジェルネイル", "ネイルケア"],
    category: "errand_grooming",
    defaultDurationMin: 90,
    venue: "outdoor",
  },
  {
    canonical: "エステ",
    aliases: ["エステ", "エステサロン", "マッサージ", "整体", "リラクゼーション"],
    category: "errand_grooming",
    defaultDurationMin: 60,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 用事 — 一般 (errand_general)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "用事",
    aliases: ["用事", "外出", "お使い", "おつかい"],
    category: "errand_general",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "クリーニング",
    aliases: ["クリーニング", "クリーニング出す", "クリーニング取りに行く"],
    category: "errand_general",
    defaultDurationMin: 15,
    venue: "outdoor",
  },
  {
    canonical: "ペット",
    aliases: ["ペットの世話", "犬の散歩", "猫の世話", "動物病院", "ペットショップ"],
    category: "errand_general",
    defaultDurationMin: 30,
    venue: "either",
  },
  {
    canonical: "子供の送迎",
    aliases: ["子供の送迎", "保育園", "幼稚園", "塾の送迎", "習い事送迎", "送り迎え"],
    category: "errand_general",
    defaultDurationMin: 30,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 生活 — 掃除・片付け (life_cleaning)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "掃除",
    aliases: ["掃除", "掃除する", "お掃除", "部屋掃除", "掃除機", "拭き掃除", "モップ"],
    category: "life_cleaning",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "片付け",
    aliases: ["片付け", "片づけ", "かたづけ", "部屋片付け", "整理整頓", "整理"],
    category: "life_cleaning",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "トイレ掃除",
    aliases: ["トイレ掃除", "風呂掃除", "お風呂掃除", "キッチン掃除", "水回り掃除"],
    category: "life_cleaning",
    defaultDurationMin: 20,
    venue: "indoor",
  },
  {
    canonical: "ゴミ出し",
    aliases: ["ゴミ出し", "ごみ出し", "ゴミ捨て", "ごみ捨て", "不用品処分", "断捨離"],
    category: "life_cleaning",
    defaultDurationMin: 10,
    venue: "either",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 生活 — 洗濯 (life_laundry)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "洗濯",
    aliases: ["洗濯", "洗濯する", "洗濯物", "洗濯物干す", "洗濯物たたむ"],
    category: "life_laundry",
    defaultDurationMin: 20,
    venue: "indoor",
  },
  {
    canonical: "布団干し",
    aliases: ["布団干し", "ふとん干し", "布団干す", "シーツ替え"],
    category: "life_laundry",
    defaultDurationMin: 15,
    venue: "either",
  },
  {
    canonical: "アイロン",
    aliases: ["アイロン", "アイロンがけ", "アイロンかけ"],
    category: "life_laundry",
    defaultDurationMin: 20,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 生活 — 料理・食事準備 (life_cooking)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "料理",
    aliases: ["料理", "料理する", "自炊", "ご飯作る", "ごはん作る", "飯作る"],
    category: "life_cooking",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "朝食準備",
    aliases: ["朝食", "朝食準備", "朝ごはん", "朝ご飯作る", "モーニング"],
    category: "life_cooking",
    defaultDurationMin: 20,
    venue: "indoor",
  },
  {
    canonical: "昼食準備",
    aliases: ["昼食", "昼食準備", "昼ごはん", "昼ご飯作る", "お昼"],
    category: "life_cooking",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "夕食準備",
    aliases: ["夕食", "夕食準備", "夕ごはん", "夕ご飯作る", "晩ごはん", "晩ご飯作る", "夜ご飯"],
    category: "life_cooking",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "食事準備",
    aliases: ["食事準備", "下ごしらえ", "作り置き", "お弁当", "弁当作り", "お弁当作る"],
    category: "life_cooking",
    defaultDurationMin: 45,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 生活 — 休憩・仮眠 (life_rest)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "休憩",
    aliases: ["休憩", "ひと休み", "一休み", "休む", "ブレイク"],
    category: "life_rest",
    defaultDurationMin: 15,
    venue: "indoor",
  },
  {
    canonical: "仮眠",
    aliases: ["仮眠", "昼寝", "ひるね", "パワーナップ", "うたた寝"],
    category: "life_rest",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "入浴",
    aliases: ["風呂", "お風呂", "シャワー", "入浴", "半身浴"],
    category: "life_rest",
    defaultDurationMin: 30,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 生活 — 一般 (life_general)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "身支度",
    aliases: ["身支度", "準備", "支度", "したく", "出かける準備", "メイク", "化粧"],
    category: "life_general",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "家事",
    aliases: ["家事", "家事全般"],
    category: "life_general",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "庭仕事",
    aliases: ["庭仕事", "草むしり", "水やり", "ガーデニング", "庭いじり", "植物の世話"],
    category: "life_general",
    defaultDurationMin: 30,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 運動 — ジム・筋トレ (exercise_gym)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "ジム",
    aliases: ["ジム", "ジム行く", "ジムに行く", "トレーニング", "ウェイトトレーニング"],
    category: "exercise_gym",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "筋トレ",
    aliases: ["筋トレ", "筋力トレーニング", "自重トレーニング", "腕立て", "腹筋", "スクワット"],
    category: "exercise_gym",
    defaultDurationMin: 45,
    venue: "either",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 運動 — ランニング・ジョギング (exercise_run)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "ランニング",
    aliases: ["ランニング", "ランニングする", "走る", "ジョギング", "ジョグ", "マラソン練習"],
    category: "exercise_run",
    defaultDurationMin: 40,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 運動 — ヨガ・ストレッチ (exercise_yoga)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "ヨガ",
    aliases: ["ヨガ", "ホットヨガ", "ヨガレッスン"],
    category: "exercise_yoga",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "ピラティス",
    aliases: ["ピラティス", "ピラティスレッスン"],
    category: "exercise_yoga",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "ストレッチ",
    aliases: ["ストレッチ", "柔軟", "柔軟体操", "体をほぐす"],
    category: "exercise_yoga",
    defaultDurationMin: 15,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 運動 — スポーツ全般 (exercise_sports)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "水泳",
    aliases: ["水泳", "プール", "泳ぐ", "スイミング"],
    category: "exercise_sports",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "テニス",
    aliases: ["テニス", "テニスする"],
    category: "exercise_sports",
    defaultDurationMin: 90,
    venue: "outdoor",
  },
  {
    canonical: "サッカー",
    aliases: ["サッカー", "フットサル", "サッカーする"],
    category: "exercise_sports",
    defaultDurationMin: 90,
    venue: "outdoor",
  },
  {
    canonical: "野球",
    aliases: ["野球", "キャッチボール", "バッティング", "バッティングセンター"],
    category: "exercise_sports",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "バスケ",
    aliases: ["バスケ", "バスケットボール", "バスケする"],
    category: "exercise_sports",
    defaultDurationMin: 90,
    venue: "either",
  },
  {
    canonical: "ゴルフ",
    aliases: ["ゴルフ", "打ちっぱなし", "ゴルフ練習", "ゴルフラウンド"],
    category: "exercise_sports",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "ダンス",
    aliases: ["ダンス", "ダンスレッスン", "ダンス練習", "バレエ"],
    category: "exercise_sports",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "格闘技",
    aliases: ["格闘技", "ボクシング", "キックボクシング", "柔道", "空手", "合気道", "ムエタイ"],
    category: "exercise_sports",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "ボルダリング",
    aliases: ["ボルダリング", "クライミング", "ロッククライミング"],
    category: "exercise_sports",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "サーフィン",
    aliases: ["サーフィン", "波乗り", "サーフ"],
    category: "exercise_sports",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "スキー",
    aliases: ["スキー", "スノボ", "スノーボード"],
    category: "exercise_sports",
    defaultDurationMin: 240,
    venue: "outdoor",
  },
  {
    canonical: "バドミントン",
    aliases: ["バドミントン", "バドミントンする", "卓球"],
    category: "exercise_sports",
    defaultDurationMin: 60,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 運動 — 散歩・ウォーキング (exercise_walk)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "散歩",
    aliases: ["散歩", "散歩する", "お散歩", "ウォーキング", "歩く"],
    category: "exercise_walk",
    defaultDurationMin: 30,
    venue: "outdoor",
  },
  {
    canonical: "ハイキング",
    aliases: ["ハイキング", "登山", "山登り", "トレッキング"],
    category: "exercise_walk",
    defaultDurationMin: 180,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 社交 — 食事 (social_meal)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "ランチ",
    aliases: ["ランチ", "ランチ会", "お昼一緒に", "ランチデート", "昼食会"],
    category: "social_meal",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "ディナー",
    aliases: ["ディナー", "夕食会", "夜ごはん会"],
    category: "social_meal",
    defaultDurationMin: 90,
    venue: "outdoor",
  },
  {
    canonical: "食事会",
    aliases: ["食事会", "食事", "ご飯食べに行く", "外食", "食べに行く"],
    category: "social_meal",
    defaultDurationMin: 60,
    venue: "outdoor",
  },
  {
    canonical: "カフェ",
    aliases: ["カフェ", "カフェ会", "お茶", "お茶する", "カフェに行く", "スタバ"],
    category: "social_meal",
    defaultDurationMin: 60,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 社交 — 飲み会 (social_drink)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "飲み会",
    aliases: ["飲み会", "飲み", "呑み", "飲みに行く", "居酒屋", "呑みに行く"],
    category: "social_drink",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "女子会",
    aliases: ["女子会", "ガールズナイト"],
    category: "social_drink",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "合コン",
    aliases: ["合コン", "飲み会（合コン）", "街コン"],
    category: "social_drink",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "バー",
    aliases: ["バー", "バーに行く", "二次会", "はしご酒"],
    category: "social_drink",
    defaultDurationMin: 90,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 社交 — デート (social_date)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "デート",
    aliases: ["デート", "デートする", "彼女とデート", "彼氏とデート", "お出かけデート"],
    category: "social_date",
    defaultDurationMin: 180,
    venue: "either",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 社交 — イベント (social_event)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "パーティ",
    aliases: ["パーティ", "パーティー", "ホームパーティ", "誕生日会"],
    category: "social_event",
    defaultDurationMin: 120,
    venue: "either",
  },
  {
    canonical: "BBQ",
    aliases: ["BBQ", "バーベキュー", "焼肉パーティ"],
    category: "social_event",
    defaultDurationMin: 180,
    venue: "outdoor",
  },
  {
    canonical: "ピクニック",
    aliases: ["ピクニック", "お花見", "花見"],
    category: "social_event",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "結婚式",
    aliases: ["結婚式", "披露宴", "ウェディング", "二次会（結婚式）"],
    category: "social_event",
    defaultDurationMin: 240,
    venue: "indoor",
  },
  {
    canonical: "同窓会",
    aliases: ["同窓会", "OB会", "クラス会"],
    category: "social_event",
    defaultDurationMin: 120,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 社交 — 一般 (social_general)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "友達と会う",
    aliases: ["友達と会う", "友人と会う", "友達に会う", "友達と遊ぶ", "遊ぶ"],
    category: "social_general",
    defaultDurationMin: 120,
    venue: "either",
  },
  {
    canonical: "家族と過ごす",
    aliases: ["家族と過ごす", "家族の時間", "子供と遊ぶ", "家族サービス"],
    category: "social_general",
    defaultDurationMin: 120,
    venue: "either",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 創作 — 絵・アート (creative_art)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "絵を描く",
    aliases: ["絵を描く", "絵描き", "お絵描き", "イラスト", "イラスト描く", "スケッチ", "デッサン"],
    category: "creative_art",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "デザイン制作",
    aliases: ["デザイン制作", "グラフィック", "ロゴデザイン", "ポスター作り"],
    category: "creative_art",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "手芸",
    aliases: ["手芸", "編み物", "裁縫", "ハンドメイド", "DIY", "工作"],
    category: "creative_art",
    defaultDurationMin: 60,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 創作 — 音楽 (creative_music)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "作曲",
    aliases: ["作曲", "曲作り", "DTM", "トラックメイキング", "ビート作り"],
    category: "creative_music",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "ギター",
    aliases: ["ギター", "ギター練習", "ギター弾く", "エレキ", "アコギ"],
    category: "creative_music",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "ピアノ",
    aliases: ["ピアノ", "ピアノ練習", "ピアノ弾く", "キーボード"],
    category: "creative_music",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "楽器練習",
    aliases: ["楽器練習", "楽器", "ベース", "ドラム", "ウクレレ", "バイオリン", "フルート", "サックス"],
    category: "creative_music",
    defaultDurationMin: 45,
    venue: "indoor",
  },
  {
    canonical: "歌練習",
    aliases: ["歌の練習", "ボイトレ", "ボイストレーニング", "歌う", "歌練"],
    category: "creative_music",
    defaultDurationMin: 30,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 創作 — 執筆 (creative_writing)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "ブログ",
    aliases: ["ブログ", "ブログ書く", "ブログ執筆", "ブログ更新", "記事執筆", "記事書く"],
    category: "creative_writing",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "執筆",
    aliases: ["執筆", "書く", "文章書く", "原稿", "原稿書く"],
    category: "creative_writing",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "小説",
    aliases: ["小説", "小説書く", "創作小説", "物語を書く"],
    category: "creative_writing",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "日記",
    aliases: ["日記", "日記を書く", "ジャーナリング", "振り返り"],
    category: "creative_writing",
    defaultDurationMin: 15,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 創作 — 写真・動画 (creative_photo)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "写真",
    aliases: ["写真", "写真撮影", "カメラ", "フォトウォーク", "撮影"],
    category: "creative_photo",
    defaultDurationMin: 60,
    venue: "either",
  },
  {
    canonical: "動画編集",
    aliases: ["動画編集", "動画作成", "映像編集", "編集作業"],
    category: "creative_photo",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "YouTube",
    aliases: ["YouTube投稿", "YouTube撮影", "YouTube編集", "動画撮影"],
    category: "creative_photo",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "配信",
    aliases: ["配信", "ライブ配信", "生配信", "ストリーミング", "Twitch"],
    category: "creative_photo",
    defaultDurationMin: 120,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 創作 — 一般 (creative_general)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "創作",
    aliases: ["創作", "創作活動", "ものづくり", "制作"],
    category: "creative_general",
    defaultDurationMin: 60,
    venue: "indoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 娯楽 (entertainment)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "映画鑑賞",
    aliases: ["映画", "映画鑑賞", "映画を観る", "映画観る", "映画館", "シネマ"],
    category: "entertainment",
    defaultDurationMin: 150,
    venue: "either",
  },
  {
    canonical: "ゲーム",
    aliases: ["ゲーム", "ゲームする", "ゲームやる", "オンラインゲーム", "スマホゲーム", "ゲーセン"],
    category: "entertainment",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "Netflix",
    aliases: ["Netflix", "ネトフリ", "動画見る", "ドラマ見る", "配信見る", "Amazon Prime", "アマプラ"],
    category: "entertainment",
    defaultDurationMin: 60,
    venue: "indoor",
  },
  {
    canonical: "アニメ",
    aliases: ["アニメ", "アニメ見る", "アニメ観る"],
    category: "entertainment",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "漫画",
    aliases: ["漫画", "漫画読む", "マンガ", "コミック"],
    category: "entertainment",
    defaultDurationMin: 30,
    venue: "indoor",
  },
  {
    canonical: "カラオケ",
    aliases: ["カラオケ", "カラオケ行く", "ヒトカラ"],
    category: "entertainment",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "ボウリング",
    aliases: ["ボウリング", "ボーリング"],
    category: "entertainment",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "美術館",
    aliases: ["美術館", "美術館に行く", "アート展", "展覧会", "展示会", "個展"],
    category: "entertainment",
    defaultDurationMin: 90,
    venue: "indoor",
  },
  {
    canonical: "博物館",
    aliases: ["博物館", "科学館", "水族館", "動物園", "植物園"],
    category: "entertainment",
    defaultDurationMin: 120,
    venue: "either",
  },
  {
    canonical: "ライブ",
    aliases: ["ライブ", "コンサート", "ライブ行く", "フェス", "音楽フェス", "ライブハウス"],
    category: "entertainment",
    defaultDurationMin: 180,
    venue: "either",
  },
  {
    canonical: "観劇",
    aliases: ["観劇", "舞台", "ミュージカル", "演劇", "芝居", "歌舞伎", "落語"],
    category: "entertainment",
    defaultDurationMin: 150,
    venue: "indoor",
  },
  {
    canonical: "温泉",
    aliases: ["温泉", "銭湯", "スーパー銭湯", "サウナ", "岩盤浴", "スパ"],
    category: "entertainment",
    defaultDurationMin: 120,
    venue: "indoor",
  },
  {
    canonical: "遊園地",
    aliases: ["遊園地", "テーマパーク", "ディズニー", "USJ", "ユニバ"],
    category: "entertainment",
    defaultDurationMin: 360,
    venue: "outdoor",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 旅行・移動 (travel)
  // ──────────────────────────────────────────────────────────────────────────
  {
    canonical: "旅行",
    aliases: ["旅行", "旅", "お出かけ", "観光"],
    category: "travel",
    defaultDurationMin: 480,
    venue: "outdoor",
  },
  {
    canonical: "出張",
    aliases: ["出張", "出張準備", "移動日"],
    category: "travel",
    defaultDurationMin: 480,
    venue: "either",
  },
  {
    canonical: "帰省",
    aliases: ["帰省", "実家", "実家に帰る", "里帰り"],
    category: "travel",
    defaultDurationMin: 360,
    venue: "either",
  },
  {
    canonical: "ドライブ",
    aliases: ["ドライブ", "ドライブする", "車で出かける"],
    category: "travel",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
  {
    canonical: "ツーリング",
    aliases: ["ツーリング", "バイクツーリング"],
    category: "travel",
    defaultDurationMin: 240,
    venue: "outdoor",
  },
  {
    canonical: "通勤",
    aliases: ["通勤", "通学", "移動"],
    category: "travel",
    defaultDurationMin: 30,
    venue: "outdoor",
  },
  {
    canonical: "空港",
    aliases: ["空港", "空港に行く", "飛行機", "搭乗"],
    category: "travel",
    defaultDurationMin: 120,
    venue: "outdoor",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 検索用インデックス（初回アクセス時に構築）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * alias → ActivityEntry の逆引きマップ。
 * 長いエイリアスから先に照合するため、長さ降順でソートしたリストも保持する。
 */
interface AliasIndex {
  /** alias文字列 → エントリ */
  map: Map<string, ActivityEntry>;
  /** 長さ降順にソートされた全aliasリスト */
  sortedAliases: string[];
}

let _aliasIndex: AliasIndex | null = null;

/** エイリアスインデックスを遅延構築する */
function getAliasIndex(): AliasIndex {
  if (_aliasIndex) return _aliasIndex;

  const map = new Map<string, ActivityEntry>();

  for (const entry of ACTIVITY_TABLE) {
    for (const alias of entry.aliases) {
      const key = alias.toLowerCase();
      // 長いエイリアスが短いエイリアスを上書きしないよう、初回登録を優先
      if (!map.has(key)) {
        map.set(key, entry);
      }
    }
  }

  // 長いものから順にマッチさせるためソート
  const sortedAliases = Array.from(map.keys()).sort(
    (a, b) => b.length - a.length
  );

  _aliasIndex = { map, sortedAliases };
  return _aliasIndex;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 公開関数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * テキストからアクティビティエントリを解決する。
 *
 * aliases を長い順にスキャンし、テキストに含まれる最長一致のエイリアスに対応する
 * エントリを返す。一致しない場合は null。
 *
 * @param text - ユーザーが入力した予定テキスト（例: 「英語の勉強する」）
 * @returns 一致した ActivityEntry または null
 */
export function resolveActivity(text: string): ActivityEntry | null {
  const index = getAliasIndex();
  const normalized = text
    .replace(/[をのにはがでと、。！？\s]/g, "")
    .toLowerCase();

  for (const alias of index.sortedAliases) {
    if (normalized.includes(alias)) {
      return index.map.get(alias) ?? null;
    }
  }

  return null;
}

/**
 * テキストからアクティビティカテゴリを解決する。
 *
 * resolveActivity のカテゴリ特化版。一致しない場合は "other" を返す。
 *
 * @param text - ユーザーが入力した予定テキスト
 * @returns ActivityCategory（一致しない場合は "other"）
 */
export function resolveActivityCategory(text: string): ActivityCategory {
  const entry = resolveActivity(text);
  return entry?.category ?? "other";
}

/**
 * テキストからデフォルト所要時間（分）を返す。
 *
 * ACTIVITY_TABLE に一致するエントリがあればその defaultDurationMin を、
 * なければフォールバック値 45分 を返す。
 *
 * @param text - ユーザーが入力した予定テキスト
 * @returns 推定所要時間（分）
 */
export function getDefaultDuration(text: string): number {
  const entry = resolveActivity(text);
  return entry?.defaultDurationMin ?? 45;
}
