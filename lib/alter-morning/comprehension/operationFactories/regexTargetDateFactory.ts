/**
 * regexTargetDateFactory — OP-3A / Phase B v3.2 (CEO 2026-05-11)
 *
 * 入力 utterance から日付トークン (= 「明日 / 明後日 / 一昨日 / 昨日 / 今日 /
 * あさって / おととい / しあさって / 明明後日」) を抽出し、 deterministic な
 * `set_target_date` operation candidate に wrap する **pure factory**。
 *
 * Phase B v3.2 設計骨格:
 *   - 5-layer tri-state boundary (= ACCEPT / REJECT / UNKNOWN)
 *   - Layer 0: prev DANGER prefix kanji check (= 不/未/非/無/説/解/究/証/判)
 *   - Layer 1: EOS / non-kanji boundary
 *   - Layer 2: ACCEPT_WORD_PREFIXES (= 美容院/子供/花火大会/月曜日/祝日 等)
 *   - Layer 3: ACCEPT_KANJI single char (= 朝/昼/夜/会/仕/出 等)
 *   - Layer 4: NAME_SUFFIX_KANJI + checkNamePattern (= REJECT / UNKNOWN)
 *   - Layer 5: UNKNOWN default
 *
 * 多日 ambiguity:
 *   - 全 ACCEPT candidate を収集
 *   - Overlap dedup (= 「明明後日」 内の「明後日」 substring を吸収)
 *   - distinct offset が 2 以上 → no emit (= high precision source として safety side)
 *   - distinct offset が 1 で offset === 0 (今日) → no emit
 *   - distinct offset が 1 で offset !== 0 → emit
 *
 * Unicode / Code-point safety:
 *   - kanji 判定: `\p{Script=Han}/u` (= SMP 拡張漢字対応)
 *   - next char 取得: `String.fromCodePoint(text.codePointAt(idx))`
 *   - prev char 取得: `charBefore` (= Array.from で code-point safe)
 *
 * JST date 計算 (= TZ-invariant):
 *   - UTC arithmetic で local TZ 依存を回避
 *   - factory signature は不変 (= `RegexTargetDateInput`)
 *
 * OP-3A 規律 (= 不変条件):
 *   - dispatcher / legacyAdapter / route.ts に **接続しない**
 *   - factory は **pure function** (= 副作用なし)
 *   - intentParser.ts の `extractTargetDate` 関数 body は touch しない
 *   - trace.ruleId = "extractTargetDate" を維持 (= 既存 test / observation 互換)
 *
 * 設計書: docs/alter-morning-operation-pipeline-unification-design.md § 3 / § 4
 *         + Phase B v3.2 CEO 承認 (2026-05-11)
 */

import type { Provenance } from "../eventSchema";
import type { SetTargetDateOperationCandidate } from "../planOperationCandidate";
import { wrapOperation, type OperationEnvelope } from "../operationEnvelope";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Date tokens
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DATE_TOKEN_GROUPS: ReadonlyArray<{
  tokens: readonly string[];
  offset: number;
}> = [
  { tokens: ["一昨日", "おととい"], offset: -2 },
  { tokens: ["昨日"], offset: -1 },
  { tokens: ["今日"], offset: 0 },
  { tokens: ["明日"], offset: 1 },
  { tokens: ["明後日", "あさって"], offset: 2 },
  { tokens: ["明明後日", "しあさって"], offset: 3 },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Boundary classifications (= Phase B v3.2 Tier 0 初期 allowlist)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Layer 0: prev kanji DANGER prefix。
 * 「明日」 が「不明日 / 説明日 / 証明日 / 判明日」 等の **語内部 substring** と
 * して出現するケースで、 そこを UNKNOWN に倒すための前方境界 check。
 *
 * 9 字 (= 否定 4 + 業務 compound 5):
 *   不 (不明), 未 (未明), 非 (非), 無 (無明),
 *   説 (説明), 解 (解明), 究 (究明), 証 (証明), 判 (判明)
 */
const DANGER_PREFIX_KANJI = new Set<string>([
  "不", "未", "非", "無",
  "説", "解", "究", "証", "判",
]);

/**
 * Layer 2: ACCEPT_WORD_PREFIXES (= Tier 0 のみ初期 release)。
 *
 * NAME_SUFFIX_KANJI で始まる頻出 compound noun + 曜日 / 日タイプ / 休 series を
 * **明示 allowlist** することで「明日美容院 / 明日子供 / 明日花火 / 明日水曜 /
 * 明日祝日 / 明日休み」 等の頻出予定表現を ACCEPT に倒す。
 *
 * 33 entries (= v3.1 12 + v3.2 新規 21):
 *   - 美/子/花/麻/香 系 compound (= 12)
 *   - 月〜日 曜日 short/long form (= 14)
 *   - 祝日/休日/平日 (= 3)
 *   - 休み/休暇/休校/休業 (= 4)
 *
 * 注意: startsWith 判定は length desc sort で行う (= 「美容院」 を「美容」 より先に
 * test するため)。
 *
 * 拡張規律 (= CEO 承認必須):
 *   - Tier 1 候補: 美容師 / 子守 / 香典 / 代金 / 介護 / 介助
 *   - 保留 candidates: 美味 / 美人 / 麻薬 / 平和 / 太陽 / 太鼓 / 助手 / 江戸 /
 *     代表 / 代行 / 子犬 / 子猫 / 花壇 / 花束 / 花瓶 / 香り
 */
const ACCEPT_WORD_PREFIXES: readonly string[] = [
  // ─── 美/子/花/麻/香 系 compound (= 12 entries) ───
  "花火大会",
  "美容院", "美容室", "美術館",
  "子ども", "子供",
  "美容", "美術",
  "花火", "花見",
  "麻雀", "香水",

  // ─── 曜日 series (= 14 entries) ───
  "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日",
  "月曜",   "火曜",   "水曜",   "木曜",   "金曜",   "土曜",   "日曜",

  // ─── 日タイプ (= 3 entries) ───
  "祝日", "休日", "平日",

  // ─── 休 series (= 4 entries) ───
  "休み", "休暇", "休校", "休業",
].sort((a, b) => b.length - a.length);

/**
 * Layer 3: ACCEPT_KANJI single char (= 42 entries)。
 *
 * 「明日 / 今日 / 昨日 + その漢字」 で **ほぼ確実に common noun starter** である
 * 漢字を明示列挙。 NAME_SUFFIX_KANJI と排他。
 *
 * - 時刻 / 時間帯 / 範囲 (= 12 字): 朝 昼 夜 晩 夕 中 頃 内 末 早 深 午
 * - 活動 / 予定 starter (= 30 字): 会 仕 出 病 学 面 打 授 講 試 検 治 通 残 旅 部
 *   食 飲 散 帰 来 入 退 予 約 集 練 研 訪 招
 */
const ACCEPT_KANJI = new Set<string>([
  "朝", "昼", "夜", "晩", "夕", "中", "頃", "内", "末", "早", "深", "午",
  "会", "仕", "出", "病", "学", "面", "打", "授", "講", "試", "検", "治",
  "通", "残", "旅", "部", "食", "飲", "散", "帰", "来", "入", "退", "予",
  "約", "集", "練", "研", "訪", "招",
]);

/**
 * Layer 4: NAME_SUFFIX_KANJI (= 19 entries)。
 *
 * 「明日 / 今日 / 昨日 + その漢字」 で **強く name 末尾** を疑える漢字を明示列挙。
 * Layer 4 で次の文脈 (= EOS / 敬称 / 別 NAME_SUFFIX / 句読点) を確認し、
 * REJECT (= name 確定) または UNKNOWN (= 曖昧、 後段に委ねる) に振り分ける。
 *
 * - 女性名末尾: 香 子 美 華 菜 奈 花 江 代 恵 紀 沙 麻
 * - 男性名末尾: 太 郎 平 介 助 之
 *
 * Note: 美/子/花/香/麻 は ACCEPT_WORD_PREFIXES で compound noun (= 美容院/子供/
 * 花火/香水/麻雀 等) を救済済。 Layer 2 が Layer 4 より先に走るため、 既知
 * compound は ACCEPT 通過、 未知 compound または name 文脈は Layer 4 に到達。
 */
const NAME_SUFFIX_KANJI = new Set<string>([
  "香", "子", "美", "華", "菜", "奈", "花",
  "江", "代", "恵", "紀", "沙", "麻",
  "太", "郎", "平", "介", "助", "之",
]);

/**
 * Layer 4 副: NAME_PARTICLES (= 8 種)。
 *
 * NAME_SUFFIX_KANJI の直後にこれらが続く場合、 「name + 敬称」 として REJECT 確定。
 * length desc sort で startsWith greedy match (= 「ちゃん」 を「ちゃ」 より先)。
 */
const NAME_PARTICLES: readonly string[] = [
  "ちゃん", "さん", "くん", "先生", "様", "氏", "殿", "君",
].sort((a, b) => b.length - a.length);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Char class helpers (= code-point safe)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * code unit idx 位置から code point を 1 つ取り出す。
 * surrogate pair (= SMP、 例: 𠮷 = U+20BB7) の場合、 高 surrogate position で
 * codePointAt を呼ぶと正しい SMP code point が返る。
 */
function charAt(text: string, idx: number): string | undefined {
  const cp = text.codePointAt(idx);
  if (cp === undefined) return undefined;
  return String.fromCodePoint(cp);
}

/**
 * code point の UTF-16 code unit 幅。
 * BMP → 1、 SMP → 2。
 */
function charWidth(ch: string): number {
  const cp = ch.codePointAt(0);
  return cp !== undefined && cp > 0xffff ? 2 : 1;
}

/**
 * 前方 code point を code-point safe に取得 (= prev SMP 対応)。
 * `text[idx - 1]` だと SMP の low surrogate だけが返るため、 `Array.from` で
 * code point 列に変換してから最後を取る。
 */
function charBefore(text: string, idx: number): string | undefined {
  if (idx <= 0) return undefined;
  const chars = Array.from(text.slice(0, idx));
  return chars.at(-1);
}

const KANJI_RE = /^\p{Script=Han}$/u;
const HIRAGANA_RE = /^[ぁ-ん]$/u;
const KATAKANA_RE = /^[ァ-ヶーｦ-ﾟ]$/u;
const DIGIT_RE = /^[0-9０-９]$/u;
const ASCII_LETTER_RE = /^[A-Za-zＡ-Ｚａ-ｚ]$/u;

const isKanji = (ch: string): boolean => KANJI_RE.test(ch);
const isHiragana = (ch: string): boolean => HIRAGANA_RE.test(ch);
const isKatakana = (ch: string): boolean => KATAKANA_RE.test(ch);
const isDigit = (ch: string): boolean => DIGIT_RE.test(ch);
const isAsciiLetter = (ch: string): boolean => ASCII_LETTER_RE.test(ch);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tri-state boundary decision (= 5-layer)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type BoundaryDecision = "ACCEPT" | "REJECT" | "UNKNOWN";

function boundaryDecision(
  text: string,
  tokenStartIdx: number,
  tokenEndIdx: number,
): BoundaryDecision {
  // ─── Layer 0: prev DANGER prefix kanji check ───
  const prevCh = charBefore(text, tokenStartIdx);
  if (prevCh && DANGER_PREFIX_KANJI.has(prevCh)) {
    return "UNKNOWN";
  }

  // ─── Layer 1: EOS / non-kanji boundary ───
  if (tokenEndIdx >= text.length) return "ACCEPT";
  const nextCh = charAt(text, tokenEndIdx);
  if (!nextCh) return "ACCEPT";
  if (!isKanji(nextCh)) return "ACCEPT";

  // ─── Layer 2: ACCEPT_WORD_PREFIXES (= greedy startsWith) ───
  const rest = text.substring(tokenEndIdx);
  for (const prefix of ACCEPT_WORD_PREFIXES) {
    if (rest.startsWith(prefix)) return "ACCEPT";
  }

  // ─── Layer 3: ACCEPT_KANJI single char ───
  if (ACCEPT_KANJI.has(nextCh)) return "ACCEPT";

  // ─── Layer 4: NAME_SUFFIX_KANJI + checkNamePattern ───
  if (NAME_SUFFIX_KANJI.has(nextCh)) {
    return checkNamePattern(text, tokenEndIdx + charWidth(nextCh));
  }

  // ─── Layer 5: UNKNOWN default ───
  return "UNKNOWN";
}

/**
 * Layer 4 副関数: NAME_SUFFIX_KANJI の後を見て REJECT / UNKNOWN を判定。
 *
 * (a) NAME + EOS → REJECT (= name 単独)
 * (b) NAME + 敬称 (= さん / ちゃん / くん / 先生 / 様 / 氏 / 殿 / 君) → REJECT
 * (c) NAME + 別の NAME_SUFFIX_KANJI → REJECT (= 多字 name、 例: 明日香子)
 * (d) NAME + 句読点 / 記号 / 空白 (= 非 script 文字) → REJECT (= name 単独切れ)
 * (e) その他 (= NAME + ひらがな / カタカナ / 数字 / 英字 / 非 NAME kanji) → UNKNOWN
 */
function checkNamePattern(
  text: string,
  afterNameIdx: number,
): "REJECT" | "UNKNOWN" {
  if (afterNameIdx >= text.length) return "REJECT";

  const rest = text.substring(afterNameIdx);
  for (const particle of NAME_PARTICLES) {
    if (rest.startsWith(particle)) return "REJECT";
  }

  const next2 = charAt(text, afterNameIdx);
  if (!next2) return "REJECT";

  if (isKanji(next2) && NAME_SUFFIX_KANJI.has(next2)) return "REJECT";

  if (
    !isKanji(next2) &&
    !isHiragana(next2) &&
    !isKatakana(next2) &&
    !isDigit(next2) &&
    !isAsciiLetter(next2)
  ) {
    return "REJECT";
  }

  return "UNKNOWN";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Multi-date candidate scan + dedup + ambiguity check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Candidate {
  idx: number;
  length: number;
  offset: number;
}

/**
 * Overlap dedup: 長 token を優先して greedy に kept set を構築する。
 *
 * 例: 「明明後日」 で 明明後日 (idx=0, len=4) と 明後日 (idx=1, len=3) が両方
 * ACCEPT になった場合、 長いほうを優先して短いほうは drop する (= range
 * 重複)。
 */
function dedupOverlaps(candidates: Candidate[]): Candidate[] {
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  const kept: Candidate[] = [];
  for (const c of sorted) {
    const overlaps = kept.some(
      (k) =>
        Math.max(c.idx, k.idx) < Math.min(c.idx + c.length, k.idx + k.length),
    );
    if (!overlaps) kept.push(c);
  }
  return kept;
}

/**
 * utterance を全 date token で scan し、 ACCEPT candidate を全件収集 →
 * overlap dedup → distinct offset 検査 → 単一 offset (= 今日 除く) で emit。
 */
function scanForRegexDate(utterance: string): number | null {
  const candidates: Candidate[] = [];

  for (const { tokens, offset } of DATE_TOKEN_GROUPS) {
    for (const token of tokens) {
      let pos = 0;
      while (pos < utterance.length) {
        const idx = utterance.indexOf(token, pos);
        if (idx === -1) break;
        const tokenEnd = idx + token.length;
        if (boundaryDecision(utterance, idx, tokenEnd) === "ACCEPT") {
          candidates.push({ idx, length: token.length, offset });
        }
        pos = idx + 1;
      }
    }
  }

  if (candidates.length === 0) return null;

  // overlap dedup
  const deduped = dedupOverlaps(candidates);

  // multi-date ambiguity: distinct offset が 2 以上 → no emit
  const uniqueOffsets = new Set(deduped.map((c) => c.offset));
  if (uniqueOffsets.size > 1) return null;

  // single offset: 今日 (= 0) なら no emit、 それ以外 emit
  const offset = [...uniqueOffsets][0];
  if (offset === 0) return null;
  return offset;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JST date computation (= TZ-invariant via UTC arithmetic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在時刻 (= `now`) を JST に shift して、 そこから `offset` 日進めた日付を
 * `YYYY-MM-DD` 文字列で返す。
 *
 * 実装: 内部 ms に +9h を加算 → 結果を UTC field で読む (= JST 時刻を UTC
 * 表現として扱う)。 これにより local TZ (= JST / UTC / PST / etc.) に依存
 * しない計算が成立する。
 *
 * test では `vi.useFakeTimers()` + `vi.setSystemTime()` で `new Date()` を
 * 固定可能。 `now` を明示的に渡せる引数化で test injection も可能。
 */
function computeJstDateFromOffset(
  offset: number,
  now: Date = new Date(),
): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  jst.setUTCDate(jst.getUTCDate() + offset);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RegexTargetDateInput {
  /**
   * 解析対象 utterance。
   * 空文字 / 日付 signal なし / 多日 ambiguity → factory は空配列を返す。
   */
  utterance: string;

  /** 抽出 turn (= trace 用、 optional) */
  sourceTurnIndex?: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory entry point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 5-layer boundary check + multi-date ambiguity 対応で、 deterministic な日付
 * signal を `set_target_date` candidate envelope に wrap する。
 *
 * 動作:
 *   - utterance 空 → 空配列
 *   - 日付 token なし / 全 candidate UNKNOWN または REJECT → 空配列
 *   - 多日 ambiguity (= distinct offset 2 以上) → 空配列
 *   - 今日 (offset 0) のみ ACCEPT → 空配列
 *   - 単一 offset (= 0 以外) → 1 envelope
 *
 * envelope 値:
 *   - source: regex_deterministic
 *   - priority: 600
 *   - confidence: high (= deterministic match)
 *   - provenance: utterance, source_span [] (= 個別 span 不返却)
 *   - trace.ruleId: "extractTargetDate" (= 既存 test / observation 互換維持)
 *
 * @param input utterance + sourceTurnIndex (= optional)
 * @returns 0 or 1 件の envelope (= 配列)
 */
export function regexTargetDateFactory(
  input: RegexTargetDateInput,
): OperationEnvelope<SetTargetDateOperationCandidate>[] {
  if (!input.utterance) {
    return [];
  }

  const offset = scanForRegexDate(input.utterance);
  if (offset === null) {
    return [];
  }

  const date = computeJstDateFromOffset(offset);

  const provenance: Provenance = {
    source_type: "utterance",
    source_span: [],
    provenance_confidence: "high",
    from_utterance: true,
  };

  return [
    wrapOperation(
      {
        type: "set_target_date",
        payload: { date },
      },
      {
        source: "regex_deterministic",
        priority: 600,
        confidence: "high",
        provenance,
        ...(input.sourceTurnIndex !== undefined
          ? { trace: { sourceTurnIndex: input.sourceTurnIndex, ruleId: "extractTargetDate" } }
          : { trace: { ruleId: "extractTargetDate" } }),
      },
    ),
  ];
}
