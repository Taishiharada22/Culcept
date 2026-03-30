import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  generateDailyChallenge,
  submitUserPrediction,
  revealResults,
  generateInsightFromGap,
  type DailyChallenge,
} from "@/lib/stargazer/selfVsOracle";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { ContradictionMap } from "@/lib/stargazer/contradictionEngine";
import type { ArchetypeCode } from "@/lib/stargazer/archetypeTypes";
import { buildOracleTrace } from "@/lib/stargazer/reasonTrace";
import type { ReasonTrace } from "@/lib/stargazer/reasonTrace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB テーブル構造（マイグレーション未実行、インメモリ代替）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// self_vs_oracle_challenges:
//   id            text primary key
//   user_id       uuid references auth.users(id)
//   challenge_date date not null
//   scenarios     jsonb not null  -- ChallengeScenario[]
//   status        text not null default 'pending'
//   created_at    timestamptz default now()
//   unique(user_id, challenge_date)
//
// self_vs_oracle_history:
//   id             serial primary key
//   user_id        uuid references auth.users(id)
//   challenge_id   text references self_vs_oracle_challenges(id)
//   challenge_date date not null
//   user_correct   int not null default 0
//   oracle_correct int not null default 0
//   total          int not null default 0
//   created_at     timestamptz default now()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// インメモリストア（DB接続前の仮実装）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const challengeStore = new Map<string, DailyChallenge>();

function storeKey(userId: string, date: string): string {
  return `${userId}_${date}`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET: 今日のチャレンジを取得（なければ生成）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function GET() {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = todayString();
    const key = storeKey(user.id, today);

    // インメモリから取得
    let challenge = challengeStore.get(key);

    if (!challenge) {
      // ユーザーの軸スコアとプロフィールを取得（データがない場合も許容）
      const [
        { data: resolvedTypeRow },
        { data: profileRow },
      ] = await Promise.all([
        supabase
          .from("stargazer_resolved_types")
          .select("axis_scores, archetype_code")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("stargazer_profiles")
          .select("contradiction_map")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const axisScores: Partial<Record<TraitAxisKey, number>> =
        resolvedTypeRow?.axis_scores ?? {};
      const contradictionMap: ContradictionMap =
        profileRow?.contradiction_map ?? {};
      const archetypeCode: ArchetypeCode | undefined =
        resolvedTypeRow?.archetype_code ?? undefined;

      // 新規チャレンジ生成
      challenge = generateDailyChallenge(
        user.id,
        axisScores,
        contradictionMap,
        archetypeCode,
      );

      // DB に保存（ベストエフォート）
      try {
        await supabase.from("stargazer_self_vs_oracle_challenges").upsert({
          user_id: user.id,
          challenge_date: today,
          scenarios: challenge.scenarios,
          status: challenge.status,
        }, { onConflict: "user_id,challenge_date" });
      } catch {
        // テーブル未作成時は黙って無視
      }

      // インメモリにもキャッシュ
      challengeStore.set(key, challenge);
    }

    // クライアントが期待する形式で返す（Oracle 予測は verified 時のみ）
    return NextResponse.json(buildClientResponse(challenge));
  } catch (err) {
    console.error("[self-vs-oracle] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST: ユーザー予測の送信 or 結果の検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body as { action: string };

    const today = todayString();
    const key = storeKey(user.id, today);
    const challenge = challengeStore.get(key);

    if (!challenge) {
      return NextResponse.json(
        { error: "今日のチャレンジがまだ生成されていません。先にGETを呼んでください。" },
        { status: 404 },
      );
    }

    // ── predict: ユーザーの予測を送信 ──
    if (action === "predict") {
      // クライアントは Record<scenarioId, "A"|"B"> で送る
      const { predictions } = body as {
        predictions: Record<string, "A" | "B"> | { scenarioId: string; optionId: string }[];
      };

      if (!predictions || (typeof predictions === "object" && Object.keys(predictions).length === 0)) {
        return NextResponse.json(
          { error: "predictions は必須です" },
          { status: 400 },
        );
      }

      if (challenge.status !== "pending") {
        return NextResponse.json(
          { error: "このチャレンジにはすでに予測が送信されています" },
          { status: 400 },
        );
      }

      // Record<string, "A"|"B"> 形式を { scenarioId, optionId }[] に変換
      const normalizedPredictions = Array.isArray(predictions)
        ? predictions
        : clientChoicesToPredictions(challenge, predictions as Choices);

      const updated = submitUserPrediction(challenge, normalizedPredictions);
      challengeStore.set(key, updated);

      // DB に保存（ベストエフォート）
      try {
        await supabase.from("stargazer_self_vs_oracle_challenges").update({
          scenarios: updated.scenarios,
          status: updated.status,
          user_predictions: normalizedPredictions,
        }).eq("user_id", user.id).eq("challenge_date", today);
      } catch { /* best-effort */ }

      return NextResponse.json(buildClientResponse(updated));
    }

    // ── verify: 実際の結果を記録 ──
    if (action === "verify") {
      // クライアントは Record<scenarioId, "A"|"B"> で送る
      const { actuals } = body as {
        actuals: Record<string, "A" | "B"> | { scenarioId: string; optionId: string }[];
      };

      if (!actuals || (typeof actuals === "object" && Object.keys(actuals).length === 0)) {
        return NextResponse.json(
          { error: "actuals は必須です" },
          { status: 400 },
        );
      }

      if (challenge.status === "pending") {
        return NextResponse.json(
          { error: "先にユーザーの予測を送信してください" },
          { status: 400 },
        );
      }

      // Record<string, "A"|"B"> 形式を { scenarioId, optionId }[] に変換
      const normalizedActuals = Array.isArray(actuals)
        ? actuals
        : clientChoicesToPredictions(challenge, actuals as Choices);

      const updated = revealResults(challenge, normalizedActuals);
      challengeStore.set(key, updated);

      // DB に保存（ベストエフォート）
      try {
        const userCorrect = updated.scenarios.filter((s) => s.userCorrect).length;
        const oracleCorrect = updated.scenarios.filter((s) => s.oracleCorrect).length;
        await supabase.from("stargazer_self_vs_oracle_challenges").update({
          scenarios: updated.scenarios,
          status: updated.status,
          actual_outcomes: normalizedActuals,
          oracle_correct_count: oracleCorrect,
          user_correct_count: userCorrect,
        }).eq("user_id", user.id).eq("challenge_date", today);
      } catch { /* best-effort */ }

      // Gap Insight + Reason Trace を生成
      let insights: ReturnType<typeof generateInsightFromGap> = [];
      const reasonTraces: Record<string, ReasonTrace> = {};
      try {
        const { data: resolvedTypeRow } = await supabase
          .from("stargazer_resolved_types")
          .select("axis_scores")
          .eq("user_id", user.id)
          .maybeSingle();

        const { data: profileRow } = await supabase
          .from("stargazer_profiles")
          .select("contradiction_map")
          .eq("user_id", user.id)
          .maybeSingle();

        insights = generateInsightFromGap(
          updated,
          resolvedTypeRow?.axis_scores ?? {},
          profileRow?.contradiction_map ?? {},
        );

        // シナリオごとに Reason Trace を生成
        for (const s of updated.scenarios) {
          reasonTraces[s.id] = buildOracleTrace(
            s,
            resolvedTypeRow?.axis_scores ?? {},
            profileRow?.contradiction_map ?? undefined,
          );
        }
      } catch {
        // Insight 生成失敗は致命的でない
      }

      // クライアント形式 + Oracle 予測 + サマリーを返す
      const clientResponse = buildClientResponse(updated);
      return NextResponse.json({
        ...clientResponse,
        summary: {
          userCorrect: updated.scenarios.filter((s) => s.userCorrect).length,
          oracleCorrect: updated.scenarios.filter((s) => s.oracleCorrect).length,
          total: updated.scenarios.length,
          winner:
            updated.scenarios.filter((s) => s.userCorrect).length >=
            updated.scenarios.filter((s) => s.oracleCorrect).length
              ? "user"
              : "oracle",
        },
        insights,
        reasonTraces: Object.keys(reasonTraces).length > 0 ? reasonTraces : undefined,
      });
    }

    return NextResponse.json(
      { error: `不明なアクション: ${action}。'predict' または 'verify' を指定してください。` },
      { status: 400 },
    );
  } catch (err) {
    console.error("[self-vs-oracle] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ユーティリティ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type ClientScenario = {
  id: string;
  category: string;
  situation: string;
  optionA: string;
  optionB: string;
};
type ClientChallenge = {
  id: string;
  scenarios: ClientScenario[];
  status: string;
};
type Choices = Record<string, "A" | "B">;

/**
 * DailyChallenge をクライアントが期待する形式に変換する。
 * scenarios.options[] (配列) → optionA / optionB (フラット) にマッピング。
 */
function buildClientChallenge(challenge: DailyChallenge): ClientChallenge {
  return {
    id: challenge.id,
    scenarios: challenge.scenarios.map((s) => ({
      id: s.id,
      category: s.category,
      situation: s.situation,
      optionA: s.options?.[0]?.label ?? "A",
      optionB: s.options?.[1]?.label ?? "B",
    })),
    status: challenge.status,
  };
}

/**
 * verified/revealed 状態の challenge から Oracle の予測を
 * クライアント形式 (Record<scenarioId, "A"|"B">) に変換する。
 */
function buildOracleChoices(challenge: DailyChallenge): Choices {
  const choices: Choices = {};
  for (const s of challenge.scenarios) {
    if (s.oraclePrediction && s.options?.length >= 2) {
      const idx = s.options.findIndex((o) => o.id === s.oraclePrediction);
      choices[s.id] = idx === 1 ? "B" : "A";
    }
  }
  return choices;
}

/**
 * クライアントの "A"/"B" 形式の予測を API の { scenarioId, optionId }[] に変換する。
 */
function clientChoicesToPredictions(
  challenge: DailyChallenge,
  choices: Choices,
): { scenarioId: string; optionId: string }[] {
  return Object.entries(choices).map(([scenarioId, choice]) => {
    const scenario = challenge.scenarios.find((s) => s.id === scenarioId);
    const optionIdx = choice === "B" ? 1 : 0;
    const optionId = scenario?.options?.[optionIdx]?.id ?? `opt_0_${optionIdx}`;
    return { scenarioId, optionId };
  });
}

/**
 * クライアント向けレスポンスを構築する。
 * Oracle の予測は verified/revealed 状態のみ含める。
 */
function buildClientResponse(challenge: DailyChallenge): {
  challenge: ClientChallenge;
  oraclePredictions?: Choices;
} {
  const isRevealed =
    challenge.status === "verified" || challenge.status === "revealed";
  return {
    challenge: buildClientChallenge(challenge),
    oraclePredictions: isRevealed ? buildOracleChoices(challenge) : undefined,
  };
}
