/**
 * CoAlter Stage 2 — Cooldown Resolver (L2-e)
 *
 * 正本: runtime contract §3 全体 (`@coalter` 強制起動 vs cooldown 優先順位)
 *   - §3.1 `@coalter` 発火 5 種類
 *   - §3.2 cooldown 5 種類 (+ §6.6.3 = 6 種、constants.ts COOLDOWN_KINDS)
 *   - §3.3 優先順位 6 段階
 *   - §3.3.1 超越 cooldown 抑制応答
 *   - §3.5 5 分最短再起動ルール
 *   - §3.7 不可侵
 *
 * 6 段階優先順位 (上位ほど強い、上位棄却で下位判定に進まない):
 *   1. availability (disabled/inactive/pending_consent → 発火不能、UI 非表示)
 *   2. dignity cooldown (介入棄却、抑制応答 1 文返す)
 *   3. rupture cooldown (S1 昇格棄却、S0 維持、抑制応答返す)
 *   4. mode 拒否 cooldown (当該モードのみ棄却、他は通る)
 *   5. 提案拒否 cooldown (当該テーマのみ棄却、他は通る)
 *   6. 通常 S8 cooldown (`@coalter` 強制起動 = mention/button/mode_tap で上書き可)
 *
 * critical signal の 5 分超越 (§3.5、v1.1 §8.4):
 *   - critical 起源の発火は 6 段の通常 S8 を上書き可
 *   - dignity / rupture (超越 cooldown) はそれでも介入禁止
 */

import type { CooldownKind } from "./constants";
import type { ExecutorAvailability, PresenceMode } from "./types";

// ─────────────────────────────────────────────
// 入力型
// ─────────────────────────────────────────────

/**
 * `@coalter` 発火種類 (runtime §3.1 / §3.2 上書きルール)。
 *
 * 「強制起動」(§3.1 注記) = mention / button / mode_tap。
 * chip / free_text_reply は通常対話フロー応答であり強制起動ではない。
 */
export type FireKind =
  | "mention"
  | "button"
  | "chip"
  | "free_text_reply"
  | "mode_tap";

/** 強制起動 fire kinds (§3.5 通常 S8 上書き条件) */
const FORCE_FIRE_KINDS: ReadonlySet<FireKind> = new Set([
  "mention",
  "button",
  "mode_tap",
]);

/**
 * 発生中の cooldown インスタンス。
 *
 * - kind: 種別
 * - rejectedTheme: proposal_rejection で拒否されたテーマ (selector で同テーマ判定)
 * - rejectedMode: mode_rejection で拒否された mode
 * - expiresAt: 期限 (ms)。Date.now() < expiresAt で active
 */
export interface ActiveCooldown {
  kind: CooldownKind;
  expiresAt: number;
  rejectedTheme?: string;
  rejectedMode?: PresenceMode;
}

/**
 * Resolver 入力。
 */
export interface ResolveInput {
  availability: ExecutorAvailability;
  /** 発生中 cooldown 一覧 (期限切れは呼び出し側でフィルタ済前提) */
  activeCooldowns: ReadonlyArray<ActiveCooldown>;
  /** `@coalter` 発火種類 */
  fireKind: FireKind;
  /** 発火が critical signal 起源か (§3.5 5 分超越判定) */
  fromCriticalSignal?: boolean;
  /** 提案テーマ (proposal_rejection 判定) */
  theme?: string;
  /** モード昇格対象 (mode_rejection 判定) */
  targetMode?: PresenceMode;
}

// ─────────────────────────────────────────────
// 出力型
// ─────────────────────────────────────────────

/**
 * Resolver 出力。
 *
 * - admit: 介入を進めるか (S1 以降に進めるか / availability OK か)
 * - tier: 棄却された段位 (1-6)、admit=true の場合は通過した最終段
 * - respondSuppressed: tier 2/3 (dignity / rupture) で抑制応答を返すべきか (§3.3.1)
 * - reason: ログ・debug 用の判定理由
 */
export interface ResolveResult {
  admit: boolean;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  respondSuppressed: boolean;
  reason: string;
}

// ─────────────────────────────────────────────
// Resolver 本体
// ─────────────────────────────────────────────

/**
 * 6 段階優先順位で `@coalter` 発火を判定する。
 *
 * 上位棄却で下位判定に進まない。tier 2/3 は「介入棄却 + 抑制応答」(§3.3.1)。
 */
export function resolveCooldown(input: ResolveInput): ResolveResult {
  // Tier 1: availability gate (§3.3 順位 1 / §3.4)
  if (
    input.availability === "disabled" ||
    input.availability === "inactive" ||
    input.availability === "pending_consent"
  ) {
    return {
      admit: false,
      tier: 1,
      respondSuppressed: false,
      reason: `availability=${input.availability} (UI 非表示、発火不能)`,
    };
  }

  // Tier 2: dignity cooldown (§3.3 順位 2 / 超越)
  if (hasCooldown(input.activeCooldowns, "dignity")) {
    return {
      admit: false,
      tier: 2,
      respondSuppressed: isForceFire(input.fireKind),
      reason: "dignity cooldown (超越、介入棄却 + 抑制応答 §3.3.1)",
    };
  }

  // Tier 3: rupture cooldown (§3.3 順位 3 / 超越)
  if (hasCooldown(input.activeCooldowns, "rupture")) {
    return {
      admit: false,
      tier: 3,
      respondSuppressed: isForceFire(input.fireKind),
      reason: "rupture cooldown (超越、S1 昇格棄却、S0 維持、抑制応答 §3.3.1)",
    };
  }

  // §6.6.3 介入後退要求: rupture と同等の超越扱い (UI spec §6.6.3、指定期間 S0→S1 完全停止)
  // ただし mention / button (§3.4 明示再起動) で上書き可、ここは S1 自動昇格の禁止のみ
  if (hasCooldown(input.activeCooldowns, "intervention_retreat")) {
    if (!isForceFire(input.fireKind)) {
      return {
        admit: false,
        tier: 3,
        respondSuppressed: false,
        reason: "intervention_retreat cooldown (S1 自動昇格停止、UI spec §6.6.3)",
      };
    }
    // mention / button / mode_tap は §6.6.3「期間中もユーザー明示呼び出し応答可」で通る
  }

  // Tier 4: mode 拒否 cooldown (§3.3 順位 4、対象 mode のみ棄却)
  if (input.fireKind === "mode_tap" && input.targetMode) {
    const blocked = input.activeCooldowns.some(
      (c) =>
        c.kind === "mode_rejection" && c.rejectedMode === input.targetMode,
    );
    if (blocked) {
      return {
        admit: false,
        tier: 4,
        respondSuppressed: false,
        reason: `mode_rejection cooldown for ${input.targetMode}`,
      };
    }
  }

  // Tier 5: 提案拒否 cooldown (§3.3 順位 5、同テーマのみ棄却)
  if (input.theme) {
    const themeBlocked = input.activeCooldowns.some(
      (c) =>
        c.kind === "proposal_rejection" && c.rejectedTheme === input.theme,
    );
    if (themeBlocked) {
      return {
        admit: false,
        tier: 5,
        respondSuppressed: false,
        reason: `proposal_rejection cooldown for theme=${input.theme}`,
      };
    }
  }

  // Tier 6: 通常 S8 cooldown (§3.3 順位 6 / §3.5)
  if (hasCooldown(input.activeCooldowns, "normal_s8")) {
    // 強制起動 (mention/button/mode_tap) は上書き可 (§3.5 通常 S8 = 5 分ルール 0 短縮)
    // critical signal 起源も上書き可 (§3.5 / v1.1 §8.4)
    if (isForceFire(input.fireKind) || input.fromCriticalSignal === true) {
      return {
        admit: true,
        tier: 6,
        respondSuppressed: false,
        reason:
          "normal_s8 cooldown overridden by force fire / critical signal (§3.5)",
      };
    }
    // chip / free_text_reply は上書きしない (§3.5 通常 S8 上書き対象外)
    return {
      admit: false,
      tier: 6,
      respondSuppressed: false,
      reason: "normal_s8 cooldown active (chip/free_text_reply で上書き不可、§3.5)",
    };
  }

  // 全段通過: 介入 OK
  return {
    admit: true,
    tier: 6,
    respondSuppressed: false,
    reason: "all cooldown gates passed",
  };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function hasCooldown(
  cooldowns: ReadonlyArray<ActiveCooldown>,
  kind: CooldownKind,
): boolean {
  return cooldowns.some((c) => c.kind === kind);
}

function isForceFire(kind: FireKind): boolean {
  return FORCE_FIRE_KINDS.has(kind);
}

/**
 * 期限切れ cooldown を除外する helper (resolve 直前に呼ぶ想定)。
 *
 * 呼び出し側 (Stage 3 orchestrator) で `Date.now()` を渡して活性 cooldown のみ
 * resolveCooldown に渡す。本 helper は純関数。
 */
export function pruneExpired(
  cooldowns: ReadonlyArray<ActiveCooldown>,
  now: number,
): ReadonlyArray<ActiveCooldown> {
  return cooldowns.filter((c) => c.expiresAt > now);
}
