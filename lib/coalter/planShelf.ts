/**
 * CoAlter Plan Shelf — 採用候補の一時保持（Phase 1.5 骨格）
 *
 * 設計:
 * - ユーザーが「採用」した候補をスレッド+日付単位で蓄積
 * - 指定日が過ぎたら自動的に非表示（is_expired フラグ）
 * - Phase 2で Alter Planner に接続して1日のプランに変換
 *
 * DB: coalter_plan_items テーブル（migration追加）
 * UI: トーク画面の右上にPlan Shelfアイコン → クリックで一覧表示
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/**
 * 代替案（第2候補以降の控え）— Phase 1.5.3 ②
 * 当日 NG になった時の再合意コストをゼロ化する「抱き合わせ保存」の要素。
 */
export interface PlanAlternative {
  /** 候補タイトル */
  title: string;
  /** 一言説明 */
  oneLiner: string;
  /** 実用情報（住所・価格など） */
  practicalInfo?: string | null;
  /** 元の候補URL */
  url?: string | null;
}

export interface PlanItem {
  id: string;
  threadId: string;
  sessionId: string;
  /** 対象日（例: 2026-04-17） */
  targetDate: string;
  /** 時間帯（例: "12:00-14:00"、nullなら未定） */
  timeSlot: string | null;
  /** 候補タイトル（例: "Restaurant A bientot"） */
  title: string;
  /** 一言説明 */
  description: string;
  /** 実用情報（場所・価格等） */
  practicalInfo: string | null;
  /** リンクURL */
  url: string | null;
  /** カテゴリ（food / movie / activity / shopping / other） */
  category: string;
  /** 並び順（時系列） */
  sortOrder: number;
  /** 採用したユーザーID（自分/相手マーカー用） */
  createdBy: string;
  createdAt: string;
  /** 期限切れかどうか（targetDate < today） */
  isExpired: boolean;
  /** 代替案（Phase 1.5.3 ②）— 控えの第2候補以降。null = 未保存 */
  alternatives: PlanAlternative[] | null;
}

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

/**
 * 採用した候補をPlan Shelfに追加する。
 */
export async function addPlanItem(
  supabase: SupabaseClient,
  params: {
    threadId: string;
    sessionId: string;
    targetDate: string;
    timeSlot: string | null;
    title: string;
    description: string;
    practicalInfo: string | null;
    url: string | null;
    category: string;
    /** 採用したユーザーのID（RLS `auth.uid() = created_by` を通すため必須） */
    createdBy: string;
    /** 代替案（Phase 1.5.3 ②）— 控えの第2候補以降 */
    alternatives?: PlanAlternative[] | null;
  },
): Promise<PlanItem | null> {
  // 同じスレッド+日付の既存アイテム数で sortOrder を決定
  const { count } = await supabase
    .from("coalter_plan_items")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", params.threadId)
    .eq("target_date", params.targetDate);

  const { data, error } = await supabase
    .from("coalter_plan_items")
    .insert({
      thread_id: params.threadId,
      session_id: params.sessionId,
      target_date: params.targetDate,
      time_slot: params.timeSlot,
      title: params.title,
      description: params.description,
      practical_info: params.practicalInfo,
      url: params.url,
      category: params.category,
      sort_order: (count ?? 0) + 1,
      created_by: params.createdBy,
      alternatives: params.alternatives ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[CoAlter/PlanShelf] Failed to add item:", error);
    return null;
  }

  return mapRow(data);
}

/**
 * スレッド+日付のPlan Shelf一覧を取得する。
 * 期限切れは is_expired: true で返す（非表示はクライアント判断）。
 */
export async function getPlanItems(
  supabase: SupabaseClient,
  threadId: string,
  targetDate?: string,
): Promise<PlanItem[]> {
  let query = supabase
    .from("coalter_plan_items")
    .select("*")
    .eq("thread_id", threadId)
    .order("target_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (targetDate) {
    query = query.eq("target_date", targetDate);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const today = new Date().toISOString().slice(0, 10);
  return data.map((row) => ({
    ...mapRow(row),
    isExpired: row.target_date < today,
  }));
}

/**
 * Plan Shelf のアイテムを差し替え更新する（Phase 1.5.3 ④ — 局所リファインメント用）。
 *
 * 設計:
 *  - category と targetDate は意図的に変更不可（局所修正の定義）
 *  - alternatives は残す（第2候補を失うのは損失）
 *  - RLS 上は created_by = auth.uid() のユーザーだけが更新できる
 */
export async function updatePlanItem(
  supabase: SupabaseClient,
  params: {
    itemId: string;
    title: string;
    description: string;
    practicalInfo: string | null;
    url: string | null;
    timeSlot: string | null;
  },
): Promise<PlanItem | null> {
  const { data, error } = await supabase
    .from("coalter_plan_items")
    .update({
      title: params.title,
      description: params.description,
      practical_info: params.practicalInfo,
      url: params.url,
      time_slot: params.timeSlot,
    })
    .eq("id", params.itemId)
    .select("*")
    .single();

  if (error) {
    console.error("[CoAlter/PlanShelf] Failed to update item:", error);
    return null;
  }

  return mapRow(data);
}

/**
 * Plan Shelfからアイテムを削除する（再提案フロー用）。
 */
export async function removePlanItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("coalter_plan_items")
    .delete()
    .eq("id", itemId);

  return !error;
}

// ─────────────────────────────────────────────
// DB行 → PlanItem マッピング
// ─────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): PlanItem {
  const today = new Date().toISOString().slice(0, 10);
  // alternatives カラムは JSONB。migration 未実行環境でも null 安全に動く
  const rawAlternatives = row.alternatives;
  const alternatives: PlanAlternative[] | null = Array.isArray(rawAlternatives)
    ? (rawAlternatives as PlanAlternative[])
    : null;
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    sessionId: row.session_id as string,
    targetDate: row.target_date as string,
    timeSlot: (row.time_slot as string) ?? null,
    title: row.title as string,
    description: row.description as string,
    practicalInfo: (row.practical_info as string) ?? null,
    url: (row.url as string) ?? null,
    category: row.category as string,
    sortOrder: row.sort_order as number,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    isExpired: (row.target_date as string) < today,
    alternatives,
  };
}
