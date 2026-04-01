/**
 * Shared Style Profile Domain — 正本
 *
 * スタイルプロフィール（アイデンティティ・DNA・嗜好）の型定義とリポジトリ。
 * Calendar, Genome Card, Rendezvous 等がここから読む。
 * 編集は My-Style の責務。
 *
 * 現時点のストレージ:
 *   - Client正本: localStorage `culcept_my_style_v3` 内の各フィールド
 *   - Server正本: Supabase `user_style_summary.quiz_result.myStyleState`
 *   - 補助テーブル: `user_style_vector`, `pref_profile`, `taste_layers_cache`
 */

// 型は my-style の types.ts から re-export
export type {
  StyleLaneCode,
  StyleDepthBucket,
  SelectedStyleLane,
  UnexpectedStyleLane,
  IAmState,
  ISeekState,
  IBecomeState,
  SeekContextKey,
  SeekContextProfile,
  ColorPrefs,
  MyStyleProfile,
  MyStyleSelfProfile,
} from "@/app/(immersive)/my-style/_lib/types";

/** スタイルプロフィールの読み取り用サマリー */
export interface StyleProfileSummary {
  /** Core/Rare/Secret スタイルレーン */
  coreLanes: string[];
  rareLanes: string[];
  secretLanes: string[];
  /** 好みの印象 */
  desiredImpressions: string[];
  /** 惹かれる世界観 */
  attractedWorldviews: string[];
  /** 支配色 */
  dominantColors: Array<{ value: string; hex: string }>;
  /** パーソナルカラーシーズン (cross-feature) */
  pcSeason?: string;
  /** 体型タイプ (cross-feature) */
  bodyType?: string;
}

/**
 * スタイルプロフィールをサーバーから取得
 * `/api/my-style/bridge` GET → profile + crossFeature を合成
 */
export async function fetchStyleProfile(): Promise<StyleProfileSummary | null> {
  try {
    const res = await fetch("/api/my-style/bridge", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();

    const state = json?.remoteState;
    const crossFeature = json?.crossFeature;
    if (!state) return null;

    const styleSelections: Array<{ laneCode: string; bucket: string }> =
      state.styleSelections ?? [];

    return {
      coreLanes: styleSelections
        .filter((s: { bucket: string }) => s.bucket === "core")
        .map((s: { laneCode: string }) => s.laneCode),
      rareLanes: styleSelections
        .filter((s: { bucket: string }) => s.bucket === "rare")
        .map((s: { laneCode: string }) => s.laneCode),
      secretLanes: styleSelections
        .filter((s: { bucket: string }) => s.bucket === "secret")
        .map((s: { laneCode: string }) => s.laneCode),
      desiredImpressions: (state.iam?.desiredImpressions ?? []).map(
        (t: { code: string }) => t.code
      ),
      attractedWorldviews: (state.iseek?.attractedWorldviews ?? []).map(
        (t: { code: string }) => t.code
      ),
      dominantColors: state.colorPrefs?.dominant ?? [],
      pcSeason: crossFeature?.personalColor?.season ?? undefined,
      bodyType: crossFeature?.body?.jpType ?? undefined,
    };
  } catch {
    return null;
  }
}
