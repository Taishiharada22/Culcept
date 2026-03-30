/**
 * Behavioral Laws Engine — 行動法則の導出
 * 反復パターン・矛盾・判断原理・崩壊/成長条件をルールベースで推論。
 * AI不要。OriginV7Save → BehavioralLawsResult の純関数。
 */

import type { OriginV7Save, LifePeriod } from "./types";
import type {
  ResidueItem,
  ResidueCategory,
  AnalyticalFrame,
  WhyStoppedReason,
  WhyStartedReason,
  WhyContinuedReason,
  RewardType,
} from "./workspaceTypes";
import { getPeriodLabel } from "./periods";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   出力型
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type RepeatingPattern = {
  id: string;
  pattern: string;
  appearances: { period: LifePeriod; context: string }[];
  strength: number;
};

export type Contradiction = {
  id: string;
  sideA: string;
  sideB: string;
  sourceA: string;
  sourceB: string;
  tension: "high" | "moderate";
};

export type DecisionPrinciple = {
  id: string;
  principle: string;
  evidence: string[];
  confidence: number;
};

export type CollapseCondition = {
  id: string;
  trigger: string;
  mechanism: string;
  evidence: string[];
};

export type GrowthCondition = {
  id: string;
  trigger: string;
  mechanism: string;
  evidence: string[];
};

export type BehavioralLawsResult = {
  repeatingPatterns: RepeatingPattern[];
  contradictions: Contradiction[];
  decisionPrinciples: DecisionPrinciple[];
  collapseConditions: CollapseCondition[];
  growthConditions: GrowthCondition[];
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Period Order
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PERIOD_ORDER: Record<string, number> = {
  early_childhood: 0, elementary: 1, middle_school: 2, high_school: 3,
  late_teens: 4, early_twenties: 5, mid_twenties: 6, thirties: 7,
  forties_plus: 8, special_period: 9,
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   矛盾マップ — 対立する概念ペア
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type ContradictionPair = {
  a: string[];  // sideA にマッチするラベル群
  b: string[];  // sideB にマッチするラベル群
  labelA: string;
  labelB: string;
  tension: "high" | "moderate";
};

const CONTRADICTION_PAIRS: ContradictionPair[] = [
  {
    a: ["自由", "すぐに行動する", "独立心"],
    b: ["安心感", "安心できる居場所", "本当の居場所"],
    labelA: "自由を求める",
    labelB: "安心を求める",
    tension: "high",
  },
  {
    a: ["完璧を目指す", "完璧に準備する", "責任感"],
    b: ["逃げ道を用意する", "期待しない", "深入りしない"],
    labelA: "完璧を目指す",
    labelB: "逃げ道を持つ",
    tension: "high",
  },
  {
    a: ["本音を言いにくい", "感情を出さない", "自分を少し抑える"],
    b: ["自分らしさ", "自己表現の場", "認められること"],
    labelA: "自分を抑える",
    labelB: "自分を出したい",
    tension: "high",
  },
  {
    a: ["一人で抱える", "距離を置く"],
    b: ["心から信頼できる人", "理解してくれる人", "深い信頼を求める感覚"],
    labelA: "一人で抱える",
    labelB: "深い繋がりを求める",
    tension: "moderate",
  },
  {
    a: ["空気を読む", "相手に合わせる", "先に周囲を見てから動く"],
    b: ["挑戦する姿勢", "行動力", "すぐに行動する"],
    labelA: "周囲を優先する",
    labelB: "自分から動きたい",
    tension: "moderate",
  },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   判断原理パターン
   whyStopped/whyStarted/whyContinued から推論
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type DecisionTemplate = {
  trigger: { stopped?: WhyStoppedReason[]; started?: WhyStartedReason[]; continued?: WhyContinuedReason[] };
  principle: string;
  minCount: number;
};

const DECISION_TEMPLATES: DecisionTemplate[] = [
  { trigger: { stopped: ["tired", "hurt"] }, principle: "限界まで頑張ってから身を引く", minCount: 2 },
  { trigger: { stopped: ["lost_interest", "found_alternative"] }, principle: "興味が移ったら切り替える", minCount: 2 },
  { trigger: { started: ["invited", "wanted_belonging"] }, principle: "誘われれば飛び込む", minCount: 2 },
  { trigger: { started: ["liked_it", "good_at_it"] }, principle: "好きなことに集中する", minCount: 2 },
  { trigger: { continued: ["had_peers", "recognized"] }, principle: "居場所があれば続けられる", minCount: 2 },
  { trigger: { continued: ["hard_to_quit", "core_self"] }, principle: "やめられないものこそ自分の軸", minCount: 1 },
  { trigger: { stopped: ["environment_changed", "couldnt_continue"] }, principle: "環境に左右されやすい", minCount: 2 },
  { trigger: { started: ["for_future", "wanted_change"] }, principle: "未来のために今動く", minCount: 2 },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   崩壊パターンマップ
   pressure + whatLost の組み合わせ → 崩壊条件
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type CollapseTemplate = {
  pressureKeywords: string[];
  residueLabels: string[];
  trigger: string;
  mechanism: string;
};

const COLLAPSE_TEMPLATES: CollapseTemplate[] = [
  {
    pressureKeywords: ["期待", "応える", "求められ"],
    residueLabels: ["完璧を目指す", "一人で抱える"],
    trigger: "期待に応え続ける圧力",
    mechanism: "完璧を求める → 一人で抱え込む → 限界を超える",
  },
  {
    pressureKeywords: ["認められ", "評価", "成果"],
    residueLabels: ["認められなかった記憶", "期待に応えられなかった"],
    trigger: "評価されなければならない状況",
    mechanism: "承認を求める → 得られない → 自信喪失",
  },
  {
    pressureKeywords: ["競争", "勝た", "負け"],
    residueLabels: ["挫折の記憶", "比較された記憶"],
    trigger: "競争にさらされる状況",
    mechanism: "比較される → 挫折を想起 → 回避行動",
  },
  {
    pressureKeywords: ["孤立", "一人", "頼れ"],
    residueLabels: ["孤立した感覚", "自分から声をかけにくい"],
    trigger: "頼れる人がいない状況",
    mechanism: "孤立 → 不安増大 → 引きこもり",
  },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   成長パターンマップ
   reward + whatGained の組み合わせ → 成長条件
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type GrowthTemplate = {
  rewardTypes: RewardType[];
  residueLabels: string[];
  trigger: string;
  mechanism: string;
};

const GROWTH_TEMPLATES: GrowthTemplate[] = [
  {
    rewardTypes: ["belonging", "security"],
    residueLabels: ["安心感", "本当の居場所"],
    trigger: "安全だと感じられる環境",
    mechanism: "安心 → 警戒解除 → 本来の力を発揮",
  },
  {
    rewardTypes: ["recognition", "achievement"],
    residueLabels: ["自信の記憶", "責任感"],
    trigger: "努力が認められる環境",
    mechanism: "承認 → 自信 → さらなる挑戦",
  },
  {
    rewardTypes: ["freedom"],
    residueLabels: ["自由", "独立心", "行動力"],
    trigger: "裁量が与えられる環境",
    mechanism: "自由 → 主体的に動く → 成果を出す",
  },
  {
    rewardTypes: ["belonging"],
    residueLabels: ["世話を焼く", "頼られると断れない", "気配りができること"],
    trigger: "信頼できる少人数のチーム",
    mechanism: "信頼関係 → 役割を見つける → 貢献実感",
  },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   メイン導出関数
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveBehavioralLaws(save: OriginV7Save): BehavioralLawsResult {
  return {
    repeatingPatterns: deriveRepeatingPatterns(save),
    contradictions: deriveContradictions(save),
    decisionPrinciples: deriveDecisionPrinciples(save),
    collapseConditions: deriveCollapseConditions(save),
    growthConditions: deriveGrowthConditions(save),
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. 反復パターン
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveRepeatingPatterns(save: OriginV7Save): RepeatingPattern[] {
  // テキストが出現する period + context を収集
  const echoMap = new Map<string, { period: LifePeriod; context: string }[]>();

  // chapters.echoes
  for (const ch of save.chapters) {
    for (const echo of ch.echoes) {
      const key = normalizeText(echo);
      if (!echoMap.has(key)) echoMap.set(key, []);
      echoMap.get(key)!.push({ period: ch.fact.period, context: `記憶断片「${ch.title}」` });
    }
  }

  // activities.analyticalFrame.whatRemains
  for (const act of save.activities ?? []) {
    if (act.analyticalFrame?.whatRemains) {
      const key = normalizeText(act.analyticalFrame.whatRemains);
      if (!echoMap.has(key)) echoMap.set(key, []);
      echoMap.get(key)!.push({ period: act.period, context: `活動「${act.name}」` });
    }
  }

  // turningPoints.analyticalFrame.whatRemains
  for (const tp of save.turningPoints ?? []) {
    if (tp.analyticalFrame?.whatRemains) {
      const key = normalizeText(tp.analyticalFrame.whatRemains);
      if (!echoMap.has(key)) echoMap.set(key, []);
      echoMap.get(key)!.push({ period: tp.period, context: `転機「${tp.title}」` });
    }
  }

  // residueBoard labels (check if they appear across periods via chapters/activities)
  for (const r of save.residueBoard ?? []) {
    const key = normalizeText(r.label);
    if (!echoMap.has(key)) echoMap.set(key, []);
    // residue itself doesn't have a period, but we can mark it as present
  }

  // 2つ以上の distinct period に出現するものを抽出
  const totalPeriods = countDistinctPeriods(save);
  const patterns: RepeatingPattern[] = [];
  let id = 0;

  for (const [key, appearances] of echoMap) {
    const distinctPeriods = new Set(appearances.map((a) => a.period));
    if (distinctPeriods.size >= 2) {
      // Sort by period order
      const sorted = [...appearances].sort(
        (a, b) => (PERIOD_ORDER[a.period] ?? 99) - (PERIOD_ORDER[b.period] ?? 99),
      );
      // Dedupe by period (keep first context per period)
      const deduped: { period: LifePeriod; context: string }[] = [];
      const seenPeriods = new Set<string>();
      for (const app of sorted) {
        if (!seenPeriods.has(app.period)) {
          seenPeriods.add(app.period);
          deduped.push(app);
        }
      }

      patterns.push({
        id: `rp_${id++}`,
        pattern: key,
        appearances: deduped,
        strength: deduped.length / Math.max(totalPeriods, 1),
      });
    }
  }

  return patterns
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   2. 矛盾
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveContradictions(save: OriginV7Save): Contradiction[] {
  // 全ラベルを収集（residue + seeking + remains）
  const allLabels = new Map<string, string>(); // label → source

  for (const r of save.residueBoard ?? []) {
    allLabels.set(r.label, `残留: ${r.label}`);
  }

  if (save.currentPosition) {
    for (const sid of save.currentPosition.seeking) {
      // seeking は ID なので、対応するラベルに変換する必要があるが、
      // ここでは currentPositionData を直接参照せず、SEEKING_LABEL_MAP を使う
      const label = SEEKING_LABEL_MAP[sid];
      if (label) allLabels.set(label, `探索中: ${label}`);
    }
    for (const rid of save.currentPosition.remains) {
      const label = REMAIN_LABEL_MAP[rid];
      if (label) allLabels.set(label, `残存: ${label}`);
    }
  }

  for (const act of save.activities ?? []) {
    if (act.analyticalFrame?.whatWasSought) {
      allLabels.set(act.analyticalFrame.whatWasSought, `活動「${act.name}」で求めていたもの`);
    }
    if (act.analyticalFrame?.whatWasAvoided) {
      allLabels.set(act.analyticalFrame.whatWasAvoided, `活動「${act.name}」で避けていたもの`);
    }
  }

  const contradictions: Contradiction[] = [];
  let id = 0;

  for (const pair of CONTRADICTION_PAIRS) {
    const foundA = findMatchingLabel(pair.a, allLabels);
    const foundB = findMatchingLabel(pair.b, allLabels);

    if (foundA && foundB) {
      contradictions.push({
        id: `contra_${id++}`,
        sideA: pair.labelA,
        sideB: pair.labelB,
        sourceA: allLabels.get(foundA) ?? foundA,
        sourceB: allLabels.get(foundB) ?? foundB,
        tension: pair.tension,
      });
    }
  }

  return contradictions;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   3. 判断原理
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveDecisionPrinciples(save: OriginV7Save): DecisionPrinciple[] {
  const allFrames = collectAllFrames(save);
  const principles: DecisionPrinciple[] = [];
  let id = 0;

  for (const template of DECISION_TEMPLATES) {
    const evidence: string[] = [];
    let count = 0;

    for (const frame of allFrames) {
      if (template.trigger.stopped) {
        for (const reason of template.trigger.stopped) {
          if (frame.frame.whyStopped.includes(reason)) {
            count++;
            evidence.push(`${frame.source}で「${getStoppedLabel(reason)}」`);
          }
        }
      }
      if (template.trigger.started) {
        for (const reason of template.trigger.started) {
          if (frame.frame.whyStarted.includes(reason)) {
            count++;
            evidence.push(`${frame.source}を「${getStartedLabel(reason)}」で始めた`);
          }
        }
      }
      if (template.trigger.continued) {
        for (const reason of template.trigger.continued) {
          if (frame.frame.whyContinued.includes(reason)) {
            count++;
            evidence.push(`${frame.source}を「${getContinuedLabel(reason)}」で続けた`);
          }
        }
      }
    }

    if (count >= template.minCount) {
      principles.push({
        id: `dp_${id++}`,
        principle: template.principle,
        evidence: evidence.slice(0, 3),
        confidence: Math.min(count / 4, 1),
      });
    }
  }

  return principles.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   4. 崩壊条件
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveCollapseConditions(save: OriginV7Save): CollapseCondition[] {
  const allFrames = collectAllFrames(save);
  const residueLabels = new Set((save.residueBoard ?? []).map((r) => r.label));
  const woundLabels = (save.residueBoard ?? [])
    .filter((r) => r.category === "wound")
    .map((r) => r.label);

  const conditions: CollapseCondition[] = [];
  let id = 0;

  for (const template of COLLAPSE_TEMPLATES) {
    const evidence: string[] = [];

    // pressure にキーワードが含まれるか
    for (const { frame, source } of allFrames) {
      if (frame.pressure) {
        for (const kw of template.pressureKeywords) {
          if (frame.pressure.includes(kw)) {
            evidence.push(`${source}の圧力: 「${frame.pressure}」`);
            break;
          }
        }
      }
    }

    // residue に対応するラベルがあるか
    for (const label of template.residueLabels) {
      if (residueLabels.has(label)) {
        evidence.push(`残留: 「${label}」`);
      }
    }

    // wound residue との関連
    for (const w of woundLabels) {
      for (const kw of template.pressureKeywords) {
        if (w.includes(kw)) {
          evidence.push(`傷: 「${w}」`);
        }
      }
    }

    if (evidence.length >= 2) {
      conditions.push({
        id: `collapse_${id++}`,
        trigger: template.trigger,
        mechanism: template.mechanism,
        evidence: evidence.slice(0, 3),
      });
    }
  }

  return conditions.slice(0, 3);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   5. 成長条件
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function deriveGrowthConditions(save: OriginV7Save): GrowthCondition[] {
  const allFrames = collectAllFrames(save);
  const residueLabels = new Set((save.residueBoard ?? []).map((r) => r.label));
  const seekingLabels = new Set(
    (save.currentPosition?.seeking ?? [])
      .map((id) => SEEKING_LABEL_MAP[id])
      .filter(Boolean) as string[],
  );

  const conditions: GrowthCondition[] = [];
  let id = 0;

  for (const template of GROWTH_TEMPLATES) {
    const evidence: string[] = [];

    // reward に一致するか
    for (const { frame, source } of allFrames) {
      for (const rt of template.rewardTypes) {
        if (frame.reward.includes(rt)) {
          evidence.push(`${source}の報酬: 「${getRewardLabel(rt)}」`);
          break;
        }
      }
    }

    // residue / seeking に対応するラベルがあるか
    for (const label of template.residueLabels) {
      if (residueLabels.has(label)) {
        evidence.push(`残留: 「${label}」`);
      } else if (seekingLabels.has(label)) {
        evidence.push(`探索中: 「${label}」`);
      }
    }

    if (evidence.length >= 2) {
      conditions.push({
        id: `growth_${id++}`,
        trigger: template.trigger,
        mechanism: template.mechanism,
        evidence: evidence.slice(0, 3),
      });
    }
  }

  return conditions.slice(0, 3);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ヘルパー
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function normalizeText(text: string): string {
  return text.trim();
}

function countDistinctPeriods(save: OriginV7Save): number {
  const periods = new Set<string>();
  for (const ch of save.chapters) periods.add(ch.fact.period);
  for (const a of save.activities ?? []) periods.add(a.period);
  for (const t of save.turningPoints ?? []) periods.add(t.period);
  return periods.size;
}

type FrameWithSource = { frame: AnalyticalFrame; source: string; period: LifePeriod };

function collectAllFrames(save: OriginV7Save): FrameWithSource[] {
  const frames: FrameWithSource[] = [];
  for (const a of save.activities ?? []) {
    if (a.analyticalFrame) {
      frames.push({ frame: a.analyticalFrame, source: `活動「${a.name}」`, period: a.period });
    }
  }
  for (const t of save.turningPoints ?? []) {
    if (t.analyticalFrame) {
      frames.push({ frame: t.analyticalFrame, source: `転機「${t.title}」`, period: t.period });
    }
  }
  return frames;
}

function findMatchingLabel(candidates: string[], allLabels: Map<string, string>): string | null {
  for (const c of candidates) {
    // 完全一致
    if (allLabels.has(c)) return c;
    // 部分一致
    for (const [label] of allLabels) {
      if (label.includes(c) || c.includes(label)) return label;
    }
  }
  return null;
}

/* ── ラベル変換 ── */

const SEEKING_LABEL_MAP: Record<string, string> = {
  safe_place: "安心できる居場所",
  passion: "本気で打ち込めるもの",
  next_challenge: "次の挑戦",
  own_axis: "自分の軸",
  understanding_person: "理解してくれる人",
  unnamed: "まだ言葉にならない何か",
  calm_relation: "落ち着ける関係",
  authentic_place: "自分らしくいられる場所",
};

const REMAIN_LABEL_MAP: Record<string, string> = {
  caution: "慎重さ",
  confidence_memory: "自信の記憶",
  challenge: "挑戦する姿勢",
  curiosity: "探求心",
  support: "支える姿勢",
  carry_alone: "一人で抱える癖",
  deep_trust: "深い信頼を求める感覚",
  observe: "周りをよく見る癖",
  independence: "自立心",
  adaptability: "変化への強さ",
  kindness: "優しさ",
  vigilance: "警戒心",
};

function getStoppedLabel(reason: WhyStoppedReason): string {
  const map: Record<WhyStoppedReason, string> = {
    lost_interest: "興味を失った",
    environment_changed: "環境が変わった",
    tired: "疲れた",
    hurt: "傷ついた",
    job_done: "やり切った",
    found_alternative: "別のものを見つけた",
    didnt_fit: "合わなかった",
    couldnt_continue: "続けられなくなった",
  };
  return map[reason] ?? reason;
}

function getStartedLabel(reason: WhyStartedReason): string {
  const map: Record<WhyStartedReason, string> = {
    liked_it: "好きだった",
    good_at_it: "得意だった",
    invited: "誘われた",
    family_influence: "家族の影響",
    wanted_belonging: "居場所が欲しかった",
    wanted_recognition: "認められたかった",
    for_future: "将来のため",
    wanted_escape: "逃げたかった",
    wanted_change: "変わりたかった",
    neutral: "なんとなく",
  };
  return map[reason] ?? reason;
}

function getContinuedLabel(reason: WhyContinuedReason): string {
  const map: Record<WhyContinuedReason, string> = {
    enjoyable: "楽しかった",
    got_results: "結果が出た",
    recognized: "認められた",
    had_peers: "仲間がいた",
    hard_to_quit: "やめにくかった",
    became_habit: "習慣になった",
    core_self: "自分の軸だった",
    nowhere_else: "他に行く場所がなかった",
  };
  return map[reason] ?? reason;
}

function getRewardLabel(reward: RewardType): string {
  const map: Record<RewardType, string> = {
    security: "安心感",
    recognition: "承認",
    achievement: "達成感",
    belonging: "居場所",
    freedom: "自由",
  };
  return map[reward] ?? reward;
}
