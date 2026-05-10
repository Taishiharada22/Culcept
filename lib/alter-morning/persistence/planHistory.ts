/**
 * planHistory — alter_morning_plan_history persistence helpers (PR B-5a Commit 2)
 *
 * CEO/GPT 2026-05-02 PR B-5a 規律:
 *   PR B-2c (Layer 2 前日終点 inheritance) の前提となる persistence foundation。
 *   inheritance logic は本 file に入れない (PR B-2c で別途実装)。
 *
 * 不変条件 (本 file):
 *   1. plan_date = plan.date 強制 (caller 責任で別引数を受けない、plan.date を信頼)
 *   2. server-side owner enforcement: caller の userId のみ owner、plan JSON 内の
 *      userId などは信用しない
 *   3. isPlanWorthSaving: items >0 OR transportSegments >0 OR USER_EXPLICIT anchor
 *      のみ保存 (registered_home / current / default_round_trip 単独の空 plan は不保存)
 *   4. sha256(userId).slice(0, 12) で log mask、raw userId / plan JSON / 住所 / 座標は
 *      絶対 log に出さない
 *   5. fail-soft: DB 失敗時 response は壊さない (caller が try/catch で wrapping)
 *   6. fetchPreviousDayPlan: 直前 1 日のみ参照 (cascade なし)
 *   7. inheritance logic は本 file に入れない (PR B-2c)
 */

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MorningPlan } from "../types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USER_EXPLICIT_ANCHOR_SOURCES — deterministic detector 由来 (PR B-2b 規律)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// PR B-2b で USER_EXPLICIT_SOURCES として定義済 (anchorState.ts):
//   - "user_declared": deterministic origin detector 由来
//   - "user_explicit_endpoint": deterministic endpoint detector 由来
//
// isPlanWorthSaving では同じ set を参照する。コピーではなく re-declare:
//   - 循環 import 回避 (anchorState.ts は本 file を import しない)
//   - PR B-2b で凍結された set に変更があれば本 set も同期 (運用責任)
//
// 含まれない (= 信頼度低、isPlanWorthSaving では「保存対象」 として扱わない):
//   - "current" / "registered_home": resolver 自動派生
//   - "default_round_trip": assumed end (homeAnchor 由来)
//   - "comprehension_explicit": LLM 経由
//   - "user_override": clarify 経由 (PR B-2e)

const SAVE_WORTHY_ANCHOR_SOURCES = new Set<string>([
  "user_declared",
  "user_explicit_endpoint",
]);

function hasSaveWorthyAnchor(
  anchor: MorningPlan["journeyOrigin"] | MorningPlan["journeyEnd"],
): boolean {
  if (!anchor) return false;
  if (anchor.kind !== "known_exact" && anchor.kind !== "known_label_only") {
    return false;
  }
  return SAVE_WORTHY_ANCHOR_SOURCES.has(anchor.source);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isPlanWorthSaving — 保存対象判定 (GPT 修正 2 反映)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 保存対象 (= user の能動的入力に基づく plan):
//   - items.length > 0 (確定された予定がある)
//   - transportSegments.length > 0 (移動が組まれている)
//   - origin/end が USER_EXPLICIT 由来 (発話で明示された anchor)
//
// 保存しない (= 自動派生 anchor だけの空 plan、history のノイズ):
//   - registered_home / current / default_round_trip だけの空 plan
//   - unknown だけの plan
//   - plan.date がない / plan が undefined
export function isPlanWorthSaving(plan: MorningPlan | undefined): boolean {
  if (!plan?.date) return false;
  const hasItems = (plan.items?.length ?? 0) > 0;
  const hasTransport = (plan.transportSegments?.length ?? 0) > 0;
  const hasExplicitOrigin = hasSaveWorthyAnchor(plan.journeyOrigin);
  const hasExplicitEnd = hasSaveWorthyAnchor(plan.journeyEnd);
  return hasItems || hasTransport || hasExplicitOrigin || hasExplicitEnd;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// hashUserId — PII-safe log identifier (GPT 修正 3 反映)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// raw userId は log に出さない。sha256 hash の先頭 12 文字で識別子化。
// - debug 時に同 user の log を trace 可能 (~48 bit エントロピー、collision risk 低)
// - 完全に逆引き不能 (sha256 一方向)
// - rainbow table 対策の salt は本 PR では入れない (debug 用、production data ではない)
export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

function logPersistenceFailure(
  operation: "upsert" | "fetch",
  reason: string,
  userId: string,
  planDate: string | null,
): void {
  // GPT 規律: plan JSON / 住所 / 座標 / raw userId は絶対に log に出さない
  console.error("[alter_morning_plan_history] persistence failure", {
    operation,
    reason,
    userIdHash: hashUserId(userId),
    planDate: planDate ?? "null",
    timestamp: new Date().toISOString(),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// upsertPlanHistory — 各 turn の plan 保存
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計 (CEO/GPT 規律):
//   - caller (route.ts) が auth.getUser() から取得した userId を渡す
//   - plan 内の userId field は信用しない (server-side owner enforcement)
//   - PRIMARY KEY (user_id, plan_date) で同 user × 同日付の plan は 1 件 (upsert で更新)
//   - DB CHECK 制約: plan->>'date' = to_char(plan_date, 'YYYY-MM-DD') で整合性保証
//
// 戻り値:
//   - { ok: true }: upsert 成功
//   - { ok: false; reason }: guard fail or DB error。caller は fail-soft で response 維持
//
// fail mode:
//   - missing_user_id: caller が userId を渡し忘れた
//   - plan_not_worth_saving: isPlanWorthSaving(plan) === false
//   - db_<code>: Supabase が error を返した
export async function upsertPlanHistory(
  supabase: SupabaseClient,
  userId: string,
  plan: MorningPlan | undefined,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // GPT 規律 (2): caller の userId を唯一の owner source
  if (!userId) {
    return { ok: false, reason: "missing_user_id" };
  }
  // GPT 規律 (3): valid plan のみ保存
  if (!isPlanWorthSaving(plan)) {
    return { ok: false, reason: "plan_not_worth_saving" };
  }
  // GPT 規律 (1): plan_date = plan.date 強制 (別引数で受けない、plan.date を信頼)
  const planDate = plan!.date;

  const { error } = await supabase
    .from("alter_morning_plan_history")
    .upsert(
      {
        user_id: userId, // caller の auth userId のみ
        plan_date: planDate,
        plan,
      },
      { onConflict: "user_id,plan_date" },
    );

  if (error) {
    const reason = `db_${error.code ?? "unknown"}`;
    logPersistenceFailure("upsert", reason, userId, planDate);
    return { ok: false, reason };
  }
  return { ok: true };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchPreviousDayPlan — 直前 1 日のみの plan 取得 (GPT 規律 4 反映)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計 (CEO/GPT 規律):
//   - todayDate - 1 day だけを見る (cascade なし、それ以前は遡らない)
//   - 前日 plan が存在しなければ null (PR B-2c で Layer 2 unknown となる)
//   - PR B-2c で Layer 2 (前日終点 inheritance) の inference 材料として使用
//
// fail mode:
//   - userId / todayDate 不正 → null
//   - todayDate format 不正 (parse 失敗) → null
//   - DB error → null + log
export async function fetchPreviousDayPlan(
  supabase: SupabaseClient,
  userId: string,
  todayDate: string, // YYYY-MM-DD
): Promise<MorningPlan | null> {
  if (!userId || !todayDate) return null;

  // todayDate - 1 day を計算
  const today = new Date(todayDate + "T00:00:00Z");
  if (isNaN(today.getTime())) return null;
  today.setUTCDate(today.getUTCDate() - 1);
  const yesterday = today.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("alter_morning_plan_history")
    .select("plan")
    .eq("user_id", userId)
    .eq("plan_date", yesterday) // 直前 1 日のみ、cascade なし
    .maybeSingle();

  if (error) {
    logPersistenceFailure("fetch", `db_${error.code ?? "unknown"}`, userId, yesterday);
    return null;
  }
  return (data?.plan as MorningPlan | undefined) ?? null;
}
