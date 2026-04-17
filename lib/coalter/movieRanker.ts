/**
 * CoAlter Layer 2: Movie Ranker
 *
 * Brief + Catalog → RankedCandidate[]
 *
 * 設計:
 *  - ハードフィルタで違反候補を除外（Augmentation B の #7 を含む）
 *  - 8 metric（0-1）を候補ごとに算出
 *  - preset ごとに役割別スコア公式を適用
 *  - 役割ごとに 1 候補を選ぶ → 最大 3 件
 *  - 多様性チェック（title 一意 / 劇場・時間帯 ≥2 bucket / 全 upcoming 回避）
 *  - 0 件 → clarify 誘導 / 1-2 件 → 部分返却 / ≥3 → 3 件
 *
 * **CEO 方針**: 「品質は絶対に落としません」
 * → logic-first。LLM を通さないので provider 障害の影響を受けない。
 */

import type {
  ConversationBrief,
  CoAlterPersonProfile,
  FilterTrace,
  HardFilterReason,
  MovieScreening,
  RankInput,
  RankOutput,
  RankedCandidate,
  RankingAxesPreset,
  RankingRole,
  ScoreBreakdown,
  SelectionRationale,
} from "./types";
/** area が theater に含まれるかを簡易チェック（正規化は不要な最小チェック） */
function theaterMatchesArea(theater: string | null, area: string): boolean {
  if (!theater) return false;
  return theater.includes(area);
}

// ─────────────────────────────────────────────
// Preset 定義 (roles + scoring weights)
// ─────────────────────────────────────────────

const PRESET_ROLES: Record<RankingAxesPreset, RankingRole[]> = {
  balance_focus: ["balance", "aFocus", "bFocus"],
  safety_adventure_discovery: ["safety", "adventure", "discovery"],
  calm_stimulating_nostalgic: ["calm", "stimulating", "nostalgic"],
};

// ─────────────────────────────────────────────
// Hard filter
// ─────────────────────────────────────────────

function hasConstraint(
  brief: ConversationBrief,
  predicate: (c: ConversationBrief["hardConstraints"][number]) => boolean,
): boolean {
  return brief.hardConstraints.some(
    (c) => c.strength === "hard" && predicate(c),
  );
}

function violatesReleaseStatus(
  movie: MovieScreening,
  brief: ConversationBrief,
): boolean {
  // 「公開中のみ」系 hardConstraints
  const requiresShowing = hasConstraint(brief, (c) =>
    /showing|now_showing|公開中/.test(c.normalizedValue + c.sourceText),
  );
  return requiresShowing && movie.status === "upcoming";
}

function fitsTimeSlot(
  time: string,
  slot: "morning" | "afternoon" | "evening" | "night",
): boolean {
  const m = time.match(/(\d{1,2}):(\d{2})/);
  if (!m) return false;
  const h = Number(m[1]);
  if (slot === "morning") return h >= 5 && h < 11;
  if (slot === "afternoon") return h >= 11 && h < 17;
  if (slot === "evening") return h >= 17 && h < 20;
  // night: 20 以降 or 0-4（深夜）
  return h >= 20 || h < 5;
}

function violatesTimeSlot(
  movie: MovieScreening,
  brief: ConversationBrief,
): boolean {
  const slot = brief.approximateTime.timeSlot;
  if (!slot) return false;
  const needsSlot = hasConstraint(
    brief,
    (c) =>
      c.sourceText.includes(
        slot === "night"
          ? "夜"
          : slot === "evening"
            ? "夕"
            : slot === "afternoon"
              ? "昼"
              : "朝",
      ) ||
      c.normalizedValue.includes(`time_slot:${slot}`),
  );
  if (!needsSlot) return false;
  if (movie.showtimes.length === 0) return false; // 未知なら判定保留
  return !movie.showtimes.some((t) => fitsTimeSlot(t, slot));
}

function violatesArea(
  movie: MovieScreening,
  brief: ConversationBrief,
): boolean {
  if (!brief.area) return false;
  if (!movie.theater) return false;
  // area が theater に含まれなければ違反
  return !theaterMatchesArea(movie.theater, brief.area);
}

function violatesPreferredStartHour(
  movie: MovieScreening,
  brief: ConversationBrief,
): boolean {
  const h = brief.approximateTime.preferredStartHour;
  if (h === null) return false;
  if (movie.showtimes.length === 0) return false;
  return !movie.showtimes.some((t) => {
    const m = t.match(/(\d{1,2}):(\d{2})/);
    if (!m) return false;
    const sh = Number(m[1]);
    return Math.abs(sh - h) <= 2;
  });
}

function candidateKeyOf(movie: MovieScreening, showtime: string | null): string {
  return `${movie.title}::${movie.theater ?? "?"}::${showtime ?? "?"}`;
}

interface HardFilterStep {
  movie: MovieScreening;
  /** 採用される showtime（role 決定後に再選択されるが、フィルタ段階でも仮決めしておく） */
  pickedShowtime: string | null;
  reasons: HardFilterReason[];
}

function hardFilterOne(
  movie: MovieScreening,
  brief: ConversationBrief,
  avoidKeys: Set<string>,
): HardFilterStep {
  const reasons: HardFilterReason[] = [];

  if (violatesReleaseStatus(movie, brief)) reasons.push("violates_release_status");
  if (violatesTimeSlot(movie, brief)) reasons.push("violates_timeslot");
  if (violatesArea(movie, brief)) reasons.push("violates_area");
  if (violatesPreferredStartHour(movie, brief)) reasons.push("violates_preferred_start_hour");

  if (!movie.title && !movie.theater) reasons.push("missing_identity");

  // Augmentation B: showtimes=[] AND status="unknown"
  if (movie.showtimes.length === 0 && movie.status === "unknown") {
    reasons.push("unknown_status_without_showtime");
  }

  // 採用する showtime を決める（preferredStartHour に最も近いもの > timeslot 合致 > 先頭）
  let pickedShowtime: string | null = null;
  if (movie.showtimes.length > 0) {
    pickedShowtime = pickBestShowtime(movie.showtimes, brief);
  }

  const key = candidateKeyOf(movie, pickedShowtime);
  if (avoidKeys.has(key)) reasons.push("violates_avoid_keys");

  return { movie, pickedShowtime, reasons };
}

function pickBestShowtime(
  times: string[],
  brief: ConversationBrief,
): string {
  const h = brief.approximateTime.preferredStartHour;
  const slot = brief.approximateTime.timeSlot;
  const parse = (t: string) => {
    const m = t.match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) : -1;
  };
  const scored = times.map((t) => {
    const sh = parse(t);
    let score = 0;
    if (h !== null && sh >= 0) score -= Math.abs(sh - h);
    if (slot && sh >= 0 && fitsTimeSlot(t, slot)) score += 3;
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.t ?? times[0];
}

// ─────────────────────────────────────────────
// Metrics (0-1)
// ─────────────────────────────────────────────

interface Metrics {
  novelty: number;
  safety: number;
  runtimeFit: number;
  timeslotFit: number;
  areaFit: number;
  genreMatchA: number;
  genreMatchB: number;
  moodMatch: number;
}

function scoreMetrics(
  movie: MovieScreening,
  pickedShowtime: string | null,
  brief: ConversationBrief,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
): Metrics {
  // novelty: 公開予定 or "新" "話題" 系の snippet
  const novelty = movie.status === "upcoming"
    ? 0.9
    : /新作|話題|最新|ヒット|新感覚/.test(movie.snippet)
      ? 0.65
      : 0.35;

  // safety: 評価（rating から数値抽出）+ 非 upcoming
  const rating = parseRating(movie.rating);
  const safetyFromRating = rating === null ? 0.45 : clamp01((rating - 3.0) / 1.5);
  const safety = movie.status === "showing" ? clamp01(safetyFromRating + 0.1) : safetyFromRating;

  // runtimeFit: 90-130 が満点。長すぎ/短すぎで減点
  const runtime = movie.runtimeMinutes ?? null;
  const runtimeFit =
    runtime === null
      ? 0.5
      : runtime >= 90 && runtime <= 130
        ? 1
        : runtime < 90
          ? clamp01(runtime / 90)
          : clamp01(1 - (runtime - 130) / 90);

  // timeslotFit: picked showtime が brief.timeSlot に合致
  const slot = brief.approximateTime.timeSlot;
  const timeslotFit = !slot
    ? 0.5
    : pickedShowtime && fitsTimeSlot(pickedShowtime, slot)
      ? 1
      : 0.2;

  // areaFit: area と theater の紐付け
  const areaFit = !brief.area
    ? 0.5
    : !movie.theater
      ? 0.3
      : theaterMatchesArea(movie.theater, brief.area)
        ? 1
        : 0.2;

  // genreMatchA/B: interests と snippet のオーバーラップ
  const genreMatchA = overlapScore(profileA.interests, movie.snippet + " " + movie.title);
  const genreMatchB = overlapScore(profileB.interests, movie.snippet + " " + movie.title);

  // moodMatch: brief.mood と snippet のオーバーラップ
  const moodMatch = brief.mood.length === 0
    ? 0.5
    : clamp01(
        brief.mood.filter((m) => movie.snippet.includes(m) || matchMoodSemantically(m, movie.snippet)).length /
          brief.mood.length,
      );

  return {
    novelty,
    safety,
    runtimeFit,
    timeslotFit,
    areaFit,
    genreMatchA,
    genreMatchB,
    moodMatch,
  };
}

function parseRating(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/([0-5](?:\.\d)?)/);
  return m ? Number(m[1]) : null;
}

function overlapScore(keywords: string[], text: string): number {
  if (keywords.length === 0) return 0.35;
  const hit = keywords.filter((k) => k && text.includes(k)).length;
  return clamp01(hit / Math.max(3, keywords.length));
}

function matchMoodSemantically(mood: string, text: string): boolean {
  const map: Record<string, RegExp> = {
    "癒し": /癒し|ヒーリング|温かい/,
    "静か": /静か|静謐|穏やか/,
    "盛り上がる": /興奮|白熱|熱狂|アクション/,
    "刺激": /刺激|スリル|サスペンス/,
    "軽め": /軽め|ライト|コメディ/,
    "重すぎない": /軽め|ライト|コメディ/,
    "ノスタルジア": /ノスタル|懐かし|昭和|レトロ/,
    "非日常": /ファンタジー|SF|異世界/,
    "安心": /名作|定評|ロングラン/,
    "会話が続く": /会話|余韻|語り/,
  };
  const re = map[mood];
  return re ? re.test(text) : false;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// ─────────────────────────────────────────────
// Role scoring (公式)
// ─────────────────────────────────────────────

function roleScore(role: RankingRole, m: Metrics): number {
  switch (role) {
    case "balance":
      return (
        0.30 * ((m.genreMatchA + m.genreMatchB) / 2) +
        0.20 * m.runtimeFit +
        0.15 * m.timeslotFit +
        0.15 * m.areaFit +
        0.15 * m.safety +
        0.05 * m.moodMatch
      );
    case "aFocus":
      return (
        0.45 * m.genreMatchA +
        0.15 * m.runtimeFit +
        0.15 * m.timeslotFit +
        0.10 * m.areaFit +
        0.10 * m.safety +
        0.05 * m.moodMatch
      );
    case "bFocus":
      return (
        0.45 * m.genreMatchB +
        0.15 * m.runtimeFit +
        0.15 * m.timeslotFit +
        0.10 * m.areaFit +
        0.10 * m.safety +
        0.05 * m.moodMatch
      );
    case "safety":
      return (
        0.45 * m.safety +
        0.20 * ((m.genreMatchA + m.genreMatchB) / 2) +
        0.15 * m.runtimeFit +
        0.10 * m.timeslotFit +
        0.05 * m.areaFit +
        0.05 * m.moodMatch
      );
    case "adventure":
      return (
        0.40 * m.novelty +
        0.20 * ((m.genreMatchA + m.genreMatchB) / 2) +
        0.15 * m.moodMatch +
        0.10 * m.runtimeFit +
        0.10 * m.timeslotFit +
        0.05 * m.areaFit
      );
    case "discovery":
      return (
        0.35 * m.novelty +
        0.20 * m.moodMatch +
        0.15 * Math.max(m.genreMatchA, m.genreMatchB) +
        0.15 * m.runtimeFit +
        0.10 * m.timeslotFit +
        0.05 * m.areaFit
      );
    case "calm":
      return (
        0.35 * m.moodMatch +
        0.20 * m.safety +
        0.15 * ((m.genreMatchA + m.genreMatchB) / 2) +
        0.15 * m.runtimeFit +
        0.10 * m.timeslotFit +
        0.05 * m.areaFit
      );
    case "stimulating":
      return (
        0.35 * m.moodMatch +
        0.20 * m.novelty +
        0.20 * ((m.genreMatchA + m.genreMatchB) / 2) +
        0.10 * m.runtimeFit +
        0.10 * m.timeslotFit +
        0.05 * m.areaFit
      );
    case "nostalgic":
      return (
        0.35 * m.moodMatch +
        0.25 * m.safety +
        0.20 * ((m.genreMatchA + m.genreMatchB) / 2) +
        0.10 * m.runtimeFit +
        0.05 * m.timeslotFit +
        0.05 * m.areaFit
      );
  }
}

// ─────────────────────────────────────────────
// Rationale 構築
// ─────────────────────────────────────────────

function buildRationale(
  movie: MovieScreening,
  m: Metrics,
  role: RankingRole,
  brief: ConversationBrief,
  profileA: CoAlterPersonProfile,
  profileB: CoAlterPersonProfile,
): SelectionRationale {
  const text = movie.snippet + " " + movie.title;
  const matchedInterestsA = profileA.interests.filter((k) => k && text.includes(k));
  const matchedInterestsB = profileB.interests.filter((k) => k && text.includes(k));
  const matchedValuesA = profileA.values.filter((k) => k && text.includes(k));
  const matchedValuesB = profileB.values.filter((k) => k && text.includes(k));

  const appealedAxis: RankingRole[] = [role];
  if (m.safety >= 0.7 && role !== "safety") appealedAxis.push("safety");
  if (m.novelty >= 0.7 && role !== "adventure" && role !== "discovery") {
    appealedAxis.push("adventure");
  }

  // トレードオフ
  let tradeoff: string | null = null;
  if (movie.runtimeMinutes && movie.runtimeMinutes > 140) {
    tradeoff = `上映時間は${movie.runtimeMinutes}分とやや長め`;
  } else if (m.timeslotFit < 0.5 && brief.approximateTime.timeSlot) {
    tradeoff = `希望の時間帯とは少しズレがある上映`;
  } else if (movie.status === "upcoming") {
    tradeoff = `公開予定作品（スケジュール要確認）`;
  }

  // contingency hint
  let contingencyHint: string | null = null;
  if (brief.approximateTime.preferredStartHour !== null && movie.showtimes.length > 1) {
    contingencyHint = `上映時間は ${movie.showtimes.slice(0, 3).join(" / ")} から選択可`;
  }

  return {
    matchedInterestsA,
    matchedInterestsB,
    matchedValuesA,
    matchedValuesB,
    appealedAxis,
    tradeoff,
    contingencyHint,
  };
}

// ─────────────────────────────────────────────
// Main: rankMovies
// ─────────────────────────────────────────────

export function rankMovies(input: RankInput): RankOutput {
  const { brief, catalog, avoidKeys, profileA, profileB } = input;
  const preset = brief.rankingAxes.preset;
  const roles = PRESET_ROLES[preset];
  const avoidSet = new Set(avoidKeys);

  // 1) Hard filter
  const filterTrace: FilterTrace[] = [];
  const passed: Array<{
    movie: MovieScreening;
    pickedShowtime: string | null;
    metrics: Metrics;
    roleScores: Record<RankingRole, number>;
  }> = [];

  for (const movie of catalog) {
    const step = hardFilterOne(movie, brief, avoidSet);
    if (step.reasons.length > 0) {
      filterTrace.push({
        title: movie.title || null,
        theater: movie.theater,
        reasons: step.reasons,
      });
      continue;
    }
    const metrics = scoreMetrics(
      movie,
      step.pickedShowtime,
      brief,
      profileA,
      profileB,
    );
    const roleScores: Partial<Record<RankingRole, number>> = {};
    for (const role of roles) roleScores[role] = roleScore(role, metrics);
    passed.push({
      movie,
      pickedShowtime: step.pickedShowtime,
      metrics,
      roleScores: roleScores as Record<RankingRole, number>,
    });
  }

  const afterHard = passed.length;

  // 2) Role-wise 選定: 役割ごとに最高スコアの候補を選ぶ（同じ映画は同役割に被らない）
  const usedTitles = new Set<string>();
  const ranked: RankedCandidate[] = [];
  for (const role of roles) {
    const sorted = [...passed].sort(
      (a, b) => (b.roleScores[role] ?? 0) - (a.roleScores[role] ?? 0),
    );
    // 既に採用済みのタイトルは重複回避
    const pick = sorted.find((p) => !usedTitles.has(p.movie.title));
    if (!pick) continue;
    usedTitles.add(pick.movie.title);

    const axisScores: Partial<Record<RankingRole, number>> = {};
    for (const r of roles) axisScores[r] = pick.roleScores[r] ?? 0;

    const breakdown: ScoreBreakdown = {
      metrics: pick.metrics,
      roleScores: pick.roleScores,
      assignedRole: role,
    };

    const rationale = buildRationale(
      pick.movie,
      pick.metrics,
      role,
      brief,
      profileA,
      profileB,
    );

    ranked.push({
      candidateKey: candidateKeyOf(pick.movie, pick.pickedShowtime),
      role,
      title: pick.movie.title,
      theater: pick.movie.theater,
      showtime: pick.pickedShowtime,
      runtimeMinutes: pick.movie.runtimeMinutes,
      releaseStatus: pick.movie.status,
      rating: pick.movie.rating,
      sourceUrl: pick.movie.sourceUrl,
      axisScores,
      totalScore: pick.roleScores[role] ?? 0,
      rationale,
      breakdown,
    });
  }

  // 3) 多様性チェック - 全て upcoming なら 1 件だけ「showing」を優先して差し替え
  const allUpcoming = ranked.length >= 2 && ranked.every((r) => r.releaseStatus === "upcoming");
  if (allUpcoming) {
    const showingCandidate = passed
      .filter((p) => p.movie.status === "showing" && !usedTitles.has(p.movie.title))
      .sort(
        (a, b) =>
          (b.roleScores[ranked[ranked.length - 1].role] ?? 0) -
          (a.roleScores[ranked[ranked.length - 1].role] ?? 0),
      )[0];
    if (showingCandidate) {
      const replacedRole = ranked[ranked.length - 1].role;
      const axisScores: Partial<Record<RankingRole, number>> = {};
      for (const r of roles) axisScores[r] = showingCandidate.roleScores[r] ?? 0;
      ranked[ranked.length - 1] = {
        candidateKey: candidateKeyOf(showingCandidate.movie, showingCandidate.pickedShowtime),
        role: replacedRole,
        title: showingCandidate.movie.title,
        theater: showingCandidate.movie.theater,
        showtime: showingCandidate.pickedShowtime,
        runtimeMinutes: showingCandidate.movie.runtimeMinutes,
        releaseStatus: showingCandidate.movie.status,
        rating: showingCandidate.movie.rating,
        sourceUrl: showingCandidate.movie.sourceUrl,
        axisScores,
        totalScore: showingCandidate.roleScores[replacedRole] ?? 0,
        rationale: buildRationale(
          showingCandidate.movie,
          showingCandidate.metrics,
          replacedRole,
          brief,
          profileA,
          profileB,
        ),
        breakdown: {
          metrics: showingCandidate.metrics,
          roleScores: showingCandidate.roleScores,
          assignedRole: replacedRole,
        },
      };
    }
  }

  return {
    ranked,
    filterTrace,
    appliedPreset: preset,
    counts: {
      inputCatalog: catalog.length,
      afterHardFilter: afterHard,
      afterDiversity: ranked.length,
    },
  };
}

// テスト用 export
export const __internal = {
  PRESET_ROLES,
  hardFilterOne,
  scoreMetrics,
  roleScore,
  pickBestShowtime,
  fitsTimeSlot,
  buildRationale,
  parseRating,
};
