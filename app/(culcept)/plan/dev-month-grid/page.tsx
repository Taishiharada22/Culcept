/**
 * dev-month-grid — MonthGridView 単独 preview（Plan 月ビュー M3-b 視覚検証用 / dev 専用）
 *
 * 目的: CalendarTab を経由せず MonthGridView を sample data で描画し、月 grid の
 *   見た目・dot・選択・月送りを確認する（別ブランチの CalendarTab スタック問題と無関係）。
 *
 * gate: /plan と同じ planRouteLive（本番 default false → notFound）。
 * 非接触: DB / API / VLM / 実ユーザーデータ なし（sample のみ）。auth 不要。
 * 検証後の扱い: 検証用 dev tool。keep / remove は CEO 判断。
 */
import { notFound } from "next/navigation";

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

import { DevMonthGridClient } from "./DevMonthGridClient";

export const dynamic = "force-dynamic";

export default function DevMonthGridPage() {
  if (!PLAN_FLAGS.planRouteLive) {
    notFound();
  }
  return <DevMonthGridClient />;
}
