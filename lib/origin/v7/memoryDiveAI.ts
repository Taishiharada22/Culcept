// Origin v8 — Memory Dive AI Completion
// カード選択のみのドラフトから、AIが narrative / thoughts / impact を補完する
// クライアント側で呼び出し、結果をドラフトにマージ

import type {
  DiveSceneData,
  DiveSensesData,
  DiveEventsData,
  DiveInnerData,
  DiveRippleData,
} from "./types";
import {
  PLACE_CARDS,
  SEASON_CARDS,
  TIME_OF_DAY_CARDS,
  ATMOSPHERE_CARDS,
  PEOPLE_CARDS,
  SIGHT_CARDS,
  SOUND_CARDS,
  SMELL_CARDS,
  TEMPERATURE_CARDS,
  TOUCH_CARDS,
  EVENT_TYPE_CARDS,
  EMOTION_CARDS,
  IMPACT_TYPE_CARDS,
} from "./memoryDiveData";

/* ─── Types ─── */

export type AICompletionResult = {
  narrative: string;       // events.narrative
  pivotalMoment: string;   // events.pivotalMoment
  thoughts: string;        // inner.thoughts
  unsaid: string;          // inner.unsaid
  impact: string;          // ripple.impact
  counterfactual: string;  // ripple.counterfactual
  patternStarted: string;  // ripple.patternStarted
};

/* ─── Check if AI completion is needed ─── */

export function needsAICompletion(
  events: DiveEventsData,
  inner: DiveInnerData,
  ripple: DiveRippleData,
): boolean {
  const textFields = [
    events.narrative,
    events.pivotalMoment,
    inner.thoughts,
    inner.unsaid,
    ripple.impact,
    ripple.counterfactual,
    ripple.patternStarted,
  ];
  const filledCount = textFields.filter((t) => t.trim().length > 0).length;
  // If less than half of text fields are filled, offer AI completion
  return filledCount < 3;
}

/* ─── Build prompt from card selections ─── */

function resolveLabel(cards: { id: string; label: string }[], id: string | null): string | null {
  if (!id) return null;
  return cards.find((c) => c.id === id)?.label ?? null;
}

function resolveLabels(cards: { id: string; label: string }[], ids: string[]): string[] {
  return ids.map((id) => cards.find((c) => c.id === id)?.label ?? id);
}

export function buildCompletionPrompt(
  scene: DiveSceneData,
  senses: DiveSensesData,
  events: DiveEventsData,
  inner: DiveInnerData,
  ripple: DiveRippleData,
): string {
  const parts: string[] = [];

  // Scene
  parts.push("## 記憶の情景");
  if (scene.year) parts.push(`年: ${scene.year}年`);
  if (scene.month) parts.push(`月: ${scene.month}月`);
  const season = resolveLabel(SEASON_CARDS, scene.season);
  if (season) parts.push(`季節: ${season}`);
  const place = scene.place?.trim()
    || resolveLabel(PLACE_CARDS, scene.placeCard);
  if (place) parts.push(`場所: ${place}`);
  const people = resolveLabels(PEOPLE_CARDS, scene.people);
  if (people.length > 0) parts.push(`誰がいたか: ${people.join("、")}`);
  const time = resolveLabel(TIME_OF_DAY_CARDS, scene.timeOfDay);
  if (time) parts.push(`時間帯: ${time}`);
  const atmos = resolveLabel(ATMOSPHERE_CARDS, scene.atmosphere);
  if (atmos) parts.push(`天気・空気: ${atmos}`);

  // Senses
  parts.push("\n## 五感の記憶");
  const sight = resolveLabels(SIGHT_CARDS, senses.sight);
  if (sight.length > 0) parts.push(`視覚: ${sight.join("、")}`);
  if (senses.sightText) parts.push(`  → ${senses.sightText}`);
  const sound = resolveLabels(SOUND_CARDS, senses.sound);
  if (sound.length > 0) parts.push(`聴覚: ${sound.join("、")}`);
  if (senses.soundText) parts.push(`  → ${senses.soundText}`);
  const smell = resolveLabels(SMELL_CARDS, senses.smell);
  if (smell.length > 0) parts.push(`嗅覚: ${smell.join("、")}`);
  if (senses.smellText) parts.push(`  → ${senses.smellText}`);
  const temp = resolveLabel(TEMPERATURE_CARDS, senses.temperature);
  if (temp) parts.push(`温度: ${temp}`);
  const touch = resolveLabels(TOUCH_CARDS, senses.touch);
  if (touch.length > 0) parts.push(`触覚: ${touch.join("、")}`);
  if (senses.touchText) parts.push(`  → ${senses.touchText}`);

  // Events
  parts.push("\n## 出来事");
  const eventType = resolveLabel(EVENT_TYPE_CARDS, events.eventType);
  if (eventType) parts.push(`種類: ${eventType}`);
  if (events.intensity > 0) parts.push(`強さ: ${"●".repeat(events.intensity)}${"○".repeat(5 - events.intensity)}`);
  if (events.narrative) parts.push(`語り: ${events.narrative}`);
  if (events.pivotalMoment) parts.push(`決定的瞬間: ${events.pivotalMoment}`);

  // Inner
  parts.push("\n## 内面");
  const emotions = resolveLabels(EMOTION_CARDS, inner.emotions);
  if (emotions.length > 0) parts.push(`感情: ${emotions.join("、")}`);
  if (inner.thoughts) parts.push(`思考: ${inner.thoughts}`);
  if (inner.unsaid) parts.push(`言えなかったこと: ${inner.unsaid}`);
  if (inner.unsaidTarget) parts.push(`相手: ${inner.unsaidTarget}`);

  // Ripple
  parts.push("\n## 波紋");
  const impactType = resolveLabel(IMPACT_TYPE_CARDS, ripple.impactType);
  if (impactType) parts.push(`影響の種類: ${impactType}`);
  if (ripple.impact) parts.push(`影響: ${ripple.impact}`);
  if (ripple.counterfactual) parts.push(`もしなかったら: ${ripple.counterfactual}`);
  if (ripple.patternStarted) parts.push(`始まったパターン: ${ripple.patternStarted}`);

  return parts.join("\n");
}

/* ─── System prompt for AI completion ─── */

export const AI_COMPLETION_SYSTEM = `あなたはユーザーの記憶を丁寧に言語化する手助けをするアシスタントです。
ユーザーはカード選択で記憶の断片を伝えてくれました。
これらの断片から、ユーザーが実際に体験した記憶を想像し、以下のフィールドを補完してください。

## 出力ルール
- ユーザーの視点（一人称）で書く
- 短く、感覚的に。各フィールド1〜3文
- 断定せず、「〜だったのかもしれない」「〜のような」など余白を残す
- 詩的すぎない。日常の言葉で
- ユーザーが既に記入したフィールドはそのまま返す（上書きしない）

## 出力形式（JSON）
{
  "narrative": "何が起きていたかの描写",
  "pivotalMoment": "最も印象的だった瞬間",
  "thoughts": "そのとき頭の中にあったこと",
  "unsaid": "言えなかったこと",
  "impact": "この出来事が自分をどう変えたか",
  "counterfactual": "もしこれがなかったら",
  "patternStarted": "ここから始まった繰り返し"
}`;
