// Origin v8 — Memory Dive Engine (記憶ダイブ → MemoryGem 生成)
// ダイブドラフトからメモリージェムを結晶化する

import type { MemoryDiveDraft, MemoryGem } from "./types";
import { ageToPeriod } from "./lifeCalendarEngine";
import { PLACE_CARDS } from "./memoryDiveData";

/**
 * MemoryDiveDraft から MemoryGem を生成する。
 *
 * - 全5フェーズ (scene, senses, events, inner, ripple) のデータが
 *   揃っていない場合は null を返す。
 * - タイトルは scene.place + season + events.narrative から導出。
 * - dominantEmotion は inner.emotions[0] から導出。
 * - lifePeriod は scene.year + birthYear から ageToPeriod で導出。
 * - id は crypto.randomUUID() で生成。
 *
 * @param draft 記憶ダイブドラフト
 * @param birthYear 生まれた年（optional、lifePeriod 算出に使用）
 */
export function createMemoryGem(
  draft: MemoryDiveDraft,
  birthYear?: number,
): MemoryGem | null {
  // All phases must be present (card-only path: text fields may be empty)
  if (!draft.scene || !draft.senses || !draft.events || !draft.inner || !draft.ripple) {
    return null;
  }

  const { scene, senses, events, inner, ripple } = draft;

  // Derive title from scene context + narrative snippet
  const seasonLabel = scene.season ?? "";
  // Use place text if available, otherwise derive from placeCard
  const placeLabel = scene.place?.trim()
    || (scene.placeCard ? (PLACE_CARDS.find((c) => c.id === scene.placeCard)?.label ?? "") : "");
  const narrativeSnippet = events.narrative
    ? events.narrative.slice(0, 20).trim()
    : "";

  let title = "";
  if (placeLabel && seasonLabel) {
    title = `${placeLabel}の${seasonLabel}`;
  } else if (placeLabel) {
    title = placeLabel;
  } else if (seasonLabel) {
    title = seasonLabel;
  }
  if (narrativeSnippet) {
    title = title ? `${title} — ${narrativeSnippet}` : narrativeSnippet;
  }
  if (!title) {
    title = "無題の記憶";
  }

  // Derive dominant emotion
  const dominantEmotion =
    inner.emotions.length > 0 ? inner.emotions[0] : "unknown";

  // Derive calendar year/month
  const calendarYear = scene.year ?? new Date().getFullYear();
  const calendarMonth = scene.month ?? 1;

  // Derive life period from age
  let lifePeriod = ageToPeriod(0);
  if (birthYear && scene.year) {
    const age = scene.year - birthYear;
    lifePeriod = ageToPeriod(Math.max(0, age));
  }

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    diveId: draft.id,
    scene,
    senses,
    events,
    inner,
    ripple,
    dominantEmotion,
    title,
    calendarYear,
    calendarMonth,
    lifePeriod,
    createdAt: now,
  };
}
