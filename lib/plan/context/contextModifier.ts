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
import type { DensityBaseline } from "@/lib/plan/context/contextBaseline"; // ★A2-4: 本人 baseline（type-only・循環なし）

// ───────────────────────── flag（default OFF） ─────────────────────────

/**
 * ★A2 context modifier flag。**dogfood 有効化（2026-06-09 CEO 判断）**で true。
 * ただし isContextModifierEnabled() の `process.env.NODE_ENV !== "production"` により
 * **production では発火しない**（dev/dogfood のみ ON）。production 露出は別途 CEO 判断。
 */
export const DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED = true;

/** context modifier を決定路に効かせてよいか（flag ON ∧ **非 production**）。production は hard block。 */
export function isContextModifierEnabled(): boolean {
  return DAY_REHEARSAL_CONTEXT_MODIFIER_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block（dogfood/dev のみ）
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

export type WeatherKind = "rain" | "snow" | "storm" | "heat" | "cold" | "normal";

const WEATHER_KINDS: ReadonlySet<string> = new Set<WeatherKind>(["rain", "snow", "storm", "heat", "cold", "normal"]);
/** WeatherKind の runtime guard（A2-10 capture / parse 用）。 */
export function isWeatherKind(v: unknown): v is WeatherKind {
  return typeof v === "string" && WEATHER_KINDS.has(v);
}

/**
 * ★A2-8: 移動負担を持つ天候 → 一般則 basis（仮説トーン）。雨/雪/荒天/暑さは tightens(slight・保守的)。
 * cold/normal は本 map に無い＝tilt なし（寒さ単独は移動を強く妨げない＝descriptive）。
 * ★全て slight（断定/警告を避ける）・偽数値なし・mode を変えない（day-level の注意のみ）。
 */
const WEATHER_TILT_BASIS: Partial<Record<WeatherKind, string>> = {
  rain: "雨の日は移動に余白が要りやすい（一般的傾向）",
  snow: "雪の日は移動に時間がかかりやすい（一般的傾向）",
  storm: "荒天の日は移動が乱れやすい（一般的傾向）",
  heat: "暑い日は移動で消耗しやすい（一般的傾向）",
};
export type DayType = "weekday" | "weekend";
export type DensityLevel = "sparse" | "balanced" | "packed";
export type PositionInDay = "early" | "mid" | "late";
export type TravelLoadLevel = "light" | "moderate" | "heavy";

export interface Sourced<T> {
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

const DENSITY_RANK: Record<DensityLevel, number> = { sparse: 0, balanced: 1, packed: 2 };

/**
 * ★A2-4: density factor を導出（pure）。baseline sufficient のとき **本人相対**化:
 *   today を本人の typical と比べた ordinal deviation で傾ける（typical と同じ → factor なし＝普段通り）。
 *   |delta|=2(sparse↔packed)→notable / =1→slight。denser→tightens / lighter→eases。grounding="personal"。
 * baseline 不在/insufficient → 一般則（packed→tightens/notable・sparse→eases/slight・grounding="general"）。
 */
function deriveDensityFactor(
  lvl: DensityLevel,
  source: ContextSource,
  baseline: DensityBaseline | undefined,
): ContextFactor | null {
  // 本人相対（baseline が本人の普段を十分示すとき）
  if (baseline && baseline.sufficient && baseline.typical) {
    const delta = DENSITY_RANK[lvl] - DENSITY_RANK[baseline.typical];
    if (delta === 0) return null; // あなたの普段通り → deviation でない＝語らない
    const strength: TiltStrength = Math.abs(delta) >= 2 ? "notable" : "slight";
    if (delta > 0) {
      return { signal: "density", source, direction: "tightens", strength, basis: "あなたにしては予定が多めの日です", grounding: "personal" };
    }
    return { signal: "density", source, direction: "eases", strength, basis: "あなたにしては予定が少なめの日です", grounding: "personal" };
  }
  // 一般則（baseline 不在/insufficient）
  if (lvl === "packed") {
    return { signal: "density", source, direction: "tightens", strength: "notable", basis: "予定が詰まった日は重なりやすい", grounding: "general" };
  }
  if (lvl === "sparse") {
    return { signal: "density", source, direction: "eases", strength: "slight", basis: "予定が少ない日は余白が出やすい", grounding: "general" };
  }
  return null;
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
  /**
   * ★A2-4: 本人 baseline（任意）。density を **この人の普段**基準で相対化する。
   * 不在/insufficient → 一般則（後方互換・既存挙動完全不変）。
   */
  baseline?: { readonly density?: DensityBaseline },
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

  // weather（A2-8: 雨/雪/荒天/暑さ → tightens slight・cold/normal は記述扱いで factor なし）
  note("weather", snapshot.weather, (source) => {
    const basis = WEATHER_TILT_BASIS[snapshot.weather!.value];
    if (!basis) return null; // cold/normal → tilt なし
    return { signal: "weather", source, direction: "tightens", strength: "slight", basis, grounding: "general" };
  });

  // density（A2-4: baseline sufficient なら本人相対・不在/insufficient なら一般則）
  note("density", snapshot.density, (source) => deriveDensityFactor(snapshot.density!.value, source, baseline?.density));

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
      if (f.basis.startsWith("雨")) return "雨";
      if (f.basis.startsWith("雪")) return "雪";
      if (f.basis.startsWith("荒天")) return "荒天";
      return "暑さ";
    case "density":
      // ★A2-4: personal grounding は本人相対のニュアンス（いつもより多め/少なめ）。
      if (f.grounding === "personal") return f.direction === "tightens" ? "いつもより多めの予定" : "いつもより少なめの予定";
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
