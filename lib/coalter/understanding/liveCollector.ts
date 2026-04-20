/**
 * CoAlter Stage 1 Understand — Live collector（本番 invoke 用）
 *
 * ─────────────────────────────────────────────────────────────────────────
 * [CEO lock 2026-04-20 M1 1a] **経路確認 / wiring proof 専用**
 *
 *   このモジュールは talk_messages のみ読む最小 collector。person 側
 *   （stargazer / alter / behavioral / context）は **意図的に null / 空**。
 *   relationship / environmental も最小スタブ。
 *
 *   結果として runUnderstanding() は `source_coverage` 全ゼロで構造的に
 *   `outcome: "failed"` を返す。これは 1a の合格条件（Stage 1 が invoke 経路に
 *   乗った証明）を満たす。
 *
 *   **意味のある todayReading は 1b で取りに行く**（stargazer axes / 基本 alter /
 *   fairness / sharedHistory / ruptures を同ファイルに追加する）。1a の段階で
 *   implicitIntent=空 / latentNeeds=[] / mode=default を「今日の読み」として
 *   誤読させないため、invoke 側の Stage1Snapshot は failed 時に todayReading
 *   自体を欠落させる discriminated union を採用している。
 *
 * 規則:
 *   - read-only（INSERT / UPDATE / DELETE なし）
 *   - pair state / user_id は呼び元（invoke route）が既に確認済みのものを受け取る
 *   - query 数と参照元は `collectorMeta` で呼び元に返す（latency 監視 / 過読み検知用）
 *   - 例外は呼び元に throw する（invoke 側で catch → `stage1` 欠落 fail-open）
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stage1CollectorMeta } from "../types";
import { buildObservationBundle, type CollectorInputs } from "./observationBundle";
import type {
  ConversationTurn,
  IsoTimestamp,
  ObservationBundle,
  UserId,
} from "./types";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Public input / output
// ═══════════════════════════════════════════════════════════════════════════

export type LiveCollectorInput = {
  supabase: SupabaseClient;
  threadId: string;
  userA: string;
  userB: string;
  /** invoke route が注入する現在時刻 ISO。決定論のため caller 責任。 */
  now: IsoTimestamp;
};

export type LiveCollectorOutput = {
  bundle: ObservationBundle;
  meta: Stage1CollectorMeta;
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. talk_messages 取得の上限
//    tail を取り過ぎると invoke の latency が悪化する。shadow 系 diag と同じ 50 を採用。
// ═══════════════════════════════════════════════════════════════════════════

const TALK_MESSAGES_TAIL_LIMIT = 50;

// ═══════════════════════════════════════════════════════════════════════════
// 3. Public collector
// ═══════════════════════════════════════════════════════════════════════════

export async function collectLiveBundle(
  input: LiveCollectorInput,
): Promise<LiveCollectorOutput> {
  const turns = await fetchTurns(input.supabase, input.threadId, input.userA, input.userB);

  const collectorInputs: CollectorInputs = {
    personA: {
      userId: input.userA as UserId,
      displayName: "",
      stargazer: null,
      alter: null,
      behavioral: null,
      context: null,
    },
    personB: {
      userId: input.userB as UserId,
      displayName: "",
      stargazer: null,
      alter: null,
      behavioral: null,
      context: null,
    },
    relationship: {
      sharedHistory: [],
      fairnessLedger: [],
      currentTemperature: null,
      interactionPattern: null,
      unresolvedThreads: [],
      rupturesAndRepairs: [],
    },
    conversation: {
      turns,
      theme: null,
      extractedConstraints: null,
      caringIntensity: null,
      implicitMood: null,
      energyLevel: null,
      conversationArc: null,
      questionGuardState: null,
    },
    environmental: {
      timestamp: input.now,
      weather: null,
    },
    collectedAt: input.now,
  };

  const bundle = buildObservationBundle(collectorInputs);

  const meta: Stage1CollectorMeta = {
    queryCount: 1,
    sources: ["talk_messages"],
  };

  return { bundle, meta };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Supabase query
// ═══════════════════════════════════════════════════════════════════════════

type TalkMessageRow = {
  sender_id: string;
  body: string;
  created_at: string;
};

async function fetchTurns(
  supabase: SupabaseClient,
  threadId: string,
  userA: string,
  userB: string,
): Promise<ConversationTurn[]> {
  const { data, error } = await supabase
    .from("talk_messages")
    .select("sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(TALK_MESSAGES_TAIL_LIMIT);

  if (error) {
    throw new Error(`liveCollector: talk_messages fetch failed: ${error.message}`);
  }

  const rows = (data ?? []) as TalkMessageRow[];
  // DESC で取ったので ASC に戻す
  rows.reverse();

  return rows
    .filter((r) => r.sender_id === userA || r.sender_id === userB)
    .map((r) => ({
      senderId: r.sender_id as UserId,
      body: r.body,
      createdAt: r.created_at as IsoTimestamp,
    }));
}
