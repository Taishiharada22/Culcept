// lib/stargazer/dailyOracleCard.ts
// Daily Oracle Card 選択エンジン — 毎日ユーザーの観測データから最もインパクトのある洞察を1つ選ぶ

import {
  getArchetypeByCode,
  getColorGroup,
  getSnsLabel,
  type ArchetypeCode,
} from "./archetypeTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OracleCardType =
  | "contradiction"
  | "prophecy"
  | "another_self"
  | "dual_mirror";

export interface DailyOracleCard {
  id: string;
  type: OracleCardType;
  mainText: string;
  subText?: string;
  archetypeLabel: string; // "⚔️ Commander"
  colorFamily: string;
  colorTone: string;
  expiresAt: number; // Unix timestamp
  date: string; // "2026-03-23"
}

// ---------------------------------------------------------------------------
// Oracle Templates (AI フォールバック用)
// ---------------------------------------------------------------------------

const ORACLE_TEMPLATES: Record<OracleCardType, string[]> = {
  contradiction: [
    "ひとりは寂しい。でも誰かが近づくと、ちょっと引いてしまう。どっちも本当の気持ち",
    "「大丈夫」って言ったとき、本当に大丈夫だった？",
    "安定した毎日がほしい。でも退屈はイヤ。この「両方ほしい」が、あなたらしさ",
    "完璧にしたいのに、完成させるのが怖い。できあがったら、人に見られちゃうから",
    "「別にいい」って言いながら、本当はすごく気にしてない？",
    "逃げ道を作ってから飛び込む。用心深いのか大胆なのか、自分でもわからないよね",
    "人に頼りたいのに、頼られる側になっちゃう。気づいたらいつもそのポジション",
    "自由がほしいのに、自由になると不安になる。それ、あるあるだよ",
  ],
  prophecy: [
    "今日、「無難なほう」を選ぶ瞬間がある。本当にほしいのはそっちじゃない",
    "今日、誰かの一言がグサッとくる。でも笑ってごまかすと思う",
    "今日、3回迷ったら、3回目の気持ちが本音。最初の2回は「こう言うべき」が先に出てる",
    "今日、「まだ準備ができてない」って言いそう。本当は怖いだけ",
    "今日、予定通りにいかないことが起きる。でもそのほうがいい方向に転がる",
    "今日、誰かのために自分のことを後回しにする。そしてそれに気づかない",
    "今日、言葉にしないほうが正解な場面がある。黙ってるのも答え",
    "今日、前にも同じ選び方をしたことに気づく。そのパターン、変えたい？",
  ],
  another_self: [
    "あなたの中に、ふだん出てこないもうひとりの自分がいる。その人、今どんな気持ちだろう",
    "見ないふりをしてる気持ちがある。でもその気持ちは、ちゃんとそこにいるよ",
    "あのとき選ばなかったほうの人生を、もうひとりの自分が生きてる",
    "強がるたびに、心のどこかがちょっと疲れてない？",
    "もうひとりの自分は、あなたが思ってるよりずっと優しい人だよ",
    "避けてる感情の中に、大事なものが隠れてるかもしれない",
    "もうひとりの自分が聞いてる。「いつまでそのキャラでいくの？」",
    "心の中のいちばん静かな声が、いちばん大事なことを知ってる",
  ],
  dual_mirror: [
    "自分では冷静な人だと思ってる。でも周りからは、感情から逃げてるように見えてるかも",
    "自分では努力家だと思ってる。でも周りからは、止まるのが怖くて走ってるように見えてるかも",
    "自分では自由な人だと思ってる。でも周りからは、近づかれるのが怖いだけに見えてるかも",
    "自分では穏やかだと思ってる。でも周りからは、本音を言えない人に見えてるかも",
    "自分ではこだわりがある人だと思ってる。でも周りからは、完璧じゃない自分を許せない人に見えてるかも",
    "自分では頼れる人だと思ってる。でも周りからは、弱さを見せられない人に見えてるかも",
    "自分では共感力が高いと思ってる。でも周りからは、人の気持ちに振り回されてるように見えてるかも",
    "自分では慎重だと思ってる。でも周りからは、変わるのが怖いだけに見えてるかも",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 日付文字列から決定論的シードを生成 */
function dateSeed(date: string): number {
  let h = 0;
  for (let i = 0; i < date.length; i++) {
    h = ((h << 5) - h + date.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 今日の日付を YYYY-MM-DD 形式で取得 */
function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** 今日の 23:59:59 の Unix timestamp を取得 */
function endOfDay(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}

/** シードから配列の要素を選択 */
function pickFromSeed<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

// ---------------------------------------------------------------------------
// Card Type 選択ロジック
// ---------------------------------------------------------------------------

const CARD_TYPE_ORDER: OracleCardType[] = [
  "contradiction",
  "prophecy",
  "another_self",
  "dual_mirror",
];

/** 観測回数に基づくカードタイプの重み付け選択 */
function pickCardType(seed: number, observationCount: number): OracleCardType {
  // 観測回数が少ないうちは prophecy / another_self 中心
  // 増えるにつれ contradiction / dual_mirror が解禁
  if (observationCount < 3) {
    return pickFromSeed(["prophecy", "another_self"] as OracleCardType[], seed);
  }
  if (observationCount < 10) {
    return pickFromSeed(
      ["contradiction", "prophecy", "another_self"] as OracleCardType[],
      seed,
    );
  }
  return pickFromSeed(CARD_TYPE_ORDER, seed);
}

// ---------------------------------------------------------------------------
// Main: generateDailyOracle
// ---------------------------------------------------------------------------

/** 今日の Oracle Card を生成（ユーザーデータがない場合はテンプレートから） */
export function generateDailyOracle(params: {
  date?: string;
  archetypeCode?: ArchetypeCode;
  observationCount?: number;
  vanishingInsight?: string;
  prophecy?: string;
}): DailyOracleCard {
  const date = params.date ?? todayString();
  const seed = dateSeed(date);
  const observationCount = params.observationCount ?? 0;

  // -- アーキタイプ情報 --
  const def = params.archetypeCode
    ? getArchetypeByCode(params.archetypeCode)
    : undefined;

  const archetypeLabel = def ? getSnsLabel(def) : "-- Observing";

  const cg = params.archetypeCode
    ? getColorGroup(params.archetypeCode)
    : undefined;

  const colorFamily = cg?.family ?? "navy";
  const colorTone = cg?.tone ?? "standard";

  // -- タイプ & テキスト選択 --
  let type: OracleCardType;
  let mainText: string;
  let subText: string | undefined;

  if (params.vanishingInsight) {
    // vanishingInsight 最優先
    type = seed % 2 === 0 ? "contradiction" : "another_self";
    mainText = params.vanishingInsight;
  } else if (params.prophecy) {
    // prophecy 次点
    type = "prophecy";
    mainText = params.prophecy;
  } else {
    // フォールバック: テンプレートからシード選択
    type = pickCardType(seed, observationCount);
    const templates = ORACLE_TEMPLATES[type];
    mainText = pickFromSeed(templates, seed);
  }

  // dual_mirror の場合、自画像/観測像 を分割
  if (type === "dual_mirror" && mainText.includes("観測像:")) {
    const parts = mainText.split("観測像:");
    if (parts.length === 2) {
      mainText = parts[0].replace("自画像:", "").trim();
      subText = parts[1].trim();
    }
  }

  const id = `oracle-${date}-${type}-${seed % 1000}`;

  return {
    id,
    type,
    mainText,
    subText,
    archetypeLabel,
    colorFamily,
    colorTone,
    expiresAt: endOfDay(date),
    date,
  };
}
