#!/usr/bin/env npx tsx
/**
 * Home Alter 最終応答テキスト品質監査
 *
 * 実行: npx tsx scripts/homeAlterResponseAudit.ts
 *
 * LLM（Gemini）を実際に呼び、全パイプラインを通した
 * 最終応答テキストの品質を 8軸 で評価する。
 *
 * 出力: scripts/audit-results/home-alter-response-audit-{timestamp}.json
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ━━━━ alterHomeAdapter imports ━━━━
import {
  analyzeQueryContext,
  extractRelationalLens,
  selectResponseModeWithReason,
  enrichRelationalLens,
  extractInputUnderstanding,
  buildJudgmentFramework,
  buildJudgmentSkeleton,
  buildDomainOverlay,
  buildRelationalContext,
  buildHomeAlterPromptWithContext,
  classifyQuestion,
  parseDecisionMetadata,
  reconcileDecisionMetadata,
  computeFallbackDecisionMetadata,
  validateResponseQuality,
  sanitizeTraitInversions,
  computeGenericResponseScore,
  buildAuditTrail,
  formatHomeAlterResponse,
  // Daily Guidance
  extractDailyGuidanceFrame,
  checkDailyGuidanceClarify,
  buildDailyGuidanceSkeleton,
  buildDailyGuidancePromptBlock,
  validateDailyGuidanceResponse,
  type ResponseMode,
  type ActionShape,
  type ConfidenceLevel,
  type RelationalLens,
  type QueryContext,
  type JudgmentSkeleton,
  type InputUnderstanding,
  type DecisionMetadata,
  type DailyGuidanceSkeleton,
  type DailyGuidanceFrame,
  type DailyGuidanceMode,
} from "../lib/stargazer/alterHomeAdapter";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Config
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL_DEFAULT || "gemini-2.5-flash";
const CONCURRENCY = 3; // 同時実行数
const RETRY_MAX = 2;
const STABILITY_CASES = 20;
const STABILITY_RUNS = 3;

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY が設定されていません (.env.local を確認)");
  process.exit(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini API wrapper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.6,
  maxTokens = 2048,
): Promise<{ text: string; latencyMs: number }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };

  const start = Date.now();
  let lastError = "";
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${await res.text()}`;
        if (res.status === 429) {
          await sleep(5000 * (attempt + 1)); // rate limit backoff
          continue;
        }
        throw new Error(lastError);
      }

      const result = await res.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return { text, latencyMs: Date.now() - start };
    } catch (e: any) {
      lastError = e.message;
      if (attempt < RETRY_MAX) await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(`Gemini call failed after ${RETRY_MAX + 1} attempts: ${lastError}`);
}

async function callGeminiJson<T>(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.2,
): Promise<T> {
  // Retry up to 2 times for JSON parse failures
  for (let attempt = 0; attempt <= 1; attempt++) {
    const { text } = await callGemini(systemPrompt, userPrompt, temperature, 2048);
    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      if (attempt < 1) { await sleep(1000); continue; }
      throw new Error(`JSON parse failed: ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(jsonMatch[0].replace(/```json\s*/, "").replace(/```/, ""));
    } catch {
      // Try extracting just the object part
      const objMatch = text.match(/\{[^{}]*("directness"|"specificity")[^{}]*\}/);
      if (objMatch) return JSON.parse(objMatch[0]);
      if (attempt < 1) { await sleep(1000); continue; }
      throw new Error(`JSON parse failed: ${text.slice(0, 200)}`);
    }
  }
  throw new Error("callGeminiJson exhausted retries");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Personalities
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CAUTIOUS_PERSONALITY = {
  archetypeName: "慎重な探索者",
  archetypeDescription: "石橋を叩いて渡る。でも渡らないことも多い。",
  coreWoundShort: "見捨てられ不安",
  axisScores: {
    decision_tempo: 0.3, social_initiative: 0.7, intimacy_pace: 0.2,
    attachment_style: 0.4, reassurance_need: 0.7, emotional_variability: 0.6,
    boundary_awareness: 0.3, locus_of_control: 0.6, growth_mindset: 0.7,
    rumination_tendency: 0.7, cautious_vs_bold: 0.3,
    independence_vs_harmony: 0.6, change_embrace_vs_resist: 0.5,
  },
} as any;

const BOLD_PERSONALITY = {
  archetypeName: "衝動的な挑戦者",
  archetypeDescription: "考える前に動く。後悔は後から来る。",
  coreWoundShort: "自分には価値がない不安",
  axisScores: {
    decision_tempo: 0.8, social_initiative: 0.9, intimacy_pace: 0.7,
    attachment_style: 0.6, reassurance_need: 0.3, emotional_variability: 0.8,
    boundary_awareness: 0.7, locus_of_control: 0.8, growth_mindset: 0.9,
    rumination_tendency: 0.2, cautious_vs_bold: 0.8,
    independence_vs_harmony: 0.3, change_embrace_vs_resist: 0.8,
  },
} as any;

const REGRET_AVERSE_PERSONALITY = {
  archetypeName: "安全志向の分析者",
  archetypeDescription: "失敗を極度に恐れ、データを集めてから動く。",
  coreWoundShort: "失敗への恐怖",
  axisScores: {
    decision_tempo: 0.2, social_initiative: 0.4, intimacy_pace: 0.3,
    attachment_style: 0.3, reassurance_need: 0.8, emotional_variability: 0.3,
    boundary_awareness: 0.4, locus_of_control: 0.4, growth_mindset: 0.5,
    rumination_tendency: 0.9, cautious_vs_bold: 0.2,
    independence_vs_harmony: 0.5, change_embrace_vs_resist: 0.3,
  },
} as any;

const HARMONY_PERSONALITY = {
  archetypeName: "共感的な調停者",
  archetypeDescription: "人の気持ちを優先する。自分の意見を後回しにしがち。",
  coreWoundShort: "嫌われることへの恐怖",
  axisScores: {
    decision_tempo: 0.5, social_initiative: 0.6, intimacy_pace: 0.5,
    attachment_style: 0.7, reassurance_need: 0.6, emotional_variability: 0.5,
    boundary_awareness: 0.2, locus_of_control: 0.5, growth_mindset: 0.6,
    rumination_tendency: 0.6, cautious_vs_bold: 0.4,
    independence_vs_harmony: 0.8, change_embrace_vs_resist: 0.5,
  },
} as any;

const PERSONALITIES = {
  cautious: CAUTIOUS_PERSONALITY,
  bold: BOLD_PERSONALITY,
  regret_averse: REGRET_AVERSE_PERSONALITY,
  harmony: HARMONY_PERSONALITY,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 120+ Audit Cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AuditCase {
  id: string;
  input: string;
  category: "romance" | "partner" | "work" | "friend" | "family" | "self" | "daily" | "daily_guidance";
  expectedMode: ResponseMode;
  personality?: keyof typeof PERSONALITIES;
  /** For comparison cases */
  comparisonGroup?: string;
  notes?: string;
}

const MAIN_CASES: AuditCase[] = [
  // ── Romance (14件) ──
  { id: "R01", input: "好きな人に告白すべきか。フラれたら気まずい", category: "romance", expectedMode: "conclude" },
  { id: "R02", input: "マッチングアプリの相手に会うべき？2週間やりとりしてる", category: "romance", expectedMode: "conclude" },
  { id: "R03", input: "デートの場所、レストランかカフェか。初デート", category: "romance", expectedMode: "conclude" },
  { id: "R04", input: "気になる人のSNSを毎日チェックしてしまう。やめるべき？", category: "romance", expectedMode: "conclude" },
  { id: "R05", input: "告白のタイミングが分からない。卒業まであと1ヶ月", category: "romance", expectedMode: "conclude" },
  { id: "R06", input: "好きな人に彼女がいるかもしれない。確認すべき？", category: "romance", expectedMode: "conclude" },
  { id: "R07", input: "告白するべき？", category: "romance", expectedMode: "clarify" },
  { id: "R08", input: "元カノから連絡が来た。返すべき？", category: "romance", expectedMode: "conclude" },
  { id: "R09", input: "元カレの友達から「まだ好きらしい」と聞いた", category: "romance", expectedMode: "conclude" },
  { id: "R10", input: "3回目のデートで告白は早い？", category: "romance", expectedMode: "conclude" },
  { id: "R11", input: "好きな人がいるけど、相手は自分のことどう思ってるか分からない", category: "romance", expectedMode: "conclude" },
  { id: "R12", input: "連絡頻度を増やしたいけどしつこいと思われたくない", category: "romance", expectedMode: "conclude" },
  { id: "R13", input: "片想いの相手に誕生日プレゼントを渡すべき？", category: "romance", expectedMode: "conclude" },
  { id: "R14", input: "好きな人と共通の友達に相談すべきか", category: "romance", expectedMode: "conclude" },

  // ── Partner (14件) ──
  { id: "P01", input: "彼女に結婚の話を切り出すタイミングが分からない", category: "partner", expectedMode: "conclude" },
  { id: "P02", input: "彼氏と別れるべきか迷ってる。好きだけど未来が見えない", category: "partner", expectedMode: "conclude" },
  { id: "P03", input: "彼女が最近冷たいんだけど、こっちから何かすべき？", category: "partner", expectedMode: "conclude" },
  { id: "P04", input: "彼女と大喧嘩した。別れ話が出てる", category: "partner", expectedMode: "conclude" },
  { id: "P05", input: "彼氏の友達が苦手。正直に言うべき？", category: "partner", expectedMode: "conclude" },
  { id: "P06", input: "パートナーの金銭感覚が合わない。話し合うべき？", category: "partner", expectedMode: "conclude" },
  { id: "P07", input: "同棲を提案するべきか。付き合って1年", category: "partner", expectedMode: "conclude" },
  { id: "P08", input: "彼女の友達に嫌われてる気がする。気にすべき？", category: "partner", expectedMode: "conclude" },
  { id: "P09", input: "パートナーが転職したいと言ってる。応援すべきか止めるべきか", category: "partner", expectedMode: "conclude" },
  { id: "P10", input: "結婚前に同棲すべき？相手は反対してる", category: "partner", expectedMode: "conclude" },
  { id: "P11", input: "彼女が元カレとまだ連絡してる。嫌だけど言えない", category: "partner", expectedMode: "conclude" },
  { id: "P12", input: "遠距離恋愛が辛い。会える頻度を増やすか話すべき？", category: "partner", expectedMode: "conclude" },
  { id: "P13", input: "彼氏に「疲れた」って言ったら「俺のせい？」って言われた", category: "partner", expectedMode: "conclude" },
  { id: "P14", input: "もう少し距離を置いた方がいいかな", category: "partner", expectedMode: "clarify" },

  // ── Work (16件) ──
  { id: "W01", input: "上司に謝るべき？昨日ミスを指摘されて放置してしまった", category: "work", expectedMode: "conclude" },
  { id: "W02", input: "上司から無茶な仕事を振られた。断るべき？", category: "work", expectedMode: "conclude" },
  { id: "W03", input: "上司にキレそうになった。もう限界", category: "work", expectedMode: "conclude" },
  { id: "W04", input: "同僚に仕事のやり方を注意すべきかな", category: "work", expectedMode: "conclude" },
  { id: "W05", input: "後輩が同じミスを繰り返す。強めに言うべき？", category: "work", expectedMode: "conclude" },
  { id: "W06", input: "クライアントの無理な要望を断りたい", category: "work", expectedMode: "conclude" },
  { id: "W07", input: "先輩が最近冷たい。距離を取るべき？", category: "work", expectedMode: "conclude" },
  { id: "W08", input: "転職するか迷っている。今の会社に3年いる", category: "work", expectedMode: "conclude" },
  { id: "W09", input: "退職届、上司に直接渡すかメールか", category: "work", expectedMode: "conclude" },
  { id: "W10", input: "同僚がパワハラされてる。助けるべきか巻き込まれたくないか", category: "work", expectedMode: "conclude" },
  { id: "W11", input: "同僚が陰口を言ってるのを聞いた。本人に伝えるべき？", category: "work", expectedMode: "conclude" },
  { id: "W12", input: "上司と二人で飲みに誘われた。行くべき？", category: "work", expectedMode: "conclude" },
  { id: "W13", input: "取引先の担当者が約束を守らない。エスカレーションすべき？", category: "work", expectedMode: "conclude" },
  { id: "W14", input: "今から上司に電話するべき？さっきのメール失礼だった", category: "work", expectedMode: "conclude" },
  { id: "W15", input: "副業を始めるべきかな。時間はあるけど体力が心配", category: "work", expectedMode: "conclude" },
  { id: "W16", input: "起業したい気持ちがある。リスクが怖い", category: "work", expectedMode: "conclude" },

  // ── Friend (12件) ──
  { id: "F01", input: "友達に貸したお金を返してって言いづらい", category: "friend", expectedMode: "conclude" },
  { id: "F02", input: "親友と喧嘩した。こっちから連絡すべき？", category: "friend", expectedMode: "conclude" },
  { id: "F03", input: "友達のSNSに嫉妬してしまう。距離を置くべき？", category: "friend", expectedMode: "conclude" },
  { id: "F04", input: "3年間音信不通の友人から突然連絡が来た", category: "friend", expectedMode: "conclude" },
  { id: "F05", input: "友達の結婚式のスピーチを頼まれた。断りたいけど断れない", category: "friend", expectedMode: "conclude" },
  { id: "F06", input: "友達の恋愛相談に疲れた。距離を置きたいけど言えない", category: "friend", expectedMode: "conclude" },
  { id: "F07", input: "友達に「最近変わった」と言われた。悩む", category: "friend", expectedMode: "conclude" },
  { id: "F08", input: "友人グループの中で自分だけ呼ばれてない飲み会がある", category: "friend", expectedMode: "conclude" },
  { id: "F09", input: "SNSで知らない人にDMされた。返すべき？", category: "friend", expectedMode: "conclude" },
  { id: "F10", input: "連絡すべきかな", category: "friend", expectedMode: "clarify" },
  { id: "F11", input: "謝った方がいい？", category: "friend", expectedMode: "clarify" },
  { id: "F12", input: "友達に嘘をついてしまった。正直に言うべきか", category: "friend", expectedMode: "conclude" },

  // ── Family (12件) ──
  { id: "FA01", input: "母親に引っ越しの話を切り出せない", category: "family", expectedMode: "conclude" },
  { id: "FA02", input: "父親の干渉がストレス。はっきり言うべき？", category: "family", expectedMode: "conclude" },
  { id: "FA03", input: "兄弟と相続の話をしないといけない。どう切り出す？", category: "family", expectedMode: "conclude" },
  { id: "FA04", input: "親に「好きにしていい」と言われた。本心？", category: "family", expectedMode: "conclude" },
  { id: "FA05", input: "親に勘当されかけてる", category: "family", expectedMode: "conclude" },
  { id: "FA06", input: "親の介護と仕事を両立できる気がしない", category: "family", expectedMode: "conclude" },
  { id: "FA07", input: "実家に帰りたくない。でも親が心配してる", category: "family", expectedMode: "conclude" },
  { id: "FA08", input: "母親に彼女のことを紹介するタイミングが分からない", category: "family", expectedMode: "conclude" },
  { id: "FA09", input: "父親に謝りたいけど、何年も話してない", category: "family", expectedMode: "conclude" },
  { id: "FA10", input: "親戚の集まりに行きたくない。でも祖母が楽しみにしてる", category: "family", expectedMode: "conclude" },
  { id: "FA11", input: "姉が金を無心してくる。断るべきか", category: "family", expectedMode: "conclude" },
  { id: "FA12", input: "親に進路を反対されてる", category: "family", expectedMode: "conclude" },

  // ── Self (18件) ──
  { id: "S01", input: "資格の勉強を始めるか。でも続くか不安", category: "self", expectedMode: "conclude" },
  { id: "S02", input: "今の仕事にやりがいを感じない。でも安定してる", category: "self", expectedMode: "conclude" },
  { id: "S03", input: "ジムに行くべきか。3ヶ月続いてないけど", category: "self", expectedMode: "conclude" },
  { id: "S04", input: "SNSの時間を減らすべき？1日3時間見てる", category: "self", expectedMode: "conclude" },
  { id: "S05", input: "貯金100万あるけど投資に回すべき？", category: "self", expectedMode: "conclude" },
  { id: "S06", input: "引っ越しするか迷ってる。今の家は安いけど狭い", category: "self", expectedMode: "conclude" },
  { id: "S07", input: "最近何もやる気が出ない。休むべき？", category: "self", expectedMode: "conclude" },
  { id: "S08", input: "完璧主義をやめたい。でもどうしたらいいか分からない", category: "self", expectedMode: "conclude" },
  { id: "S09", input: "過去の失敗をずっと引きずってしまう", category: "self", expectedMode: "conclude" },
  { id: "S10", input: "自分に自信が持てない。何をしても不安", category: "self", expectedMode: "conclude" },
  { id: "S11", input: "退職届を明日出すべきか", category: "self", expectedMode: "conclude" },
  { id: "S12", input: "犬を飼い始めるか本気で迷ってる", category: "self", expectedMode: "conclude" },
  { id: "S13", input: "明日のプレゼンが不安。準備は一応した", category: "self", expectedMode: "conclude" },
  { id: "S14", input: "今日有給取るべき？体調は微妙だけど忙しい時期", category: "self", expectedMode: "conclude" },
  { id: "S15", input: "新しい趣味を始めたいけど何がいいか分からない", category: "self", expectedMode: "conclude" },
  { id: "S16", input: "生きてる意味がわからなくなる時がある", category: "self", expectedMode: "conclude" },
  { id: "S17", input: "何をしても他人と比べてしまう", category: "self", expectedMode: "conclude" },
  { id: "S18", input: "周りに合わせすぎて自分がない", category: "self", expectedMode: "conclude" },

  // ── Daily (14件) ──
  { id: "D01", input: "明日の面接、スーツとオフィスカジュアルどっちがいい？IT企業", category: "daily", expectedMode: "conclude" },
  { id: "D02", input: "今日何を着て行くか決められない", category: "daily", expectedMode: "conclude" },
  { id: "D03", input: "昼ご飯、コンビニと外食どっちがいい？", category: "daily", expectedMode: "conclude" },
  { id: "D04", input: "髪切ろうか迷ってる", category: "daily", expectedMode: "conclude" },
  { id: "D05", input: "映画館で見るかNetflixで待つか", category: "daily", expectedMode: "conclude" },
  { id: "D06", input: "明日の飲み会、体調悪いけど行くべき？", category: "daily", expectedMode: "conclude" },
  { id: "D07", input: "今夜の合コン行くか迷ってる。体調普通", category: "daily", expectedMode: "conclude" },
  { id: "D08", input: "今日中に返事しないといけない。引き受けるべき？", category: "daily", expectedMode: "conclude" },
  { id: "D09", input: "引っ越し先、駅近で狭い部屋か駅遠で広い部屋か", category: "daily", expectedMode: "conclude" },
  { id: "D10", input: "車を買うべきか。田舎だから必要だけど維持費が心配", category: "daily", expectedMode: "conclude" },
  { id: "D11", input: "ペットを飼うべきか。一人暮らしで寂しいから", category: "daily", expectedMode: "conclude" },
  { id: "D12", input: "どうしよう", category: "daily", expectedMode: "branch" },
  { id: "D13", input: "迷ってる", category: "daily", expectedMode: "conclude" },
  { id: "D14", input: "疲れた", category: "daily", expectedMode: "conclude" },

  // ── Short/Edge (6件) ──
  { id: "E01", input: "もう無理かも", category: "self", expectedMode: "conclude" },
  { id: "E02", input: "やめたい", category: "daily", expectedMode: "branch" },
  { id: "E03", input: "どう思う？", category: "daily", expectedMode: "conclude" },
  { id: "E04", input: "行くべき？", category: "daily", expectedMode: "conclude" },
  { id: "E05", input: "断った方がいいかな", category: "daily", expectedMode: "clarify" },
  { id: "E06", input: "相談したいことがある", category: "daily", expectedMode: "clarify" },

  // ── Clarify followup (6件) ──
  { id: "CF01", input: "上司です。仕事でミスして放置してしまった", category: "work", expectedMode: "conclude" },
  { id: "CF02", input: "友達に。3ヶ月連絡してない", category: "friend", expectedMode: "conclude" },
  { id: "CF03", input: "彼氏です。喧嘩して3日経った", category: "partner", expectedMode: "conclude" },
  { id: "CF04", input: "先輩に。仕事の相談がある", category: "work", expectedMode: "conclude" },
  { id: "CF05", input: "仕事をやめるかどうか。もう2年悩んでる", category: "self", expectedMode: "conclude" },
  { id: "CF06", input: "母親に。進路のことで揉めてる", category: "family", expectedMode: "conclude" },
];

// ── Comparison: Role diff (同一質問, role変更) ──
const ROLE_COMPARISON_BASE = "久しぶりに連絡したいけど、気まずくて迷ってる";
const ROLE_DIFF_CASES: AuditCase[] = [
  { id: "CR01", input: `上司に${ROLE_COMPARISON_BASE}`, category: "work", expectedMode: "conclude", comparisonGroup: "role_reconnect" },
  { id: "CR02", input: `友達に${ROLE_COMPARISON_BASE}`, category: "friend", expectedMode: "conclude", comparisonGroup: "role_reconnect" },
  { id: "CR03", input: `元カノに${ROLE_COMPARISON_BASE}`, category: "romance", expectedMode: "conclude", comparisonGroup: "role_reconnect" },
  { id: "CR04", input: `母親に${ROLE_COMPARISON_BASE}`, category: "family", expectedMode: "conclude", comparisonGroup: "role_reconnect" },
  { id: "CR05", input: `彼女に${ROLE_COMPARISON_BASE}`, category: "partner", expectedMode: "conclude", comparisonGroup: "role_reconnect" },
];

// ── Comparison: Purpose diff (同一相手, purpose変更) ──
const PURPOSE_DIFF_CASES: AuditCase[] = [
  { id: "CP01", input: "上司に謝りたい。ミスを指摘されたのに放置してしまった", category: "work", expectedMode: "conclude", comparisonGroup: "purpose_boss" },
  { id: "CP02", input: "上司に相談したい。キャリアの方向性について", category: "work", expectedMode: "conclude", comparisonGroup: "purpose_boss" },
  { id: "CP03", input: "上司に「それは違います」と伝えるべきか", category: "work", expectedMode: "conclude", comparisonGroup: "purpose_boss" },
  { id: "CP04", input: "上司に退職を伝えないといけない", category: "work", expectedMode: "conclude", comparisonGroup: "purpose_boss" },
  { id: "CP05", input: "上司ともっと仲良くなりたい", category: "work", expectedMode: "conclude", comparisonGroup: "purpose_boss" },
];

// ── Comparison: Situation diff (同一質問, 状況変更) ──
const SITUATION_DIFF_CASES: AuditCase[] = [
  { id: "CS01", input: "上司に謝るべき？今すぐ電話した方がいい", category: "work", expectedMode: "conclude", comparisonGroup: "situation_urgency", notes: "urgent" },
  { id: "CS02", input: "上司に謝るべき？来週の面談で言おうか迷ってる", category: "work", expectedMode: "conclude", comparisonGroup: "situation_urgency", notes: "not_urgent" },
  { id: "CS03", input: "退職届を出すべきか。もう限界。今日出したい", category: "work", expectedMode: "conclude", comparisonGroup: "situation_emotion", notes: "high_emotion" },
  { id: "CS04", input: "退職を考えてる。まだ決めてないけど情報を集めたい", category: "work", expectedMode: "conclude", comparisonGroup: "situation_emotion", notes: "low_emotion" },
  { id: "CS05", input: "友達に言い過ぎた。でもまだ取り返せると思う", category: "friend", expectedMode: "conclude", comparisonGroup: "situation_reversible", notes: "reversible" },
  { id: "CS06", input: "友達に決定的なことを言ってしまった。もう戻れない気がする", category: "friend", expectedMode: "conclude", comparisonGroup: "situation_reversible", notes: "irreversible" },
];

// ── Comparison: User diff (同一質問, 性格変更) ──
const USER_DIFF_BASE = "友達に貸したお金を返してって言いづらい";
const USER_DIFF_CASES: AuditCase[] = [
  { id: "CU01", input: USER_DIFF_BASE, category: "friend", expectedMode: "conclude", personality: "cautious", comparisonGroup: "user_money" },
  { id: "CU02", input: USER_DIFF_BASE, category: "friend", expectedMode: "conclude", personality: "bold", comparisonGroup: "user_money" },
  { id: "CU03", input: USER_DIFF_BASE, category: "friend", expectedMode: "conclude", personality: "regret_averse", comparisonGroup: "user_money" },
  { id: "CU04", input: USER_DIFF_BASE, category: "friend", expectedMode: "conclude", personality: "harmony", comparisonGroup: "user_money" },
];

// ── Daily Guidance (22件) ──
const DAILY_GUIDANCE_CASES: AuditCase[] = [
  // Energy-based
  { id: "DG01", input: "今日何したらいい？", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG02", input: "疲れた。何しよう", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG03", input: "やる気ないけど何かしたい", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG04", input: "元気だから何かやりたい", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG05", input: "だるい。何していいか分からない", category: "daily_guidance", expectedMode: "conclude" },
  // Time-based
  { id: "DG06", input: "今日一日フリーなんだけど何しよう", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG07", input: "午後から暇。何する？", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG08", input: "ちょっとだけ時間ある。何かできる？", category: "daily_guidance", expectedMode: "conclude" },
  // Desire-based
  { id: "DG09", input: "タスクを片付けたいけど何から始めれば", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG10", input: "のんびりしたいけど何しよう", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG11", input: "誰かに会いたいな", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG12", input: "何か新しいことしたい", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG13", input: "運動したいけど何がいい？", category: "daily_guidance", expectedMode: "conclude" },
  // Constraint-based
  { id: "DG14", input: "会議あるけど今日どう過ごそう", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG15", input: "休みだけどやることない", category: "daily_guidance", expectedMode: "conclude" },
  // Edge/Vague
  { id: "DG16", input: "暇", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG17", input: "何もしたくない", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG18", input: "動けないけど何かしないと", category: "daily_guidance", expectedMode: "conclude" },
  { id: "DG19", input: "今日一日どう過ごすか", category: "daily_guidance", expectedMode: "conclude" },
  // Personality-varied
  { id: "DG20", input: "今日何しよう", category: "daily_guidance", expectedMode: "conclude", personality: "bold" },
  { id: "DG21", input: "今日何しよう", category: "daily_guidance", expectedMode: "conclude", personality: "cautious" },
  { id: "DG22", input: "今日何しよう", category: "daily_guidance", expectedMode: "conclude", personality: "harmony" },
];

// ── Correction cases (訂正性テスト) ──
const CORRECTION_CASES = [
  {
    id: "COR01",
    initial: "連絡すべきかな",
    clarifyExpected: true,
    correction: "上司です。仕事でミスして放置してしまった",
    expectedRoleAfter: "boss",
    expectedPurposeAfter: "apologize",
  },
  {
    id: "COR02",
    initial: "謝った方がいい？",
    clarifyExpected: true,
    correction: "彼女にです。昨日約束を忘れてた",
    expectedRoleAfter: "partner",
    expectedPurposeAfter: "apologize",
  },
  {
    id: "COR03",
    initial: "告白するべき？",
    clarifyExpected: true,
    correction: "バイト先の先輩で、もうすぐ辞める",
    expectedRoleAfter: "senior",
    expectedPurposeAfter: "confess",
  },
  {
    id: "COR04",
    initial: "上司に謝るべき",
    clarifyExpected: false,
    correction: "いや、上司じゃなくて先輩です。しかも謝るというより相談したい",
    expectedRoleAfter: "senior",
    expectedPurposeAfter: "help",
  },
];

const ALL_CASES: AuditCase[] = [
  ...MAIN_CASES,
  ...ROLE_DIFF_CASES,
  ...PURPOSE_DIFF_CASES,
  ...SITUATION_DIFF_CASES,
  ...USER_DIFF_CASES,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Full Pipeline Execution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PipelineResult {
  caseId: string;
  input: string;
  category: string;
  // Layer 1-2
  queryContext: QueryContext;
  lens: RelationalLens;
  inputUnderstanding: InputUnderstanding;
  skeleton: JudgmentSkeleton;
  mode: ResponseMode;
  modeReason: string;
  // LLM output
  rawResponse: string;
  finalResponse: string;
  latencyMs: number;
  // Metadata
  decisionMeta: DecisionMetadata | null;
  reconciled: boolean;
  fallbackUsed: boolean;
  retryUsed: boolean;
  // Quality
  genericScore: number;
  validationFailures: string[];
  qualityPass: boolean;
  // Personality used
  personalityName: string;
}

async function runFullPipeline(
  tc: AuditCase,
  personalityOverride?: any,
): Promise<PipelineResult> {
  const personality = personalityOverride ?? PERSONALITIES[tc.personality ?? "cautious"];
  const personalityName = tc.personality ?? "cautious";
  const msg = tc.input;

  // Layer 1: Input Understanding
  const queryContext = analyzeQueryContext(msg);
  const lens = extractRelationalLens(msg);
  const modeDecision = selectResponseModeWithReason(queryContext, lens);
  const inputUnderstanding = extractInputUnderstanding(msg, queryContext, lens);

  // Layer 2: Judgment Skeleton
  const framework = buildJudgmentFramework(personality, null, msg);
  const skeleton = buildJudgmentSkeleton(framework, queryContext, lens, inputUnderstanding, modeDecision.mode);

  // Layer 3: Prompt Construction
  const questionCategory = classifyQuestion(msg);
  const overlay = buildDomainOverlay(personality, queryContext.domain);

  const systemPrompt = buildHomeAlterPromptWithContext(
    personality, null, questionCategory, msg,
    modeDecision.mode, queryContext, overlay, "テスト太郎", lens, skeleton,
  );

  const userPrompt = `ユーザーの質問: 「${msg}」\n\n1行目から結論。挨拶・前置き不要。根拠は「この人について今日わかっていること」から引用すること。`;

  // Layer 3: LLM Call
  const temperature = modeDecision.mode === "clarify" ? 0.3 : 0.6;
  const maxTokens = modeDecision.mode === "clarify" ? 512 : modeDecision.mode === "branch" ? 3072 : 2048;

  const { text: rawResponse, latencyMs } = await callGemini(systemPrompt, userPrompt, temperature, maxTokens);

  // Parse metadata
  const { responseText: stripped, metadata: parsedMeta } = parseDecisionMetadata(rawResponse);
  let finalResponse = formatHomeAlterResponse(stripped, "テスト太郎");
  let decisionMeta = parsedMeta;
  let fallbackUsed = false;
  let reconciled = false;

  if (modeDecision.mode !== "clarify") {
    const fallbackMeta = computeFallbackDecisionMetadata(framework);
    if (decisionMeta) {
      // 構造データは事前計算値で上書き
      decisionMeta.force_balance = fallbackMeta.force_balance;
      decisionMeta.opportunity_value = fallbackMeta.opportunity_value;
      decisionMeta.cost_load = fallbackMeta.cost_load;
      decisionMeta.relation_value = fallbackMeta.relation_value;
    } else {
      decisionMeta = fallbackMeta;
      fallbackUsed = true;
    }

    // action_shape は skeleton 確定値を正とする（LLM の self-reported shape を破棄）
    const llmShape = decisionMeta.action_shape;
    decisionMeta.action_shape = skeleton.action_shape;
    if (llmShape !== skeleton.action_shape) {
      console.info(`  [shape-override] LLM=${llmShape} → skeleton=${skeleton.action_shape}`);
    }

    // Reconcile（本文との整合チェック）
    const before = decisionMeta.action_shape;
    decisionMeta = reconcileDecisionMetadata(finalResponse, decisionMeta);
    reconciled = decisionMeta.action_shape !== before;

    // reconcile 後も skeleton の shape を再適用
    if (decisionMeta.action_shape !== skeleton.action_shape) {
      console.info(`  [shape-re-enforce] reconcile changed ${decisionMeta.action_shape} → re-applying skeleton=${skeleton.action_shape}`);
      decisionMeta.action_shape = skeleton.action_shape;
      const SHAPE_STANCE: Record<string, string> = {
        full_go: "go", bounded_go: "go", prepare_then_go: "wait",
        observe_first: "wait", defer_with_trigger: "no", skip: "no",
      };
      decisionMeta.decision_stance = (SHAPE_STANCE[skeleton.action_shape] ?? "wait") as typeof decisionMeta.decision_stance;
      reconciled = true;
    }
  }

  // Quality check
  let genericScore = 0;
  let validationFailures: string[] = [];
  let qualityPass = true;
  if (modeDecision.mode !== "clarify" && decisionMeta) {
    // 性格反転フレーズを先に修正してから品質検証
    const sanitized = sanitizeTraitInversions(finalResponse, personality);
    if (sanitized.corrections.length > 0) {
      console.info(`  [trait-sanitize] ${sanitized.corrections.length} corrections: ${sanitized.corrections.join("; ")}`);
      finalResponse = sanitized.text;
    }
    const qc = validateResponseQuality(finalResponse, decisionMeta, skeleton, lens, inputUnderstanding, personality);
    genericScore = qc.generic_response_score;
    validationFailures = qc.failures;
    qualityPass = qc.pass;
  }

  return {
    caseId: tc.id,
    input: msg,
    category: tc.category,
    queryContext,
    lens,
    inputUnderstanding,
    skeleton,
    mode: modeDecision.mode,
    modeReason: modeDecision.reason,
    rawResponse,
    finalResponse,
    latencyMs,
    decisionMeta,
    reconciled,
    fallbackUsed,
    retryUsed: false,
    genericScore,
    validationFailures,
    qualityPass,
    personalityName,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Daily Guidance Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DailyGuidancePipelineResult {
  caseId: string;
  input: string;
  personalityName: string;
  // Frame
  frame: DailyGuidanceFrame;
  clarifyNeeded: boolean;
  // Skeleton
  skeleton: DailyGuidanceSkeleton;
  dailyMode: DailyGuidanceMode;
  // LLM
  rawResponse: string;
  finalResponse: string;
  latencyMs: number;
  // Validation
  validationPass: boolean;
  validationFailures: string[];
  retryUsed: boolean;
}

async function runDailyGuidancePipeline(
  tc: AuditCase,
  personalityOverride?: any,
): Promise<DailyGuidancePipelineResult> {
  const personality = personalityOverride ?? PERSONALITIES[tc.personality ?? "cautious"];
  const personalityName = tc.personality ?? "cautious";
  const msg = tc.input;

  // Frame extraction
  const frame = extractDailyGuidanceFrame(msg, personality);
  const clarify = checkDailyGuidanceClarify(frame);

  // Build skeleton (even if clarify needed, for audit completeness)
  const skeleton = buildDailyGuidanceSkeleton(frame, personality);
  const promptBlock = buildDailyGuidancePromptBlock(skeleton);

  // System prompt
  const dgSystemPrompt = [
    "あなたは Alter（ユーザーの内側にいるもう一人の自分）です。",
    "今日一日をどう過ごすか、具体的にガイドしてください。（相手の名前: テスト太郎）",
    "",
    "# ルール",
    "- 1行目は「今日は〇〇する日」のように明快に始める",
    "- 「最初の一歩」は具体的な行動1つ。必ず動詞+対象+所要時間を含める（例: 「15分で〜する」「30分かけて〜する」）",
    "- 所要時間のない「最初の一歩」は不合格。必ず「〜分」「〜時間」を明記する",
    "- 「休む」だけでは不可。「何をして休むか」を具体的に指示する",
    "- 一般論・精神論は禁止。具体的なアクションだけ",
    "- 全体で200-350文字以内",
    "- 応答は必ず最後まで完結させる。途中で切れた文は不合格",
    "- メタデータブロック不要",
    "",
    promptBlock,
  ].join("\n");

  const userPrompt = `質問: ${msg}`;

  // LLM call
  const { text: rawResponse, latencyMs } = await callGemini(dgSystemPrompt, userPrompt, 0.5, 1536);
  let finalResponse = formatHomeAlterResponse(rawResponse.trim(), "テスト太郎");

  // Validation
  let validation = validateDailyGuidanceResponse(finalResponse, skeleton);
  let retryUsed = false;

  if (!validation.pass) {
    retryUsed = true;
    try {
      const retryPrompt = [
        `質問: ${msg}`,
        "",
        "## 前回の応答の問題点:",
        ...validation.failures.map((f) => `- ${f}`),
        "",
        "上記の問題を修正して、もう一度応答を生成してください。",
      ].join("\n");
      const { text: retryRaw } = await callGemini(dgSystemPrompt, retryPrompt, 0.4, 1536);
      const retryFormatted = formatHomeAlterResponse(retryRaw.trim(), "テスト太郎");
      const retryValidation = validateDailyGuidanceResponse(retryFormatted, skeleton);
      if (retryValidation.pass) {
        finalResponse = retryFormatted;
        validation = retryValidation;
      } else {
        finalResponse = retryFormatted || finalResponse;
        validation = retryValidation;
      }
    } catch {
      // keep original
    }
  }

  return {
    caseId: tc.id,
    input: msg,
    personalityName,
    frame,
    clarifyNeeded: clarify.needs_clarify,
    skeleton,
    dailyMode: skeleton.daily_mode,
    rawResponse,
    finalResponse,
    latencyMs,
    validationPass: validation.pass,
    validationFailures: validation.failures,
    retryUsed,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM-as-Judge: 8-Axis Evaluation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface QualityScores {
  directness: number;
  specificity: number;
  personalization: number;
  relational_relevance: number;
  uncertainty_calibration: number;
  consistency: number;
  actionability: number;
  trustworthiness: number;
  notes: string;
}

async function evaluateResponse(
  input: string,
  response: string,
  mode: ResponseMode,
  actionShape: string,
  confidenceLevel: string,
  role: string,
  purpose: string,
  personalityName: string,
): Promise<QualityScores> {
  const evalPrompt = `あなたは AI 応答品質の厳格な監査官です。

以下の「相談」に対する「応答」を 8軸 で 1〜5点 で採点してください。
厳しく採点すること。「まあまあ」なら 3。「良い」で 4。「非常に良い」で 5。「悪い」で 2。「使えない」で 1。

## コンテキスト
- ユーザー性格タイプ: ${personalityName}
- 応答モード: ${mode}
- 行動形: ${actionShape}
- 確信度: ${confidenceLevel}
- 検出された相手: ${role}
- 検出された目的: ${purpose}

## 相談
「${input}」

## 応答
${response}

## 採点基準
1. **directness** (1-5): 質問にちゃんと答えているか。回りくどくないか。1行目で結論が見えるか。
2. **specificity** (1-5): 理由が具体的か。次の一手が実行可能か。一般論ではないか。
3. **personalization** (1-5): ユーザーの性格（${personalityName}）が反映されているか。誰にでも同じ答えではないか。
4. **relational_relevance** (1-5): 相手（${role}）や目的（${purpose}）が判断に反映されているか。対人質問でなければ 3 をベースに。
5. **uncertainty_calibration** (1-5): 確信度（${confidenceLevel}）と文体が一致しているか。low なのに断定していないか。high なのに曖昧すぎないか。
6. **consistency** (1-5): 行動形（${actionShape}）と本文の方向性が矛盾していないか。
7. **actionability** (1-5): 読んだ後に何をすればいいか分かるか。具体的な次の一手があるか。
8. **trustworthiness** (1-5): 読んで納得できるか。危なさがないか。毎日使いたいと思えるか。

以下の JSON 形式で回答してください:
\`\`\`json
{
  "directness": <1-5>,
  "specificity": <1-5>,
  "personalization": <1-5>,
  "relational_relevance": <1-5>,
  "uncertainty_calibration": <1-5>,
  "consistency": <1-5>,
  "actionability": <1-5>,
  "trustworthiness": <1-5>,
  "notes": "<問題点や優れた点を簡潔に>"
}
\`\`\``;

  try {
    return await callGeminiJson<QualityScores>(evalPrompt, "上記の監査を実行し、JSON で返してください。", 0.1);
  } catch {
    return {
      directness: 0, specificity: 0, personalization: 0, relational_relevance: 0,
      uncertainty_calibration: 0, consistency: 0, actionability: 0, trustworthiness: 0,
      notes: "評価失敗",
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LLM-as-Judge: Daily Guidance 10-Axis Evaluation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DailyGuidanceScores {
  directness: number;
  specificity: number;
  personalization: number;
  actionability: number;
  trustworthiness: number;
  consistency: number;
  uncertainty_calibration: number;
  // Daily Guidance 専用
  daily_grounding: number;
  first_step_specificity: number;
  rest_specificity: number;
  notes: string;
}

async function evaluateDailyGuidanceResponse(
  input: string,
  response: string,
  dailyMode: string,
  personalityName: string,
  firstStep: string,
): Promise<DailyGuidanceScores> {
  const evalPrompt = `あなたは AI 応答品質の厳格な監査官です。

以下は「今日何したらいい？」系の質問に対する Daily Guidance 応答です。
10軸 で 1〜5点 で採点してください。厳しく採点すること。

## コンテキスト
- ユーザー性格タイプ: ${personalityName}
- ガイダンスモード: ${dailyMode}
- 骨格の最初の一歩: ${firstStep}

## 質問
「${input}」

## 応答
${response}

## 採点基準
1. **directness** (1-5): 1行目で「今日何をする日か」が明確か。曖昧な導入がないか。
2. **specificity** (1-5): 提案が具体的か。「何を」「どこで」「何分」が含まれているか。
3. **personalization** (1-5): ユーザーの性格（${personalityName}）が反映されているか。
4. **actionability** (1-5): 読んだ後にすぐ動けるか。最初の一歩が明確か。
5. **trustworthiness** (1-5): 毎日使いたいと思えるか。過度に押し付けがましくないか。
6. **consistency** (1-5): モード（${dailyMode}）と提案内容が一致しているか。
7. **uncertainty_calibration** (1-5): 情報不足の部分を適切に扱っているか。
8. **daily_grounding** (1-5): 「今日」に接地しているか。抽象的な人生アドバイスではなく、今日この瞬間に適用できるか。
9. **first_step_specificity** (1-5): 「最初の一歩」が動詞+対象+時間を含んでいるか。「考える」「整理する」は1点。「近所のカフェに30分行く」は5点。
10. **rest_specificity** (1-5): 休む提案がある場合、「何をして休むか」が具体的か。recover モードで「休みましょう」だけなら1点。「横になって15分呼吸に集中」なら5点。recover でなければ 3 をベースに。

以下の JSON 形式で回答してください:
\`\`\`json
{
  "directness": <1-5>,
  "specificity": <1-5>,
  "personalization": <1-5>,
  "actionability": <1-5>,
  "trustworthiness": <1-5>,
  "consistency": <1-5>,
  "uncertainty_calibration": <1-5>,
  "daily_grounding": <1-5>,
  "first_step_specificity": <1-5>,
  "rest_specificity": <1-5>,
  "notes": "<問題点や優れた点を簡潔に>"
}
\`\`\``;

  try {
    return await callGeminiJson<DailyGuidanceScores>(evalPrompt, "上記の監査を実行し、JSON で返してください。", 0.1);
  } catch {
    return {
      directness: 0, specificity: 0, personalization: 0,
      actionability: 0, trustworthiness: 0, consistency: 0,
      uncertainty_calibration: 0, daily_grounding: 0,
      first_step_specificity: 0, rest_specificity: 0,
      notes: "評価失敗",
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Parallel Execution with Rate Limiting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
  label: string,
): Promise<R[]> {
  const results: R[] = [];
  let completed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        console.error(`  ⚠ ${label} error:`, r.reason?.message?.slice(0, 100));
      }
      completed++;
    }
    process.stdout.write(`\r  ${label}: ${completed}/${items.length}`);

    // Rate limit: 1s between batches
    if (i + concurrency < items.length) await sleep(1500);
  }
  console.log();
  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Execution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Home Alter + Daily Guidance 統合品質監査        ║");
  console.log(`║  Judgment: ${ALL_CASES.length} + DG: ${DAILY_GUIDANCE_CASES.length} + ${CORRECTION_CASES.length} corr + ${STABILITY_CASES}×${STABILITY_RUNS} stab  ║`);
  console.log(`║  Model: ${GEMINI_MODEL}                          ║`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  const outputDir = path.resolve(__dirname, "audit-results");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // ═══ Phase 1: Main Pipeline Execution ═══
  console.log("▸ Phase 1: Main pipeline execution...");
  const pipelineResults = await runBatch(
    ALL_CASES,
    (tc) => runFullPipeline(tc),
    CONCURRENCY,
    "Pipeline",
  );

  // ═══ Phase 2: LLM-as-Judge Evaluation ═══
  console.log("\n▸ Phase 2: LLM quality evaluation...");
  const evaluations: Array<{ caseId: string; scores: QualityScores }> = [];
  const evalItems = pipelineResults.map((r) => ({
    r,
    role: r.lens.target_role,
    purpose: r.lens.interaction_purpose,
  }));

  const evalResults = await runBatch(
    evalItems,
    async ({ r, role, purpose }) => {
      const scores = await evaluateResponse(
        r.input, r.finalResponse, r.mode,
        r.decisionMeta?.action_shape ?? "unknown",
        r.skeleton.confidence_level,
        role, purpose, r.personalityName,
      );
      return { caseId: r.caseId, scores };
    },
    CONCURRENCY,
    "Evaluation",
  );
  evaluations.push(...evalResults);

  // ═══ Phase 3: Stability Test ═══
  console.log("\n▸ Phase 3: Stability test (20×3)...");
  const stabilityCases = ALL_CASES.slice(0, STABILITY_CASES);
  const stabilityResults: Array<{ caseId: string; run: number; mode: string; shape: string; response: string }> = [];

  for (let run = 1; run <= STABILITY_RUNS; run++) {
    console.log(`  Run ${run}/${STABILITY_RUNS}...`);
    const runResults = await runBatch(
      stabilityCases,
      async (tc) => {
        const r = await runFullPipeline(tc);
        return { caseId: tc.id, run, mode: r.mode, shape: r.decisionMeta?.action_shape ?? "unknown", response: r.finalResponse };
      },
      CONCURRENCY,
      `Stability-R${run}`,
    );
    stabilityResults.push(...runResults);
  }

  // ═══ Phase 4: Correction Test ═══
  console.log("\n▸ Phase 4: Correction flow test...");
  const correctionResults: Array<{
    id: string;
    initialMode: string;
    correctedMode: string;
    initialRole: string;
    correctedRole: string;
    initialPurpose: string;
    correctedPurpose: string;
    judgmentChanged: boolean;
    initialResponse: string;
    correctedResponse: string;
  }> = [];

  for (const cor of CORRECTION_CASES) {
    try {
      const initial = await runFullPipeline({ id: cor.id + "_init", input: cor.initial, category: "daily", expectedMode: cor.clarifyExpected ? "clarify" : "conclude" });
      const corrected = await runFullPipeline({ id: cor.id + "_corr", input: cor.correction, category: "daily", expectedMode: "conclude" });

      correctionResults.push({
        id: cor.id,
        initialMode: initial.mode,
        correctedMode: corrected.mode,
        initialRole: initial.lens.target_role,
        correctedRole: corrected.lens.target_role,
        initialPurpose: initial.lens.interaction_purpose,
        correctedPurpose: corrected.lens.interaction_purpose,
        judgmentChanged: initial.decisionMeta?.action_shape !== corrected.decisionMeta?.action_shape || initial.mode !== corrected.mode,
        initialResponse: initial.finalResponse.slice(0, 200),
        correctedResponse: corrected.finalResponse.slice(0, 200),
      });
    } catch (e: any) {
      console.error(`  ⚠ Correction ${cor.id} error:`, e.message?.slice(0, 80));
    }
    await sleep(1500);
  }

  // ═══ Phase 4b: Daily Guidance Pipeline ═══
  console.log("\n▸ Phase 4b: Daily Guidance pipeline...");
  const dgPipelineResults = await runBatch(
    DAILY_GUIDANCE_CASES,
    (tc) => runDailyGuidancePipeline(tc),
    CONCURRENCY,
    "DG-Pipeline",
  );

  // ═══ Phase 4c: Daily Guidance LLM Evaluation ═══
  console.log("\n▸ Phase 4c: Daily Guidance LLM evaluation...");
  const dgEvaluations: Array<{ caseId: string; scores: DailyGuidanceScores }> = [];
  const dgEvalResults = await runBatch(
    dgPipelineResults,
    async (r) => {
      const scores = await evaluateDailyGuidanceResponse(
        r.input, r.finalResponse, r.dailyMode,
        r.personalityName, r.skeleton.recommended_first_step,
      );
      return { caseId: r.caseId, scores };
    },
    CONCURRENCY,
    "DG-Eval",
  );
  dgEvaluations.push(...dgEvalResults);

  // ═══ Phase 5: Comparison Analysis ═══
  console.log("\n▸ Phase 5: Comparison analysis...");
  const comparisonGroups = new Map<string, PipelineResult[]>();
  for (const r of pipelineResults) {
    const tc = ALL_CASES.find((c) => c.id === r.caseId);
    if (tc?.comparisonGroup) {
      if (!comparisonGroups.has(tc.comparisonGroup)) comparisonGroups.set(tc.comparisonGroup, []);
      comparisonGroups.get(tc.comparisonGroup)!.push(r);
    }
  }

  const comparisonAnalysis: Array<{
    group: string;
    cases: Array<{ id: string; role: string; purpose: string; shape: string; response_preview: string }>;
    responsesAreDifferent: boolean;
    shapesAreDifferent: boolean;
  }> = [];

  for (const [group, results] of comparisonGroups) {
    const cases = results.map((r) => ({
      id: r.caseId,
      role: r.lens.target_role,
      purpose: r.lens.interaction_purpose,
      shape: r.decisionMeta?.action_shape ?? "unknown",
      response_preview: r.finalResponse.slice(0, 150),
    }));

    // Check if responses are meaningfully different
    const uniqueResponses = new Set(results.map((r) => r.finalResponse.slice(0, 100)));
    const uniqueShapes = new Set(results.map((r) => r.decisionMeta?.action_shape ?? ""));

    comparisonAnalysis.push({
      group,
      cases,
      responsesAreDifferent: uniqueResponses.size > 1,
      shapesAreDifferent: uniqueShapes.size > 1,
    });
  }

  // ═══ Phase 6: Report Generation ═══
  console.log("\n▸ Phase 6: Report generation...");

  // ── eval failure 分離集計 ──
  // eval failure = 全スコア0（LLM評価基盤の失敗）。品質failとは別物。
  const isEvalFailure = (e: typeof evaluations[0]) =>
    e.scores.directness === 0 && e.scores.specificity === 0 &&
    e.scores.personalization === 0 && e.scores.consistency === 0 &&
    e.scores.trustworthiness === 0;
  const evalFailedCases = evaluations.filter(isEvalFailure);
  const modelScoredCases = evaluations.filter((e) => !isEvalFailure(e));
  const evalFailureCount = evalFailedCases.length;
  const evalFailureRate = evalFailureCount / Math.max(evaluations.length, 1);

  // Calculate aggregate scores — model_scored_cases ベースで算出（eval failure 除外）
  const validEvals = modelScoredCases;
  // Segmented: conclude/branch only (clarify is a question, directness/specificity don't apply)
  const concludeBranchEvals = validEvals.filter((e) => {
    const pr = pipelineResults.find((r) => r.caseId === e.caseId);
    return pr && pr.mode !== "clarify";
  });
  // Segmented: interpersonal only (self/daily have no relational context)
  const interpersonalEvals = validEvals.filter((e) => {
    const pr = pipelineResults.find((r) => r.caseId === e.caseId);
    return pr && !["self", "daily"].includes(pr.category);
  });

  const avgScores = {
    directness: avg(concludeBranchEvals.map((e) => e.scores.directness)),
    specificity: avg(concludeBranchEvals.map((e) => e.scores.specificity)),
    personalization: avg(validEvals.map((e) => e.scores.personalization)),
    relational_relevance: avg(interpersonalEvals.map((e) => e.scores.relational_relevance)),
    uncertainty_calibration: avg(validEvals.map((e) => e.scores.uncertainty_calibration)),
    consistency: avg(validEvals.map((e) => e.scores.consistency)),
    actionability: avg(concludeBranchEvals.map((e) => e.scores.actionability)),
    trustworthiness: avg(validEvals.map((e) => e.scores.trustworthiness)),
  };

  // Danger rates
  const genericRate = pipelineResults.filter((r) => r.genericScore >= 0.5).length / pipelineResults.length;
  // wrong_role: LLM response addresses wrong target (judge-detected, from relational_relevance < 3 in interpersonal cases)
  const interpersonalResults = pipelineResults.filter((r) => !["self", "daily"].includes(r.category));
  const wrongRoleCount = interpersonalEvals.filter((e) => e.scores.relational_relevance <= 2).length;
  const wrongRoleRate = interpersonalResults.length > 0 ? wrongRoleCount / interpersonalResults.length : 0;
  const unjustifiedConcludeRate = pipelineResults.filter((r) =>
    r.mode === "conclude" && r.skeleton.confidence_level === "low" && r.validationFailures.length > 0
  ).length / pipelineResults.length;

  // Stability analysis
  const stabilityByCase = new Map<string, typeof stabilityResults>();
  for (const sr of stabilityResults) {
    if (!stabilityByCase.has(sr.caseId)) stabilityByCase.set(sr.caseId, []);
    stabilityByCase.get(sr.caseId)!.push(sr);
  }
  let stableModeCount = 0;
  let stableShapeCount = 0;
  for (const [, runs] of stabilityByCase) {
    const modes = new Set(runs.map((r) => r.mode));
    const shapes = new Set(runs.map((r) => r.shape));
    if (modes.size === 1) stableModeCount++;
    if (shapes.size === 1) stableShapeCount++;
  }

  // Mode distribution
  const modeDist = { conclude: 0, branch: 0, clarify: 0 };
  const shapeDist: Record<string, number> = {};
  const confDist = { high: 0, medium: 0, low: 0 };
  for (const r of pipelineResults) {
    modeDist[r.mode]++;
    const shape = r.decisionMeta?.action_shape ?? "unknown";
    shapeDist[shape] = (shapeDist[shape] ?? 0) + 1;
    confDist[r.skeleton.confidence_level]++;
  }

  // Failure cases
  const failureCases = pipelineResults
    .filter((r) => !r.qualityPass || r.genericScore >= 0.4)
    .map((r) => {
      const eval_ = evaluations.find((e) => e.caseId === r.caseId);
      return {
        id: r.caseId,
        input: r.input,
        mode: r.mode,
        shape: r.decisionMeta?.action_shape,
        genericScore: r.genericScore,
        failures: r.validationFailures,
        evalScores: eval_?.scores,
        response_preview: r.finalResponse.slice(0, 200),
      };
    })
    .slice(0, 20);

  // ── Daily Guidance scoring (eval failure 分離) ──
  const dgEvalFailedCases = dgEvaluations.filter(isEvalFailure);
  const validDgEvals = dgEvaluations.filter((e) => !isEvalFailure(e));
  const dgEvalFailureCount = dgEvalFailedCases.length;
  const dgEvalFailureRate = dgEvalFailureCount / Math.max(dgEvaluations.length, 1);
  const dgAvgScores = {
    directness: avg(validDgEvals.map((e) => e.scores.directness)),
    specificity: avg(validDgEvals.map((e) => e.scores.specificity)),
    personalization: avg(validDgEvals.map((e) => e.scores.personalization)),
    actionability: avg(validDgEvals.map((e) => e.scores.actionability)),
    trustworthiness: avg(validDgEvals.map((e) => e.scores.trustworthiness)),
    consistency: avg(validDgEvals.map((e) => e.scores.consistency)),
    uncertainty_calibration: avg(validDgEvals.map((e) => e.scores.uncertainty_calibration)),
    daily_grounding: avg(validDgEvals.map((e) => e.scores.daily_grounding)),
    first_step_specificity: avg(validDgEvals.map((e) => e.scores.first_step_specificity)),
    rest_specificity: avg(validDgEvals.map((e) => e.scores.rest_specificity)),
  };
  const dgValidationFailRate = dgPipelineResults.filter((r) => !r.validationPass).length / Math.max(dgPipelineResults.length, 1);
  const dgModeDist: Record<string, number> = {};
  for (const r of dgPipelineResults) {
    dgModeDist[r.dailyMode] = (dgModeDist[r.dailyMode] ?? 0) + 1;
  }

  // ── Daily Guidance personality comparison ──
  const dgPersonalityComparison: Array<{
    personality: string;
    mode: string;
    first_step: string;
    response_preview: string;
  }> = dgPipelineResults
    .filter((r) => ["DG20", "DG21", "DG22"].includes(r.caseId))
    .map((r) => ({
      personality: r.personalityName,
      mode: r.dailyMode,
      first_step: r.skeleton.recommended_first_step,
      response_preview: r.finalResponse.slice(0, 200),
    }));

  // GO/NO-GO judgment — Judgment Engine
  const passTargets = {
    directness: 4.3, specificity: 4.1, personalization: 4.1,
    relational_relevance: 4.3, uncertainty_calibration: 4.1,
    consistency: 4.5, actionability: 4.2, trustworthiness: 4.2,
  };
  const scorePass = Object.entries(passTargets).every(
    ([k, target]) => avgScores[k as keyof typeof avgScores] >= target,
  );
  const dangerPass = genericRate < 0.10 && wrongRoleRate < 0.05 && unjustifiedConcludeRate < 0.05;
  const comparisonPass = comparisonAnalysis.every((c) => c.responsesAreDifferent);

  // GO/NO-GO judgment — Daily Guidance
  const dgPassTargets = {
    directness: 4.0, specificity: 4.0, personalization: 3.8,
    actionability: 4.2, trustworthiness: 4.0, consistency: 4.3,
    daily_grounding: 4.0, first_step_specificity: 4.0, rest_specificity: 3.5,
  };
  const dgScorePass = Object.entries(dgPassTargets).every(
    ([k, target]) => (dgAvgScores as any)[k] >= target,
  );
  const dgDangerPass = dgValidationFailRate < 0.20;
  const dgPersonalityDiff = dgPersonalityComparison.length >= 2 &&
    new Set(dgPersonalityComparison.map((r) => r.mode)).size > 1;

  const overallGo = scorePass && dangerPass && comparisonPass;
  const dgOverallGo = dgScorePass && dgDangerPass;

  // Build report
  const report = {
    metadata: {
      timestamp: new Date().toISOString(),
      model: GEMINI_MODEL,
      totalCases: ALL_CASES.length,
      dailyGuidanceCases: DAILY_GUIDANCE_CASES.length,
      correctionCases: CORRECTION_CASES.length,
      stabilityCases: STABILITY_CASES,
      stabilityRuns: STABILITY_RUNS,
    },
    summary: {
      verdict: overallGo ? "GO" : "NO-GO",
      avgScores,
      passTargets,
      scorePass,
      evalFailure: {
        count: evalFailureCount,
        rate: round(evalFailureRate),
        caseIds: evalFailedCases.map((e) => e.caseId),
        note: "全スコア0のケース。LLM評価基盤の失敗であり品質failではない。平均スコア算出から除外済み。",
      },
      modelScoredCount: modelScoredCases.length,
      segmentation: {
        directness_n: concludeBranchEvals.length,
        specificity_n: concludeBranchEvals.length,
        relational_relevance_n: interpersonalEvals.length,
        note: "directness/specificity: conclude+branch only. relational_relevance: interpersonal only. eval failure は除外。",
      },
      dangerRates: {
        generic_response_rate: round(genericRate),
        wrong_role_inference_rate: round(wrongRoleRate),
        unjustified_conclude_rate: round(unjustifiedConcludeRate),
      },
      dangerPass,
      comparisonPass,
    },
    daily_guidance_summary: {
      verdict: dgOverallGo ? "GO" : "NO-GO",
      avgScores: dgAvgScores,
      passTargets: dgPassTargets,
      scorePass: dgScorePass,
      evalFailure: {
        count: dgEvalFailureCount,
        rate: round(dgEvalFailureRate),
        caseIds: dgEvalFailedCases.map((e) => e.caseId),
      },
      modelScoredCount: validDgEvals.length,
      validationFailRate: round(dgValidationFailRate),
      dangerPass: dgDangerPass,
      personalityDifferentiation: dgPersonalityDiff,
      modeDist: dgModeDist,
      personalityComparison: dgPersonalityComparison,
    },
    distributions: {
      mode: modeDist,
      shape: shapeDist,
      confidence: confDist,
    },
    stability: {
      modeConsistency: `${stableModeCount}/${stabilityByCase.size}`,
      shapeConsistency: `${stableShapeCount}/${stabilityByCase.size}`,
    },
    corrections: correctionResults,
    comparisons: comparisonAnalysis,
    failures: failureCases,
    // Full results table
    results: pipelineResults.map((r) => {
      const eval_ = evaluations.find((e) => e.caseId === r.caseId);
      return {
        case_id: r.caseId,
        input: r.input,
        category: r.category,
        role: r.lens.target_role,
        purpose: r.lens.interaction_purpose,
        expected_mode: ALL_CASES.find((c) => c.id === r.caseId)?.expectedMode,
        actual_mode: r.mode,
        mode_reason: r.modeReason,
        action_shape: r.decisionMeta?.action_shape,
        confidence: r.skeleton.confidence_level,
        generic_score: round(r.genericScore),
        quality_pass: r.qualityPass,
        fallback_used: r.fallbackUsed,
        reconciled: r.reconciled,
        latency_ms: r.latencyMs,
        scores: eval_?.scores,
        response_preview: r.finalResponse.slice(0, 300),
      };
    }),
    daily_guidance_results: dgPipelineResults.map((r) => {
      const eval_ = dgEvaluations.find((e) => e.caseId === r.caseId);
      return {
        case_id: r.caseId,
        input: r.input,
        personality: r.personalityName,
        daily_mode: r.dailyMode,
        clarify_needed: r.clarifyNeeded,
        first_step: r.skeleton.recommended_first_step,
        fallback_step: r.skeleton.fallback_step,
        avoid_today: r.skeleton.avoid_today,
        grounding_factors: r.skeleton.grounding_factors,
        validation_pass: r.validationPass,
        validation_failures: r.validationFailures,
        retry_used: r.retryUsed,
        latency_ms: r.latencyMs,
        scores: eval_?.scores,
        response_preview: r.finalResponse.slice(0, 300),
      };
    }),
  };

  // Write output
  const filename = `home-alter-response-audit-${Date.now()}.json`;
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         HOME ALTER 最終応答品質監査レポート       ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ 判定: ${overallGo ? "✅ GO" : "❌ NO-GO"}                                    ║`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ 8軸平均スコア（eval failure ${evalFailureCount}件除外）:        ║`);
  console.log(`║   model_scored: ${modelScoredCases.length}  eval_failed: ${evalFailureCount}  (${(evalFailureRate * 100).toFixed(1)}%)    ║`);
  console.log(`║   (dir/spec/act: conclude+branch n=${concludeBranchEvals.length})          ║`);
  console.log(`║   (rel: interpersonal n=${interpersonalEvals.length})                      ║`);
  if (evalFailureCount > 0) {
    console.log(`║   eval_failed_ids: ${evalFailedCases.map((e) => e.caseId).join(", ")}  ║`);
  }
  for (const [k, v] of Object.entries(avgScores)) {
    const target = passTargets[k as keyof typeof passTargets];
    const pass = v >= target;
    console.log(`║   ${k.padEnd(28)} ${v.toFixed(2)} / ${target} ${pass ? "✅" : "❌"}`);
  }
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ 危険率:                                          ║`);
  console.log(`║   generic_response:      ${(genericRate * 100).toFixed(1)}% (< 10%) ${genericRate < 0.1 ? "✅" : "❌"}`);
  console.log(`║   wrong_role:            ${(wrongRoleRate * 100).toFixed(1)}% (< 5%)  ${wrongRoleRate < 0.05 ? "✅" : "❌"}`);
  console.log(`║   unjustified_conclude:  ${(unjustifiedConcludeRate * 100).toFixed(1)}% (< 5%)  ${unjustifiedConcludeRate < 0.05 ? "✅" : "❌"}`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ Mode分布:    conclude=${modeDist.conclude} branch=${modeDist.branch} clarify=${modeDist.clarify}`);
  console.log(`║ Shape分布:   ${Object.entries(shapeDist).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`║ Confidence:  high=${confDist.high} medium=${confDist.medium} low=${confDist.low}`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ 安定性:      mode ${stableModeCount}/${stabilityByCase.size}  shape ${stableShapeCount}/${stabilityByCase.size}`);
  console.log(`║ 比較テスト:  全グループで応答差分あり: ${comparisonPass ? "✅" : "❌"}`);
  console.log(`║ 訂正テスト:  ${correctionResults.filter((c) => c.judgmentChanged).length}/${correctionResults.length} で判断更新`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ 失敗ケース:  ${failureCases.length}件`);
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\n📄 Full report: ${outputPath}`);

  // Daily Guidance summary
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║       DAILY GUIDANCE 品質監査レポート             ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ 判定: ${dgOverallGo ? "✅ GO" : "❌ NO-GO"}                                    ║`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ 10軸平均スコア (n=${validDgEvals.length}):                        ║`);
  for (const [k, v] of Object.entries(dgAvgScores)) {
    const target = (dgPassTargets as any)[k];
    if (target === undefined) continue;
    const pass = v >= target;
    console.log(`║   ${k.padEnd(28)} ${v.toFixed(2)} / ${target} ${pass ? "✅" : "❌"}`);
  }
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║ Validation失敗率: ${(dgValidationFailRate * 100).toFixed(1)}% (< 20%) ${dgDangerPass ? "✅" : "❌"}`);
  console.log(`║ Mode分布: ${Object.entries(dgModeDist).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`║ 性格別差分: ${dgPersonalityDiff ? "✅ モード差分あり" : "❌ 差分なし"}`);
  if (dgPersonalityComparison.length > 0) {
    for (const p of dgPersonalityComparison) {
      console.log(`║   ${p.personality}: ${p.mode} → "${p.first_step.slice(0, 40)}..."`);
    }
  }
  console.log("╚══════════════════════════════════════════════════╝");

  // CEO Questions
  console.log("\n─── CEO 向け最終判断 ───");
  console.log(`1. 対人判断 Alter を毎日使いたいと思えるか: ${avgScores.trustworthiness >= 4.2 ? "条件付きYES" : "まだNO"}`);
  console.log(`2. 重要な対人判断を任せても危なくないか: ${dangerPass ? "基本的に安全" : "まだ危険あり"}`);
  console.log(`3. Daily Guidance は「今日何する？」に具体的に答えられるか: ${dgOverallGo ? "YES" : "まだNO"}`);
  console.log(`4. 性格によって提案が変わるか: ${dgPersonalityDiff ? "YES" : "NO — 改善必要"}`);
  console.log(`5. 「休む」だけの提案がないか: ${dgValidationFailRate < 0.20 ? "基本的に安全" : "まだ改善必要"}`);
}

// Helpers
function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function round(n: number, d = 3): number {
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
}

// Run
main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
