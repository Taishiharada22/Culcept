/**
 * CoAlter Slot Validator — Phase 1.5.4.5
 *
 * 目的: LLM の出力品質を機械的に保証する第二層。
 *
 * 責務:
 *  1. slot の粒度チェック（「駅周辺」「人気店」など抽象は reject）
 *  2. テーマ固有の最低粒度（movie=作品名 / food=店舗固有名詞 / travel=固有地名）
 *  3. agreedConstraints（hard）違反検査
 *  4. reject 理由を reason code で返す（re-prompt 品質向上 + ログ監査）
 *
 * 設計原則:
 *  - boolean でなく reason code を返す（LLM re-prompt に使える）
 *  - hard constraint のみ強制、soft は reasoning 強調にとどめる
 *  - 誤 reject を恐れて緩くするより、抽象候補を落とす方針（CoAlter の強みは具体性）
 */

import type {
  AgreedConstraint,
  CandidateValidationResult,
  ConversationTheme,
  ProposalCandidate,
  ValidationReasonCode,
} from "./types";
import { getThemeRule, type SlotBundle, type SlotContent } from "./slots";

// ─────────────────────────────────────────────
// 抽象語辞書
// ─────────────────────────────────────────────

/**
 * 「これだけで終わっていたら具体性に欠ける」語のリスト。
 *
 * 固有名詞と組み合わさっていれば OK（例: 「渋谷ストリーム」は通す、「渋谷駅周辺」は落とす）。
 */
const ABSTRACT_TOKENS = [
  "周辺",
  "駅前",
  "駅近",
  "駅から",
  "人気店",
  "人気",
  "おすすめ",
  "有名",
  "安い店",
  "リーズナブル",
  "ヘルシー",
  "美味しい店",
  "おいしい",
  "近く",
  "近場",
  "この辺",
  "いいお店",
  "良いお店",
  "雰囲気のいい",
  "お店",
  "レストラン",
] as const;

/**
 * 抽象語「のみ」で構成されているかを判定。
 *
 * 例:
 *  - "渋谷駅周辺" → true（"渋谷" + 抽象語 "駅周辺"。固有が地名1個のみで抽象語が支配的）
 *  - "渋谷ストリーム" → false（固有名詞）
 *  - "人気のラーメン店" → true
 *  - "一蘭" → false（固有名詞）
 */
function isAbstractOnly(label: string): boolean {
  if (!label) return true;
  const trimmed = label.trim();
  if (trimmed.length === 0) return true;

  // 抽象語を含むか？
  const hasAbstract = ABSTRACT_TOKENS.some((t) => trimmed.includes(t));
  if (!hasAbstract) return false;

  // 固有名詞的なシグナルがあるか？
  // - カタカナ3文字以上の連続（カタカナ固有名詞）
  // - 『』『 』で囲まれた作品名
  // - 具体的な店舗名らしい語尾（「亭」「屋」「庵」「カフェ」+ 固有 等）
  const hasKatakanaProperNoun = /[\u30A0-\u30FF]{3,}/.test(trimmed);
  const hasBracketedTitle = /[『「【〈].+[』」】〉]/.test(trimmed);
  // 漢字3文字以上の連続で、かつ一般名詞語尾じゃないもの
  const hasKanjiProperNoun = /[\u4E00-\u9FFF]{2,}/.test(trimmed) &&
    !ABSTRACT_TOKENS.every((t) => trimmed.includes(t));

  // カタカナ固有名詞 or 鉤括弧作品名 がないなら抽象的
  if (hasKatakanaProperNoun || hasBracketedTitle) return false;

  // 漢字のみで、抽象語を含む場合 → 抽象と判定（「人気ラーメン店」等）
  // 「渋谷の一蘭」のように抽象語 + 固有名詞らしきものがある場合は通す
  // ざっくり: 抽象語を除いた部分が2文字以上残るか
  let residual = trimmed;
  for (const t of ABSTRACT_TOKENS) {
    residual = residual.split(t).join("");
  }
  residual = residual.replace(/[のでをにはが、。・\s]/g, "");

  // 地名リスト（「渋谷」「新宿」等）— これらだけが残っても抽象扱い
  const GENERIC_AREA_NAMES = [
    "渋谷", "新宿", "池袋", "銀座", "六本木", "表参道", "原宿",
    "吉祥寺", "横浜", "大阪", "京都", "名古屋", "福岡", "札幌", "神戸",
    "東京", "品川", "渋谷駅", "新宿駅", "東京駅",
  ];
  const isOnlyAreaName = GENERIC_AREA_NAMES.some((a) => residual === a || residual.replace(a, "") === "");
  if (isOnlyAreaName) return true;

  // 残存文字が2文字未満 = 固有名詞がほぼ無い
  if (residual.length < 2) return true;

  // 漢字のみの残存が3文字以上あるなら固有名詞の可能性あり
  if (hasKanjiProperNoun && residual.length >= 3) return false;

  return true;
}

// ─────────────────────────────────────────────
// 作品名パターン（movie.what 専用）
// ─────────────────────────────────────────────

/**
 * movie の what が具体的な作品名を含むか。
 *
 * OK: 『ラストマイル』、"君の名は。"、「THE FIRST SLAM DUNK」、"ラストマイル"
 * NG: 「恋愛映画」「サスペンス」「話題の新作」
 */
function looksLikeMovieTitle(label: string): boolean {
  if (!label) return false;
  const trimmed = label.trim();

  // 活動ラベル単独は NG（タイトル無しでアクティビティだけ書いているケース）
  const ACTIVITY_ONLY = [
    "映画鑑賞", "映画観賞", "映画を観る", "映画を見る", "映画視聴",
    "映画体験", "映画館", "シネマ", "シネマ鑑賞", "映画デート",
    "ムービー", "映画", "観賞", "鑑賞",
  ];
  if (ACTIVITY_ONLY.some((a) => trimmed === a)) return false;
  // 「XXX映画鑑賞」「映画鑑賞XXX」のような接辞のみの拡張も NG
  if (ACTIVITY_ONLY.some((a) => {
    const stripped = trimmed.replace(a, "").trim();
    return stripped.length === 0 || stripped.length < 2;
  })) {
    // 作品名を含んでいる可能性を最低限残す: 括弧付きタイトルがあれば別
    if (!/[『「【〈].+[』」】〉]/.test(trimmed)) return false;
  }

  // 抽象ジャンル名だけの場合は NG（最優先でチェック）
  const GENRE_ONLY = [
    "恋愛映画", "恋愛", "アクション", "サスペンス", "ホラー",
    "コメディ", "SF", "ファンタジー", "ドキュメンタリー", "ミステリー",
    "話題の", "話題作", "新作", "最新作", "人気作",
    "ロマンス", "青春", "感動", "泣ける",
    "話題の新作", "話題の映画", "最新作", "人気の映画",
  ];
  if (GENRE_ONLY.some((g) => trimmed === g)) return false;
  // ジャンル名 + 「映画」で終わるだけ（「恋愛映画」等）
  if (GENRE_ONLY.some((g) => trimmed.replace(g, "").replace("映画", "").trim() === "")) {
    return false;
  }
  // 「話題の X」「最新作 X」などジャンル接頭 + 一般名詞
  const GENRE_PREFIXES = ["話題の", "最新の", "人気の", "おすすめの"];
  if (GENRE_PREFIXES.some((p) => {
    if (!trimmed.startsWith(p)) return false;
    const rest = trimmed.slice(p.length);
    const GENERIC_NOUNS = ["新作", "映画", "作品", "もの"];
    return GENERIC_NOUNS.some((n) => rest === n);
  })) return false;

  // 括弧付き（『』「」【】）は作品名の典型
  if (/[『「【〈].+[』」】〉]/.test(trimmed)) return true;

  // カタカナ3文字以上の連続（カタカナ作品名）
  if (/[\u30A0-\u30FF]{3,}/.test(trimmed)) return true;

  // 英数字タイトル（"THE FIRST SLAM DUNK" 等）
  if (/[A-Z][A-Z\s]{3,}/.test(trimmed)) return true;

  // 漢字 or ひらがな混在の 3文字以上 → 日本語タイトルの可能性
  if (trimmed.length >= 3 && /[\u4E00-\u9FFF\u3040-\u309F]/.test(trimmed)) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// 密度チェック（practicalInfo / slot detail が薄すぎないか）
// ─────────────────────────────────────────────

/**
 * practicalInfo が「数字が含まれる具体情報」を最低2項目持っているか。
 *
 * 数字項目の種類:
 *  - 評価スコア（★/点/4.2 のような小数）
 *  - 時刻（15:00〜 / 19:00 等）
 *  - 料金（1,500円 / ¥1500 / 大人 1900 等）
 *  - 所要・上映時間（118分 / 2時間 等）
 *  - 徒歩分（駅徒歩5分 等）
 *
 * practicalInfo が null の場合でも、slot.detail に密度があれば救済。
 */
function hasDensePracticalInfo(
  candidate: ProposalCandidate,
  _theme: ConversationTheme,
): boolean {
  // practicalInfo + 全 slot の detail を結合
  const text = [
    candidate.practicalInfo ?? "",
    ...Object.values(candidate.slots ?? {}).flatMap((s) =>
      s ? [s.detail ?? ""] : [],
    ),
  ].join(" ");

  if (text.trim().length === 0) return false;

  // 数字を含む情報項目を数える
  let score = 0;
  // 評価系
  if (/★\s*\d|\d\.\d{1,2}\s*点|\d\.\d{1,2}\s*\/\s*5|Filmarks?[^\n]{0,6}\d\.\d/.test(text)) {
    score += 1;
  }
  // 時刻
  if (/\b\d{1,2}:\d{2}/.test(text)) {
    score += 1;
  }
  // 料金
  if (/(¥|\\)?\s?[\d,]{3,6}\s*円|\bprice|\d{3,5}\s*〜|\d{3,5}\s*-\s*\d{3,5}/.test(text)) {
    score += 1;
  }
  // 所要・上映時間
  if (/\d{2,3}\s*分|\d\s*時間|\d+h\b/.test(text)) {
    score += 1;
  }
  // 徒歩分 / 距離
  if (/徒歩\s*\d|駅\s*\d\s*分|\d\s*km/.test(text)) {
    score += 1;
  }

  // テーマ別に要求数を変える余地があるが、共通で「2項目以上」を最低ラインに
  return score >= 2;
}

// ─────────────────────────────────────────────
// slot 単位の validation
// ─────────────────────────────────────────────

function validateSlot(
  theme: ConversationTheme,
  slotKey: "what" | "where" | "when" | "who" | "why" | "how",
  content: SlotContent | undefined,
): ValidationReasonCode[] {
  if (!content || !content.label) return []; // optional slot は空でよい

  const label = content.label.trim();

  // 抽象語チェック
  if (isAbstractOnly(label)) {
    if (slotKey === "where") return ["abstract_where"];
    if (slotKey === "what") return ["abstract_what"];
    // その他の slot も抽象なら落とすが、主要2つに絞って返す
  }

  // テーマ固有のチェック
  if (theme === "movie" && slotKey === "what") {
    if (!looksLikeMovieTitle(label)) return ["missing_movie_title"];
  }

  return [];
}

// ─────────────────────────────────────────────
// agreedConstraints 違反検査
// ─────────────────────────────────────────────

/**
 * 候補が hard constraint に違反しているかチェック。
 */
function checkAgreedConstraintsViolation(
  candidate: ProposalCandidate,
  constraints: AgreedConstraint[],
): { reasons: ValidationReasonCode[]; violated: string[] } {
  const reasons: ValidationReasonCode[] = [];
  const violated: string[] = [];

  // 候補の全テキスト（title + oneLiner + slots の label/detail）を結合
  const candidateText = [
    candidate.title,
    candidate.oneLiner,
    candidate.practicalInfo ?? "",
    ...Object.values(candidate.slots ?? {}).flatMap((s) =>
      s ? [s.label, s.detail ?? ""] : [],
    ),
  ].join(" ");

  for (const c of constraints) {
    if (c.strength !== "hard") continue;

    // ── exclusion: 候補が除外ターゲットを含んでいたら違反 ──
    if (c.kind === "exclusion") {
      // "exclude:attached_venue" 特化
      if (c.normalizedValue === "exclude:attached_venue") {
        // 候補が映画館併設のレストランを提示していたら違反
        if (/併設|一緒|同じ場所|ビル内|同じビル/.test(candidateText)) {
          reasons.push("violates_exclusion");
          violated.push(c.sourceText);
        }
      } else if (c.normalizedValue.startsWith("exclude:")) {
        // 汎用 exclusion: normalized から除外ターゲット語を取得
        const target = c.normalizedValue.slice("exclude:".length);
        if (target && target.length > 1 && candidateText.includes(target)) {
          reasons.push("violates_exclusion");
          violated.push(c.sourceText);
        }
      }
    }

    // ── budget: 候補の detail に予算情報があれば比較 ──
    if (c.kind === "budget") {
      const priceMatch = candidateText.match(/(\d{3,5})\s*円/);
      if (!priceMatch) continue;
      const price = Number(priceMatch[1]);

      if (c.normalizedValue.startsWith("budget_max:")) {
        const max = Number(c.normalizedValue.split(":")[1]);
        if (Number.isFinite(max) && price > max * 1.2) {
          // 20% の buffer を許容
          reasons.push("violates_budget");
          violated.push(c.sourceText);
        }
      } else if (c.normalizedValue.startsWith("budget_around:")) {
        const center = Number(c.normalizedValue.split(":")[1]);
        if (Number.isFinite(center) && (price > center * 1.5 || price < center * 0.5)) {
          // ±50% を許容範囲に
          reasons.push("violates_budget");
          violated.push(c.sourceText);
        }
      } else if (c.normalizedValue.startsWith("budget_range:")) {
        const range = c.normalizedValue.split(":")[1];
        const [lo, hi] = range.split("-").map(Number);
        if (Number.isFinite(lo) && Number.isFinite(hi) && (price < lo * 0.8 || price > hi * 1.2)) {
          reasons.push("violates_budget");
          violated.push(c.sourceText);
        }
      } else if (c.normalizedValue.startsWith("budget_per_person:")) {
        const perPerson = Number(c.normalizedValue.split(":")[1]);
        if (Number.isFinite(perPerson) && price > perPerson * 2.5) {
          // 1人5000円と合意 → 1万円超は違反
          reasons.push("violates_budget");
          violated.push(c.sourceText);
        }
      }
    }

    // ── style: OR 合意（「A か B」） → どちらかを満たしてなければ違反 ──
    if (c.kind === "style" && c.normalizedValue.startsWith("style_or:")) {
      const options = c.normalizedValue.slice("style_or:".length).split("|");
      const anyMatch = options.some((opt) => candidateText.includes(opt));
      if (!anyMatch) {
        reasons.push("violates_style");
        violated.push(c.sourceText);
      }
    }

    // ── companions: 今回は検査対象外（候補 text に表れないことが多い） ──
  }

  return { reasons: [...new Set(reasons)], violated };
}

// ─────────────────────────────────────────────
// テーマ固有の最低粒度チェック
// ─────────────────────────────────────────────

function validateThemeMinimum(
  theme: ConversationTheme,
  slots: SlotBundle | undefined,
): ValidationReasonCode[] {
  const rule = getThemeRule(theme);
  if (!rule) return []; // テーマルール未定義なら検査スキップ

  if (!slots || Object.keys(slots).length === 0) {
    return ["empty_slots"];
  }

  const reasons: ValidationReasonCode[] = [];

  // core slot 欠落
  const coreContent = slots[rule.core];
  if (!coreContent || !coreContent.label) {
    reasons.push("missing_core_slot");
  }

  // テーマ固有の追加チェック
  if (theme === "food") {
    // food の where は店舗固有名詞が望ましい
    const where = slots.where;
    if (where && where.label && isAbstractOnly(where.label)) {
      if (!reasons.includes("abstract_where")) {
        reasons.push("missing_venue_proper_noun");
      }
    }
  }

  if (theme === "travel") {
    // travel の where は固有地名（観光地名 or 施設名）が望ましい
    const where = slots.where;
    if (where && where.label && isAbstractOnly(where.label)) {
      reasons.push("missing_venue_proper_noun");
    }
  }

  return reasons;
}

// ─────────────────────────────────────────────
// メインAPI
// ─────────────────────────────────────────────

/**
 * 1 候補の validation。
 *
 * @returns { ok, reasons, violatedConstraints }
 *   - ok: reject せず採用可能か
 *   - reasons: reject 理由（re-prompt や admin dashboard 表示に使う）
 *   - violatedConstraints: 違反した制約の sourceText（監査用）
 */
export function validateCandidate(
  candidate: ProposalCandidate,
  theme: ConversationTheme,
  agreedConstraints: AgreedConstraint[] = [],
): CandidateValidationResult {
  const reasons: ValidationReasonCode[] = [];
  const violated: string[] = [];

  // 1. slot 単位の粒度チェック
  if (candidate.slots) {
    for (const key of ["what", "where", "when", "who", "why", "how"] as const) {
      const r = validateSlot(theme, key, candidate.slots[key]);
      reasons.push(...r);
    }
  }

  // 2. テーマ固有の最低粒度
  const themeReasons = validateThemeMinimum(theme, candidate.slots);
  reasons.push(...themeReasons);

  // 3. agreedConstraints (hard) 違反
  const violationCheck = checkAgreedConstraintsViolation(
    candidate,
    agreedConstraints,
  );
  reasons.push(...violationCheck.reasons);
  violated.push(...violationCheck.violated);

  // 4. practicalInfo 密度チェック（movie/food/travel は具体数値3項目以上を期待）
  if (theme === "movie" || theme === "food" || theme === "travel") {
    if (!hasDensePracticalInfo(candidate, theme)) {
      reasons.push("thin_practical_info");
    }
  }

  // 重複除去
  const uniqReasons = [...new Set(reasons)];

  return {
    ok: uniqReasons.length === 0,
    reasons: uniqReasons,
    violatedConstraints: violated,
  };
}

/**
 * カード全体の validation（候補配列の reject）。
 *
 * @returns reject されずに残った候補 + 各候補の reason code
 */
export function validateCandidates(
  candidates: ProposalCandidate[],
  theme: ConversationTheme,
  agreedConstraints: AgreedConstraint[] = [],
): {
  accepted: ProposalCandidate[];
  rejected: Array<{ candidate: ProposalCandidate; result: CandidateValidationResult }>;
} {
  const accepted: ProposalCandidate[] = [];
  const rejected: Array<{ candidate: ProposalCandidate; result: CandidateValidationResult }> = [];

  for (const c of candidates) {
    const result = validateCandidate(c, theme, agreedConstraints);
    if (result.ok) {
      accepted.push(c);
    } else {
      rejected.push({ candidate: c, result });
    }
  }

  return { accepted, rejected };
}

/**
 * reason code を日本語の短いサマリに変換（re-prompt や UI 表示用）。
 */
export function reasonCodeToText(code: ValidationReasonCode): string {
  const map: Record<ValidationReasonCode, string> = {
    abstract_where: "場所が抽象（「駅周辺」「近く」等）",
    abstract_what: "内容が抽象（ジャンルだけ等）",
    missing_movie_title: "作品名が具体でない（ジャンルだけ）",
    missing_venue_proper_noun: "店舗/施設の固有名詞が無い",
    missing_station_or_area: "最寄駅/エリア情報が無い",
    missing_budget_band: "予算帯が不明",
    violates_exclusion: "会話の除外条件に違反",
    violates_budget: "予算制約に違反",
    violates_companions: "同席条件に違反",
    violates_style: "ジャンル/形式の合意に違反",
    missing_core_slot: "テーマの主軸スロットが埋まってない",
    duplicate_candidate: "既出候補と重複",
    empty_slots: "5W1H slots が空",
    candidates_too_similar: "3案が実質同じ（差分が無い）",
    thin_practical_info: "現実情報（時間/料金/評価等）が薄い",
  };
  return map[code] ?? code;
}

// ─────────────────────────────────────────────
// 3案差分 validator（候補間の意味的差異をチェック）
// ─────────────────────────────────────────────

/**
 * 3つ（以上）の候補が「意味的に違う」かチェック。
 *
 * 判定基準（1つでも引っかかれば too_similar）:
 *  - 全候補の coreSlot.label が同一 or 全部空
 *  - 全候補の axisScores が実質同一（差のある軸が 2 未満）
 *  - 全候補の title が同一
 *
 * @returns true = 意味的に違う（OK） / false = 類似しすぎ（reject）
 */
export function validateCandidatesDiversity(
  candidates: ProposalCandidate[],
  theme: ConversationTheme,
): { ok: boolean; reason?: ValidationReasonCode } {
  if (candidates.length < 2) return { ok: true };

  const rule = getThemeRule(theme);
  const coreKey = rule?.core;

  // 1. core slot の label が全部同じ or 全部空 → NG
  if (coreKey) {
    const coreLabels = candidates.map((c) => {
      const slot = c.slots?.[coreKey];
      return slot?.label?.trim() ?? "";
    });
    const nonEmptyLabels = coreLabels.filter((l) => l.length > 0);
    if (nonEmptyLabels.length === 0) {
      return { ok: false, reason: "candidates_too_similar" };
    }
    const uniqueCoreLabels = new Set(nonEmptyLabels);
    if (uniqueCoreLabels.size === 1 && candidates.length >= 2) {
      // 全候補が同じ作品 / 同じ店
      return { ok: false, reason: "candidates_too_similar" };
    }
  }

  // 2. title 全部同じ → NG
  const titles = candidates.map((c) => c.title?.trim() ?? "");
  const uniqueTitles = new Set(titles.filter((t) => t.length > 0));
  if (uniqueTitles.size === 1 && candidates.length >= 2) {
    return { ok: false, reason: "candidates_too_similar" };
  }

  // 3. axisScores: 軸ごとに「2つ以上の異なる値があるか」カウント
  //    差のある軸が 2 未満なら too_similar
  const allAxisKeys = new Set<string>();
  for (const c of candidates) {
    if (c.axisScores) {
      for (const k of Object.keys(c.axisScores)) allAxisKeys.add(k);
    }
  }

  if (allAxisKeys.size > 0) {
    let variedAxisCount = 0;
    for (const k of allAxisKeys) {
      const values = candidates
        .map((c) => c.axisScores?.[k as keyof typeof c.axisScores])
        .filter((v): v is 0 | 1 | 2 | 3 => typeof v === "number");
      if (values.length < 2) continue;
      const unique = new Set(values);
      if (unique.size >= 2) variedAxisCount += 1;
    }
    // 3案の場合、軸で2つ以上違いがないと「全部同じ方向」になる
    if (candidates.length >= 3 && variedAxisCount < 2) {
      return { ok: false, reason: "candidates_too_similar" };
    }
  }

  return { ok: true };
}

/** テスト用の内部 export */
export const __internal = {
  isAbstractOnly,
  looksLikeMovieTitle,
  validateSlot,
  validateThemeMinimum,
  checkAgreedConstraintsViolation,
  hasDensePracticalInfo,
  validateCandidatesDiversity,
};
