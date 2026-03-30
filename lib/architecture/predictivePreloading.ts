// lib/architecture/predictivePreloading.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Predictive Preloading（予測的先読み）
//
// 脳科学的根拠:
// 認知的流暢性（Processing Fluency, Reber & Schwarz, 1999）
// 情報が速く表示されると、脳はその情報を「正しい」「重要」と
// 判断する傾向がある。ローディング時間ゼロ＝信頼感の増大。
//
// 設計思想:
// ユーザーの過去の行動パターン（時間帯・曜日・頻度）から
// 次にアクセスするコンテンツを予測し、事前にプリフェッチする。
// 「アプリを開いた瞬間にすでにデータが揃っている」体験。
//
// 世界参照:
// - Instagram: フィードの先読み
// - Netflix: 次のエピソードの先読み
// - Chrome: 予測的DNSプリフェッチ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ユーザーの行動パターン */
export interface UserBehaviorPattern {
  /** 時間帯別の訪問頻度（0-1） */
  timeOfDayFrequency: {
    earlyMorning: number; // 5-7時
    morning: number;      // 7-10時
    midday: number;       // 10-14時
    afternoon: number;    // 14-17時
    evening: number;      // 17-21時
    night: number;        // 21-1時
    lateNight: number;    // 1-5時
  };
  /** 曜日別の訪問頻度（0-1） */
  dayOfWeekFrequency: Record<number, number>; // 0=Sun - 6=Sat
  /** 直近の観測でアクセスしたセクション */
  recentSections: string[];
  /** 平均セッション時間（秒） */
  avgSessionDuration: number;
  /** ストリーク日数 */
  streakDays: number;
  /** 最も使うFeature上位3つ */
  topFeatures: string[];
  /** 総訪問回数 */
  totalVisits: number;
}

/** プリフェッチ候補 */
export interface PrefetchCandidate {
  /** APIエンドポイント */
  endpoint: string;
  /** プリフェッチの優先度（0-1） */
  priority: number;
  /** プリフェッチの理由 */
  reason: string;
  /** キャッシュ有効時間（秒） */
  cacheDuration: number;
  /** データサイズの推定（KB） */
  estimatedSizeKB: number;
}

/** プリフェッチ計画 */
export interface PrefetchPlan {
  /** 即座にフェッチすべきもの（Critical Path） */
  immediate: PrefetchCandidate[];
  /** 少し遅れてフェッチ可能なもの（Non-Critical） */
  deferred: PrefetchCandidate[];
  /** この訪問では不要なもの（省略） */
  skipped: string[];
  /** プランの説明 */
  explanation: string;
  /** 推定合計データサイズ（KB） */
  totalEstimatedSizeKB: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Behavior Pattern Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BEHAVIOR_KEY = "aneurasync_behavior_pattern_v1";

/** 訪問を記録（クライアントサイドで呼ぶ） */
export function recordVisit(section?: string): void {
  if (typeof window === "undefined") return;

  try {
    const raw = localStorage.getItem(BEHAVIOR_KEY);
    const pattern: StoredPattern = raw
      ? JSON.parse(raw)
      : { visits: [], sections: [] };

    const now = new Date();
    pattern.visits.push({
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      timestamp: now.toISOString(),
    });

    if (section) {
      pattern.sections.push(section);
      // 最新50件のみ保持
      if (pattern.sections.length > 50) {
        pattern.sections = pattern.sections.slice(-50);
      }
    }

    // 最新90日分のvisitのみ保持
    const cutoff = new Date(now.getTime() - 90 * 86400000).toISOString();
    pattern.visits = pattern.visits.filter((v) => v.timestamp >= cutoff);

    localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(pattern));
  } catch {
    // quota exceeded — silently ignore
  }
}

interface StoredPattern {
  visits: { hour: number; dayOfWeek: number; timestamp: string }[];
  sections: string[];
}

/** 保存された行動パターンを読み出し */
export function loadBehaviorPattern(): UserBehaviorPattern | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(BEHAVIOR_KEY);
    if (!raw) return null;

    const stored: StoredPattern = JSON.parse(raw);
    if (stored.visits.length < 3) return null; // 最低3訪問必要

    // 時間帯別頻度
    const hourCounts = new Array(24).fill(0);
    for (const v of stored.visits) {
      hourCounts[v.hour]++;
    }
    const total = stored.visits.length;

    const timeOfDayFrequency = {
      earlyMorning: sumRange(hourCounts, 5, 7) / total,
      morning: sumRange(hourCounts, 7, 10) / total,
      midday: sumRange(hourCounts, 10, 14) / total,
      afternoon: sumRange(hourCounts, 14, 17) / total,
      evening: sumRange(hourCounts, 17, 21) / total,
      night: sumRange(hourCounts, 21, 25) / total, // 21-24 + 0
      lateNight: sumRange(hourCounts, 1, 5) / total,
    };
    // Add hour 0 to night
    timeOfDayFrequency.night += hourCounts[0] / total;

    // 曜日別頻度
    const dayOfWeekFrequency: Record<number, number> = {};
    for (let d = 0; d < 7; d++) {
      dayOfWeekFrequency[d] =
        stored.visits.filter((v) => v.dayOfWeek === d).length / total;
    }

    // 直近セクション
    const recentSections = stored.sections.slice(-10);

    // Top features
    const sectionCounts = new Map<string, number>();
    for (const s of stored.sections) {
      sectionCounts.set(s, (sectionCounts.get(s) ?? 0) + 1);
    }
    const topFeatures = Array.from(sectionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    return {
      timeOfDayFrequency,
      dayOfWeekFrequency,
      recentSections,
      avgSessionDuration: 0, // 別途計測が必要
      streakDays: 0, // 別途取得
      topFeatures,
      totalVisits: total,
    };
  } catch {
    return null;
  }
}

function sumRange(arr: number[], from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < Math.min(to, arr.length); i++) {
    sum += arr[i];
  }
  return sum;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Predictive Prefetch Plan Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 全APIエンドポイントのプリフェッチ定義 */
const ENDPOINT_CATALOG: Record<
  string,
  { estimatedSizeKB: number; cacheDuration: number; category: string }
> = {
  "/api/stargazer/profile": { estimatedSizeKB: 5, cacheDuration: 300, category: "core" },
  "/api/stargazer/prophecy": { estimatedSizeKB: 2, cacheDuration: 3600, category: "daily" },
  "/api/stargazer/inner-weather": { estimatedSizeKB: 1, cacheDuration: 3600, category: "daily" },
  "/api/stargazer/blind-spot": { estimatedSizeKB: 2, cacheDuration: 3600, category: "daily" },
  "/api/stargazer/vanishing-insight": { estimatedSizeKB: 2, cacheDuration: 1800, category: "daily" },
  "/api/stargazer/daily-observation": { estimatedSizeKB: 8, cacheDuration: 3600, category: "observation" },
  "/api/stargazer/three-mirrors": { estimatedSizeKB: 5, cacheDuration: 3600, category: "deep" },
  "/api/stargazer/unseen-map": { estimatedSizeKB: 5, cacheDuration: 3600, category: "deep" },
  "/api/stargazer/trajectory": { estimatedSizeKB: 3, cacheDuration: 3600, category: "deep" },
  "/api/stargazer/resonance": { estimatedSizeKB: 3, cacheDuration: 1800, category: "social" },
  "/api/aneurasync/home-identity-progress": { estimatedSizeKB: 3, cacheDuration: 300, category: "core" },
  "/api/eye-profile": { estimatedSizeKB: 2, cacheDuration: 86400, category: "phenotype" },
  "/api/body-color/profile": { estimatedSizeKB: 3, cacheDuration: 86400, category: "phenotype" },
  "/api/aneurasync/face-phenotype": { estimatedSizeKB: 3, cacheDuration: 86400, category: "phenotype" },
};

/**
 * 予測的プリフェッチ計画を生成
 *
 * ユーザーの行動パターン + 現在時刻 + コンテキストから、
 * 今回の訪問で必要なAPIを予測する。
 */
export function generatePrefetchPlan(
  hour: number,
  dayOfWeek: number,
  pattern: UserBehaviorPattern | null,
  context: {
    isFirstVisitToday: boolean;
    hasActiveStreak: boolean;
    hasVanishingInsight: boolean;
    observationLevel: number;
  },
): PrefetchPlan {
  const immediate: PrefetchCandidate[] = [];
  const deferred: PrefetchCandidate[] = [];
  const skipped: string[] = [];

  // ─── Critical Path: 常にプリフェッチ ───
  immediate.push({
    endpoint: "/api/aneurasync/home-identity-progress",
    priority: 1.0,
    reason: "ホーム画面の基盤データ（常に必要）",
    cacheDuration: 300,
    estimatedSizeKB: 3,
  });

  immediate.push({
    endpoint: "/api/stargazer/profile",
    priority: 0.95,
    reason: "Stargazerプロファイル（常に必要）",
    cacheDuration: 300,
    estimatedSizeKB: 5,
  });

  // ─── 時間帯ベースのプリフェッチ ───

  // 朝（7-10時）: 予言 + 日次観測を優先
  if (hour >= 7 && hour <= 10) {
    immediate.push({
      endpoint: "/api/stargazer/prophecy",
      priority: 0.9,
      reason: "朝の予言配信（Anticipation Phase）",
      cacheDuration: 3600,
      estimatedSizeKB: 2,
    });
    if (context.isFirstVisitToday) {
      immediate.push({
        endpoint: "/api/stargazer/daily-observation",
        priority: 0.85,
        reason: "今日最初の訪問 → 観測データを先読み",
        cacheDuration: 3600,
        estimatedSizeKB: 8,
      });
    }
    deferred.push({
      endpoint: "/api/stargazer/inner-weather",
      priority: 0.6,
      reason: "朝の内なる天気（補助情報）",
      cacheDuration: 3600,
      estimatedSizeKB: 1,
    });
  }

  // 昼（11-14時）: マイクロ観測を優先
  if (hour >= 11 && hour <= 14) {
    immediate.push({
      endpoint: "/api/stargazer/daily-observation",
      priority: 0.85,
      reason: "昼のマイクロ観測（Micro Pulse Phase）",
      cacheDuration: 3600,
      estimatedSizeKB: 8,
    });
    deferred.push({
      endpoint: "/api/stargazer/blind-spot",
      priority: 0.5,
      reason: "昼の盲点チェック（好奇心ギャップ）",
      cacheDuration: 3600,
      estimatedSizeKB: 2,
    });
  }

  // 夕方（17-21時）: 内省 + 予言検証を優先
  if (hour >= 17 && hour <= 21) {
    immediate.push({
      endpoint: "/api/stargazer/prophecy",
      priority: 0.85,
      reason: "夕方の予言検証（Reflection Phase）",
      cacheDuration: 3600,
      estimatedSizeKB: 2,
    });
    immediate.push({
      endpoint: "/api/stargazer/inner-weather",
      priority: 0.8,
      reason: "夕方の内省（DMN活性化時間帯）",
      cacheDuration: 3600,
      estimatedSizeKB: 1,
    });
    deferred.push({
      endpoint: "/api/stargazer/three-mirrors",
      priority: 0.5,
      reason: "夕方の深い内省用",
      cacheDuration: 3600,
      estimatedSizeKB: 5,
    });
  }

  // 夜（21-24時）: 消える洞察 + ストリーク確認を優先
  if (hour >= 21 || hour < 1) {
    if (context.hasVanishingInsight) {
      immediate.push({
        endpoint: "/api/stargazer/vanishing-insight",
        priority: 0.95,
        reason: "消える洞察（Loss Aversion Phase — 最高緊急度）",
        cacheDuration: 1800,
        estimatedSizeKB: 2,
      });
    }
    deferred.push({
      endpoint: "/api/stargazer/trajectory",
      priority: 0.4,
      reason: "夜の成長軌跡確認",
      cacheDuration: 3600,
      estimatedSizeKB: 3,
    });
  }

  // ─── 行動パターンベースのプリフェッチ ───

  if (pattern) {
    // ユーザーがよく使うFeatureを優先
    for (const feature of pattern.topFeatures) {
      const featureEndpoints: Record<string, string> = {
        prophecy: "/api/stargazer/prophecy",
        observation: "/api/stargazer/daily-observation",
        alter: "/api/stargazer/alter",
        "blind-spot": "/api/stargazer/blind-spot",
        resonance: "/api/stargazer/resonance",
        "unseen-map": "/api/stargazer/unseen-map",
      };
      const endpoint = featureEndpoints[feature];
      if (endpoint && !immediate.some((i) => i.endpoint === endpoint)) {
        deferred.push({
          endpoint,
          priority: 0.6,
          reason: `ユーザーが頻繁に使用するFeature: ${feature}`,
          cacheDuration: ENDPOINT_CATALOG[endpoint]?.cacheDuration ?? 1800,
          estimatedSizeKB: ENDPOINT_CATALOG[endpoint]?.estimatedSizeKB ?? 3,
        });
      }
    }
  }

  // ─── Phenotype: 変更頻度が低いため、初回のみロード ───
  if (context.observationLevel <= 1) {
    // 新規ユーザーはPhenotypeをすぐ見せる
    deferred.push({
      endpoint: "/api/eye-profile",
      priority: 0.5,
      reason: "新規ユーザーの体験充実化",
      cacheDuration: 86400,
      estimatedSizeKB: 2,
    });
  } else {
    skipped.push("/api/eye-profile", "/api/body-color/profile", "/api/aneurasync/face-phenotype");
  }

  // ─── 重複排除 ───
  const seenEndpoints = new Set<string>();
  const dedupImmediate = immediate.filter((c) => {
    if (seenEndpoints.has(c.endpoint)) return false;
    seenEndpoints.add(c.endpoint);
    return true;
  });
  const dedupDeferred = deferred.filter((c) => {
    if (seenEndpoints.has(c.endpoint)) return false;
    seenEndpoints.add(c.endpoint);
    return true;
  });

  // ─── 帯域制限: immediate最大5件、deferred最大5件 ───
  const finalImmediate = dedupImmediate
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
  const finalDeferred = dedupDeferred
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  const totalSize =
    [...finalImmediate, ...finalDeferred].reduce(
      (s, c) => s + c.estimatedSizeKB,
      0,
    );

  const explanation = `${finalImmediate.length}件を即座にプリフェッチ、${finalDeferred.length}件を遅延プリフェッチ（推定${totalSize}KB）`;

  return {
    immediate: finalImmediate,
    deferred: finalDeferred,
    skipped,
    explanation,
    totalEstimatedSizeKB: totalSize,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Prefetch Execution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** プリフェッチキャッシュ（メモリ内） */
const prefetchCache = new Map<
  string,
  { data: unknown; fetchedAt: number; expiresAt: number }
>();

/**
 * プリフェッチを実行（クライアントサイド）
 *
 * 使い方（AneurasyncHome等で）:
 * ```
 * useEffect(() => {
 *   const plan = generatePrefetchPlan(hour, dayOfWeek, pattern, context);
 *   executePrefetchPlan(plan);
 * }, []);
 * ```
 */
export async function executePrefetchPlan(plan: PrefetchPlan): Promise<void> {
  // Immediate: 並列で即座に実行
  const immediatePromises = plan.immediate.map((candidate) =>
    fetchAndCache(candidate).catch(() => {
      // プリフェッチ失敗は無視（通常のフェッチにフォールバック）
    }),
  );

  await Promise.all(immediatePromises);

  // Deferred: requestIdleCallbackで空き時間に実行
  for (const candidate of plan.deferred) {
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => {
        fetchAndCache(candidate).catch(() => {});
      });
    } else {
      // requestIdleCallbackがない環境ではsetTimeoutで代替
      setTimeout(() => {
        fetchAndCache(candidate).catch(() => {});
      }, 1000);
    }
  }
}

async function fetchAndCache(candidate: PrefetchCandidate): Promise<void> {
  // キャッシュヒットチェック
  const cached = prefetchCache.get(candidate.endpoint);
  if (cached && cached.expiresAt > Date.now()) {
    return; // キャッシュ有効
  }

  const response = await fetch(candidate.endpoint, {
    credentials: "include",
    headers: { "X-Prefetch": "true" },
  });

  if (response.ok) {
    const data = await response.json();
    const now = Date.now();
    prefetchCache.set(candidate.endpoint, {
      data,
      fetchedAt: now,
      expiresAt: now + candidate.cacheDuration * 1000,
    });
  }
}

/**
 * プリフェッチキャッシュからデータを取得
 *
 * 使い方（通常のfetchの代替として）:
 * ```
 * const data = getPrefetchedData('/api/stargazer/prophecy')
 *   ?? await fetch('/api/stargazer/prophecy').then(r => r.json());
 * ```
 */
export function getPrefetchedData<T = unknown>(endpoint: string): T | null {
  const cached = prefetchCache.get(endpoint);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }
  return null;
}

/** キャッシュをクリア */
export function clearPrefetchCache(): void {
  prefetchCache.clear();
}
