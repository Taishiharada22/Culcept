/**
 * Shared Wardrobe Domain — 正本
 *
 * ワードローブアイテムの型定義とリポジトリ。
 * Calendar も My-Style もここから型を読む。
 * UIロジック（スコアリング、提案、可視化）は各機能側に置く。
 *
 * 現時点のストレージ:
 *   - Client正本: localStorage `culcept_my_style_v3` 内の `wardrobe` 配列
 *   - Server正本: Supabase `user_style_summary.quiz_result.myStyleState.wardrobe`
 *   - 書き込み: My-Style のみ（CRUD は my-style の責務）
 *   - 読み取り: Calendar, Genome Card, Rendezvous 等
 */

// 型は my-style の types.ts から re-export（将来的に移動予定）
// 現時点では import path を統一するための中継点
export type {
  WardrobeItem,
  SavedSetup,
  SetupMoodCode,
  WearRecord,
} from "@/app/(immersive)/my-style/_lib/types";

export type {
  CategoryMain,
  SeasonCode,
  ThicknessCode,
  FormalityCode,
  SilhouetteCode,
  PatternCode,
} from "@/app/(immersive)/my-style/_lib/taxonomy";

/**
 * ワードローブの読み取り（サーバーサイド）
 * `/api/my-style/bridge` GET を経由して取得する
 */
export async function fetchWardrobe(): Promise<
  import("@/app/(immersive)/my-style/_lib/types").WardrobeItem[]
> {
  try {
    const res = await fetch("/api/my-style/bridge", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    const remote = json?.remoteState?.wardrobe;
    return Array.isArray(remote) ? remote : [];
  } catch {
    return [];
  }
}

/**
 * ワードローブの読み取り（localStorage フォールバック）
 * サーバー未到達時のクライアント側正本
 */
const STYLE_STATE_KEY = "culcept_my_style_v3";

export function loadWardrobeFromLocal(): import("@/app/(immersive)/my-style/_lib/types").WardrobeItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STYLE_STATE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data?.wardrobe) ? data.wardrobe : [];
  } catch {
    return [];
  }
}
