// lib/stargazer/dreamBridge.ts
// 夢日記データ・価値観・ACT HexaflexをAlterコンテキストに接続するブリッジ

import {
  loadDreams,
  ARCHETYPE_LABELS,
  type DreamEntry,
  type JungianArchetype,
} from "./dreamJournal";
import { extractImplicitValues } from "./implicitValuesExtractor";
import { assessHexaflex } from "./actHexaflex";
import type { TraitAxisKey } from "./traitAxes";

/**
 * 直近の夢データからAlterプロンプト用のコンテキストを生成
 */
export function buildDreamContextForAlter(): string {
  const dreams = loadDreams();
  if (dreams.length === 0) return "";

  const recent = dreams.slice(0, 5);

  // Count archetype frequencies
  const archetypeCounts: Partial<Record<JungianArchetype, number>> = {};
  for (const dream of recent) {
    for (const symbol of dream.symbols) {
      archetypeCounts[symbol.archetype] =
        (archetypeCounts[symbol.archetype] || 0) + 1;
    }
  }

  const topArchetypes = Object.entries(archetypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([arch, count]) => {
      const def = ARCHETYPE_LABELS[arch as JungianArchetype];
      return `${def?.label ?? arch}（${count}回出現）`;
    });

  if (topArchetypes.length === 0) return "";

  // Count emotions
  const negCount = recent.filter((d) => d.emotion === "negative").length;
  const posCount = recent.filter((d) => d.emotion === "positive").length;

  let emotionNote = "";
  if (negCount > posCount + 1) {
    emotionNote =
      "最近の夢はネガティブな感情が多い。無意識が何かを処理しようとしている。";
  } else if (posCount > negCount + 1) {
    emotionNote =
      "最近の夢はポジティブな感情が多い。統合が進んでいるサイン。";
  }

  return `
## 夢のデータ（最近${recent.length}件の夢から）
ユーザーの夢に繰り返し現れる元型: ${topArchetypes.join("、")}
${emotionNote}
これらのパターンは無意識からのメッセージかもしれない。対話の中で自然に触れる機会があれば活用する。ただし押し付けない。
`.trim();
}

/**
 * 価値観とACT Hexaflexデータから Alter コンテキストを生成
 */
export function buildValuesContextForAlter(
  axisScores: Partial<Record<TraitAxisKey, number>>,
): string {
  const sections: string[] = [];

  // Values
  const values = extractImplicitValues(axisScores);
  if (values && values.values.length > 0) {
    const topValues = values.values
      .slice(0, 3)
      .map((v) => v.name)
      .join("、");
    sections.push(`ユーザーの暗黙の価値観: ${topValues}`);
    if (values.coreTheme) {
      sections.push(`人生の中心テーマ: ${values.coreTheme}`);
    }
    if (values.conflicts.length > 0) {
      sections.push(`価値観の対立: ${values.conflicts[0].description}`);
    }
  }

  // ACT Hexaflex
  const hexaflex = assessHexaflex(axisScores);
  if (hexaflex) {
    const weakLabel =
      hexaflex.scores.find((s) => s.process === hexaflex.weakest)?.label ??
      hexaflex.weakest;
    sections.push(
      `心理的柔軟性が最も低い領域: ${weakLabel}（この領域で硬直しやすい）`,
    );
  }

  if (sections.length === 0) return "";

  return `
## 価値観と心理的柔軟性
${sections.join("\n")}
これらの情報は対話の中で自然に活用する。価値観を否定せず、対立に気づかせる。
`.trim();
}
