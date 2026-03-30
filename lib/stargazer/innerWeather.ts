// lib/stargazer/innerWeather.ts
// Inner Weather + Pressure Map engine -- real-time psychological state as weather metaphor
//
// Design principles:
// 1. Weather emerges from the INTERACTION of energy, stress, and social battery
//    -- not from independent thresholds.
// 2. Defense mechanism detection requires multiple converging signals, never a
//    single metric crossing a line.
// 3. Pattern interruptions are "awareness invitations": gentle, poetic,
//    non-judgmental Japanese prose that invites curiosity rather than correction.
// 4. Pressure Map is archetype-aware: a Proof type feels pressure differently
//    from a Bond type.
// 5. Weather reports are literary-quality Japanese with 5 variants per type,
//    selected by emotional tone + time-of-day + social battery, ensuring variety.
// 6. Temporal patterns use exponential-weighted moving averages and
//    autocorrelation to detect real cycles.

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { ArchetypeCode, CognitionCode, Layer1Code, Layer3Code } from "./archetypeTypes";
import { LAYER1_DEFS, LAYER3_DEFS, parseArchetypeCode } from "./archetypeTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Weather types -- mapping inner states to atmospheric metaphors */
export type WeatherType =
  | "sunny"
  | "cloudy"
  | "rainy"
  | "stormy"
  | "foggy"
  | "windy"
  | "snow"
  | "aurora";

/** Emotional tone */
export type EmotionalTone =
  | "calm"
  | "excited"
  | "anxious"
  | "melancholic"
  | "joyful"
  | "numb"
  | "conflicted";

/** Defense mechanism types */
export type DefenseType =
  | "denial"
  | "projection"
  | "rationalization"
  | "avoidance"
  | "displacement"
  | "regression"
  | "intellectualization";

/** Inner Weather -- the current psychological state */
export interface InnerWeather {
  weatherType: WeatherType;
  emoji: string;
  label: string;
  description: string;
  energyLevel: number;      // -1 ~ 1
  stressLevel: number;      // 0 ~ 1
  emotionalTone: EmotionalTone;
  socialBattery: number;    // 0 ~ 1
  stability: number;        // 0 ~ 1
  forecast: string;
}

/** Defense detection result */
export interface DefenseDetection {
  active: boolean;
  type?: DefenseType;
  confidence: number;       // 0 ~ 1
  trigger?: string;
  message?: string;
  /** Converging signals that led to detection */
  signals?: string[];
}

/** Pressure point on a single axis */
export interface PressurePoint {
  axisKey: string;
  axisLabel: string;
  pressure: number;         // 0 ~ 1
  direction: "building" | "releasing" | "stable";
  source: "internal_conflict" | "environmental" | "suppression" | "overextension";
  /** Why this axis matters for this archetype */
  archetypeRelevance?: string;
  warningMessage?: string;
}

/** Pressure map across all axes */
export interface PressureMap {
  points: PressurePoint[];
  overallPressure: number;
  criticalZones: string[];
  releaseRecommendation?: string;
}

/** Weather history entry */
export interface WeatherHistory {
  date: string;
  weather: WeatherType;
  energyLevel: number;
  stressLevel: number;
  emotionalTone?: EmotionalTone;
  socialBattery?: number;
}

/** Detected weather pattern */
export interface WeatherPattern {
  cycleType: "weekly" | "monthly" | "irregular";
  description: string;
  predictedNext: WeatherType;
  confidence: number;
}

/** Input for weather calculation */
export interface WeatherInput {
  axisScores: Record<string, number>;
  recentObservations?: Array<{
    timestamp: string;
    responseTimeMs: number;
    hesitation: number;
    /** Which axis/question this observation relates to */
    axisKey?: string;
  }>;
  currentTime: Date;
  dayOfWeek: number;
  recentWeather?: WeatherHistory[];
  contradictions?: Array<{
    axisA: string;
    axisB: string;
    tension: number;
  }>;
  mirrorDivergence?: Record<string, number>;
  /** User's archetype code for personalized pressure */
  archetypeCode?: ArchetypeCode;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEATHER_EMOJI: Record<WeatherType, string> = {
  sunny: "\u2600\uFE0F",
  cloudy: "\u2601\uFE0F",
  rainy: "\uD83C\uDF27\uFE0F",
  stormy: "\u26C8\uFE0F",
  foggy: "\uD83C\uDF2B\uFE0F",
  windy: "\uD83C\uDF2A\uFE0F",
  snow: "\u2744\uFE0F",
  aurora: "\uD83C\uDF0C",
};

const WEATHER_LABEL: Record<WeatherType, string> = {
  sunny: "快晴",
  cloudy: "曇り",
  rainy: "雨",
  stormy: "嵐",
  foggy: "霧",
  windy: "風",
  snow: "雪",
  aurora: "オーロラ",
};

/** Time-of-day categories */
type TimeOfDay = "dawn" | "morning" | "afternoon" | "evening" | "night" | "lateNight";

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 4 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  if (hour >= 21 && hour < 25) return "night";
  return "lateNight";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weather Reports -- 5 variants per type
// Selected by: emotional tone intensity + time of day + social battery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEATHER_REPORTS: Record<WeatherType, string[]> = {
  sunny: [
    "心の空が高い。今日のあなたは、自分自身ともっとも近い距離にいる。風は凪いで、思考が澄んでいる。",
    "内側から光が差している。見たくなかった真実にさえ、今なら穏やかに手を伸ばせるかもしれない。",
    "風通しの良い午後のような気分。思考も感情も、抵抗なく流れている。",
    "朝露が光を集めるように、小さなことが鮮やかに見える日。この感覚を、覚えておいて。",
    "晴れの日には影もくっきり見える。それでいい。明暗のコントラストが、あなたの輪郭を描いている。",
  ],
  cloudy: [
    "薄い雲がかかっている。はっきりとは見えないけれど、雲の裏側に光があることは、あなた自身が知っている。",
    "曇り空の下で考えごとをするのに、傘はいらない。ゆっくり歩いて、雲の形を眺めていればいい。",
    "雲が動いている。止まっているように見えて、少しずつ景色は変わっている。今日はその動きを信じていい。",
    "はっきりしない日がある。それは迷いではなく、次の天気のための準備時間かもしれない。",
    "灰色の空は退屈に見えるけれど、色が抑えられた日にしか聞こえない静けさがある。",
  ],
  rainy: [
    "静かに雨が降り続いている。この雨は何かを洗い流しているのか、それとも何かを育てているのか。きっと両方。",
    "雨粒が窓を叩く音に耳を傾けてみる。外の雨と、内側の雨は、同じリズムで降っていますか。",
    "雨の日は、普段聞こえない水の流れる音が聞こえてくる。あなたの内側にも、同じ流れがある。",
    "濡れた道は、足元に気をつけて歩くことを教えてくれる。今日は、丁寧に、一歩ずつ。",
    "雨は地面に還る水の旅の終わり。終わりは悲しいことばかりではない。また空に昇る日が来る。",
  ],
  stormy: [
    "内側で嵐が起きている。矛盾する感情が重なり合い、まだ形になっていない。でも嵐は、空気を入れ替えるために来る。",
    "雷鳴が聞こえる。それは怒りかもしれないし、悲しみかもしれない。名前をつける必要はない。ただ、鳴っていることを認めるだけでいい。",
    "激しく揺れている。安全な場所から嵐を観察してみてほしい。何が何とぶつかっているのか。衝突の中心に、大切な何かがある。",
    "嵐の目は静かだという。あなたの中にも、揺れの中心に静かな場所がある。そこにいていい。",
    "この嵐は壊すためではなく、もう持ちきれなくなったものを手放すために来ている。",
  ],
  foggy: [
    "霧の中にいる。自分が何を感じているのか、輪郭がぼやけている。それでいい。霧は新しい視界の前触れだから。",
    "視界が効かない朝。でも、霧の中では遠くを見ようとしないことが、もっとも賢い選択。足元の一歩だけを信じて。",
    "何も見えない感覚は、目が新しい光に慣れようとしているのかもしれない。",
    "霧の中では音が変わる。近くのものが遠く聞こえ、遠くのものが近く感じる。今の感覚は、距離感が書き換わっている途中。",
    "霧は恐ろしいものではない。ただ、空気中の水滴が光を散乱させているだけ。あなたの中の霧にも、原因がある。",
  ],
  windy: [
    "風が吹いている。変化の気配。何かを手放す準備ができているのかもしれない。",
    "強い風が内側を通り抜けていく。古い枝が折れて落ちた後に、若い芽が見える。",
    "じっとしていられない感覚がある。それは焦りではなく、次の場所へ向かう力。",
    "風向きが変わりつつある。昨日までの「当たり前」が、今日は違って感じる。その感覚は正しい。",
    "風は目に見えないけれど、木の葉を揺らして初めてそこにいたことが分かる。あなたの中の変化も、そうやって現れる。",
  ],
  snow: [
    "静かに雪が降り積もっている。全てが白く覆われ、感覚が遠くなっている。でも雪の下で、土は春の準備をしている。",
    "凍りついたように感じる日。それは壊れたのではなく、これ以上傷つかないための休息。自然界でも、冬は回復の季節。",
    "感情が遠い。それは消えたのではなく、一時的に凍結保存されているだけ。必要な時に、溶け出す。",
    "雪国の人は知っている。雪の重みが枝を鍛え、雪解け水が大地を潤すことを。今の冷たさには意味がある。",
    "白い世界は静かで、それが寂しいのか安らかなのか分からない。分からなくていい。雪は、判断を急がせない。",
  ],
  aurora: [
    "稀な夜だ。普段は見えないものが、今のあなたには見えている。この瞬間を、言葉にしなくていいから、覚えていて。",
    "矛盾が矛盾でなくなり、全てが繋がって見える稀有な瞬間。これは「分かった」のではなく「感じた」ということ。",
    "オーロラは太陽風と磁場の衝突から生まれる。あなたの中の衝突もまた、こんな光を生むことがある。",
    "この状態に名前はない。ただ、全てのピースが一瞬だけ正しい場所にはまった感覚。",
    "今見えている景色を、明日の自分に届けてあげてほしい。この光を知っていることが、曇りの日の支えになるから。",
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defense Mechanism Labels & Awareness Invitations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFENSE_LABELS: Record<DefenseType, { label: string; description: string }> = {
  denial: {
    label: "否認",
    description: "自己申告と行動パターンが一貫して矛盾している",
  },
  projection: {
    label: "投影",
    description: "他者への強い反応に、自分の影が映っている",
  },
  rationalization: {
    label: "合理化",
    description: "感情を通さず、論理だけで全てを処理しようとしている",
  },
  avoidance: {
    label: "回避",
    description: "特定の領域に触れること自体を無意識に避けている",
  },
  displacement: {
    label: "置換",
    description: "本来の対象でない場所に感情が向かっている",
  },
  regression: {
    label: "退行",
    description: "以前の自分に戻ろうとする動きが見える",
  },
  intellectualization: {
    label: "知性化",
    description: "全てを「理解」で処理し、感じることを保留している",
  },
};

/**
 * Awareness invitations -- gentle, poetic, non-judgmental.
 * 3 variants per defense type, ordered from softest to slightly more direct.
 * Even the "most direct" variant is framed as curiosity, never accusation.
 */
const AWARENESS_INVITATIONS: Record<DefenseType, string[]> = {
  denial: [
    "ふと思ったのですが——あなたが語る自分と、あなたの足跡が語る自分は、少し違う景色を見ているのかもしれません。どちらも本当のあなたです。",
    "言葉と行動の間に、小さな隙間があるように見えます。その隙間には何があるのか、少しだけ覗いてみませんか。",
    "自分について語るとき、どこかで「こうあるべき自分」が先に立っていませんか。その影にいるもう一人の自分にも、声を聞かせてあげてください。",
  ],
  projection: [
    "誰かに対して湧いた強い感情は、その人についての情報であると同時に、あなた自身についての手がかりでもあります。",
    "他者の中に見えたもの——それはもしかすると、あなたの中にもある色かもしれません。嫌な色とは限りません。",
    "強く反応した瞬間がありました。その反応の強さそのものに、あなたを理解する鍵がありそうです。",
  ],
  rationalization: [
    "とても明快な答えでした。ただ、「正しい答え」と「本当の答え」は、時々違う道を歩くことがあります。",
    "頭の回転がとても速いですね。もし頭を少しだけ休ませて、胸の辺りに聞いてみたら、同じ答えが返ってくるでしょうか。",
    "論理は灯台のように頼もしいけれど、海の深さは灯台からは見えません。少しだけ潜ってみませんか。",
  ],
  avoidance: [
    "通り過ぎた場所がありました。もしかすると、そこにはまだ見ていない景色があるのかもしれません。急がなくていいので、いつか。",
    "触れなかった場所にこそ、あなたが大切にしているものが眠っていることがあります。今でなくても、心の片隅に。",
    "ある領域を素早く通り抜けましたね。速く通り過ぎたくなる場所には、不思議と宝物が落ちていることが多いのです。",
  ],
  displacement: [
    "今感じていることの本当の宛先は、もしかするとここではないのかもしれません。心当たりはありますか。",
    "エネルギーが思いがけない方向に流れているように見えます。それ自体が、あなたの内側の地図を教えてくれています。",
    "本当に反応しているのは、目の前のこのことでしょうか。それとも、別の場所で受け取った何かが、ここに流れ着いているのでしょうか。",
  ],
  regression: [
    "答え方が少しシンプルになってきました。疲れていませんか。複雑でいることは、思った以上にエネルギーを使います。",
    "少し休憩しませんか。簡単な答えに辿り着いたのは、理解が深まったからかもしれないし、疲れているからかもしれません。",
    "以前はもう少し複雑な答え方をしていました。何かが変わったのか、それとも今は複雑さを避けたい気分なのか。どちらでも大丈夫です。",
  ],
  intellectualization: [
    "全ての答えがとてもバランスよく並んでいます。美しいけれど、バランスを保つこと自体に力を使っていませんか。",
    "中庸は知恵ですが、時々、偏ることの中にしか見えない風景もあります。極端を怖がらなくていい場所が、ここにはあります。",
    "どの答えにも角がない。それは成熟かもしれないし、感じることを保留にしているのかもしれない。もし後者なら、ここは安全です。",
  ],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Archetype vulnerability map
// Which axis clusters are pressure-sensitive per Layer1 x Layer3
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ArchetypeVulnerability {
  sensitiveAxes: string[];
  pressureAmplifier: number; // 1.0 = normal, >1 = amplified
  releaseHint: string;
}

const ARCHETYPE_VULNERABILITY: Record<string, ArchetypeVulnerability> = {
  // Proof types -- pressure on self-worth and achievement axes
  P_A: {
    sensitiveAxes: ["cautious_vs_bold", "perfectionist_vs_pragmatic", "social_initiative"],
    pressureAmplifier: 1.4,
    releaseHint: "成果を追い求めることを一時停止して、「ただ存在する」時間を持ってみてください。",
  },
  P_W: {
    sensitiveAxes: ["perfectionist_vs_pragmatic", "analytical_vs_intuitive", "plan_vs_spontaneous"],
    pressureAmplifier: 1.3,
    releaseHint: "完璧でない下書きを、誰かに見せてみてください。不完全は弱さではなく、信頼の入口です。",
  },
  P_D: {
    sensitiveAxes: ["introvert_vs_extrovert", "individual_vs_social", "function_vs_expression"],
    pressureAmplifier: 1.3,
    releaseHint: "内側の作品を一つだけ、外に出してみてください。光に当てても消えないことを確かめるために。",
  },
  // Bond types -- pressure on relational axes
  B_A: {
    sensitiveAxes: ["intimacy_pace", "social_initiative", "direct_vs_diplomatic"],
    pressureAmplifier: 1.4,
    releaseHint: "繋がりを守るために前に出ること自体が、相手との距離を作っていないか、立ち止まって感じてみてください。",
  },
  B_W: {
    sensitiveAxes: ["reassurance_need", "intimacy_pace", "boundary_awareness"],
    pressureAmplifier: 1.3,
    releaseHint: "待つことは美徳ですが、自分の気持ちを伝えることも、繋がりの一部です。",
  },
  B_D: {
    sensitiveAxes: ["introvert_vs_extrovert", "emotional_variability", "reassurance_need"],
    pressureAmplifier: 1.3,
    releaseHint: "内側で紡いだ言葉を、信頼できる一人に届けてみてください。潜ったまま繋がる方法もあります。",
  },
  // Haven types -- pressure on safety and control axes
  H_A: {
    sensitiveAxes: ["change_embrace_vs_resist", "control_tendency", "boundary_respect"],
    pressureAmplifier: 1.4,
    releaseHint: "全てをコントロールしなくても安全でいられる瞬間を、一つだけ思い出してみてください。",
  },
  H_W: {
    sensitiveAxes: ["change_embrace_vs_resist", "plan_vs_spontaneous", "emotional_regulation"],
    pressureAmplifier: 1.2,
    releaseHint: "予測できないことの中にも、良い驚きがあることを思い出してください。",
  },
  H_D: {
    sensitiveAxes: ["introvert_vs_extrovert", "stress_isolation_vs_social", "emotional_regulation"],
    pressureAmplifier: 1.3,
    releaseHint: "安全な場所に潜ること自体は間違いではありません。ただ、たまには窓を開けて外の空気を。",
  },
};

const PRESSURE_SOURCE_LABELS: Record<PressurePoint["source"], string> = {
  internal_conflict: "内的葛藤",
  environmental: "環境からの圧力",
  suppression: "抑圧",
  overextension: "過剰適応",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weather Calculation -- Energy x Stress Interaction Model
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Estimate energy from axis scores, observation behavior, and time of day.
 *
 * Energy is not just about extraversion -- it is the net activation level
 * considering approach motivation, behavioral momentum, and circadian modulation.
 */
function estimateEnergy(
  axisScores: Record<string, number>,
  observations?: WeatherInput["recentObservations"],
  timeOfDay?: TimeOfDay
): number {
  // Approach motivation axes
  const approachFactors = [
    (axisScores["social_initiative"] ?? 0) * 0.25,
    (axisScores["cautious_vs_bold"] ?? 0) * 0.20,
    (axisScores["change_embrace_vs_resist"] ?? 0) * 0.15,
    (axisScores["plan_vs_spontaneous"] ?? 0) * 0.10,
  ];

  // Introversion/extraversion as baseline energy supply
  const extraversionBoost = (axisScores["introvert_vs_extrovert"] ?? 0) * 0.15;

  // Behavioral momentum from observations: varied response times indicate engagement
  let behavioralMomentum = 0;
  if (observations && observations.length >= 3) {
    const responseTimes = observations.map((o) => o.responseTimeMs);
    const avgTime = responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length;
    // Moderate response times (2-6 seconds) indicate thoughtful engagement = energy
    // Very fast (<1s) or very slow (>10s) indicate disengagement or fatigue
    if (avgTime >= 2000 && avgTime <= 6000) {
      behavioralMomentum = 0.15;
    } else if (avgTime > 10000) {
      behavioralMomentum = -0.15;
    }
  }

  // Circadian modulation -- subtle influence
  let circadianMod = 0;
  if (timeOfDay === "dawn" || timeOfDay === "morning") circadianMod = 0.05;
  if (timeOfDay === "lateNight") circadianMod = -0.1;
  if (timeOfDay === "evening") circadianMod = -0.03;

  const raw = approachFactors.reduce((s, v) => s + v, 0) + extraversionBoost + behavioralMomentum + circadianMod;
  return clamp(raw, -1, 1);
}

/**
 * Estimate stress from contradictions, emotional variability, observation patterns,
 * and mirror divergence.
 *
 * Stress is the sum of unresolved tensions -- not just emotional reactivity.
 */
function estimateStress(
  axisScores: Record<string, number>,
  contradictions?: WeatherInput["contradictions"],
  mirrorDivergence?: Record<string, number>,
  observations?: WeatherInput["recentObservations"]
): number {
  // Contradiction tension: direct stress source
  const contradictionStress = contradictions
    ? Math.min(1, contradictions.reduce((sum, c) => sum + c.tension, 0) / 2.5)
    : 0;

  // Emotional variability as vulnerability to stress
  const emotionalVulnerability = Math.abs(axisScores["emotional_variability"] ?? 0) * 0.6;

  // Reassurance need indicates unmet safety needs
  const reassuranceStress = Math.max(0, axisScores["reassurance_need"] ?? 0) * 0.4;

  // Mirror divergence: the gap between self-image and observed behavior creates tension
  let mirrorStress = 0;
  if (mirrorDivergence) {
    const values = Object.values(mirrorDivergence);
    if (values.length > 0) {
      const avgDivergence = values.reduce((s, v) => s + v, 0) / values.length;
      mirrorStress = Math.min(1, avgDivergence * 1.5);
    }
  }

  // Observation-based stress: increasing hesitation over session suggests mounting stress
  let sessionStress = 0;
  if (observations && observations.length >= 4) {
    const firstHalf = observations.slice(0, Math.floor(observations.length / 2));
    const secondHalf = observations.slice(Math.floor(observations.length / 2));
    const firstAvgHesitation = firstHalf.reduce((s, o) => s + o.hesitation, 0) / firstHalf.length;
    const secondAvgHesitation = secondHalf.reduce((s, o) => s + o.hesitation, 0) / secondHalf.length;
    if (secondAvgHesitation > firstAvgHesitation + 0.15) {
      sessionStress = (secondAvgHesitation - firstAvgHesitation) * 0.8;
    }
  }

  return clamp(
    contradictionStress * 0.30
    + emotionalVulnerability * 0.20
    + reassuranceStress * 0.15
    + mirrorStress * 0.20
    + sessionStress * 0.15,
    0, 1
  );
}

/**
 * Estimate emotional tone from the INTERACTION of energy, stress, and social battery.
 *
 * This uses a 2D "circumplex" model of affect (Russell, 1980):
 *   - energy maps to activation/arousal
 *   - stress maps to negative valence
 *   - social battery modulates the expression
 * Plus: contradiction count as a conflict indicator.
 */
function estimateEmotionalTone(
  energy: number,
  stress: number,
  socialBattery: number,
  contradictions?: WeatherInput["contradictions"],
  observations?: WeatherInput["recentObservations"]
): EmotionalTone {
  // High contradiction + high stress = conflicted (regardless of energy)
  if (contradictions && contradictions.length >= 3 && stress > 0.5) {
    return "conflicted";
  }

  // Arousal-valence quadrants with social battery modulation:

  // High energy, low stress: positive high-arousal
  if (energy > 0.3 && stress < 0.3) {
    // High social battery = excited (outward joy), low = joyful (inward contentment)
    return socialBattery > 0.6 ? "excited" : "joyful";
  }

  // Low energy, high stress: negative high-arousal
  if (energy < -0.2 && stress > 0.5) {
    return "anxious";
  }

  // Low energy, low stress: negative low-arousal
  if (energy < -0.2 && stress < 0.3) {
    // Check for emotional numbing via observation patterns
    if (observations && observations.length >= 3) {
      const avgHesitation = observations.reduce((s, o) => s + o.hesitation, 0) / observations.length;
      const hesitationVariance = computeVariance(observations.map((o) => o.hesitation));
      // Very low hesitation AND very low variance = flat affect = numb
      if (avgHesitation < 0.15 && hesitationVariance < 0.01) return "numb";
    }
    return "melancholic";
  }

  // Moderate energy, low stress: calm
  if (stress < 0.35 && Math.abs(energy) < 0.3) return "calm";

  // Moderate stress, moderate-to-high energy: conflicted leaning
  if (stress > 0.4 && energy > 0.1 && contradictions && contradictions.length >= 2) {
    return "conflicted";
  }

  // Default: moderate stress without clear direction
  if (stress > 0.4) return "anxious";
  return "calm";
}

/**
 * Estimate social battery from axis scores and recent observation context.
 */
function estimateSocialBattery(
  axisScores: Record<string, number>,
  timeOfDay?: TimeOfDay
): number {
  const extraversionLevel = axisScores["introvert_vs_extrovert"] ?? 0;
  const recoveryMode = axisScores["stress_isolation_vs_social"] ?? 0; // positive = social recovery
  const socialInit = axisScores["social_initiative"] ?? 0;
  const boundaryAwareness = axisScores["boundary_awareness"] ?? 0;

  // Base battery from personality axes
  const baseBattery = (extraversionLevel * 0.35 + recoveryMode * 0.25 + socialInit * 0.25 + boundaryAwareness * 0.15);
  // Map from -1..1 to 0..1
  let battery = (baseBattery + 1) / 2;

  // Time of day modulation: social battery tends to drain through the day
  if (timeOfDay === "evening" || timeOfDay === "night") {
    battery *= 0.85;
  }
  if (timeOfDay === "lateNight") {
    battery *= 0.7;
  }

  return clamp(battery, 0, 1);
}

/**
 * Estimate stability from emotional variability, contradictions, and mirror divergence.
 */
function estimateStability(
  axisScores: Record<string, number>,
  contradictions?: WeatherInput["contradictions"],
  mirrorDivergence?: Record<string, number>,
  recentWeather?: WeatherHistory[]
): number {
  // Base: emotional regulation capacity (inverse of variability)
  const emotionalRegulation = 1 - Math.abs(axisScores["emotional_variability"] ?? 0);
  const regulationCapacity = Math.max(0, axisScores["emotional_regulation"] ?? 0);

  // Contradiction penalty
  const contradictionPenalty = contradictions
    ? Math.min(0.5, contradictions.length * 0.12)
    : 0;

  // Mirror divergence penalty
  let divergencePenalty = 0;
  if (mirrorDivergence) {
    const values = Object.values(mirrorDivergence);
    if (values.length > 0) {
      divergencePenalty = Math.min(0.4, values.reduce((s, v) => s + v, 0) / (values.length * 2));
    }
  }

  // Historical weather stability: if recent weather has been consistent, stability is higher
  let historicalStability = 0;
  if (recentWeather && recentWeather.length >= 5) {
    const recent = recentWeather.slice(-5);
    const uniqueWeathers = new Set(recent.map((h) => h.weather)).size;
    // 1 unique = very stable, 5 unique = very unstable
    historicalStability = (5 - uniqueWeathers) / 5 * 0.15;
  }

  return clamp(
    emotionalRegulation * 0.35
    + regulationCapacity * 0.15
    - contradictionPenalty
    - divergencePenalty
    + historicalStability,
    0, 1
  );
}

/**
 * Determine weather type from the interaction of all metrics.
 *
 * This uses a weighted scoring system rather than cascading if-else,
 * so that the weather is determined by the "best fit" across all factors.
 * Social battery acts as a mediator between energy and weather expression.
 */
function determineWeatherType(
  energy: number,
  stress: number,
  emotionalTone: EmotionalTone,
  stability: number,
  socialBattery: number,
  contradictions?: WeatherInput["contradictions"],
  defenseActive?: boolean
): WeatherType {
  const scores: Record<WeatherType, number> = {
    sunny: 0, cloudy: 0, rainy: 0, stormy: 0,
    foggy: 0, windy: 0, snow: 0, aurora: 0,
  };

  // --- Aurora: breakthrough state (rare) ---
  // High stability + high energy + low stress + no active defense
  if (stability > 0.75 && energy > 0.4 && stress < 0.25 && !defenseActive) {
    scores.aurora += 3;
    // Bonus if coming from recent stormy/rainy (catharsis effect)
    if (emotionalTone === "joyful" || emotionalTone === "excited") {
      scores.aurora += 1;
    }
  }

  // --- Sunny: clear, energized, low-tension ---
  scores.sunny += energy > 0.2 ? (energy - 0.2) * 2 : 0;
  scores.sunny += stress < 0.3 ? (0.3 - stress) * 2 : 0;
  if (emotionalTone === "joyful" || emotionalTone === "excited" || emotionalTone === "calm") {
    scores.sunny += 0.8;
  }
  scores.sunny += stability > 0.5 ? 0.3 : 0;

  // --- Cloudy: moderate, undefined, transitional ---
  scores.cloudy += 0.5; // base score (default tendency)
  if (Math.abs(energy) < 0.25 && stress > 0.2 && stress < 0.5) {
    scores.cloudy += 1.0;
  }
  if (emotionalTone === "calm" && energy < 0.2) {
    scores.cloudy += 0.5;
  }

  // --- Rainy: low energy + moderate-to-high stress ---
  scores.rainy += energy < 0 ? Math.abs(energy) * 1.5 : 0;
  scores.rainy += stress > 0.4 ? (stress - 0.4) * 2 : 0;
  if (emotionalTone === "melancholic" || emotionalTone === "anxious") {
    scores.rainy += 0.6;
  }
  // Low social battery amplifies rainy tendency
  scores.rainy += socialBattery < 0.3 ? 0.4 : 0;

  // --- Stormy: high tension + contradictions + emotional conflict ---
  const contradictionCount = contradictions?.length ?? 0;
  scores.stormy += stress > 0.6 ? (stress - 0.6) * 3 : 0;
  scores.stormy += contradictionCount >= 2 ? contradictionCount * 0.4 : 0;
  if (emotionalTone === "conflicted") scores.stormy += 1.5;
  if (emotionalTone === "anxious" && energy > 0) scores.stormy += 0.5;

  // --- Foggy: unclear, defense active, dissociated ---
  if (defenseActive) scores.foggy += 1.5;
  if (emotionalTone === "numb") scores.foggy += 1.2;
  scores.foggy += stability < 0.3 ? (0.3 - stability) * 2 : 0;
  if (energy < 0 && Math.abs(energy) < 0.3 && stress > 0.3 && stress < 0.6) {
    scores.foggy += 0.5; // ambiguous state
  }

  // --- Windy: change, instability with energy ---
  scores.windy += energy > 0.2 && stability < 0.4 ? 1.5 : 0;
  if (emotionalTone === "excited" && stability < 0.5) scores.windy += 0.8;
  // Social battery depletion with high energy = restless wind
  if (socialBattery < 0.3 && energy > 0.2) scores.windy += 0.5;

  // --- Snow: shutdown, emotional freezing ---
  if (emotionalTone === "numb" && energy < -0.3) scores.snow += 2.0;
  if (energy < -0.5 && stress < 0.3) scores.snow += 1.0;
  if (emotionalTone === "melancholic" && energy < -0.4 && socialBattery < 0.3) {
    scores.snow += 0.8;
  }

  // Find the weather with the highest score
  let bestWeather: WeatherType = "cloudy";
  let bestScore = -1;
  for (const [weather, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestWeather = weather as WeatherType;
    }
  }

  return bestWeather;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defense Mechanism Detection
// Multi-signal convergence required
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DefenseSignal {
  type: DefenseType;
  confidence: number;
  trigger: string;
  signals: string[];
}

/**
 * Detect defense mechanisms through converging behavioral signals.
 *
 * Each mechanism requires at least 2 independent signals to be considered active.
 * A single metric crossing a threshold is never sufficient.
 */
export function detectDefenseMechanism(
  observations?: Array<{ timestamp: string; responseTimeMs: number; hesitation: number; axisKey?: string }>,
  mirrorDivergence?: Record<string, number>,
  axisScores?: Record<string, number>
): DefenseDetection {
  if (!observations || observations.length < 3) {
    return { active: false, confidence: 0 };
  }

  const candidates: DefenseSignal[] = [];

  const avgResponseTime = observations.reduce((s, o) => s + o.responseTimeMs, 0) / observations.length;
  const avgHesitation = observations.reduce((s, o) => s + o.hesitation, 0) / observations.length;
  const responseTimeVariance = computeVariance(observations.map((o) => o.responseTimeMs));
  const hesitationVariance = computeVariance(observations.map((o) => o.hesitation));

  // ── Denial: self-report vs behavior discrepancy ──
  // Signal 1: High mirror divergence on multiple axes
  // Signal 2: Low hesitation despite high divergence (confident in incorrect self-image)
  // Signal 3: Contradicting axis scores (e.g., claims introvert but high social_initiative)
  {
    const signals: string[] = [];
    let score = 0;

    if (mirrorDivergence) {
      const highDivAxes = Object.entries(mirrorDivergence).filter(([, v]) => v > 0.5);
      if (highDivAxes.length >= 3) {
        signals.push(`${highDivAxes.length}軸で自己認識と行動が大きく乖離`);
        score += 0.35;
      }
      // Signal 2: low hesitation despite divergence = unaware of gap
      if (highDivAxes.length >= 2 && avgHesitation < 0.2) {
        signals.push("乖離があるにもかかわらず迷いがない");
        score += 0.25;
      }
    }

    // Signal 3: contradicting axis pairs in scores
    if (axisScores) {
      const introExtro = axisScores["introvert_vs_extrovert"] ?? 0;
      const socialInit = axisScores["social_initiative"] ?? 0;
      if (Math.abs(introExtro - socialInit) > 1.2) {
        signals.push("内向/外向と社交イニシアティブの間に矛盾");
        score += 0.2;
      }
    }

    if (signals.length >= 2) {
      candidates.push({
        type: "denial",
        confidence: clamp(score, 0, 0.9),
        trigger: "自己認識と行動パターンの間に持続的な乖離",
        signals,
      });
    }
  }

  // ── Rationalization: pre-packaged answers ──
  // Signal 1: Consistently fast responses
  // Signal 2: Very low response time variance (machine-like consistency)
  // Signal 3: Low hesitation throughout
  {
    const signals: string[] = [];
    let score = 0;

    if (avgResponseTime < 2000 && observations.length >= 5) {
      signals.push("平均応答時間が非常に速い");
      score += 0.25;
    }
    if (responseTimeVariance < 250000 && observations.length >= 5) {
      signals.push("応答時間のばらつきが極めて小さい");
      score += 0.25;
    }
    if (avgHesitation < 0.12) {
      signals.push("全体的に迷いがほぼない");
      score += 0.2;
    }

    if (signals.length >= 2) {
      candidates.push({
        type: "rationalization",
        confidence: clamp(score, 0, 0.85),
        trigger: "全ての回答が迷いなく速い -- 感じる前に考えで処理している可能性",
        signals,
      });
    }
  }

  // ── Avoidance: skipping specific domains ──
  // Signal 1: Very fast responses on specific questions (< 800ms)
  // Signal 2: Those fast responses cluster on specific axis categories
  // Signal 3: Higher hesitation on surrounding questions (contrast pattern)
  {
    const signals: string[] = [];
    let score = 0;

    const veryFast = observations.filter((o) => o.responseTimeMs < 800);
    const normal = observations.filter((o) => o.responseTimeMs >= 800);

    if (veryFast.length >= 2 && veryFast.length / observations.length > 0.2) {
      signals.push(`${veryFast.length}問で極端に速い回答`);
      score += 0.3;

      // Check if fast responses cluster on specific axes
      if (veryFast.some((o) => o.axisKey)) {
        const fastAxes = new Set(veryFast.map((o) => o.axisKey).filter(Boolean));
        if (fastAxes.size <= 2 && veryFast.length >= 2) {
          signals.push("速い回答が特定の領域に集中");
          score += 0.25;
        }
      }

      // Contrast: normal questions have higher hesitation
      if (normal.length > 0) {
        const normalAvgHesitation = normal.reduce((s, o) => s + o.hesitation, 0) / normal.length;
        const fastAvgHesitation = veryFast.reduce((s, o) => s + o.hesitation, 0) / veryFast.length;
        if (normalAvgHesitation - fastAvgHesitation > 0.2) {
          signals.push("他の質問では迷うのに、特定の質問では迷いがゼロ");
          score += 0.2;
        }
      }
    }

    if (signals.length >= 2) {
      candidates.push({
        type: "avoidance",
        confidence: clamp(score, 0, 0.85),
        trigger: "特定の質問領域で無意識の回避パターン",
        signals,
      });
    }
  }

  // ── Intellectualization: everything centered, no extremes ──
  // Signal 1: All hesitation values near 0.5
  // Signal 2: All response times moderate (no emotional spikes)
  // Signal 3: Axis scores all near zero (balanced to a fault)
  {
    const signals: string[] = [];
    let score = 0;

    if (observations.length >= 5) {
      const extremeHesitation = observations.filter((o) => Math.abs(o.hesitation - 0.5) > 0.3);
      if (extremeHesitation.length === 0) {
        signals.push("全ての回答が中間付近に集中");
        score += 0.3;
      }

      // No emotional response time spikes
      const timeSpikes = observations.filter((o) =>
        o.responseTimeMs > avgResponseTime * 2 || o.responseTimeMs < avgResponseTime * 0.3
      );
      if (timeSpikes.length === 0) {
        signals.push("応答時間に感情的な揺れが見られない");
        score += 0.2;
      }
    }

    if (axisScores) {
      const scoreValues = Object.values(axisScores);
      const extremeScores = scoreValues.filter((v) => Math.abs(v) > 0.6);
      if (scoreValues.length >= 10 && extremeScores.length === 0) {
        signals.push("全ての軸スコアが中立付近");
        score += 0.25;
      }
    }

    if (signals.length >= 2) {
      candidates.push({
        type: "intellectualization",
        confidence: clamp(score, 0, 0.8),
        trigger: "全てを中間に置き、極端な反応を知的に制御している可能性",
        signals,
      });
    }
  }

  // ── Regression: sudden simplification of response pattern ──
  // Signal 1: Response time variance drops significantly in second half
  // Signal 2: Hesitation decreases in second half (less deliberation)
  // Signal 3: Response times get faster overall (rushing through)
  {
    const signals: string[] = [];
    let score = 0;

    if (observations.length >= 6) {
      const midpoint = Math.floor(observations.length / 2);
      const firstHalf = observations.slice(0, midpoint);
      const secondHalf = observations.slice(midpoint);

      const firstTimeVar = computeVariance(firstHalf.map((o) => o.responseTimeMs));
      const secondTimeVar = computeVariance(secondHalf.map((o) => o.responseTimeMs));
      const firstAvgTime = firstHalf.reduce((s, o) => s + o.responseTimeMs, 0) / firstHalf.length;
      const secondAvgTime = secondHalf.reduce((s, o) => s + o.responseTimeMs, 0) / secondHalf.length;
      const firstAvgHes = firstHalf.reduce((s, o) => s + o.hesitation, 0) / firstHalf.length;
      const secondAvgHes = secondHalf.reduce((s, o) => s + o.hesitation, 0) / secondHalf.length;

      if (firstTimeVar > 0 && secondTimeVar / firstTimeVar < 0.35) {
        signals.push("セッション後半で応答パターンが急に均一化");
        score += 0.3;
      }
      if (secondAvgHes < firstAvgHes - 0.15) {
        signals.push("後半で迷いが急減（深く考えなくなった）");
        score += 0.25;
      }
      if (secondAvgTime < firstAvgTime * 0.6) {
        signals.push("後半で回答速度が急加速");
        score += 0.2;
      }
    }

    if (signals.length >= 2) {
      candidates.push({
        type: "regression",
        confidence: clamp(score, 0, 0.8),
        trigger: "セッション後半で回答パターンが突然単純化",
        signals,
      });
    }
  }

  // ── Displacement: emotional intensity on unrelated axes ──
  // Signal 1: One or two axes have disproportionately high mirror divergence
  // Signal 2: Those axes show emotional response time spikes
  // Signal 3: The high-divergence axes are unrelated to the high-score axes
  {
    const signals: string[] = [];
    let score = 0;

    if (mirrorDivergence) {
      const values = Object.values(mirrorDivergence);
      if (values.length >= 5) {
        const avgDiv = values.reduce((s, v) => s + v, 0) / values.length;
        const outlierAxes = Object.entries(mirrorDivergence)
          .filter(([, v]) => v > avgDiv * 2.5 && v > 0.4);

        if (outlierAxes.length >= 1 && outlierAxes.length <= 3) {
          signals.push(`${outlierAxes.map(([k]) => k).join(", ")}に不釣り合いな感情的反応`);
          score += 0.3;

          // Check if those axes have response time spikes in observations
          if (observations.some((o) => o.axisKey && outlierAxes.some(([k]) => k === o.axisKey))) {
            const relevantObs = observations.filter(
              (o) => o.axisKey && outlierAxes.some(([k]) => k === o.axisKey)
            );
            const relevantAvg = relevantObs.reduce((s, o) => s + o.responseTimeMs, 0) / relevantObs.length;
            if (relevantAvg > avgResponseTime * 1.5) {
              signals.push("該当軸の質問で応答時間が突出");
              score += 0.25;
            }
          }

          // Check if outlier axes are unrelated to high-score axes
          if (axisScores) {
            const highScoreAxes = Object.entries(axisScores)
              .filter(([, v]) => Math.abs(v) > 0.6)
              .map(([k]) => k);
            const overlap = outlierAxes.filter(([k]) => highScoreAxes.includes(k));
            if (overlap.length === 0) {
              signals.push("高乖離軸とスコアの高い軸が一致しない");
              score += 0.2;
            }
          }
        }
      }
    }

    if (signals.length >= 2) {
      candidates.push({
        type: "displacement",
        confidence: clamp(score, 0, 0.8),
        trigger: "感情エネルギーが本来の対象でない軸に表出",
        signals,
      });
    }
  }

  // ── Projection: strong reactions mapped to shadow ──
  // Signal 1: High divergence on relationally-coded axes
  // Signal 2: Emotional spikes (long response time) on other-oriented questions
  // Signal 3: Mirror divergence concentrated on relational/safety axes
  {
    const signals: string[] = [];
    let score = 0;

    if (mirrorDivergence) {
      const relationalAxes = TRAIT_AXES.filter(
        (a) => a.category === "relational" || a.category === "relational_deep" || a.category === "safety"
      ).map((a) => a.id);

      const relationalDivergences = relationalAxes
        .map((id) => mirrorDivergence[id] ?? 0)
        .filter((v) => v > 0.4);

      if (relationalDivergences.length >= 2) {
        signals.push("対人関係軸で複数の乖離");
        score += 0.3;
      }

      // High divergence specifically on boundary/control axes
      const projectionAxes = ["boundary_awareness", "control_tendency", "direct_vs_diplomatic"];
      const projectionDivs = projectionAxes.map((id) => mirrorDivergence[id] ?? 0);
      if (projectionDivs.some((v) => v > 0.5)) {
        signals.push("他者との境界に関する軸で乖離");
        score += 0.25;
      }
    }

    // Long response times on relational questions
    if (observations.some((o) => o.axisKey)) {
      const relAxKeys = new Set(
        TRAIT_AXES.filter((a) => a.category === "relational" || a.category === "relational_deep")
          .map((a) => a.id)
      );
      const relObs = observations.filter((o) => o.axisKey && relAxKeys.has(o.axisKey as TraitAxisKey));
      if (relObs.length >= 2) {
        const relAvg = relObs.reduce((s, o) => s + o.responseTimeMs, 0) / relObs.length;
        if (relAvg > avgResponseTime * 1.4) {
          signals.push("対人関係の質問で応答時間が長い");
          score += 0.2;
        }
      }
    }

    if (signals.length >= 2) {
      candidates.push({
        type: "projection",
        confidence: clamp(score, 0, 0.8),
        trigger: "他者への反応の中に、自分自身の影が映っている可能性",
        signals,
      });
    }
  }

  // Select the candidate with the highest confidence
  if (candidates.length === 0) {
    return { active: false, confidence: 0 };
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0];

  // Require minimum confidence AND minimum 2 signals to declare active
  const isActive = top.confidence > 0.4 && top.signals.length >= 2;

  return {
    active: isActive,
    type: top.type,
    confidence: round(top.confidence),
    trigger: top.trigger,
    signals: top.signals,
    message: isActive && top.confidence > 0.5
      ? generateAwarenessInvitation(top.type, top.confidence)
      : undefined,
  };
}

/**
 * Generate an awareness invitation -- a gentle, poetic prompt for self-reflection.
 *
 * Unlike pattern "interruptions" (which imply stopping), these are "invitations"
 * (which imply opening a door the user can choose to walk through).
 *
 * Higher confidence selects softer messages (counterintuitive but intentional:
 * when we are more certain a defense is active, the person needs the gentlest approach).
 */
export function generateAwarenessInvitation(type: DefenseType, confidence: number): string {
  const messages = AWARENESS_INVITATIONS[type];
  if (!messages || messages.length === 0) return "";

  // Higher confidence = select the softest (first) message
  // Lower confidence = can be slightly more exploratory (later messages)
  const idx = confidence > 0.6 ? 0 : Math.min(messages.length - 1, Math.floor((1 - confidence) * messages.length));
  return messages[clamp(idx, 0, messages.length - 1)];
}

/** @deprecated Use generateAwarenessInvitation instead */
export function generatePatternInterruption(defense: DefenseDetection): string {
  if (!defense.active || !defense.type) return "";
  return generateAwarenessInvitation(defense.type, defense.confidence);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pressure Map -- Archetype-aware
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Calculate the pressure map across all trait axes.
 *
 * Pressure sources:
 * - Internal contradictions between axes
 * - Mirror divergence (gap between self-image and observed behavior)
 * - Extreme scores (overextension on any axis)
 * - Archetype-specific vulnerability amplification
 */
export function calculatePressureMap(
  axisScores: Record<string, number>,
  contradictions?: Array<{ axisA: string; axisB: string; tension: number }>,
  mirrorDivergence?: Record<string, number>,
  archetypeCode?: ArchetypeCode
): PressureMap {
  const points: PressurePoint[] = [];

  // Resolve archetype vulnerability
  const vulnerability = resolveArchetypeVulnerability(archetypeCode);

  // Build contradiction pressure per axis
  const contradictionPressure: Record<string, number> = {};
  if (contradictions) {
    for (const c of contradictions) {
      contradictionPressure[c.axisA] = (contradictionPressure[c.axisA] ?? 0) + c.tension;
      contradictionPressure[c.axisB] = (contradictionPressure[c.axisB] ?? 0) + c.tension;
    }
  }

  for (const axisDef of TRAIT_AXES) {
    const score = axisScores[axisDef.id];
    if (score === undefined) continue;

    const absScore = Math.abs(score);
    const cPressure = contradictionPressure[axisDef.id] ?? 0;
    const mDivergence = mirrorDivergence?.[axisDef.id] ?? 0;

    // Base pressure = weighted combination of score extremity, contradiction, divergence
    let rawPressure = absScore * 0.3 + cPressure * 0.4 + mDivergence * 0.3;

    // Archetype amplification: sensitive axes get amplified pressure
    const isSensitive = vulnerability?.sensitiveAxes.includes(axisDef.id);
    if (isSensitive && vulnerability) {
      rawPressure *= vulnerability.pressureAmplifier;
    }

    const pressure = clamp(rawPressure, 0, 1);
    if (pressure < 0.1) continue;

    // Determine pressure source with more nuanced logic
    const source = determinePressureSource(absScore, cPressure, mDivergence, isSensitive ?? false);

    // Determine direction
    const direction = determinePressureDirection(cPressure, mDivergence, pressure);

    const axisLabel = `${axisDef.labelLeft} - ${axisDef.labelRight}`;

    const point: PressurePoint = {
      axisKey: axisDef.id,
      axisLabel,
      pressure: round(pressure),
      direction,
      source,
    };

    // Archetype relevance note
    if (isSensitive && vulnerability) {
      point.archetypeRelevance = getArchetypeRelevanceNote(axisDef.id, archetypeCode);
    }

    // Warning for high pressure
    if (pressure > 0.7) {
      point.warningMessage = generatePressureWarning(axisDef, source, pressure, isSensitive ?? false);
    }

    points.push(point);
  }

  points.sort((a, b) => b.pressure - a.pressure);

  // Overall pressure: weighted average with emphasis on top pressure points
  const overallPressure = points.length > 0
    ? round(computeWeightedPressure(points))
    : 0;

  const criticalZones = points
    .filter((p) => p.pressure > 0.7)
    .map((p) => p.axisKey);

  const criticalPoints = points.filter((p) => p.pressure > 0.7);
  const releaseRecommendation = criticalZones.length > 0
    ? generateReleaseRecommendation(criticalPoints, vulnerability)
    : undefined;

  return { points, overallPressure, criticalZones, releaseRecommendation };
}

function resolveArchetypeVulnerability(
  code?: ArchetypeCode
): ArchetypeVulnerability | undefined {
  if (!code || code.length !== 3) return undefined;
  const l1 = code[0] as Layer1Code;
  const l3 = code[2] as Layer3Code;
  const key = `${l1}_${l3}`;
  return ARCHETYPE_VULNERABILITY[key];
}

function determinePressureSource(
  absScore: number,
  contradictionPressure: number,
  mirrorDivergence: number,
  isSensitiveAxis: boolean
): PressurePoint["source"] {
  // Internal conflict: high contradiction AND high divergence (self-image conflict)
  if (contradictionPressure > 0.4 && mirrorDivergence > 0.3) return "internal_conflict";
  // Suppression: high divergence without contradiction (hiding true self)
  if (mirrorDivergence > 0.5 && contradictionPressure < 0.3) return "suppression";
  // Overextension: extreme score on sensitive axis
  if (absScore > 0.7 && isSensitiveAxis) return "overextension";
  if (absScore > 0.8) return "overextension";
  // Environmental: contradiction without self-image issues
  if (contradictionPressure > 0.3) return "environmental";
  return "environmental";
}

function determinePressureDirection(
  contradictionPressure: number,
  mirrorDivergence: number,
  totalPressure: number
): PressurePoint["direction"] {
  if (contradictionPressure > 0.4 && totalPressure > 0.5) return "building";
  if (mirrorDivergence < 0.15 && contradictionPressure < 0.15) return "releasing";
  return "stable";
}

function computeWeightedPressure(points: PressurePoint[]): number {
  if (points.length === 0) return 0;
  // Top 5 points weighted 2x, rest weighted 1x
  const sorted = [...points].sort((a, b) => b.pressure - a.pressure);
  let totalWeight = 0;
  let totalPressure = 0;
  for (let i = 0; i < sorted.length; i++) {
    const weight = i < 5 ? 2 : 1;
    totalWeight += weight;
    totalPressure += sorted[i].pressure * weight;
  }
  return totalPressure / totalWeight;
}

function getArchetypeRelevanceNote(axisId: string, code?: ArchetypeCode): string | undefined {
  if (!code) return undefined;
  const { cognition } = parseArchetypeCode(code);
  const l1Def = LAYER1_DEFS[cognition];
  if (!l1Def) return undefined;

  // Map axis clusters to archetype-relevant explanations
  const axisNotes: Record<string, Record<CognitionCode, string>> = {
    cautious_vs_bold: {
      A: "分析タイプにとって、大胆さはデータなき飛躍に等しい",
      N: "直感タイプにとって、大胆さは閃きに従う自然な行動",
      S: "体感タイプにとって、大胆さは身体が知っている確信と直結する",
    },
    social_initiative: {
      A: "分析タイプの社交は「理解できる範囲」で最適化される",
      N: "直感タイプの社交は「意味のある繋がり」を求める",
      S: "体感タイプの社交は「心地よさ」が原動力",
    },
    reassurance_need: {
      A: "論理的に納得できないと安心確認欲求が高まる",
      N: "直感が迷い始めた時に確認行動が増える",
      S: "身体感覚に違和感がある時に不安が生まれる",
    },
  };

  return axisNotes[axisId]?.[cognition];
}

function generatePressureWarning(
  axisDef: (typeof TRAIT_AXES)[number],
  source: PressurePoint["source"],
  pressure: number,
  isSensitive: boolean
): string {
  const axisName = `${axisDef.labelLeft}と${axisDef.labelRight}`;
  const sensitiveNote = isSensitive ? "あなたのタイプにとって特に影響が大きい領域です。" : "";

  switch (source) {
    case "internal_conflict":
      return `「${axisName}」の間で葛藤が深まっています。矛盾を認めること自体が、圧力を和らげる第一歩になります。${sensitiveNote}`;
    case "suppression":
      return `「${axisName}」において、本来の傾向が抑え込まれている可能性があります。安全な場所で、少しだけ本音を出してみてください。${sensitiveNote}`;
    case "overextension":
      return `「${axisName}」の領域で力が入りすぎています。少し手を緩めても、あなたの価値は変わりません。${sensitiveNote}`;
    case "environmental":
      return `「${axisName}」に外からの圧力がかかっています。距離を置く選択肢も、いつでもあります。${sensitiveNote}`;
  }
}

function generateReleaseRecommendation(
  criticalPoints: PressurePoint[],
  vulnerability?: ArchetypeVulnerability
): string {
  if (criticalPoints.length === 0) return "";

  // Prefer archetype-specific release hint if available
  if (vulnerability?.releaseHint && criticalPoints.some((p) => vulnerability.sensitiveAxes.includes(p.axisKey))) {
    return vulnerability.releaseHint;
  }

  const topSource = criticalPoints[0].source;
  switch (topSource) {
    case "internal_conflict":
      return "内的矛盾が蓄積しています。矛盾する二つの自分を、どちらも否定せずに並べてみてください。矛盾は多面性の証です。";
    case "suppression":
      return "何かを押し込めている感覚はありませんか。安全な場所で、押し込めていたものを少しだけ言葉にしてみてください。";
    case "overextension":
      return "頑張りすぎている領域があります。「やらなくてもいいこと」を一つだけ手放してみると、驚くほど楽になることがあります。";
    case "environmental":
      return "外部環境からの圧力が高まっています。一人の時間を取って、自分のペースを思い出してください。";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weather Patterns & Forecast
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Detect weather patterns using:
 * - Weekly frequency analysis (which day tends to have which weather)
 * - Exponential-weighted moving average of energy/stress
 * - Autocorrelation to detect periodic cycles
 * - Streak detection (consecutive same-weather days)
 */
export function detectWeatherPatterns(history: WeatherHistory[]): WeatherPattern[] {
  if (history.length < 7) return [];

  const patterns: WeatherPattern[] = [];

  // ── Weekly pattern: day-of-week frequency ──
  const DOW_LABELS = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"];
  const weekdayWeather: Record<number, WeatherType[]> = {};

  for (const entry of history) {
    const dow = new Date(entry.date).getDay();
    if (!weekdayWeather[dow]) weekdayWeather[dow] = [];
    weekdayWeather[dow].push(entry.weather);
  }

  for (const [dow, weathers] of Object.entries(weekdayWeather)) {
    if (weathers.length < 3) continue; // Need at least 3 weeks of data
    const dominant = findDominant(weathers);
    if (dominant.ratio >= 0.6) {
      patterns.push({
        cycleType: "weekly",
        description: `${DOW_LABELS[Number(dow)]}は${WEATHER_LABEL[dominant.value]}になりやすい傾向がある`,
        predictedNext: dominant.value,
        confidence: round(Math.min(0.85, dominant.ratio * 0.7 + weathers.length * 0.03)),
      });
    }
  }

  // ── Energy trend with exponential weighting (recent data matters more) ──
  if (history.length >= 10) {
    const energyEWMA = computeEWMA(history.map((h) => h.energyLevel), 0.3);
    const recentEWMA = energyEWMA.slice(-3);
    const olderEWMA = energyEWMA.slice(-7, -3);

    if (recentEWMA.length > 0 && olderEWMA.length > 0) {
      const recentAvg = recentEWMA.reduce((s, v) => s + v, 0) / recentEWMA.length;
      const olderAvg = olderEWMA.reduce((s, v) => s + v, 0) / olderEWMA.length;
      const delta = recentAvg - olderAvg;

      if (delta > 0.12) {
        patterns.push({
          cycleType: "irregular",
          description: "エネルギーが上昇傾向にある。回復の波が来ている可能性。",
          predictedNext: recentAvg > 0.3 ? "sunny" : "cloudy",
          confidence: clamp(0.4 + Math.abs(delta), 0, 0.75),
        });
      } else if (delta < -0.12) {
        patterns.push({
          cycleType: "irregular",
          description: "エネルギーが緩やかに低下している。意識的な休息のタイミングかもしれない。",
          predictedNext: recentAvg < -0.3 ? "rainy" : "cloudy",
          confidence: clamp(0.4 + Math.abs(delta), 0, 0.75),
        });
      }
    }
  }

  // ── Stress accumulation pattern ──
  if (history.length >= 7) {
    const recentStress = history.slice(-7).map((h) => h.stressLevel);
    const avgStress = recentStress.reduce((s, v) => s + v, 0) / recentStress.length;
    const stressTrend = detectTrend(recentStress);

    if (avgStress > 0.55 && stressTrend === "rising") {
      patterns.push({
        cycleType: "irregular",
        description: "ストレスが上昇し続けている。嵐が近づいている気配。",
        predictedNext: avgStress > 0.7 ? "stormy" : "rainy",
        confidence: 0.65,
      });
    } else if (avgStress > 0.5 && stressTrend === "flat") {
      patterns.push({
        cycleType: "irregular",
        description: "ストレスが高い水準で横ばい。曇りがしばらく続く見込み。",
        predictedNext: "cloudy",
        confidence: 0.55,
      });
    }
  }

  // ── Autocorrelation: detect repeating cycles ──
  if (history.length >= 14) {
    const weatherNumbers = history.map((h) => weatherToNumber(h.weather));
    for (const lag of [5, 7, 10, 14]) {
      if (history.length < lag * 2) continue;
      const correlation = autocorrelation(weatherNumbers, lag);
      if (correlation > 0.5) {
        const cycleLabel = lag === 7 ? "weekly" : "irregular";
        const lagDays = lag === 7 ? "1週間" : `約${lag}日`;
        patterns.push({
          cycleType: cycleLabel === "weekly" ? "weekly" : "irregular",
          description: `${lagDays}周期で天気パターンが繰り返される傾向がある`,
          predictedNext: history[history.length - lag]?.weather ?? "cloudy",
          confidence: round(Math.min(0.8, correlation * 0.7)),
        });
        break; // Take the strongest cycle only
      }
    }
  }

  // ── Streak detection ──
  if (history.length >= 3) {
    const lastWeather = history[history.length - 1].weather;
    let streak = 1;
    for (let i = history.length - 2; i >= 0; i--) {
      if (history[i].weather === lastWeather) streak++;
      else break;
    }
    if (streak >= 3) {
      // Long streaks tend to break
      const breakProbability = Math.min(0.7, streak * 0.12);
      const nextWeather = predictPostStreak(lastWeather);
      patterns.push({
        cycleType: "irregular",
        description: `${WEATHER_LABEL[lastWeather]}が${streak}日続いている。変化の兆しがある。`,
        predictedNext: nextWeather,
        confidence: round(breakProbability),
      });
    }
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}

/** Predict the likely weather after a long streak breaks */
function predictPostStreak(current: WeatherType): WeatherType {
  const transitions: Record<WeatherType, WeatherType> = {
    sunny: "cloudy",
    cloudy: "sunny",
    rainy: "cloudy",
    stormy: "rainy",
    foggy: "cloudy",
    windy: "sunny",
    snow: "foggy",
    aurora: "cloudy",
  };
  return transitions[current];
}

/** Map weather type to a numeric value for autocorrelation */
function weatherToNumber(weather: WeatherType): number {
  const map: Record<WeatherType, number> = {
    sunny: 1, cloudy: 0.3, rainy: -0.3, stormy: -1,
    foggy: -0.2, windy: 0.5, snow: -0.7, aurora: 1.2,
  };
  return map[weather];
}

/**
 * Generate weather forecast from patterns and current state.
 */
export function generateWeatherForecast(
  patterns: WeatherPattern[],
  currentWeather: InnerWeather
): string {
  if (patterns.length === 0) {
    return generateForecastFromCurrent(currentWeather);
  }

  const topPattern = patterns[0];
  const nextLabel = WEATHER_LABEL[topPattern.predictedNext];
  const nextEmoji = WEATHER_EMOJI[topPattern.predictedNext];

  if (topPattern.confidence > 0.7) {
    return `${topPattern.description} 明日は${nextEmoji}${nextLabel}の見込み。`;
  }

  if (topPattern.confidence > 0.5) {
    return `${topPattern.description} 明日は${nextEmoji}${nextLabel}かもしれない。`;
  }

  // Low confidence: blend pattern insight with current-weather forecast
  const currentForecast = generateForecastFromCurrent(currentWeather);
  return `${topPattern.description} ${currentForecast}`;
}

function generateForecastFromCurrent(weather: InnerWeather): string {
  const forecasts: Record<WeatherType, string[]> = {
    sunny: [
      "この穏やかさが続くかは分からない。でも今日の晴れを、ちゃんと味わっておくこと。",
      "晴れた日は、次の雨に備える日でもある。でも今は、ただ光を浴びていい。",
    ],
    cloudy: [
      "雲の向こうで何かが動いている気配。明日は晴れるか、それとも雨になるか。",
      "曇りは待合室のような天気。次の景色が決まるまで、ここで休んでいい。",
    ],
    rainy: [
      "雨はいつか止む。止んだ後の空気は、いつもより澄んでいるはず。",
      "雨音に耳を傾けて。止む瞬間には、必ず一拍の静寂がある。",
    ],
    stormy: [
      "嵐は永遠には続かない。過ぎた後に見える景色を、楽しみにしていてほしい。",
      "嵐の中でも、明日の天気は今日とは違う。それだけは確か。",
    ],
    foggy: [
      "霧は朝に晴れることが多い。明日の朝、少しだけ視界が開けているかもしれない。",
      "霧の中を歩いた経験は、次に霧が出た時の地図になる。",
    ],
    windy: [
      "風が何かを運んできている。明日は、新しい発見がある予感。",
      "風が止んだ後には、いつもと違うものが目の前に落ちている。",
    ],
    snow: [
      "雪解けは静かに始まる。焦らなくていい。少しずつ、少しずつ。",
      "雪の下で、見えないところで、何かが芽吹く準備をしている。",
    ],
    aurora: [
      "この特別な状態は長くは続かない。でも、ここで見たものは忘れないはず。",
      "オーロラを見た夜は、次の夜がどんなに暗くても空を見上げたくなる。",
    ],
  };

  const options = forecasts[weather.weatherType];
  // Use social battery level to select variant
  const idx = weather.socialBattery > 0.5 ? 0 : Math.min(options.length - 1, 1);
  return options[idx];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main: calculateInnerWeather
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Calculate the inner weather -- the user's current psychological state
 * expressed as a weather metaphor.
 *
 * The calculation pipeline:
 * 1. Estimate energy, stress, social battery, emotional tone, stability
 * 2. Detect defense mechanisms (multi-signal convergence)
 * 3. Determine weather type via weighted scoring (not threshold cascade)
 * 4. Select weather report based on emotional tone + time + social battery
 * 5. Detect temporal patterns and generate forecast
 */
export function calculateInnerWeather(input: WeatherInput): InnerWeather {
  const {
    axisScores,
    recentObservations,
    currentTime,
    contradictions,
    mirrorDivergence,
    recentWeather,
  } = input;

  const timeOfDay = getTimeOfDay(currentTime.getHours());

  // Step 1: Estimate sub-metrics with interaction model
  const energyLevel = round(estimateEnergy(axisScores, recentObservations, timeOfDay));
  const stressLevel = round(estimateStress(axisScores, contradictions, mirrorDivergence, recentObservations));
  const socialBattery = round(estimateSocialBattery(axisScores, timeOfDay));
  const emotionalTone = estimateEmotionalTone(energyLevel, stressLevel, socialBattery, contradictions, recentObservations);
  const stability = round(estimateStability(axisScores, contradictions, mirrorDivergence, recentWeather));

  // Step 2: Defense detection with multi-signal convergence
  const defense = detectDefenseMechanism(recentObservations, mirrorDivergence, axisScores);

  // Step 3: Weather via weighted scoring
  const weatherType = determineWeatherType(
    energyLevel, stressLevel, emotionalTone, stability, socialBattery,
    contradictions, defense.active
  );

  // Step 4: Temporal patterns and forecast
  const patterns = recentWeather ? detectWeatherPatterns(recentWeather) : [];

  // Step 5: Build result
  const partialWeather: InnerWeather = {
    weatherType,
    emoji: getWeatherEmoji(weatherType),
    label: getWeatherLabel(weatherType),
    description: "",
    energyLevel,
    stressLevel,
    emotionalTone,
    socialBattery,
    stability,
    forecast: "",
  };

  partialWeather.description = generateWeatherReport(partialWeather, timeOfDay);
  partialWeather.forecast = generateWeatherForecast(patterns, partialWeather);

  return partialWeather;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Display Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getWeatherEmoji(type: WeatherType): string {
  return WEATHER_EMOJI[type];
}

export function getWeatherLabel(type: WeatherType): string {
  return WEATHER_LABEL[type];
}

/**
 * Generate a weather report in literary Japanese.
 *
 * Selection criteria (to ensure variety):
 * - Emotional tone determines the mood of the report
 * - Time of day provides atmospheric context
 * - Social battery level selects introspective vs relational phrasing
 * - A seeded hash prevents the same report on consecutive calls with similar state
 */
export function generateWeatherReport(weather: InnerWeather, timeOfDay?: TimeOfDay): string {
  const reports = WEATHER_REPORTS[weather.weatherType];
  if (!reports || reports.length === 0) {
    return "内なる天気を観測中。";
  }

  // Multi-factor index selection for variety
  const toneIndex = emotionalToneToIndex(weather.emotionalTone);
  const timeIndex = timeOfDay ? timeOfDayToIndex(timeOfDay) : 0;
  const batteryIndex = weather.socialBattery > 0.6 ? 0 : weather.socialBattery > 0.3 ? 1 : 2;

  // Combine factors into a single index, spreading across all reports
  const combinedSeed = (toneIndex * 3 + timeIndex * 7 + batteryIndex * 11) % reports.length;

  return reports[combinedSeed];
}

function emotionalToneToIndex(tone: EmotionalTone): number {
  const map: Record<EmotionalTone, number> = {
    calm: 0, joyful: 1, excited: 2, anxious: 3, melancholic: 4, numb: 5, conflicted: 6,
  };
  return map[tone];
}

function timeOfDayToIndex(time: TimeOfDay): number {
  const map: Record<TimeOfDay, number> = {
    dawn: 0, morning: 1, afternoon: 2, evening: 3, night: 4, lateNight: 5,
  };
  return map[time];
}

export function getDefenseLabel(type: DefenseType): { label: string; description: string } {
  return DEFENSE_LABELS[type];
}

export function getEmotionalToneLabel(tone: EmotionalTone): string {
  const labels: Record<EmotionalTone, string> = {
    calm: "穏やか",
    excited: "高揚",
    anxious: "不安",
    melancholic: "憂鬱",
    joyful: "喜び",
    numb: "無感覚",
    conflicted: "葛藤",
  };
  return labels[tone];
}

export function getPressureSourceLabel(source: PressurePoint["source"]): string {
  return PRESSURE_SOURCE_LABELS[source];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utilities
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function findDominant<T>(values: T[]): { value: T; ratio: number } {
  const counts = new Map<T, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let maxCount = 0;
  let dominant = values[0];
  counts.forEach((count, value) => {
    if (count > maxCount) {
      maxCount = count;
      dominant = value;
    }
  });
  return { value: dominant, ratio: maxCount / values.length };
}

function detectTrend(values: number[]): "rising" | "falling" | "flat" {
  if (values.length < 4) return "flat";
  const halfIdx = Math.floor(values.length / 2);
  const firstAvg = values.slice(0, halfIdx).reduce((s, v) => s + v, 0) / halfIdx;
  const secondAvg = values.slice(halfIdx).reduce((s, v) => s + v, 0) / (values.length - halfIdx);
  const diff = secondAvg - firstAvg;
  if (diff > 0.12) return "rising";
  if (diff < -0.12) return "falling";
  return "flat";
}

/**
 * Compute Exponential Weighted Moving Average.
 * Alpha controls recency bias (higher = more weight on recent values).
 */
function computeEWMA(values: number[], alpha: number): number[] {
  if (values.length === 0) return [];
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

/**
 * Compute autocorrelation at a given lag.
 * Returns a value between -1 and 1 (1 = perfect correlation at this lag).
 */
function autocorrelation(values: number[], lag: number): number {
  if (values.length <= lag) return 0;
  const n = values.length - lag;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (values[i] - mean) * (values[i + lag] - mean);
  }
  for (let i = 0; i < values.length; i++) {
    denominator += (values[i] - mean) ** 2;
  }

  if (denominator === 0) return 0;
  return numerator / denominator;
}
