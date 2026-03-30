// lib/stargazer/subscriptionTier.ts
// ──────────────────────────────────────────────────────────────────────
// Stargazer サブスクリプションティア管理
//
// free / premium の 2 ティアで機能ゲーティングを行う。
// 現時点では rendezvous_profiles.is_premium を参照（将来的に独立テーブル化予定）。
// ──────────────────────────────────────────────────────────────────────

import type { V4Feature } from "@/lib/stargazer/depthPhaseController";

// ═══ Types ═══

export type StargazerTierLevel = "free" | "premium";

export interface StargazerTier {
  level: StargazerTierLevel;
  /** premium の場合の有効期限（undefined = 無期限 or free） */
  expiresAt?: string;
}

export interface FeatureLimits {
  /** この機能が利用可能か */
  available: boolean;
  /** free ティアで制限付き利用可能か */
  limited: boolean;
  /** 1日あたりの最大利用回数（undefined = 無制限） */
  dailyLimit?: number;
  /** 制限の説明（日本語） */
  limitDescription?: string;
  /** プレミアム限定の場合のアップグレード促進文（日本語） */
  upgradePrompt?: string;
}

// ═══ Feature Gating Configuration ═══

interface FeatureGateConfig {
  /** free ティアで利用可能か */
  freeAccess: boolean;
  /** free ティアで制限付きか（freeAccess=true の場合のみ有効） */
  freeLimited: boolean;
  /** free ティアでの1日の利用回数制限 */
  freeDailyLimit?: number;
  /** free ティアでの制限説明 */
  freeLimitDescription?: string;
  /** premium ティアへのアップグレード促進文 */
  upgradePrompt: string;
}

const FEATURE_GATES: Record<V4Feature, FeatureGateConfig> = {
  // ── free ティアで完全利用可能 ──
  inner_weather: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },

  // ── free ティアで制限付き利用可能 ──
  blind_spot: {
    freeAccess: true,
    freeLimited: true,
    freeDailyLimit: 1,
    freeLimitDescription: "無料プランでは1日1回まで。やさしいトーンのみ",
    upgradePrompt: "プレミアムで全トーン・回数無制限の死角観測を",
  },
  prophecy: {
    freeAccess: true,
    freeLimited: true,
    freeDailyLimit: 1,
    freeLimitDescription: "無料プランでは1日1回の予言のみ",
    upgradePrompt: "プレミアムで回数無制限・高精度の予言を",
  },
  unseen_map: {
    freeAccess: true,
    freeLimited: true,
    freeLimitDescription: "無料プランでは基本マップのみ表示",
    upgradePrompt: "プレミアムで完全な未知の地図を解放",
  },
  // ── ベータ期間中は無料開放（マネタイズは後回し） ──
  alter: {
    freeAccess: true,
    freeLimited: true,
    freeLimitDescription: "無料プランでは1日5ターンまで",
    upgradePrompt: "プレミアムでもうひとりの自分との対話を解放",
  },
  ghost_resonance: {
    freeAccess: true,
    freeLimited: true,
    freeLimitDescription: "無料プランでは1日1回まで",
    upgradePrompt: "プレミアムで似た星の共鳴を体験",
  },
  decision_oracle: {
    freeAccess: false,
    freeLimited: false,
    upgradePrompt: "プレミアムで選択の予測を解放",
  },
  psyche_signature: {
    freeAccess: false,
    freeLimited: false,
    upgradePrompt: "プレミアムで心の指紋を生成",
  },

  // ── 6層フレームワーク新機能（free ティアで完全利用可能） ──
  values_discovery: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  core_wound: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  parts_dialogue: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  transformation: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  life_events: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  micro_ema: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  act_hexaflex: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  transform_simulation: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  dream_journal: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
  circadian_rhythm: {
    freeAccess: true,
    freeLimited: false,
    upgradePrompt: "",
  },
};

// ═══ Public API ═══

/**
 * ユーザーの Stargazer ティアを取得する。
 * Supabase クライアントを外から受け取り、rendezvous_profiles.is_premium を参照。
 * レコードが無い or is_premium=false の場合は free。
 */
export async function getStargazerTier(
  userId: string,
  supabase: { from: (table: string) => any },
  /** ベータテスターの場合 true を渡すと無条件で premium を返す */
  forcePremium?: boolean,
): Promise<StargazerTier> {
  if (forcePremium) {
    return { level: "premium" };
  }

  try {
    const { data } = await supabase
      .from("rendezvous_profiles")
      .select("is_premium, premium_expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data || !data.is_premium) {
      return { level: "free" };
    }

    // 有効期限チェック
    if (data.premium_expires_at) {
      const expires = new Date(data.premium_expires_at);
      if (expires < new Date()) {
        return { level: "free" };
      }
      return { level: "premium", expiresAt: data.premium_expires_at };
    }

    return { level: "premium" };
  } catch {
    // DB エラー時は free にフォールバック
    return { level: "free" };
  }
}

/**
 * 指定ティアで特定の機能が利用可能かどうかを判定する。
 * depthPhaseController のフェーズ制限とは独立したサブスクリプション制限。
 * 両方を満たさないと利用できない。
 */
export function isFeatureAvailable(
  tier: StargazerTier,
  feature: V4Feature,
): boolean {
  if (tier.level === "premium") return true;

  const gate = FEATURE_GATES[feature];
  return gate?.freeAccess ?? false;
}

/**
 * 指定ティアで特定の機能の制限情報を返す。
 */
export function getFeatureLimits(
  tier: StargazerTier,
  feature: V4Feature,
): FeatureLimits {
  const gate = FEATURE_GATES[feature];
  if (!gate) {
    return {
      available: false,
      limited: false,
      upgradePrompt: "不明な機能です",
    };
  }

  // premium は全機能フルアクセス
  if (tier.level === "premium") {
    return {
      available: true,
      limited: false,
    };
  }

  // free ティア
  if (!gate.freeAccess) {
    return {
      available: false,
      limited: false,
      upgradePrompt: gate.upgradePrompt,
    };
  }

  if (gate.freeLimited) {
    return {
      available: true,
      limited: true,
      dailyLimit: gate.freeDailyLimit,
      limitDescription: gate.freeLimitDescription,
      upgradePrompt: gate.upgradePrompt,
    };
  }

  return {
    available: true,
    limited: false,
  };
}

/**
 * 全 V4Feature のゲーティング状態をまとめて返す。
 * V4EngineHub のクライアントから利用する。
 */
export function getAllFeatureGates(tier: StargazerTier): Record<V4Feature, FeatureLimits> {
  const features: V4Feature[] = [
    "inner_weather",
    "blind_spot",
    "prophecy",
    "unseen_map",
    "alter",
    "ghost_resonance",
    "decision_oracle",
    "psyche_signature",
    "values_discovery",
    "core_wound",
    "parts_dialogue",
    "transformation",
    "life_events",
    "micro_ema",
    "act_hexaflex",
    "transform_simulation",
    "dream_journal",
    "circadian_rhythm",
  ];

  const result = {} as Record<V4Feature, FeatureLimits>;
  for (const f of features) {
    result[f] = getFeatureLimits(tier, f);
  }
  return result;
}

/**
 * premium 限定の V4Feature キー一覧を返す。
 */
export function getPremiumOnlyFeatures(): V4Feature[] {
  return (Object.entries(FEATURE_GATES) as [V4Feature, FeatureGateConfig][])
    .filter(([, gate]) => !gate.freeAccess)
    .map(([key]) => key);
}
