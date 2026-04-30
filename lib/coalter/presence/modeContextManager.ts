/**
 * CoAlter Stage 2 — modeContextManager (L2-i)
 *
 * 正本: Core UX v1.1 §10.2 モード別セッション文脈 / §10.3 モード遷移時の文脈継承
 *
 * 責務:
 *   - mode 遷移時の文脈継承ルール (§10.3)
 *   - 通常 → Daily/Travel: 通常の理解を部分的に持ち込む (プラン制約のヒント)
 *   - Daily/Travel → 通常: プラン結果を共有メモリに格納
 *
 * 設計:
 *   - 純関数 (immutable MemoryStore in/out)
 *   - mode 遷移時の inheritance/handoff を transformation として表現
 */

import type { MemoryItem, ModeContext, Origin } from "./memoryTypes";
import type { MemoryStore } from "./memoryStore";

/**
 * Mode 遷移種別 (§10.3 で扱う方向)。
 */
export type ModeTransitionDirection =
  | { from: "normal"; to: "daily" | "travel" }   // 通常 → 昇格
  | { from: "daily" | "travel"; to: "normal" };  // Daily/Travel → 復帰

/**
 * §10.3 文脈継承: 通常 → Daily/Travel への昇格時。
 *
 * 通常モードで explicit_shared かつ高確定度 (medium 以上) の項目を「ヒント」として
 * 新 mode 文脈に複製する (元項目は通常モード文脈のまま残す)。
 *
 * 部分的継承の意図 (§10.3): 通常会話の理解は Daily/Travel に「プラン制約のヒント」
 * として持ち込む、というルールの構造的写像。
 */
export function inheritOnPromote(
  store: MemoryStore,
  to: "daily" | "travel",
  now: number,
): MemoryStore {
  // 既存項目はそのまま、継承候補のみ新 mode 文脈で複製
  const inherited: MemoryItem[] = store
    .filter(
      (m) =>
        m.modeContext === "normal" &&
        m.origin === "explicit_shared" &&
        (m.certainty === "high" || m.certainty === "medium"),
    )
    .map((m) => ({
      ...m,
      id: `${m.id}@${to}`,
      modeContext: to,
      createdAt: now,
      updatedAt: now,
    }));
  return [...store, ...inherited];
}

/**
 * §10.3 文脈継承: Daily/Travel → 通常への復帰時。
 *
 * プラン結果を共有メモリに格納する。
 *
 * 入力: planSummary (プラン完成時に executor 側が生成した要約テキスト)。
 * 出力: 新 store (planSummary が transient_summary として通常モード文脈に追加)。
 *
 * 通常モード再開時に「プランが出た後の関係状態」から再開できるよう、共有メモリに
 * トレースを残す (永続的事実化はしない、§8.3.4 transient_summary は共有事実化禁止)。
 */
export function handoffOnReturn(
  store: MemoryStore,
  from: "daily" | "travel",
  planSummary: { id: string; content: string } | null,
  now: number,
  expiresAt: number,
): MemoryStore {
  if (!planSummary) return store;
  const summary: MemoryItem = {
    id: planSummary.id,
    content: planSummary.content,
    origin: "transient_summary" satisfies Origin,
    certainty: "medium",
    // §8.3.4: transient_summary × medium × both_visible は禁止 → user_a_only に格納
    // (§10.3「共有メモリに格納」だが §8.3.4 を侵害しないよう内部 / 片側可視で残す。
    //  両者可視に昇格させたい場合は明示 share 操作 (L4 範囲) を経由する)
    visibility: "internal_only",
    modeContext: "normal", // 通常モード再開後に参照
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
  return [...store, summary];
}

/**
 * 任意 mode 遷移に対する文脈継承の facade。
 *
 * - normal → daily/travel: inheritOnPromote
 * - daily/travel → normal: handoffOnReturn (planSummary は呼び出し側で渡す)
 * - その他: store 不変
 */
export function applyContextTransition(
  store: MemoryStore,
  direction: ModeTransitionDirection,
  now: number,
  options: {
    planSummary?: { id: string; content: string } | null;
    summaryExpiresAt?: number;
  } = {},
): MemoryStore {
  if (direction.from === "normal") {
    return inheritOnPromote(store, direction.to, now);
  }
  // Daily/Travel → normal
  return handoffOnReturn(
    store,
    direction.from,
    options.planSummary ?? null,
    now,
    options.summaryExpiresAt ?? now + 24 * 60 * 60 * 1000, // 24h default
  );
}

/**
 * 現在 active な mode 文脈の項目数を返す (§10.2 確認 / debug 用)。
 */
export function countByModeContext(
  store: MemoryStore,
  scope: ModeContext,
): number {
  return store.filter((m) => m.modeContext === scope).length;
}
