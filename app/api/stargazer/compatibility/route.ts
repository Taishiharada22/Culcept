import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

interface ContextScore {
  overallScore: number;
  subElements: { label: string; score: number; description?: string }[];
  reasons: string[];
  style: string;
}

interface CompatibilityResult {
  romance: ContextScore;
  work: ContextScore;
  friends: ContextScore;
}

/**
 * GET /api/stargazer/compatibility
 * ユーザーの人格次元から相性傾向を算出する。
 * ?target=<userId> で特定ユーザーとのペア相性も算出可能。
 */
export async function GET(request: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const targetId = url.searchParams.get("target");

    // star_maps から live_sky.dimensions を取得
    const { data: starMap } = await supabase
      .from("stargazer_star_maps")
      .select("live_sky")
      .eq("user_id", user.id)
      .single();

    const liveSky = (starMap?.live_sky ?? {}) as { dimensions?: Record<string, number> };
    const dimMap: Record<string, number> = liveSky.dimensions ?? {};

    if (Object.keys(dimMap).length === 0) {
      return NextResponse.json({
        ok: true,
        compatibility: null,
        message: "観測データが不足しています",
      });
    }

    let result: CompatibilityResult;

    if (targetId) {
      // ターゲットユーザーとのペア相性
      const { data: targetStarMap } = await supabase
        .from("stargazer_star_maps")
        .select("live_sky")
        .eq("user_id", targetId)
        .single();

      const targetLiveSky = (targetStarMap?.live_sky ?? {}) as { dimensions?: Record<string, number> };
      const targetMap = targetLiveSky.dimensions ?? {};

      if (Object.keys(targetMap).length === 0) {
        return NextResponse.json({
          ok: true,
          compatibility: null,
          message: "相手の観測データが不足しています",
        });
      }

      result = computePairCompatibility(dimMap, targetMap);
    } else {
      // 自己プロフィールベースの相性傾向
      result = computeSelfCompatibilityProfile(dimMap);
    }

    return NextResponse.json({ ok: true, compatibility: result });
  } catch (error) {
    console.error("Compatibility computation failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** 自分の次元データから、各文脈での関係性スタイルを導出 */
function computeSelfCompatibilityProfile(
  dims: Record<string, number>
): CompatibilityResult {
  // Stargazer 45軸 → 5次元に集約（軸がない場合はフォールバック）
  const norm = (key: string, fb = 0.5) => {
    const v = dims[key];
    return v !== undefined ? (v + 1) / 2 : fb; // -1~1 → 0~1
  };

  const empathic = (norm("emotional_openness") + norm("reassurance_need") + norm("intimacy_pace")) / 3;
  const analytical = (norm("abstract_structuring") + norm("perfectionist_vs_pragmatic")) / 2;
  const collaborative = (norm("independence_vs_harmony", 0.5) + norm("social_initiative")) / 2;
  const expressive = (norm("expressive_vs_reserved") + norm("cautious_vs_bold")) / 2;
  const expansive = (norm("change_embrace_vs_resist") + norm("stimulation_need")) / 2;

  return {
    romance: {
      overallScore: Math.round(
        ((empathic * 0.35 + expressive * 0.3 + collaborative * 0.2 + (1 - analytical) * 0.15) * 100)
      ),
      subElements: [
        {
          label: "共感力",
          score: Math.round(empathic * 100),
          description: "相手の感情を感じ取る力",
        },
        {
          label: "表現力",
          score: Math.round(expressive * 100),
          description: "気持ちを伝える自然さ",
        },
        {
          label: "柔軟性",
          score: Math.round(collaborative * 100),
          description: "相手に合わせる適応力",
        },
        {
          label: "直感性",
          score: Math.round((1 - analytical) * 100),
          description: "理屈より感覚で動ける度合い",
        },
      ],
      reasons: buildRomanceReasons(empathic, expressive, collaborative, analytical),
      style: buildRomanceStyle(empathic, expressive, analytical),
    },
    work: {
      overallScore: Math.round(
        ((analytical * 0.3 + collaborative * 0.25 + expansive * 0.25 + expressive * 0.2) * 100)
      ),
      subElements: [
        {
          label: "分析力",
          score: Math.round(analytical * 100),
          description: "論理的に物事を整理する力",
        },
        {
          label: "協調性",
          score: Math.round(collaborative * 100),
          description: "チームで動く適性",
        },
        {
          label: "発展力",
          score: Math.round(expansive * 100),
          description: "新しい視点を取り入れる力",
        },
        {
          label: "発信力",
          score: Math.round(expressive * 100),
          description: "意見を適切に伝える力",
        },
      ],
      reasons: buildWorkReasons(analytical, collaborative, expansive),
      style: buildWorkStyle(analytical, collaborative, expansive),
    },
    friends: {
      overallScore: Math.round(
        ((collaborative * 0.3 + empathic * 0.25 + expansive * 0.25 + expressive * 0.2) * 100)
      ),
      subElements: [
        {
          label: "受容力",
          score: Math.round(collaborative * 100),
          description: "他者を受け入れる懐の深さ",
        },
        {
          label: "共感力",
          score: Math.round(empathic * 100),
          description: "友人の気持ちに寄り添う力",
        },
        {
          label: "好奇心",
          score: Math.round(expansive * 100),
          description: "新しい体験を共有する意欲",
        },
        {
          label: "自己開示",
          score: Math.round(expressive * 100),
          description: "自分を自然にさらける度合い",
        },
      ],
      reasons: buildFriendsReasons(collaborative, empathic, expansive),
      style: buildFriendsStyle(collaborative, empathic),
    },
  };
}

/** 二人の次元データからペア相性を算出 */
function computePairCompatibility(
  self: Record<string, number>,
  target: Record<string, number>
): CompatibilityResult {
  const allKeys = new Set([...Object.keys(self), ...Object.keys(target)]);
  let totalSim = 0;
  let totalComp = 0;
  let count = 0;

  for (const key of allKeys) {
    const s = self[key] ?? 0.5;
    const t = target[key] ?? 0.5;
    const similarity = 1 - Math.abs(s - t);
    const complementarity = Math.abs(s - t) > 0.3 ? 0.8 : 0.4;
    totalSim += similarity;
    totalComp += complementarity;
    count++;
  }

  const avgSim = count > 0 ? totalSim / count : 0.5;
  const avgComp = count > 0 ? totalComp / count : 0.5;

  const romanceScore = Math.round((avgSim * 0.6 + avgComp * 0.4) * 100);
  const workScore = Math.round((avgSim * 0.5 + avgComp * 0.5) * 100);
  const friendsScore = Math.round((avgSim * 0.7 + avgComp * 0.3) * 100);

  return {
    romance: {
      overallScore: romanceScore,
      subElements: [
        { label: "類似性", score: Math.round(avgSim * 100) },
        { label: "補完性", score: Math.round(avgComp * 100) },
      ],
      reasons: ["ペア相性は観測データの蓄積により精度が向上します"],
      style: "相互理解を深めることで関係が発展するタイプ",
    },
    work: {
      overallScore: workScore,
      subElements: [
        { label: "思考の近さ", score: Math.round(avgSim * 100) },
        { label: "役割の補完", score: Math.round(avgComp * 100) },
      ],
      reasons: ["協働の相性は実際のやり取りを通じて精度が高まります"],
      style: "お互いの強みを活かした協力関係が築ける可能性",
    },
    friends: {
      overallScore: friendsScore,
      subElements: [
        { label: "価値観の近さ", score: Math.round(avgSim * 100) },
        { label: "新鮮さ", score: Math.round(avgComp * 100) },
      ],
      reasons: ["自然体でいられる関係性が期待できます"],
      style: "気を遣わずに過ごせる心地よい距離感",
    },
  };
}

// ── ヘルパー: 文脈別の所見生成 ──

function buildRomanceReasons(emp: number, exp: number, col: number, ana: number): string[] {
  const reasons: string[] = [];
  if (emp > 0.5) reasons.push("相手の感情に敏感で、言葉にならない気持ちも察する傾向があります");
  else reasons.push("感情よりも事実や行動で愛情を示す傾向があります");
  if (exp > 0.4) reasons.push("自分の気持ちを自然に表現でき、関係に透明性をもたらします");
  if (col > 0.5) reasons.push("相手のペースに合わせることが得意で、安定した関係を築けます");
  if (ana > 0.6) reasons.push("関係を客観的に分析する傾向があり、感情的な衝突を避けやすい反面、感情表現が不足しがちです");
  return reasons.slice(0, 3);
}

function buildWorkReasons(ana: number, col: number, exp: number): string[] {
  const reasons: string[] = [];
  if (ana > 0.5) reasons.push("論理的な分析力があり、複雑な課題を整理する力があります");
  if (col > 0.5) reasons.push("チームでの協調性が高く、他者の意見を取り入れながら進められます");
  else reasons.push("独立して深く考える力があり、個人の専門性を活かした貢献が得意です");
  if (exp > 0.5) reasons.push("新しいアイデアを受け入れる柔軟性があり、変化に適応しやすい傾向です");
  return reasons.slice(0, 3);
}

function buildFriendsReasons(col: number, emp: number, exp: number): string[] {
  const reasons: string[] = [];
  if (col > 0.5) reasons.push("幅広い人と自然に打ち解けることができ、グループの中で安定した存在になります");
  if (emp > 0.4) reasons.push("友人の悩みや喜びに寄り添い、深い信頼関係を築く力があります");
  if (exp > 0.5) reasons.push("新しい体験を共有することを楽しみ、友人関係に刺激をもたらします");
  if (reasons.length === 0) reasons.push("少数の深い関係を大切にする傾向があります");
  return reasons.slice(0, 3);
}

function buildRomanceStyle(emp: number, exp: number, ana: number): string {
  if (emp > 0.6 && exp > 0.4) return "感受性豊かで、感情を自然に共有できる深い絆を求めるタイプ";
  if (ana > 0.6) return "理性的で安定した関係を好み、言葉より行動で信頼を示すタイプ";
  if (exp > 0.5) return "自分の世界観を分かち合える、知的な共鳴を大切にするタイプ";
  return "穏やかで安心感のある関係を自然に築いていくタイプ";
}

function buildWorkStyle(ana: number, col: number, exp: number): string {
  if (ana > 0.6 && col > 0.5) return "分析力とチームワークを両立し、全体最適を考えられるタイプ";
  if (ana > 0.6) return "深い専門性と論理的思考で、本質的な課題解決に貢献するタイプ";
  if (col > 0.6) return "チームの調和を保ちながら、着実に成果を積み上げるタイプ";
  return "独自の視点を持ちつつ、必要に応じて協力できる柔軟なタイプ";
}

function buildFriendsStyle(col: number, emp: number): string {
  if (col > 0.6 && emp > 0.5) return "誰とでも自然に打ち解け、友人の気持ちに寄り添える温かいタイプ";
  if (col > 0.6) return "社交的で、グループの中での調和を大切にするタイプ";
  if (emp > 0.5) return "少数の友人と深い絆を育み、お互いの成長を支え合うタイプ";
  return "独立性を保ちながらも、信頼できる人とは深く繋がるタイプ";
}
