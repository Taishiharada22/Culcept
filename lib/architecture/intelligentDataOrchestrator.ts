// lib/architecture/intelligentDataOrchestrator.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Intelligent Data Orchestrator（知的データ統合指揮者）
//
// 追加設計:
// AneurasyncHomeの11並列フェッチを知的に制御する統合レイヤー。
// 3段階ウォーターフォール方式で体感速度を最大化する。
//
// 脳科学的根拠:
// - Progressive Disclosure: 情報を段階的に表示することで
//   認知負荷を軽減し、各段階での処理が深くなる
// - First Meaningful Paint: 最初の有意味な表示までの時間が
//   ユーザーの「速さ」認知を決定する（実際の全ロード時間ではない）
// - Skeleton Screen効果: ブランク画面よりスケルトンの方が
//   体感待ち時間が36%短い（Google UX研究）
//
// アーキテクチャ:
// Wave 1 (Critical, <200ms): Identity + Profile → 即座にUIのスケルトンを確定
// Wave 2 (Content, <500ms): Daily insights → メインコンテンツを表示
// Wave 3 (Enhancement, <2s): Phenotype + Reco → 追加的な豊かさ
//
// 世界参照:
// - Facebook: News Feed の段階的ロード
// - Spotify: プレイリストヘッダー → トラック → アートワークの3段階
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  generatePrefetchPlan,
  executePrefetchPlan,
  getPrefetchedData,
  loadBehaviorPattern,
  recordVisit,
  type PrefetchPlan,
} from "./predictivePreloading";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** データロードの波（段階） */
export type LoadWave = "critical" | "content" | "enhancement";

/** 個々のデータフェッチの定義 */
export interface DataFetchSpec {
  /** エンドポイント */
  endpoint: string;
  /** ロード波 */
  wave: LoadWave;
  /** 状態キー（結果を格納するキー） */
  stateKey: string;
  /** タイムアウト（ms） */
  timeoutMs: number;
  /** フェッチオプション */
  fetchOptions?: RequestInit;
  /** 条件（falseの場合スキップ） */
  condition?: boolean;
  /** 失敗時のフォールバック値 */
  fallback: unknown;
}

/** データオーケストレーションの結果 */
export interface OrchestrationResult {
  /** 各stateKeyに対応するデータ */
  data: Record<string, unknown>;
  /** 各波の完了時間（ms） */
  waveTiming: Record<LoadWave, number>;
  /** 全体の完了時間（ms） */
  totalTimeMs: number;
  /** プリフェッチからヒットしたデータ */
  prefetchHits: string[];
  /** パフォーマンスメトリクス */
  metrics: OrchestratorMetrics;
}

export interface OrchestratorMetrics {
  /** First Meaningful Paint（Wave 1完了までの時間） */
  fmpMs: number;
  /** プリフェッチヒット率 */
  prefetchHitRate: number;
  /** タイムアウトしたフェッチ数 */
  timeoutCount: number;
  /** 失敗したフェッチ数 */
  failedCount: number;
  /** スキップしたフェッチ数 */
  skippedCount: number;
}

/** オーケストレーション進捗コールバック */
export type ProgressCallback = (
  wave: LoadWave,
  completedKeys: string[],
  data: Record<string, unknown>,
) => void;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Fetch Spec Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AneurasyncHomeのデータフェッチ定義
 *
 * Wave 1 (Critical, <200ms):
 *   体感速度の決定要因。これだけでUIのスケルトンが確定する。
 *
 * Wave 2 (Content, <500ms):
 *   メインコンテンツ。ユーザーが「使える」状態になる。
 *
 * Wave 3 (Enhancement, <2s):
 *   追加的な豊かさ。なくても機能するが、あるとリッチ。
 */
export function buildFetchSpecs(options: {
  hasStargazerProfile: boolean;
  observationLevel: number;
  isFirstVisitToday: boolean;
}): DataFetchSpec[] {
  const specs: DataFetchSpec[] = [];

  // ━━━ Wave 1: Critical (UIスケルトン確定) ━━━

  specs.push({
    endpoint: "/api/aneurasync/home-identity-progress",
    wave: "critical",
    stateKey: "identityProgress",
    timeoutMs: 3000,
    fetchOptions: { cache: "no-store" },
    fallback: null,
  });

  specs.push({
    endpoint: "/api/stargazer/profile",
    wave: "critical",
    stateKey: "stargazerProfile",
    timeoutMs: 3000,
    condition: options.hasStargazerProfile,
    fallback: null,
  });

  // ━━━ Wave 2: Content (メインコンテンツ) ━━━

  specs.push({
    endpoint: "/api/stargazer/prophecy",
    wave: "content",
    stateKey: "prophecy",
    timeoutMs: 5000,
    condition: options.observationLevel >= 1,
    fallback: null,
  });

  specs.push({
    endpoint: "/api/stargazer/inner-weather",
    wave: "content",
    stateKey: "innerWeather",
    timeoutMs: 5000,
    condition: options.observationLevel >= 1,
    fallback: null,
  });

  specs.push({
    endpoint: "/api/stargazer/blind-spot",
    wave: "content",
    stateKey: "blindSpot",
    timeoutMs: 5000,
    condition: options.observationLevel >= 2,
    fallback: null,
  });

  specs.push({
    endpoint: "/api/stargazer/vanishing-insight",
    wave: "content",
    stateKey: "vanishingInsight",
    timeoutMs: 5000,
    condition: options.observationLevel >= 1,
    fallback: null,
  });

  specs.push({
    endpoint: "/api/stargazer/resonance",
    wave: "content",
    stateKey: "resonance",
    timeoutMs: 5000,
    fallback: null,
  });

  // ━━━ Wave 3: Enhancement (追加的豊かさ) ━━━

  specs.push({
    endpoint: "/api/eye-profile",
    wave: "enhancement",
    stateKey: "eyeProfile",
    timeoutMs: 8000,
    fallback: null,
  });

  specs.push({
    endpoint: "/api/body-color/profile",
    wave: "enhancement",
    stateKey: "bodyColorProfile",
    timeoutMs: 8000,
    fetchOptions: { cache: "no-store" },
    fallback: null,
  });

  specs.push({
    endpoint: "/api/aneurasync/face-phenotype",
    wave: "enhancement",
    stateKey: "facePhenotype",
    timeoutMs: 8000,
    fallback: null,
  });

  specs.push({
    endpoint: "/api/recommendations?limit=4",
    wave: "enhancement",
    stateKey: "recommendations",
    timeoutMs: 8000,
    fallback: [],
  });

  return specs;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Orchestrator Core
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * データを3段階ウォーターフォールで知的にロード
 *
 * 使い方:
 * ```tsx
 * const [data, setData] = useState({});
 *
 * useEffect(() => {
 *   const specs = buildFetchSpecs({ ... });
 *   orchestrateDataLoad(specs, (wave, keys, partialData) => {
 *     setData(prev => ({ ...prev, ...partialData }));
 *   });
 * }, []);
 * ```
 */
export async function orchestrateDataLoad(
  specs: DataFetchSpec[],
  onProgress?: ProgressCallback,
): Promise<OrchestrationResult> {
  const startTime = performance.now();
  const data: Record<string, unknown> = {};
  const waveTiming: Record<LoadWave, number> = {
    critical: 0,
    content: 0,
    enhancement: 0,
  };
  const prefetchHits: string[] = [];
  let timeoutCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // 訪問を記録
  recordVisit("home");

  // プリフェッチキャッシュからの先行ロード
  for (const spec of specs) {
    const cached = getPrefetchedData(spec.endpoint);
    if (cached) {
      data[spec.stateKey] = cached;
      prefetchHits.push(spec.endpoint);
    }
  }

  // 波ごとにフェッチを実行
  const waves: LoadWave[] = ["critical", "content", "enhancement"];

  for (const wave of waves) {
    const waveStart = performance.now();
    const waveSpecs = specs.filter(
      (s) =>
        s.wave === wave &&
        s.condition !== false &&
        !prefetchHits.includes(s.endpoint),
    );

    // スキップされたフェッチをカウント
    skippedCount += specs.filter(
      (s) => s.wave === wave && s.condition === false,
    ).length;

    if (waveSpecs.length === 0) {
      waveTiming[wave] = performance.now() - waveStart;
      continue;
    }

    // 波内のフェッチを並列実行
    const results = await Promise.all(
      waveSpecs.map((spec) => fetchWithTimeout(spec)),
    );

    const completedKeys: string[] = [];

    for (let i = 0; i < waveSpecs.length; i++) {
      const spec = waveSpecs[i];
      const result = results[i];

      if (result.status === "success") {
        data[spec.stateKey] = result.data;
        completedKeys.push(spec.stateKey);
      } else if (result.status === "timeout") {
        data[spec.stateKey] = spec.fallback;
        timeoutCount++;
      } else {
        data[spec.stateKey] = spec.fallback;
        failedCount++;
      }
    }

    waveTiming[wave] = performance.now() - waveStart;

    // 波の完了をコールバック
    if (onProgress && completedKeys.length > 0) {
      onProgress(wave, completedKeys, { ...data });
    }
  }

  // 次回のプリフェッチ計画を生成・実行（バックグラウンド）
  scheduleNextPrefetch();

  const totalTimeMs = performance.now() - startTime;

  return {
    data,
    waveTiming,
    totalTimeMs,
    prefetchHits,
    metrics: {
      fmpMs: waveTiming.critical,
      prefetchHitRate:
        specs.length > 0 ? prefetchHits.length / specs.length : 0,
      timeoutCount,
      failedCount,
      skippedCount,
    },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. Fetch with Timeout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type FetchResult =
  | { status: "success"; data: unknown }
  | { status: "timeout" }
  | { status: "failed"; error: string };

async function fetchWithTimeout(spec: DataFetchSpec): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), spec.timeoutMs);

  try {
    const response = await fetch(spec.endpoint, {
      credentials: "include",
      signal: controller.signal,
      ...spec.fetchOptions,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { status: "failed", error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { status: "success", data };
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "timeout" };
    }

    return {
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. Next-Visit Prefetch Scheduling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 次回訪問のプリフェッチを予約
 *
 * 現在のセッションのデータが揃った後、
 * バックグラウンドで次回訪問時に必要なデータを予測しプリフェッチ。
 */
function scheduleNextPrefetch(): void {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(() => {
      const pattern = loadBehaviorPattern();
      const hour = new Date().getHours();
      const dayOfWeek = new Date().getDay();

      const plan = generatePrefetchPlan(hour, dayOfWeek, pattern, {
        isFirstVisitToday: false,
        hasActiveStreak: true,
        hasVanishingInsight: false,
        observationLevel: 2,
      });

      // 遅延フェッチのみ実行（immediateは現在のセッションで既にロード済み）
      const deferredOnly: PrefetchPlan = {
        ...plan,
        immediate: [],
      };

      executePrefetchPlan(deferredOnly);
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. Performance Budget
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** パフォーマンスバジェット */
export const PERFORMANCE_BUDGET = {
  /** Wave 1（Critical）の目標時間 */
  criticalTargetMs: 200,
  /** Wave 2（Content）の目標時間 */
  contentTargetMs: 500,
  /** Wave 3（Enhancement）の目標時間 */
  enhancementTargetMs: 2000,
  /** 全体の目標時間 */
  totalTargetMs: 3000,
  /** プリフェッチヒット率の目標 */
  prefetchHitRateTarget: 0.3,
  /** タイムアウト率の上限 */
  timeoutRateMax: 0.1,
} as const;

/**
 * パフォーマンスバジェット違反を検出
 */
export function checkPerformanceBudget(
  result: OrchestrationResult,
): {
  violations: string[];
  isWithinBudget: boolean;
} {
  const violations: string[] = [];

  if (result.waveTiming.critical > PERFORMANCE_BUDGET.criticalTargetMs) {
    violations.push(
      `Critical wave: ${Math.round(result.waveTiming.critical)}ms > ${PERFORMANCE_BUDGET.criticalTargetMs}ms target`,
    );
  }
  if (result.waveTiming.content > PERFORMANCE_BUDGET.contentTargetMs) {
    violations.push(
      `Content wave: ${Math.round(result.waveTiming.content)}ms > ${PERFORMANCE_BUDGET.contentTargetMs}ms target`,
    );
  }
  if (result.totalTimeMs > PERFORMANCE_BUDGET.totalTargetMs) {
    violations.push(
      `Total: ${Math.round(result.totalTimeMs)}ms > ${PERFORMANCE_BUDGET.totalTargetMs}ms target`,
    );
  }

  const totalSpecs = Object.keys(result.data).length + result.metrics.skippedCount;
  if (totalSpecs > 0) {
    const timeoutRate = result.metrics.timeoutCount / totalSpecs;
    if (timeoutRate > PERFORMANCE_BUDGET.timeoutRateMax) {
      violations.push(
        `Timeout rate: ${Math.round(timeoutRate * 100)}% > ${PERFORMANCE_BUDGET.timeoutRateMax * 100}% max`,
      );
    }
  }

  return {
    violations,
    isWithinBudget: violations.length === 0,
  };
}
