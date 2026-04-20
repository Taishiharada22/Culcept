import "server-only";

// lib/talk/intentTranslation/nvcAnalysis.ts
// NVC（非暴力コミュニケーション）分析エンジン — Phase 3 基盤
//
// Rosenberg の NVC 4要素（観察・感情・ニーズ・リクエスト）に分解し、
// Gottman の四騎士パターンを検出する。
//
// 設計原則:
//   - ルールベース（高速、確定的）で基本パターンを捕捉
//   - LLM で文脈依存の深い分析を補完
//   - 既存の ruptureDetection / conflictRepair を参照するが変更しない
//   - 仲介者として「どちらが正しいか」は判定しない

import type {
  NVCDecomposition,
  FourHorsemanHit,
  EscalationState,
  GottmanCascade,
  ReciprocalEscalation,
  ConversationTurn,
} from "./types";
import { MEDIATION_ESCALATION_THRESHOLD } from "./types";
import {
  detectAmbiguousExpressions,
  computeAmbiguityFactor,
} from "./japanesePragmatics";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gottman 四騎士パターン検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 四騎士パターンの検出ルール。
 *
 * Gottman (1994): この4パターンが頻出するカップルは
 * 93.6% の確率で4年以内に離別する。
 * テキストコミュニケーションでは特に criticism と stonewalling が頻出。
 */
const FOUR_HORSEMEN_RULES: Array<{
  pattern: "criticism" | "contempt" | "defensiveness" | "stonewalling";
  regex: RegExp;
  severity: number;
}> = [
  // ── Criticism（人格攻撃） ──
  // 「行動」ではなく「人格」を攻撃している表現
  { pattern: "criticism", regex: /いつも(?:あなた|お前|君)は/, severity: 0.8 },
  { pattern: "criticism", regex: /(?:何回|何度)言(?:っ|え)ば/, severity: 0.7 },
  { pattern: "criticism", regex: /(?:あなた|お前|君)(?:って|は)(?:ほんと|本当)に/, severity: 0.6 },
  { pattern: "criticism", regex: /(?:だから|やっぱり)(?:あなた|お前|君)は/, severity: 0.7 },
  { pattern: "criticism", regex: /(?:いつも|毎回|また)(?:そう|こう)(?:だ|な)/, severity: 0.5 },

  // ── Contempt（軽蔑） ──
  // 見下し、嘲笑、優位性の主張
  { pattern: "contempt", regex: /(?:バカ|馬鹿|アホ|頭おかし)/, severity: 0.9 },
  { pattern: "contempt", regex: /(?:ありえない|信じられない)(?:わ|ね|な)/, severity: 0.5 },
  // 「はいはい」「はぁ？」は軽蔑的。「で？」は単体のみ（「まじで？」を誤検出しない）
  { pattern: "contempt", regex: /(?:はいはい|はぁ[?？])/, severity: 0.6 },
  { pattern: "contempt", regex: /^で[?？]$/, severity: 0.6 },
  { pattern: "contempt", regex: /(?:笑|ｗ{3,}|草)$/, severity: 0.4 },

  // ── Defensiveness（防衛） ──
  // 責任の回避、反撃
  { pattern: "defensiveness", regex: /(?:そっち|あなた|お前)(?:こそ|だって|が先に|の方が)/, severity: 0.6 },
  { pattern: "defensiveness", regex: /(?:私|俺|僕)(?:は|が)悪くない/, severity: 0.7 },
  { pattern: "defensiveness", regex: /(?:だって|でも|しょうがない)(?:じゃん|でしょ)/, severity: 0.4 },

  // ── Stonewalling（石壁化） ──
  // 会話の遮断、無視、最小限の応答
  // 明確に dismissive な表現は高severity
  { pattern: "stonewalling", regex: /^(?:あっそ|どうでもいい)[。]?$/, severity: 0.7 },
  // 「ふーん」「へー」「知らない」は文脈次第。単独では相槌の可能性が高い
  { pattern: "stonewalling", regex: /^(?:ふーん|へー|知らない)[。]?$/, severity: 0.4 },
  { pattern: "stonewalling", regex: /もう(?:話し|言い)たくない/, severity: 0.8 },
  { pattern: "stonewalling", regex: /^(?:うん|はい|そう)[。]?$/, severity: 0.3 },
];

/**
 * メッセージから Gottman の四騎士パターンを検出する。
 */
export function detectFourHorsemen(message: string): FourHorsemanHit[] {
  const hits: FourHorsemanHit[] = [];
  const trimmed = message.trim();

  for (const rule of FOUR_HORSEMEN_RULES) {
    const match = trimmed.match(rule.regex);
    if (match) {
      hits.push({
        pattern: rule.pattern,
        trigger: match[0],
        severity: rule.severity,
      });
    }
  }

  // 重複パターンの除去（同一パターンは最高severity のみ残す）
  const bestByPattern = new Map<string, FourHorsemanHit>();
  for (const hit of hits) {
    const existing = bestByPattern.get(hit.pattern);
    if (!existing || hit.severity > existing.severity) {
      bestByPattern.set(hit.pattern, hit);
    }
  }

  return Array.from(bestByPattern.values());
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gottman カスケード検出（会話履歴ベース）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Gottman (1994): 四騎士は典型的に以下の順序で出現する:
 *   Criticism → Contempt → Defensiveness → Stonewalling
 *
 * この「カスケード」パターンが検出された場合、
 * 個別パターンの検出よりも遥かに高い関係リスクを示す。
 *
 * Gottman (1999): カスケード出現 → 4年以内の離別率 93.6%
 * 一方、単一パターン → 離別率 30-50%（パターン依存）
 *
 * @returns cascade が検出された場合の詳細情報
 */
const CASCADE_ORDER: FourHorsemanHit["pattern"][] = [
  "criticism", "contempt", "defensiveness", "stonewalling",
];

/**
 * 会話履歴から Gottman カスケード（四騎士の連鎖出現）を検出する。
 *
 * 検出ロジック:
 *   - 直近の会話を時系列で走査し、四騎士の出現を記録
 *   - CASCADE_ORDER の部分列が出現していればカスケードと判定
 *   - 同一話者が連続する場合もカウント（自己エスカレーション）
 */
export function detectGottmanCascade(
  conversationContext: ConversationTurn[],
): GottmanCascade {
  const noCascade: GottmanCascade = {
    detected: false,
    sequence: [],
    progress: 0,
    reachedStonewalling: false,
  };

  if (conversationContext.length < 2) return noCascade;

  // 各ターンの四騎士を検出
  const turnHits = conversationContext.map((turn, idx) => ({
    horsemen: detectFourHorsemen(turn.body),
    senderId: turn.senderId,
    turnIndex: idx,
  }));

  // カスケード順序の最長部分列を探す
  const sequence: GottmanCascade["sequence"] = [];
  let nextCascadeIdx = 0; // CASCADE_ORDER の何番目を探しているか

  for (const hit of turnHits) {
    for (const h of hit.horsemen) {
      // 現在探しているカスケード段階にマッチ
      if (nextCascadeIdx < CASCADE_ORDER.length && h.pattern === CASCADE_ORDER[nextCascadeIdx]) {
        sequence.push({
          pattern: h.pattern,
          turnIndex: hit.turnIndex,
          senderId: hit.senderId,
        });
        nextCascadeIdx++;
      }
      // すでに通過した段階の再出現は無視（前に進むのみ）
    }
  }

  const progress = sequence.length / CASCADE_ORDER.length;

  return {
    detected: sequence.length >= 2, // 2段階以上でカスケード検出
    sequence,
    progress,
    reachedStonewalling: sequence.some(s => s.pattern === "stonewalling"),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 相互エスカレーション（Tit-for-Tat）検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Gottman (1999): "negative reciprocity" — 相手の攻撃に攻撃で返すパターン
 * Patterson (1982): "coercive cycle" — 強制的相互作用の悪循環
 *
 * A の攻撃 → B がさらに強い攻撃で返す → A がさらに… の連鎖を検出。
 * 個別の攻撃性スコアよりも、「応酬パターン」が関係破壊の予測因子として強い。
 */
export function detectReciprocalEscalation(
  conversationContext: ConversationTurn[],
): ReciprocalEscalation {
  const noEscalation: ReciprocalEscalation = {
    detected: false,
    exchangeCount: 0,
    intensifying: false,
    exchangeScores: [],
  };

  if (conversationContext.length < 4) return noEscalation;

  // 各ターンの攻撃性スコアを算出（四騎士 + NVC other_blame）
  const scores = conversationContext.map(turn => {
    let score = 0;
    const horsemen = detectFourHorsemen(turn.body);
    for (const h of horsemen) score += h.severity;

    // other_blame 感情表現も攻撃性に加算
    for (const fp of FEELING_PATTERNS) {
      if (fp.ownership === "other_blame" && fp.regex.test(turn.body)) {
        score += 0.3;
      }
    }

    return { senderId: turn.senderId, score };
  });

  // 交互の攻撃パターンを検出（ABA or BAB...）
  const AGGRESSION_THRESHOLD = 0.3;
  const exchanges: Array<{ senderId: string; score: number }> = [];

  for (let i = 0; i < scores.length; i++) {
    if (scores[i].score >= AGGRESSION_THRESHOLD) {
      // 連続する同一話者はスキップ（最後の発言のみ）
      if (exchanges.length > 0 && exchanges[exchanges.length - 1].senderId === scores[i].senderId) {
        exchanges[exchanges.length - 1] = scores[i]; // 更新
      } else {
        exchanges.push(scores[i]);
      }
    } else {
      // 攻撃的でないターンが挟まっても、直後に相手が攻撃すればカウント
    }
  }

  // 交互パターンのカウント
  let alternatingCount = 0;
  for (let i = 1; i < exchanges.length; i++) {
    if (exchanges[i].senderId !== exchanges[i - 1].senderId) {
      alternatingCount++;
    }
  }

  // 攻撃性の増加トレンド
  let intensifying = false;
  if (exchanges.length >= 3) {
    const firstHalf = exchanges.slice(0, Math.floor(exchanges.length / 2));
    const secondHalf = exchanges.slice(Math.floor(exchanges.length / 2));
    const avgFirst = firstHalf.reduce((s, e) => s + e.score, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, e) => s + e.score, 0) / secondHalf.length;
    intensifying = avgSecond > avgFirst + 0.1;
  }

  return {
    detected: alternatingCount >= 2, // 2回以上の応酬
    exchangeCount: alternatingCount,
    intensifying,
    exchangeScores: exchanges,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NVC ルールベース分析
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 感情語彙辞書（日本語テキストから感情を検出）
//
// 学術根拠:
//   - Rosenberg (2003): NVC の感情リストは140語以上。ここでは日本語テキストに頻出するものを厳選
//   - Plutchik (1980): 基本感情 8 + 混合感情。二次感情の検出が重要
//   - Barrett (2017): 構成された感情理論 — 同一単語でも文脈で感情カテゴリが変わる
const FEELING_PATTERNS: Array<{
  regex: RegExp;
  feeling: string;
  ownership: "self" | "other_blame";
}> = [
  // ── Self-owned: 基本感情 ──
  { regex: /(?:悲し|さびし|寂し|つら|辛)い/, feeling: "悲しい", ownership: "self" },
  { regex: /(?:不安|心配|怖)/, feeling: "不安", ownership: "self" },
  { regex: /(?:嬉し|楽し|幸せ)/, feeling: "嬉しい", ownership: "self" },
  { regex: /(?:イライラ|ムカ|腹[がを]?立)/, feeling: "苛立ち", ownership: "self" },
  { regex: /(?:疲れ|しんどい|きつい)/, feeling: "疲労", ownership: "self" },
  { regex: /(?:寂し|孤独|一人ぼっち)/, feeling: "孤独感", ownership: "self" },
  { regex: /(?:恥ずかし|居心地[が]?悪)/, feeling: "恥ずかしさ", ownership: "self" },
  { regex: /(?:嫌[だな]|やだ)/, feeling: "嫌悪", ownership: "self" },
  { regex: /(?:がっかり|残念)/, feeling: "失望", ownership: "self" },
  { regex: /(?:ホッと|安心)/, feeling: "安堵", ownership: "self" },

  // ── Self-owned: 二次感情（Plutchik 混合） ──
  { regex: /(?:もどかし|歯がゆ|じれったい)/, feeling: "もどかしさ", ownership: "self" },
  { regex: /(?:罪悪感|申し訳な|すまな)/, feeling: "罪悪感", ownership: "self" },
  { regex: /(?:情けな|ふがいな|不甲斐な)/, feeling: "無力感", ownership: "self" },
  { regex: /(?:圧倒|パンク|いっぱいいっぱい|キャパ)/, feeling: "圧倒", ownership: "self" },
  { regex: /(?:惨め|みじめ|どうしようもな)/, feeling: "絶望", ownership: "self" },
  { regex: /(?:感謝|ありがた|嬉し.*(?:ありがと|感謝))/, feeling: "感謝", ownership: "self" },
  { regex: /(?:ワクワク|楽しみ|待ち遠し)/, feeling: "期待", ownership: "self" },
  { regex: /(?:混乱|わけがわから|頭が(?:真っ白|パニック))/, feeling: "混乱", ownership: "self" },
  { regex: /(?:悔し|くやし|悔い)/, feeling: "悔しさ", ownership: "self" },
  { regex: /(?:焦[りる]|焦って|急がな)/, feeling: "焦り", ownership: "self" },

  // ── Other-blame patterns（相手のせいにしている表現） ──
  { regex: /(?:あなた|お前|君)(?:が|の)せいで/, feeling: "怒り", ownership: "other_blame" },
  { regex: /(?:あなた|お前|君)に(?:傷つけ|裏切)られた/, feeling: "傷つき", ownership: "other_blame" },
  { regex: /(?:ひどい|最低|最悪)(?:な|だ)/, feeling: "怒り", ownership: "other_blame" },
  { regex: /(?:なんで|どうして)(?:あなた|お前|君)は/, feeling: "困惑", ownership: "other_blame" },
  { regex: /(?:信じられない|ありえない).*(?:あなた|お前|君)/, feeling: "裏切られた感", ownership: "other_blame" },
];

// ニーズ辞書（NVC の普遍的ニーズリスト）
//
// Rosenberg (2003): 人間のニーズは約9カテゴリ:
//   つながり / 身体的健全 / 誠実さ / 遊び / 平和 / 自律 / 意味 / 物理的安全 / 相互依存
const NEED_PATTERNS: Array<{
  regex: RegExp;
  need: string;
  explicit: boolean;
}> = [
  // ── 明示的ニーズ ──
  { regex: /(?:分かって|理解して|聞いて)(?:ほしい|よ|ね)/, need: "理解・共感", explicit: true },
  { regex: /(?:一緒に|そばに)(?:いて|いたい)/, need: "つながり", explicit: true },
  { regex: /(?:一人に|放って)(?:して|おいて)/, need: "自律・空間", explicit: true },
  { regex: /(?:安心|大丈夫って)(?:したい|言って)/, need: "安心・安全", explicit: true },
  { regex: /(?:認めて|褒めて|見て)(?:ほしい|よ)/, need: "承認", explicit: true },
  { regex: /(?:公平|平等|対等)/, need: "公平さ", explicit: true },
  { regex: /(?:自由|好きに|自分で決め)/, need: "自律", explicit: true },
  { regex: /(?:正直|嘘|本当のこと)/, need: "誠実さ", explicit: true },
  // ── 追加ニーズパターン ──
  { regex: /(?:信じ|信頼|信用)(?:して|したい|できない)/, need: "信頼", explicit: true },
  { regex: /(?:休[みむ]|休憩|ゆっくり)(?:したい|させて|たい)/, need: "休息", explicit: true },
  { regex: /(?:助けて|手伝って|サポート)(?:ほしい)?/, need: "サポート", explicit: true },
  { regex: /(?:意味|やりがい|何のため)/, need: "意味・目的", explicit: true },
  { regex: /(?:楽し|遊[びぼ]|リフレッシュ)/, need: "遊び・楽しみ", explicit: true },
  { regex: /(?:尊重|リスペクト|大切にし)/, need: "尊重", explicit: true },
  { regex: /(?:選[びぶ]|選択|決め)(?:させて|たい)/, need: "選択の自由", explicit: true },
  { regex: /(?:守[りる]|守って|安全)/, need: "安全・保護", explicit: true },
];

// リクエスト検出
const DEMAND_PATTERNS = /(?:しろ|しなさい|すべき|当たり前|当然|ないと(?:許さない|別れる|ダメ))/;
const HINT_PATTERNS = /(?:普通は|普通なら|他の人は|〇〇なら|もしよかったら|できれば)/;
const REQUEST_PATTERNS = /(?:してほしい|してくれない[?？]|お願い|してもらえる|いただけ)/;

/**
 * メッセージを NVC 4要素に分解する（ルールベース）。
 *
 * - 感情: 感情語彙辞書でマッチ
 * - ニーズ: ニーズパターンでマッチ（明示的/暗黙的）
 * - リクエスト: demand/hint/request の3分類
 * - 観察: 四騎士がなければ observation は判断なしと推定
 *
 * LLM 補完は sharedMediator.ts で行う。
 */
export function analyzeNVCRuleBased(message: string): NVCDecomposition {
  const trimmed = message.trim();

  // ── Feelings ──
  const feelings: NVCDecomposition["feelings"] = [];
  for (const fp of FEELING_PATTERNS) {
    if (fp.regex.test(trimmed)) {
      // 重複チェック
      if (!feelings.some(f => f.feeling === fp.feeling)) {
        feelings.push({ feeling: fp.feeling, ownership: fp.ownership });
      }
    }
  }

  // ── Needs ──
  const needs: NVCDecomposition["needs"] = [];
  for (const np of NEED_PATTERNS) {
    if (np.regex.test(trimmed)) {
      needs.push({ need: np.need, explicit: np.explicit });
    }
  }

  // 暗黙的ニーズの推定: 感情からニーズを推論
  if (needs.length === 0 && feelings.length > 0) {
    const implicitNeed = inferNeedFromFeeling(feelings[0].feeling);
    if (implicitNeed) {
      needs.push({ need: implicitNeed, explicit: false });
    }
  }

  // ── Request ──
  let request: NVCDecomposition["request"] = null;
  if (DEMAND_PATTERNS.test(trimmed)) {
    request = { text: trimmed, type: "demand" };
  } else if (REQUEST_PATTERNS.test(trimmed)) {
    request = { text: trimmed, type: "request" };
  } else if (HINT_PATTERNS.test(trimmed)) {
    request = { text: trimmed, type: "hint" };
  }

  // ── Observation ──
  const horsemen = detectFourHorsemen(trimmed);
  const hasJudgment = horsemen.length > 0
    || feelings.some(f => f.ownership === "other_blame")
    || DEMAND_PATTERNS.test(trimmed);

  const observation: NVCDecomposition["observation"] = {
    text: trimmed,
    isJudgmentFree: !hasJudgment,
  };

  // ── NVC Score ──
  const nvcScore = computeNVCScore(observation, feelings, needs, request);

  return { observation, feelings, needs, request, nvcScore };
}

/**
 * 感情から暗黙のニーズを推論する。
 * Rosenberg の「感情はニーズが満たされているかの信号」に基づく。
 */
/**
 * 感情から暗黙のニーズを推論する。
 * Rosenberg の「感情はニーズが満たされているかの信号」に基づく。
 *
 * 拡張: Plutchik (1980) の二次感情も網羅
 */
function inferNeedFromFeeling(feeling: string): string | null {
  const map: Record<string, string> = {
    // 基本感情
    "悲しい": "つながり・理解",
    "不安": "安心・安全",
    "苛立ち": "尊重・自律",
    "疲労": "休息・サポート",
    "孤独感": "つながり・帰属",
    "恥ずかしさ": "受容・承認",
    "嫌悪": "境界・自律",
    "失望": "信頼・誠実さ",
    "怒り": "尊重・公平さ",
    "傷つき": "安全・信頼",
    // 二次感情
    "もどかしさ": "進展・効果感",
    "罪悪感": "許し・修復",
    "無力感": "能力・貢献",
    "圧倒": "秩序・サポート",
    "絶望": "希望・意味",
    "期待": "つながり・楽しみ",
    "混乱": "理解・明確さ",
    "悔しさ": "達成・承認",
    "焦り": "安定・余裕",
    // other_blame系
    "困惑": "理解・一貫性",
    "裏切られた感": "信頼・安全",
  };
  return map[feeling] ?? null;
}

/**
 * NVC 準拠度を算出する (0.0-1.0)。
 *
 * 高スコア = 非暴力的で建設的な表現
 * 低スコア = 攻撃的 or 曖昧で建設的でない表現
 */
function computeNVCScore(
  observation: NVCDecomposition["observation"],
  feelings: NVCDecomposition["feelings"],
  needs: NVCDecomposition["needs"],
  request: NVCDecomposition["request"],
): number {
  let score = 0.5; // ベースライン: 中立

  // 判断なしの観察 → +
  if (observation?.isJudgmentFree) score += 0.1;
  else score -= 0.15;

  // 感情の自己所有 → +
  const selfFeelings = feelings.filter(f => f.ownership === "self").length;
  const blameFeelings = feelings.filter(f => f.ownership === "other_blame").length;
  score += selfFeelings * 0.1;
  score -= blameFeelings * 0.2;

  // 明示的ニーズ → +
  const explicitNeeds = needs.filter(n => n.explicit).length;
  score += explicitNeeds * 0.1;

  // リクエストの質 → request > hint > demand
  if (request) {
    if (request.type === "request") score += 0.1;
    else if (request.type === "hint") score += 0.0;
    else if (request.type === "demand") score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// エスカレーション状態の算出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 直近の会話履歴からエスカレーション状態を評価する。
 *
 * @param conversationContext 直近の会話（時系列順）
 * @param currentFourHorsemen 最新メッセージの四騎士検出
 */
export function assessEscalation(
  conversationContext: ConversationTurn[],
  currentFourHorsemen: FourHorsemanHit[],
): EscalationState {
  // 各メッセージの攻撃性スコアを算出
  const scores = conversationContext.map(turn => {
    const horsemen = detectFourHorsemen(turn.body);
    const ambiguity = computeAmbiguityFactor(turn.body);
    const ambiguous = detectAmbiguousExpressions(turn.body);

    let aggressionScore = 0;
    for (const h of horsemen) aggressionScore += h.severity;
    // 曖昧表現の多用も緊張の間接指標
    if (ambiguous.length > 0) aggressionScore += 0.1;
    return { aggressionScore, bodyLength: turn.body.length, senderId: turn.senderId };
  });

  // エスカレーションレベル: 直近3ターンの攻撃性スコアの加重平均
  const recentScores = scores.slice(-5);
  const weightedSum = recentScores.reduce((sum, s, i) => {
    const recencyWeight = (i + 1) / recentScores.length; // 最新ほど重い
    return sum + s.aggressionScore * recencyWeight;
  }, 0);
  const level = Math.min(1, weightedSum / Math.max(1, recentScores.length) * 1.5);

  // トレンド: 前半 vs 後半
  const half = Math.floor(recentScores.length / 2);
  const firstHalf = recentScores.slice(0, half);
  const secondHalf = recentScores.slice(half);
  const avgFirst = firstHalf.length > 0
    ? firstHalf.reduce((s, x) => s + x.aggressionScore, 0) / firstHalf.length
    : 0;
  const avgSecond = secondHalf.length > 0
    ? secondHalf.reduce((s, x) => s + x.aggressionScore, 0) / secondHalf.length
    : 0;

  let trend: EscalationState["trend"] = "stable";
  if (avgSecond - avgFirst > 0.15) trend = "escalating";
  else if (avgFirst - avgSecond > 0.15) trend = "de_escalating";

  // 温度差: メッセージ長のアシンメトリー
  const senderIds = [...new Set(scores.map(s => s.senderId))];
  let temperatureGap = 0;
  if (senderIds.length === 2) {
    const [idA, idB] = senderIds;
    const msgsA = scores.filter(s => s.senderId === idA);
    const msgsB = scores.filter(s => s.senderId === idB);
    if (msgsA.length > 0 && msgsB.length > 0) {
      const avgLenA = msgsA.reduce((s, m) => s + m.bodyLength, 0) / msgsA.length;
      const avgLenB = msgsB.reduce((s, m) => s + m.bodyLength, 0) / msgsB.length;
      const maxAvg = Math.max(avgLenA, avgLenB, 1);
      temperatureGap = Math.abs(avgLenA - avgLenB) / maxAvg;
    }
  }

  // Withdrawal streak: 末尾の連続短文ターン
  // 閾値は 5 を維持。10 に拡張すると通常会話（質問→短返答の繰り返し）で
  // streak >= 3 が発火し false positive が増える（A-110 回帰で確認済み）。
  let withdrawalStreak = 0;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i].bodyLength <= 5) withdrawalStreak++;
    else break;
  }

  // ── Gottman カスケード: 検出時は level を大幅に引き上げ ──
  const cascade = detectGottmanCascade(conversationContext);
  let cascadeBoost = 0;
  if (cascade.detected) {
    // カスケード進行度に応じたブースト: 2段階=+0.2, 3段階=+0.35, 4段階=+0.5
    cascadeBoost = cascade.progress * 0.5;
  }

  // ── 相互エスカレーション: tit-for-tat パターン ──
  const reciprocal = detectReciprocalEscalation(conversationContext);
  let reciprocalBoost = 0;
  if (reciprocal.detected) {
    reciprocalBoost = Math.min(0.3, reciprocal.exchangeCount * 0.1);
    if (reciprocal.intensifying) reciprocalBoost += 0.1;
  }

  // ── 短会話ダンピング ──
  // 1ターンの文脈で "笑" (severity 0.4) があるだけで escalation=0.6 になる問題を修正。
  // 会話が短いほど単一ターンのスコアが過重になるため、
  // 3ターン未満は線形にダンピングする。
  const conversationDamping = Math.min(1, conversationContext.length / 3);
  const finalLevel = Math.min(1, (level + cascadeBoost + reciprocalBoost) * conversationDamping);

  return {
    level: finalLevel,
    trend,
    fourHorsemen: currentFourHorsemen,
    temperatureGap,
    withdrawalStreak,
    // 新規フィールド
    cascade,
    reciprocalEscalation: reciprocal,
  };
}
