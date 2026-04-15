/**
 * LLM Delta Parser — Turn 2+ のユーザー発話から PlanDelta を検出
 *
 * 設計原則:
 * - LLM: 変更意図の検出 + targetSegmentHint（自然言語でのセグメント参照）
 * - コード: targetSegmentHint → segmentId の解決（決定論的）
 * - コード: confirmSummary の生成（決定論的）
 * - LLM は segmentId を直接操作しない（LLM にIDを扱わせると hallucinate する）
 *
 * 参照: docs/morning-protocol-v2-design.md §4.2
 */

import { runAI } from "@/lib/ai";
import { resolvePlaceFromText } from "./placeTable";
import { resolveActivity, getDefaultDuration } from "./activityVocabulary";
import {
  type PlanState,
  type PlanSegment,
  type PlanDelta,
  type DeltaChange,
  type DeltaTurnType,
  type DeltaChangeType,
  type LLMDeltaResult,
  type LLMRawSegment,
  LLM_DELTA_SCHEMA,
  generateSegmentId,
} from "./planState";
import { buildDeltaConfirmMessage } from "./llmPlanExtractor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM System Prompt for Delta Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DELTA_SYSTEM_PROMPT = `あなたはスケジュール編集検出AIです。
現在の予定と、ユーザーの新しい発話から、何が変わったかを検出してください。

変更の種類:
- "correction": 既存情報の修正（「違う」「じゃなくて」「変更して」「やっぱり〜」）
- "addition": 新しい予定の追加（「あと〜もある」「〜も追加」）
- "deletion": 既存予定の削除（「やめる」「キャンセル」「なし」）
- "clarify_response": 質問への回答（移動手段、時間等の補足情報）

変更操作の種類:
- "set": 未設定のフィールドに値を設定（clarify_response で使う）
- "replace": 既存の値を新しい値に置換
- "remove": 値を削除
- "add_segment": 新しい予定セグメントを追加
- "remove_segment": 既存の予定セグメントを削除

ルール:
- targetSegmentHint には、対象セグメントを特定するための自然言語ヒントを書く（例: "ランチ", "午後の打ち合わせ", "朝の仕事"）
- segmentId は書かない（後工程でコードが解決する）
- 「違う」「やっぱり」等は変更意図であり、タスク名ではない
- 「ランチは違う店」→ ランチのセグメントの place を replace
- 「移動は車」→ グローバル transport を set（targetSegmentHint は null）
- 「午後の打ち合わせやめる」→ 午後の打ち合わせセグメントを remove_segment`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Turn 2+: LLM Delta 検出 → PlanDelta
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function detectDelta(
  userMessage: string,
  currentState: PlanState,
  userId?: string,
): Promise<PlanDelta | null> {
  // PlanState を LLM に渡す際は、セグメントの自然言語表現を添える
  const stateDescription = formatStateForLLM(currentState);

  const result = await runAI({
    taskType: "morning_plan_delta",
    prompt: `現在の予定:\n${stateDescription}\n\nユーザーの発話:\n${userMessage}`,
    systemPrompt: DELTA_SYSTEM_PROMPT,
    requireJson: true,
    jsonSchema: LLM_DELTA_SCHEMA as Record<string, unknown>,
    temperature: 0.1,
    maxOutputTokens: 1024,
    timeoutMs: 5000,
    userId,
  });

  if (!result.success || !result.structured) {
    return null;
  }

  const raw = result.structured as unknown as LLMDeltaResult;
  if (!raw.turnType || !Array.isArray(raw.changes)) {
    return null;
  }

  // LLM の targetSegmentHint をコードで segmentId に解決
  const resolvedChanges = raw.changes.map((c) =>
    resolveChange(c, currentState),
  );

  const delta: PlanDelta = {
    turnType: normalizeTurnType(raw.turnType),
    changes: resolvedChanges,
    confirmSummary: "", // 後で決定論的に生成
  };

  // confirmSummary はコードが生成（LLM に任せない）
  // applyDelta 後の state で生成するため、ここではダミー値を入れる
  // 呼び出し元で applyDelta → buildDeltaConfirmMessage の順序で処理

  return delta;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// セグメントID解決 — targetSegmentHint → segmentId
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function resolveChange(
  raw: LLMDeltaResult["changes"][number],
  state: PlanState,
): DeltaChange {
  const hint = raw.targetSegmentHint ?? null;
  let segmentId: string | null = null;

  if (hint) {
    segmentId = resolveSegmentIdFromHint(hint, state);
  }

  return {
    type: normalizeChangeType(raw.type),
    segmentId,
    targetSegmentHint: hint ?? undefined,
    field: raw.field,
    newValue: raw.newValue,
    newSegment: raw.newSegment ?? undefined,
  };
}

/**
 * ヒントテキストからセグメントIDを決定論的に解決
 *
 * 解決戦略（優先順位順）:
 * 1. activity 完全一致
 * 2. activityCanonical 完全一致
 * 3. timeHint 一致
 * 4. activity 部分一致
 * 5. place 一致
 */
export function resolveSegmentIdFromHint(
  hint: string,
  state: PlanState,
): string | null {
  const normalizedHint = hint.toLowerCase().trim();

  // 1. activity / activityCanonical 完全一致
  for (const seg of state.segments) {
    if (
      seg.activity === normalizedHint ||
      seg.activityCanonical === normalizedHint
    ) {
      return seg.id;
    }
  }

  // 2. timeHint からの解決（「朝の」「昼の」「午後の」等）
  const timeHintMap: Record<string, string> = {
    朝: "morning",
    午前: "morning",
    昼: "noon",
    ランチ: "noon",
    午後: "afternoon",
    夕方: "evening",
    夜: "evening",
  };
  for (const [keyword, th] of Object.entries(timeHintMap)) {
    if (normalizedHint.includes(keyword)) {
      const match = state.segments.find((s) => s.timeHint === th);
      if (match) return match.id;
    }
  }

  // 3. activity 部分一致
  for (const seg of state.segments) {
    if (
      seg.activity.includes(normalizedHint) ||
      normalizedHint.includes(seg.activity) ||
      (seg.activityCanonical && (
        seg.activityCanonical.includes(normalizedHint) ||
        normalizedHint.includes(seg.activityCanonical)
      ))
    ) {
      return seg.id;
    }
  }

  // 4. place 一致
  for (const seg of state.segments) {
    if (
      (seg.place && normalizedHint.includes(seg.place)) ||
      (seg.placeCanonical && normalizedHint.includes(seg.placeCanonical))
    ) {
      return seg.id;
    }
  }

  // 解決失敗: null を返す（呼び出し元がフォールバック処理）
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyDelta — PlanState に delta を決定論的に適用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function applyDelta(state: PlanState, delta: PlanDelta): PlanState {
  // 不変性を保つ: 新しい state を返す
  let newSegments = state.segments.map((s) => ({ ...s, companions: [...s.companions] }));
  let newTransport = state.transport;
  let newEndTime = state.endTime;
  let newEndAction = state.endAction;
  let newGoOut = state.goOut;

  for (const change of delta.changes) {
    switch (change.type) {
      case "replace":
      case "set": {
        if (change.segmentId) {
          // セグメント内フィールドの変更
          const segIndex = newSegments.findIndex((s) => s.id === change.segmentId);
          if (segIndex >= 0) {
            const seg = { ...newSegments[segIndex], companions: [...newSegments[segIndex].companions] };
            applyFieldChange(seg, change.field, change.newValue);
            newSegments[segIndex] = seg;
          }
        } else {
          // グローバルフィールドの変更
          if (change.field === "transport") {
            newTransport = String(change.newValue ?? "") as PlanState["transport"];
          } else if (change.field === "endTime") {
            newEndTime = String(change.newValue ?? "");
          } else if (change.field === "endAction") {
            newEndAction = String(change.newValue ?? "");
          }
        }
        break;
      }
      case "remove": {
        if (change.segmentId) {
          const segIndex = newSegments.findIndex((s) => s.id === change.segmentId);
          if (segIndex >= 0) {
            const seg = { ...newSegments[segIndex], companions: [...newSegments[segIndex].companions] };
            clearField(seg, change.field);
            newSegments[segIndex] = seg;
          }
        }
        break;
      }
      case "add_segment": {
        if (change.newSegment) {
          const placeResult = change.newSegment.place
            ? resolvePlaceFromText(change.newSegment.place)
            : null;
          const actResult = resolveActivity(change.newSegment.activity);
          const newSeg: PlanSegment = {
            id: generateSegmentId(),
            order: change.newSegment.order ?? newSegments.length + 1,
            timeHint: (change.newSegment.timeHint as PlanSegment["timeHint"]) ?? undefined,
            startTime: change.newSegment.startTime ?? undefined,
            activity: change.newSegment.activity,
            activityCanonical: actResult?.canonical ?? change.newSegment.activity,
            activityCategory: actResult?.category as PlanSegment["activityCategory"],
            estimatedDurationMin: actResult?.defaultDurationMin ?? getDefaultDuration(change.newSegment.activity),
            place: change.newSegment.place ?? undefined,
            placeCanonical: placeResult?.place.canonicalLabel ?? change.newSegment.place ?? undefined,
            placeCategory: placeResult?.place.category as PlanSegment["placeCategory"],
            companions: change.newSegment.companions ?? [],
            status: "tentative",
          };
          newSegments.push(newSeg);
          // order で再ソート
          newSegments.sort((a, b) => a.order - b.order);
        }
        break;
      }
      case "remove_segment": {
        if (change.segmentId) {
          newSegments = newSegments.filter((s) => s.id !== change.segmentId);
        }
        break;
      }
    }
  }

  // 不足フィールドの再計算
  const missingFields: string[] = [];
  if (!newTransport && !newSegments.some((s) => s.transport)) {
    const goOut = newGoOut ?? newSegments.some((s) => s.place);
    if (goOut) {
      missingFields.push("transport");
    }
  }

  return {
    ...state,
    segments: newSegments,
    transport: newTransport,
    endTime: newEndTime,
    endAction: newEndAction,
    goOut: newGoOut,
    missingFields,
  };
}

function applyFieldChange(
  seg: PlanSegment,
  field: string,
  value: string | string[] | null | undefined,
): void {
  switch (field) {
    case "place": {
      const newPlace = String(value ?? "");
      seg.place = newPlace;
      const resolved = resolvePlaceFromText(newPlace);
      seg.placeCanonical = resolved?.place.canonicalLabel ?? newPlace;
      seg.placeCategory = resolved?.place.category as PlanSegment["placeCategory"];
      break;
    }
    case "activity": {
      const newAct = String(value ?? "");
      seg.activity = newAct;
      const resolved = resolveActivity(newAct);
      seg.activityCanonical = resolved?.canonical ?? newAct;
      seg.activityCategory = resolved?.category as PlanSegment["activityCategory"];
      seg.estimatedDurationMin = resolved?.defaultDurationMin ?? getDefaultDuration(newAct);
      break;
    }
    case "companions":
      seg.companions = Array.isArray(value) ? value : [String(value ?? "")];
      break;
    case "startTime":
      seg.startTime = value ? String(value) : undefined;
      break;
    case "timeHint":
      seg.timeHint = value ? (String(value) as PlanSegment["timeHint"]) : undefined;
      break;
    case "transport":
      seg.transport = value ? (String(value) as PlanSegment["transport"]) : undefined;
      break;
  }
}

function clearField(seg: PlanSegment, field: string): void {
  switch (field) {
    case "place":
      seg.place = undefined;
      seg.placeCanonical = undefined;
      seg.placeCategory = undefined;
      break;
    case "activity":
      // activity は必須なので削除不可 — 空文字にはしない
      break;
    case "companions":
      seg.companions = [];
      break;
    case "startTime":
      seg.startTime = undefined;
      break;
    case "transport":
      seg.transport = undefined;
      break;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatStateForLLM(state: PlanState): string {
  const lines: string[] = [];
  lines.push(`対象日: ${state.targetDateLabel}（${state.targetDate}）`);

  for (const seg of state.segments) {
    const time = seg.timeHint ?? "";
    const place = seg.placeCanonical ?? seg.place ?? "";
    const who = seg.companions.length > 0 ? `（${seg.companions.join("、")}と）` : "";
    const activity = seg.activityCanonical ?? seg.activity;
    lines.push(`- [${time}] ${activity} ${place ? `@${place}` : ""} ${who}`.trim());
  }

  if (state.transport) lines.push(`移動手段: ${state.transport}`);
  if (state.endTime) lines.push(`終了: ${state.endTime}`);
  if (state.endAction) lines.push(`終了アクション: ${state.endAction}`);

  if (state.missingFields.length > 0) {
    lines.push(`未回答: ${state.missingFields.join(", ")}`);
  }

  return lines.join("\n");
}

function normalizeTurnType(raw: string): DeltaTurnType {
  const valid: DeltaTurnType[] = ["correction", "addition", "deletion", "clarify_response"];
  return valid.includes(raw as DeltaTurnType)
    ? (raw as DeltaTurnType)
    : "clarify_response";
}

function normalizeChangeType(raw: string): DeltaChangeType {
  const valid: DeltaChangeType[] = ["set", "replace", "remove", "add_segment", "remove_segment"];
  return valid.includes(raw as DeltaChangeType)
    ? (raw as DeltaChangeType)
    : "set";
}
