import type { RendezvousCategory, DealbreakerProfile } from "./types";

/**
 * Dealbreaker（絶対条件）チェック
 *
 * パートナーカテゴリでは「子どもの希望」「結婚意欲」の致命的不一致を
 * スコア計算前にブロックする。
 *
 * 他カテゴリ（友達・共創・コミュニティ）ではdealbreaker不要。
 * romanticは軽めのチェックのみ（結婚意欲の極端な差）。
 *
 * 設計思想:
 * - "相手に合わせる" / "未定" は柔軟 → ブロックしない
 * - "欲しい" × "いらない" は致命的 → 即ブロック
 * - "すぐにでも" × "考えていない" は致命的 → 即ブロック
 */

type DealbreakerResult = {
  pass: boolean;
  /** ブロック理由（UIには表示しない。ログ・デバッグ用） */
  reason?: string;
};

// ---------- Children compatibility ----------

const CHILDREN_FLEXIBLE = new Set(["相手に合わせる", "未定"]);

function childrenCompatible(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a || !b) return true; // 未入力は柔軟扱い
  if (CHILDREN_FLEXIBLE.has(a) || CHILDREN_FLEXIBLE.has(b)) return true;
  // "欲しい" × "いらない" → incompatible
  return a === b;
}

// ---------- Marriage intent compatibility ----------

const MARRIAGE_INTENT_RANK: Record<string, number> = {
  "すぐにでも": 4,
  "2-3年以内": 3,
  "いい人がいれば": 2,
  "考えていない": 1,
};

function marriageIntentCompatible(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (!a || !b) return true;
  const rankA = MARRIAGE_INTENT_RANK[a] ?? 2;
  const rankB = MARRIAGE_INTENT_RANK[b] ?? 2;
  // 差が3以上 = "すぐにでも" × "考えていない" → incompatible
  return Math.abs(rankA - rankB) < 3;
}

// ---------- Lifestyle compatibility ----------

/**
 * ライフスタイルスライダー互換性チェック
 * 差が threshold を超えたら incompatible
 * 未入力は柔軟扱い（通過）
 */
function lifestyleCompatible(
  a: number | undefined,
  b: number | undefined,
  threshold: number,
): boolean {
  if (a === undefined || b === undefined) return true;
  return Math.abs(a - b) < threshold;
}

// ---------- Smoking compatibility ----------

/**
 * 喫煙互換性チェック（Partner 専用）
 *
 * 結婚後の同居を前提とすると、喫煙は妥協が難しい。
 * - "絶対NG" × "毎日吸う" → 即ブロック
 * - "絶対NG" × "たまに吸う" → ブロック
 * - "たまにならOK" × "毎日吸う" → 通過（注意レベル、Dealbreaker ではない）
 * - "気にしない" → 常に通過
 * - 未入力 → 通過
 */
function smokingCompatible(
  aStatus: string | undefined,
  aTolerance: string | undefined,
  bStatus: string | undefined,
  bTolerance: string | undefined,
): boolean {
  // A の許容度 vs B の喫煙状態
  if (!checkOneDirection(aTolerance, bStatus)) return false;
  // B の許容度 vs A の喫煙状態
  if (!checkOneDirection(bTolerance, aStatus)) return false;
  return true;
}

function checkOneDirection(
  tolerance: string | undefined,
  partnerStatus: string | undefined,
): boolean {
  if (!tolerance || !partnerStatus) return true;
  if (tolerance === "気にしない") return true;
  if (tolerance === "絶対NG" && partnerStatus !== "吸わない") return false;
  if (tolerance === "たまにならOK" && partnerStatus === "毎日吸う") return false;
  return true;
}

// ---------- Prefecture compatibility ----------

/**
 * 居住地域互換性チェック（Partner 専用）
 *
 * 結婚後の生活圏が重要。
 * - 片方でも希望エリアを指定していて、相手の現住所がそこに入っていない → ブロック
 * - 希望エリア未指定 → 通過
 * - 相手の都道府県情報がない → 通過（情報不足でブロックしない）
 */
function prefectureCompatible(
  aPreferred: string[] | undefined,
  bPrefecture: string | undefined,
  bPreferred: string[] | undefined,
  aPrefecture: string | undefined,
): boolean {
  // A が希望エリアを持ち、B の居住地がそこに含まれない → ブロック
  if (aPreferred?.length && bPrefecture && !aPreferred.includes(bPrefecture)) {
    return false;
  }
  // B が希望エリアを持ち、A の居住地がそこに含まれない → ブロック
  if (bPreferred?.length && aPrefecture && !bPreferred.includes(aPrefecture)) {
    return false;
  }
  return true;
}

// ---------- Religion compatibility ----------

/**
 * 宗教互換性チェック（Partner 専用）
 *
 * 宗教は文化的価値観の根幹に関わる。
 * - "必須一致" × 異なる宗教 → ブロック
 * - "理解があればOK" → 通過（注意レベル）
 * - "気にしない" → 常に通過
 * - 未入力 → 通過
 *
 * 注: "なし" 同士は一致扱い
 */
function religionCompatible(
  aReligion: string | undefined,
  aImportance: string | undefined,
  bReligion: string | undefined,
  bImportance: string | undefined,
): boolean {
  // 片方でも未入力 → 通過
  if (!aReligion || !bReligion) return true;

  const sameReligion = aReligion === bReligion;

  // A が必須一致で、異なる宗教 → ブロック
  if (aImportance === "必須一致" && !sameReligion) return false;
  // B が必須一致で、異なる宗教 → ブロック
  if (bImportance === "必須一致" && !sameReligion) return false;

  return true;
}

// ---------- Main dealbreaker check ----------

export function checkDealbreakers(params: {
  category: RendezvousCategory;
  profileA: DealbreakerProfile | undefined;
  profileB: DealbreakerProfile | undefined;
}): DealbreakerResult {
  const { category, profileA, profileB } = params;

  // 友達・共創・コミュニティ → dealbreaker不要
  if (
    category === "friendship" ||
    category === "cocreation" ||
    category === "community"
  ) {
    return { pass: true };
  }

  // プロフィール未入力 → 通過（データがないのでブロックしない）
  if (!profileA || !profileB) {
    return { pass: true };
  }

  // パートナー: 最も厳格（6項目の絶対条件チェック）
  //
  // Dealbreaker 一覧:
  // 1. 子どもの希望 — 妥協不可能な因子
  // 2. 結婚意欲 — "すぐにでも" × "考えていない" は致命的
  // 3. 朝型/夜型 — 同居時の慢性的生活リズム乖離
  // 4. 喫煙 — 同居前提で妥協が難しい
  // 5. 居住地域 — 生活圏の根本的不一致
  // 6. 宗教 — 文化的価値観の根幹
  if (category === "partner") {
    // 1. 子どもの希望
    if (!childrenCompatible(profileA.childrenPreference, profileB.childrenPreference)) {
      return {
        pass: false,
        reason: "children_preference_incompatible",
      };
    }

    // 2. 結婚意欲
    if (!marriageIntentCompatible(profileA.marriageIntent, profileB.marriageIntent)) {
      return {
        pass: false,
        reason: "marriage_intent_incompatible",
      };
    }

    // 3. 朝型/夜型の極端な差（同居時の慢性的ストレス）
    if (!lifestyleCompatible(profileA.lifestyleMorningNight, profileB.lifestyleMorningNight, 75)) {
      return {
        pass: false,
        reason: "lifestyle_morning_night_incompatible",
      };
    }

    // 4. 喫煙（"絶対NG" × 喫煙者 → ブロック）
    if (!smokingCompatible(
      profileA.smokingStatus, profileA.smokingTolerance,
      profileB.smokingStatus, profileB.smokingTolerance,
    )) {
      return {
        pass: false,
        reason: "smoking_incompatible",
      };
    }

    // 5. 居住地域（希望エリア外 → ブロック）
    if (!prefectureCompatible(
      profileA.preferredPrefectures, profileB.prefecture,
      profileB.preferredPrefectures, profileA.prefecture,
    )) {
      return {
        pass: false,
        reason: "prefecture_incompatible",
      };
    }

    // 6. 宗教（"必須一致" × 異なる宗教 → ブロック）
    if (!religionCompatible(
      profileA.religion, profileA.religionImportance,
      profileB.religion, profileB.religionImportance,
    )) {
      return {
        pass: false,
        reason: "religion_incompatible",
      };
    }
  }

  // ロマンティック: 軽めのチェック（結婚意欲の極端な差のみ）
  if (category === "romantic") {
    if (!marriageIntentCompatible(profileA.marriageIntent, profileB.marriageIntent)) {
      return {
        pass: false,
        reason: "marriage_intent_incompatible",
      };
    }
  }

  return { pass: true };
}
