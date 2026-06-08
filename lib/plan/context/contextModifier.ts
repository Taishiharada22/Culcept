/**
 * lib/plan/context/contextModifier.ts — Phase A2-1: Context Modifier / 文脈条件付け（pure core）
 *
 * ★目的（Personal Reality Graph の核）:
 *   「今日のあなたなら」を、天候・時間帯・曜日・予定密度・energy・日内位置・移動負荷などの **今日の文脈** で
 *   補正する。belief（pace ratio / mode habit / repertoire）を **一切汚さず**、決定時にだけ並走する注釈を作る。
 *
 * ★最重要 guardrail（CEO 方針 / stop gate を設計で封じる）:
 *   1. ❌ belief を上書きしない。本 module は belief store を read も write もしない。
 *        energy/density は既に rehearseDay の入力（baseEnergyLevel/density）なので、A2 は **再注入しない**
 *        （並走する定性注釈に徹する。二重適用しない）。
 *   2. ❌ 偽の確率・偽の数値を出さない。出力は定性（eases/tightens × slight/notable）と category のみ。
 *        天候や疲労に対する数値係数（"×1.3" 等）は **観測がないので捏造**＝禁止。
 *   3. ❌ source 不明な文脈を断定しない。各条件は source タグ必須。source==="unknown"/欠落 → factor を出さず
 *        ignoredUnknown に記録（透明性）。一般則は grounding:"general" と明示し「あなたは」と断定しない。
 *   4. ❌ sensitive 情報（場所名・同伴者・具体位置）を文脈に使わない。本 module の型は抽象条件のみを持つ。
 *   5. ★不確実性は「広げる」（捏造しない）。条件が普段と違う/出所が薄いとき widenUncertainty=true で
 *        「今日は見立てが当てにくい」と返す（点推定を勝手に動かさない）。
 *   6. pure / Date 不使用 / DB・network・API・localStorage なし。flag default OFF。
 *
 * house style 踏襲: level-not-score、evidence(basis)、断定でなく仮説トーン。
 */
import type { TimeBucket } from "@/lib/plan/dayGraph/dayGraphTypes";

// ───────────────────────── flag（default OFF） ─────────────────────────

/**
 * ★A2 context modifier flag（**default OFF**）。本 module は pure なので OFF でも import は安全。
 * 実配線（決定路で modifier を効かせる）は本 flag ∧ 非 production で gate する（将来の wiring 用）。
 */
export const DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED = false;

/** context modifier を決定路に効かせてよいか（flag ON ∧ 非 production・default OFF）。 */
export function isContextModifierEnabled(): boolean {
  return DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

// ───────────────────────── 条件の出所（source） ─────────────────────────

/**
 * 条件の出所。★source 不明な文脈を断定しないための必須タグ。
 *   - observed : カレンダー / dayGraph から直接（予定密度・日内位置・移動負荷）= 事実
 *   - user     : 本人の明示申告
 *   - derived  : 既存 belief/state 層が算出（innerWeather energy 等）
 *   - unknown  : 出所不明 → factor を作らず ignoredUnknown に記録（断定回避）
 */
export type ContextSource = "observed" | "user" | "derived" | "unknown";

// ───────────────────────── 条件スナップショット（抽象・sensitive-free） ─────────────────────────

export type WeatherKind = "rain" | "heat" | "cold" | "normal";
export type DayType = "weekday" | "weekend";
export type DensityLevel = "sparse" | "balanced" | "packed";
export type PositionInDay = "early" | "mid" | "late";
export type TravelLoadLevel = "light" | "moderate" | "heavy";

interface Sourced<T> {
  readonly value: T;
  readonly source: ContextSource;
}

/**
 * 今日の文脈スナップショット。★全 field optional・source タグ付き・**抽象条件のみ**（場所/同伴者なし）。
 * energy は 0..1 正規化（baseEnergyLevel と同スケール）を期待。weather は本 module が fetch せず
 * 既知 source の入力として受ける（external API gate を踏まない）。
 */
export interface ContextSnapshot {
  readonly weather?: Sourced<WeatherKind> | null;
  /** 時間帯（記述用・v0 は単独 tilt を出さない＝過剰主張回避）。 */
  readonly timeBand?: Sourced<TimeBucket> | null;
  /** 曜日タイプ（記述用・v0 は単独 tilt を出さない＝本人 pattern 未取得のため断定しない）。 */
  readonly dayType?: Sourced<DayType> | null;
  readonly density?: Sourced<DensityLevel> | null;
  /** 0..1 正規化 energy（baseEnergyLevel と同スケール）。 */
  readonly energy?: Sourced<number> | null;
  readonly positionInDay?: Sourced<PositionInDay> | null;
  readonly travelLoad?: Sourced<TravelLoadLevel> | null;
}

// ───────────────────────── 出力（定性・偽数値なし） ─────────────────────────

export type ContextSignal =
  | "weather"
  | "time_band"
  | "day_type"
  | "density"
  | "energy"
  | "position_in_day"
  | "travel_load";

/** 傾き方向（定性）。tightens=普段より際どい寄り / eases=普段よりゆとり寄り。 */
export type TiltDirection = "eases" | "tightens" | "neutral";
/** 傾きの強さ（定性・偽 % でない）。 */
export type TiltStrength = "slight" | "notable";
/** 一般則か本人観測か。★v0 は全て general（本人の条件別データ未取得）。 */
export type FactorGrounding = "general" | "personal";

export interface ContextFactor {
  readonly signal: ContextSignal;
  /** observed/user/derived のみ（unknown は factor 化しない）。 */
  readonly source: ContextSource;
  readonly direction: TiltDirection;
  readonly strength: TiltStrength;
  /** 仮説トーンの根拠（断定でなく「〜しやすい」・source 明示）。 */
  readonly basis: string;
  readonly grounding: FactorGrounding;
}

export type OverallTilt = "easier_than_usual" | "as_usual" | "tighter_than_usual" | "unknown";

export interface ContextModifier {
  readonly factors: readonly ContextFactor[];
  readonly overallTilt: OverallTilt;
  /** ★条件が普段と違う/出所が薄いとき true。点推定を動かさず「当てにくい日」と広げる合図。 */
  readonly widenUncertainty: boolean;
  /** 出所のある（factor 化した）条件数。透明性。 */
  readonly knownSignalCount: number;
  /** 出所不明で無視した条件ラベル。断定回避の記録。 */
  readonly ignoredUnknown: readonly string[];
}

// ───────────────────────── config（固定値・較正は backlog） ─────────────────────────

export interface ContextModifierConfig {
  /** energy(0..1) これ以下で「低い」＝tightens(notable)。 */
  readonly energyLowMax: number;
  /** energy(0..1) これ以上で「高い」＝eases(slight)。 */
  readonly energyHighMin: number;
  /** overallTilt 判定の net 閾値（slight=1/notable=2 の重み和の差）。 */
  readonly tiltNetThreshold: number;
}

/** ★固定初期値。較正は実データ後（calibration backlog）。 */
export const DEFAULT_CONTEXT_MODIFIER_CONFIG: ContextModifierConfig = {
  energyLowMax: 0.33,
  energyHighMin: 0.67,
  tiltNetThreshold: 2,
};

// ───────────────────────── 内部: 出所判定 ─────────────────────────

/** source が factor 化に足るか（unknown は不可）。 */
function isKnownSource(source: ContextSource): boolean {
  return source === "observed" || source === "user" || source === "derived";
}

function strengthWeight(strength: TiltStrength): number {
  return strength === "notable" ? 2 : 1;
}

// ───────────────────────── core: snapshot → modifier ─────────────────────────

/**
 * ★A2-1 core: 今日の文脈スナップショット → 定性 modifier（pure）。
 *
 * tilt を出す信号（research-defensible な一般則のみ・source 既知時だけ）:
 *   - weather=rain/heat → tightens(slight)   ［悪天候は移動に余白が要りやすい・一般則］
 *   - density=packed    → tightens(notable)  ［予定が詰まると重なりやすい・観測］
 *   - density=sparse    → eases(slight)
 *   - position=late     → tightens(slight)   ［1日の後半は累積で際どくなりやすい］
 *   - energy 低         → tightens(notable)  ［low energy・derived］/ 高 → eases(slight)
 *   - travelLoad=heavy  → tightens(slight)   / light → eases(slight)
 * 記述のみ（tilt を出さない）: timeBand, dayType（v0 は本人 pattern 未取得＝断定しない）。
 *
 * ★belief を read/write しない・数値係数を出さない・unknown source は ignoredUnknown へ。
 */
export function buildContextModifier(
  snapshot: ContextSnapshot,
  config: ContextModifierConfig = DEFAULT_CONTEXT_MODIFIER_CONFIG,
): ContextModifier {
  const factors: ContextFactor[] = [];
  const ignoredUnknown: string[] = [];

  const note = (
    signal: ContextSignal,
    sourced: Sourced<unknown> | null | undefined,
    derive: (source: ContextSource) => ContextFactor | null,
  ): void => {
    if (!sourced) return; // 欠落 → 無言（断定しない）
    if (!isKnownSource(sourced.source)) {
      ignoredUnknown.push(signal); // 出所不明 → 無視を記録
      return;
    }
    const f = derive(sourced.source);
    if (f) factors.push(f);
  };

  // weather（rain/heat のみ tilt・cold/normal は記述扱いで factor なし）
  note("weather", snapshot.weather, (source) => {
    const k = snapshot.weather!.value;
    if (k === "rain" || k === "heat") {
      return {
        signal: "weather",
        source,
        direction: "tightens",
        strength: "slight",
        basis: k === "rain" ? "雨の日は移動に余白が要りやすい（一般的傾向）" : "暑い日は移動で消耗しやすい（一般的傾向）",
        grounding: "general",
      };
    }
    return null;
  });

  // density（packed=notable tightens / sparse=slight eases / balanced=なし）
  note("density", snapshot.density, (source) => {
    const lvl = snapshot.density!.value;
    if (lvl === "packed") {
      return { signal: "density", source, direction: "tightens", strength: "notable", basis: "予定が詰まった日は重なりやすい", grounding: "general" };
    }
    if (lvl === "sparse") {
      return { signal: "density", source, direction: "eases", strength: "slight", basis: "予定が少ない日は余白が出やすい", grounding: "general" };
    }
    return null;
  });

  // position_in_day（late=slight tightens のみ）
  note("position_in_day", snapshot.positionInDay, (source) => {
    if (snapshot.positionInDay!.value === "late") {
      return { signal: "position_in_day", source, direction: "tightens", strength: "slight", basis: "1日の後半は累積で際どくなりやすい", grounding: "general" };
    }
    return null;
  });

  // energy（低=notable tightens / 高=slight eases）
  note("energy", snapshot.energy, (source) => {
    const e = snapshot.energy!.value;
    if (e <= config.energyLowMax) {
      return { signal: "energy", source, direction: "tightens", strength: "notable", basis: "エネルギーが低めの日は負荷を感じやすい", grounding: "general" };
    }
    if (e >= config.energyHighMin) {
      return { signal: "energy", source, direction: "eases", strength: "slight", basis: "エネルギーが高めの日は動きやすい", grounding: "general" };
    }
    return null;
  });

  // travel_load（heavy=slight tightens / light=slight eases）
  note("travel_load", snapshot.travelLoad, (source) => {
    const lvl = snapshot.travelLoad!.value;
    if (lvl === "heavy") {
      return { signal: "travel_load", source, direction: "tightens", strength: "slight", basis: "移動が多い日は消耗しやすい", grounding: "general" };
    }
    if (lvl === "light") {
      return { signal: "travel_load", source, direction: "eases", strength: "slight", basis: "移動が少ない日はゆとりが出やすい", grounding: "general" };
    }
    return null;
  });

  // timeBand / dayType は記述のみ（tilt を出さない）。出所不明だけ記録。
  if (snapshot.timeBand && !isKnownSource(snapshot.timeBand.source)) ignoredUnknown.push("time_band");
  if (snapshot.dayType && !isKnownSource(snapshot.dayType.source)) ignoredUnknown.push("day_type");

  // ── 集約（定性 vote・偽数値なし） ──
  let tightenScore = 0;
  let easeScore = 0;
  let hasNotable = false;
  for (const f of factors) {
    if (f.direction === "tightens") {
      tightenScore += strengthWeight(f.strength);
    } else if (f.direction === "eases") {
      easeScore += strengthWeight(f.strength);
    }
    if (f.strength === "notable") hasNotable = true;
  }
  const knownSignalCount = factors.length;
  const net = tightenScore - easeScore;

  let overallTilt: OverallTilt;
  if (knownSignalCount === 0) {
    overallTilt = "unknown";
  } else if (net >= config.tiltNetThreshold) {
    overallTilt = "tighter_than_usual";
  } else if (net <= -config.tiltNetThreshold) {
    overallTilt = "easier_than_usual";
  } else {
    overallTilt = "as_usual";
  }

  // ★不確実性を広げる: mixed（条件が両方向を指す＝読みにくい）/ 薄い証拠 + notable / 薄い + 出所不明あり。
  const isMixed = tightenScore > 0 && easeScore > 0;
  const thin = knownSignalCount < 2;
  const widenUncertainty = isMixed || (thin && (hasNotable || ignoredUnknown.length > 0));

  return { factors, overallTilt, widenUncertainty, knownSignalCount, ignoredUnknown };
}

// ───────────────────────── reason builder（仮説トーン・source-cited・sensitive-free） ─────────────────────────

/** factor を読み手向けの短い条件語に。 */
function factorPhrase(f: ContextFactor): string {
  switch (f.signal) {
    case "weather":
      return f.basis.startsWith("雨") ? "雨" : "暑さ";
    case "density":
      return f.direction === "tightens" ? "予定の詰まり" : "予定の少なさ";
    case "position_in_day":
      return "後半の時間帯";
    case "energy":
      return f.direction === "tightens" ? "エネルギーの低さ" : "エネルギーの高さ";
    case "travel_load":
      return f.direction === "tightens" ? "移動の多さ" : "移動の少なさ";
    default:
      return "今日の条件";
  }
}

/**
 * ★A2-1 reason builder: modifier → 1 行の honest な reason（仮説トーン・source-cited・**sensitive-free**）。
 *   - 何も言えない（unknown / 条件なし）→ null（沈黙）。
 *   - 数値・確率・場所・同伴者を出さない。「あなたは」と断定せず「一般に〜しやすい」トーン。
 *   - widenUncertainty 優先（普段と違う日は「当てにくい」と正直に返す）。
 */
export function contextReasonLine(modifier: ContextModifier): string | null {
  if (modifier.knownSignalCount === 0) return null; // 出所のある条件なし → 沈黙

  // 普段と違う薄い/矛盾した条件 → 断定せず「当てにくい日」
  if (modifier.widenUncertainty && modifier.overallTilt !== "tighter_than_usual" && modifier.overallTilt !== "easier_than_usual") {
    return "今日は普段と少し違う条件なので、いつもの見立てが当てにくい日かもしれません。";
  }

  if (modifier.overallTilt === "tighter_than_usual") {
    const phrases = modifier.factors.filter((f) => f.direction === "tightens").slice(0, 2).map(factorPhrase);
    const cond = phrases.join("・");
    const tail = modifier.widenUncertainty ? "いつもより読みにくい日かもしれません。" : "普段より少し余白を見ておくと安心かもしれません。";
    return `今日は${cond}があるので、${tail}`;
  }

  if (modifier.overallTilt === "easier_than_usual") {
    const phrases = modifier.factors.filter((f) => f.direction === "eases").slice(0, 2).map(factorPhrase);
    const cond = phrases.join("・");
    return `今日は${cond}があるので、普段より少しゆとりがありそうです。`;
  }

  // as_usual（widen なし）→ 言うことなし
  return null;
}
