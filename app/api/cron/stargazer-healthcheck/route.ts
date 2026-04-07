/**
 * GET /api/cron/stargazer-healthcheck
 *
 * P3-6: Layer 1 構造監査 cron — scanAllAxes を実行し stargazer_health_reports に保存。
 * 日次 or 週次で Vercel Cron / 外部 scheduler から呼び出す。
 *
 * Auth: CRON_SECRET bearer token
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { QUESTIONS } from "@/lib/stargazer/questions";
import {
  CF_QUESTIONS,
  CF_BRANCH_POOL,
} from "@/lib/stargazer/cognitiveFitQuestions";
import { getCrossAxisRulePairs } from "@/lib/stargazer/contradictionDetector";
import {
  getInsightRuleAxes,
  getFallbackTextAxes,
} from "@/lib/stargazer/alterInsightCardBuilder";
import {
  scanAllAxes,
  summarizeHealth,
  type HealthCheckDataSources,
} from "@/lib/stargazer/axisHealthCheck";
import { AXIS_REGISTRY_VERSION } from "@/lib/stargazer/axisRegistry";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── DataSources 構築（scripts/axis-healthcheck.ts と同一ロジック） ──

function buildQuestionCountMap(): Map<TraitAxisKey, number> {
  const map = new Map<TraitAxisKey, number>();

  for (const q of QUESTIONS) {
    for (const axis of q.axes) {
      map.set(axis.key, (map.get(axis.key) ?? 0) + 1);
    }
  }

  for (const cfQ of [...CF_QUESTIONS, ...CF_BRANCH_POOL]) {
    const axesInQuestion = new Set<string>();
    for (const opt of cfQ.options) {
      for (const w of opt.weights) {
        axesInQuestion.add(w.axis);
      }
    }
    for (const axis of axesInQuestion) {
      map.set(axis as TraitAxisKey, (map.get(axis as TraitAxisKey) ?? 0) + 1);
    }
  }

  return map;
}

function buildDataSources(): HealthCheckDataSources {
  return {
    questionCountMap: buildQuestionCountMap(),
    contradictionAxes: getCrossAxisRulePairs(),
    insightRuleAxes: getInsightRuleAxes(),
    fallbackTextAxes: getFallbackTextAxes(),
  };
}

// ─── Route ────────────────────────────────────────────────

export async function GET(request: Request) {
  // Auth: CRON_SECRET
  if (
    request.headers.get("authorization") !==
    `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Layer 1 構造監査を実行
    const sources = buildDataSources();
    const reports = scanAllAxes(sources);
    const summary = summarizeHealth(reports);

    // period_key: UTC 日付 (YYYY-MM-DD)。同日再実行は UPSERT で上書き
    const periodKey = new Date().toISOString().slice(0, 10);
    const reportType = "layer1_structural";

    // DB に保存（service_role クライアント）
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const axesJson = reports.map((r) => ({
      axisId: r.axisId,
      domain: r.domain,
      tier: r.tier,
      status: r.status,
      statusReason: r.statusReason,
      structural: r.structural,
      coverage: r.coverage,
      ...(r.forwardTo ? { forwardTo: r.forwardTo } : {}),
      ...(r.frozenAt ? { frozenAt: r.frozenAt } : {}),
    }));

    // UPSERT: period_key + report_type が重複したら上書き
    const { error: upsertError } = await supabase
      .from("stargazer_health_reports")
      .upsert(
        {
          period_key: periodKey,
          report_type: reportType,
          summary,
          axes: axesJson,
          trigger_source: "cron",
          registry_version: AXIS_REGISTRY_VERSION,
        },
        { onConflict: "period_key,report_type" },
      );

    if (upsertError) {
      console.error("[healthcheck-cron] Upsert failed:", upsertError.message);
      return NextResponse.json(
        { error: "db_upsert_failed", detail: upsertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      periodKey,
      summary: {
        healthy: summary.healthy,
        weak: summary.weak,
        ghost: summary.ghost,
        frozen: summary.frozen,
        total: summary.total,
        structuralConnectionRate: summary.structuralConnectionRate,
        coverageByLayer: summary.coverageByLayer,
      },
    });
  } catch (err) {
    console.error("[healthcheck-cron] Error:", err);
    return NextResponse.json(
      { error: "internal", detail: String(err) },
      { status: 500 },
    );
  }
}
