import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runAI } from "@/lib/ai";

// ============================================================
// 接続後の深化ミッション (Feature F)
// マッチ成立後、日数に応じて段階的なミッションを提供
// テキスト → 推測 → 音声 → リアルの4段階
// ============================================================

export type DeepeningMissionType =
  | "open_question"    // Day 1-2: お互いにオープンな質問を1つ
  | "guess"            // Day 3-4: 相手について推測して伝える
  | "voice"            // Day 5-7: ボイスメッセージ交換
  | "shared_experience"// Day 8-10: 同じ体験をして感想共有
  | "deep_question"    // Day 11-13: 深い質問を交換
  | "meetup"           // Day 14: リアルで会う提案

export type DeepeningMission = {
  id: string;
  candidateId: string;
  dayNumber: number;
  missionType: DeepeningMissionType;
  payload: {
    title: string;
    description: string;
    prompt?: string;       // ミッション固有のプロンプト
    suggestion?: string;   // AI提案テキスト
  };
  completedByA: boolean;
  completedByB: boolean;
};

/** Day数 → ミッションタイプのマッピング */
const DAY_MISSION_MAP: { dayRange: [number, number]; type: DeepeningMissionType }[] = [
  { dayRange: [1, 2], type: "open_question" },
  { dayRange: [3, 4], type: "guess" },
  { dayRange: [5, 7], type: "voice" },
  { dayRange: [8, 10], type: "shared_experience" },
  { dayRange: [11, 13], type: "deep_question" },
  { dayRange: [14, 999], type: "meetup" },
];

function getMissionType(day: number): DeepeningMissionType {
  for (const entry of DAY_MISSION_MAP) {
    if (day >= entry.dayRange[0] && day <= entry.dayRange[1]) {
      return entry.type;
    }
  }
  return "open_question";
}

/** ミッションタイプ別のコンテンツ生成 */
const MISSION_TEMPLATES: Record<DeepeningMissionType, {
  title: string;
  description: string;
  prompts: string[];
}> = {
  open_question: {
    title: "最初の質問",
    description: "お互いに1つだけ質問してください。ただし「はい/いいえ」で答えられない質問に限ります。",
    prompts: [
      "今まで一番影響を受けた出来事は？",
      "子供の頃に夢中だったことで、今も自分の中に残っているものは？",
      "最近、誰にも言ってないけど嬉しかったことは？",
      "「自分らしい」と感じる瞬間ってどんなとき？",
      "一番大事にしている人間関係のルールは？",
    ],
  },
  guess: {
    title: "相手を推測する",
    description: "会話から感じたことを元に、相手について「たぶんこういう人だろうな」と思うことを1つ伝えてください。",
    prompts: [
      "この人は〇〇な場面で力を発揮するタイプだと思う",
      "この人は友達の中では〇〇な役割にいそう",
      "この人が疲れたときに最初にすることは〇〇だと思う",
    ],
  },
  voice: {
    title: "声を交換する",
    description: "60秒以内のボイスメッセージを送りあってください。テーマ：「最近一番笑ったこと」",
    prompts: [],
  },
  shared_experience: {
    title: "同じ体験をする",
    description: "今日中に同じことをして、感想を共有してください。",
    prompts: [
      "同じ曲を聴いて感想を送る",
      "同じ時間に空を見上げて写真を送る",
      "同じお題で30秒間絵を描いて見せ合う",
      "同じ質問「人生で一番美しかった瞬間は？」に答える",
    ],
  },
  deep_question: {
    title: "深い問い",
    description: "お互いに、普段は聞けないような深い質問をしてみてください。",
    prompts: [
      "「これだけは失いたくない」と思うものは何？",
      "自分の弱さで、実は好きな部分はある？",
      "10年後の自分に伝えたいことは？",
      "人に見せない「本当の自分」ってどんな人？",
    ],
  },
  meetup: {
    title: "会いましょう",
    description: "そろそろリアルで会ってみませんか？",
    prompts: [],
  },
};

function hashSeed(candidateId: string, day: number): number {
  const s = `${candidateId}:${day}`;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * 接続からの日数を計算し、該当するミッションを取得・作成
 */
export async function getDeepeningMission(params: {
  candidateId: string;
  connectionDate: string; // YYYY-MM-DD (接続成立日)
}): Promise<DeepeningMission | null> {
  const { candidateId, connectionDate } = params;

  // 日数計算
  const connDate = new Date(connectionDate);
  const today = new Date();
  const dayNumber = Math.max(1, Math.ceil((today.getTime() - connDate.getTime()) / (1000 * 60 * 60 * 24)));

  // 既存ミッション確認
  const { data: existing } = await supabaseAdmin
    .from("rendezvous_deepening_missions")
    .select("id, candidate_id, day_number, mission_type, payload, completed_by_a, completed_by_b")
    .eq("candidate_id", candidateId)
    .eq("day_number", dayNumber)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      candidateId: existing.candidate_id,
      dayNumber: existing.day_number,
      missionType: existing.mission_type as DeepeningMissionType,
      payload: existing.payload as DeepeningMission["payload"],
      completedByA: existing.completed_by_a,
      completedByB: existing.completed_by_b,
    };
  }

  // 新規ミッション作成
  const missionType = getMissionType(dayNumber);
  const template = MISSION_TEMPLATES[missionType];
  const prompt = template.prompts.length > 0
    ? template.prompts[hashSeed(candidateId, dayNumber) % template.prompts.length]
    : undefined;

  const payload = {
    title: template.title,
    description: template.description,
    prompt,
  };

  const { data: created, error } = await supabaseAdmin
    .from("rendezvous_deepening_missions")
    .insert({
      candidate_id: candidateId,
      day_number: dayNumber,
      mission_type: missionType,
      payload,
    })
    .select("id")
    .single();

  if (error) {
    // 競合 → 再取得
    const { data: retry } = await supabaseAdmin
      .from("rendezvous_deepening_missions")
      .select("id, candidate_id, day_number, mission_type, payload, completed_by_a, completed_by_b")
      .eq("candidate_id", candidateId)
      .eq("day_number", dayNumber)
      .single();
    if (!retry) return null;
    return {
      id: retry.id,
      candidateId: retry.candidate_id,
      dayNumber: retry.day_number,
      missionType: retry.mission_type as DeepeningMissionType,
      payload: retry.payload as DeepeningMission["payload"],
      completedByA: retry.completed_by_a,
      completedByB: retry.completed_by_b,
    };
  }

  return {
    id: created.id,
    candidateId,
    dayNumber,
    missionType,
    payload,
    completedByA: false,
    completedByB: false,
  };
}

/**
 * AI提案のミートアップ場所を生成
 */
export async function suggestMeetupPlace(params: {
  userTraits?: string[];
  partnerTraits?: string[];
  area?: string;
}): Promise<string> {
  try {
    const result = await runAI({
      taskType: "rendezvous_meetup_suggestion",
      prompt: `2人が初めてリアルで会う場所を提案してください。
${params.area ? `エリア: ${params.area}` : ""}
カジュアルで、会話しやすく、長居しやすい場所がいいです。
1つだけ、具体的な種類の場所（例：「静かなカフェ」「美術館のカフェスペース」）を20文字以内で。`,
      systemPrompt: "あなたはデートプランナーです。場所の種類を1つだけ簡潔に提案してください。",
      temperature: 0.8,
      maxOutputTokens: 100,
      preferredProvider: "gemini",
    });
    return result.text.trim().slice(0, 50) || "静かなカフェ";
  } catch {
    return "静かなカフェ";
  }
}
