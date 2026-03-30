// lib/stargazer/narrativeThreading.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Narrative Threading Engine（物語化エンジン）
//
// 脳科学的根拠:
// McAdamsの物語的アイデンティティ理論 — 人間は自己を「物語」として理解する。
// データポイントの羅列ではなく、文脈のある「章」にすることで、
// 自己参照処理（mPFC）が強化され、記憶の定着率が上がる。
//
// 設計思想:
// - 週次スナップショットを月単位で「章」にまとめる
// - 各章には「転換点」「テーマ」「成長の兆し」がある
// - 章と章の間の「接続」が最も重要なinsightを生む
//
// 依存:
// - temporalSelfMirror.ts（WeeklySelfSnapshot）
// - contradictionMap.ts（ContradictionEntry types）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";
import { getAxisLabels } from "./traitAxes";
import type { WeeklySelfSnapshot } from "./temporalSelfMirror";
import { loadSnapshots, computeTemporalDelta } from "./temporalSelfMirror";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 物語の「章」— 1ヶ月分のナラティブ */
export interface NarrativeChapter {
  /** 章ID (e.g., "2026-03") */
  chapterId: string;
  /** 月の表示名 */
  monthLabel: string;
  /** 章のタイトル（自動生成） */
  title: string;
  /** 章のサブタイトル（より詳細な説明） */
  subtitle: string;

  // ── テーマ ──
  /** この月の支配的テーマ */
  dominantTheme: NarrativeTheme;
  /** サブテーマ */
  subThemes: NarrativeTheme[];

  // ── 転換点 ──
  /** この月の重要な転換点（週単位で検出） */
  turningPoints: TurningPoint[];

  // ── 軸の旅路 ──
  /** 最も動いた軸の軌跡 */
  axisJourney: {
    axisId: TraitAxisKey;
    axisLabel: string;
    startCenter: number;
    endCenter: number;
    delta: number;
    weeklyTrajectory: { weekId: string; center: number }[];
    journeyDescription: string;
  }[];

  // ── 矛盾の物語 ──
  /** 矛盾の変遷 */
  contradictionNarrative: {
    startCount: number;
    endCount: number;
    /** 新しく出現した矛盾 */
    emerged: { axisId: TraitAxisKey; axisLabel: string; magnitude: number }[];
    /** 解消/変化した矛盾 */
    resolved: { axisId: TraitAxisKey; axisLabel: string }[];
    narrative: string;
  };

  // ── 成長指標 ──
  /** 観測の一貫性（0-1） */
  observationConsistency: number;
  /** 平均品質 */
  averageQuality: number;
  /** 予測精度のトレンド */
  predictionTrend: "improving" | "stable" | "declining";

  // ── メタデータ ──
  /** 使用した週数 */
  weekCount: number;
  /** 総観測回数 */
  totalObservations: number;
  /** 章の「密度」— 変化の量と深さ（0-1） */
  chapterDensity: number;
}

/** ナラティブのテーマ */
export interface NarrativeTheme {
  /** テーマID */
  id: string;
  /** テーマ名（日本語） */
  name: string;
  /** テーマの説明 */
  description: string;
  /** テーマの強度（0-1） */
  intensity: number;
  /** 関連する軸 */
  relatedAxes: TraitAxisKey[];
}

/** 転換点 — 物語の中で方向が変わった瞬間 */
export interface TurningPoint {
  /** どの週で起きたか */
  weekId: string;
  /** 転換点の種類 */
  type:
    | "contradiction_emerged"   // 新しい矛盾が出現
    | "contradiction_resolved"  // 矛盾が解消
    | "axis_reversal"           // 軸スコアの反転
    | "prediction_collapse"     // 予測精度の急落（＝内面の変化）
    | "stability_shift"         // 安定度の急変
    | "weather_change"          // 内なる天気の変化
    | "streak_milestone";       // ストリークのマイルストーン
  /** 転換点の説明 */
  description: string;
  /** 影響度（0-1） */
  impact: number;
  /** 関連する軸 */
  relatedAxis: TraitAxisKey | null;
}

/** 物語全体の「本」 */
export interface NarrativeBook {
  /** 全ての章 */
  chapters: NarrativeChapter[];
  /** 全体を貫くメタナラティブ */
  metaNarrative: string;
  /** 現在の「章の段階」 */
  currentPhase: "prologue" | "exploration" | "confrontation" | "integration" | "mastery";
  /** 次の章の予兆 */
  nextChapterForeshadowing: string | null;
  /** 総観測期間（週数） */
  totalWeeks: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Theme Detection — テーマの検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NARRATIVE_THEMES: {
  id: string;
  name: string;
  description: string;
  detector: (snapshots: WeeklySelfSnapshot[]) => number;
  relatedAxes: TraitAxisKey[];
}[] = [
  {
    id: "inner_conflict",
    name: "自分の中のぶつかり合い",
    description: "自分の中で正反対の気持ちがはっきり出てきた時期",
    detector: (ss) => {
      const avgContradictions =
        ss.reduce((s, snap) => s + snap.totalContradictions, 0) / Math.max(1, ss.length);
      return Math.min(1, avgContradictions / 5);
    },
    relatedAxes: ["independence_vs_harmony", "direct_vs_diplomatic"],
  },
  {
    id: "quiet_stability",
    name: "落ち着きの時期",
    description: "心が落ち着いて、自分ってこういう人だなって見えてきた時期",
    detector: (ss) => {
      if (ss.length === 0) return 0;
      const stableCount = ss.filter(
        (snap) => snap.mostStableAxis && snap.mostStableAxis.stability > 0.7
      ).length;
      return stableCount / ss.length;
    },
    relatedAxes: ["plan_vs_spontaneous", "cautious_vs_bold"],
  },
  {
    id: "identity_flux",
    name: "自分が変わっていく時期",
    description: "いろんな部分が同時に動いて、自分が作り直されてる感覚の時期",
    detector: (ss) => {
      if (ss.length === 0) return 0;
      const fluctuatingCount = ss.filter(
        (snap) => snap.topFluctuatingAxis && snap.topFluctuatingAxis.stability < 0.3
      ).length;
      return fluctuatingCount / ss.length;
    },
    relatedAxes: ["change_embrace_vs_resist", "emotional_variability"],
  },
  {
    id: "prediction_awakening",
    name: "予測が当たり始めた時期",
    description: "予測の精度がぐっと上がって、自分のパターンがはっきりしてきた時期",
    detector: (ss) => {
      if (ss.length < 2) return 0;
      const firstAcc = ss[0].predictionAccuracy;
      const lastAcc = ss[ss.length - 1].predictionAccuracy;
      return Math.max(0, lastAcc - firstAcc);
    },
    relatedAxes: ["analytical_vs_intuitive"],
  },
  {
    id: "prediction_collapse",
    name: "予測が外れ始めた時期",
    description: "今まで当たってた予測が外れ始めた。自分の中で何かが変わってきてる",
    detector: (ss) => {
      if (ss.length < 2) return 0;
      const firstAcc = ss[0].predictionAccuracy;
      const lastAcc = ss[ss.length - 1].predictionAccuracy;
      return Math.max(0, firstAcc - lastAcc);
    },
    relatedAxes: ["change_embrace_vs_resist"],
  },
  {
    id: "social_recalibration",
    name: "人との距離感が変わった時期",
    description: "人との関わり方や距離感が変わってきた時期",
    detector: (ss) => {
      if (ss.length === 0) return 0;
      const socialAxes: TraitAxisKey[] = [
        "introvert_vs_extrovert",
        "individual_vs_social",
        "social_initiative",
        "intimacy_pace",
      ];
      let totalMovement = 0;
      for (const snap of ss) {
        for (const axis of socialAxes) {
          if (snap.topFluctuatingAxis?.axisId === axis) {
            totalMovement += 1 - snap.topFluctuatingAxis.stability;
          }
        }
      }
      return Math.min(1, totalMovement / (ss.length * 2));
    },
    relatedAxes: [
      "introvert_vs_extrovert",
      "individual_vs_social",
      "social_initiative",
      "intimacy_pace",
    ],
  },
  {
    id: "confronting_shadow",
    name: "見て見ぬふりしてた自分と向き合った時期",
    description: "無意識の自分、避けてた自分と向き合い始めた時期",
    detector: (ss) => {
      if (ss.length === 0) return 0;
      const confrontingCount = ss.filter(
        (snap) =>
          snap.dominantContradiction &&
          (snap.dominantContradiction.meaning.includes("無自覚") ||
            snap.dominantContradiction.meaning.includes("防衛"))
      ).length;
      return confrontingCount / ss.length;
    },
    relatedAxes: ["boundary_awareness", "emotional_variability"],
  },
  {
    id: "growth_edge",
    name: "新しい自分に出会い始めた時期",
    description: "今までと違う自分の可能性に気づき始めた時期",
    detector: (ss) => {
      if (ss.length === 0) return 0;
      const growthCount = ss.filter(
        (snap) =>
          snap.dominantContradiction &&
          snap.dominantContradiction.meaning.includes("成長")
      ).length;
      // Also boost if observation count is high and quality is improving
      const avgQuality =
        ss.reduce((s, snap) => s + snap.avgQuality, 0) / ss.length;
      return Math.min(1, growthCount / ss.length + avgQuality * 0.3);
    },
    relatedAxes: ["change_embrace_vs_resist", "cautious_vs_bold"],
  },
];

function detectThemes(snapshots: WeeklySelfSnapshot[]): NarrativeTheme[] {
  return NARRATIVE_THEMES.map((theme) => ({
    id: theme.id,
    name: theme.name,
    description: theme.description,
    intensity: theme.detector(snapshots),
    relatedAxes: theme.relatedAxes,
  }))
    .filter((t) => t.intensity > 0.1)
    .sort((a, b) => b.intensity - a.intensity);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Turning Point Detection — 転換点の検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function detectTurningPoints(snapshots: WeeklySelfSnapshot[]): TurningPoint[] {
  if (snapshots.length < 2) return [];

  const turningPoints: TurningPoint[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const delta = computeTemporalDelta(prev, curr);

    // 矛盾の急増
    if (delta.contradictionChange.delta >= 2) {
      turningPoints.push({
        weekId: curr.weekId,
        type: "contradiction_emerged",
        description: `矛盾が${delta.contradictionChange.previousCount}個から${delta.contradictionChange.currentCount}個に急増。新しい自分の面が見えてきた`,
        impact: Math.min(1, delta.contradictionChange.delta / 3),
        relatedAxis: curr.dominantContradiction?.axisId ?? null,
      });
    }

    // 矛盾の急減
    if (delta.contradictionChange.delta <= -2) {
      turningPoints.push({
        weekId: curr.weekId,
        type: "contradiction_resolved",
        description: `矛盾が${Math.abs(delta.contradictionChange.delta)}個なくなった。自分の中がまとまってきた`,
        impact: Math.min(1, Math.abs(delta.contradictionChange.delta) / 3),
        relatedAxis: prev.dominantContradiction?.axisId ?? null,
      });
    }

    // 軸スコアの大きな反転
    if (delta.biggestShift && Math.abs(delta.biggestShift.delta) >= 0.4) {
      turningPoints.push({
        weekId: curr.weekId,
        type: "axis_reversal",
        description: `${delta.biggestShift.axisLabel}が大きく${delta.biggestShift.direction}。自分の見方が変わったターニングポイント`,
        impact: Math.min(1, Math.abs(delta.biggestShift.delta) / 0.5),
        relatedAxis: delta.biggestShift.axisId,
      });
    }

    // 予測精度の急落
    if (delta.predictionAccuracyChange.delta < -0.15) {
      turningPoints.push({
        weekId: curr.weekId,
        type: "prediction_collapse",
        description: `予測の精度が${Math.round(Math.abs(delta.predictionAccuracyChange.delta) * 100)}%下がった。あなたの中で何かが変わり始めてる`,
        impact: Math.min(1, Math.abs(delta.predictionAccuracyChange.delta) / 0.2),
        relatedAxis: null,
      });
    }

    // 天気の変化
    if (delta.weatherChange.changed) {
      turningPoints.push({
        weekId: curr.weekId,
        type: "weather_change",
        description: `内なる天気が「${delta.weatherChange.previous}」から「${delta.weatherChange.current}」に変化`,
        impact: 0.3,
        relatedAxis: null,
      });
    }

    // ストリークマイルストーン
    const milestones = [7, 14, 30, 50, 100];
    for (const m of milestones) {
      if (prev.streakDays < m && curr.streakDays >= m) {
        turningPoints.push({
          weekId: curr.weekId,
          type: "streak_milestone",
          description: `${m}日連続で観測を続けた。この継続力自体が、あなたの大事な特徴だよ`,
          impact: Math.min(1, m / 100),
          relatedAxis: null,
        });
      }
    }
  }

  return turningPoints.sort((a, b) => b.impact - a.impact);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Chapter Construction — 章の構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MONTH_NAMES = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

function groupSnapshotsByMonth(
  snapshots: WeeklySelfSnapshot[]
): Record<string, WeeklySelfSnapshot[]> {
  const groups: Record<string, WeeklySelfSnapshot[]> = {};
  for (const snap of snapshots) {
    // weekId format: "2026-W12" → extract month from createdAt
    const date = new Date(snap.createdAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!groups[monthKey]) groups[monthKey] = [];
    groups[monthKey].push(snap);
  }
  return groups;
}

function buildChapter(
  chapterId: string,
  snapshots: WeeklySelfSnapshot[]
): NarrativeChapter {
  if (snapshots.length === 0) {
    throw new Error("Cannot build chapter from empty snapshots");
  }

  const sorted = snapshots.sort((a, b) => a.weekId.localeCompare(b.weekId));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // テーマ検出
  const themes = detectThemes(sorted);
  const dominantTheme = themes[0] ?? {
    id: "unknown",
    name: "探索中",
    description: "まだテーマが見えていない時期",
    intensity: 0,
    relatedAxes: [],
  };

  // 転換点検出
  const turningPoints = detectTurningPoints(sorted);

  // 軸の旅路（最も動いた軸トップ3）
  const axisJourney = computeAxisJourneys(sorted).slice(0, 3);

  // 矛盾の物語
  const contradictionNarrative = buildContradictionNarrative(first, last, sorted);

  // 月の表示
  const [year, month] = chapterId.split("-");
  const monthIdx = parseInt(month) - 1;
  const monthLabel = `${year}年${MONTH_NAMES[monthIdx] ?? month + "月"}`;

  // タイトル生成
  const title = generateChapterTitle(dominantTheme, turningPoints, sorted);
  const subtitle = generateChapterSubtitle(axisJourney, contradictionNarrative);

  // 観測統計
  const totalObservations = sorted.reduce((s, snap) => s + snap.observationCount, 0);
  const averageQuality =
    sorted.reduce((s, snap) => s + snap.avgQuality, 0) / sorted.length;
  const observationConsistency =
    sorted.filter((s) => s.observationCount >= 3).length / sorted.length;

  // 予測トレンド
  const predictionTrend = computePredictionTrend(sorted);

  // 章の密度
  const chapterDensity = computeChapterDensity(turningPoints, themes, sorted);

  return {
    chapterId,
    monthLabel,
    title,
    subtitle,
    dominantTheme,
    subThemes: themes.slice(1, 3),
    turningPoints,
    axisJourney,
    contradictionNarrative,
    observationConsistency,
    averageQuality,
    predictionTrend,
    weekCount: sorted.length,
    totalObservations,
    chapterDensity,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Book Construction — 本の構築
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 保存されている全スナップショットから「自己の物語」を構築
 *
 * これがNarrative Threading の最終出力。
 * McAdamsの物語的アイデンティティ理論に基づき、
 * データポイントの羅列を「意味のある物語」に変換する。
 */
export function buildNarrativeBook(): NarrativeBook {
  const snapshots = loadSnapshots();

  if (snapshots.length === 0) {
    return {
      chapters: [],
      metaNarrative: "まだ物語は始まっていない。最初の観測が、プロローグの第一文になる。",
      currentPhase: "prologue",
      nextChapterForeshadowing: null,
      totalWeeks: 0,
    };
  }

  // 月別にグループ化
  const monthGroups = groupSnapshotsByMonth(snapshots);

  // 各月を「章」に変換
  const chapters = Object.entries(monthGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthId, monthSnapshots]) => buildChapter(monthId, monthSnapshots));

  // 全体を貫くメタナラティブ
  const metaNarrative = generateMetaNarrative(chapters, snapshots.length);

  // 現在のフェーズ判定
  const currentPhase = determineCurrentPhase(snapshots.length, chapters);

  // 次の章の予兆
  const nextChapterForeshadowing = generateForeshadowing(chapters);

  return {
    chapters,
    metaNarrative,
    currentPhase,
    nextChapterForeshadowing,
    totalWeeks: snapshots.length,
  };
}

/**
 * 現在の月の章だけを取得（ホーム画面表示用の軽量版）
 */
export function getCurrentChapter(): NarrativeChapter | null {
  const snapshots = loadSnapshots();
  if (snapshots.length === 0) return null;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthGroups = groupSnapshotsByMonth(snapshots);
  const currentMonthSnapshots = monthGroups[currentMonthKey];

  if (!currentMonthSnapshots || currentMonthSnapshots.length === 0) return null;

  return buildChapter(currentMonthKey, currentMonthSnapshots);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. Internal Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function computeAxisJourneys(
  snapshots: WeeklySelfSnapshot[]
): NarrativeChapter["axisJourney"] {
  if (snapshots.length < 2) return [];

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  const journeys: NarrativeChapter["axisJourney"] = [];

  // 全軸の開始→終了の差分を計算
  const allAxes = new Set<TraitAxisKey>();
  for (const snap of snapshots) {
    for (const axis of Object.keys(snap.axisCenters) as TraitAxisKey[]) {
      allAxes.add(axis);
    }
  }

  for (const axisId of Array.from(allAxes)) {
    const startCenter = first.axisCenters[axisId];
    const endCenter = last.axisCenters[axisId];
    if (startCenter === undefined || endCenter === undefined) continue;

    const delta = endCenter - startCenter;
    const labels = getAxisLabels(axisId);
    const axisLabel = labels ? `${labels.left} ⇔ ${labels.right}` : axisId;

    // 週ごとの軌跡
    const weeklyTrajectory = snapshots
      .filter((s) => s.axisCenters[axisId] !== undefined)
      .map((s) => ({
        weekId: s.weekId,
        center: s.axisCenters[axisId]!,
      }));

    // 旅路の説明
    let journeyDescription: string;
    if (Math.abs(delta) < 0.1) {
      journeyDescription = `${axisLabel}は安定していた`;
    } else if (delta > 0) {
      journeyDescription = `${labels?.right ?? "右極"}に向かって${Math.round(Math.abs(delta) * 100)}%移動した`;
    } else {
      journeyDescription = `${labels?.left ?? "左極"}に向かって${Math.round(Math.abs(delta) * 100)}%移動した`;
    }

    journeys.push({
      axisId,
      axisLabel,
      startCenter,
      endCenter,
      delta,
      weeklyTrajectory,
      journeyDescription,
    });
  }

  // 変化量の大きい順にソート
  return journeys.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function buildContradictionNarrative(
  first: WeeklySelfSnapshot,
  last: WeeklySelfSnapshot,
  all: WeeklySelfSnapshot[]
): NarrativeChapter["contradictionNarrative"] {
  const startCount = first.totalContradictions;
  const endCount = last.totalContradictions;

  // 新出の矛盾を検出（最後のスナップショットにあるが最初にはなかった）
  const emerged: { axisId: TraitAxisKey; axisLabel: string; magnitude: number }[] = [];
  if (last.dominantContradiction && !first.dominantContradiction) {
    emerged.push({
      axisId: last.dominantContradiction.axisId,
      axisLabel: last.dominantContradiction.axisLabel,
      magnitude: last.dominantContradiction.magnitude,
    });
  }

  // 解消した矛盾
  const resolved: { axisId: TraitAxisKey; axisLabel: string }[] = [];
  if (first.dominantContradiction && !last.dominantContradiction) {
    resolved.push({
      axisId: first.dominantContradiction.axisId,
      axisLabel: first.dominantContradiction.axisLabel,
    });
  }

  // ナラティブ生成
  let narrative: string;
  if (endCount > startCount) {
    narrative = `矛盾が${startCount}個から${endCount}個に増えた。自己認識の解像度が上がり、これまで見えなかった内面の層が露出している`;
  } else if (endCount < startCount) {
    narrative = `矛盾が${startCount}個から${endCount}個に減った。自分の中の対立が統合され始めている`;
  } else if (endCount > 0) {
    narrative = `${endCount}個の矛盾を抱えたまま、その中で深掘りを続けている`;
  } else {
    narrative = "矛盾はまだ検出されていない。観測が進むにつれて見えてくる";
  }

  return { startCount, endCount, emerged, resolved, narrative };
}

function computePredictionTrend(
  snapshots: WeeklySelfSnapshot[]
): "improving" | "stable" | "declining" {
  if (snapshots.length < 2) return "stable";
  const first = snapshots[0].predictionAccuracy;
  const last = snapshots[snapshots.length - 1].predictionAccuracy;
  const delta = last - first;
  if (delta > 0.05) return "improving";
  if (delta < -0.05) return "declining";
  return "stable";
}

function computeChapterDensity(
  turningPoints: TurningPoint[],
  themes: NarrativeTheme[],
  snapshots: WeeklySelfSnapshot[]
): number {
  // 転換点の数と影響度
  const turningPointScore =
    turningPoints.reduce((s, tp) => s + tp.impact, 0) /
    Math.max(1, turningPoints.length);

  // テーマの強度
  const themeScore =
    themes.length > 0 ? themes[0].intensity : 0;

  // 観測の密度
  const totalObs = snapshots.reduce((s, snap) => s + snap.observationCount, 0);
  const obsPerWeek = totalObs / Math.max(1, snapshots.length);
  const obsScore = Math.min(1, obsPerWeek / 7);

  return turningPointScore * 0.4 + themeScore * 0.3 + obsScore * 0.3;
}

function generateChapterTitle(
  dominantTheme: NarrativeTheme,
  turningPoints: TurningPoint[],
  snapshots: WeeklySelfSnapshot[]
): string {
  // 最大の転換点があればそれをタイトルに
  const biggestTurningPoint = turningPoints[0];
  if (biggestTurningPoint && biggestTurningPoint.impact >= 0.7) {
    switch (biggestTurningPoint.type) {
      case "axis_reversal":
        return "反転の月";
      case "prediction_collapse":
        return "予測が崩れた月";
      case "contradiction_emerged":
        return "矛盾が露出した月";
      case "contradiction_resolved":
        return "統合の月";
      default:
        break;
    }
  }

  // テーマベースのタイトル
  const titleMap: Record<string, string> = {
    inner_conflict: "内なる対立の月",
    quiet_stability: "静穏の月",
    identity_flux: "流動の月",
    prediction_awakening: "覚醒の月",
    prediction_collapse: "変容の月",
    social_recalibration: "関係性の再構築",
    confronting_shadow: "もうひとりの自分と向き合う月",
    growth_edge: "成長の最前線",
  };

  return titleMap[dominantTheme.id] ?? "観測の月";
}

function generateChapterSubtitle(
  axisJourneys: NarrativeChapter["axisJourney"],
  contradictionNarrative: NarrativeChapter["contradictionNarrative"]
): string {
  const parts: string[] = [];

  if (axisJourneys.length > 0 && Math.abs(axisJourneys[0].delta) >= 0.1) {
    parts.push(axisJourneys[0].journeyDescription);
  }

  if (contradictionNarrative.emerged.length > 0) {
    parts.push(
      `${contradictionNarrative.emerged[0].axisLabel}に新しい矛盾が見つかった`
    );
  }

  return parts.length > 0 ? parts.join("。") : "静かに観測を重ねた月";
}

function generateMetaNarrative(
  chapters: NarrativeChapter[],
  totalWeeks: number
): string {
  if (chapters.length === 0) {
    return "まだ物語は始まっていない。";
  }

  if (chapters.length === 1) {
    const ch = chapters[0];
    return `物語は「${ch.title}」から始まった。${ch.totalObservations}回の観測が、最初の輪郭を描いた。`;
  }

  const firstChapter = chapters[0];
  const lastChapter = chapters[chapters.length - 1];

  // 全体の矛盾の変遷
  const firstContradictions =
    firstChapter.contradictionNarrative.startCount;
  const lastContradictions =
    lastChapter.contradictionNarrative.endCount;

  let contradictionArc: string;
  if (lastContradictions > firstContradictions) {
    contradictionArc =
      "観測を重ねるほど矛盾が増えた — これは自己理解が深まっている最も確かな証拠";
  } else if (lastContradictions < firstContradictions) {
    contradictionArc =
      "矛盾が少しずつ解消されている — 内面の統合が進んでいる";
  } else {
    contradictionArc = "矛盾の数は変わらず、しかしその質と深さが変わっている";
  }

  return `「${firstChapter.title}」から始まり、${totalWeeks}週の観測を経て「${lastChapter.title}」へ。${contradictionArc}。`;
}

function determineCurrentPhase(
  totalWeeks: number,
  chapters: NarrativeChapter[]
): NarrativeBook["currentPhase"] {
  if (totalWeeks <= 1) return "prologue";
  if (totalWeeks <= 4) return "exploration";

  // 矛盾が増えている時期 = confrontation
  const lastChapter = chapters[chapters.length - 1];
  if (
    lastChapter &&
    lastChapter.contradictionNarrative.endCount >
      lastChapter.contradictionNarrative.startCount
  ) {
    return "confrontation";
  }

  // 矛盾が減っている時期 = integration
  if (
    lastChapter &&
    lastChapter.contradictionNarrative.endCount <
      lastChapter.contradictionNarrative.startCount
  ) {
    return "integration";
  }

  // 高い予測精度＋安定 = mastery
  if (
    lastChapter &&
    lastChapter.predictionTrend === "improving" &&
    lastChapter.observationConsistency >= 0.8
  ) {
    return "mastery";
  }

  return "exploration";
}

function generateForeshadowing(chapters: NarrativeChapter[]): string | null {
  if (chapters.length === 0) return null;

  const lastChapter = chapters[chapters.length - 1];

  // 最も大きな転換点から次の展開を予測
  const biggestTurningPoint = lastChapter.turningPoints[0];
  if (biggestTurningPoint) {
    switch (biggestTurningPoint.type) {
      case "prediction_collapse":
        return "予測が外れ始めた。来月は新しい自分と出会う可能性が高い";
      case "contradiction_emerged":
        return "新しい矛盾が見つかった。来月はこの矛盾の核心に迫る";
      case "axis_reversal":
        return "大きな反転があった。この変化が定着するか、揺り戻すか。来月で分かる";
      default:
        break;
    }
  }

  // テーマベースの予兆
  if (lastChapter.dominantTheme.id === "identity_flux") {
    return "多くの軸が動いている。来月は新しい安定点を見つけるかもしれない";
  }
  if (lastChapter.dominantTheme.id === "quiet_stability") {
    return "安定期が続いている。次の変化の波はいつ来るか — それも観測で分かる";
  }

  return "物語は続いている。次の章がどうなるかは、来月の観測次第";
}
