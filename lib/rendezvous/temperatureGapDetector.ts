import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ============================================================
// 双方温度差検出 — Bilateral Temperature Gap Detector
//
// 設計根拠（Part 1 §3.7.2 + Part 2 §1.5）:
//   Rendezvousの勝ち筋は、片側ではなく関係エッジを見ること。
//   双方のCounselorが行動観測データに基づいて温度感を判定。
//   既存相談所の「本人→自分のカウンセラー→相手のカウンセラー」
//   の2回変換ロスを最小化する。
//
// 温度差が大きい場合:
//   - 温かい側: 相手のペースを尊重するよう促す
//   - 冷たい側: 無理に合わせなくてよいことを伝える
//   - 双方: Exchange Protocol で温度差を構造的に交換
//
// 観測シグナル:
//   - 返信速度の非対称性
//   - メッセージ長の非対称性
//   - 質問数の非対称性
//   - 主導権バランス
//   - 絵文字/感情表現の非対称性
// ============================================================

// ── 型定義 ──

export type TemperatureProfile = {
  userId: string;
  /** 行動ベースの温度スコア 0-10 */
  behaviorTemperature: number;
  /** 構成要素 */
  components: {
    replySpeed: number;       // 返信速度（0-10、速い=高い）
    messageLengthAvg: number; // 平均メッセージ長（0-10、長い=高い）
    questionFrequency: number; // 質問頻度（0-10、多い=高い）
    initiativeScore: number;  // 主導性（0-10、能動的=高い）
    emotionalExpression: number; // 感情表現（0-10、多い=高い）
  };
};

export type TemperatureGapResult = {
  /** 温度差が検出されたか（閾値: 2.0以上の差） */
  gapDetected: boolean;
  /** ユーザーAの温度プロファイル */
  profileA: TemperatureProfile;
  /** ユーザーBの温度プロファイル */
  profileB: TemperatureProfile;
  /** 温度差（A - B。正=Aが高い、負=Bが高い） */
  delta: number;
  /** 温度差の程度 */
  severity: "none" | "mild" | "significant" | "critical";
  /** Counselor向けの状況説明 */
  counselorNote: string;
  /** 温かい側のユーザーIDに向けたアドバイス */
  adviceForWarmerSide: string | null;
  /** 冷たい側のユーザーIDに向けたアドバイス */
  adviceForCoolerSide: string | null;
};

// ── 定数 ──

const GAP_THRESHOLD_MILD = 1.5;
const GAP_THRESHOLD_SIGNIFICANT = 2.5;
const GAP_THRESHOLD_CRITICAL = 4.0;

// ── 公開API ──

/**
 * 候補ペアの双方の行動データから温度差を検出する。
 */
export async function detectTemperatureGap(params: {
  candidateId: string;
  userAId: string;
  userBId: string;
}): Promise<TemperatureGapResult> {
  const { candidateId, userAId, userBId } = params;

  // 直近14日分のメッセージを取得
  const fourteenDaysAgo = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: messages } = await supabaseAdmin
    .from("rendezvous_messages")
    .select("sender_id, created_at, body")
    .eq("candidate_id", candidateId)
    .gte("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: true });

  const msgs = messages ?? [];

  const profileA = computeTemperatureProfile(msgs, userAId);
  const profileB = computeTemperatureProfile(msgs, userBId);

  const delta = profileA.behaviorTemperature - profileB.behaviorTemperature;
  const absDelta = Math.abs(delta);

  const severity: TemperatureGapResult["severity"] =
    absDelta >= GAP_THRESHOLD_CRITICAL ? "critical" :
    absDelta >= GAP_THRESHOLD_SIGNIFICANT ? "significant" :
    absDelta >= GAP_THRESHOLD_MILD ? "mild" :
    "none";

  const gapDetected = severity !== "none";

  const counselorNote = buildCounselorNote(severity, delta, profileA, profileB);
  const { adviceForWarmerSide, adviceForCoolerSide } = buildAdvice(severity, delta);

  return {
    gapDetected,
    profileA,
    profileB,
    delta,
    severity,
    counselorNote,
    adviceForWarmerSide,
    adviceForCoolerSide,
  };
}

// ── 温度プロファイル算出 ──

type Msg = { sender_id: string; created_at: string; body?: string | null };

function computeTemperatureProfile(
  allMessages: Msg[],
  userId: string,
): TemperatureProfile {
  const userMsgs = allMessages.filter((m) => m.sender_id === userId);
  const otherMsgs = allMessages.filter((m) => m.sender_id !== userId);

  // 1. 返信速度（相手のメッセージに対する返信速度）
  const replyTimes = computeReplyTimes(allMessages, userId);
  const avgReplyMin = replyTimes.length > 0
    ? replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length / 60
    : 60; // デフォルト60分
  // 速いほど高スコア: 5分以内=10, 2時間以上=1
  const replySpeed = Math.max(1, Math.min(10,
    10 - (avgReplyMin / 15),
  ));

  // 2. 平均メッセージ長
  const avgLength = userMsgs.length > 0
    ? userMsgs.reduce((s, m) => s + (m.body ?? "").length, 0) / userMsgs.length
    : 0;
  // 100文字以上=10, 10文字以下=2
  const messageLengthAvg = Math.max(1, Math.min(10,
    2 + (avgLength / 15),
  ));

  // 3. 質問頻度
  const questionCount = userMsgs.filter((m) => {
    const body = m.body ?? "";
    return body.includes("?") || body.includes("\uFF1F");
  }).length;
  const questionRatio = userMsgs.length > 0 ? questionCount / userMsgs.length : 0;
  const questionFrequency = Math.max(1, Math.min(10,
    1 + questionRatio * 25,
  ));

  // 4. 主導性（4h+ギャップ後の最初の発言者）
  const initiativeScore = computeInitiativeScore(allMessages, userId);

  // 5. 感情表現（絵文字＋感嘆符の密度）
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/gu;
  let emojiCount = 0;
  let exclamationCount = 0;
  for (const m of userMsgs) {
    const body = m.body ?? "";
    const emojis = body.match(emojiRegex);
    if (emojis) emojiCount += emojis.length;
    exclamationCount += (body.match(/[!！]/g) ?? []).length;
    emojiRegex.lastIndex = 0;
  }
  const expressionDensity = userMsgs.length > 0
    ? (emojiCount + exclamationCount) / userMsgs.length
    : 0;
  const emotionalExpression = Math.max(1, Math.min(10,
    1 + expressionDensity * 4,
  ));

  // 総合温度（重み付き平均）
  const behaviorTemperature = Math.round((
    replySpeed * 0.25 +
    messageLengthAvg * 0.20 +
    questionFrequency * 0.20 +
    initiativeScore * 0.20 +
    emotionalExpression * 0.15
  ) * 10) / 10;

  return {
    userId,
    behaviorTemperature,
    components: {
      replySpeed: Math.round(replySpeed * 10) / 10,
      messageLengthAvg: Math.round(messageLengthAvg * 10) / 10,
      questionFrequency: Math.round(questionFrequency * 10) / 10,
      initiativeScore: Math.round(initiativeScore * 10) / 10,
      emotionalExpression: Math.round(emotionalExpression * 10) / 10,
    },
  };
}

function computeReplyTimes(messages: Msg[], userId: string): number[] {
  const times: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].sender_id === userId && messages[i - 1].sender_id !== userId) {
      const diffSec = (
        new Date(messages[i].created_at).getTime() -
        new Date(messages[i - 1].created_at).getTime()
      ) / 1000;
      if (diffSec > 1 && diffSec < 86400) {
        times.push(diffSec);
      }
    }
  }
  return times;
}

function computeInitiativeScore(messages: Msg[], userId: string): number {
  if (messages.length === 0) return 5;

  const GAP_MS = 4 * 60 * 60 * 1000;
  let userInit = 0;
  let totalInit = 0;

  totalInit++;
  if (messages[0].sender_id === userId) userInit++;

  for (let i = 1; i < messages.length; i++) {
    const gap = new Date(messages[i].created_at).getTime() -
                new Date(messages[i - 1].created_at).getTime();
    if (gap >= GAP_MS) {
      totalInit++;
      if (messages[i].sender_id === userId) userInit++;
    }
  }

  if (totalInit === 0) return 5;
  // 50%=5, 100%=10, 0%=1
  return Math.max(1, Math.min(10, 1 + (userInit / totalInit) * 9));
}

// ── Counselor向けメッセージ生成 ──

function buildCounselorNote(
  severity: TemperatureGapResult["severity"],
  delta: number,
  profileA: TemperatureProfile,
  profileB: TemperatureProfile,
): string {
  if (severity === "none") {
    return "双方の関わり方に大きな温度差は見られません。バランスの取れた関係です。";
  }

  const warmer = delta > 0 ? "A" : "B";
  const warmerTemp = delta > 0 ? profileA.behaviorTemperature : profileB.behaviorTemperature;
  const coolerTemp = delta > 0 ? profileB.behaviorTemperature : profileA.behaviorTemperature;

  if (severity === "critical") {
    return `関わり方に大きな温度差が見られます（${warmer}側: ${warmerTemp}, 他方: ${coolerTemp}）。一方が積極的で、もう一方は距離を取っている可能性があります。このまま進むと双方にストレスが蓄積するリスクがあります。`;
  }
  if (severity === "significant") {
    return `温度差が出ています（${warmerTemp} vs ${coolerTemp}）。一方がやや積極的で、もう一方は慎重です。それぞれのペースを尊重しながら、自然な収束を観察する段階です。`;
  }
  return `わずかな温度差があります（${warmerTemp} vs ${coolerTemp}）。注視しますが、現時点では自然な範囲です。`;
}

function buildAdvice(
  severity: TemperatureGapResult["severity"],
  _delta: number,
): { adviceForWarmerSide: string | null; adviceForCoolerSide: string | null } {
  if (severity === "none") {
    return { adviceForWarmerSide: null, adviceForCoolerSide: null };
  }

  if (severity === "critical") {
    return {
      adviceForWarmerSide:
        "相手のペースに合わせることで、関係の持続性が高まります。あなたの気持ちは伝わっていますので、少しだけペースを落としてみましょう。",
      adviceForCoolerSide:
        "無理に合わせる必要はありません。あなたの心地よいペースが、この関係にとって一番大切です。",
    };
  }

  if (severity === "significant") {
    return {
      adviceForWarmerSide:
        "あなたの積極性は伝わっています。相手が追いつくための余白を残しておくと、自然な深化につながります。",
      adviceForCoolerSide:
        "自分のペースで大丈夫です。もし興味があれば、小さな返答から始めてみてください。",
    };
  }

  // mild
  return {
    adviceForWarmerSide: null,
    adviceForCoolerSide: null,
  };
}
