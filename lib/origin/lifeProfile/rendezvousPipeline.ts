// lib/origin/lifeProfile/rendezvousPipeline.ts
// Origin → Rendezvous 裏パイプライン
//
// Originに記録された深層プロフィールから、
// Rendezvousのマッチング精度を高めるシグナルを抽出する。
// ユーザーはRendezvous側で入力する必要がない。
// 分身がこの情報を持って旅に出る。

import type {
  LifeProfileStore,
  RendezvousSignal,
  LifeProfileEntry,
} from "./types";
import { getOverallDepth } from "./store";
import { getTopViewedCategories, getDepthSkipRate } from "./passiveObserver";

/** エントリの深掘り回答からキーワードを抽出 */
function extractKeywords(entry: LifeProfileEntry): string[] {
  const keywords: string[] = [entry.title];
  for (const r of entry.depthResponses) {
    // 回答の最初の文を抽出（簡易サマリー）
    const firstSentence = r.answer.split(/[。！？\n]/)[0].trim();
    if (firstSentence && firstSentence.length <= 60) {
      keywords.push(firstSentence);
    }
  }
  return keywords;
}

/** 深掘りの最初の回答を取得（= 最も深い理由） */
function getDeepReason(entry: LifeProfileEntry): string | null {
  if (entry.depthResponses.length === 0) return null;
  return entry.depthResponses[0].answer;
}

/**
 * Originの全データからRendezvousシグナルを生成
 *
 * これは裏で動くパイプライン:
 * - ユーザーがOriginに情報を入れるたびに再計算可能
 * - Rendezvous側はこのシグナルを参照してマッチング精度を高める
 */
export function generateRendezvousSignals(
  store: LifeProfileStore,
): RendezvousSignal {
  const entries = store.entries.filter((e) => e.active);

  // ── ペットシグナル ──
  const petEntries = entries.filter((e) => e.category === "pets");
  const petSignals = petEntries.map((e) => ({
    type: e.title,
    importance: e.impact,
  }));

  // ── 家族シグナル ──
  const familyEntries = entries.filter((e) => e.category === "family");
  const familySignals = familyEntries.map((e) => ({
    role: e.title,
    livingTogether: e.active && !e.until,
  }));

  // ── 価値観キーワード ──
  const valueEntries = entries.filter((e) => e.category === "values");
  const coreValues = valueEntries.flatMap(extractKeywords).slice(0, 10);

  // ── キャリア特性 ──
  const careerEntries = entries.filter((e) => e.category === "career");
  const careerTraits = careerEntries.flatMap(extractKeywords).slice(0, 8);

  // ── 恋愛パターン ──
  const romanticEntries = entries.filter((e) => e.category === "romantic");
  const romanticTraits = romanticEntries.flatMap(extractKeywords).slice(0, 8);

  // ── 情熱シグナル ──
  const passionEntries = entries.filter((e) => e.category === "passions");
  const passionSignals = passionEntries.map((e) => ({
    what: e.title,
    deepReason: getDeepReason(e),
  }));

  // ── 生活環境特性 ──
  const livingEntries = entries.filter((e) => e.category === "living");
  const livingTraits = livingEntries.flatMap(extractKeywords).slice(0, 6);

  // ── #8 受動観測データ ──
  const topInterestCategories = getTopViewedCategories();
  const skipRate = getDepthSkipRate();
  const introspectionLevel: "high" | "medium" | "low" =
    skipRate < 0.3 ? "high" : skipRate < 0.6 ? "medium" : "low";

  return {
    petSignals,
    familySignals,
    coreValues,
    careerTraits,
    romanticTraits,
    passionSignals,
    livingTraits,
    topInterestCategories,
    introspectionLevel,
    selfUnderstandingDepth: getOverallDepth(store),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * シグナルの要約を人間が読める形にする（デバッグ・透明性用）
 * Origin UIの「分身が知っていること」表示に使う
 */
export function summarizeSignals(signals: RendezvousSignal): string[] {
  const lines: string[] = [];

  if (signals.petSignals.length > 0) {
    lines.push(
      `🐾 ${signals.petSignals.map((p) => p.type).join("、")}と暮らしている`,
    );
  }
  if (signals.familySignals.length > 0) {
    const living = signals.familySignals.filter((f) => f.livingTogether);
    if (living.length > 0) {
      lines.push(
        `🏠 ${living.map((f) => f.role).join("、")}と同居中`,
      );
    }
  }
  if (signals.coreValues.length > 0) {
    lines.push(`🌟 大切にしていること: ${signals.coreValues.slice(0, 3).join("、")}`);
  }
  if (signals.passionSignals.length > 0) {
    lines.push(
      `🔥 情熱: ${signals.passionSignals.map((p) => p.what).join("、")}`,
    );
  }
  if (signals.careerTraits.length > 0) {
    lines.push(`💼 ${signals.careerTraits[0]}`);
  }
  if (signals.romanticTraits.length > 0) {
    lines.push(`💫 恋愛: ${signals.romanticTraits[0]}`);
  }

  return lines;
}
