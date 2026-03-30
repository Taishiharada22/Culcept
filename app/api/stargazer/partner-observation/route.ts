import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { selectPartnerQuestions } from "@/lib/stargazer/partnerQuestionSelector";
import { aggregateContextProfiles } from "@/lib/stargazer/contextProfileAggregator";
import { getContextProfile } from "@/lib/stargazer/contextProfileAggregator";
import { analyzeObservationSession } from "@/lib/stargazer/observationAnalysis";
import { deriveIdealPartner, toIdealPartnerRow } from "@/lib/stargazer/deriveIdealPartner";
import type { PartnerCategory } from "@/lib/stargazer/partnerTypes";

// =============================================================================
// GET /api/stargazer/partner-observation?category=friend&context=friends
// 相手別の動的質問取得（回答済み除外 + 不足軸優先）
//
// POST /api/stargazer/partner-observation
// 回答保存 → stargazer_axis_snapshots + context profiles 再集計
// =============================================================================

const CATEGORY_TO_CONTEXT: Record<string, string> = {
  friend: "friends",
  romantic: "romantic_partner",
  spouse: "spouse",
  family: "family",
  colleague: "coworkers",
};

export async function GET(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const category = (url.searchParams.get("category") ?? "friend") as PartnerCategory;
    const context = url.searchParams.get("context") ?? CATEGORY_TO_CONTEXT[category] ?? "friends";
    const count = Math.min(12, parseInt(url.searchParams.get("count") ?? "8", 10));

    const questions = await selectPartnerQuestions({
      userId: auth.user.id,
      partnerCategory: category,
      partnerContext: context,
      count,
    });

    return NextResponse.json({
      ok: true,
      questions: questions.map((q: { source: string; question: { id: string; theme?: string; prompt: string; options: { id: string; text: string }[]; followUp?: { triggeredBy: string; prompt: string; options: { id: string; text: string }[] }[] } }) => ({
        source: q.source,
        id: q.question.id,
        theme: q.question.theme,
        prompt: q.question.prompt,
        options: q.question.options.map((o: { id: string; text: string }) => ({
          id: o.id,
          text: o.text,
        })),
        followUp: q.question.followUp?.map((f: { triggeredBy: string; prompt: string; options: { id: string; text: string }[] }) => ({
          triggeredBy: f.triggeredBy,
          prompt: f.prompt,
          options: f.options.map((o: { id: string; text: string }) => ({ id: o.id, text: o.text })),
        })),
      })),
    });
  } catch (err) {
    console.error("[partner-observation GET] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { context, answers } = body as {
      context: string; // 'friends' | 'romantic_partner' | 'spouse' | 'coworkers' | 'family'
      answers: {
        questionId: string;
        optionId: string;
        prompt?: string; // 質問プロンプトテキスト（重複検出用）
        axisMappings: { key: string; weight: number }[];
      }[];
    };

    if (!context || !answers?.length) {
      return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
    }

    const userId = auth.user.id;
    const today = new Date().toISOString().slice(0, 10);

    // 各回答を保存
    // 質問のプロンプトテキストをquestion_keyとして使う（AI生成IDは毎回変わるため）
    for (const answer of answers) {
      // axisMappings を解決: 固定質問はそのまま、AI生成質問はプロンプトから推論
      const mappings = (answer.axisMappings && answer.axisMappings.length > 0)
        ? answer.axisMappings
        : inferAxisMappingsFromPrompt(answer.prompt, answer.optionId);

      if (mappings.length > 0) {
        for (const mapping of mappings) {
          const { error: insertErr } = await supabaseAdmin.from("stargazer_axis_snapshots").insert({
            user_id: userId,
            axis_id: mapping.key,
            score: mapping.weight,
            context,
            observation_layer: "context_bound",
            session_date: today,
          });
          if (insertErr) {
            console.error("[partner-observation] snapshot insert failed:", insertErr.message);
          }
        }
      }

      // 回答済み記録（質問プロンプトテキストをキーに使用して重複防止）
      // questionId にプロンプトテキストを含む場合はそれをキーに
      const questionKey = answer.questionId;
      try {
        await supabaseAdmin.from("stargazer_question_shown").upsert(
          {
            user_id: userId,
            question_key: questionKey,
            shown_at: today,
            answered: true,
          },
          { onConflict: "user_id,question_key,shown_at", ignoreDuplicates: false },
        );
      } catch {
        // テーブル未作成時は無視
      }

      // 質問プロンプトも別途保存（重複検出用）
      if (answer.prompt) {
        try {
          await supabaseAdmin.from("stargazer_question_shown").upsert(
            {
              user_id: userId,
              question_key: `prompt:${answer.prompt.slice(0, 100)}`,
              shown_at: today,
              answered: true,
            },
            { onConflict: "user_id,question_key,shown_at", ignoreDuplicates: false },
          );
        } catch {
          // ignore
        }
      }
    }

    // context profiles を再集計
    await aggregateContextProfiles(userId);

    // 相手観測 → 理想の相手プロファイルを再導出（全カテゴリ）
    // 相手を観測するほど、ユーザーの好みの解像度が上がる
    const selfProfile = await getContextProfile(userId, "self");
    if (selfProfile && Object.keys(selfProfile).length >= 5) {
      const categories = ["romantic", "friendship", "cocreation", "community", "partner"] as const;
      const rows = categories.map((cat) => {
        const derived = deriveIdealPartner(selfProfile as Record<string, number>, cat as any);
        return toIdealPartnerRow(userId, cat as any, derived);
      });
      supabaseAdmin
        .from("rendezvous_ideal_partner_profiles")
        .upsert(rows, { onConflict: "user_id,category" })
        .then(({ error }) => {
          if (error) console.warn("[partner-observation] ideal partner sync failed:", error);
          else console.log("[partner-observation] Ideal partner profiles synced from partner observation");
        });
    }

    // 観測分析を非同期発火（レスポンスはブロックしない）
    // student track の学習データとして ai_runs + teacher_outputs に記録される
    const postProfile = await getContextProfile(userId, context);
    if (postProfile && answers.length >= 3) {
      analyzeObservationSession({
        context,
        answers: answers.map((a) => ({
          prompt: a.prompt ?? "",
          selectedOptionId: a.optionId,
          inferredAxes: (a.axisMappings ?? []).map((m: { key: string; weight: number }) => ({
            key: m.key,
            weight: m.weight,
          })),
        })),
        preProfile: {}, // pre は集計前のデータが必要だが、fire-and-forget では簡略化
        postProfile: postProfile as Partial<Record<string, number>>,
        profileDelta: [], // delta は export 時にフルで計算される
        cumulativeObservationCount: answers.length,
      }).catch((err) => {
        console.warn("[partner-observation] observation analysis failed (non-blocking):", err);
      });
    }

    return NextResponse.json({ ok: true, answersRecorded: answers.length });
  } catch (err) {
    console.error("[partner-observation POST] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AI生成質問の axisMappings 推論
// プロンプト内のキーワードから関連する軸を推定し、
// 選択肢のインデックスからスコアの方向を決定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type InferredMapping = { key: string; weight: number };

/** キーワード → 軸のマッピング（拡充版） */
const KEYWORD_AXIS_MAP: [RegExp, string, number][] = [
  // [パターン, 軸ID, デフォルトweight]
  [/距離|近い|遠い|パーソナルスペース|親密|近づ/, "intimacy_pace", 0.2],
  [/本音|正直|嘘|建前|率直|素直|正面/, "public_private_gap", 0.2],
  [/怒り|怒る|イライラ|衝突|ぶつか|喧嘩|対立|不満/, "direct_vs_diplomatic", 0.2],
  [/甘え|頼る|頼り|依存|助け|支え|弱さ|弱み/, "independence_vs_harmony", 0.2],
  [/沈黙|黙る|静か|話さない|言わない|無口|一人/, "introvert_vs_extrovert", 0.15],
  [/変化|変わ|成長|進化|変容|違う自分/, "change_embrace_vs_resist", 0.15],
  [/信頼|信じ|裏切|安心|安全|不安|心配/, "emotional_regulation", 0.2],
  [/エネルギー|疲れ|元気|活力|消耗|気力/, "emotional_variability", 0.15],
  [/境界|線引|断る|NO|拒否|限界|嫌/, "boundary_awareness", 0.2],
  [/未来|将来|夢|目標|ビジョン|展望/, "cautious_vs_bold", 0.15],
  [/気を使|空気|察す|配慮|気遣|周り|雰囲気/, "social_initiative", 0.15],
  [/一人|独り|孤独|ソロ|自分だけ|離れ/, "stress_isolation_vs_social", 0.2],
  [/完璧|こだわ|妥協|適当|ちゃんと|きちんと/, "perfectionist_vs_pragmatic", 0.15],
  [/感情|気持ち|泣|悲し|嬉し|喜び|涙/, "emotional_variability", 0.2],
  [/計画|予定|決め|spontaneous|即興|自由|流れ/, "plan_vs_spontaneous", 0.15],
  [/表現|伝え|言葉|コミュニ|話す|語る/, "function_vs_expression", 0.15],
  [/批判|否定|ダメ|評価|ジャッジ|指摘|失敗/, "rejection_response_maturity", 0.2],
  // 追加パターン: AI生成質問でよく出るテーマ
  [/緊張|リラックス|自然体|力が抜|ほっと/, "emotional_regulation", 0.15],
  [/我慢|耐え|抑え|飲み込|堪え/, "direct_vs_diplomatic", 0.15],
  [/合わせ|譲|折れ|妥協|相手優先/, "independence_vs_harmony", 0.15],
  [/見せ|隠|仮面|演じ|キャラ|振る舞/, "public_private_gap", 0.2],
  [/比較|劣等|優越|競|上下|負け/, "rejection_response_maturity", 0.15],
  [/期待|応え|プレッシャー|重荷|責任/, "reassurance_need", 0.2],
  [/時間|ペース|テンポ|急|ゆっくり|待/, "intimacy_pace", 0.15],
  [/価値観|大切|優先|譲れない|こだわり/, "cautious_vs_bold", 0.15],
];

function inferAxisMappingsFromPrompt(
  prompt: string | undefined,
  optionId: string | undefined,
): InferredMapping[] {
  if (!prompt) return [];

  const matched: InferredMapping[] = [];

  const seenAxes = new Set<string>();
  for (const [pattern, axisKey, baseWeight] of KEYWORD_AXIS_MAP) {
    if (pattern.test(prompt) && !seenAxes.has(axisKey)) {
      seenAxes.add(axisKey);
      // optionId からスコアの方向を推定
      // 選択肢のIDパターン: opt_0, opt_1, ... (0=左極寄り, 高番号=右極寄り)
      // または a, b, c, d (a=最初の選択肢)
      const direction = estimateDirection(optionId);
      matched.push({ key: axisKey, weight: baseWeight * direction });
    }
  }

  // 最大3軸まで（過剰推定を防ぐ）
  if (matched.length > 0) return matched.slice(0, 3);

  // キーワードに一致しなかった場合のフォールバック:
  // データが全く入らないことを防ぐため汎用軸にデフォルトマッピング
  const direction = estimateDirection(optionId);
  return [{ key: "introvert_vs_extrovert", weight: 0.1 * direction }];
}

/** 選択肢IDからスコアの方向を推定 (-1〜+1) */
function estimateDirection(optionId: string | undefined): number {
  if (!optionId) return 0;

  // 数値ベースのID (opt_0, opt_1, opt_2, opt_3)
  const numMatch = optionId.match(/(\d+)$/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10);
    // 0→-0.6, 1→-0.2, 2→+0.2, 3→+0.6 (4択想定)
    return (idx - 1.5) * 0.4;
  }

  // 文字ベースのID (a, b, c, d)
  const letterMatch = optionId.match(/([a-d])$/i);
  if (letterMatch) {
    const idx = letterMatch[1].toLowerCase().charCodeAt(0) - 97; // a=0, b=1, c=2, d=3
    return (idx - 1.5) * 0.4;
  }

  // 不明な場合は中立的な小さい値
  return 0.1;
}
