/**
 * Home Alter Adapter — 既存 Deep Alter を壊さずに Home 用の薄いレイヤーを追加
 *
 * Deep Alter: ソクラテス式・内省特化・助言禁止
 * Home Alter: 結論→根拠→次の一手の実用判断特化
 *
 * 同じ personality データを使うが、出力ポリシーを完全に差し替え、
 * さらに出力検査（形式 + 意味）+ 再生成の仕組みで品質を保証する。
 */

import type { AlterPersonality } from "./alter";
import { TRAIT_AXES } from "./traitAxes";
import type { TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Home から Alter API に渡す文脈データ */
export interface HomeAlterContextData {
  insight?: string | null;
  temporalDelta?: string | null;
  blindSpot?: string | null;
  prophecy?: string | null;
  prophecyAccuracy?: number | null;
  weather?: {
    emoji?: string;
    label?: string;
    message?: string;
  } | null;
  observationCount?: number;
  confidence?: number;
  archetype?: string | null;
}

/** Alter API が返す推論根拠 */
export interface AlterReasoningBasis {
  usedAxes: Array<{ axis: string; label: string; score: number; meaning: string }>;
  reasoningSummary: string;
  dataPoints: string[];
}

/** Home Alter 出力検査の結果 */
export interface HomeAlterValidation {
  pass: boolean;
  failures: string[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Force Balance + Action Shape
// 「攻めか守りか」ではなく「どんな形で動くか」を返す。
// グレーは曖昧ではなく、複数の力が同時に存在する状態。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1段目: 内部の力のバランス（連続量 0.0–1.0）
 * これが判断の「真の内部状態」。白黒はつけない。
 */
export interface ForceBalance {
  /** 進みたい力: 本人の欲求・興味・成長方向 */
  expand_pressure: number;
  /** 守りたい力: 消耗・リスク・今の負荷 */
  protect_pressure: number;
  /** 機会の価値: 今回それをやる意味 */
  opportunity_value: number;
  /** コスト負荷: 時間・体力・翌日影響 */
  cost_load: number;
  /** 可逆性: やっても戻せるか、途中でやめられるか (1.0=完全に可逆) */
  reversibility: number;
  /** やらない後悔の強さ */
  regret_if_skip: number;
  /** やる後悔の強さ */
  regret_if_do: number;
}

/**
 * 2段目: 力のバランスから選ばれる行動の「形」
 * stance (guard/conditional/push) の上位概念。
 * グレーゾーンを潰さず、解像度の高い行動提案を可能にする。
 */
export type ActionShape =
  | "full_go"              // 完全に行く / 全力でやる
  | "bounded_go"           // 時間・範囲を限定して行く
  | "prepare_then_go"      // 準備してから行く / 下書きしてから送る
  | "observe_first"        // 本人は動かず軽く様子を見る / 情報だけ集める
  | "defer_with_trigger"   // 今日は見送り、次の条件が揃えば行く
  | "skip";                // 今回はやめる

/** 旧互換: ログ・集計用の3分類 */
export type DecisionStance = "guard" | "conditional_forward" | "push";

// ActionShape → DecisionStance のマッピング（ログ・集計用）
const SHAPE_TO_STANCE: Record<ActionShape, DecisionStance> = {
  full_go: "push",
  bounded_go: "conditional_forward",
  prepare_then_go: "conditional_forward",
  observe_first: "conditional_forward",
  defer_with_trigger: "guard",
  skip: "guard",
};

export type OpportunityLevel = "low" | "medium" | "high";
export type CostLevel = "low" | "medium" | "high";
export type RelationLevel = "low" | "medium" | "high";
export type EnergyAdjustment = "protect" | "neutral" | "use_momentum";
export type RegretDirection = "go_regret" | "skip_regret" | "balanced";

export interface DecisionMetadata {
  /** 行動の形: 3分類ではなく「どう動くか」の解像度 */
  action_shape: ActionShape;
  /** 旧互換: ログ・集計用の3分類（action_shape から自動導出） */
  decision_stance: DecisionStance;
  /** 内部の力のバランス（判断の根拠を透明化） */
  force_balance: ForceBalance;
  /** 機会価値 */
  opportunity_value: OpportunityLevel;
  /** コスト負荷 */
  cost_load: CostLevel;
  /** 関係性の強さ */
  relation_value: RelationLevel;
  /** エネルギー方針 */
  energy_adjustment: EnergyAdjustment;
  /** 後悔方向 */
  regret_direction: RegretDirection;
  /** 成長方向と矛盾する判断をしたか */
  growth_vector_override: boolean;
}

/**
 * ForceBalance から ActionShape を決定する。
 * 白黒を押し付けるのではなく、力の釣り合いから
 * 「いちばん後悔が少なく、いちばん本人らしく進める形」を選ぶ。
 */
export function resolveActionShape(fb: ForceBalance): ActionShape {
  const netExpand = fb.expand_pressure + fb.opportunity_value + fb.regret_if_skip;
  const netProtect = fb.protect_pressure + fb.cost_load + fb.regret_if_do;
  const ratio = netExpand / (netExpand + netProtect + 0.001); // 0-1

  // 可逆性が高ければ bounded/observe が安全に選べる
  const canRetreat = fb.reversibility > 0.6;

  if (ratio > 0.7) {
    // 進む力が圧倒的 → full_go
    return "full_go";
  }
  if (ratio > 0.55 && canRetreat) {
    // 進む力がやや優勢 + 途中で戻せる → bounded_go
    return "bounded_go";
  }
  if (ratio > 0.55 && !canRetreat) {
    // 進む力がやや優勢だが不可逆 → 準備してから
    return "prepare_then_go";
  }
  if (ratio > 0.48 && ratio <= 0.55) {
    // 狭い拮抗帯 → まず様子を見る
    // 以前は 0.4-0.55 だったが、この帯が広すぎて observe_first に集中していた
    return "observe_first";
  }
  if (ratio > 0.35) {
    // 守りがやや優勢 → 条件付き先送り
    return "defer_with_trigger";
  }
  if (ratio > 0.2) {
    // 守りが優勢 → skip
    return "skip";
  }
  // 守りが圧倒的 → skip
  return "skip";
}

/** ActionShape の日本語ラベル（プロンプト注入用） */
const ACTION_SHAPE_LABELS: Record<ActionShape, string> = {
  full_go: "完全に行く / 全力でやる",
  bounded_go: "時間・範囲を限定して行く（例: 1時間だけ、最初だけ）",
  prepare_then_go: "準備してから行く（例: 下書きしてから送る、条件を決めてから参加）",
  observe_first: "本人は動かず様子を見る（例: 情報だけ集める、相手の出方を待つ）",
  defer_with_trigger: "今日は見送り、条件が揃えば次に行く（例: 体調が戻ったら、相手から連絡が来たら）",
  skip: "今回はやめる（例: 断る、離れる、休む）",
};

const VALID_SHAPES: ActionShape[] = ["full_go", "bounded_go", "prepare_then_go", "observe_first", "defer_with_trigger", "skip"];
const VALID_STANCES: DecisionStance[] = ["guard", "conditional_forward", "push"];
const VALID_OPP: OpportunityLevel[] = ["low", "medium", "high"];
const VALID_COST: CostLevel[] = ["low", "medium", "high"];
const VALID_RELATION: RelationLevel[] = ["low", "medium", "high"];
const VALID_ENERGY: EnergyAdjustment[] = ["protect", "neutral", "use_momentum"];
const VALID_REGRET: RegretDirection[] = ["go_regret", "skip_regret", "balanced"];

const DECISION_META_RE = /---DECISION_META---\s*([\s\S]*?)\s*---END_META---/;

// ━━━━ 共通シグナルパターン（inferActionShapeFromText + reconcileDecisionMetadata 共用） ━━━━
const SHAPE_SIGNAL_PATTERNS = {
  skip: /見送っていい|見送る|やめ[たてろ]|断[りる]|今回はやめる|今回は.*やめ|見送った方が/,
  defer: /今日じゃなく|次[はの].*条件|体調.*戻[るっ]|また.*機会/,
  observe: /様子.*見|情報.*集め|確認してから|聞いてから/,
  prep: /下書き|整理してから|準備|メモ.*してから|計画.*立て/,
  bounded: /短時間|[0-9１-９]時間だけ|顔.*出す|最低限|一次会|限定|だけ参加/,
  full: /行った方がいい|送った方がいい|引き受け|全力|フルで|積極的に|ぜひ/,
} as const;

/**
 * 応答テキストから action_shape を推定する（メタデータブロックがない場合のフォールバック）。
 * reconcileDecisionMetadata と同じシグナルパターンを使う。
 */
function inferActionShapeFromText(text: string): ActionShape | null {
  const hasSkip = SHAPE_SIGNAL_PATTERNS.skip.test(text);
  const hasDefer = SHAPE_SIGNAL_PATTERNS.defer.test(text);
  const hasObserve = SHAPE_SIGNAL_PATTERNS.observe.test(text);
  const hasPrep = SHAPE_SIGNAL_PATTERNS.prep.test(text);
  const hasBounded = SHAPE_SIGNAL_PATTERNS.bounded.test(text);
  const hasFull = SHAPE_SIGNAL_PATTERNS.full.test(text);

  // 優先順位: skip（明確な否定） > bounded（限定参加） > prep（準備後実行）
  //         > full（全力） > defer（条件付き延期） > observe（様子見）
  if (hasSkip && !hasBounded && !hasFull) return "skip";
  if (hasBounded && !hasSkip) return "bounded_go";
  if (hasPrep && !hasFull) return "prepare_then_go";
  if (hasFull && !hasSkip && !hasBounded) return "full_go";
  if (hasDefer && !hasFull && !hasBounded) return "defer_with_trigger";
  if (hasObserve) return "observe_first";
  return null;
}

/**
 * LLM 応答から判断メタデータブロックをパースし、本文と分離する。
 * メタデータがない場合はテキストからの推定を試み、それも不可なら metadata: null を返す。
 */
export function parseDecisionMetadata(raw: string): {
  responseText: string;
  metadata: DecisionMetadata | null;
} {
  const match = raw.match(DECISION_META_RE);
  if (!match) {
    // メタデータブロックがない場合、本文からaction_shapeを推定
    const textShape = inferActionShapeFromText(raw);
    if (textShape) {
      const dummyFb: ForceBalance = {
        expand_pressure: 0.5, protect_pressure: 0.5,
        opportunity_value: 0.5, cost_load: 0.5,
        reversibility: 0.5, regret_if_skip: 0.5, regret_if_do: 0.5,
      };
      return {
        responseText: raw,
        metadata: {
          action_shape: textShape,
          decision_stance: SHAPE_TO_STANCE[textShape],
          force_balance: dummyFb,
          opportunity_value: "medium",
          cost_load: "medium",
          relation_value: "medium",
          energy_adjustment: "neutral",
          regret_direction: "balanced",
          growth_vector_override: false,
        },
      };
    }
    return { responseText: raw, metadata: null };
  }

  const responseText = raw.replace(DECISION_META_RE, "").trim();

  const block = match[1]!;
  const fields: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) fields[kv[1]!] = kv[2]!.trim();
  }

  const shape = fields["action_shape"] as ActionShape | undefined;
  const opp = fields["opportunity_value"] as OpportunityLevel | undefined;
  const cost = fields["cost_load"] as CostLevel | undefined;
  const relation = fields["relation_value"] as RelationLevel | undefined;
  const energy = fields["energy_adjustment"] as EnergyAdjustment | undefined;
  const regret = fields["regret_direction"] as RegretDirection | undefined;
  const override = fields["growth_vector_override"];

  // action_shape が必須、他は best-effort
  if (!shape || !VALID_SHAPES.includes(shape)) {
    return { responseText, metadata: null };
  }

  // ForceBalance は LLM に出させない（前処理で確定済み）→ ダミー値
  const dummyFb: ForceBalance = {
    expand_pressure: 0.5, protect_pressure: 0.5,
    opportunity_value: 0.5, cost_load: 0.5,
    reversibility: 0.5, regret_if_skip: 0.5, regret_if_do: 0.5,
  };

  return {
    responseText,
    metadata: {
      action_shape: shape,
      decision_stance: SHAPE_TO_STANCE[shape],
      force_balance: dummyFb, // 後で reconcile で上書きされる
      opportunity_value: (opp && VALID_OPP.includes(opp)) ? opp : "medium",
      cost_load: (cost && VALID_COST.includes(cost)) ? cost : "medium",
      relation_value: (relation && VALID_RELATION.includes(relation)) ? relation : "medium",
      energy_adjustment: (energy && VALID_ENERGY.includes(energy)) ? energy : "neutral",
      regret_direction: (regret && VALID_REGRET.includes(regret)) ? regret : "balanced",
      growth_vector_override: override === "true",
    },
  };
}

/**
 * JudgmentFramework から ForceBalance（連続量）を計算する。
 * これが判断の内部状態。白黒はつけない。
 * queryContext がある場合、urgency/stake/reversibility を注入して
 * 性格バイアスだけでなく状況の圧力も反映する。
 */
export function computeForceBalance(
  framework: JudgmentFramework,
  queryContext?: QueryContext | null,
  relationalLens?: RelationalLens | null,
): ForceBalance {
  // expand_pressure: 成長方向が「広げる」「挑戦」「試す」なら高い
  let expand = 0.5;
  if (/広げること|挑戦|試すこと|小さく広げる|やるなら今/.test(framework.growthVector)) expand = 0.8;
  else if (/慣らす|軽く試す|無理のない範囲/.test(framework.growthVector)) expand = 0.4;
  else if (/守ること|絞ること|意識的に/.test(framework.growthVector)) expand = 0.2;

  // protect_pressure: 状態が悪い・閉じ気味なら高い
  let protect = 0.5;
  if (/エネルギーは低め|不安定/.test(framework.growthVector)) protect = 0.7;
  if (/守ること|絞ること|散らかりすぎ/.test(framework.growthVector)) protect = 0.8;
  if (/安定|好調/.test(framework.growthVector)) protect = 0.2;

  // opportunity_value: フレームワークのマーカーから
  let oppVal = 0.5;
  if (framework.opportunityValue.includes("【高価値】")) oppVal = 0.9;
  else if (framework.opportunityValue.includes("【低価値】")) oppVal = 0.1;
  else if (framework.opportunityValue.includes("【対人グレー】")) oppVal = 0.45;

  // cost_load
  let costVal = 0.5;
  if (framework.costLoad.includes("【高コスト】")) costVal = 0.85;
  else if (framework.costLoad.includes("【低コスト】")) costVal = 0.15;

  // reversibility: コストが低い or 「短時間」系 → 高い
  // コストが高い → 低い（途中で抜けにくい）
  const reversibility = 1.0 - costVal * 0.8; // costが高いほど不可逆

  // regret
  let regretSkip = 0.5;
  let regretDo = 0.5;
  if (/やらなかった後悔/.test(framework.regretDirection)) { regretSkip = 0.8; regretDo = 0.3; }
  else if (/やりすぎた後悔/.test(framework.regretDirection)) { regretSkip = 0.3; regretDo = 0.8; }

  // relation_value で微調整
  if (framework.relationValue.includes("【薄い関係】")) { oppVal *= 0.7; regretSkip *= 0.6; }
  else if (framework.relationValue.includes("【強い関係】")) { oppVal = Math.min(oppVal * 1.2, 1.0); }
  // 関係維持コスト: 薄いが断りにくい → 少し戻す
  if (framework.relationValue.includes("【関係維持コスト】")) { oppVal = Math.max(oppVal, 0.35); }

  // ── P2-3: queryContext + relationalLens から状況圧力を注入 ──
  // 性格だけでなく、質問固有の urgency/stake/reversibility/risk_direction で補正
  // 調整量は大きめ: 性格バイアスだけで observe_first に固定されることを防ぐ
  let finalReversibility = reversibility;
  if (queryContext) {
    const hv = queryContext.hidden_variables;

    // urgency: immediate → 行動圧力を大幅UP
    if (hv.urgency === "immediate") {
      expand += 0.25;
      protect -= 0.15;
      regretSkip += 0.15;
    } else if (hv.urgency === "soon") {
      expand += 0.12;
      regretSkip += 0.05;
    }

    // emotional_stake: high → 拮抗を崩す（方向は oppVal で決まる）
    if (hv.emotional_stake === "high") {
      if (oppVal >= 0.5) {
        expand += 0.2;
        regretSkip += 0.15;
      } else {
        protect += 0.2;
        regretDo += 0.15;
      }
    } else if (hv.emotional_stake === "low") {
      // 低ステーク → 軽く進む方向へ
      expand += 0.1;
      protect -= 0.1;
    }

    // reversibility: 不可逆 → 慎重方向、可逆 → 行動方向
    if (hv.reversibility === "irreversible") {
      finalReversibility = Math.min(finalReversibility, 0.2);
      protect += 0.15;
    } else if (hv.reversibility === "reversible") {
      finalReversibility = Math.max(finalReversibility, 0.75);
      expand += 0.1;
    }

    // ── コスト: 低コスト質問は行動バリアを下げる ──
    // costVal=0.15(低コスト)なら expand をさらに押す
    if (costVal < 0.3) {
      expand += 0.1;
    }

    // ── 対人グレー: oppVal=0.45 の拮抗状態を崩す ──
    // 謝罪・境界設定・再接続 → 行動側に寄せる（先延ばしが悪化を招く）
    if (oppVal >= 0.35 && oppVal <= 0.55) {
      if (hv.social_risk === "high") {
        expand += 0.08;
      }
    }
  }

  // ── relationalLens の risk_direction で最終調整 ──
  if (relationalLens) {
    if (relationalLens.risk_direction === "skip_risky") {
      expand += 0.3;
      regretSkip += 0.2;
    } else if (relationalLens.risk_direction === "do_risky") {
      protect += 0.3;
      regretDo += 0.2;
    }
    // 対人行動 + 目的明確（謝罪/再接続/境界設定） → 先延ばしが悪化招くので行動寄り
    if (relationalLens.involves_other && relationalLens.interaction_purpose !== "unknown") {
      const actionPurposes = ["apologize", "reconnect", "boundary", "confess", "help"];
      if (actionPurposes.includes(relationalLens.interaction_purpose)) {
        expand += 0.1;
      }
    }
  }

  // ── 質問に判断意図がある場合 → 行動寄り ──
  // 「どうすべき？」と聞いている = 動く準備はある ≠ 様子見したい
  if (queryContext && queryContext.information.score >= 0.2) {
    expand += 0.12;
  }

  // ── role 単体でのバイアス（risk_direction が unknown でも） ──
  // 義務的関係（上司/先輩/取引先/家族）→ 行動プレッシャーがある
  if (relationalLens && relationalLens.risk_direction === "unknown" && relationalLens.involves_other) {
    const obligationRoles: string[] = ["boss", "senior", "client", "family", "partner"];
    if (obligationRoles.includes(relationalLens.target_role)) {
      expand += 0.15;
      regretSkip += 0.1;
    }
  }

  return {
    expand_pressure: Math.max(0, Math.min(1, expand)),
    protect_pressure: Math.max(0, Math.min(1, protect)),
    opportunity_value: Math.max(0, Math.min(1, oppVal)),
    cost_load: Math.max(0, Math.min(1, costVal)),
    reversibility: Math.max(0, Math.min(1, finalReversibility)),
    regret_if_skip: Math.max(0, Math.min(1, regretSkip)),
    regret_if_do: Math.max(0, Math.min(1, regretDo)),
  };
}

/**
 * 本文テキストから action_shape を推定し、
 * LLM の metadata とズレがあれば本文側に寄せる。
 */
export function reconcileDecisionMetadata(
  responseText: string,
  metadata: DecisionMetadata,
): DecisionMetadata {
  const result = { ...metadata, force_balance: { ...metadata.force_balance } };
  const text = responseText;

  // 本文から action_shape を推定（共通パターンを使用）
  const textShape = inferActionShapeFromText(text);

  // 本文推定とmetadataが大きくズレている場合、本文側に寄せる
  if (textShape && textShape !== result.action_shape) {
    const shapeOrder: Record<ActionShape, number> = {
      skip: 0, defer_with_trigger: 1, observe_first: 2,
      prepare_then_go: 3, bounded_go: 4, full_go: 5,
    };
    const diff = Math.abs(shapeOrder[result.action_shape] - shapeOrder[textShape]);
    if (diff >= 3) {
      // 大きなズレ → 本文を信頼
      result.action_shape = textShape;
    } else if (diff >= 2 && (textShape === "skip" || textShape === "full_go")) {
      // skip/full_go は明確な意図 → 信頼
      result.action_shape = textShape;
    }
  }

  // 構造的整合: relation=low の場合の調整
  if (result.relation_value === "low") {
    if (result.opportunity_value === "low") {
      // 低価値 + 薄い関係 → skip か defer に強制
      const guardShapes: ActionShape[] = ["skip", "defer_with_trigger"];
      if (!guardShapes.includes(result.action_shape)) {
        result.action_shape = "skip";
      }
    } else if (result.opportunity_value === "medium") {
      // 中価値 + 薄い関係 → full_go は禁止、bounded_go は許容
      if (result.action_shape === "full_go") {
        result.action_shape = "bounded_go";
      }
    }
    // high は制限なし（関係は薄くても機会価値が高い）
  }

  // cost=high → full_go 禁止、bounded_go は opp=high なら許容
  if (result.cost_load === "high") {
    if (result.action_shape === "full_go") {
      result.action_shape = result.opportunity_value === "high" ? "bounded_go" : "defer_with_trigger";
    }
    // cost=high + opp≠high → bounded_go/prepare も守りに寄せる
    if (
      result.opportunity_value !== "high" &&
      (result.action_shape === "bounded_go" || result.action_shape === "prepare_then_go")
    ) {
      result.action_shape = "defer_with_trigger";
    }
  }

  // stance を action_shape から再導出
  result.decision_stance = SHAPE_TO_STANCE[result.action_shape];

  if (result.decision_stance !== metadata.decision_stance || result.action_shape !== metadata.action_shape) {
    result.growth_vector_override = true;
  }

  return result;
}

/**
 * LLM がメタデータを出力しなかった場合のフォールバック計算。
 * ForceBalance → ActionShape → DecisionMetadata を決定論的に計算する。
 */
export function computeFallbackDecisionMetadata(
  framework: JudgmentFramework,
): DecisionMetadata {
  // 離散ラベル
  let opp: OpportunityLevel = "medium";
  if (framework.opportunityValue.includes("【高価値】")) opp = "high";
  else if (framework.opportunityValue.includes("【低価値】")) opp = "low";

  let cost: CostLevel = "medium";
  if (framework.costLoad.includes("【高コスト】")) cost = "high";
  else if (framework.costLoad.includes("【低コスト】")) cost = "low";

  let relation: RelationLevel = "medium";
  if (framework.relationValue.includes("【強い関係】")) relation = "high";
  else if (framework.relationValue.includes("【薄い関係】")) relation = "low";

  let energy: EnergyAdjustment = "neutral";
  if (/守ること|絞ること/.test(framework.growthVector)) energy = "protect";
  else if (/挑戦|広げること/.test(framework.growthVector)) energy = "use_momentum";

  let regret: RegretDirection = "balanced";
  if (/やらなかった後悔/.test(framework.regretDirection)) regret = "skip_regret";
  else if (/やりすぎた後悔/.test(framework.regretDirection)) regret = "go_regret";

  // ForceBalance を計算（fallback なので queryContext なし）
  const fb = computeForceBalance(framework, null);

  // ActionShape を決定
  const shape = resolveActionShape(fb);

  const growthWantsExpand = /広げること|挑戦/.test(framework.growthVector);
  const growthWantsProtect = /守ること|絞ること/.test(framework.growthVector);
  const growth_vector_override =
    (opp === "low" && growthWantsExpand) ||
    (opp === "high" && growthWantsProtect) ||
    (opp === "high" && cost === "high");

  return {
    action_shape: shape,
    decision_stance: SHAPE_TO_STANCE[shape],
    force_balance: fb,
    opportunity_value: opp,
    cost_load: cost,
    relation_value: relation,
    energy_adjustment: energy,
    regret_direction: regret,
    growth_vector_override: growth_vector_override,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A. 質問カテゴリ分類 → fact ranking → 結論型 → 行動 slot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type QuestionCategory =
  | "gathering"   // 飲み会・集まり・パーティ
  | "outfit"      // 服・コーデ・着る
  | "contact"     // 連絡・メッセージ・LINE・メール
  | "work"        // 仕事・タスク・進め方
  | "cause"       // 最近なんで・なぜ・原因
  | "general";    // その他

/** fact のタグ。ranking で使う */
type FactTag =
  | "social_load"        // 対人負荷、場に合わせやすさ
  | "energy_state"       // エネルギー状態、内面天気
  | "decision_speed"     // 迷いやすさ、判断速度
  | "impulse_caution"    // 衝動 vs 慎重
  | "scatter_focus"      // 散りやすさ、完遂傾向
  | "change_stress"      // 変化ストレス
  | "temporal"           // 最近の変化
  | "insight"            // 今日のインサイト
  | "blindspot"          // 盲点
  | "prophecy"           // 予測
  | "core_wound"         // 根っこの恐れ
  | "personality_blind"  // 性格盲点
  | "other";

type TaggedFact = { text: string; tags: FactTag[] };

/** カテゴリごとに優先する fact tag の順序 */
const CATEGORY_FACT_PRIORITY: Record<QuestionCategory, FactTag[]> = {
  gathering:  ["social_load", "energy_state", "blindspot", "temporal", "insight"],
  outfit:     ["decision_speed", "energy_state", "scatter_focus", "insight", "blindspot"],
  contact:    ["impulse_caution", "blindspot", "energy_state", "temporal", "insight"],
  work:       ["scatter_focus", "decision_speed", "temporal", "insight", "change_stress"],
  cause:      ["temporal", "insight", "blindspot", "core_wound", "energy_state"],
  general:    ["energy_state", "insight", "temporal", "blindspot", "decision_speed"],
};

/** カテゴリごとの結論テンプレ（守り〜攻めまで含む） */
const CATEGORY_CONCLUSION_SLOTS: Record<QuestionCategory, string[]> = {
  gathering: [
    "[今の状態/傾向の理由]だからこそ、行った方がいい",
    "[今の状態/傾向の理由]なので、短時間だけ顔を出すのが合っている",
    "[今の状態/傾向の理由]だから、今日は見送った方が後が楽",
  ],
  outfit: [
    "[今の状態/傾向の理由]なので、1点だけ変化を足すのが合っている",
    "[今の状態/傾向の理由]だから、迷わず安全圏で決めるのが合っている",
    "[今の状態/傾向の理由]なので、今日の予定に合わせて軸を1つ決めて選ぶのがよさそう",
  ],
  contact: [
    "[この人の傾向の理由]なので、今日中に送った方が後が楽",
    "[この人の傾向の理由]だから、下書きしてから送る方が合っている",
    "[この人の傾向の理由]を考えると、今日は送らない方がいい",
  ],
  work: [
    "方向は合っているが、[この人の傾向]が気になる",
    "[この人の傾向の理由]なので、一度立ち止まった方がいい",
    "[今の状態/傾向の理由]だから、やり方を変えて試す価値がある",
  ],
  cause: [
    "たぶん、〜ことが原因（原因仮説 + この人の傾向を理由に断言）",
    "正直に言うと、〜が重なっている（複合原因 + 影の本音）",
  ],
  general: [
    "今日の[この人の名前]は、[判断軸]を優先した方がぶれない",
    "[今の状態/傾向の理由]だからこそ、あえて〜を試す価値がある",
    "[今の状態/傾向の理由]なので、〜は見送った方が後が楽",
  ],
};

/** 次の一手の slot テンプレ（いつ / 何を / どの数だけ） */
const CATEGORY_ACTION_SLOTS: Record<QuestionCategory, string> = {
  gathering:  "次の一手: [今日中に] [判断基準を2つだけ] [確認してみるのがよさそうです]",
  outfit:     "次の一手: [今すぐ] [手持ちの中から1セット] [選んでみるのがよさそうです]",
  contact:    "次の一手: [今から] [伝えたいことを3行だけ] [書き出してみるのがよさそうです]",
  work:       "次の一手: [今日中に] [最も気になる1点だけ] [メモしてみるのがよさそうです]",
  cause:      "次の一手: [今日から3回だけ] [そうなった場面を] [一言で残してみるのがよさそうです]",
  general:    "次の一手: [今日中に] [1つだけ] [試してみるのがよさそうです]",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// B. 判断フレームワーク: 4軸アセスメント
//    傾向 × 現在状態 × 成長方向 × 機会価値 × 後悔方向
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type JudgmentFramework = {
  /** 今この人に必要なのは守ること/広げること/慣らすこと/挑戦すること */
  growthVector: string;
  /** この人がなりたい姿・大事にしていること */
  identityFit: string;
  /** 後悔しやすい方向 */
  regretDirection: string;
  /** 判断の基本姿勢 */
  judgmentStance: string;
  /** 質問から推定した機会価値 */
  opportunityValue: string;
  /** 質問から推定したコスト負荷 */
  costLoad: string;
  /** 質問から推定した関係性の強さ */
  relationValue: string;
};

/**
 * personality + homeContext + 質問文 から判断フレームワーク（5軸アセスメント）を事前計算する。
 * LLM に「状態が悪い→回避」と短絡させないために、
 * 成長方向・後悔方向・機会判断の基準を明示する。
 * 同時に、質問の機会価値を事前推定し、「低価値イベントにまで攻める」ことを防ぐ。
 */
export function buildJudgmentFramework(
  personality: AlterPersonality,
  homeContext?: HomeAlterContextData | null,
  userMessage?: string,
): JudgmentFramework {
  const scores = personality.axisScores;

  // ── growth_vector: 最近の変化 + 傾向から「今必要なこと」を判定 ──
  let growthVector: string;
  const delta = homeContext?.temporalDelta ?? "";
  const weatherLabel = homeContext?.weather?.label ?? "";
  const isLowEnergy = /不安定|低め|疲|落ち/.test(weatherLabel);
  const isClosing = /自信.*なく|閉じ|減って|下がっ|消極/.test(delta);
  const isScattering = /広げ|散り|増え.*すぎ|手を出し/.test(delta);
  const isStable = /安定|好調|充実|ポジティブ/.test(weatherLabel + delta);

  // 性格傾向も加味して成長方向を精度アップ
  const boldScore = scores.cautious_vs_bold ?? 0.5;
  const changeScore = scores.change_embrace_vs_resist ?? 0.5;
  const isCautiousType = boldScore < 0.4;
  const isBoldType = boldScore > 0.6;

  if (isClosing) {
    if (isCautiousType) {
      growthVector = "最近は閉じ気味で、元々慎重なタイプなので停滞しやすい状態。今は「小さく広げること」「軽く試すこと」が特に必要なフェーズ。安全策ばかりだと後悔が溜まる";
    } else {
      growthVector = "最近は閉じ気味。今は「広げること」「試すこと」が必要なフェーズ。安全策ばかりだと停滞する";
    }
  } else if (isScattering) {
    if (isBoldType) {
      growthVector = "最近は広げすぎで、元々行動的なタイプなので散らかりやすい状態。今は意識的に「守ること」「絞ること」が必要なフェーズ。新しいことより既存を固める時期";
    } else {
      growthVector = "最近は広げすぎ。今は「守ること」「絞ること」が必要なフェーズ。新しいことより既存を固める時期";
    }
  } else if (isStable && !isLowEnergy) {
    growthVector = "状態は安定している。今は「挑戦すること」に適したフェーズ。少し無理しても回復できる余力がある";
  } else if (isLowEnergy && !isClosing) {
    growthVector = "エネルギーは低めだが、閉じているわけではない。「慣らすこと」が合うフェーズ。全力ではなく軽く試す";
  } else {
    // フォールバック: 性格傾向からデフォルト方向を推定
    if (isCautiousType && changeScore < 0.4) {
      growthVector = "変化データが少ないが、慎重で安定志向のタイプ。「無理のない範囲で試す」方向が合いやすい";
    } else if (isBoldType && changeScore > 0.6) {
      growthVector = "変化データが少ないが、行動的で変化を好むタイプ。「やるなら今」の判断が合いやすい。ただし散らかりすぎに注意";
    } else {
      growthVector = "今のフェーズは状況次第。質問の機会価値を見て、守るか踏み出すか判断する";
    }
  }

  // ── identity_fit: 性格構造から「この人が大事にしていること」を言語化 ──
  const identityParts: string[] = [];
  const socialScore = scores.introvert_vs_extrovert ?? scores.individual_vs_social ?? 0.5;
  const harmonyScore = scores.independence_vs_harmony ?? 0.5;
  // boldScore, changeScore は上で定義済み

  if (socialScore < 0.4) {
    identityParts.push("深い1対1の関係を重視する人");
  } else if (socialScore > 0.6) {
    identityParts.push("人とのつながりからエネルギーを得る人");
  }
  if (harmonyScore < 0.4) {
    identityParts.push("自分の軸を大事にする人");
  } else if (harmonyScore > 0.6) {
    identityParts.push("周囲との調和を大事にする人");
  }
  if (changeScore < 0.4) {
    identityParts.push("安定の中で力を発揮するタイプだが、新しい経験が成長の鍵になる");
  } else if (changeScore > 0.6) {
    identityParts.push("変化を楽しめるが、散らかりすぎると本来の力が出ない");
  }
  if (personality.coreWoundShort) {
    identityParts.push(`根底にある恐れ「${personality.coreWoundShort}」が判断を歪めやすい。だからこそ、恐れに支配されない選択が本人らしい選択`);
  }

  const identityFit = identityParts.length > 0
    ? identityParts.join("。")
    : "この人の核心的な価値観はまだ観測中";

  // ── regret_direction: この人が後悔しやすい方向 ──
  let regretDirection: string;
  if ((boldScore < 0.4) && (socialScore < 0.4)) {
    regretDirection = "後悔の傾向: 見送った選択を後から気にしやすい。ただしこれだけを根拠にしない（機会価値・コスト・関係性を必ず先に見ること）";
  } else if ((boldScore > 0.6) || (socialScore > 0.6)) {
    regretDirection = "この人は「やりすぎた後悔」に注意が必要。衝動的に動くと「あの時もう少し考えればよかった」と思いやすい";
  } else {
    regretDirection = "後悔の方向は状況次第。「行って後悔するか」「行かなくて後悔するか」を質問ごとに見極める必要がある";
  }

  // ── judgment_stance: 総合判断姿勢 ──
  let judgmentStance: string;
  if (isClosing && !isScattering) {
    judgmentStance = "今のこの人には「あえて踏み出す」提案が必要な場合がある。状態が悪い＝見送り、と短絡しないこと。機会価値が高ければ、限定的な参加や軽い挑戦を提案する";
  } else if (isScattering) {
    judgmentStance = "今のこの人には「絞る」「守る」提案が有効。ただし、それが逃げではなく戦略的撤退であることを明示する";
  } else {
    judgmentStance = "状態と機会価値のバランスで判断する。「安全だからこう」だけでなく「今回はあえてこうする価値がある」まで踏み込む";
  }

  // ── opportunity_value: 質問文から機会価値を事前推定 ──
  let opportunityValue: string;
  const msg = userMessage ?? "";

  // 高価値シグナル: 特定の人物・成長機会・関係深化のチャンス
  const highValueSignals = /気にな[るっ]|好き|尊敬|大事|大切|憧れ|チャンス|面白[いそ]|新しい.*プロジェクト|誘[わい]れた.*久しぶり|初めて|一度しか/;
  // 低価値シグナル: 義務・無関心・既知の消耗パターン
  const lowValueSignals = /付き合い|義務|興味な[いく]|知らない人|なんとなく|惰性|仕方な[いく]|面倒|だるい|SNS.*落ち込|特に理由/;
  // 対人負荷シグナル: 関係の難しさ
  const tensionSignals = /気まず[いく]|微妙|謝[りる]|揉め|喧嘩|ぎくしゃく|距離.*置/;

  const hasHighValue = highValueSignals.test(msg);
  const hasLowValue = lowValueSignals.test(msg);
  const hasTension = tensionSignals.test(msg);

  if (hasHighValue && !hasLowValue) {
    opportunityValue = "【高価値】この機会は価値が高い。状態が悪くても、限定的にでも参加・行動する価値がある。「短時間だけ参加」「まず1歩だけ」が最善手になりうる";
  } else if (hasLowValue && !hasHighValue) {
    opportunityValue = "【低価値】この機会は消耗にしかならない可能性が高い。「広げるフェーズ」でも、この場は守りが最善。見送り・断り・回復を優先する結論を出すこと。「短時間だけ顔を出す」は不要";
  } else if (hasTension) {
    opportunityValue = "【対人グレー】対人的に微妙な場面。完全回避でも完全突入でもなく、条件付き・段階的な対応が最善。下準備してから・時間を限定して、が適切";
  } else {
    opportunityValue = "【要判断】機会価値は質問内容から判断すること。「広げるフェーズだから」だけで攻めに倒さないこと";
  }

  // ── cost_load: 行動のコスト（時間・体力・翌日影響）を事前推定 ──
  let costLoad: string;
  const highCostSignals = /[2-9]時間|半日|一日|拘束|遠[いく]|移動.*長|朝早|終電|泊|体力|明日.*仕事|明日.*大事|明日.*プレゼン|明日.*朝|連日|詰まっ/;
  const lowCostSignals = /短[いく]|すぐ|1[行通件]|一言|軽[いく]|ちょっと|返信|メッセージ|LINE|メール|連絡/;

  const hasHighCost = highCostSignals.test(msg);
  const hasLowCost = lowCostSignals.test(msg);

  if (hasHighCost && !hasLowCost) {
    costLoad = "【高コスト】時間的・体力的な負荷が大きい。高価値でも全力参加は推奨しない。「短時間だけ」「条件付き」が現実的。翌日への影響も考慮すること";
  } else if (hasLowCost && !hasHighCost) {
    costLoad = "【低コスト】行動のコストは低い。踏み出すハードルが低いので、価値があるなら実行してみるのが合っている";
  } else {
    costLoad = "【中コスト】行動のコストは標準的。機会価値と状態に応じて判断すること";
  }

  // ── relation_value: 関係性の強さ・参加理由の強度を事前推定 ──
  let relationValue: string;
  const strongRelationSignals = /尊敬|親友|恋人|好き|大事|大切|憧れ|上司|先輩.*久|仲[がの]いい|信頼|家族|パートナー/;
  const weakRelationSignals = /知らない人|友達の友達|特に理由|なんとなく|義理|付き合い|断っても|誰か[がの]|よく知らな/;
  // 関係悪化リスク: 薄い関係だが断りにくい
  const consequenceSignals = /断[れっ].*ない|関係.*悪[くい]|角.*立|空気.*読/;

  const hasStrongRelation = strongRelationSignals.test(msg);
  const hasWeakRelation = weakRelationSignals.test(msg);
  const hasConsequence = consequenceSignals.test(msg);

  if (hasStrongRelation) {
    relationValue = "【強い関係】大事な相手・深い関係。この関係性自体が機会価値を高める";
  } else if (hasWeakRelation && !hasConsequence) {
    relationValue = "【薄い関係】関係性が弱く、参加理由も薄い。断っても影響は小さい。守りの判断を後押しする材料";
  } else if (hasConsequence) {
    relationValue = "【関係維持コスト】関係自体は薄いが、断ると社会的コストが発生する可能性がある。条件付き参加で最低限のコスト管理が適切";
  } else {
    relationValue = "【普通の関係】関係性は標準的。機会価値と状態で判断すること";
  }

  return { growthVector, identityFit, regretDirection, judgmentStance, opportunityValue, costLoad, relationValue };
}

/**
 * ユーザーの質問からカテゴリを判定する
 */
export function classifyQuestion(message: string): QuestionCategory {
  const m = message.toLowerCase();
  if (/飲み会|集まり|パーティ|飲み|宴会|食事会|誘[わい]/.test(m)) return "gathering";
  if (/服|着|コーデ|ファッション|何着/.test(m)) return "outfit";
  if (/連絡|メッセージ|line|メール|返信|送[るり]|電話/.test(m)) return "contact";
  if (/仕事|タスク|業務|進め方|やり方|働|プロジェクト|上司|報告|提案書|転職|内定/.test(m)) return "work";
  if (/なんで|なぜ|どうして|原因|理由|最近.*こう/.test(m)) return "cause";
  return "general";
}

/**
 * 感情質問の検出。
 * 絵文字のみ、短い絶望表現、感情が強い問い → 受け止め層を挿入する。
 */
export function isEmotionalQuestion(message: string): boolean {
  const trimmed = message.trim();
  // 絵文字のみ（Unicode emoji 1-3文字）
  const emojiOnly = /^[\p{Emoji}\s]{1,10}$/u.test(trimmed) && trimmed.length <= 12;
  if (emojiOnly) return true;
  // 短い絶望・感情表現（10文字以下）
  if (trimmed.length <= 10 && /もう|わからない|無理|辛い|疲れた|しんどい|死|消えたい|泣|助けて|怖い|不安/.test(trimmed)) return true;
  // 感情爆発系（長さ問わず）
  if (/^(もうわからない|もう無理|人生って|なんなんだろう|もうやだ|もういい|どうしたらいい|どうすればいい)/.test(trimmed)) return true;
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// データ → 判断文への事前変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * homeContext + personality を tagged fact リストに変換する。
 * 各 fact に tag を付けること���、質問カテゴリ別の ranking が可能になる。
 */
function buildTaggedFacts(
  personality: AlterPersonality,
  homeContext?: HomeAlterContextData | null,
): TaggedFact[] {
  const facts: TaggedFact[] = [];

  // ── 軸スコアから行動傾向を文にする ──
  const entries = Object.entries(personality.axisScores)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([, a], [, b]) => Math.abs((b as number) - 0.5) - Math.abs((a as number) - 0.5));

  for (const [key, value] of entries.slice(0, 5)) {
    const axisDef = TRAIT_AXES.find((a) => a.id === key);
    if (!axisDef || value === undefined) continue;
    const score = value as number;
    const intensity = Math.abs(score - 0.5) * 2;
    if (intensity < 0.15) continue;

    const side = score >= 0.5 ? "right" : "left";
    const label = side === "left" ? axisDef.labelLeft : axisDef.labelRight;
    const opposite = side === "left" ? axisDef.labelRight : axisDef.labelLeft;

    if (key === "social_energy" || axisDef.labelLeft.includes("内向") || axisDef.labelRight.includes("外向")) {
      if (score < 0.4) {
        facts.push({ text: "君は対人場面が続くと消耗しやすい。長時間の集まりの後は回復に時間がかかる", tags: ["social_load"] });
      } else if (score > 0.6) {
        facts.push({ text: "君は人と話すとエネルギーが回復するタイプ。孤立が続くと判断力が鈍りやすい", tags: ["social_load"] });
      }
    } else if (key === "change_embrace_vs_resist" || axisDef.labelLeft.includes("安定") || axisDef.labelRight.includes("変化")) {
      if (score < 0.4) {
        facts.push({ text: "君は変化にストレスを感じやすい。一度に複数の新しいことを入れると混乱しやすい", tags: ["change_stress", "scatter_focus"] });
      } else if (score > 0.6) {
        facts.push({ text: "君は変化に乗れるが、広げすぎると散りやすい。1つに絞ると強い", tags: ["change_stress", "scatter_focus"] });
      }
    } else if (key === "decision_style" || axisDef.labelLeft.includes("熟考") || axisDef.labelRight.includes("即断")) {
      if (score < 0.4) {
        facts.push({ text: "君は判断に時間をかけるタイプ。判断基準を先に2つだけ決めると迷いが減る", tags: ["decision_speed"] });
      } else if (score > 0.6) {
        facts.push({ text: "君は即断できるが、後から「あれでよかったのか」と揺れやすい", tags: ["decision_speed", "impulse_caution"] });
      }
    } else if (key === "harmony_autonomy" || axisDef.labelLeft.includes("協調") || axisDef.labelRight.includes("自律")) {
      if (score < 0.4) {
        facts.push({ text: "君は場に合わせやすい一方で、合わせすぎると後で消耗する。義務感だけの参加は消耗が大きい", tags: ["social_load", "impulse_caution"] });
      } else if (score > 0.6) {
        facts.push({ text: "君は自分のペースを崩すと消耗する。時間を自分で区切ると楽になる", tags: ["social_load", "scatter_focus"] });
      }
    } else if (key === "depth_breadth" || axisDef.labelLeft.includes("深く") || axisDef.labelRight.includes("広く")) {
      if (score < 0.4) {
        facts.push({ text: "1つのことを深く掘るとき力を発揮する。広げすぎると集中力が分散して消耗する", tags: ["scatter_focus", "decision_speed"] });
      } else if (score > 0.6) {
        facts.push({ text: "幅広く動くと活性化するが、1つに絞らされると窮屈さを感じやすい", tags: ["scatter_focus"] });
      }
    } else if (key === "emotional_regulation" || axisDef.labelLeft.includes("感情") || axisDef.labelRight.includes("理性")) {
      if (score < 0.4) {
        facts.push({ text: "感情の波が判断に直結しやすい。波が来ているときは一拍置く方が後で楽", tags: ["impulse_caution", "energy_state"] });
      } else if (score > 0.6) {
        facts.push({ text: "冷静に整理できるが、感情を後回しにしすぎると突然溢れることがある", tags: ["impulse_caution", "blindspot"] });
      }
    } else if (intensity > 0.3) {
      facts.push({ text: `${label}寄りの傾向がある。${opposite}を求められると消耗しやすい`, tags: ["other"] });
    }
  }

  // ── 判断パターン（根拠の多様性を確保） ──
  const boldScore = personality.axisScores.cautious_vs_bold ?? 0.5;
  const socialScore = personality.axisScores.introvert_vs_extrovert ?? personality.axisScores.individual_vs_social ?? 0.5;

  // 消耗パターン（「やらなかった後悔」以外の根拠）
  if (boldScore < 0.4 && socialScore < 0.4) {
    facts.push({ text: "迷っている時間そのものが一番消耗するタイプ。決めてしまえば楽になる", tags: ["decision_speed"] });
  }
  if (socialScore < 0.4) {
    facts.push({ text: "ひとりで考える時間が回復の源。人に囲まれた後は意図的に休息を入れると翌日が楽", tags: ["social_load", "energy_state"] });
  }
  if (boldScore > 0.4 && boldScore < 0.6) {
    facts.push({ text: "やりすぎも、やらなさすぎも後悔する。「ちょうどいい踏み出し方」を見つけるのが鍵", tags: ["impulse_caution"] });
  }

  // ── 性格構造 ──
  if (personality.coreWoundShort) {
    facts.push({ text: `根っこにある恐れ: ${personality.coreWoundShort}。これが強く出ると判断が歪みやすい`, tags: ["core_wound"] });
  }
  if (personality.blindSpot) {
    facts.push({ text: `盲点: ${personality.blindSpot}。本人が気づきにくい落とし穴`, tags: ["personality_blind"] });
  }

  // ── homeContext（今日の状態） ──
  if (homeContext?.weather?.label) {
    const w = homeContext.weather;
    const msg = w.message ? `（${w.message}）` : "";
    facts.push({ text: `今日の内面状態: ${w.emoji ?? ""} ${w.label}${msg}`, tags: ["energy_state"] });
  }
  if (homeContext?.temporalDelta) {
    facts.push({ text: `最近の変化: ${homeContext.temporalDelta}`, tags: ["temporal"] });
  }
  if (homeContext?.insight) {
    facts.push({ text: `今日のインサイト: ${homeContext.insight}`, tags: ["insight"] });
  }
  if (homeContext?.blindSpot) {
    facts.push({ text: `今日の盲点検知: ${homeContext.blindSpot}`, tags: ["blindspot"] });
  }
  if (homeContext?.prophecy) {
    facts.push({ text: `予測エンジン: ${homeContext.prophecy}`, tags: ["prophecy"] });
  }

  return facts;
}

/**
 * カテゴリに応じて tagged facts を並べ替え、上位だけを返す。
 * 同じ facts でも、飲み会なら対人負荷が先、服なら迷いやすさが先���なる。
 */
export function rankFactsForCategory(
  taggedFacts: TaggedFact[],
  category: QuestionCategory,
  maxFacts = 4,
): string[] {
  const priority = CATEGORY_FACT_PRIORITY[category];

  const scored = taggedFacts.map((f) => {
    // tag が priority に含まれていればそのインデックスを score にする（小さいほど高優先）
    let bestRank = 999;
    for (const tag of f.tags) {
      const idx = priority.indexOf(tag);
      if (idx !== -1 && idx < bestRank) bestRank = idx;
    }
    return { fact: f, rank: bestRank };
  });

  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, maxFacts).map((s) => s.fact.text);
}

/**
 * 公開 API（後方互換）: homeContext + personality → 判断文リスト。
 * カテゴリなしの場合は全 facts を返す。
 */
export function buildPersonalizedFacts(
  personality: AlterPersonality,
  homeContext?: HomeAlterContextData | null,
  category?: QuestionCategory,
): string[] {
  const tagged = buildTaggedFacts(personality, homeContext);

  // facts が空の場合、personality の基本情報からフォールバック生成
  if (tagged.length === 0) {
    const fallbackFacts: string[] = [];
    if (personality.archetypeName) {
      fallbackFacts.push(`${personality.archetypeName}タイプの判断傾向を持つ`);
    }
    if (personality.coreWoundShort) {
      fallbackFacts.push(`根底に「${personality.coreWoundShort}」がある`);
    }
    if (homeContext?.weather?.label) {
      fallbackFacts.push(`今の状態: ${homeContext.weather.emoji ?? ""} ${homeContext.weather.label}`);
    }
    return fallbackFacts;
  }

  if (category) {
    return rankFactsForCategory(tagged, category, 4);
  }
  // fallback: 全 facts（旧動作互換）
  return tagged.map((f) => f.text);
}

/**
 * facts から Gemini が使いやすい「根拠パーツ」のキーワードリストを抽出。
 * validator の意味検査で「これらのキーワードのどれかが応答に含まれているか」を判定する。
 */
export function extractExpectedKeywords(facts: string[]): string[] {
  const keywords: string[] = [];
  for (const fact of facts) {
    // 各 fact から特徴的な単語を抽出（2-6文字のカタカナ/漢字/ひらがな語）
    const matches = fact.match(/[ぁ-ん]{2,6}|[ァ-ヶ]{2,6}|[一-龥]{2,4}/g);
    if (matches) {
      keywords.push(...matches.filter((m) =>
        // 汎用すぎる語は除外
        !["する", "いる", "ある", "なる", "できる", "やすい", "にくい", "ため"].includes(m)
      ));
    }
  }
  return [...new Set(keywords)];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Home Alter Prompt Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildHomeAlterPrompt(
  personality: AlterPersonality,
  homeContext?: HomeAlterContextData | null,
  category?: QuestionCategory,
  userMessage?: string,
  userName?: string,
): string {
  const cat = category ?? "general";
  const sections: string[] = [];
  const facts = buildPersonalizedFacts(personality, homeContext, cat);
  const conclusionSlots = CATEGORY_CONCLUSION_SLOTS[cat];
  const actionSlot = CATEGORY_ACTION_SLOTS[cat];
  const framework = buildJudgmentFramework(personality, homeContext, userMessage);

  // ━━━━ 呼称ルール ━━━━
  const callName = userName ? `${userName}さん` : "";
  const callNameRule = userName
    ? `ユーザーを「${userName}さん」と呼ぶ。「君」「あなた」は使わない。`
    : `ユーザーに「君」「あなた」と呼びかけない。名前を使わず中立的に表現する。`;

  // ━━━━ 最重要ルール（冒頭） ━━━━
  sections.push(
    "# 絶対ルール",
    "",
    `あなたは${callName || "この人"}の影（もう一人の自分）。優しい相談員ではなく、**この人を一番知っている存在として、少し本音を混ぜながら判断を支える**。`,
    "「安全だからこう」ではなく「今のこの人にとってはこうするのが合っている」を出す。",
    "",
    "## 判断の原則",
    "結論は以下の軸を統合して出す（優先順位順）:",
    "1. **機会価値**（消耗か、成長機会か）",
    "2. **コスト負荷**（時間・体力・翌日影響）",
    "3. **関係性**（大事な相手か、薄い義理か）",
    "4. **成長方向**（今この人に必要なのは守ることか、広げることか）",
    "5. **現在状態**（今日のエネルギー・気分）",
    "6. **後悔方向**（やって後悔するか、やらなくて後悔するか）",
    "",
    "**判断ルール:**",
    "- 低価値 + 薄い関係 → guard（守り）",
    "- 低価値 + 関係維持コストあり → conditional（最低限だけ）",
    "- 高価値 + 高コスト → conditional（短時間/条件付き）",
    "- 高価値 + 低〜中コスト → push（攻め）",
    "",
    "**禁止する短絡:**",
    "- ❌ 状態が悪い＝見送り",
    "- ❌ 成長方向が「広げる」＝何でも挑戦",
    "- ❌ 高価値＝フル参加（コストが高ければ条件付きにする）",
    "",
    "## フォーマット（必ずこの構造、3〜4文）",
    "**1文目**: 結論 + **なぜ今のこの人にそれが合うか**（「何をすべきか」だけは不合格。必ず理由を同じ文に入れる）",
    "**2文目**: 今日の状態・最近の傾向・性格的根拠を**自然文の中に織り込む**（ラベル貼りは不合格。「エネルギーは低めです」ではなく「今日は少し霧がかった感じで判断が重いので」のように書く）",
    "**3文目**: 次の一手（「いつ」「何を」「どうする」を含む具体的な行動提案）",
    "**4文目（任意）**: 1行フック — 問い返しではなく、続きを話したくなる余白。有効なときだけ使う",
    "",
    "## 1文目の書き方（最重要）",
    "1文目は「誰にでも言える結論」だと不合格。**この人の傾向・今の状態・今日の文脈**のどれかが理由として入っていること。",
    "**長さの目安**: 結論部分は14〜28文字で収める。理由は同じ文の後半に置く。息継ぎできない長さは逆に熱量が落ちる。",
    "❌ 「今回は、1時間だけ顔を出すのがよさそうです。」（誰にでも言える）",
    "✅ 「閉じ気味の今だからこそ、1時間だけ顔を出すくらいが合っています。」（今の状態が理由になっている）",
    `✅ 「${callName || "この人"}は考えすぎると重くなるので、今日は軽く踏み出す形が合っています。」（性格的理由が入っている）`,
    "",
    "## 今日の状態の織り込み方",
    "inner weather / energy / temporal shift は**別ラベルとして書かない**。自然文の根拠として溶け込ませる。",
    "❌ 「エネルギーは低めです。最近は閉じ気味です。」（ラベル貼り）",
    "✅ 「今日は少し霧がかかったみたいに判断が重いので、長居より短時間の方が合っています。」",
    "✅ 「最近閉じ気味だから、完全に避けるより軽く接続を戻す方が自然です。」",
    "",
    "## 1行フックの書き方",
    "4文目は**問い返しではなく、余白**。必須ではないが、有効なときは使う。",
    "✅ 「ちなみに、相手が誰かでこの判断は少し変わります。」",
    "✅ 「行ったあとでどう感じたかは、次の判断材料になりそうです。」",
    "✅ 「正直に言うと、ここは相手との温度差が鍵です。」",
    "❌ 「詳しく教えてください」「どんな状況ですか？」「相手は誰ですか？」（追加情報要求は禁止）",
    "",
    "## Alterの声（影の本音）",
    "全体はやわらかい提案トーンだが、**結論を一段深くできるときだけ**、影としての本音（鋭い一言）を1箇所入れてよい。**2箇所以上は禁止**。",
    "**重要: 影の声は必須ではない。なくても合格する。** 目安として3回に1回〜2回に1回程度。毎回使うと演出になり効果が薄れる。",
    "命令ではなく、「正直に言うと」「たぶん」「本音を言えば」で始まる一刺し。",
    "✅ 「正直に言うと、今回は見送った方が後が楽です。」",
    "✅ 「たぶん今の迷い方は、慎重というより疲れです。」",
    "✅ 「優しさで引き受けると、あとで自分が重くなります。」",
    "❌ 「やめた方がいいです。」「今すぐ行動してください。」（圧の強い断定・命令は禁止）",
    "",
    "## 結論の方向",
    ...conclusionSlots.map((s) => `- ${s}`),
    "",
    "## 行動 slot（次の一手は必ずこの3要素を含む）",
    `テンプレ: ${actionSlot}`,
    "- [いつ]: 今すぐ / 今日中に / 今夜 / 今から",
    "- [何を]: 具体的な対象（数量付き）",
    "- [どうする]: やわらかい提案で終わる",
    "",
    "## 禁止",
    "- 問い返し / 演出 / 挨拶 / 前置き",
    "- 内省誘導（「自分の気持ちを見つめて」）",
    "- 曖昧すぎる（「かもしれない」が2回以上 / 「状況による」「考えてみて」）",
    "- 人格ラベル説明だけで終わる",
    "- **誰にでも通じる結論だけの1文目**",
    "- **一般論の焼き直し**",
    "- **性格データを後付けで足しただけの返答**",
    "- **ふわっとした励ましで終わる返答**",
    "- **決断を避けるだけの返答**",
    "- **命令口調（「〜しろ」「〜決めろ」）**",
    "- **「君」「あなた」という呼称**",
    "- **圧の強い断定（「〜すべきだ」「〜しかない」）**",
    "- **状態だけで結論を出す（機会価値と成長方向を必ず考慮）**",
    "- **成長方向だけで結論を出す（「広げるフェーズだから」で低価値イベントに攻めるのも不可）**",
    "- **箇条書き**",
    "- **「ただし〜」で始まる安全策の条件分岐**（定型化の元凶。本当に判断が変わる条件差分だけ4文目フック行で書く。「ただし、もし〜なら」パターンは原則禁止）",
    "",
    "## 判断メタデータ（応答末尾に必ず付加）",
    "応答本文の後に、必ず以下のブロックを付けること:",
    "```",
    "---DECISION_META---",
    "action_shape: full_go | bounded_go | prepare_then_go | observe_first | defer_with_trigger | skip",
    "opportunity_value: low | medium | high",
    "cost_load: low | medium | high",
    "relation_value: low | medium | high",
    "energy_adjustment: protect | neutral | use_momentum",
    "regret_direction: go_regret | skip_regret | balanced",
    "growth_vector_override: true | false",
    "---END_META---",
    "```",
    "action_shape の意味:",
    ...Object.entries(ACTION_SHAPE_LABELS).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "- cost_load: low=軽い行動, medium=それなり, high=時間/体力/翌日影響が大きい",
    "- relation_value: low=薄い関係/義理, medium=普通, high=大事な相手",
    "- growth_vector_override: 機会価値・コスト・関係性が成長方向と矛盾して上書きした場合 true",
    "",
    "**重要**: 攻め/守りの二択ではなく、「どんな形で動くか」を選ぶこと。グレーゾーンこそ bounded_go / prepare_then_go / observe_first の出番。",
    "",
    "## 制約",
    "- 3-4文、最大300文字（メタデータ除く）",
    `- 一人称「僕」`,
    `- ${callNameRule}`,
    "- トーンは「落ち着いていて、少し熱がある」。優しい相談員ではなく、影としての本音がにじむ提案。",
  );

  // ━━━━ この人の判断アセスメント（5軸の事前計算結果） ━━━━
  sections.push(
    "",
    "# この人の判断アセスメント",
    "**結論を出す前に、以下を必ず考慮すること。**",
    "**判断優先順位: 機会価値 × コスト負荷 × 関係性 > 成長方向 > 現在状態**",
    "",
    `## 機会価値`,
    framework.opportunityValue,
    "",
    `## コスト負荷（時間・体力・翌日影響）`,
    framework.costLoad,
    "",
    `## 関係性の強さ`,
    framework.relationValue,
    "",
    `## 成長方向（今この人に必要なこと）`,
    framework.growthVector,
    "",
    `## この人の核（identity）`,
    framework.identityFit,
    "",
    `## 後悔しやすい方向`,
    framework.regretDirection,
    "**⚠️ 「やらなかった後悔を溜めやすい」は高頻度根拠。1応答で1回まで。この根拠だけで結論を正当化しない。必ず機会価値・コスト・関係性の別根拠と組み合わせること。**",
    "",
    `## 判断姿勢`,
    framework.judgmentStance,
  );

  // ━━━━ 固定 Persona Block（性格反転禁止） ━━━━
  {
    const scores = personality.axisScores;
    const boldScore = scores.cautious_vs_bold ?? 0.5;
    const socialScore = scores.individual_vs_social ?? 0.5;
    const personaTraits: string[] = [];
    if (boldScore < 0.4) {
      personaTraits.push("慎重寄り（即断型ではない）");
    } else if (boldScore > 0.6) {
      personaTraits.push("即断型寄り（慎重タイプではない）");
    } else {
      personaTraits.push("判断速度は中間（極端な慎重でも即断でもない）");
    }
    if (socialScore < 0.4) {
      personaTraits.push("ひとりの時間を大事にする（社交的タイプではない）");
    } else if (socialScore > 0.6) {
      personaTraits.push("人との交流を好む（内向的タイプではない）");
    }
    sections.push(
      "",
      "# この人の固定ペルソナ（絶対に守ること）",
      ...personaTraits.map((t) => `- ${t}`),
      "",
      "**性格反転の絶対禁止:**",
      "- 上記ペルソナと矛盾する言い換えをしてはならない",
      "- 慎重寄りの人に「即断型」「迷わず動ける」「衝動的」と言ってはいけない",
      "- 即断型の人に「慎重派」「じっくり考えるタイプ」と言ってはいけない",
      "- 内向型の人に「社交的」「人と一緒にいたい」と言ってはいけない",
      "- 外向型の人に「ひとりが好き」「人と距離を置く」と言ってはいけない",
      "- ユーザーの傾向を「逆」に表現する行為は一切禁止",
    );
  }

  // ━━━━ この人について今日わかっていること（カテゴリ順にranked） ━━━━
  if (facts.length > 0) {
    sections.push(
      "",
      "# この人について今日わかっていること",
      "**根拠はここから引用する。ただし上のアセスメントと統合して使う。**",
      "",
      ...facts.map((f, i) => `${i + 1}. ${f}`),
      "",
      "「タイプ名」「軸名」「スコア数値」は出さない。行動レベルで言い換える。",
    );
  }

  // ━━━━ general カテゴリ専用ルール ━━━━
  if (cat === "general") {
    sections.push(
      "",
      "# general カテゴリ専用ルール（曖昧な質問への対応）",
      "曖昧な質問では、汎用結論を先に言わないこと。",
      "まず**今日のこの人にとっての判断軸**を1つ選んでから提案に入ること。",
      "",
      "判断軸の候補（この人の状態とデータから最適なものを1つ選ぶ）:",
      "- 重くしない（判断が重い / エネルギー低め / 霧系の状態）",
      "- 人との接続を戻す（閉じ気味 / 孤立傾向 / 対人が減っている）",
      "- 抱え込みを減らす（タスク過多 / 考えすぎ / 散らかっている）",
      "- 本音を守る（周囲に合わせすぎ / 判断軸がブレている）",
      "- 一歩だけ進める（停滞感 / やらなかった後悔が溜まっている）",
      "- 今は動かず整える（やりすぎ / 疲労蓄積 / 散り気味）",
      "",
      "❌ 「一番気になっている選択肢に軽く踏み出してみるのがよさそうです。」（誰にでも通じる）",
      `✅ 「今日の${callName || "この人"}は、広げるより"重くしないこと"を優先した方がぶれません。」（この人の今日に合っている）`,
    );
  }

  // ━━━━ 感情質問の受け止め層 ━━━━
  if (userMessage && isEmotionalQuestion(userMessage)) {
    sections.push(
      "",
      "# 感情質問の受け止め層（最優先）",
      "この質問は感情が強い問いです。**いきなり分析モードに入らないこと。**",
      "",
      "**構成を以下に切り替え:**",
      "**1文目**: 受け止め — 感情を否定せず、今の状態を静かに認める。「それは重いよね」「そう感じるのは、ちゃんと向き合ってるからです」のような一言。分析や提案は入れない。",
      "**2文目**: 今の見立て — この人の性格や最近の傾向から、「なぜ今こうなっているか」の仮説を1つだけ、やわらかく提示。",
      "**3文目**: 小さな次の一手 — 大きな行動ではなく、今すぐできる最小の一歩。「1行だけ書き出す」「好きな音楽を1曲だけ聴く」レベル。",
      "",
      "❌ 「この感情の源泉を特定する価値がある」（冷たすぎる）",
      "❌ 「君は分析的寄りだから〜」（ラベル貼り）",
      "❌ 「何があったか教えて」（問い返し）",
      `✅ 「${callName || "この人"}、それは重い日ですね。」→ 見立て → 小さな一歩`,
    );
  }

  // ━━━━ 合格例（カテゴリに合った1例だけ → トークン節約） ━━━━
  const example = CATEGORY_EXAMPLES[cat];
  if (example) {
    sections.push(
      "",
      "# 合格例",
      "",
      `質問「${example.q}」`,
      "---",
      ...example.lines,
      "---",
    );
  }

  // ━━━━ フォローアップ ━━━━
  sections.push(
    "",
    "# フォローアップ（2回目の質問が来た場合）",
    "- 1回目の判断を踏まえて、別角度の根拠を追加する",
    "- 1文目+理由 → 状態根拠 → 次の一手 の構造は崩さない",
    "- 1行フックは2回目でも使ってよい",
  );

  return sections.join("\n");
}

/** カテゴリごとの合格例（1つだけ。全カテゴリ載せるとトークン浪費） */
const CATEGORY_EXAMPLES: Record<QuestionCategory, { q: string; lines: string[] }> = {
  gathering: {
    q: "飲み会に行くべき？",
    lines: [
      "閉じ気味の今だからこそ、1時間だけ顔を出すくらいが合っています。",
      "たいしさんは無理に盛り上がる場に長くいると、あとで一気に疲れが返りやすいです。でも最近は閉じ気味で、完全に避けるより軽く接続を戻す方が自然です。",
      "次の一手: 今すぐ「21時に帰る前提」で参加表明を1件送っておくのが合っています。",
      "ちなみに、誰が来る場かでこの判断は少し変わります。",
    ],
  },
  outfit: {
    q: "今日の服どうする？",
    lines: [
      "今日は判断が少し重い状態なので、迷わず決まる安全圏に1点だけ変化を足すのが合っています。",
      "たいしさんは安定を選びがちだけど、最近そのパターンが停滞感につながっている気配があります。全部を変えるんじゃなく、色かアクセサリーの1点だけ普段と違うものを入れると、気分と判断が軽くなりやすいです。",
      "次の一手: 今すぐクローゼットから普段選ばない色のアイテムを1点だけ選んで合わせてみるのが合っています。",
    ],
  },
  contact: {
    q: "この人に連絡するべき？",
    lines: [
      "たいしさんは後回しにすると送りづらさが倍になるタイプなので、短くていいから今日中に送った方が後が楽です。",
      "「準備してから」と思うほど重くなるパターンがあります。正直に言うと、完璧な文面より早さの方がこの相手には効きます。",
      "次の一手: 今から3行以内で下書きして、15分以内に送ってしまうのが合っています。",
      "本音を言えば、相手との温度差が一番のポイントになりそうです。",
    ],
  },
  work: {
    q: "今の仕事の進め方、合ってる？",
    lines: [
      "方向は合っていますが、たいしさんの場合、情報を集める時間が判断を遅らせ始めているのが気になります。",
      "今は少し霧がかかった状態で判断が重くなりやすいけど、材料は十分揃っています。たぶん足りないのは情報じゃなくて「決めていい」という踏ん切りです。",
      "次の一手: 今日中に、保留している判断を1つだけ決めてみるのが合っています。",
    ],
  },
  cause: {
    q: "最近なんでこうなる？",
    lines: [
      "たぶん、他人の反応を先読みしすぎて自分の判断軸がブレていることが原因です。",
      "本来は自分の軸で動ける人だけど、最近は周囲の評価が気になるフェーズに入っています。その結果、決断のたびに迷いが増えて消耗している感じがあります。",
      "次の一手: 今日から3回だけ、判断する前に「自分はどう思ったか」を一言メモしてみるのが合っています。",
      "これが続くと、どこで軸がブレるか見えてきます。",
    ],
  },
  general: {
    q: "今日どう動くのがいい？",
    lines: [
      "今日のたいしさんは、広げるより『重くしないこと』を優先した方がぶれません。",
      "少し霧がかかった状態で、判断力はあるけど持続力が削れやすい日です。こういう日は大きな決断より、一番負担の小さい一歩を1つだけやるのが合っています。",
      "次の一手: 今日中に、一番気になっていることを1つだけ軽く動かしてみるのが合っています。",
      "迷っている時間が一番消耗するタイプなので、動くなら早めがいいです。",
    ],
  },
};

/**
 * retry 用の厳格プロンプト。
 * 1回目の出力が不合格だった場合に、失敗理由 + 使うべきデータを明示して再生成させる。
 */
export function buildHomeAlterRetryPrompt(
  userMessage: string,
  failedResponse: string,
  failures: string[],
  personalizedFacts?: string[],
  category?: QuestionCategory,
  userName?: string,
): string {
  const cat = category ?? "general";
  const actionSlot = CATEGORY_ACTION_SLOTS[cat];
  const conclusionSlots = CATEGORY_CONCLUSION_SLOTS[cat];

  const lines = [
    "前の回答は不合格。以下を修正:",
    ...failures.map((f) => `- ${f}`),
    "",
    `質問: 「${userMessage}」`,
    "",
  ];

  if (personalizedFacts && personalizedFacts.length > 0) {
    lines.push(
      "根拠に使うこと（最低1つは引用すること）:",
      ...personalizedFacts.slice(0, 4).map((f) => `- ${f}`),
      "",
    );
  }

  lines.push(
    "結論の方向（参考）:",
    ...conclusionSlots.map((s) => `- ${s}`),
    "",
    "フォーマット（3〜4文）:",
    "1文目: 結論 + なぜ今のこの人にそれが合うか（「何をすべきか」だけは不合格）",
    "2文目: 今日の状態・最近の傾向・性格的根拠を自然文の中に織り込む",
    `3文目: ${actionSlot}`,
    "4文目（任意）: 1行フック（問い返しではなく余白）",
    "",
    "前置き不要。問い返し禁止。人格ラベルの説明だけで終わらない。箇条書き禁止。",
    "「ただし〜」の安全策条件分岐は禁止。「やらなかった後悔」は1応答1回まで、それだけで結論を正当化しない。",
    "",
    `**重要**: 1文目が「誰にでも言える結論」だと不合格。この人の傾向・今の状態が理由として入っていること。`,
    `**影の本音**: 1箇所だけ「正直に言うと」「たぶん」のような本音の一刺しを入れてよい。`,
    `**命令口調禁止**: 「〜しろ」「〜決めろ」ではなく「〜するのが合っています」「〜した方が後が楽です」。`,
    `**呼称禁止**: 「君」「あなた」は使わない。${userName ? `「${userName}さん」と呼ぶ。` : "名前なしで中立的に表現する。"}`,
    "",
    "応答末尾に判断メタデータも付加すること:",
    "---DECISION_META---",
    "action_shape: full_go | bounded_go | prepare_then_go | observe_first | defer_with_trigger | skip",
    "opportunity_value: low | medium | high",
    "cost_load: low | medium | high",
    "relation_value: low | medium | high",
    "energy_adjustment: protect | neutral | use_momentum",
    "regret_direction: go_regret | skip_regret | balanced",
    "growth_vector_override: true | false",
    "---END_META---",
  );

  return lines.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Home Alter Response Validator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const QUESTION_ENDINGS = [
  /[？?]$/,
  /どう思う[？?]?$/,
  /どうだろう[？?]?$/,
  /感じる[？?]?$/,
  /考えてみて[？。.]?$/,
  /見つめてみ(よう|て)[？。.]?$/,
  /振り返ってみ(よう|て)[？。.]?$/,
  /向き合って[？。.]?$/,
  /だろうか[？?]?$/,
  /ではないか[？?]?$/,
  /じゃないか[？?]?$/,
  /なぜだと思う/,
  /何だと思う/,
];

const BAD_OPENINGS = [
  /^ようこそ/,
  /^やっと会えた/,
  /^また来た/,
  /^僕の観測所/,
  /^初めまして/,
  /^久しぶり/,
  /^おはよう/,
  /^こんにち[はわ]/,
  /^こんばん[はわ]/,
  /^面白い質問/,
  /^いい質問/,
  /^なるほど/,
  /^ふむ/,
  /^\.{2,}/,
  /^僕[はが]君[のを]/,
  /^僕.*見てきた/,
  /^僕.*観測/,
  /^君[のは]こと.*[知見理解]/,
];

const JUDGMENT_AVOIDANCE = [
  /状況による/,
  /一概には言えない/,
  /気持ち次第/,
  /自分で決める/,
  /かもしれないね$/,
  /かもしれない。$/,
];

// genericな行動提案（誰にでも言える内容）
const GENERIC_ACTIONS = [
  /^次の一手[:：]\s*(記録し|メモし|振り返[るり]|考え|自分[をに]|見つめ|整理し|確認し)[^、。]*[。.]?$/,
  /^次の一手[:：]\s*(記録し|メモし|振り返[るり]|考え|自分[をに]|見つめ|整理し|確認し)[^、。]*(よさそうです|合っています)[。.]?$/,
];

// 人格ラベル説明で逃げるパターン
const LABEL_DESCRIPTION_ONLY = [
  /君は.{2,6}(的|型|タイプ)で/,
  /君は.{2,6}(的|型|タイプ)な/,
  /あなたは.{2,6}(的|型|タイプ)で/,
  /あなたは.{2,6}(的|型|タイプ)な/,
];

/**
 * Home Alter の出力を検査する。
 * 形式検査 + 意味検査（固有データが反映されているか）。
 */
export function validateHomeAlterResponse(
  response: string,
  userMessage: string,
  expectedKeywords?: string[],
): HomeAlterValidation {
  const failures: string[] = [];
  const trimmed = response.trim();
  const lines = trimmed.split(/\n/).filter((l) => l.trim());

  if (!trimmed || trimmed.length < 10) {
    return { pass: false, failures: ["応答が空または短すぎる"] };
  }

  // 感情質問かどうかを判定（バリデーション分岐に使用）
  const emotional = isEmotionalQuestion(userMessage);

  const firstLine = lines[0]?.trim() ?? "";
  const lastLine = lines[lines.length - 1]?.trim() ?? "";

  // ── 形式検査 ──

  // 1. 問い返しで終わっていないか（ただしフック行は許容）
  // フック行 = 「ちなみに」「正直に言うと」「本音を言えば」等で始まる文で、
  // 「？」で終わらず、情報要求でもないもの
  const isHookLine = /^(ちなみに|正直に言うと|本音を言えば|たぶん|これが|行った|帰って|迷って)/.test(lastLine);
  const isInfoRequest = /教えて|聞かせて|どう(です|でしょう)?[？?]|ですか[？?]/.test(lastLine);
  if (!isHookLine || isInfoRequest) {
    for (const pattern of QUESTION_ENDINGS) {
      if (pattern.test(lastLine)) {
        failures.push("問い返しで終わっている");
        break;
      }
    }
  }

  // 2. 不合格な導入
  for (const pattern of BAD_OPENINGS) {
    if (pattern.test(firstLine)) {
      failures.push("演出的な導入で始まっている");
      break;
    }
  }

  // 3. 1行目に結論があるか
  const conclusionPatterns = [
    /した方がいい/, /するのがいい/, /が合っている/, /を選[べんぶ]/,
    /見送っていい/, /行かな[いく]/, /送[れるっ]/, /やめ[たてろ]/,
    /待[つった]方/, /控え[たてろ]/, /避け[たてろ]/, /入れ[たてろ]/,
    /決め[たてろ]/, /絞[れるっ]/, /減らし/, /増やし/,
    /合っている/, /自然だ/, /十分だ/, /不要だ/,
    /最善[だ手]/, /踏み出す/, /試[すせし]/, /挑戦/,
    /からだ[。.]?$/, /ためだ[。.]?$/, // 原因仮説の結論
    /ている(から|ため)/, // 〜しているからだ
    // Embedded Alter やわらかトーン対応
    /よさそうです/, /合っていそうです/, /が合っています/, /がよさそう/,
    /してみるのが/, /しておくのが/, /た方がよさそう/,
    // 新: 理由込み結論パターン
    /だからこそ/, /なので/, /だから/, /の場合/, /ぶれません/,
    /が原因/, /が気になります/, /後が楽/,
    // 判断表現の揺れ対応
    /になりやすい/, /が大きい/, /が鍵/, /を優先/, /に繋がり/, /次に繋がる/,
    /重すぎる/, /早すぎる/, /遅すぎる/, /が先/,
  ];
  const hasConclusion = conclusionPatterns.some((p) => p.test(firstLine));
  // 感情質問では1文目が「受け止め」なので結論チェックをスキップ
  if (!emotional && !hasConclusion && !firstLine.includes("いい") && !firstLine.includes("べき")) {
    failures.push("1行目に結論（判断）がない");
  }

  // 3b. 1行目が「誰にでも言える結論」ではないか（理由が含まれているか）
  // 感情質問ではスキップ（受け止め文に理由は不要）
  const hasPersonalReason = /今|最近|閉じ|広げ|重[くい]|霧|疲れ|考えすぎ|迷い|後回し|溜め|タイプ|傾向|だからこそ|なので|場合|さんは|たぶん|正直|慎重|消耗|ブレ/.test(firstLine);
  if (!emotional && hasConclusion && !hasPersonalReason && firstLine.length < 40) {
    failures.push("1行目に「この人向けの理由」が含まれていない（誰にでも言える結論）");
  }

  // 4. 「次の一手」があるか
  // 感情質問では「次の一手:」ラベル不要。代わりに具体的な小さい行動文があるかを検査
  const hasNextAction = /次の一手[:：]/.test(trimmed);
  if (emotional) {
    // 感情質問: 具体的な行動を含む文があるか（ラベルなしでOK）
    const hasSmallStep = /聴[いく]|書[きく]|出[しす]|休[むめ]|試[すし]|飲[むめ]|食べ|歩[くい]|見[てる]|置[いく]|感じ|深呼吸|1[つ曲]|ひとつ|一つ/.test(trimmed);
    if (!hasSmallStep) {
      failures.push("感情質問への応答に具体的な小さい行動がない");
    }
  } else if (!hasNextAction) {
    // 「次の一手:」ラベルはないが、具体的な行動提案文がある場合は軽微な違反に留める
    const hasActionSentence = /今日中に|今すぐ|今から|今夜|明日/.test(trimmed) &&
      /してみ|送[るっ]|書[きく]|伝え|決め|試[すし]/.test(trimmed);
    if (!hasActionSentence) {
      failures.push("「次の一手:」がない");
    }
    // ラベルありが理想だが、行動文が存在すればPASSとする
  }

  // 5. 判断放棄
  for (const pattern of JUDGMENT_AVOIDANCE) {
    if (pattern.test(trimmed)) {
      failures.push("判断を放棄している表現がある");
      break;
    }
  }

  // 6. 長すぎ
  if (trimmed.length > 400) {
    failures.push("長すぎる（400文字超）");
  }

  // 6b. 影の声が2箇所以上使われていないか
  const shadowMarkers = /正直に言うと|本音を言えば|たぶん(?!ん)/g;
  const shadowCount = (trimmed.match(shadowMarkers) || []).length;
  if (shadowCount > 1) {
    failures.push("影の声（正直に言うと/たぶん/本音を言えば）が2箇所以上ある（1回答1箇所まで）");
  }

  // 6c. 「ただし」条件分岐の定型パターン
  const tadashiCount = (trimmed.match(/ただし[、,]/g) || []).length;
  if (tadashiCount > 0) {
    // 4文目フック行内での使用は許容（最終行のみ）
    const lastLineHasTadashi = /^ただし[、,]/.test(lastLine);
    const bodyHasTadashi = tadashiCount > (lastLineHasTadashi ? 1 : 0);
    if (bodyHasTadashi) {
      failures.push("「ただし〜」の安全策条件分岐がある（原則禁止。本当に必要なら4文目フック行で）");
    }
  }

  // 6d. 「やらなかった後悔」の過剰使用チェック
  const regretCount = (trimmed.match(/やらなかった後悔|やらなくて後悔|行かなくて後悔|あの時やれば|あの時やっておけば/g) || []).length;
  if (regretCount > 1) {
    failures.push("「やらなかった後悔」系の根拠が2回以上使われている（1応答1回まで）");
  }

  // ── 意味検査 ──

  // 7. 人格ラベルの説明だけで終わっていないか
  // 「君は分析的で〜」のような説明文だけで根拠を済ませていないかチェック
  const nonActionLines = lines.filter((l) => !l.trim().startsWith("次の一手"));
  const hasLabelOnlyReasoning = nonActionLines.some((l) =>
    LABEL_DESCRIPTION_ONLY.some((p) => p.test(l.trim()))
  );
  const hasActionableReasoning = nonActionLines.some((l) => {
    const t = l.trim();
    // 行動レベルの根拠: 「〜しやすい」「〜が出る」「〜になりがち」等
    return /しやすい|しにくい|出やすい|なりがち|回りがち|崩れやすい|消耗|疲れ|揺れ|散り|迷い|後回し|流れやすい/.test(t);
  });
  if (hasLabelOnlyReasoning && !hasActionableReasoning) {
    failures.push("人格ラベルの説明だけで、行動レベルの根拠がない");
  }

  // 8. 「次の一手」の粒度チェック — 今日1分でできるか
  const nextActionMatch = trimmed.match(/次の一手[:：]\s*(.+)/);
  if (nextActionMatch) {
    const actionText = nextActionMatch[1]!;
    // 粒度が荒いパターン（命令形 + やわらか形の両方をカバー）
    if (/^(記録し|メモし|振り返|考え|整理し|確認し)(ろ|て|よう|てみるのが|てみましょう)[。.]?$/.test(actionText.trim())) {
      failures.push("「次の一手」が漠然としている（何を・いつ・どれだけ、を入れて）");
    }
    // 汎用的すぎる行動提案（誰にでも言える内容）
    if (GENERIC_ACTIONS.some((p) => p.test("次の一手: " + actionText))) {
      failures.push("「次の一手」が汎用的すぎる（この人固有の行動を含めて）");
    }
    // 具体的な数量・タイミングが含まれているかチェック
    const hasSpecificity = /[0-9０-９]|今日|今夜|午前|午後|朝|昼|夜|分|行|つだけ|1つ|一つ|ひとつ/.test(actionText);
    if (!hasSpecificity && actionText.length < 20) {
      failures.push("「次の一手」に具体性が足りない（数量・タイミング・粒度を入れろ）");
    }
  }

  // 9. 固有データが反映されているか（意味検査の核心）
  if (expectedKeywords && expectedKeywords.length > 0) {
    const responseLower = trimmed;
    const matchCount = expectedKeywords.filter((kw) => responseLower.includes(kw)).length;
    // 期待キーワードの少なくとも1つは含まれているべき
    if (matchCount === 0) {
      failures.push("この人固有のデータが根拠に反映されていない（generic）");
    }
  }

  // 10. カテゴリ別具体性
  // カテゴリ別の応答内容チェック（classifyQuestion で主カテゴリを判定し、そのカテゴリのみ検査）
  // 「LINEの返信 + 明日仕事」のように複数キーワードが混在する場合の誤検出を防ぐ
  const detectedCategory = classifyQuestion(userMessage);
  if (detectedCategory === "outfit" &&
    !/(選|着|セット|絞|決め|合[うっわ]|コーデ|1つ|シンプル)/.test(trimmed)) {
    failures.push("服の質問なのに服の判断が含まれていない");
  }
  if (detectedCategory === "gathering" &&
    !/(行[くかっ]|見送|参加|不参加|短時間|抜け|断[るっ])/.test(trimmed)) {
    failures.push("飲み会の質問なのに参加判断が含まれていない");
  }
  if (detectedCategory === "contact" &&
    !/(送[るれっ]|待[つった]|下書き|返[すし]|連絡|伝え)/.test(trimmed)) {
    failures.push("連絡の質問なのに送信判断が含まれていない");
  }
  if (detectedCategory === "work" &&
    !/(やる|やめ|優先|後回し|集中|切[るり]|始め|終わ[るらり]|進め|提出|報告|出[すし])/.test(trimmed)) {
    failures.push("仕事の質問なのに仕事行動が含まれていない");
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Home Alter Response Formatter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function formatHomeAlterResponse(raw: string, userName?: string): string {
  let lines = raw.trim().split(/\n/).filter((l) => l.trim());

  // 不合格な導入行を除去
  while (lines.length > 1) {
    const first = lines[0]?.trim() ?? "";
    if (BAD_OPENINGS.some((p) => p.test(first))) {
      lines.shift();
    } else {
      break;
    }
  }

  // 末尾の問い返し行を除去
  while (lines.length > 1) {
    const last = lines[lines.length - 1]?.trim() ?? "";
    if (QUESTION_ENDINGS.some((p) => p.test(last))) {
      lines.pop();
    } else {
      break;
    }
  }

  // 「...」で始まる行の「...」を除去
  lines = lines.map((l) => l.replace(/^\.{2,}\s*/, ""));

  let result = lines.join("\n").trim();

  // ━━━━ Embedded Alter トーン補正（後処理） ━━━━
  // 「君」「あなた」→ ユーザー名 or 除去
  const nameReplace = userName ? `${userName}さん` : "";
  result = result.replace(/君は/g, nameReplace ? `${nameReplace}は` : "");
  result = result.replace(/君の/g, nameReplace ? `${nameReplace}の` : "");
  result = result.replace(/君が/g, nameReplace ? `${nameReplace}が` : "");
  result = result.replace(/君に/g, nameReplace ? `${nameReplace}に` : "");
  result = result.replace(/君を/g, nameReplace ? `${nameReplace}を` : "");
  result = result.replace(/君も/g, nameReplace ? `${nameReplace}も` : "");
  // 単独の「君」（助詞なし）
  result = result.replace(/(?<=[、。\s])君(?=[、。\s])/g, nameReplace || "");
  // 「あなた」も同様に除去
  result = result.replace(/あなたは/g, nameReplace ? `${nameReplace}は` : "");
  result = result.replace(/あなたの/g, nameReplace ? `${nameReplace}の` : "");
  result = result.replace(/あなたが/g, nameReplace ? `${nameReplace}が` : "");
  result = result.replace(/あなたに/g, nameReplace ? `${nameReplace}に` : "");
  result = result.replace(/あなたを/g, nameReplace ? `${nameReplace}を` : "");
  result = result.replace(/あなたも/g, nameReplace ? `${nameReplace}も` : "");

  // 命令形 → やわらかい提案形に変換（次の一手の行で特に重要）
  result = result.replace(/([^\s。、])しろ([。.])/g, "$1するのがよさそうです$2");
  result = result.replace(/([^\s。、])しろ$/gm, "$1するのがよさそうです");
  result = result.replace(/([^\s。、])せよ([。.])/g, "$1するのがよさそうです$2");
  result = result.replace(/([^\s。、])せよ$/gm, "$1するのがよさそうです");
  // 「〜送れ」「〜選べ」「〜決めろ」「〜書け」「〜出せ」等の命令形
  result = result.replace(/([っ])てみろ/g, "$1てみるのがよさそうです");
  result = result.replace(/送れ(?!る|ば|ない)([。.])/g, "送ってみるのがよさそうです$1");
  result = result.replace(/送れ(?!る|ば|ない)$/gm, "送ってみるのがよさそうです");
  result = result.replace(/選べ(?!る|ば|ない)([。.])/g, "選んでみるのがよさそうです$1");
  result = result.replace(/選べ(?!る|ば|ない)$/gm, "選んでみるのがよさそうです");
  result = result.replace(/決めろ/g, "決めてみるのが合っています");
  result = result.replace(/書け(?!る|ば|ない)([。.])/g, "書いてみるのがよさそうです$1");
  result = result.replace(/書け(?!る|ば|ない)$/gm, "書いてみるのがよさそうです");
  result = result.replace(/出せ(?!る|ば|ない)([。.])/g, "出してみるのがよさそうです$1");
  result = result.replace(/出せ(?!る|ば|ない)$/gm, "出してみるのがよさそうです");
  result = result.replace(/試せ(?!る|ば|ない)([。.])/g, "試してみるのがよさそうです$1");
  result = result.replace(/試せ(?!る|ば|ない)$/gm, "試してみるのがよさそうです");
  // 追加: 書き出せ / 残せ もカバー
  result = result.replace(/書き出せ(?!る|ば|ない)/g, "書き出してみるのがよさそうです");
  result = result.replace(/残せ(?!る|ば|ない)([。.])/g, "残してみるのがよさそうです$1");
  result = result.replace(/残せ(?!る|ば|ない)$/gm, "残してみるのがよさそうです");
  result = result.replace(/下せ([。.])/g, "下してみるのが合っています$1");
  result = result.replace(/下せ$/gm, "下してみるのが合っています");
  result = result.replace(/合わせろ/g, "合わせてみるのがよさそうです");
  result = result.replace(/メモしろ/g, "メモしてみるのがよさそうです");

  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Home Alter User Prompt Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildHomeAlterUserPrompt(
  userMessage: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): string {
  if (conversationHistory && conversationHistory.length > 0) {
    const history = conversationHistory
      .slice(-4)
      .map((m) => `${m.role === "user" ? "ユーザー" : "Alter"}: ${m.content}`)
      .join("\n");
    return `${history}\nユーザー: ${userMessage}\n\n結論→根拠→次の一手で返してください。命令口調・「君」「あなた」禁止。`;
  }

  return `ユーザーの質問: 「${userMessage}」\n\n1行目から結論。挨拶・前置き不要。根拠は「この人について今日わかっていること」から引用。最後は「次の一手:」で今日1分でできる行動をやわらかく提案。命令口調・「君」「あなた」禁止。`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reasoning Basis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ambiguity Engine — ドメイン検出 + 曖昧性解析 + 応答モード選択
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 質問のドメイン（行動カテゴリとは別の軸） */
export type QueryDomain = "romance" | "work" | "friend" | "family" | "self" | "general" | "daily_guidance";

/** 隠れ変数の検出状態 */
export interface HiddenVariables {
  target_type: "specific_person" | "group" | "abstract" | "unknown";
  relationship_distance: "close" | "medium" | "distant" | "unknown";
  urgency: "immediate" | "soon" | "flexible" | "unknown";
  emotional_stake: "high" | "medium" | "low" | "unknown";
  social_risk: "high" | "medium" | "low" | "unknown";
  reversibility: "reversible" | "irreversible" | "unknown";
}

/** 入力文の情報量シグナル */
export interface InformationSignals {
  /** 判断対象が明示されている（〜するか、〜べきか） */
  has_decision_target: boolean;
  /** 理由・背景・制約が書かれている（〜けど、〜し、〜だから） */
  has_context_reason: boolean;
  /** 比較・トレードオフが書かれている（〜か〜か、でも、一方で） */
  has_constraint_or_tradeoff: boolean;
  /** 時間感覚がある */
  has_time_signal: boolean;
  /** 文字数バケット */
  input_length_bucket: "short" | "medium" | "long";
  /** 情報量スコア (0.0–1.0): 上記シグナルの加重合計 */
  score: number;
}

/** 質問コンテキスト解析結果 */
export interface QueryContext {
  domain: QueryDomain;
  domain_confidence: number;
  hidden_variables: HiddenVariables;
  /** unknownの数から自動算出 (0.0–1.0) */
  ambiguity_score: number;
  /** Cモード用: 解消すべき最重要変数 */
  critical_missing?: string;
  /** 入力文の情報量（P0追加） */
  information: InformationSignals;
}

/** 応答モード */
export type ResponseMode = "conclude" | "branch" | "clarify";

/** 応答モード決定の理由（監査・デバッグ用） */
export type ModeDecisionReason =
  | "clarify_high_ambiguity_high_stake"
  | "clarify_relational_unknown"
  | "branch_high_ambiguity"
  | "branch_mid_ambiguity_low_info"
  | "conclude_mid_ambiguity_info_sufficient"
  | "conclude_low_ambiguity";

/** selectResponseMode の戻り値（モード + 理由） */
export interface ModeDecision {
  mode: ResponseMode;
  reason: ModeDecisionReason;
}

/** ドメイン別性格オーバーレイ */
export interface DomainOverlay {
  domain: QueryDomain;
  /** このドメインで強く出る傾向 (2-3個) */
  dominant_tendencies: string[];
  /** 逆に抑制される傾向 (0-2個) */
  counter_patterns: string[];
  /** このドメインで陥りやすい落とし穴 */
  risk_pattern: string | null;
}

// ── ドメイン検出シグナル ──

const DOMAIN_SIGNALS: Record<QueryDomain, RegExp[]> = {
  romance: [
    /彼[女氏]/, /好きな[人子]/, /告白/, /デート/, /付き合/,
    /恋/, /元カノ|元カレ|元彼|元彼女/, /片[思想]い/, /気にな[るっ].*[人子相手]/,
    /LINE.*返[信事].*[彼好相手]/, /脈/, /アプローチ/, /振[らり]/,
    /距離.*縮/, /誘[いうえおわ].*[彼好相手デート]/, /関係.*進/,
  ],
  work: [
    /上司/, /同僚/, /クライアント|取引先/, /面接/, /プロジェクト/,
    /業務/, /職場/, /転職/, /キャリア/, /昇[進格]/, /会議/,
    /プレゼン/, /報告/, /納期/, /残業/, /部下/, /先輩.*仕事|仕事.*先輩/,
    /ビジネス/, /起業/, /退職/,
  ],
  friend: [
    /友達/, /友人/, /仲間/, /サークル/, /グループ/,
    /幼なじみ|幼馴染/, /地元.*[友仲]/, /遊び.*誘/, /旧友/,
  ],
  family: [
    /親[^友しい]/, /母[親さ]?[がにはを]/, /父[親さ]?[がにはを]/, /兄[さ弟]?[がにはを]/, /姉[さ妹]?[がにはを]/,
    /弟[がにはを]/, /妹[がにはを]/, /家族/, /実家/, /義[母父兄姉弟妹]/,
    /祖[父母]/, /親戚/, /帰省/,
  ],
  self: [
    /やる気/, /自信/, /不安[だで]/, /モチベ/, /落ち込[むみんで]/,
    /疲れ[たて]/, /眠れ/, /イライラ/, /焦[りる]/, /何もしたくない/,
    /自分[がはのを].*わから/, /どうしたらいい.*自分/,
  ],
  daily_guidance: [
    /今日.*何/, /何し[たよ]/, /おすすめ.*今日/, /予定/, /スケジュール/,
    /やること/, /過ごし方/,
  ],
  general: [], // fallback
};

// ── 隠れ変数検出シグナル ──

const TARGET_PERSON_SIGNALS = /[彼彼女あの人この人相手].*[がにはをの]|上司|部下|母|父|友達|先輩|後輩|恋人|パートナー|好きな[人子]|気になる[人子]/;
const TARGET_GROUP_SIGNALS = /みんな|グループ|チーム|メンバー|飲み会|集まり|パーティ|会議/;

const CLOSE_RELATION_SIGNALS = /恋人|彼[女氏]|親友|家族|パートナー|大事.*人|好き.*[人子]|気になる[人子]/;
const DISTANT_RELATION_SIGNALS = /知らない人|友達の友達|初対面|あまり知ら|よく知ら/;

const IMMEDIATE_SIGNALS = /今日|今夜|今から|今すぐ|さっき|ついさっき|返信.*待[っち]/;
const SOON_SIGNALS = /明日|今週|近いうち|そろそろ/;

const HIGH_STAKE_SIGNALS = /告白|別れ|転職|退職|結婚|離婚|好き.*伝え|喧嘩.*大|裏切|人生/;
const LOW_STAKE_SIGNALS = /ちょっと|軽[いく]|些細|小さい|大したことない/;

const HIGH_SOCIAL_RISK_SIGNALS = /関係.*壊|嫌われ|信用.*失|評価.*下|みんな.*[前で知怒]|噂/;
const IRREVERSIBLE_SIGNALS = /告白|退職|送[っるれ].*取り消せ|言[っいう].*取り消|一度しか|最後/;

// ── 情報量シグナル検出 ──

const DECISION_TARGET_SIGNALS = /[すべべるった]き[？?]|迷[っいう]|どう[すし]|行[くか]べき|やるべき|送[るり]べき|買[うお]べき|言[うお]べき|返[すし]べき|辞め[るた]べき|断[るっ]べき|受け[るた]べき|始め[るた]べき|続け[るた]べき|したい[。、けんが]|したいんだけど|[？?]$/;
const CONTEXT_REASON_SIGNALS = /けど|だけど|だし|し[、。]|ので|から[、。]|ために|のに|が[、。]|ものの|ただ[、。]|んだけど/;
const CONSTRAINT_TRADEOFF_SIGNALS = /[かが].*[かが]|AかBか|する.*しない|行く.*行かない|でも[、。]|とはいえ|反面|その反面|半面|一方で|メリット|デメリット|けど.*けど|が.*一方/;
const TIME_SIGNAL_ALL = /今日|今夜|明日|今週|来週|今月|今すぐ|さっき|最近|昨日|今から|朝|昼|夜|午前|午後|[0-9０-９]+時|[0-9０-９]+分|月曜|火曜|水曜|木曜|金曜|土曜|日曜/;

/**
 * 入力文の情報量を推定する（regex ベース、レイテンシゼロ）。
 * ambiguity_score だけでは捉えられない「文脈の充実度」を測る。
 */
function computeInformationScore(message: string): InformationSignals {
  const has_decision_target = DECISION_TARGET_SIGNALS.test(message);
  const has_context_reason = CONTEXT_REASON_SIGNALS.test(message);
  const has_constraint_or_tradeoff = CONSTRAINT_TRADEOFF_SIGNALS.test(message);
  const has_time_signal = TIME_SIGNAL_ALL.test(message);

  const len = message.length;
  const input_length_bucket: InformationSignals["input_length_bucket"] =
    len < 15 ? "short" : len < 40 ? "medium" : "long";

  // 加重スコア: 各シグナルに重みをつけて合計 (0.0–1.0)
  let score = 0;
  if (has_decision_target) score += 0.25;
  if (has_context_reason) score += 0.25;
  if (has_constraint_or_tradeoff) score += 0.2;
  if (has_time_signal) score += 0.15;
  if (input_length_bucket === "long") score += 0.15;
  else if (input_length_bucket === "medium") score += 0.05;

  return {
    has_decision_target,
    has_context_reason,
    has_constraint_or_tradeoff,
    has_time_signal,
    input_length_bucket,
    score: Math.min(1, score),
  };
}

// ── Daily Guidance 検出パターン ──
const DAILY_GUIDANCE_SIGNALS = [
  /今日.*何し[たよ]/, /今日.*どう[すし]/, /今日.*過ごし/,
  /きょう.*何し/, /きょう.*どう[すし]/, /きょう.*やる/,
  /何し[たよ].*いい/, /何する.*いい/, /何すればいい/,
  /何をすべき/, /何やろう/, /どう過ごし/,
  /暇[だな]/, /ひま[だな]/, /やることない/, /やることがない/,
  /今日の予定/, /今日のおすすめ/, /今日の過ごし方/,
  /やる気.*ない.*何/, /だるい.*何/, /疲れ.*何[すし]/,
  /休み.*何/, /休日.*何/, /オフ.*何/,
  /朝.*何し/, /午後.*何/, /夜.*何[すし]/,
  /何からやれば/, /何から始め/, /手がつかない/,
  /何もしたくない/, /動けない.*けど/, /何していいか/,
  /今日一日/, /1日.*どう/, /一日.*どう/,
];

/**
 * Daily Guidance ドメインかどうか判定する。
 * 「今日何したらいい？」系の open-ended な日常ガイダンスリクエスト。
 */
export function isDailyGuidanceQuery(message: string): boolean {
  const m = message.toLowerCase();
  // 具体的な判断対象がある場合は除外（判断エンジンに任せる）
  if (/べきか|した方がいい|するかしないか|行くか行かないか/.test(m)) return false;
  // 特定の対人相手がいる場合は除外
  if (/彼[女氏]|上司|先輩|後輩|友達.*に|親に/.test(m)) return false;
  return DAILY_GUIDANCE_SIGNALS.some((s) => s.test(m));
}

/**
 * ユーザーの質問からドメイン・曖昧性・隠れ変数を解析する。
 * LLM不使用（regex ベース、レイテンシゼロ）。
 */
export function analyzeQueryContext(message: string): QueryContext {
  const msg = message;

  // ── Daily Guidance 検出（ドメイン検出より先に判定） ──
  if (isDailyGuidanceQuery(msg)) {
    const hv: HiddenVariables = {
      target_type: "abstract",
      relationship_distance: "unknown",
      urgency: /今日|きょう|朝/.test(msg) ? "immediate" : "soon",
      emotional_stake: "low",
      social_risk: "low",
      reversibility: "reversible",
    };
    const unknowns = Object.values(hv).filter((v) => v === "unknown").length;
    return {
      domain: "daily_guidance",
      domain_confidence: 0.9,
      hidden_variables: hv,
      ambiguity_score: unknowns / 6,
      information: computeInformationScore(message),
    };
  }

  // ── ドメイン検出 ──
  let bestDomain: QueryDomain = "general";
  let bestScore = 0;
  for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS) as [QueryDomain, RegExp[]][]) {
    if (domain === "general") continue;
    const hits = signals.filter((s) => s.test(msg)).length;
    if (hits > bestScore) {
      bestScore = hits;
      bestDomain = domain;
    }
  }
  const domain_confidence = bestScore === 0 ? 0 : Math.min(1, bestScore * 0.35);

  // ── 隠れ変数検出 ──
  const hv: HiddenVariables = {
    target_type: "unknown",
    relationship_distance: "unknown",
    urgency: "unknown",
    emotional_stake: "unknown",
    social_risk: "unknown",
    reversibility: "unknown",
  };

  // target_type
  if (TARGET_PERSON_SIGNALS.test(msg)) hv.target_type = "specific_person";
  else if (TARGET_GROUP_SIGNALS.test(msg)) hv.target_type = "group";
  else if (/自分|自信|やる気|モチベ|気分/.test(msg)) hv.target_type = "abstract";

  // relationship_distance
  if (CLOSE_RELATION_SIGNALS.test(msg)) hv.relationship_distance = "close";
  else if (DISTANT_RELATION_SIGNALS.test(msg)) hv.relationship_distance = "distant";
  else if (hv.target_type === "specific_person") hv.relationship_distance = "medium";

  // urgency
  if (IMMEDIATE_SIGNALS.test(msg)) hv.urgency = "immediate";
  else if (SOON_SIGNALS.test(msg)) hv.urgency = "soon";
  // 行動系質問で時間不明 → unknown のまま

  // emotional_stake
  if (HIGH_STAKE_SIGNALS.test(msg)) hv.emotional_stake = "high";
  else if (LOW_STAKE_SIGNALS.test(msg)) hv.emotional_stake = "low";
  else if (bestDomain === "romance") hv.emotional_stake = "medium"; // 恋愛はデフォで中
  else if (bestDomain === "self") hv.emotional_stake = "medium";

  // social_risk
  if (HIGH_SOCIAL_RISK_SIGNALS.test(msg)) hv.social_risk = "high";
  else if (hv.relationship_distance === "distant") hv.social_risk = "low";

  // reversibility
  if (IRREVERSIBLE_SIGNALS.test(msg)) hv.reversibility = "irreversible";
  else if (/試[すせし]|ちょっと|軽く|見るだけ|聞くだけ/.test(msg)) hv.reversibility = "reversible";

  // ── 曖昧性スコア ──
  const unknowns = Object.values(hv).filter((v) => v === "unknown").length;
  const ambiguity_score = unknowns / 6; // 6変数中のunknown率

  // ── 最重要欠落変数（clarify用） ──
  let critical_missing: string | undefined;
  if (hv.target_type === "unknown") {
    critical_missing = "誰に対して？（具体的な相手がいるか）";
  } else if (hv.emotional_stake === "unknown" && hv.social_risk === "unknown") {
    critical_missing = "どのくらい重要な場面？";
  } else if (hv.urgency === "unknown" && hv.emotional_stake === "high") {
    critical_missing = "いつまでに決める必要がある？";
  }

  return {
    domain: bestDomain,
    domain_confidence,
    hidden_variables: hv,
    ambiguity_score,
    critical_missing,
    information: computeInformationScore(message),
  };
}

/**
 * 応答モードを選択する（v2: 情報量ゲート付き）。
 *
 * 判定フロー:
 *   1. clarify: 高曖昧 + 高リスク + 判断不能 → 確認を求める
 *   2. branch (高曖昧): ambiguity > 0.65 → 分岐提示
 *   3. 中間帯 (0.5–0.65): 情報量で判定
 *      - 情報量あり → conclude
 *      - 情報量なし → branch
 *   4. conclude: デフォルト。判断接続最優先
 *
 * @returns ResponseMode（後方互換）
 */
export function selectResponseMode(ctx: QueryContext, lens?: RelationalLens | null): ResponseMode {
  return selectResponseModeWithReason(ctx, lens).mode;
}

/**
 * 応答モードを選択し、決定理由も返す（監査・analytics 用）。
 *
 * v2 設計思想:
 *   - ambiguity_score は隠れ変数6個中の unknown 率だが、
 *     自然文では4個以上が unknown になるのが普通（= 0.67以上）
 *   - そのため ambiguity_score だけで branch を決めると過剰発火する
 *   - 情報量ゲート（入力文に判断対象・理由・制約があるか）で補正する
 *   - branch は「本当に手がかりがない短文」に限定する
 */
export function selectResponseModeWithReason(
  ctx: QueryContext,
  lens?: RelationalLens | null,
): ModeDecision {
  const { hidden_variables, information } = ctx;
  let ambiguity_score = ctx.ambiguity_score;

  // ── P2-1: relationalLens で確認済みの変数は ambiguity から差し引く ──
  // hidden_variables(6変数)の unknown 率だけだと、lens で判明済みの情報が反映されない
  if (lens) {
    let lensConfirmed = 0;
    if (lens.target_role !== "unknown") lensConfirmed++;
    if (lens.interaction_purpose !== "unknown") lensConfirmed++;
    if (lens.relational_temperature !== "unknown") lensConfirmed++;
    if (lens.risk_direction !== "unknown") lensConfirmed++;
    // communication_register は判断に影響小 → カウントしない
    const hvUnknowns = Object.values(hidden_variables).filter((v) => v === "unknown").length;
    // lens確認分を差し引き、元の6変数ベースで再計算
    const effectiveUnknowns = Math.max(0, hvUnknowns - lensConfirmed);
    ambiguity_score = effectiveUnknowns / 6;
  }

  // 1. clarify: 高曖昧 + 高リスク + 判断対象不明
  if (
    ambiguity_score >= 0.83 &&
    (hidden_variables.emotional_stake === "high" ||
     hidden_variables.reversibility === "irreversible") &&
    hidden_variables.target_type === "unknown"
  ) {
    return { mode: "clarify", reason: "clarify_high_ambiguity_high_stake" };
  }

  // 1b. 対人clarify（独立条件）: 相手が誰かで結論が変わるケース
  //     info.score に依存しない。involves_other + target_role unknown が条件。
  //     ただし、対人行動の具体性が高い（ドメインが対人系 or ステーク高）場合に限定
  if (
    lens &&
    lens.involves_other &&
    lens.target_role === "unknown" &&
    (ctx.domain === "romance" || ctx.domain === "work" || ctx.domain === "family" ||
     hidden_variables.emotional_stake === "high" ||
     hidden_variables.reversibility === "irreversible" ||
     lens.interaction_purpose !== "unknown") // 目的は分かるが相手が不明 → 聞くべき
  ) {
    return { mode: "clarify", reason: "clarify_relational_unknown" };
  }

  // 2. 情報量ゲート付き判定
  //    ambiguity_score が高くても、入力文に十分な文脈があれば conclude
  if (ambiguity_score > 0.5) {
    if (information.score >= 0.25) {
      return { mode: "conclude", reason: "conclude_mid_ambiguity_info_sufficient" };
    }
    return { mode: "branch", reason: ambiguity_score > 0.65
      ? "branch_high_ambiguity"
      : "branch_mid_ambiguity_low_info" };
  }

  // 3. conclude: 低曖昧。判断接続最優先
  return { mode: "conclude", reason: "conclude_low_ambiguity" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Relational Lens — 関係性コンテクスト構造化
// 「誰に対して」「何のために」「どんな距離感で」を判断の主変数にする
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 相手の役割（uchi/soto + 権力関係を包含） */
export type TargetRole =
  | "boss" | "senior" | "colleague" | "subordinate" | "client"  // work hierarchy
  | "friend" | "close_friend" | "acquaintance"                   // friendship spectrum
  | "family" | "partner" | "ex" | "crush"                        // intimate/family
  | "stranger" | "self" | "unknown";                              // other

/** 関わりの目的 */
export type InteractionPurpose =
  | "apologize" | "reconnect" | "boundary" | "help"
  | "inform" | "maintain" | "deepen" | "confess" | "end"
  | "unknown";

/** 関係の温度 */
export type RelationalTemperature = "hot" | "warm" | "cool" | "frozen" | "unknown";

/** リスクの方向性 */
export type RiskDirection = "do_risky" | "skip_risky" | "symmetric" | "unknown";

/** コミュニケーション水準 */
export type CommunicationRegister = "casual" | "polite" | "formal" | "unknown";

/** 関係性レンズ: 5変数で対人判断の構造を捉える */
export interface RelationalLens {
  target_role: TargetRole;
  interaction_purpose: InteractionPurpose;
  relational_temperature: RelationalTemperature;
  risk_direction: RiskDirection;
  communication_register: CommunicationRegister;
  /** この判断に他者が関与しているか */
  involves_other: boolean;
}

// ── ターゲットロール検出パターン ──

const TARGET_ROLE_PATTERNS: Array<{ role: TargetRole; pattern: RegExp }> = [
  // work hierarchy (具体的なものから先にマッチ)
  { role: "boss", pattern: /上司|社長|部長|課長|マネージャー|ボス/ },
  { role: "senior", pattern: /先輩/ },
  { role: "subordinate", pattern: /部下|後輩/ },
  { role: "colleague", pattern: /同僚|同期/ },
  { role: "client", pattern: /クライアント|取引先|お客|顧客/ },
  // intimate/family
  { role: "partner", pattern: /彼[女氏]|恋人|パートナー|旦那|夫|妻|嫁/ },
  { role: "ex", pattern: /元カノ|元カレ|元彼|元彼女|元[旦夫妻嫁]|別れた.*[人相手]/ },
  { role: "crush", pattern: /好きな[人子]|気になる[人子相手]|片[思想]い|気になっ[てた]/ },
  { role: "family", pattern: /母[親さ]?[がにはをの、。]|父[親さ]?[がにはをの、。]|親[がにはをの、。]|兄[がにはをの、。]|姉[がにはをの、。]|弟[がにはをの、。]|妹[がにはをの、。]|家族|実家|義[母父兄姉弟妹]|祖[父母]|親戚/ },
  { role: "close_friend", pattern: /親友|幼なじみ|幼馴染|大事.*友|仲[がの].*いい.*友/ },
  { role: "friend", pattern: /友達|友人|仲間/ },
  { role: "acquaintance", pattern: /知[人り]合い|友達の友達|あまり.*[知会]ら|よく知らな|顔見知り/ },
  { role: "stranger", pattern: /知らない人|初対面|初めて[会話]/ },
  // self
  { role: "self", pattern: /自分[がはのを]|自信|やる気|モチベ/ },
];

// ── 目的検出パターン ──

const PURPOSE_PATTERNS: Array<{ purpose: InteractionPurpose; pattern: RegExp }> = [
  { purpose: "apologize", pattern: /謝[りるれろら]|謝罪|ごめん.*言|悪かった.*伝/ },
  { purpose: "confess", pattern: /告白|好き.*[伝言]|気持ち.*[伝言]/ },
  { purpose: "reconnect", pattern: /久しぶり.*連絡|連絡.*取[りる].*直|また.*[会話連]|再[会開]|戻[りるれ]/ },
  { purpose: "boundary", pattern: /断[りるれろら]|距離.*[取置]|やめ.*[伝言]|拒否|嫌.*[伝言]/ },
  { purpose: "help", pattern: /助[けか]|頼[みむ]|相談|お願い|力.*貸|手.*[貸借]/ },
  { purpose: "end", pattern: /別れ|終わ[りる]|縁.*切|関係.*[終切]|離婚/ },
  { purpose: "inform", pattern: /報告|伝え[たるれ]|知らせ|連絡.*[するした]|返[信事]/ },
  { purpose: "maintain", pattern: /付き合い|義理|顔.*出|関係.*[維保]|挨拶/ },
  { purpose: "deepen", pattern: /もっと.*[仲知近]|距離.*[縮近]|仲良[くし]|深[めい]/ },
];

// ── 温度検出パターン ──

const HOT_TEMPERATURE = /喧嘩|揉め|ぎくしゃく|険悪|言い合い|気まず/;
const WARM_TEMPERATURE = /仲[がの]いい|いつも.*[一緒仲会]|普通[にの]|変わらず/;
const COOL_TEMPERATURE = /疎遠|久しぶり|最近.*[会話連].*ない|離れ|距離.*[でがあ]/;
const FROZEN_TEMPERATURE = /絶縁|ブロック|無視|音信不通|何年も.*ない|完全.*[切断終]/;

// ── リスク方向の推定テーブル ──
// target_role × purpose からリスクの方向を導出

const RISK_DIRECTION_TABLE: Partial<Record<TargetRole, Partial<Record<InteractionPurpose, RiskDirection>>>> = {
  boss: { apologize: "skip_risky", inform: "skip_risky", boundary: "do_risky", help: "symmetric" },
  senior: { apologize: "skip_risky", inform: "skip_risky", boundary: "do_risky" },
  colleague: { apologize: "skip_risky", boundary: "symmetric", reconnect: "symmetric" },
  friend: { apologize: "skip_risky", reconnect: "skip_risky", boundary: "do_risky", maintain: "symmetric" },
  close_friend: { apologize: "skip_risky", reconnect: "skip_risky", boundary: "do_risky" },
  family: { apologize: "skip_risky", boundary: "do_risky", reconnect: "skip_risky" },
  partner: { apologize: "skip_risky", boundary: "symmetric", end: "symmetric", confess: "do_risky" },
  ex: { reconnect: "do_risky", confess: "do_risky", end: "skip_risky", boundary: "skip_risky" },
  crush: { confess: "symmetric", reconnect: "skip_risky", deepen: "symmetric" },
  acquaintance: { reconnect: "symmetric", maintain: "symmetric", boundary: "symmetric" },
  stranger: { inform: "symmetric", help: "symmetric" },
};

// ── コミュニケーション水準の推定テーブル ──

const REGISTER_TABLE: Partial<Record<TargetRole, CommunicationRegister>> = {
  boss: "formal",
  senior: "polite",
  client: "formal",
  colleague: "polite",
  subordinate: "polite",
  friend: "casual",
  close_friend: "casual",
  family: "casual",
  partner: "casual",
  ex: "polite",
  crush: "polite",
  acquaintance: "polite",
  stranger: "formal",
};

/**
 * ユーザーの質問テキストから関係性レンズを抽出する（regexベース、レイテンシゼロ）。
 *
 * 設計原則:
 *  - 推定できないものは `unknown` で返す（誤推定より安全）
 *  - target_role が特定できれば、temperature/risk/register は高精度で導出可能
 *  - unknown が多い場合は clarify で補完する
 */
export function extractRelationalLens(message: string): RelationalLens {
  // ── target_role ──
  let target_role: TargetRole = "unknown";
  for (const { role, pattern } of TARGET_ROLE_PATTERNS) {
    if (pattern.test(message)) {
      target_role = role;
      break;
    }
  }

  // self 判定: 対人シグナルがなく、self シグナルがある場合
  // 「連絡する」「謝る」「伝える」等は本質的に対人行動
  const INTERPERSONAL_ACTION = /連絡|謝[りるれろらっ]|伝え|送[るり]|会[いう]|誘[いうわ]|断[りるれろらっ]|頼[みむ]|告白|相談|返[信事]|メッセージ|LINE|メール|電話|距離.*[置お]|離れ/;
  const involves_other = target_role !== "self" && target_role !== "unknown"
    ? true
    : target_role === "unknown"
      ? INTERPERSONAL_ACTION.test(message) || /相手|あの人|この人/.test(message)
      : false;

  // ── interaction_purpose ──
  let interaction_purpose: InteractionPurpose = "unknown";
  for (const { purpose, pattern } of PURPOSE_PATTERNS) {
    if (pattern.test(message)) {
      interaction_purpose = purpose;
      break;
    }
  }

  // ── relational_temperature ──
  let relational_temperature: RelationalTemperature = "unknown";
  if (FROZEN_TEMPERATURE.test(message)) relational_temperature = "frozen";
  else if (HOT_TEMPERATURE.test(message)) relational_temperature = "hot";
  else if (COOL_TEMPERATURE.test(message)) relational_temperature = "cool";
  else if (WARM_TEMPERATURE.test(message)) relational_temperature = "warm";

  // ── risk_direction: role × purpose テーブルから導出 ──
  let risk_direction: RiskDirection = "unknown";
  if (target_role !== "unknown" && interaction_purpose !== "unknown") {
    risk_direction = RISK_DIRECTION_TABLE[target_role]?.[interaction_purpose] ?? "unknown";
  }

  // ── communication_register: role から導出 ──
  const communication_register: CommunicationRegister =
    target_role !== "unknown" ? (REGISTER_TABLE[target_role] ?? "unknown") : "unknown";

  return {
    target_role,
    interaction_purpose,
    relational_temperature,
    risk_direction,
    communication_register,
    involves_other,
  };
}

// ── 判断フレーム注入用テーブル: 相手の役割が判断にどう影響するか ──

const ROLE_JUDGMENT_FRAME: Record<Exclude<TargetRole, "unknown" | "self">, string> = {
  boss: "上司との関係: 報告義務・信頼構築が最重要。内容を整理してから伝えるのが基本。タイミングと準備が評価に直結する",
  senior: "先輩との関係: 敬意を保ちつつも、必要なことは伝えるべき。遠慮しすぎると「壁を作っている」と思われるリスクもある",
  colleague: "同僚との関係: 対等な立場。率直さが関係を深める。ただし職場の空気を読む必要がある",
  subordinate: "部下・後輩との関係: 立場の非対称性に注意。相手は断りにくい立場にある。配慮ある伝え方が信頼を作る",
  client: "取引先との関係: プロフェッショナルな距離感。迅速さと正確さが信頼に直結する",
  friend: "友人との関係: 気軽さが大事だが、甘えすぎると負担になる。用件がなくても連絡できる関係が健全",
  close_friend: "親友との関係: 内（うち）の関係。甘えが許される。連絡しないことが「壁を作っている」と解釈されるリスクがある",
  acquaintance: "知り合い程度の関係: 外（そと）の関係。用件がない連絡は不自然に映る可能性がある。遠慮が期待される距離感",
  family: "家族との関係: 最も内（うち）の関係。甘えが前提だが、だからこそ言いにくいこともある。距離の取り方が難しい",
  partner: "恋人・パートナーとの関係: 親密さと個の境界のバランス。感情的になりやすい場面では「伝え方」が結果を大きく変える",
  ex: "元恋人との関係: 連絡すること自体がシグナルになる。目的の自覚が最重要。無意識の執着か、本当の用件かを見極める",
  crush: "気になる相手との関係: 距離の詰め方がカギ。急すぎると「空気が読めない」、遅すぎると「興味がない」と映る",
  stranger: "面識が薄い・初対面の相手: 第一印象が全て。丁寧さと簡潔さのバランスが重要",
};

const PURPOSE_JUDGMENT_FRAME: Record<Exclude<InteractionPurpose, "unknown">, string> = {
  apologize: "目的は謝罪: 早いほうがいい。ただし感情的な勢いではなく、何を謝るか明確にしてから。言い訳を混ぜない",
  reconnect: "目的は再接続: 自然なきっかけがあると良い。「久しぶり」だけでも十分なシグナルになる",
  boundary: "目的は境界設定: 言うべきことを言う場面。攻撃ではなく「自分はこう感じている」を伝える形が効果的",
  help: "目的は助けを求める: 具体的に何を頼みたいか明確にする。曖昧な「相談」より「○○について教えて」が相手の負担を下げる",
  inform: "目的は情報伝達: 簡潔・正確・タイミングが全て。感情を混ぜすぎない",
  maintain: "目的は関係維持: 義務的にならないように。形だけの連絡は相手にも伝わる",
  deepen: "目的は関係深化: 一歩踏み込む勇気が必要だが、相手のペースも尊重する",
  confess: "目的は気持ちを伝える: 最も不可逆性が高い行動の一つ。タイミング・場所・伝え方の準備が結果を大きく左右する",
  end: "目的は関係を終わらせる: 決意が固いなら先延ばしが最悪の選択。ただし感情的な衝動でないか確認が必要",
};

const TEMPERATURE_JUDGMENT_MODIFIER: Record<Exclude<RelationalTemperature, "unknown">, string> = {
  hot: "関係が緊張状態: 感情的にならず冷静なアプローチが重要。一度クールダウンしてからの方が効果的な場合が多い",
  warm: "関係は安定: 自然体でOK。気負わず普段通りの距離感で",
  cool: "関係が疎遠気味: 再接触のハードルがある。軽い入口（短いメッセージ、共通の話題）から始めるのが自然",
  frozen: "関係が断絶状態: 連絡すること自体が大きなシグナル。本当にそうしたい理由を自覚してから",
};

/**
 * RelationalLens をプロンプト注入用のテキストブロックに変換する。
 * unknown が多い場合は空文字列を返す（余計な情報でLLMを混乱させない）。
 */
export function buildRelationalContext(lens: RelationalLens): string {
  // unknown/self だらけなら注入しない
  const knownCount = [
    lens.target_role !== "unknown" && lens.target_role !== "self",
    lens.interaction_purpose !== "unknown",
    lens.relational_temperature !== "unknown",
  ].filter(Boolean).length;

  if (knownCount === 0) return "";

  const parts: string[] = [
    "",
    "# 関係性コンテクスト（この判断で最も重要な変数）",
    "**以下の関係性情報を判断の主軸として使うこと。性格データだけで結論を出さない。**",
    "",
  ];

  // target_role
  if (lens.target_role !== "unknown" && lens.target_role !== "self") {
    const frame = ROLE_JUDGMENT_FRAME[lens.target_role];
    parts.push(`## 相手: ${lens.target_role}`);
    parts.push(frame);
    parts.push("");
  }

  // interaction_purpose
  if (lens.interaction_purpose !== "unknown") {
    const frame = PURPOSE_JUDGMENT_FRAME[lens.interaction_purpose];
    parts.push(`## 目的: ${lens.interaction_purpose}`);
    parts.push(frame);
    parts.push("");
  }

  // relational_temperature
  if (lens.relational_temperature !== "unknown") {
    const modifier = TEMPERATURE_JUDGMENT_MODIFIER[lens.relational_temperature];
    parts.push(`## 関係の温度: ${lens.relational_temperature}`);
    parts.push(modifier);
    parts.push("");
  }

  // risk_direction
  if (lens.risk_direction !== "unknown") {
    const riskLabel = lens.risk_direction === "do_risky"
      ? "⚠ 行動するリスクの方が高い。慎重なアプローチが安全"
      : lens.risk_direction === "skip_risky"
        ? "⚠ 行動しないリスクの方が高い。先延ばしが最悪の選択になりうる"
        : "リスクは対称的。行動してもしなくても同程度のリスクがある";
    parts.push(`## リスク方向: ${riskLabel}`);
    parts.push("");
  }

  // communication_register
  if (lens.communication_register !== "unknown") {
    const registerLabel = {
      casual: "カジュアルなトーンが自然（タメ口・スタンプ・短文OK）",
      polite: "丁寧だが堅すぎないトーンが適切（です/ます調・簡潔に）",
      formal: "フォーマルなトーンが必要（敬語・要件明確・構成を整える）",
    }[lens.communication_register];
    parts.push(`## コミュニケーション水準: ${registerLabel}`);
    parts.push("");
  }

  parts.push("**判断ルール**: 上記の関係性コンテクストが性格データと矛盾する場合、関係性コンテクストを優先すること。");
  parts.push("（例: 性格的に「攻め」タイプでも、元恋人への再接触は慎重に。性格的に「守り」タイプでも、上司への報告は先延ばししない。）");

  return parts.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2: ドメイン別性格オーバーレイ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ドメインごとに参照すべき軸の定義 */
const DOMAIN_AXIS_MAP: Record<Exclude<QueryDomain, "general" | "daily_guidance">, {
  primary: TraitAxisKey[];
  secondary: TraitAxisKey[];
}> = {
  romance: {
    primary: ["intimacy_pace", "attachment_style", "reassurance_need"],
    secondary: ["emotional_variability", "social_initiative", "public_private_gap"],
  },
  work: {
    primary: ["decision_tempo", "decomposition", "perfectionist_vs_pragmatic"],
    secondary: ["locus_of_control", "direct_vs_diplomatic", "plan_vs_spontaneous"],
  },
  friend: {
    primary: ["social_initiative", "boundary_awareness", "friend_mode_fit"],
    secondary: ["introvert_vs_extrovert", "independence_vs_harmony"],
  },
  family: {
    primary: ["attachment_style", "fairness_sensitivity", "emotional_regulation"],
    secondary: ["boundary_awareness", "control_tendency", "shame_vs_guilt"],
  },
  self: {
    primary: ["locus_of_control", "growth_mindset", "rumination_tendency"],
    secondary: ["emotional_regulation", "shame_vs_guilt", "exploration_closure"],
  },
};

/** 軸スコアから傾向文を生成する内部ヘルパー */
function describeAxisTendency(axisId: TraitAxisKey, score: number): string | null {
  const def = TRAIT_AXES.find((a) => a.id === axisId);
  if (!def) return null;
  const intensity = Math.abs(score - 0.5) * 2;
  if (intensity < 0.15) return null; // 弱すぎる

  const side = score >= 0.5 ? def.labelRight : def.labelLeft;
  const strength = intensity > 0.5 ? "" : "やや";
  return `${strength}${side}`;
}

/**
 * personality + domain → このドメインでの性格オーバーレイを構築。
 * 「この人は恋愛ではこうなりやすい」を生成する。
 */
export function buildDomainOverlay(
  personality: AlterPersonality,
  domain: QueryDomain,
): DomainOverlay | null {
  if (domain === "general" || domain === "daily_guidance") return null;

  const mapping = DOMAIN_AXIS_MAP[domain];
  const scores = personality.axisScores;
  const tendencies: string[] = [];
  const counters: string[] = [];

  // primary 軸から傾向を抽出
  for (const axisId of mapping.primary) {
    const score = scores[axisId];
    if (score === undefined || score === null) continue;
    const desc = describeAxisTendency(axisId, score);
    if (desc) tendencies.push(desc);
  }

  // relationship_mode_split が高い → ドメイン間で逆の傾向が出る
  const modeSplit = scores.relationship_mode_split;
  if (modeSplit !== undefined && modeSplit > 0.6) {
    // このドメインの主軸傾向の「逆」が他ドメインで出る
    if (domain === "romance" && scores.intimacy_pace !== undefined) {
      if (scores.intimacy_pace < 0.4) {
        counters.push("恋愛では距離を縮めるのに時間がかかるが、仕事相手には逆に早く整えすぎる傾向");
      } else if (scores.intimacy_pace > 0.6) {
        counters.push("恋愛では距離を早く縮めたがるが、友人関係では逆に慎重になりやすい");
      }
    }
    if (domain === "work" && scores.direct_vs_diplomatic !== undefined) {
      if (scores.direct_vs_diplomatic < 0.4) {
        counters.push("仕事では率直に言えるが、恋愛や家族には言いたいことを飲み込みがち");
      } else if (scores.direct_vs_diplomatic > 0.6) {
        counters.push("仕事では配慮しすぎて言えないが、親しい相手には逆にストレートすぎる場面がある");
      }
    }
    if (domain === "friend" && scores.social_initiative !== undefined) {
      if (scores.social_initiative < 0.4) {
        counters.push("友達関係では受け身だが、仕事や恋愛では意外と自分から動ける");
      }
    }
  }

  // risk_pattern: coreWound × ドメイン
  let risk_pattern: string | null = null;
  const wound = personality.coreWoundShort;
  if (wound) {
    if (domain === "romance") {
      risk_pattern = `恋愛場面で「${wound}」が判断を歪めやすい。相手の反応を過剰に読んで動けなくなるリスク`;
    } else if (domain === "work") {
      risk_pattern = `仕事場面で「${wound}」が出ると、自分の判断を信じられず周囲に合わせすぎるリスク`;
    } else if (domain === "family") {
      risk_pattern = `家族場面で「${wound}」が最も生々しく出やすい。過去のパターンに引きずられるリスク`;
    }
  }

  return {
    domain,
    dominant_tendencies: tendencies.slice(0, 3),
    counter_patterns: counters.slice(0, 2),
    risk_pattern,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 4: ドメインオーバーレイ → TaggedFact 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DOMAIN_LABELS: Record<QueryDomain, string> = {
  romance: "恋愛",
  work: "仕事",
  friend: "友人関係",
  family: "家族",
  self: "自分自身",
  general: "",
  daily_guidance: "デイリーガイダンス",
};

/**
 * DomainOverlay → TaggedFact[] に変換。
 * 既存 buildTaggedFacts() の結果に concat して使う。
 */
function buildDomainFacts(overlay: DomainOverlay | null): TaggedFact[] {
  if (!overlay) return [];
  const facts: TaggedFact[] = [];
  const label = DOMAIN_LABELS[overlay.domain];

  if (overlay.dominant_tendencies.length > 0) {
    const joined = overlay.dominant_tendencies.join("・");
    facts.push({
      text: `${label}の場面では「${joined}」の傾向が強く出る`,
      tags: ["social_load", "impulse_caution"],
    });
  }
  for (const counter of overlay.counter_patterns) {
    facts.push({ text: counter, tags: ["personality_blind", "social_load"] });
  }
  if (overlay.risk_pattern) {
    facts.push({ text: overlay.risk_pattern, tags: ["core_wound", "blindspot"] });
  }
  return facts;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 5: モード別プロンプトセクション
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Mode B (branch) 用のフォーマットセクション */
function buildBranchFormatSection(ctx: QueryContext): string[] {
  return [
    "## フォーマット（分岐モード: 情報が不十分なため、分岐を示す）",
    "1行目: 最も可能性の高い状況での結論（断言）",
    "2-3行目: 根拠（ドメイン固有データ使用）",
    "4行目: 「ただし[条件]なら、[別の結論]。」（分岐1本だけ）",
    "最終行: 「次の一手:」で始まる行動指示",
    "",
    "**重要**: 分岐は1本だけ。最も可能性の高い結論を先に断言してから分岐を添える。",
    "分岐があっても判断放棄にはならない。「最も可能性が高い結論」は必ず断言すること。",
  ];
}

/** Mode C (clarify) 用のフォーマットセクション */
function buildClarifyFormatSection(ctx: QueryContext, lens: RelationalLens | null): string[] {
  // 関係性clarifyの場合: 相手の種類を聞く具体的な質問を生成
  let question: string;
  if (lens && lens.involves_other && lens.target_role === "unknown") {
    // 対人判断で相手が不明 → 「誰？」を聞く
    question = "仕事の相手ですか、それとも個人的な相手ですか？（上司/同僚/友達/恋人/家族 など）";
  } else if (lens && lens.target_role !== "unknown" && lens.interaction_purpose === "unknown") {
    // 相手は分かるが目的が不明 → 「なぜ？」を聞く
    const roleLabel = {
      boss: "上司", senior: "先輩", colleague: "同僚", subordinate: "後輩", client: "取引先",
      friend: "友達", close_friend: "親友", acquaintance: "知り合い",
      family: "家族", partner: "恋人", ex: "元恋人", crush: "気になる相手",
      stranger: "初対面の方", self: "自分自身",
    }[lens.target_role] ?? "その方";
    question = `${roleLabel}に対して、何をしたいですか？（謝りたい/つながりを戻したい/境界を引きたい/助けを求めたい など）`;
  } else {
    question = ctx.critical_missing ?? "この状況について、もう1つだけ教えて";
  }

  return [
    `1行目: 具体的な質問1つ（ヒント: ${question}）`,
    "2行目: なぜそれが判断に影響するかの1文説明",
    "",
    "**禁止**: 2つ以上の質問をしない。前置き不要。",
    "**必須**: 質問は「はい/いいえ」か「AかBか」で答えられる形にすること。",
    "応答は2行以内。メタデータブロックは不要。",
  ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 拡張版 buildPersonalizedFacts（ドメインオーバーレイ統合）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 既存 buildPersonalizedFacts の上位互換。
 * ドメインオーバーレイの fact を先頭に挿入する。
 */
export function buildPersonalizedFactsWithDomain(
  personality: AlterPersonality,
  homeContext: HomeAlterContextData | null | undefined,
  category: QuestionCategory,
  overlay: DomainOverlay | null,
): string[] {
  const baseFacts = buildTaggedFacts(personality, homeContext);
  const domainFacts = buildDomainFacts(overlay);
  // ドメイン fact を先頭に追加してから ranking
  const merged = [...domainFacts, ...baseFacts];
  return rankFactsForCategory(merged, category, 5); // ドメイン追加分で1枠増
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 拡張版 buildHomeAlterPrompt（モード別セクション注入）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 既存 buildHomeAlterPrompt にモード別フォーマットを注入する拡張版。
 * responseMode === "conclude" の場合は既存と完全同一の出力。
 */
export function buildHomeAlterPromptWithContext(
  personality: AlterPersonality,
  homeContext: HomeAlterContextData | null | undefined,
  category: QuestionCategory,
  userMessage: string,
  responseMode: ResponseMode,
  queryContext: QueryContext,
  overlay: DomainOverlay | null,
  userName?: string,
  relationalLens?: RelationalLens | null,
  skeleton?: JudgmentSkeleton | null,
): string {
  // Mode C (clarify) は専用の短いプロンプト
  if (responseMode === "clarify") {
    const sections: string[] = [
      "# 確認モード",
      "",
      "あなたはこの人を最も理解している、やさしく判断を支える存在。",
      "今回は情報が不十分で断言すると的外れになるリスクがある。",
      "判断精度を上げるために、**1問だけ**やさしく聞く。",
      "",
      ...buildClarifyFormatSection(queryContext, relationalLens ?? null),
      "",
      "# 制約",
      `- 一人称「僕」`,
      `- ${userName ? `ユーザーを「${userName}さん」と呼ぶ。「君」「あなた」は使わない。` : `「君」「あなた」と呼びかけない。`}`,
      "- 2行以内",
    ];
    return sections.join("\n");
  }

  // Mode A (conclude) or B (branch): 既存プロンプトベースで拡張
  const basePrompt = buildHomeAlterPrompt(personality, homeContext, category, userMessage, userName);

  // 関係性コンテクスト注入（conclude / branch 共通）
  const relationalBlock = relationalLens ? buildRelationalContext(relationalLens) : "";

  // 骨格ブロック注入（conclude / branch 共通）
  const skeletonBlock = skeleton ? buildSkeletonPromptBlock(skeleton) : "";

  if (responseMode === "conclude") {
    // Mode A: 関係性コンテクスト + 骨格 + ドメインコンテキスト
    let prompt = basePrompt + relationalBlock + skeletonBlock;
    if (overlay && overlay.dominant_tendencies.length > 0) {
      const domainSection = [
        "",
        `# ドメイン固有の傾向（${DOMAIN_LABELS[overlay.domain]}）`,
        `この人は${DOMAIN_LABELS[overlay.domain]}の場面では以下の傾向が出やすい:`,
        ...overlay.dominant_tendencies.map((t) => `- ${t}`),
        ...(overlay.counter_patterns.length > 0
          ? ["他の領域との差:", ...overlay.counter_patterns.map((c) => `- ${c}`)]
          : []),
        ...(overlay.risk_pattern ? [`⚠ ${overlay.risk_pattern}`] : []),
        "",
        "根拠を述べるとき、ドメイン固有傾向を使う。「君」「あなた」は使わない。",
      ].join("\n");
      prompt += domainSection;
    }
    return prompt;
  }

  // Mode B (branch): フォーマットセクションを差し替え
  // 既存プロンプトの「## フォーマット」セクションを branch 用に置換
  const branchFormat = buildBranchFormatSection(queryContext).join("\n");
  let replaced = basePrompt.replace(
    /## フォーマット（必ずこの順番）[\s\S]*?## 禁止/,
    branchFormat + "\n\n## 禁止",
  );
  // フォールバック: regex が失敗した場合は末尾に追加
  if (replaced === basePrompt) {
    replaced = basePrompt + "\n\n" + branchFormat;
  }

  // 関係性コンテクスト + 骨格注入
  replaced += relationalBlock + skeletonBlock;

  // ドメインセクション追加
  if (overlay && overlay.dominant_tendencies.length > 0) {
    const domainSection = [
      "",
      `# ドメイン固有の傾向（${DOMAIN_LABELS[overlay.domain]}）`,
      `この人は${DOMAIN_LABELS[overlay.domain]}の場面では以下の傾向が出やすい:`,
      ...overlay.dominant_tendencies.map((t) => `- ${t}`),
      ...(overlay.counter_patterns.length > 0
        ? ["他の領域との差:", ...overlay.counter_patterns.map((c) => `- ${c}`)]
        : []),
      ...(overlay.risk_pattern ? [`⚠ ${overlay.risk_pattern}`] : []),
      "",
      "根拠を述べるとき、ドメイン固有傾向を使う。「君」「あなた」は使わない。",
    ].join("\n");
    return replaced + domainSection;
  }
  return replaced;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 拡張版バリデータ（Mode B/C 対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Mode B/C の応答を検査する。
 * Mode A は既存 validateHomeAlterResponse をそのまま使う。
 */
export function validateHomeAlterResponseWithMode(
  response: string,
  userMessage: string,
  expectedKeywords: string[],
  responseMode: ResponseMode,
): HomeAlterValidation {
  if (responseMode === "conclude") {
    return validateHomeAlterResponse(response, userMessage, expectedKeywords);
  }

  if (responseMode === "clarify") {
    const trimmed = response.trim();
    const failures: string[] = [];
    if (!trimmed || trimmed.length < 5) failures.push("応答が空");
    if (trimmed.length > 200) failures.push("確認モードは200文字以内");
    // 質問で終わっているか
    if (!/[？?]/.test(trimmed)) failures.push("質問で終わっていない");
    // 2つ以上の質問禁止
    const questionMarks = (trimmed.match(/[？?]/g) ?? []).length;
    if (questionMarks > 2) failures.push("質問が多すぎる（1問だけ）");
    return { pass: failures.length === 0, failures };
  }

  // Mode B (branch): 既存バリデーションを緩和して使用
  const baseValidation = validateHomeAlterResponse(response, userMessage, expectedKeywords);
  // branch モードでは「ただし〜なら」の分岐があるべき
  const hasBranch = /ただし|もし|場合は|ケースでは/.test(response);
  if (!hasBranch) {
    baseValidation.failures.push("分岐（「ただし〜なら」）がない");
    baseValidation.pass = false;
  }
  return baseValidation;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reasoning Basis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function extractReasoningBasis(
  personality: AlterPersonality,
  homeContext?: HomeAlterContextData | null,
  _responseText?: string,
): AlterReasoningBasis {
  const usedAxes: AlterReasoningBasis["usedAxes"] = [];
  const dataPoints: string[] = [];

  const axisEntries = Object.entries(personality.axisScores)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([, a], [, b]) => Math.abs((b as number) - 0.5) - Math.abs((a as number) - 0.5))
    .slice(0, 3);

  for (const [key, value] of axisEntries) {
    const axisDef = TRAIT_AXES.find((a) => a.id === key);
    if (!axisDef || value === undefined) continue;
    const score = value as number;
    const side = score >= 0.5 ? "right" : "left";
    const sideLabel = side === "left" ? axisDef.labelLeft : axisDef.labelRight;
    const intensity = Math.abs(score - 0.5) * 2;
    const meaning = intensity > 0.4 ? `明確な${sideLabel}傾向` : `やや${sideLabel}寄り`;
    usedAxes.push({ axis: key, label: `${axisDef.labelLeft}/${axisDef.labelRight}`, score, meaning });
  }

  dataPoints.push(`タイプ: ${personality.archetypeName}`);
  if (personality.coreWoundShort) dataPoints.push(`核心: ${personality.coreWoundShort}`);
  if (homeContext?.weather?.label) dataPoints.push(`状態: ${homeContext.weather.emoji ?? ""} ${homeContext.weather.label}`);
  if (homeContext?.insight) dataPoints.push(`インサイト: ${homeContext.insight.slice(0, 60)}`);
  if (homeContext?.temporalDelta) dataPoints.push(`変化: ${homeContext.temporalDelta.slice(0, 60)}`);

  const obsCount = homeContext?.observationCount ?? 0;
  const reasoningSummary = obsCount > 0
    ? `${obsCount}回の観測データと${personality.archetypeName}型の判断特性に基づく提案`
    : `${personality.archetypeName}型の判断特性に基づく提案`;

  return { usedAxes, reasoningSummary, dataPoints };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5層品質防御アーキテクチャ
// Layer 1: 入力理解  Layer 2: 判断骨格  Layer 3: 応答生成制約
// Layer 4: 応答検証  Layer 5: 監査永続化
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Core Types ──

/** 情報の確度ラベル */
export type EvidenceSource = "known_from_user" | "user_confirmed" | "inferred" | "derived" | "unknown";

/** 確信度付き値 */
export interface ConfidentValue<T> {
  value: T;
  confidence: number; // 0.0–1.0
  source: EvidenceSource;
}

/** 全体の確信度 */
export type ConfidenceLevel = "high" | "medium" | "low";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1: 入力理解 — 「読めたつもり」を禁止
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 入力から抽出した理解構造 */
export interface InputUnderstanding {
  /** ユーザーの意図（何を決めたいか） */
  user_intent: ConfidentValue<string>;
  /** 判断対象（何について） */
  decision_target: ConfidentValue<string>;
  /** 判断スコープ（今回限りか、長期的か） */
  decision_scope: ConfidentValue<"immediate" | "short_term" | "long_term" | "unknown">;
  /** 制約条件（ユーザーが明示したもの） */
  constraints: string[];
  /** 欠落している重要情報 */
  missing_critical_info: string[];
  /** 全体の確信度 */
  confidence_level: ConfidenceLevel;
}

/**
 * Layer 1: ユーザー質問から構造化された理解を抽出する。
 *
 * 設計原則:
 *  - 読み取れたものは known_from_user
 *  - 文脈から推定したものは inferred
 *  - 分からないものは unknown と明示（事実扱い禁止）
 */
export function extractInputUnderstanding(
  message: string,
  queryContext: QueryContext,
  relationalLens: RelationalLens,
): InputUnderstanding {
  // ── user_intent ──
  let intentText = "不明";
  let intentConf = 0.3;
  let intentSource: EvidenceSource = "unknown";

  if (/[すべべるった]き[？?]|べき/.test(message)) {
    intentText = "行動の是非を判断したい";
    intentConf = 0.9;
    intentSource = "known_from_user";
  } else if (/迷[っいう]/.test(message)) {
    intentText = "迷いを解消したい";
    intentConf = 0.85;
    intentSource = "known_from_user";
  } else if (/どう[すし]|どうしたら/.test(message)) {
    intentText = "方法・アプローチを知りたい";
    intentConf = 0.85;
    intentSource = "known_from_user";
  } else if (/なん[でだ]|なぜ|どうして|原因/.test(message)) {
    intentText = "原因・理由を理解したい";
    intentConf = 0.9;
    intentSource = "known_from_user";
  } else if (/したい|やりたい|行きたい|会いたい|伝えたい/.test(message)) {
    intentText = "やりたいことの後押し・確認が欲しい";
    intentConf = 0.8;
    intentSource = "inferred";
  } else if (message.length > 5) {
    intentText = "判断・助言が欲しい";
    intentConf = 0.5;
    intentSource = "inferred";
  }

  // ── decision_target ──
  let targetText = "不明";
  let targetConf = 0.3;
  let targetSource: EvidenceSource = "unknown";

  // relational lens から対象を構築
  if (relationalLens.target_role !== "unknown" && relationalLens.target_role !== "self") {
    targetText = `${relationalLens.target_role}に対する行動`;
    targetConf = 0.85;
    targetSource = "known_from_user";
  } else if (relationalLens.involves_other) {
    targetText = "対人行動（相手不明）";
    targetConf = 0.5;
    targetSource = "inferred";
  } else if (queryContext.domain === "self") {
    targetText = "自分自身の状態・方向性";
    targetConf = 0.7;
    targetSource = "inferred";
  }

  // ── decision_scope ──
  let scope: "immediate" | "short_term" | "long_term" | "unknown" = "unknown";
  let scopeConf = 0.3;
  let scopeSource: EvidenceSource = "unknown";

  if (queryContext.hidden_variables.urgency === "immediate") {
    scope = "immediate";
    scopeConf = 0.9;
    scopeSource = "known_from_user";
  } else if (queryContext.hidden_variables.urgency === "soon") {
    scope = "short_term";
    scopeConf = 0.8;
    scopeSource = "known_from_user";
  } else if (/転職|退職|結婚|離婚|引っ越|留学/.test(message)) {
    scope = "long_term";
    scopeConf = 0.85;
    scopeSource = "inferred";
  } else if (/今日|今夜|今から/.test(message)) {
    scope = "immediate";
    scopeConf = 0.9;
    scopeSource = "known_from_user";
  } else if (/べき|した方がいい|するべき|迷[うっい]/.test(message)) {
    // 「べき？」系は目の前の判断 → short_term と推定
    scope = "short_term";
    scopeConf = 0.6;
    scopeSource = "inferred";
  } else if (/どうしよう|どうすれば|困っ/.test(message)) {
    // 現在進行の困りごと → short_term
    scope = "short_term";
    scopeConf = 0.5;
    scopeSource = "inferred";
  }

  // ── constraints ──
  const constraints: string[] = [];
  if (/けど|だけど|ただ|でも[、。]/.test(message)) {
    // 「〜けど」の後ろに制約がある
    const constraintMatch = message.match(/(?:けど|だけど|ただ[、。]|でも[、。])(.{3,30})/);
    if (constraintMatch) constraints.push(constraintMatch[1]!.trim());
  }
  if (/嫌われ|怒ら|関係.*[壊悪]|断れない/.test(message)) {
    constraints.push("対人リスクへの懸念");
  }
  if (/時間.*[ない無]|忙し|余裕.*[ない無]/.test(message)) {
    constraints.push("時間的制約");
  }
  if (/体力|疲れ|眠い|しんどい/.test(message)) {
    constraints.push("体力的制約");
  }

  // ── missing_critical_info ──
  // critical: 判断の方向を大きく変えるもの（対象・目的）
  // supplementary: あれば精度が上がるが、なくても結論は出せるもの（緊急度・温度）
  const missing: string[] = [];
  let coreMissing = 0; // 対象・目的の欠落数

  if (relationalLens.involves_other && relationalLens.target_role === "unknown") {
    missing.push("相手が誰か（仕事/個人/家族）");
    coreMissing++;
  }
  if (relationalLens.involves_other && relationalLens.interaction_purpose === "unknown") {
    missing.push("行動の目的（何のために）");
    coreMissing++;
  }
  if (queryContext.hidden_variables.urgency === "unknown" &&
      queryContext.hidden_variables.emotional_stake !== "low") {
    missing.push("時間的な緊急度");
    // supplementary: coreMissing には加算しない
  }
  if (relationalLens.relational_temperature === "unknown" &&
      relationalLens.target_role !== "unknown" &&
      relationalLens.target_role !== "self") {
    missing.push("今の関係の状態（良好/緊張/疎遠）");
    // supplementary: coreMissing には加算しない
  }

  // ── confidence_level ──
  // 加重平均: intent(0.4) + target(0.4) + scope(0.2)
  const weightedConf = intentConf * 0.4 + targetConf * 0.4 + scopeConf * 0.2;
  let confidence_level: ConfidenceLevel;
  if (weightedConf >= 0.65 && coreMissing === 0) {
    // intent + target が高確信 + core情報あり → high
    // urgency/temperature が不明でも、誰に何のためにが分かっていれば十分
    confidence_level = "high";
  } else if (weightedConf < 0.35 || coreMissing >= 2) {
    // 確信度低 OR 対象+目的の両方が不明 → low
    confidence_level = "low";
  } else if (weightedConf < 0.3) {
    confidence_level = "low";
  } else {
    confidence_level = "medium";
  }

  return {
    user_intent: { value: intentText, confidence: intentConf, source: intentSource },
    decision_target: { value: targetText, confidence: targetConf, source: targetSource },
    decision_scope: { value: scope, confidence: scopeConf, source: scopeSource },
    constraints,
    missing_critical_info: missing,
    confidence_level,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 1b: RelationalLens v2 — confidence + source
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** RelationalLens の詳細版（確信度付き） */
export interface RelationalLensDetailed {
  target_role: ConfidentValue<TargetRole>;
  interaction_purpose: ConfidentValue<InteractionPurpose>;
  relational_temperature: ConfidentValue<RelationalTemperature>;
  risk_direction: ConfidentValue<RiskDirection>;
  communication_register: ConfidentValue<CommunicationRegister>;
  involves_other: boolean;
}

/**
 * RelationalLens にconfidence + source を付与する。
 * regex マッチは高確信、テーブル導出は derived、推定は inferred。
 */
export function enrichRelationalLens(lens: RelationalLens, message: string): RelationalLensDetailed {
  // target_role confidence: regex直接マッチなら高い
  const roleConf = lens.target_role === "unknown" ? 0.0
    : lens.target_role === "self" ? 0.8
    : 0.9; // regex match
  const roleSource: EvidenceSource = lens.target_role === "unknown" ? "unknown"
    : "known_from_user";

  // purpose confidence
  const purposeConf = lens.interaction_purpose === "unknown" ? 0.0 : 0.85;
  const purposeSource: EvidenceSource = lens.interaction_purpose === "unknown" ? "unknown"
    : "known_from_user";

  // temperature confidence: regex match
  const tempConf = lens.relational_temperature === "unknown" ? 0.0 : 0.8;
  const tempSource: EvidenceSource = lens.relational_temperature === "unknown" ? "unknown"
    : "known_from_user";

  // risk: derived from role × purpose table
  const riskConf = lens.risk_direction === "unknown" ? 0.0
    : lens.target_role !== "unknown" && lens.interaction_purpose !== "unknown" ? 0.75
    : 0.4;
  const riskSource: EvidenceSource = lens.risk_direction === "unknown" ? "unknown" : "derived";

  // register: derived from role
  const regConf = lens.communication_register === "unknown" ? 0.0 : 0.85;
  const regSource: EvidenceSource = lens.communication_register === "unknown" ? "unknown" : "derived";

  return {
    target_role: { value: lens.target_role, confidence: roleConf, source: roleSource },
    interaction_purpose: { value: lens.interaction_purpose, confidence: purposeConf, source: purposeSource },
    relational_temperature: { value: lens.relational_temperature, confidence: tempConf, source: tempSource },
    risk_direction: { value: lens.risk_direction, confidence: riskConf, source: riskSource },
    communication_register: { value: lens.communication_register, confidence: regConf, source: regSource },
    involves_other: lens.involves_other,
  };
}

// ── HiddenVariables の ConfidentValue 化 ──

export interface HiddenVariablesDetailed {
  target_type: ConfidentValue<HiddenVariables["target_type"]>;
  relationship_distance: ConfidentValue<HiddenVariables["relationship_distance"]>;
  urgency: ConfidentValue<HiddenVariables["urgency"]>;
  emotional_stake: ConfidentValue<HiddenVariables["emotional_stake"]>;
  social_risk: ConfidentValue<HiddenVariables["social_risk"]>;
  reversibility: ConfidentValue<HiddenVariables["reversibility"]>;
}

/**
 * HiddenVariables に confidence + source を付与する。
 * regex直接マッチ → known_from_user (高確信)
 * ドメインから推定 → derived (中確信)
 * 不明 → unknown (0.0)
 */
export function enrichHiddenVariables(
  hv: HiddenVariables,
  message: string,
  domain: QueryDomain,
): HiddenVariablesDetailed {
  const cv = <T extends string>(
    value: T,
    regexMatched: boolean,
    domainDerived: boolean,
  ): ConfidentValue<T> => {
    if (value === "unknown") return { value, confidence: 0.0, source: "unknown" };
    if (regexMatched) return { value, confidence: 0.9, source: "known_from_user" };
    if (domainDerived) return { value, confidence: 0.5, source: "derived" };
    return { value, confidence: 0.6, source: "inferred" };
  };

  return {
    target_type: cv(hv.target_type,
      /彼|友|親|上司|先輩|同僚|相手|人/.test(message) && hv.target_type !== "unknown",
      false),
    relationship_distance: cv(hv.relationship_distance,
      /親友|幼なじみ|家族|知り合い/.test(message) && hv.relationship_distance !== "unknown",
      hv.relationship_distance === "medium"),
    urgency: cv(hv.urgency,
      /今すぐ|今日|明日|急[いぎ]/.test(message) && hv.urgency !== "unknown",
      false),
    emotional_stake: cv(hv.emotional_stake,
      /怖|不安|辛|悩|死|別れ|告白|結婚/.test(message) && hv.emotional_stake !== "unknown",
      domain === "romance" || domain === "self"),
    social_risk: cv(hv.social_risk,
      /評判|噂|バレ|信頼|関係.*壊/.test(message) && hv.social_risk !== "unknown",
      hv.social_risk === "low"),
    reversibility: cv(hv.reversibility,
      /取り消|元に戻|やり直|退職|離婚|絶縁/.test(message) && hv.reversibility !== "unknown",
      false),
  };
}

/**
 * confidence ベースの ambiguity_score 再計算。
 * 単純な unknown カウントではなく、各変数の confidence を重み付き平均で使う。
 * CEO指示対象変数: urgency, emotional_stake, reversibility に高重みを設定。
 */
export function computeConfidenceBasedAmbiguity(
  hvDetailed: HiddenVariablesDetailed,
  lensDetailed: RelationalLensDetailed,
): number {
  // 重み: 判断を変える変数ほど高い
  const weights = [
    { conf: lensDetailed.target_role.confidence, weight: 0.20 },
    { conf: lensDetailed.interaction_purpose.confidence, weight: 0.15 },
    { conf: hvDetailed.urgency.confidence, weight: 0.15 },
    { conf: hvDetailed.emotional_stake.confidence, weight: 0.15 },
    { conf: hvDetailed.reversibility.confidence, weight: 0.15 },
    { conf: lensDetailed.relational_temperature.confidence, weight: 0.10 },
    { conf: hvDetailed.social_risk.confidence, weight: 0.05 },
    { conf: hvDetailed.relationship_distance.confidence, weight: 0.05 },
  ];

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  const weightedConf = weights.reduce((s, w) => s + w.conf * w.weight, 0) / totalWeight;

  // ambiguity = 1 - weighted_confidence
  return Math.max(0, Math.min(1, 1 - weightedConf));
}

/** Layer 1 の全構造を統合した詳細コンテキスト（監査・audit trail用） */
export interface QueryContextDetailed {
  domain: QueryDomain;
  domain_confidence: number;
  hidden_variables: HiddenVariablesDetailed;
  relational_lens: RelationalLensDetailed;
  ambiguity_score_legacy: number;
  ambiguity_score_confident: number;
  input_understanding: InputUnderstanding;
}

/**
 * Layer 1 の全抽出結果を ConfidentValue 付きで統合する。
 * 監査トレイルと ambiguity 再計算に使用。
 */
export function buildQueryContextDetailed(
  ctx: QueryContext,
  lens: RelationalLens,
  message: string,
  inputUnderstanding: InputUnderstanding,
): QueryContextDetailed {
  const lensDetailed = enrichRelationalLens(lens, message);
  const hvDetailed = enrichHiddenVariables(ctx.hidden_variables, message, ctx.domain);
  const ambiguityConfident = computeConfidenceBasedAmbiguity(hvDetailed, lensDetailed);

  return {
    domain: ctx.domain,
    domain_confidence: ctx.domain_confidence,
    hidden_variables: hvDetailed,
    relational_lens: lensDetailed,
    ambiguity_score_legacy: ctx.ambiguity_score,
    ambiguity_score_confident: ambiguityConfident,
    input_understanding: inputUnderstanding,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 2: 判断骨格 — 文章の前にJSON構造を確定する
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 判断の骨格（文章生成の前に確定するもの） */
export interface JudgmentSkeleton {
  /** 応答モード */
  response_mode: ResponseMode;
  /** 行動の形（ForceBalance → ActionShape） */
  action_shape: ActionShape;
  /** ForceBalance */
  force_balance: ForceBalance;
  /** 結論の主理由 */
  primary_reason: string;
  /** 主要トレードオフ（何を得て何を失うか） */
  main_tradeoff: string;
  /** 成長方向との整合 */
  growth_alignment: "aligned" | "override" | "neutral";
  /** リスク注記 */
  risk_note: string;
  /** 推奨次の一手 */
  recommended_next_step: string;
  /** 全体の確信度 */
  confidence_level: ConfidenceLevel;
  /** low なのに conclude する場合の理由 */
  low_confidence_conclude_reason?: string;
}

/**
 * Layer 2: 判断骨格を構築する。
 *
 * 全ての入力を統合し、文章にする前の「結論の構造」を確定する。
 * この骨格がないと LLM は自由作文してしまう。
 */
export function buildJudgmentSkeleton(
  framework: JudgmentFramework,
  queryContext: QueryContext,
  relationalLens: RelationalLens,
  inputUnderstanding: InputUnderstanding,
  responseMode: ResponseMode,
): JudgmentSkeleton {
  const fb = computeForceBalance(framework, queryContext, relationalLens);
  const actionShape = resolveActionShape(fb);

  // ── primary_reason: 最も判断を動かした要因 ──
  let primary_reason: string;
  const netExpand = fb.expand_pressure + fb.opportunity_value + fb.regret_if_skip;
  const netProtect = fb.protect_pressure + fb.cost_load + fb.regret_if_do;

  if (framework.opportunityValue.includes("【高価値】")) {
    primary_reason = "機会価値が高い";
  } else if (framework.opportunityValue.includes("【低価値】")) {
    primary_reason = "機会価値が低い";
  } else if (framework.costLoad.includes("【高コスト】")) {
    primary_reason = "コスト負荷が大きい";
  } else if (relationalLens.target_role !== "unknown" && relationalLens.risk_direction === "skip_risky") {
    primary_reason = `${relationalLens.target_role}との関係で、行動しないリスクが高い`;
  } else if (relationalLens.target_role !== "unknown" && relationalLens.risk_direction === "do_risky") {
    primary_reason = `${relationalLens.target_role}との関係で、行動するリスクが高い`;
  } else if (netExpand > netProtect * 1.3) {
    primary_reason = "進む力が守る力を上回っている";
  } else if (netProtect > netExpand * 1.3) {
    primary_reason = "守る力が進む力を上回っている";
  } else {
    primary_reason = "拮抗している（グレーゾーン）";
  }

  // ── main_tradeoff ──
  let main_tradeoff: string;
  if (actionShape === "full_go" || actionShape === "bounded_go") {
    main_tradeoff = "行動のコスト/リスク vs. やらなかった場合の後悔";
  } else if (actionShape === "skip" || actionShape === "defer_with_trigger") {
    main_tradeoff = "安全・回復 vs. 機会の喪失";
  } else if (actionShape === "prepare_then_go") {
    main_tradeoff = "準備の時間コスト vs. 準備なしで動くリスク";
  } else {
    main_tradeoff = "情報収集のコスト vs. 今すぐ動くリスク";
  }

  // ── growth_alignment ──
  const growthWantsExpand = /広げること|挑戦|試すこと/.test(framework.growthVector);
  const growthWantsProtect = /守ること|絞ること/.test(framework.growthVector);
  const shapeIsExpansive = ["full_go", "bounded_go", "prepare_then_go"].includes(actionShape);
  const shapeIsProtective = ["skip", "defer_with_trigger"].includes(actionShape);

  let growth_alignment: "aligned" | "override" | "neutral";
  if ((growthWantsExpand && shapeIsExpansive) || (growthWantsProtect && shapeIsProtective)) {
    growth_alignment = "aligned";
  } else if ((growthWantsExpand && shapeIsProtective) || (growthWantsProtect && shapeIsExpansive)) {
    growth_alignment = "override";
  } else {
    growth_alignment = "neutral";
  }

  // ── risk_note ──
  let risk_note = "";
  if (relationalLens.risk_direction === "do_risky") {
    risk_note = "行動すること自体にリスクがある。慎重なアプローチが安全";
  } else if (relationalLens.risk_direction === "skip_risky") {
    risk_note = "先延ばしが最悪の選択になりうる";
  }
  if (relationalLens.relational_temperature === "hot") {
    risk_note += risk_note ? "。関係が緊張状態なので冷静さが重要" : "関係が緊張状態なので冷静さが重要";
  }
  if (relationalLens.relational_temperature === "frozen") {
    risk_note += risk_note ? "。関係が断絶状態なので連絡自体が大きなシグナル" : "関係が断絶状態なので連絡自体が大きなシグナル";
  }
  if (!risk_note) risk_note = "特記なし";

  // ── recommended_next_step ──
  let recommended_next_step: string;
  if (responseMode === "clarify") {
    recommended_next_step = "まず追加情報を確認する";
  } else if (actionShape === "full_go") {
    recommended_next_step = "今日中に行動する";
  } else if (actionShape === "bounded_go") {
    recommended_next_step = "条件を限定して行動する";
  } else if (actionShape === "prepare_then_go") {
    recommended_next_step = "準備してから行動する";
  } else if (actionShape === "observe_first") {
    recommended_next_step = "まず情報を集める";
  } else if (actionShape === "defer_with_trigger") {
    recommended_next_step = "条件が揃ったら動く";
  } else {
    recommended_next_step = "今回は見送る";
  }

  // ── confidence_level ──
  const confidence_level = inputUnderstanding.confidence_level;
  let low_confidence_conclude_reason: string | undefined;
  if (confidence_level === "low" && responseMode === "conclude") {
    low_confidence_conclude_reason = "情報不足だが、利用可能な情報で最善の判断を提示";
  }

  return {
    response_mode: responseMode,
    action_shape: actionShape,
    force_balance: fb,
    primary_reason,
    main_tradeoff,
    growth_alignment,
    risk_note,
    recommended_next_step,
    confidence_level,
    low_confidence_conclude_reason,
  };
}

/**
 * Layer 2 の骨格をプロンプト注入用テキストに変換する。
 * LLM はこの骨格に従って文章化する。自由作文禁止。
 */
export function buildSkeletonPromptBlock(skeleton: JudgmentSkeleton): string {
  if (skeleton.response_mode === "clarify") return ""; // clarify は骨格不要

  const parts: string[] = [
    "",
    "# 判断骨格（この構造に従って文章化すること）",
    "**以下は事前計算された判断の構造。LLM はこれを文章化するだけ。**",
    "**骨格にない新情報を勝手に足さない。骨格と矛盾する結論を出さない。**",
    "",
    `- 行動の形: ${ACTION_SHAPE_LABELS[skeleton.action_shape]}`,
    `- 主理由: ${skeleton.primary_reason}`,
    `- 主トレードオフ: ${skeleton.main_tradeoff}`,
    `- リスク注記: ${skeleton.risk_note}`,
    `- 推奨次の一手: ${skeleton.recommended_next_step}`,
    `- 成長方向との整合: ${skeleton.growth_alignment === "aligned" ? "一致" : skeleton.growth_alignment === "override" ? "成長方向と矛盾するが状況が優先" : "中立"}`,
  ];

  // directness / specificity 補強
  parts.push("");
  parts.push("**文章化ルール:**");
  parts.push("- 1行目は必ず「何をすべきか」の結論。「まず整理」「情報を集める」で始めない。");
  parts.push("- 「次の一手」は具体的な行動を1つだけ。「整理する」「考える」は禁止。動詞+対象+期限を含める。");
  if (skeleton.action_shape === "observe_first") {
    parts.push("- observe_first でも1行目は判断の方向を示す。「今は動かない方がいい」「もう少し待つのがいい」のように立場を明示。");
    parts.push("- 「情報を集める」なら何の情報か、どこで集めるか具体化する。");
  }
  if (skeleton.action_shape === "prepare_then_go") {
    parts.push("- prepare_then_go の1行目は「〜してから〜する方がいい」。準備と行動の両方を明示。");
  }

  if (skeleton.confidence_level === "low") {
    parts.push("");
    parts.push("**⚠ 確信度: LOW** — 重要な前提が不足している。");
    parts.push("文体ルール（LOW）:");
    parts.push("- 断定口調は完全禁止。「絶対」「間違いなく」「〜するべきです」「〜しかないです」は使わない。");
    parts.push("- 「〜の可能性が高い」「今分かる範囲では〜」「〜寄りに見えます」を基本トーンにする。");
    parts.push("- 結論を出す場合も「今の情報だと〜が合っていそうです」のように留保をつける。");
    parts.push("- 「次の一手」も「まずは〜から始めてみるのがいいかもしれません」のように柔らかくする。");
    if (skeleton.low_confidence_conclude_reason) {
      parts.push(`理由: ${skeleton.low_confidence_conclude_reason}`);
    }
  } else if (skeleton.confidence_level === "medium") {
    parts.push("");
    parts.push("**確信度: MEDIUM** — 一部推定を含む。断定しすぎない。");
    parts.push("文体ルール（MEDIUM）:");
    parts.push("- 「絶対」「間違いなく」「今すぐ〜するべきです」「〜しかないです」は使わない。");
    parts.push("- 代わりに「今の情報だと」「まずは」「〜寄りがよさそうです」「〜から始めるのが合っています」を使う。");
    parts.push("- 推定部分は「〜と思われます」「〜の傾向があります」で表現する。");
    parts.push("- 判断の方向は示すが、「確定」ではなく「現時点での最善手」として伝える。");
  }
  // high の場合は特記不要（断定OK）

  return parts.join("\n");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 4: 応答検証 — generic detection + consistency
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 一般論っぽさスコア: 高いほど具体性が低い */
export function computeGenericResponseScore(
  response: string,
  relationalLens: RelationalLens,
  inputUnderstanding: InputUnderstanding,
): number {
  let score = 0;
  const text = response;

  // 誰にでも言えるフレーズ
  const GENERIC_PHRASES = [
    /まず.*整理/, /無理しすぎない/, /落ち着いて.*考え/,
    /自分.*気持ち.*大切/, /焦ら.*ゆっくり/, /自分らしく/,
    /バランス.*大事/, /一歩ずつ/, /心.*余裕/,
    /状況.*見ながら/, /タイミング.*大事/, /相手.*気持ち.*考え/,
  ];
  const genericHits = GENERIC_PHRASES.filter((p) => p.test(text)).length;
  score += genericHits * 0.15;

  // 相手の役割が特定されているのにレスポンスに相手固有の言及がない
  if (relationalLens.target_role !== "unknown" && relationalLens.target_role !== "self") {
    const ROLE_SPECIFIC_MARKERS: Partial<Record<TargetRole, RegExp>> = {
      boss: /上司|報告|仕事|職場/,
      senior: /先輩|目上/,
      friend: /友[達人]|仲間/,
      close_friend: /親友|大事な友/,
      partner: /彼[女氏]|恋人|パートナー/,
      ex: /元[カ彼]|以前の/,
      crush: /好きな|気になる/,
      family: /家族|親|母|父/,
      colleague: /同僚|同期/,
    };
    const marker = ROLE_SPECIFIC_MARKERS[relationalLens.target_role];
    if (marker && !marker.test(text)) {
      score += 0.2; // 相手に言及してない
    }
  }

  // purposeが特定されているのにpurpose固有の言及がない
  if (relationalLens.interaction_purpose !== "unknown") {
    const PURPOSE_MARKERS: Partial<Record<InteractionPurpose, RegExp>> = {
      apologize: /謝|ごめん|悪かった/,
      reconnect: /久しぶり|繋がり|また/,
      boundary: /断|距離|伝え/,
      confess: /気持ち|伝え|告白/,
      end: /別れ|終わ|区切り/,
    };
    const marker = PURPOSE_MARKERS[relationalLens.interaction_purpose];
    if (marker && !marker.test(text)) {
      score += 0.15;
    }
  }

  // ユーザーの制約が回答に反映されていない
  if (inputUnderstanding.constraints.length > 0) {
    // 制約への言及チェック（簡易）
    const constraintMentioned = inputUnderstanding.constraints.some((c) => {
      const keywords = c.split(/[、。 ]/).filter((w) => w.length >= 2);
      return keywords.some((k) => text.includes(k));
    });
    if (!constraintMentioned) score += 0.15;
  }

  return Math.min(1.0, score);
}

/** metadata と本文の整合性チェック */
export interface ConsistencyCheck {
  pass: boolean;
  failures: string[];
  generic_response_score: number;
}

/**
 * Layer 4: 応答の品質を多角的に検証する。
 *
 * 既存の validateHomeAlterResponseWithMode に加えて:
 *  - 一般論っぽさ検出
 *  - metadata/text 矛盾検出
 *  - role/purpose 取り違え検出
 *  - 無根拠断定検出
 */
export function validateResponseQuality(
  response: string,
  metadata: DecisionMetadata | null,
  skeleton: JudgmentSkeleton,
  relationalLens: RelationalLens,
  inputUnderstanding: InputUnderstanding,
  personality?: AlterPersonality,
): ConsistencyCheck {
  const failures: string[] = [];
  const text = response;

  // 1. 一般論スコア
  const generic_response_score = computeGenericResponseScore(text, relationalLens, inputUnderstanding);
  if (generic_response_score >= 0.5) {
    failures.push(`一般論スコアが高い(${generic_response_score.toFixed(2)}): 相手・目的・状況に即した具体性が不足`);
  }

  // 2. metadata と text の矛盾
  if (metadata) {
    // skip なのに「行った方がいい」系
    if (metadata.action_shape === "skip" && /行った方がいい|送った方がいい|参加.*した方/.test(text)) {
      failures.push("metadata=skip だが本文は行動を推奨している");
    }
    // full_go なのに「見送り」系
    if (metadata.action_shape === "full_go" && /見送[りるっ]|やめ[たてろ]|今回は.*ない/.test(text)) {
      failures.push("metadata=full_go だが本文は見送りを推奨している");
    }
  }

  // 3. skeleton の action_shape と metadata の不一致
  if (metadata && skeleton.response_mode === "conclude") {
    const SHAPE_ORDER: Record<ActionShape, number> = {
      skip: 0, defer_with_trigger: 1, observe_first: 2,
      prepare_then_go: 3, bounded_go: 4, full_go: 5,
    };
    const diff = Math.abs(SHAPE_ORDER[skeleton.action_shape] - SHAPE_ORDER[metadata.action_shape]);
    if (diff >= 3) {
      failures.push(`骨格(${skeleton.action_shape})と応答metadata(${metadata.action_shape})が大きく乖離`);
    }
  }

  // 4. confidence × 断定口調チェック
  const STRONG_ASSERT = /絶対|間違いなく|今すぐ.*するべきです|しかないです|必ず|確実に|断言/;
  const MODERATE_ASSERT = /するべきです|しなければなりません|すべきだ[。！]|に決まって/;
  if (skeleton.confidence_level === "low") {
    if (STRONG_ASSERT.test(text) || MODERATE_ASSERT.test(text)) {
      failures.push("確信度LOWなのに断定口調を使用");
    }
  } else if (skeleton.confidence_level === "medium") {
    if (STRONG_ASSERT.test(text)) {
      failures.push("確信度MEDIUMなのに強断定語を使用（「絶対」「間違いなく」等）");
    }
  }

  // 5. 不明情報を事実扱い
  if (relationalLens.target_role === "unknown" && relationalLens.involves_other) {
    // 相手が不明なのに特定の相手を前提にしている
    const ASSUMED_TARGET = /上司|彼[女氏]|友達|親|先輩/;
    if (ASSUMED_TARGET.test(text) && !/かもしれない|の場合|であれば/.test(text)) {
      failures.push("相手が不明なのに特定の関係性を事実として前提にしている");
    }
  }

  // 6. 性格反転チェック（trait contradiction）
  if (personality) {
    const scores = personality.axisScores;
    const boldScore = scores.cautious_vs_bold ?? 0.5;
    const socialScore = scores.individual_vs_social ?? 0.5;

    // 慎重タイプなのに即断型と表現
    if (boldScore < 0.4) {
      if (/即断型|迷わず動ける|衝動的に|即決|直感で決める|躊躇なく/.test(text)) {
        failures.push("性格反転: 慎重寄りユーザーに「即断型」等の逆ラベルを使用");
      }
    }
    // 即断型なのに慎重と表現
    if (boldScore > 0.6) {
      if (/慎重[派寄な]|じっくり考える.*タイプ|熟慮型|石橋を叩/.test(text)) {
        failures.push("性格反転: 即断型ユーザーに「慎重派」等の逆ラベルを使用");
      }
    }
    // 内向型なのに社交的と表現
    if (socialScore < 0.4) {
      if (/社交的|人と一緒にいたい|外向的|人と関わること.*好き/.test(text)) {
        failures.push("性格反転: 内向型ユーザーに「社交的」等の逆ラベルを使用");
      }
    }
    // 外向型なのに内向的と表現
    if (socialScore > 0.6) {
      if (/ひとりが好き|内向的|人と距離を置く.*タイプ|一人の時間.*大事/.test(text)) {
        failures.push("性格反転: 外向型ユーザーに「内向的」等の逆ラベルを使用");
      }
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    generic_response_score,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Post-generation: 性格反転テキスト修正
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM 出力から性格反転フレーズを検出し、正しい表現に置換する。
 * prompt で禁止しても LLM が無視するケースがあるため、後処理で確実に除去する。
 * @returns { text: 修正済みテキスト, corrections: 適用した修正リスト }
 */
export function sanitizeTraitInversions(
  text: string,
  personality: AlterPersonality,
): { text: string; corrections: string[] } {
  let result = text;
  const corrections: string[] = [];
  const scores = personality.axisScores;
  const boldScore = scores.cautious_vs_bold ?? 0.5;
  const socialScore = scores.individual_vs_social ?? 0.5;

  // 慎重寄りユーザーに即断型ラベルを使った場合 → 除去/置換
  if (boldScore < 0.4) {
    const boldInversions: Array<[RegExp, string]> = [
      [/即断型寄り/g, "慎重に判断するタイプ"],
      [/即断型/g, "慎重に考えるタイプ"],
      [/迷わず動ける/g, "じっくり考えてから動く"],
      [/衝動的に/g, "慎重に"],
      [/即決で/g, "熟考して"],
      [/即決/g, "熟考"],
      [/直感で決める/g, "慎重に判断する"],
      [/躊躇なく/g, "しっかり考えた上で"],
    ];
    for (const [pattern, replacement] of boldInversions) {
      if (pattern.test(result)) {
        corrections.push(`慎重寄りユーザー: "${result.match(pattern)?.[0]}" → "${replacement}"`);
        result = result.replace(pattern, replacement);
      }
    }
  }

  // 即断型ユーザーに慎重ラベルを使った場合 → 除去/置換
  if (boldScore > 0.6) {
    const cautiousInversions: Array<[RegExp, string]> = [
      [/慎重派/g, "決断が早いタイプ"],
      [/慎重寄り/g, "即断寄り"],
      [/慎重な/g, "素早い判断の"],
      [/じっくり考える.*?タイプ/g, "素早く判断するタイプ"],
      [/熟慮型/g, "即断型"],
      [/石橋を叩/g, "迷わず進"],
    ];
    for (const [pattern, replacement] of cautiousInversions) {
      if (pattern.test(result)) {
        corrections.push(`即断型ユーザー: "${result.match(pattern)?.[0]}" → "${replacement}"`);
        result = result.replace(pattern, replacement);
      }
    }
  }

  // 内向型ユーザーに社交的ラベルを使った場合
  if (socialScore < 0.4) {
    const extrovertInversions: Array<[RegExp, string]> = [
      [/社交的/g, "自分のペースを大事にする"],
      [/人と一緒にいたい/g, "ひとりの時間を確保したい"],
      [/外向的/g, "内省的"],
      [/人と関わること.*?好き/g, "自分の時間を大切にする"],
    ];
    for (const [pattern, replacement] of extrovertInversions) {
      if (pattern.test(result)) {
        corrections.push(`内向型ユーザー: "${result.match(pattern)?.[0]}" → "${replacement}"`);
        result = result.replace(pattern, replacement);
      }
    }
  }

  // 外向型ユーザーに内向的ラベルを使った場合
  if (socialScore > 0.6) {
    const introvertInversions: Array<[RegExp, string]> = [
      [/ひとりが好き/g, "人との交流が好き"],
      [/内向的/g, "社交的"],
      [/人と距離を置く.*?タイプ/g, "人との関わりを大事にするタイプ"],
      [/一人の時間.*?大事/g, "人との時間を大事にする"],
    ];
    for (const [pattern, replacement] of introvertInversions) {
      if (pattern.test(result)) {
        corrections.push(`外向型ユーザー: "${result.match(pattern)?.[0]}" → "${replacement}"`);
        result = result.replace(pattern, replacement);
      }
    }
  }

  return { text: result, corrections };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Layer 5: 監査トレイル — 全判断プロセスの永続化構造
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Layer 5: 監査用の全判断プロセス記録 */
export interface AuditTrail {
  // Layer 1
  input_understanding: InputUnderstanding;
  relational_lens_detailed: RelationalLensDetailed;
  query_context: {
    domain: QueryDomain;
    ambiguity_score: number;
    ambiguity_score_confident: number;
    information_score: number;
  };
  hidden_variables_detailed: HiddenVariablesDetailed;

  // Layer 2
  judgment_skeleton: {
    response_mode: ResponseMode;
    action_shape: ActionShape;
    primary_reason: string;
    main_tradeoff: string;
    growth_alignment: string;
    risk_note: string;
    confidence_level: ConfidenceLevel;
  };

  // Layer 3 (応答生成は LLM が行うので、制約パラメータを記録)
  generation_constraints: {
    skeleton_injected: boolean;
    relational_context_injected: boolean;
    followup_insight_applied: boolean;
  };

  // Layer 4
  validation: {
    pass: boolean;
    failures: string[];
    generic_response_score: number;
    retry_attempted: boolean;
  };

  // Layer 5 (メタ)
  mode_decision_reason: ModeDecisionReason;
  mode_decision_version: string;

  // 訂正性追跡
  is_followup: boolean;
  judgment_changed?: boolean;
  changed_fields?: string[];
  change_reason?: string;
}

/**
 * Layer 5: 完全な監査トレイルを構築する。
 * route.ts の analytics に永続化する用。
 */
export function buildAuditTrail(
  inputUnderstanding: InputUnderstanding,
  lensDetailed: RelationalLensDetailed,
  queryContext: QueryContext,
  skeleton: JudgmentSkeleton,
  modeDecisionReason: ModeDecisionReason,
  validation: ConsistencyCheck,
  opts: {
    followupInsight: boolean;
    retryAttempted: boolean;
    isFollowup: boolean;
    previousSkeleton?: JudgmentSkeleton | null;
    queryContextDetailed?: QueryContextDetailed | null;
  },
): AuditTrail {
  // 訂正性追跡: 前回の骨格と比較
  let judgment_changed: boolean | undefined;
  let changed_fields: string[] | undefined;
  let change_reason: string | undefined;

  if (opts.isFollowup && opts.previousSkeleton) {
    const prev = opts.previousSkeleton;
    const changes: string[] = [];
    if (prev.action_shape !== skeleton.action_shape) changes.push("action_shape");
    if (prev.response_mode !== skeleton.response_mode) changes.push("response_mode");
    if (prev.primary_reason !== skeleton.primary_reason) changes.push("primary_reason");
    if (prev.confidence_level !== skeleton.confidence_level) changes.push("confidence_level");

    if (changes.length > 0) {
      judgment_changed = true;
      changed_fields = changes;
      change_reason = "ユーザーの追加情報により判断が更新された";
    } else {
      judgment_changed = false;
    }
  }

  const detailed = opts.queryContextDetailed;

  return {
    input_understanding: inputUnderstanding,
    relational_lens_detailed: detailed?.relational_lens ?? lensDetailed,
    query_context: {
      domain: queryContext.domain,
      ambiguity_score: queryContext.ambiguity_score,
      ambiguity_score_confident: detailed?.ambiguity_score_confident ?? queryContext.ambiguity_score,
      information_score: queryContext.information.score,
    },
    hidden_variables_detailed: detailed?.hidden_variables ?? enrichHiddenVariables(
      queryContext.hidden_variables,
      "",
      queryContext.domain,
    ),
    judgment_skeleton: {
      response_mode: skeleton.response_mode,
      action_shape: skeleton.action_shape,
      primary_reason: skeleton.primary_reason,
      main_tradeoff: skeleton.main_tradeoff,
      growth_alignment: skeleton.growth_alignment,
      risk_note: skeleton.risk_note,
      confidence_level: skeleton.confidence_level,
    },
    generation_constraints: {
      skeleton_injected: skeleton.response_mode !== "clarify",
      relational_context_injected: lensDetailed.target_role.value !== "unknown",
      followup_insight_applied: opts.followupInsight,
    },
    validation: {
      pass: validation.pass,
      failures: validation.failures,
      generic_response_score: validation.generic_response_score,
      retry_attempted: opts.retryAttempted,
    },
    mode_decision_reason: modeDecisionReason,
    mode_decision_version: "v4",
    is_followup: opts.isFollowup,
    judgment_changed,
    changed_fields,
    change_reason,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Daily Guidance Engine — 判断エンジンとは独立したパイプライン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Daily Guidance のモード（何を今日の軸にするか） */
export type DailyGuidanceMode =
  | "recover"       // 疲れ・低エネルギー → 回復優先
  | "reset"         // 気分転換・リフレッシュ
  | "advance"       // やるべきことを前に進める
  | "maintenance"   // ルーティン・整える系
  | "social"        // 人と会う・つながる
  | "explore";      // 新しいこと・刺激

/** Daily Guidance Frame: ユーザーの今日の状態を ConfidentValue で構造化 */
export interface DailyGuidanceFrame {
  // Core 4（CEO指定）
  time_budget: ConfidentValue<"full_day" | "half_day" | "few_hours" | "minimal" | "unknown">;
  energy_level: ConfidentValue<"high" | "medium" | "low" | "depleted" | "unknown">;
  hard_constraints: ConfidentValue<string[]>; // 絶対にある予定・制約
  desire_direction: ConfidentValue<"productive" | "relaxing" | "social" | "creative" | "physical" | "unknown">;
  // Supplementary 3（CEO指定）
  preferred_progress_style: ConfidentValue<"one_big_task" | "many_small_tasks" | "flexible" | "unknown">;
  social_bandwidth: ConfidentValue<"want_people" | "solo_preferred" | "either" | "unknown">;
  open_loops: ConfidentValue<string[]>; // やりかけのこと・気になっていること
}

/** Daily Guidance Skeleton: LLM 呼び出し前に確定する構造 */
export interface DailyGuidanceSkeleton {
  daily_mode: DailyGuidanceMode;
  primary_axis: string; // 今日最も重要なこと（1行）
  must_do_block: string[]; // 絶対やること（0-2個）
  recommended_first_step: string; // 動詞+対象+期限
  fallback_step: string; // エネルギー切れ時の代替
  avoid_today: string; // 今日やらない方がいいこと
  grounding_factors: string[]; // 判断根拠（性格データから）
}

/** Daily Guidance の clarify 対象（time/energy/constraints のみ） */
export interface DailyGuidanceClarify {
  needs_clarify: boolean;
  question?: string;
  target_variable: "time_budget" | "energy_level" | "hard_constraints" | null;
}

/**
 * ユーザーの入力から DailyGuidanceFrame を抽出する。
 * Progressive Profiling: 既存データで埋められるものは埋め、足りないものだけ聞く。
 */
export function extractDailyGuidanceFrame(
  message: string,
  personality?: AlterPersonality | null,
  homeContext?: HomeAlterContextData | null,
): DailyGuidanceFrame {
  const m = message;

  // ── time_budget ──
  let timeBudget: DailyGuidanceFrame["time_budget"];
  if (/一日|1日|丸一日|今日一日|フリー|自由/.test(m)) {
    timeBudget = { value: "full_day", confidence: 0.85, source: "known_from_user" };
  } else if (/半日|午前|午後/.test(m)) {
    timeBudget = { value: "half_day", confidence: 0.8, source: "known_from_user" };
  } else if (/[12３]時間|ちょっと.*時間|少し.*時間/.test(m)) {
    timeBudget = { value: "few_hours", confidence: 0.8, source: "known_from_user" };
  } else if (/忙しい|時間ない|合間/.test(m)) {
    timeBudget = { value: "minimal", confidence: 0.7, source: "known_from_user" };
  } else {
    timeBudget = { value: "unknown", confidence: 0, source: "unknown" };
  }

  // ── energy_level ──
  let energyLevel: DailyGuidanceFrame["energy_level"];
  if (/疲れ|だるい|しんどい|ぐったり|動けない|寝不足|体調.*悪/.test(m)) {
    energyLevel = { value: "depleted", confidence: 0.9, source: "known_from_user" };
  } else if (/やる気.*ない|モチベ.*ない|めんどくさ|面倒/.test(m)) {
    energyLevel = { value: "low", confidence: 0.8, source: "known_from_user" };
  } else if (/元気|やる気|頑張[りるれろ]|意欲|気合/.test(m)) {
    energyLevel = { value: "high", confidence: 0.85, source: "known_from_user" };
  } else if (/普通|まあまあ|ぼちぼち/.test(m)) {
    energyLevel = { value: "medium", confidence: 0.7, source: "known_from_user" };
  } else {
    // Progressive Profiling: personality から推定（introvert寄りなら低エネルギー推定）
    if (personality?.axisScores?.introvert_vs_extrovert !== undefined) {
      const s = personality.axisScores.introvert_vs_extrovert;
      energyLevel = { value: s < 0.3 ? "low" : "medium", confidence: 0.3, source: "inferred" };
    } else {
      energyLevel = { value: "unknown", confidence: 0, source: "unknown" };
    }
  }

  // ── hard_constraints ──
  const constraints: string[] = [];
  // 予定の検出
  const scheduleMatch = m.match(/(\d{1,2}時.*?(まで|から|に).*?[がはをもの。、])/g);
  if (scheduleMatch) constraints.push(...scheduleMatch.map((s) => s.trim()));
  if (/会議|ミーティング|打ち合わせ/.test(m)) constraints.push("会議あり");
  if (/約束|予定.*ある/.test(m)) constraints.push("予定あり");

  const hardConstraints: DailyGuidanceFrame["hard_constraints"] = constraints.length > 0
    ? { value: constraints, confidence: 0.9, source: "known_from_user" }
    : { value: [], confidence: 0, source: "unknown" };

  // ── desire_direction ──
  let desire: DailyGuidanceFrame["desire_direction"];
  if (/片付け|やるべき|タスク|仕事|進め/.test(m)) {
    desire = { value: "productive", confidence: 0.8, source: "known_from_user" };
  } else if (/リラックス|のんびり|ゆっくり|休[みむめ]|だらだら/.test(m)) {
    desire = { value: "relaxing", confidence: 0.85, source: "known_from_user" };
  } else if (/[会あ]いたい|人.*[会あ]|話し|遊[びぶ]/.test(m)) {
    desire = { value: "social", confidence: 0.8, source: "known_from_user" };
  } else if (/作[りるれ]|書[きくけ]|描[きくけ]|創/.test(m)) {
    desire = { value: "creative", confidence: 0.8, source: "known_from_user" };
  } else if (/運動|筋トレ|走|散歩|ジム|ストレッチ/.test(m)) {
    desire = { value: "physical", confidence: 0.85, source: "known_from_user" };
  } else {
    desire = { value: "unknown", confidence: 0, source: "unknown" };
  }

  // ── preferred_progress_style ──
  let progressStyle: DailyGuidanceFrame["preferred_progress_style"];
  if (/集中.*1つ|一つ.*集中|がっつり/.test(m)) {
    progressStyle = { value: "one_big_task", confidence: 0.8, source: "known_from_user" };
  } else if (/ちょこちょこ|少しずつ|いくつか|小さ/.test(m)) {
    progressStyle = { value: "many_small_tasks", confidence: 0.8, source: "known_from_user" };
  } else if (personality?.axisScores?.decomposition !== undefined) {
    // Progressive Profiling: 分解力から推定
    const d = personality.axisScores.decomposition;
    progressStyle = {
      value: d > 0.6 ? "many_small_tasks" : d < 0.4 ? "one_big_task" : "flexible",
      confidence: 0.35,
      source: "inferred",
    };
  } else {
    progressStyle = { value: "unknown", confidence: 0, source: "unknown" };
  }

  // ── social_bandwidth ──
  let socialBw: DailyGuidanceFrame["social_bandwidth"];
  if (/一人|ひとり|独り|ソロ/.test(m)) {
    socialBw = { value: "solo_preferred", confidence: 0.85, source: "known_from_user" };
  } else if (/[会あ]いたい|人.*[会あ]|誰か/.test(m)) {
    socialBw = { value: "want_people", confidence: 0.8, source: "known_from_user" };
  } else if (personality?.axisScores?.introvert_vs_extrovert !== undefined) {
    const ie = personality.axisScores.introvert_vs_extrovert;
    socialBw = {
      value: ie < 0.35 ? "solo_preferred" : ie > 0.65 ? "want_people" : "either",
      confidence: 0.3,
      source: "inferred",
    };
  } else {
    socialBw = { value: "unknown", confidence: 0, source: "unknown" };
  }

  // ── open_loops ──
  const loops: string[] = [];
  if (/やりかけ|途中|中途半端|気にな[るっ]/.test(m)) {
    // 具体的な内容は文面から取れないが、存在は検出
    loops.push("未完了タスクあり");
  }
  const openLoops: DailyGuidanceFrame["open_loops"] = loops.length > 0
    ? { value: loops, confidence: 0.6, source: "known_from_user" }
    : { value: [], confidence: 0, source: "unknown" };

  return {
    time_budget: timeBudget,
    energy_level: energyLevel,
    hard_constraints: hardConstraints,
    desire_direction: desire,
    preferred_progress_style: progressStyle,
    social_bandwidth: socialBw,
    open_loops: openLoops,
  };
}

/**
 * Daily Guidance の clarify 判定。
 * 判断エンジンとは異なり、time/energy/constraints のみを聞く。
 * desire_direction は unknown でも personality から推定して proceed する。
 */
export function checkDailyGuidanceClarify(
  frame: DailyGuidanceFrame,
): DailyGuidanceClarify {
  // time_budget と energy_level の両方が unknown → 最低限1つ聞く
  if (frame.time_budget.value === "unknown" && frame.energy_level.value === "unknown") {
    return {
      needs_clarify: true,
      question: "今日はどのくらい時間がある？あと、今の体力・気分はどんな感じ？",
      target_variable: "time_budget",
    };
  }
  // energy が depleted/low でかつ hard_constraints が空かつ time が unknown
  // → 聞かずに recover モードで対応（低エネルギーの人に質問するのは逆効果）
  if (frame.energy_level.value === "depleted" || frame.energy_level.value === "low") {
    return { needs_clarify: false, target_variable: null };
  }
  // time_budget だけ unknown → 聞く
  if (frame.time_budget.value === "unknown") {
    return {
      needs_clarify: true,
      question: "今日はどのくらい時間がある？（丸一日？数時間？ちょっとだけ？）",
      target_variable: "time_budget",
    };
  }
  return { needs_clarify: false, target_variable: null };
}

/**
 * DailyGuidanceFrame + personality から DailyGuidanceSkeleton を構築する。
 * LLM不使用。性格データと状態データから機械的に決定する。
 */
export function buildDailyGuidanceSkeleton(
  frame: DailyGuidanceFrame,
  personality: AlterPersonality,
): DailyGuidanceSkeleton {
  // ── モード決定 ──
  const mode = resolveDailyMode(frame, personality);

  // ── primary_axis: 今日の一番大事なこと ──
  const primary_axis = resolvePrimaryAxis(mode, frame, personality);

  // ── must_do_block: 絶対やること ──
  const must_do: string[] = [];
  if (frame.hard_constraints.value.length > 0) {
    must_do.push(...frame.hard_constraints.value.slice(0, 2));
  }

  // ── recommended_first_step: 動詞+対象+期限 ──
  const first_step = resolveFirstStep(mode, frame, personality);

  // ── fallback_step: エネルギー切れ時の代替 ──
  const fallback = resolveFallback(mode, personality);

  // ── avoid_today: 今日やらない方がいいこと ──
  const avoid = resolveAvoidToday(mode, personality);

  // ── grounding_factors: 性格データからの根拠 ──
  const grounding = buildGroundingFactors(mode, personality);

  return {
    daily_mode: mode,
    primary_axis,
    must_do_block: must_do,
    recommended_first_step: first_step,
    fallback_step: fallback,
    avoid_today: avoid,
    grounding_factors: grounding,
  };
}

// ── Daily Guidance 内部ヘルパー ──

function resolveDailyMode(
  frame: DailyGuidanceFrame,
  personality: AlterPersonality,
): DailyGuidanceMode {
  const energy = frame.energy_level.value;
  const desire = frame.desire_direction.value;

  // Energy-first: depleted/low → recover or reset
  if (energy === "depleted") return "recover";
  if (energy === "low") {
    // 低エネでも「何かしたい」→ reset
    if (desire === "productive" || desire === "creative") return "reset";
    return "recover";
  }

  // Desire-driven
  if (desire === "social") return "social";
  if (desire === "productive") return "advance";
  if (desire === "creative") return "explore";
  if (desire === "physical") return "reset";
  if (desire === "relaxing") return "recover";

  // Unknown desire → personality から推定
  const scores = personality.axisScores;
  const growthMindset = scores.growth_mindset ?? 0.5;
  const socialInit = scores.social_initiative ?? 0.5;
  const exploration = scores.exploration_closure ?? 0.5;

  if (growthMindset > 0.6 && exploration > 0.5) return "explore";
  if (socialInit > 0.6) return "social";
  if (growthMindset > 0.5) return "advance";
  return "maintenance";
}

function resolvePrimaryAxis(
  mode: DailyGuidanceMode,
  frame: DailyGuidanceFrame,
  _personality: AlterPersonality,
): string {
  switch (mode) {
    case "recover": return "今日はエネルギーを取り戻すことが最優先";
    case "reset": return "気持ちを切り替えて、明日に向けて整える";
    case "advance": {
      if (frame.open_loops.value.length > 0) {
        return "やりかけのことを1つ片付ける";
      }
      return "今日できる最も価値のあることを1つ前に進める";
    }
    case "maintenance": return "基本のルーティンを丁寧にこなす日";
    case "social": return "人とのつながりでエネルギーを得る";
    case "explore": return "新しい刺激を入れて視野を広げる";
  }
}

function resolveFirstStep(
  mode: DailyGuidanceMode,
  frame: DailyGuidanceFrame,
  personality: AlterPersonality,
): string {
  const time = frame.time_budget.value;

  switch (mode) {
    case "recover":
      if (personality.axisScores?.introvert_vs_extrovert !== undefined &&
          personality.axisScores.introvert_vs_extrovert > 0.6) {
        return "近所のカフェに行って30分ぼーっとする";
      }
      return "スマホを別の部屋に置いて15分間横になる";
    case "reset":
      return "10分間の散歩に出る（目的地なし、音楽なし）";
    case "advance":
      if (frame.preferred_progress_style.value === "one_big_task") {
        return time === "few_hours" || time === "minimal"
          ? "最も気になっているタスクを1つ選んで45分だけ集中する"
          : "最も重要なタスクを1つ選んで午前中に完了させる";
      }
      return "やることリストを3つ書き出して、一番軽いものから15分で片付ける";
    case "maintenance":
      return "朝のルーティン（掃除・洗濯・整理から1つ）を30分で終わらせる";
    case "social":
      if (frame.social_bandwidth.value === "want_people") {
        return "一番会いたい人に「今日空いてる？」とメッセージを送る";
      }
      return "最近連絡していない人に短いメッセージを1通送る";
    case "explore":
      if (personality.axisScores?.introvert_vs_extrovert !== undefined &&
          personality.axisScores.introvert_vs_extrovert < 0.4) {
        return "気になっていた本・記事・動画を1つ選んで30分だけ没頭する";
      }
      return "行ったことのない店・場所に1つ行ってみる";
  }
}

function resolveFallback(
  mode: DailyGuidanceMode,
  personality: AlterPersonality,
): string {
  switch (mode) {
    case "recover":
      return "布団の中で目を閉じて5分だけ呼吸に集中する";
    case "reset":
      return "窓を開けて外の空気を3分吸う";
    case "advance":
      return "机の上を片付けて、明日やることを1つだけメモに書く";
    case "maintenance":
      return "ゴミを1つ捨てる。それだけでいい";
    case "social":
      if (personality.axisScores?.introvert_vs_extrovert !== undefined &&
          personality.axisScores.introvert_vs_extrovert < 0.4) {
        return "SNSで誰かの投稿にいいねを1つだけする";
      }
      return "友達のストーリーに短いリアクションを送る";
    case "explore":
      return "Spotifyで聴いたことないジャンルのプレイリストを1曲だけ聴く";
  }
}

function resolveAvoidToday(
  mode: DailyGuidanceMode,
  personality: AlterPersonality,
): string {
  switch (mode) {
    case "recover":
      return "新しいことを始めない。SNSを延々スクロールしない";
    case "reset":
      return "溜まっていたタスクを一気に片付けようとしない";
    case "advance": {
      const perfectionist = personality.axisScores?.perfectionist_vs_pragmatic;
      if (perfectionist !== undefined && perfectionist < 0.4) {
        return "完璧に仕上げようとしない。60%で次に進む";
      }
      return "3つ以上のタスクを同時に始めない";
    }
    case "maintenance":
      return "新しい大きな決断をしない";
    case "social":
      return "義務感だけの付き合いに時間を使わない";
    case "explore":
      return "お金のかかる衝動買いはしない";
  }
}

function buildGroundingFactors(
  mode: DailyGuidanceMode,
  personality: AlterPersonality,
): string[] {
  const factors: string[] = [];
  const scores = personality.axisScores;

  // エネルギー回復パターン
  const ie = scores.introvert_vs_extrovert;
  if (ie !== undefined) {
    if (ie < 0.4) {
      factors.push("一人の時間で回復するタイプ");
    } else if (ie > 0.6) {
      factors.push("人と話すことでエネルギーが戻るタイプ");
    }
  }

  // 進め方の傾向
  const decomp = scores.decomposition;
  if (decomp !== undefined && mode === "advance") {
    if (decomp > 0.6) {
      factors.push("細かく分割して進める方が向いている");
    } else if (decomp < 0.4) {
      factors.push("大きな塊で一気にやる方が集中できる");
    }
  }

  // 完璧主義
  const perf = scores.perfectionist_vs_pragmatic;
  if (perf !== undefined && perf < 0.35) {
    factors.push("完璧主義傾向があるので「十分」のラインを先に決める");
  }

  // 変化への開放性
  const change = scores.change_embrace_vs_resist;
  if (change !== undefined && mode === "explore") {
    if (change > 0.6) {
      factors.push("新しいことへの抵抗が少ない — 大胆に試してOK");
    } else if (change < 0.4) {
      factors.push("新しいことにストレスを感じやすい — 小さく試す");
    }
  }

  // 判断テンポ
  const tempo = scores.decision_tempo;
  if (tempo !== undefined) {
    if (tempo > 0.6) {
      factors.push("直感で動く方が向いている — 考えすぎない");
    } else if (tempo < 0.4) {
      factors.push("じっくり考えてから動く方がいい — 焦らない");
    }
  }

  return factors.slice(0, 3); // 最大3つ
}

/**
 * DailyGuidanceSkeleton → LLM プロンプト注入テキスト。
 * 判断エンジンの buildSkeletonPromptBlock とは完全に独立。
 */
export function buildDailyGuidancePromptBlock(skeleton: DailyGuidanceSkeleton): string {
  const lines: string[] = [];
  lines.push("## 今日のガイダンス骨格（この構造に従って文章化せよ）");
  lines.push("");
  lines.push(`モード: ${skeleton.daily_mode}`);
  lines.push(`今日の軸: ${skeleton.primary_axis}`);
  lines.push("");

  if (skeleton.must_do_block.length > 0) {
    lines.push("### 絶対やること:");
    for (const item of skeleton.must_do_block) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  lines.push("### 最初の一歩:");
  lines.push(`${skeleton.recommended_first_step}`);
  lines.push("");
  lines.push("### エネルギー切れ時:");
  lines.push(`${skeleton.fallback_step}`);
  lines.push("");
  lines.push("### 今日やらない方がいいこと:");
  lines.push(`${skeleton.avoid_today}`);
  lines.push("");

  if (skeleton.grounding_factors.length > 0) {
    lines.push("### 判断根拠（君の性格データから）:");
    for (const f of skeleton.grounding_factors) {
      lines.push(`- ${f}`);
    }
    lines.push("");
  }

  lines.push("**文章化ルール:**");
  lines.push("- 1行目は「今日は〇〇する日」のように明快に。曖昧な導入禁止。");
  lines.push("- 「最初の一歩」は具体的な行動1つ。動詞+対象+時間を含める。");
  lines.push("- 「休む」だけでは不可。「何をして休むか」を具体的に指示する。");
  lines.push("- 性格データからの根拠を自然に織り込む（データ用語は使わない）。");
  lines.push("- 全体で200-350文字以内。");

  return lines.join("\n");
}

/**
 * Daily Guidance 専用の応答品質バリデーション。
 * 判断エンジンの validateResponseQuality とは完全に独立。
 */
export function validateDailyGuidanceResponse(
  response: string,
  skeleton: DailyGuidanceSkeleton,
): ConsistencyCheck {
  const failures: string[] = [];
  const text = response;

  // 1. 最初の一歩に動詞+対象が含まれているか
  // 応答全体のどこかに具体的行動が書かれているか
  const hasConcreteAction = /[をにへで].*[するしろせよ]|行[くけこ]|送[るれ]|書[くけ]|読[むめ]|作[るれ]|片付け|始め|選[ぶべ]|出[すせ]/.test(text);
  if (!hasConcreteAction) {
    failures.push("具体的な行動指示が見つからない（動詞+対象がない）");
  }

  // 2. 「休む」単体禁止 — 「何をして休むか」が必要
  if (/今日は休[みむめもんっ]/.test(text) && !/休[みむめ].*[をにで]|[をにで].*休/.test(text)) {
    // 「休みましょう」だけで具体的な休み方がない
    if (!/横にな[るっ]|散歩|呼吸|ストレッチ|湯船|音楽|読書|瞑想|昼寝|カフェ|自然/.test(text)) {
      failures.push("「休む」だけで具体的な休み方が書かれていない");
    }
  }

  // 3. 一般論スコア（Daily Guidance 版）
  const GENERIC_PATTERNS = [
    /大切です/, /心がけましょう/,
    /バランスが重要/, /無理をしないで/,
    /自分を大切に/,
  ];
  const genericHits = GENERIC_PATTERNS.filter((p) => p.test(text)).length;
  const generic_response_score = genericHits / GENERIC_PATTERNS.length;
  if (generic_response_score >= 0.4) {
    failures.push(`一般論率が高い(${generic_response_score.toFixed(2)}): 具体的なガイダンスが不足`);
  }

  // 4. skeleton.daily_mode と応答の整合性
  if (skeleton.daily_mode === "recover" && /頑張[ろれり]|全力|攻め/.test(text)) {
    failures.push("recoverモードなのに頑張りを推奨している");
  }
  if (skeleton.daily_mode === "advance" && /何もしなくていい|ゆっくり.*だけ/.test(text)) {
    failures.push("advanceモードなのに行動を全く推奨していない");
  }

  // 5. 文字数チェック（200-400文字）
  if (text.length < 100) {
    failures.push("応答が短すぎる（100文字未満）");
  }

  // 6. 所要時間が含まれているか
  const hasTimeDuration = /\d+分|\d+時間|半日|午前中|午後|朝一/.test(text);
  if (!hasTimeDuration) {
    failures.push("所要時間の指定がない（「〜分」「〜時間」が必要）");
  }

  // 7. 応答が途中で切れていないか
  const lastChar = text.trim().slice(-1);
  if (/[をにでがはもへとの、]/.test(lastChar)) {
    failures.push("応答が途中で切れている（助詞で終了）");
  }

  return {
    pass: failures.length === 0,
    failures,
    generic_response_score,
  };
}
