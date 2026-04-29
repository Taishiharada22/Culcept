/**
 * typicalDuration — アクティビティから typical 所要時間を推論する pure helper
 *
 * CEO 2026-04-29 PR #44 directive:
 *   「a時b分〜c時d分 の中で、aだけわかってる だったら b は聞かなくていいから c+d を聞く」
 *   「指定の時間がなかったら alter で決めちゃっていい」
 *
 *   2 段階アプローチ:
 *     (a) ユーザーが時間構造の一部だけ与えた → 不足分を **clarify で聞く**
 *     (b) アクティビティ + 場所から typical duration を推論 → **聞かない**
 *
 *   例:
 *     - 「9時にコーヒー」 → コーヒーは典型 30-45 分 → 推論で 9:45 → 聞かない
 *     - 「9時に打ち合わせ」 → 打ち合わせ時間は varied → typical 60 分推論 (or clarify)
 *     - 「12時にランチ」 → ランチは典型 60 分
 *
 * 設計原則:
 *   - **pure**: 副作用なし、env / flag を読まない
 *   - **deterministic**: 同じ入力で常に同じ出力
 *   - **conservative**: 不明な場合は default 60 分 (運用安全側)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Activity → typical duration (分) 辞書
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ActivityDuration {
  /** 推奨 typical duration (分) */
  typical: number;
  /** 推論信頼度 (high / medium / low) — high なら clarify せず即推論、low なら clarify */
  confidence: "high" | "medium" | "low";
  /** match した keyword (debug / trace 用) */
  matchedKeyword?: string;
}

/**
 * activity 文字列から typical duration を推論。
 *
 * 推論 keyword (含むだけで match、複数該当時は最先頭が勝つ):
 *
 *   high confidence (即推論):
 *     - コーヒー / カフェ        → 30 分
 *     - ランチ / 昼食 / 夕食      → 60 分
 *     - 朝食                      → 30 分
 *     - 散歩                      → 30 分
 *
 *   medium confidence:
 *     - ミーティング / 打ち合わせ / 会議 → 60 分
 *     - 食事                       → 60 分
 *     - 勉強 / 作業                → 60 分
 *
 *   low confidence (clarify 候補):
 *     - 仕事 / 作業 / 用事         → varied、確認必要
 *
 * 不明 (空 or VAGUE_ACTIVITY 含): default 60 分 (low confidence)
 */
const ACTIVITY_TYPICAL: ReadonlyArray<{
  keywords: ReadonlyArray<string>;
  typical: number;
  confidence: "high" | "medium" | "low";
}> = [
  // High confidence (アクティビティが時間長を強く規定)
  { keywords: ["コーヒー", "カフェ"], typical: 30, confidence: "high" },
  { keywords: ["ランチ", "昼食"], typical: 60, confidence: "high" },
  { keywords: ["朝食", "モーニング"], typical: 30, confidence: "high" },
  { keywords: ["夕食", "ディナー"], typical: 90, confidence: "high" },
  { keywords: ["散歩"], typical: 30, confidence: "high" },
  { keywords: ["休憩"], typical: 15, confidence: "high" },
  // Medium confidence
  {
    keywords: ["ミーティング", "打ち合わせ", "会議", "ミーティ"],
    typical: 60,
    confidence: "medium",
  },
  { keywords: ["食事"], typical: 60, confidence: "medium" },
  { keywords: ["勉強", "学習"], typical: 60, confidence: "medium" },
  // Low confidence (varied、推論より clarify が望ましい)
  {
    keywords: ["仕事", "作業", "用事", "予定", "もろもろ", "雑務", "タスク"],
    typical: 60,
    confidence: "low",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * activity 文字列から typical duration を推論する。
 *
 * @param activity - event.what.activity または event.what.activityCanonical
 * @returns 推論結果。activity 不明 (empty) なら default { typical: 60, confidence: "low" }
 */
export function inferTypicalDurationMin(
  activity: string | null | undefined,
): ActivityDuration {
  const a = (activity ?? "").trim();
  if (a.length === 0) {
    return { typical: 60, confidence: "low" };
  }
  for (const entry of ACTIVITY_TYPICAL) {
    for (const kw of entry.keywords) {
      if (a.includes(kw)) {
        return {
          typical: entry.typical,
          confidence: entry.confidence,
          matchedKeyword: kw,
        };
      }
    }
  }
  // 不明アクティビティ: default 60 分 low confidence (clarify 候補)
  return { typical: 60, confidence: "low" };
}

/**
 * startTime ("HH:mm") + duration 分から endTime ("HH:mm") を計算。
 *
 * @returns endTime ("HH:mm") or null (startTime invalid)
 */
export function addMinutesToHHmm(
  startTime: string,
  durationMin: number,
): string | null {
  const m = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const startH = parseInt(m[1], 10);
  const startM = parseInt(m[2], 10);
  if (
    !Number.isFinite(startH) ||
    !Number.isFinite(startM) ||
    startH < 0 ||
    startH > 23 ||
    startM < 0 ||
    startM > 59
  ) {
    return null;
  }
  const totalM = startH * 60 + startM + durationMin;
  const endH = Math.floor(totalM / 60) % 24;
  const endM = totalM % 60;
  return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
}

/**
 * inferEndTime — startTime + activity から endTime を推論する。
 *
 * 規則 (CEO 2026-04-29):
 *   - startTime null → 推論不能、null
 *   - inferTypicalDurationMin で confidence==="high" → 推論結果を採用
 *   - confidence==="medium" → 推論結果を採用 (ただし should ask for clarify in low-priority Q)
 *   - confidence==="low" → null (clarify 必要)
 *
 * @returns 推論された endTime ("HH:mm") or null
 */
export function inferEndTimeFromActivity(input: {
  startTime: string | null;
  activity: string | null | undefined;
}): {
  endTime: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
} {
  const { startTime, activity } = input;
  if (!startTime) {
    return {
      endTime: null,
      confidence: "low",
      reason: "no_start_time",
    };
  }
  const duration = inferTypicalDurationMin(activity);
  if (duration.confidence === "low") {
    // varied activity → 推論せず clarify 候補
    return {
      endTime: null,
      confidence: "low",
      reason: "low_confidence_activity",
    };
  }
  const endTime = addMinutesToHHmm(startTime, duration.typical);
  if (!endTime) {
    return {
      endTime: null,
      confidence: "low",
      reason: "start_time_parse_error",
    };
  }
  return {
    endTime,
    confidence: duration.confidence,
    reason: `inferred_from_activity_${duration.matchedKeyword ?? "default"}`,
  };
}
