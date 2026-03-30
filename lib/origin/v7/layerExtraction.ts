/**
 * レガシー chapter 用の層抽出ユーティリティ
 * layers フィールドを持たない既存 chapter から ChapterLayers を推定する
 */

import type { MemoryChapter, ChapterLayers } from "./types";
import { getAtmosphereLabel } from "./atmosphereData";
import { getPerspectiveLabel } from "./perspectiveData";
import { getComparisonLabel } from "./comparisonData";
import { getTriggerLabel } from "./triggerData";

/**
 * chapter.layers があればそのまま返す。
 * なければ既存フィールドから ChapterLayers を推定する。
 */
export function extractLayers(chapter: MemoryChapter): ChapterLayers {
  if (chapter.layers) return chapter.layers;

  const layers: ChapterLayers = {};

  // events: finalText を「何が起きていたか」として使用
  const finalText = chapter.meaning.finalText;
  if (finalText) {
    layers.events = finalText;
  }

  // place / lifeScene: triggers からそれぞれ推定
  const triggerLabels = chapter.fact.triggers.map(getTriggerLabel);
  if (triggerLabels.length > 0) {
    layers.lifeScene = triggerLabels.join("、");
  }

  // presentImpact: echoes から生成
  if (chapter.echoes.length > 0) {
    layers.presentImpact = `今にも「${chapter.echoes.join("」「")}」が残っています`;
  }

  // innerState: atmosphere + perspective から推定
  const atmo = getAtmosphereLabel(chapter.mood.atmosphere);
  const persp = getPerspectiveLabel(chapter.mood.perspective);
  if (atmo || persp) {
    const parts: string[] = [];
    if (atmo) parts.push(`${atmo}の空気の中で`);
    if (persp) parts.push(`周りからは「${persp}」と見えていた`);
    layers.innerState = parts.join("、");
  }

  // learnedPatterns: comparison から推定
  const comp = getComparisonLabel(chapter.mood.comparison);
  if (comp) {
    layers.learnedPatterns = `${comp}ことから、今の動き方が形作られた可能性があります`;
  }

  return layers;
}

/**
 * 層のマージ — 既存層に新しいデータを上書き（nullish合体）
 */
export function mergeLayers(
  existing: ChapterLayers,
  update: Partial<ChapterLayers>,
): ChapterLayers {
  return {
    events: update.events ?? existing.events,
    innerState: update.innerState ?? existing.innerState,
    learnedPatterns: update.learnedPatterns ?? existing.learnedPatterns,
    presentImpact: update.presentImpact ?? existing.presentImpact,
    nextConnection: update.nextConnection ?? existing.nextConnection,
    place: update.place ?? existing.place,
    lifeScene: update.lifeScene ?? existing.lifeScene,
    relationships: update.relationships ?? existing.relationships,
    deepDivePrompts: update.deepDivePrompts ?? existing.deepDivePrompts,
  };
}
