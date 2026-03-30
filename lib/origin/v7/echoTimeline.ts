/**
 * Echo Timeline — 残響の軌跡を導出
 * chapters/activities/turningPoints に跨って出現する echo を追跡。
 * AI不要。OriginV7Save → EchoTimelineResult の純関数。
 */

import type { OriginV7Save, LifePeriod } from "./types";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   出力型
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type EchoAppearance = {
  period: LifePeriod;
  context: string;
  sourceType: "chapter" | "activity" | "turning_point";
};

export type EchoTransformation = {
  fromPeriod: LifePeriod;
  toPeriod: LifePeriod;
  transformationType: "persisted" | "evolved" | "amplified" | "suppressed";
};

export type EchoTrajectory = {
  echo: string;
  appearances: EchoAppearance[];
  status: "persistent" | "lost" | "emergent";
  firstPeriod: LifePeriod;
  lastPeriod: LifePeriod;
  // v6 additions
  impactRadius: "self" | "interpersonal" | "societal";
  transformations: EchoTransformation[];
  sourceChapterIds: string[];
};

export type EchoTimelineResult = {
  trajectories: EchoTrajectory[];
  persistentEchoes: string[];
  lostEchoes: string[];
  emergentEchoes: string[];
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Period Order
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PERIOD_ORDER: Record<string, number> = {
  early_childhood: 0, elementary: 1, middle_school: 2, high_school: 3,
  late_teens: 4, early_twenties: 5, mid_twenties: 6, thirties: 7,
  forties_plus: 8, special_period: 9,
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   メイン導出関数
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function deriveEchoTimeline(save: OriginV7Save): EchoTimelineResult {
  // 全 echo の出現を収集
  const echoMap = new Map<string, EchoAppearance[]>();

  for (const ch of save.chapters) {
    for (const echo of ch.echoes) {
      const key = echo.trim();
      if (!key) continue;
      if (!echoMap.has(key)) echoMap.set(key, []);
      echoMap.get(key)!.push({
        period: ch.fact.period,
        context: ch.title,
        sourceType: "chapter",
      });
    }
  }

  for (const act of save.activities ?? []) {
    if (act.analyticalFrame?.whatRemains) {
      const key = act.analyticalFrame.whatRemains.trim();
      if (!key) continue;
      if (!echoMap.has(key)) echoMap.set(key, []);
      echoMap.get(key)!.push({
        period: act.period,
        context: act.name,
        sourceType: "activity",
      });
    }
  }

  for (const tp of save.turningPoints ?? []) {
    if (tp.analyticalFrame?.whatRemains) {
      const key = tp.analyticalFrame.whatRemains.trim();
      if (!key) continue;
      if (!echoMap.has(key)) echoMap.set(key, []);
      echoMap.get(key)!.push({
        period: tp.period,
        context: tp.title,
        sourceType: "turning_point",
      });
    }
  }

  // 全 period の最大 index を計算
  const allPeriods = new Set<LifePeriod>();
  for (const ch of save.chapters) allPeriods.add(ch.fact.period);
  for (const a of save.activities ?? []) allPeriods.add(a.period);
  for (const t of save.turningPoints ?? []) allPeriods.add(t.period);

  const maxPeriodIdx = Math.max(...Array.from(allPeriods).map((p) => PERIOD_ORDER[p] ?? 0), 0);

  // trajectories を生成
  const trajectories: EchoTrajectory[] = [];
  const persistentEchoes: string[] = [];
  const lostEchoes: string[] = [];
  const emergentEchoes: string[] = [];

  for (const [echo, appearances] of echoMap) {
    if (appearances.length < 1) continue;

    // Sort by period order, dedupe per period
    const sorted = [...appearances].sort(
      (a, b) => (PERIOD_ORDER[a.period] ?? 99) - (PERIOD_ORDER[b.period] ?? 99),
    );

    const deduped: EchoAppearance[] = [];
    const seenPeriods = new Set<string>();
    for (const app of sorted) {
      if (!seenPeriods.has(app.period)) {
        seenPeriods.add(app.period);
        deduped.push(app);
      }
    }

    const firstIdx = PERIOD_ORDER[deduped[0].period] ?? 0;
    const lastIdx = PERIOD_ORDER[deduped[deduped.length - 1].period] ?? 0;

    // 分類
    let status: EchoTrajectory["status"];
    const span = lastIdx - firstIdx;
    const isRecent = lastIdx >= maxPeriodIdx - 1;
    const isEarly = firstIdx <= 1;

    if (span >= 3 && isRecent) {
      status = "persistent";
      persistentEchoes.push(echo);
    } else if (!isRecent && deduped.length >= 1) {
      status = "lost";
      lostEchoes.push(echo);
    } else if (isRecent && !isEarly && span <= 1) {
      status = "emergent";
      emergentEchoes.push(echo);
    } else {
      // Default: if only 1 appearance, classify by recency
      status = isRecent ? "emergent" : "lost";
      if (status === "emergent") emergentEchoes.push(echo);
      else lostEchoes.push(echo);
    }

    // v6: impactRadius
    const hasInterpersonal = deduped.some(
      (a) => a.sourceType === "activity" || a.sourceType === "turning_point",
    );
    const hasSocietal = deduped.some(
      (a) => a.sourceType === "turning_point",
    ) && deduped.length >= 3;
    const impactRadius: EchoTrajectory["impactRadius"] = hasSocietal
      ? "societal"
      : hasInterpersonal
        ? "interpersonal"
        : "self";

    // v6: transformations
    const transformations: EchoTransformation[] = [];
    for (let i = 1; i < deduped.length; i++) {
      const prevIdx = PERIOD_ORDER[deduped[i - 1].period] ?? 0;
      const currIdx = PERIOD_ORDER[deduped[i].period] ?? 0;
      const gap = currIdx - prevIdx;
      let transformationType: EchoTransformation["transformationType"];
      if (gap >= 3) {
        transformationType = "persisted";
      } else if (gap === 0) {
        transformationType = "amplified";
      } else {
        transformationType = "persisted";
      }
      transformations.push({
        fromPeriod: deduped[i - 1].period,
        toPeriod: deduped[i].period,
        transformationType,
      });
    }

    // v6: sourceChapterIds
    const sourceChapterIds: string[] = [];
    for (const ch of save.chapters) {
      if (ch.echoes.some((e) => e.trim() === echo)) {
        sourceChapterIds.push(ch.id);
      }
    }

    trajectories.push({
      echo,
      appearances: deduped,
      status,
      firstPeriod: deduped[0].period,
      lastPeriod: deduped[deduped.length - 1].period,
      impactRadius,
      transformations,
      sourceChapterIds,
    });
  }

  // Sort: persistent first, then by appearance count
  trajectories.sort((a, b) => {
    const statusOrder = { persistent: 0, emergent: 1, lost: 2 };
    const diff = statusOrder[a.status] - statusOrder[b.status];
    if (diff !== 0) return diff;
    return b.appearances.length - a.appearances.length;
  });

  return {
    trajectories: trajectories.slice(0, 12),
    persistentEchoes,
    lostEchoes,
    emergentEchoes,
  };
}
