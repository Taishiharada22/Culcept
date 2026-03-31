/**
 * Feature Introduction Configs — 全機能のイントロダクション定義
 *
 * 各機能ページの初回訪問時に表示するイントロカード＋タブツアーの
 * コンテンツをここで一元管理する。
 */

import type { TabTourItem } from "@/components/ui/FeatureIntroduction";

export interface FeatureIntroConfig {
  sectionKey: string;
  introTitle: string;
  introIcon: string;
  introDescription: string;
  introActions: string;
  introBenefit: string;
  tabs: TabTourItem[];
  startingTab?: string;
}

// ---------------------------------------------------------------------------
// 1. Stars
// ---------------------------------------------------------------------------

export const STARGAZER_INTRO: FeatureIntroConfig = {
  sectionKey: "stargazer",
  introTitle: "Stars",
  introIcon: "🔭",
  introDescription:
    "あなたの性格・判断特性を深層から観測するエンジンです。表面的な性格診断ではなく、判断原理・揺れ方・深層心理まで掴みます。",
  introActions:
    "質問に答えていくだけ。日常のシナリオや選択に対するあなたの反応から、パーソナリティの全体像を描き出します。",
  introBenefit:
    "「自分って、そういう人間だったのか」という発見に出会えます。自分の判断パターン、矛盾、強み、無意識の傾向が言語化されます。",
  tabs: [
    {
      key: "observe",
      icon: "🔭",
      label: "観測",
      title: "観測 — すべてのはじまり",
      description:
        "質問に答えて、あなたの内面データを蓄積します。回答はアンケートではなく「観測の入口」。回答速度・迷い方・選び方すべてがデータになり、あなたの判断原理を浮き彫りにします。",
    },
    {
      key: "starmap",
      icon: "✦",
      label: "星図",
      title: "星図 — あなたの全体像",
      description:
        "観測データから描かれる、あなたの性格の観測マップです。各軸のバランス、傾向の強さ、前回からの変化がビジュアルで確認できます。",
    },
    {
      key: "deep",
      icon: "◎",
      label: "深層",
      title: "深層 — 4層構造の内面探索",
      description:
        "表面→パターン→構造→深淵の4層であなたの心理を掘り下げます。なぜそう判断するのか、何を避けているのか、本当は何を望んでいるのかが見えてきます。",
    },
    {
      key: "traits",
      icon: "◆",
      label: "特性",
      title: "特性 — 5段階の自己認識",
      description:
        "行動パターンの命名から矛盾の統合まで、5段階で特性を理解します。あなたの強み・弱み・パラドックス・成長の方向が具体的に言語化されます。",
    },
    {
      key: "trajectory",
      icon: "〜",
      label: "軌跡",
      title: "軌跡 — 変化の記録",
      description:
        "あなたの性格がどう変化してきたかを時系列で追跡します。成長のマイルストーン、変容の法則、過去の自分との比較が見られます。",
    },
    {
      key: "partner",
      icon: "♢",
      label: "相手",
      title: "相手 — 関係性の中の自分",
      description:
        "友人・恋人・同僚など、相手によって変わるあなたの姿を分析します。関係性ごとの振る舞いの違いから、より深い自己理解に繋がります。",
    },
  ],
  startingTab: "observe",
};

// ---------------------------------------------------------------------------
// 2. Origin
// ---------------------------------------------------------------------------

export const ORIGIN_INTRO: FeatureIntroConfig = {
  sectionKey: "origin",
  introTitle: "Origin",
  introIcon: "🌿",
  introDescription:
    "毎日使うほど、自分の取扱説明書が育つ場所です。日々のタスクや感情を記録するだけで、あなたの行動パターンや法則が浮かび上がります。",
  introActions:
    "今日のタスク管理、ジャーナル記録、蓄積された傾向や法則の確認ができます。",
  introBenefit:
    "続けるほど「自分ってこういう人間だったのか」という発見が増えていきます。Starsとも連動し、行動と性格の接点が見えてきます。",
  tabs: [
    {
      key: "todo",
      icon: "✅",
      label: "今日やること",
      title: "今日やること — 日々の記録",
      description:
        "タスクを自然な言葉で入力し、完了時の手応えを記録します。朝にはその日の傾向予測、Inner Weatherとの連動も表示されます。",
    },
    {
      key: "journal",
      icon: "📝",
      label: "ジャーナル",
      title: "ジャーナル — 感情の記録",
      description:
        "その日の感情や気づきを書き留めます。感情タグ、写真添付、週次レビューを通じて、あなたの感情の基調音が見えてきます。",
    },
    {
      key: "profile",
      icon: "👤",
      label: "プロフィール",
      title: "プロフィール — あなたの全体像",
      description:
        "蓄積されたデータから見えてきた法則、テクスチャの変化、月次レポート、Starsとの接点、そして記憶の深層アーカイブ。あなたの取扱説明書がここに育ちます。",
    },
  ],
  startingTab: "todo",
};

// ---------------------------------------------------------------------------
// 3. Genome Card
// ---------------------------------------------------------------------------

export const GENOME_CARD_INTRO: FeatureIntroConfig = {
  sectionKey: "genome-card",
  introTitle: "Genome Card",
  introIcon: "🧬",
  introDescription:
    "あなたの内面・外見・価値観のデータをカード化した、デジタル名刺です。友達同士で交換して、お互いを深く理解し合えます。",
  introActions:
    "自分のGenomeカードを見る、友達にカードを送る・受け取る、コネクションを広げることができます。",
  introBenefit:
    "自分を一枚のカードで表現できるようになります。友達とカードを交換することで、言葉だけでは伝わらない自分を共有できます。",
  tabs: [
    {
      key: "overview",
      icon: "🧬",
      label: "カード",
      title: "カード — あなたのGenome",
      description:
        "パーソナルカラー、性格タイプ、スタイルDNA、価値観がまとまったあなたのGenomeカードです。データが増えるほど、カードの精度と深みが増します。",
    },
    {
      key: "card",
      icon: "💬",
      label: "トーク",
      title: "トーク — 交換した相手との会話",
      description:
        "Genomeカードを交換した相手とのダイレクトメッセージです。カードをきっかけに、より深い対話が始まります。",
    },
    {
      key: "connections",
      icon: "🤝",
      label: "つながり",
      title: "つながり — コネクション管理",
      description:
        "カード交換のリクエスト、承認、これまでの交換履歴を管理します。誰とどんなつながりがあるかを見渡せます。",
    },
  ],
  startingTab: "overview",
};

// ---------------------------------------------------------------------------
// 4. Rendezvous
// ---------------------------------------------------------------------------

export const RENDEZVOUS_INTRO: FeatureIntroConfig = {
  sectionKey: "rendezvous",
  introTitle: "Rendezvous",
  introIcon: "∞",
  introDescription:
    "あなたの分身（アバター）が先に出会い、相性の良い相手を見つけてくれるアバター先行型の接続機能です。",
  introActions:
    "プロフィールを充実させ、カテゴリ（恋愛・友情・共創・コミュニティ）を選ぶだけ。あとはアバターが自動で活動します。",
  introBenefit:
    "従来のマッチングアプリと違い、片想いが見えず、相互成立した結果だけが届きます。安心して深い出会いが生まれます。",
  tabs: [],
};

// ---------------------------------------------------------------------------
// 5. My-Style
// ---------------------------------------------------------------------------

export const MY_STYLE_INTRO: FeatureIntroConfig = {
  sectionKey: "my-style",
  introTitle: "My Style",
  introIcon: "◆",
  introDescription:
    "あなたのワードローブ、コーディネート、スタイルDNAを管理・分析する場所です。内面と外見をつなぐスタイルの自己理解を深めます。",
  introActions:
    "服の登録、コーデの作成、スタイルの記録・分析、アイデンティティの可視化ができます。",
  introBenefit:
    "「なぜこの服を選ぶのか」という問いに答えが見えてきます。スタイルの傾向と内面の関係性が浮かび上がります。",
  tabs: [
    {
      key: "today",
      icon: "📌",
      label: "今日",
      title: "今日 — 今日のスタイル",
      description:
        "今日のコーディネートの記録と提案です。毎日の選択が、あなたのスタイルDNAの精度を上げていきます。",
    },
    {
      key: "wardrobe",
      icon: "👔",
      label: "ワードローブ",
      title: "ワードローブ — 持ち物一覧",
      description:
        "あなたのクローゼットのデジタル版です。アイテムを登録するほど、スタイル提案やコーデ生成の精度が上がります。",
    },
    {
      key: "setups",
      icon: "✨",
      label: "セットアップ",
      title: "セットアップ — コーデの記録",
      description:
        "実際に着たコーディネートの記録です。シーン・気分・評価を記録することで、自分のスタイルパターンが見えてきます。",
    },
    {
      key: "styles",
      icon: "🎨",
      label: "スタイル",
      title: "スタイル — コレクション",
      description:
        "お気に入りのスタイルテーマをコレクション化できます。自分の「好き」の傾向が整理されます。",
    },
    {
      key: "identity",
      icon: "🪞",
      label: "アイデンティティ",
      title: "アイデンティティ — スタイルDNA",
      description:
        "Starsのデータとスタイル履歴から導き出される、あなたのスタイルアイデンティティです。内面と外見の関係性が見えます。",
    },
    {
      key: "insights",
      icon: "📊",
      label: "インサイト",
      title: "インサイト — 分析レポート",
      description:
        "スタイルの傾向、変化、季節パターンなどの分析結果です。データが溜まるほど深いインサイトが得られます。",
    },
  ],
  startingTab: "today",
};

// ---------------------------------------------------------------------------
// 6. Calendar
// ---------------------------------------------------------------------------

export const CALENDAR_INTRO: FeatureIntroConfig = {
  sectionKey: "calendar",
  introTitle: "カレンダー",
  introIcon: "📅",
  introDescription:
    "天気・気分・着た服・出来事を日々記録するカレンダーです。日常の積み重ねが、あなたの行動パターンや感情の波を可視化します。",
  introActions:
    "毎日の天気確認、着た服の記録、気分のログ、出来事のメモができます。",
  introBenefit:
    "記録が溜まるほど、あなたの生活リズム・気分の波・天候との関係など、無意識のパターンが浮かび上がります。他の機能の分析精度も向上します。",
  tabs: [],
};

// ---------------------------------------------------------------------------
// 7. Body-Color Avatar
// ---------------------------------------------------------------------------

export const BODY_COLOR_AVATAR_INTRO: FeatureIntroConfig = {
  sectionKey: "body-color-avatar",
  introTitle: "Phenotype Hub",
  introIcon: "🧬",
  introDescription:
    "パーソナルカラー・顔立ち・髪質・体型を多角的に分析し、あなたの外見的特徴をひとつに統合する場所です。",
  introActions:
    "まずパーソナルカラー診断から始めましょう。写真をアップロードすると、AIが自動で顔・目・鼻・口の特徴も分析してくれます。",
  introBenefit:
    "内面（Stars）と外見（Phenotype）の両面から自分を理解できます。スタイル提案やマッチングの精度も大きく向上します。",
  tabs: [
    {
      key: "color",
      icon: "🎨",
      label: "カラー",
      title: "まずはここから — パーソナルカラー診断",
      description:
        "写真をアップロードするだけで、AIがあなたの肌・瞳・髪の色を分析し、似合う色の傾向を診断します。この写真データは顔の特徴分析にも自動で活用されます。",
    },
    {
      key: "face",
      icon: "🧑",
      label: "顔",
      title: "顔の特徴マッピング",
      description:
        "目・輪郭・眉・鼻・口の5カテゴリを入力して、あなたの顔立ちの特徴を客観的に把握します。カラー診断で使った写真が参考画像として活用されます。",
    },
    {
      key: "body",
      icon: "📏",
      label: "体型",
      title: "体型・計測データ",
      description:
        "身長・胸囲・ウエストなどの計測データを入力します。フィッティング精度の向上やアバター生成に使われます。",
    },
    {
      key: "hair",
      icon: "💇",
      label: "髪",
      title: "髪質の設定",
      description:
        "髪の長さ・前髪・質感・カラーの5カテゴリを選択するだけ。ダッシュボードからすぐに設定できます。",
    },
  ],
  startingTab: "color",
};

// ---------------------------------------------------------------------------
// 8. Presence (SNS Profile)
// ---------------------------------------------------------------------------

export const PRESENCE_INTRO: FeatureIntroConfig = {
  sectionKey: "presence",
  introTitle: "Presence",
  introIcon: "🪞",
  introDescription:
    "他者から見たあなた、自分から見た自分、その間のギャップを映し出すソーシャルミラーです。",
  introActions:
    "自分のプロフィールを多角的に確認、深層分析、変化の追跡、関係性の中の自分を知ることができます。",
  introBenefit:
    "「他人にどう映っているか」と「自分が思う自分」のギャップが可視化されます。自己理解がさらに深まります。",
  tabs: [
    {
      key: "mirror",
      icon: "🪞",
      label: "ミラー",
      title: "ミラー — 今の自分",
      description:
        "現在のあなたの姿を映すミラーです。各システムのデータが統合された「今のあなた」が見えます。",
    },
    {
      key: "depth",
      icon: "◎",
      label: "深度",
      title: "深度 — 深層プロフィール",
      description:
        "表面的なプロフィールの奥にある、あなたの深層的な特徴です。Starsやその他のデータが統合されて表示されます。",
    },
    {
      key: "change",
      icon: "📈",
      label: "変化",
      title: "変化 — 変遷の記録",
      description:
        "あなたのプロフィールがどう変化してきたかの記録です。成長や変容のパターンが見えます。",
    },
    {
      key: "relations",
      icon: "🤝",
      label: "関係",
      title: "関係 — つながりの中の自分",
      description:
        "他者との関係性の中で見える自分の姿です。相手によってどう変わるかが可視化されます。",
    },
    {
      key: "self",
      icon: "💎",
      label: "自己",
      title: "自己 — 真のアイデンティティ",
      description:
        "全てのデータを統合した、あなたの核心的なアイデンティティです。最も深い自己理解に辿り着く場所です。",
    },
  ],
  startingTab: "mirror",
};

// ---------------------------------------------------------------------------
// All configs (for iteration)
// ---------------------------------------------------------------------------

export const ALL_FEATURE_INTRO_CONFIGS: FeatureIntroConfig[] = [
  STARGAZER_INTRO,
  ORIGIN_INTRO,
  GENOME_CARD_INTRO,
  RENDEZVOUS_INTRO,
  MY_STYLE_INTRO,
  CALENDAR_INTRO,
  BODY_COLOR_AVATAR_INTRO,
  PRESENCE_INTRO,
];
