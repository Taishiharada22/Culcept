/**
 * /plan/dev-postvisit-dogfood — 評価OS Stage 4-A2 dogfood inspection host（dev 限定・read-only）
 *
 * ★production 構造的不可視: NODE_ENV === "production" → notFound()（404）。
 * ★さらに client panel が isPostVisitCheckEnabled()（flag OFF / production → null）で二重ガード。
 * ★localStorage shadow の集計のみ・Supabase/外部送信なし・ranking 非影響。製品の入口ではない（Home 非経由）。
 */
import { notFound } from "next/navigation";
import { PostVisitDogfoodPanel } from "../components/PostVisitDogfoodPanel";

export const dynamic = "force-dynamic";

export default function DevPostVisitDogfoodPage() {
  if (process.env.NODE_ENV === "production") notFound(); // ★production hard block
  return <PostVisitDogfoodPanel />;
}
