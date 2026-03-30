/**
 * Assisted Fill — 入力候補の自動サジェストエンジン
 * すべてルールベース（AI不要）。将来的にAI補助を追加可能な構造。
 */

import type { OriginV7Save, LifePeriod, MemoryChapter } from "./types";
import type {
  ActivityEntry,
  TurningPoint,
  EraAffiliation,
  AnalyticalFrame,
  ResidueItem,
  ResidueCategory,
  EraRole,
} from "./workspaceTypes";
import { getPeriodLabel } from "./periods";
import { getEraRoleLabel } from "./eraAffiliationData";
import { RESIDUE_PRESET_LABELS } from "./residueData";
import { REMAIN_ITEMS } from "./currentPositionData";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   出力型
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type Suggestion<T = string> = {
  value: T;
  label: string;
  reason: string;
  source: "rule";
  confidence: number;
};

export type FrameSuggestion = {
  fieldKey: keyof AnalyticalFrame;
  suggestions: Suggestion<string | string[]>[];
};

export type ResidueSuggestion = {
  category: ResidueCategory;
  label: string;
  intensity: "strong" | "moderate" | "faint";
  reason: string;
  sourceChapterId?: string;
};

export type WorkspaceEntrySuggestion = {
  type: "activity" | "turning_point" | "era";
  suggestedData: Partial<ActivityEntry> | Partial<TurningPoint> | Partial<EraAffiliation>;
  reason: string;
  sourceChapterId?: string;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. suggestAnalyticalFrame
   活動/転機 のAnalyticalFrame候補を提示
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function suggestAnalyticalFrame(
  entry: ActivityEntry | TurningPoint,
  save: OriginV7Save,
): FrameSuggestion[] {
  const suggestions: FrameSuggestion[] = [];
  const period = entry.period;
  const frame = "analyticalFrame" in entry ? entry.analyticalFrame : null;

  // A. 同時期のeraからrole候補
  const era = (save.eraAffiliations ?? []).find((e) => e.period === period);
  if (era?.mainRole && (!frame || !frame.role)) {
    suggestions.push({
      fieldKey: "role",
      suggestions: [
        {
          value: era.mainRole,
          label: getEraRoleLabel(era.mainRole),
          reason: `${getPeriodLabel(period)}の時代骨格から`,
          source: "rule",
          confidence: 0.7,
        },
      ],
    });
  }

  // B. 同時期のchapterのechoesからwhatRemains候補
  if (!frame || !frame.whatRemains) {
    const periodChapters = save.chapters.filter((c) => c.fact.period === period);
    const echoSuggestions: Suggestion<string>[] = [];
    for (const ch of periodChapters) {
      for (const echo of ch.echoes) {
        if (!echoSuggestions.some((s) => s.value === echo)) {
          echoSuggestions.push({
            value: echo,
            label: echo,
            reason: `記憶断片「${ch.title}」から`,
            source: "rule",
            confidence: 0.6,
          });
        }
      }
    }
    if (echoSuggestions.length > 0) {
      suggestions.push({
        fieldKey: "whatRemains",
        suggestions: echoSuggestions.slice(0, 3),
      });
    }
  }

  // C. 同カテゴリの他活動のpressureからpressure候補
  if (!frame || !frame.pressure) {
    if ("category" in entry) {
      const relatedActs = (save.activities ?? []).filter(
        (a) => a.category === (entry as ActivityEntry).category && a.id !== entry.id && a.analyticalFrame?.pressure,
      );
      const pressureSuggestions: Suggestion<string>[] = [];
      for (const act of relatedActs) {
        const p = act.analyticalFrame!.pressure!;
        if (!pressureSuggestions.some((s) => s.value === p)) {
          pressureSuggestions.push({
            value: p,
            label: p,
            reason: `同カテゴリの活動「${act.name}」から`,
            source: "rule",
            confidence: 0.5,
          });
        }
      }
      if (pressureSuggestions.length > 0) {
        suggestions.push({
          fieldKey: "pressure",
          suggestions: pressureSuggestions.slice(0, 2),
        });
      }
    }
  }

  // D. era.atmosphere → environment候補
  if (era?.atmosphere && (!frame || !frame.environment)) {
    suggestions.push({
      fieldKey: "environment",
      suggestions: [
        {
          value: era.atmosphere,
          label: era.atmosphere,
          reason: `${getPeriodLabel(period)}の雰囲気から`,
          source: "rule",
          confidence: 0.55,
        },
      ],
    });
  }

  // E. currentPosition.remains → whatRemains 候補（追加分）
  if (!frame || !frame.whatRemains) {
    const cp = save.currentPosition;
    if (cp && cp.remains.length > 0) {
      const remainSuggestions: Suggestion<string>[] = cp.remains
        .map((id) => REMAIN_ITEMS.find((r) => r.id === id))
        .filter(Boolean)
        .map((item) => ({
          value: item!.label,
          label: item!.label,
          reason: "現在地点の「今に残るもの」から",
          source: "rule" as const,
          confidence: 0.5,
        }));
      if (remainSuggestions.length > 0) {
        const existing = suggestions.find((s) => s.fieldKey === "whatRemains");
        if (existing) {
          existing.suggestions.push(...remainSuggestions.slice(0, 2));
        } else {
          suggestions.push({
            fieldKey: "whatRemains",
            suggestions: remainSuggestions.slice(0, 2),
          });
        }
      }
    }
  }

  return suggestions;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   2. suggestResidueFromChapters
   記憶断片のechoesから残留候補を推測
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function suggestResidueFromChapters(
  chapters: MemoryChapter[],
  existingResidue: ResidueItem[],
): ResidueSuggestion[] {
  const existingLabels = new Set(existingResidue.map((r) => r.label));
  const suggestions: ResidueSuggestion[] = [];
  const seen = new Set<string>();

  for (const ch of chapters) {
    for (const echo of ch.echoes) {
      if (seen.has(echo)) continue;
      seen.add(echo);

      // RESIDUE_PRESET_LABELS 内でファジーマッチ
      for (const [category, labels] of Object.entries(RESIDUE_PRESET_LABELS)) {
        const match = labels.find(
          (l) => (l.includes(echo) || echo.includes(l)) && !existingLabels.has(l),
        );
        if (match && !suggestions.some((s) => s.label === match)) {
          suggestions.push({
            category: category as ResidueCategory,
            label: match,
            intensity: "moderate",
            reason: `記憶断片「${ch.title}」の残響「${echo}」から`,
            sourceChapterId: ch.id,
          });
        }
      }
    }

    // learnedPatterns から残留候補
    const layers = ch.layers;
    if (layers?.learnedPatterns) {
      const pattern = layers.learnedPatterns;
      for (const [category, labels] of Object.entries(RESIDUE_PRESET_LABELS)) {
        const match = labels.find(
          (l) => pattern.includes(l) && !existingLabels.has(l) && !suggestions.some((s) => s.label === l),
        );
        if (match) {
          suggestions.push({
            category: category as ResidueCategory,
            label: match,
            intensity: "moderate",
            reason: `「${ch.title}」で覚えた動き方から`,
            sourceChapterId: ch.id,
          });
        }
      }
    }
  }

  return suggestions.slice(0, 6);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   3. suggestWorkspaceEntries
   記憶断片から Activity/TurningPoint/Era 候補を生成
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function suggestWorkspaceEntries(
  chapters: MemoryChapter[],
  save: OriginV7Save,
): WorkspaceEntrySuggestion[] {
  const suggestions: WorkspaceEntrySuggestion[] = [];
  const existingEraPeriods = new Set((save.eraAffiliations ?? []).map((e) => e.period));
  const existingActivityPeriods = new Set((save.activities ?? []).map((a) => a.period));

  for (const ch of chapters) {
    const period = ch.fact.period;

    // Era候補: その period に era が無ければ提案
    if (!existingEraPeriods.has(period)) {
      suggestions.push({
        type: "era",
        suggestedData: {
          period,
        } as Partial<EraAffiliation>,
        reason: `記憶断片「${ch.title}」の時代（${getPeriodLabel(period)}）がまだ未登録`,
        sourceChapterId: ch.id,
      });
      existingEraPeriods.add(period); // 重複提案を避ける
    }

    // Activity候補: layers.events から活動名を推測
    if (ch.layers?.events && !existingActivityPeriods.has(period)) {
      suggestions.push({
        type: "activity",
        suggestedData: {
          period,
          name: ch.layers.events.length > 20 ? ch.layers.events.slice(0, 20) + "…" : ch.layers.events,
        } as Partial<ActivityEntry>,
        reason: `「${ch.title}」の出来事「${ch.layers.events.slice(0, 15)}…」から`,
        sourceChapterId: ch.id,
      });
    }

    // TurningPoint候補: transformative な chapter の echoes が多い場合
    if (ch.echoes.length >= 3) {
      const existingTpTitles = new Set((save.turningPoints ?? []).map((t) => t.title));
      if (!existingTpTitles.has(ch.title)) {
        suggestions.push({
          type: "turning_point",
          suggestedData: {
            period,
            title: ch.title,
          } as Partial<TurningPoint>,
          reason: `残響が${ch.echoes.length}個あり、転機だった可能性`,
          sourceChapterId: ch.id,
        });
      }
    }
  }

  return suggestions.slice(0, 5);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   4. suggestFrameFromRelated
   同カテゴリ/同時期の他エントリから特定フィールドの候補を提示
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function suggestFrameFromRelated(
  fieldKey: keyof AnalyticalFrame,
  entry: ActivityEntry | TurningPoint,
  save: OriginV7Save,
): Suggestion<string | string[]>[] {
  const suggestions: Suggestion<string | string[]>[] = [];
  const seen = new Set<string>();

  // 同カテゴリの他activity
  if ("category" in entry) {
    const related = (save.activities ?? []).filter(
      (a) => a.category === (entry as ActivityEntry).category && a.id !== entry.id && a.analyticalFrame,
    );
    for (const act of related) {
      const frame = act.analyticalFrame!;
      const value = frame[fieldKey];
      if (value === null || value === undefined) continue;

      const key = typeof value === "string" ? value : JSON.stringify(value);
      if (seen.has(key)) continue;
      seen.add(key);

      suggestions.push({
        value: value as string | string[],
        label: typeof value === "string" ? value : (value as string[]).join(", "),
        reason: `同じカテゴリの「${act.name}」の回答`,
        source: "rule",
        confidence: 0.55,
      });
    }
  }

  // 同period の他 entry
  const samePeriodActs = (save.activities ?? []).filter(
    (a) => a.period === entry.period && a.id !== entry.id && a.analyticalFrame,
  );
  for (const act of samePeriodActs) {
    const frame = act.analyticalFrame!;
    const value = frame[fieldKey];
    if (value === null || value === undefined) continue;

    const key = typeof value === "string" ? value : JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      value: value as string | string[],
      label: typeof value === "string" ? value : (value as string[]).join(", "),
      reason: `同時期の「${act.name}」の回答`,
      source: "rule",
      confidence: 0.45,
    });
  }

  return suggestions.slice(0, 3);
}
