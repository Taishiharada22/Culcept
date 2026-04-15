/**
 * LLM Plan Extractor — Turn 1 のユーザー発話から PlanState を構造化抽出
 *
 * 設計原則:
 * - LLM が意味理解（5W1H 抽出、否定検出）を担当
 * - 既存テーブル（placeTable / activityVocabulary）が語彙正規化を担当
 * - コードが状態管理・ID生成・型変換を担当
 * - LLM は情報抽出のみ。状態を持たない
 *
 * 参照: docs/morning-protocol-v2-design.md §4
 */

import { runAI } from "@/lib/ai";
import { resolvePlaceFromText } from "./placeTable";
import { resolveActivity, getDefaultDuration } from "./activityVocabulary";
import { todayJST } from "./dateUtils";
import {
  type PlanState,
  type PlanSegment,
  type LLMExtractResult,
  type LLMRawSegment,
  type TimeHint,
  type SegmentStatus,
  LLM_EXTRACT_SCHEMA,
  generateSegmentId,
} from "./planState";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM System Prompt
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SYSTEM_PROMPT = `あなたはスケジュール解析AIです。ユーザーの発話から1日の予定を構造化してください。

ルール:
- ユーザーが言及していない情報は null にする
- 「マック」「マクド」「スタバ」等の略称はそのまま出力する（正規化は後工程）
- 否定文（「〜ない」「〜以外に〜ない」）は予定に含めない
- 「仕事の打ち合わせ」「コードレビュー」は1つの活動として扱う（分割しない）
- 「食事して」→「食事」、「買い物して」→「買い物」のように動詞を除去して名詞形で出力
- 「明日の予定だけど」「今日なんだけど」等の前置きから targetDate を判定する
- 「朝から」→ morning、「お昼」→ noon、「午後から」→ afternoon、「夕方」→ evening
- 「帰宅」「帰る」「終了」等は endAction として抽出する
- companions: 「A君」「佐藤さん」等の人名のみ抽出。「友達」「同僚」も可
- 外出するか判定: 場所が自宅外なら goOut=true、「家で」「自宅で」なら goOut=false、不明なら null
- startPlace: 出発地点。「自宅」「ホテル」「実家」「会社」等。言及がなければ null`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Turn 1: LLM 抽出 → PlanState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function extractPlanFromText(
  userMessage: string,
  userId?: string,
): Promise<PlanState | null> {
  const result = await runAI({
    taskType: "morning_plan_extract",
    prompt: userMessage,
    systemPrompt: SYSTEM_PROMPT,
    requireJson: true,
    jsonSchema: LLM_EXTRACT_SCHEMA as Record<string, unknown>,
    temperature: 0.1,
    maxOutputTokens: 1024,
    timeoutMs: 5000,
    userId,
  });

  if (!result.success || !result.structured) {
    return null;
  }

  const raw = result.structured as unknown as LLMExtractResult;
  if (!raw.targetDate || !Array.isArray(raw.segments)) {
    return null;
  }

  return normalizeLLMOutput(raw);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM 出力の正規化 → PlanState
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function normalizeLLMOutput(raw: LLMExtractResult): PlanState {
  const segments: PlanSegment[] = raw.segments.map((seg) =>
    normalizeSegment(seg),
  );

  const { absoluteDate, label } = resolveTargetDate(raw.targetDate);
  const missingFields = detectMissingFields(segments, raw);

  return {
    targetDate: absoluteDate,
    targetDateLabel: label,
    timezone: "Asia/Tokyo",
    segments,
    transport: normalizeTransport(raw.transport),
    endTime: raw.endTime ?? undefined,
    endAction: raw.endAction ?? undefined,
    endpointType: raw.endAction ? resolveEndpointType(raw.endAction) : undefined,
    goOut: raw.goOut ?? undefined,
    startPoint: raw.startPlace ?? undefined,
    status: missingFields.length > 0 ? "collecting" : "collecting",
    missingFields,
  };
}

function normalizeSegment(seg: LLMRawSegment): PlanSegment {
  // 場所の正規化
  const placeResult = seg.place ? resolvePlaceFromText(seg.place) : null;

  // 活動の正規化
  const activityResult = resolveActivity(seg.activity);

  return {
    id: generateSegmentId(),
    order: seg.order,
    timeHint: normalizeTimeHint(seg.timeHint),
    startTime: seg.startTime ?? undefined,
    activity: seg.activity,
    activityCanonical: activityResult?.canonical ?? seg.activity,
    activityCategory: activityResult?.category as PlanSegment["activityCategory"],
    estimatedDurationMin: activityResult?.defaultDurationMin ?? getDefaultDuration(seg.activity),
    place: seg.place ?? undefined,
    placeCanonical: placeResult?.place.canonicalLabel ?? seg.place ?? undefined,
    placeCategory: placeResult?.place.category as PlanSegment["placeCategory"],
    companions: seg.companions ?? [],
    transport: normalizeTransport(seg.transport),
    status: "tentative" as SegmentStatus,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// targetDate 解決
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function resolveTargetDate(raw: string): { absoluteDate: string; label: string } {
  const today = todayJST();
  const todayDate = new Date(today + "T00:00:00+09:00");

  switch (raw) {
    case "tomorrow": {
      const d = new Date(todayDate);
      d.setDate(d.getDate() + 1);
      return { absoluteDate: formatDate(d), label: "明日" };
    }
    case "day_after_tomorrow": {
      const d = new Date(todayDate);
      d.setDate(d.getDate() + 2);
      return { absoluteDate: formatDate(d), label: "明後日" };
    }
    case "today":
    default:
      return { absoluteDate: today, label: "今日" };
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 不足フィールド検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectMissingFields(segments: PlanSegment[], raw: LLMExtractResult): string[] {
  const missing: string[] = [];
  const goOut = raw.goOut ?? segments.some((s) => s.place);

  // 1. Departure time — 最初のセグメントに開始時刻が未指定（何時に出発するかでプラン全体が変わる）
  const hasAnyStartTime = segments.some((s) => s.startTime);
  if (!hasAnyStartTime && segments.length > 0) {
    missing.push("departureTime");
  }

  // 2. Transport — 外出するのに移動手段が不明
  if (!raw.transport && !segments.some((s) => s.transport)) {
    if (goOut) {
      missing.push("transport");
    }
  }

  // 3. Meeting/appointment place — 打ち合わせ等で場所が未指定（外出プランの場合）
  if (goOut) {
    const NEEDS_PLACE_RE = /打ち合わせ|ミーティング|meeting|会議|面談|商談|面接|セミナー|研修/i;
    for (const seg of segments) {
      if (NEEDS_PLACE_RE.test(seg.activity) && !seg.place) {
        missing.push(`segmentPlace:${seg.id}:${seg.activityCanonical ?? seg.activity}`);
      }
    }
  }

  return missing;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confirm Message — PlanState ベースの全体要約 (Turn 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TIME_HINT_LABELS: Record<string, string> = {
  morning: "朝",
  noon: "昼",
  afternoon: "午後",
  evening: "夕方",
};

export function buildPlanConfirmMessage(state: PlanState): string {
  const date = state.targetDateLabel;

  const segmentDescs = state.segments.map((seg) => {
    const time = seg.timeHint ? TIME_HINT_LABELS[seg.timeHint] ?? "" : "";
    const place = seg.placeCanonical ?? seg.place ?? "";
    const who =
      seg.companions.length > 0 ? `${seg.companions.join("、")}と` : "";
    const where = place ? `${place}で` : "";
    const activity = seg.activityCanonical ?? seg.activity;
    return `${time}は${where}${who}${activity}`;
  });

  const endPart = state.endTime
    ? `、${state.endTime}頃終了予定`
    : "";
  const endActionPart = state.endAction
    ? `で${state.endAction}`
    : "";

  const clarify =
    state.missingFields.length > 0
      ? `\n${buildClarifyFromMissing(state.missingFields)}`
      : "";

  return `了解。${date}は、${segmentDescs.join("、")}${endPart}${endActionPart}だね。${clarify}`.trim();
}

function buildClarifyFromMissing(fields: string[]): string {
  const questions: string[] = [];
  for (const f of fields) {
    if (f === "departureTime") {
      questions.push("何時頃から動き出す予定？");
    } else if (f === "transport") {
      questions.push("移動手段は何にする？");
    } else if (f.startsWith("segmentPlace:")) {
      // format: "segmentPlace:<id>:<activityLabel>"
      const parts = f.split(":");
      const activityLabel = parts.slice(2).join(":"); // activity名にコロンが含まれる可能性
      questions.push(`${activityLabel}はどこでやる予定？`);
    }
  }
  if (questions.length === 0) return "";
  if (questions.length === 1) return questions[0];
  // 複数質問: 自然にまとめる
  return `いくつか確認させて。${questions.join("\nそれと、")}`;
}

/** missingFields のうち指定フィールドを除去 */
export function removeMissingField(state: PlanState, fieldPrefix: string): PlanState {
  return {
    ...state,
    missingFields: state.missingFields.filter(f => !f.startsWith(fieldPrefix)),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confirm Message — Diff (Turn 2+)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { PlanDelta } from "./planState";

export function buildDeltaConfirmMessage(
  state: PlanState,
  delta: PlanDelta,
): string {
  // 変更リストから決定論的に要約を生成
  const descriptions: string[] = [];

  for (const change of delta.changes) {
    const seg = change.segmentId
      ? state.segments.find((s) => s.id === change.segmentId)
      : null;
    const segLabel = seg
      ? (seg.activityCanonical ?? seg.activity)
      : "";

    switch (change.type) {
      case "replace": {
        if (change.field === "place") {
          descriptions.push(
            `${segLabel}の場所を${String(change.newValue ?? "変更")}に変更`,
          );
        } else if (change.field === "activity") {
          descriptions.push(
            `${segLabel}を${String(change.newValue ?? "変更")}に変更`,
          );
        } else if (change.field === "companions") {
          const val = Array.isArray(change.newValue) ? change.newValue.join("、") : String(change.newValue ?? "");
          descriptions.push(`${segLabel}の同行者を${val}に変更`);
        } else if (change.field === "startTime") {
          descriptions.push(`${segLabel}の時間を${String(change.newValue ?? "")}に変更`);
        } else {
          descriptions.push(`${segLabel}の${change.field}を更新`);
        }
        break;
      }
      case "set": {
        if (change.field === "transport") {
          const labels: Record<string, string> = {
            car: "車", train: "電車", bus: "バス", walk: "徒歩",
            bicycle: "自転車", taxi: "タクシー", motorcycle: "バイク",
          };
          const val = String(change.newValue ?? "");
          descriptions.push(`移動は${labels[val] ?? val}`);
        } else if (change.field === "endTime") {
          descriptions.push(`終了時刻を${String(change.newValue ?? "")}に設定`);
        } else {
          descriptions.push(`${change.field}を設定`);
        }
        break;
      }
      case "remove":
        descriptions.push(`${segLabel}の${change.field}を削除`);
        break;
      case "add_segment":
        descriptions.push(`${String(change.newSegment?.activity ?? "新しい予定")}を追加`);
        break;
      case "remove_segment":
        descriptions.push(`${segLabel}を削除`);
        break;
    }
  }

  if (descriptions.length === 0) {
    return "了解。更新したよ。";
  }

  return `了解。${descriptions.join("、")}で更新したよ。`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanState → PlanItem[] 変換（既存 UI 互換レイヤー）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { PlanItem, MainLocation } from "./types";

export function planStateToPlanItems(state: PlanState): PlanItem[] {
  return state.segments.map((seg, index) => {
    const location: MainLocation | undefined = seg.placeCanonical
      ? {
          canonicalId: seg.placeCategory ?? seg.placeCanonical,
          label: seg.placeCanonical,
          category: seg.placeCategory,
          source: "user_explicit" as const,
        }
      : undefined;

    // what(where) 形式のテキスト生成
    const activity = seg.activityCanonical ?? seg.activity;
    const place = seg.placeCanonical ?? seg.place;
    const text = place ? `${activity}(${place})` : activity;

    return {
      id: seg.id,
      kind: seg.startTime ? "fixed" as const : "todo" as const,
      text,
      what: activity,
      startTime: seg.startTime,
      durationMin: seg.estimatedDurationMin ?? 45,
      fixedStart: !!seg.startTime,
      orderHint: index,
      sourceTurnIndex: 0,
      eventType: undefined,
      withWhom: seg.companions.length > 0 ? seg.companions.join("、") : undefined,
      completed: false,
      location,
      activityCategory: seg.activityCategory,
      sequenceOrder: seg.order,
    };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function normalizeTimeHint(raw?: string | null): TimeHint | undefined {
  if (!raw) return undefined;
  const valid: TimeHint[] = ["morning", "noon", "afternoon", "evening"];
  return valid.includes(raw as TimeHint) ? (raw as TimeHint) : undefined;
}

function normalizeTransport(raw?: string | null): PlanSegment["transport"] {
  if (!raw) return undefined;
  const valid = ["car", "train", "bus", "walk", "bicycle", "taxi", "motorcycle", "plane"];
  return valid.includes(raw) ? (raw as PlanSegment["transport"]) : undefined;
}

function resolveEndpointType(action: string): PlanState["endpointType"] {
  if (/帰宅|帰[るり]|家に/.test(action)) return "home";
  if (/ホテル/.test(action)) return "hotel";
  if (/会社|オフィス|職場/.test(action)) return "office";
  return "home";
}
