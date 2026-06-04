// lib/plan/mobility/explanationCopy.ts
//
// v0-C: Mobility Explanation Copy Engine
// hypothesis + gateDecision → UI に出せる安全な copy parts（純粋）。
// ★copy は実際にユーザーが見る言葉＝人格診断/押し付けに化けやすい高リスク箇所。最大ケースを安全に扱う。
//
// 構造（シンプル・最大ケース対応）: input → scenario classification → part builders（template）→ copy parts
//
// 純粋関数。UI / localStorage / API / DB / Date.now / production 配線なし。
//
// 禁則:
//   - ❌ 断定・人格診断（「あなたはこういう人」）→ ✅「この区間では / いつもは〜選びがち」（観測・仮説トーン）
//   - ❌「おすすめ」→ ✅ 判断材料・選び直しの招待
//   - ❌ 数字 / 確率 / %（strength は「何度も / 多め」の定性語）
//   - ❌ weather を mode 変更の根拠にする（contextNote は「負担かも」の注意のみ・手段は変えない）
//   - ❌ locked mode / recommendedMode / 距離→mode 推定 / fake duration
//   - ❌ 常時通知風（gate が沈黙判定済・本 engine は沈黙時 safe fallback）

import type { RouteTransportMode } from "@/lib/plan/map/routeMode";
import type {
  MobilityHypothesis,
  ContextNote,
  HabitualStrength,
} from "./mobilityHypothesis";
import type { GateDecision, GateReason } from "./necessityGate";

/** RouteTransportMode 9語 → 日本語ラベル（unknown は safe fallback「移動」） */
const MODE_LABELS: Record<RouteTransportMode, string> = {
  walk: "徒歩",
  car: "車",
  taxi: "タクシー",
  train: "電車",
  shinkansen: "新幹線",
  bus: "バス",
  bicycle: "自転車",
  flight: "飛行機",
  unknown: "移動",
};

/** copy scenario 分類 */
export type CopyScenario = "silent" | "habitual_only" | "habitual_with_context";

/** UI に出せる安全な copy parts（断定でなく仮説トーン） */
export interface ExplanationCopy {
  /** 沈黙なら false（copy なし・safe fallback） */
  readonly surface: boolean;
  /** tone marker / telemetry（gate reason 由来） */
  readonly reasonCode: GateReason;
  readonly scenario: CopyScenario;
  /** 「いつもは X を選びがちです」。沈黙時 null */
  readonly headline: string | null;
  /** 「この区間では X が多めです」（strength-aware・数字なし）。沈黙時 null */
  readonly rationale: string | null;
  /** 「今日は雨なので X は少し負担かもしれません」（contextNote 時のみ・手段変更でない） */
  readonly contextNoteText: string | null;
  /** 「違うなら選び直せます」。沈黙時 null */
  readonly correctionPrompt: string | null;
  /** 訂正候補のラベル（chips 用・none/one/multiple） */
  readonly alternativeLabels: readonly string[];
}

function silent(reasonCode: GateReason): ExplanationCopy {
  return {
    surface: false,
    reasonCode,
    scenario: "silent",
    headline: null,
    rationale: null,
    contextNoteText: null,
    correctionPrompt: null,
    alternativeLabels: [],
  };
}

/** scenario 分類。gate 沈黙 / habitual が無意味(null/unknown) は沈黙 fallback */
function classifyCopyScenario(
  hypothesis: MobilityHypothesis,
  gateDecision: GateDecision,
): CopyScenario {
  if (!gateDecision.surface) return "silent";
  if (hypothesis.habitualMode === null || hypothesis.habitualMode === "unknown") return "silent";
  return hypothesis.contextNote ? "habitual_with_context" : "habitual_only";
}

/** rationale（strength-aware・数字なし・観測であって trait でない） */
function buildRationale(label: string, strength: HabitualStrength): string | null {
  if (strength === "strong") return `この区間では、何度も${label}を選んでいます。`;
  if (strength === "moderate") return `この区間では、${label}が多めです。`;
  return null; // weak/none は gate 済（surface に到達しない想定）
}

/** contextNoteText（注意のみ・手段変更でない）。雨=noun / 暑い=i-adj で接続を分ける */
function buildContextNoteText(note: ContextNote): string {
  const label = MODE_LABELS[note.aboutMode];
  const prefix = note.reason === "rain" ? "今日は雨なので" : "今日は暑いので";
  return `${prefix}、${label}は少し負担かもしれません。`;
}

/** correction 誘導（おすすめでなく選び直しの招待） */
function buildCorrectionPrompt(): string {
  return "違うなら選び直せます。";
}

/**
 * v0-C: hypothesis + gateDecision → 安全な copy parts（純粋）。
 * classify → part builders → assemble。最大ケースをシンプル構造で扱う。
 */
export function buildExplanationCopy(
  hypothesis: MobilityHypothesis,
  gateDecision: GateDecision,
): ExplanationCopy {
  const scenario = classifyCopyScenario(hypothesis, gateDecision);
  const habitualMode = hypothesis.habitualMode;

  // 沈黙 / 防御（unknown・null）は safe fallback
  if (scenario === "silent" || habitualMode === null || habitualMode === "unknown") {
    return silent(gateDecision.reason);
  }

  const label = MODE_LABELS[habitualMode];

  return {
    surface: true,
    reasonCode: gateDecision.reason,
    scenario,
    headline: `いつもは${label}を選びがちです。`,
    rationale: buildRationale(label, hypothesis.habitualStrength),
    contextNoteText: hypothesis.contextNote ? buildContextNoteText(hypothesis.contextNote) : null,
    correctionPrompt: buildCorrectionPrompt(),
    alternativeLabels: hypothesis.alternatives.map((m) => MODE_LABELS[m]),
  };
}
