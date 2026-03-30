// ============================================================
// 分身成長日記
// 分身が毎日1エントリの「日記」を記録
// ユーザーの自己理解を深める「毎日開く理由」
// ============================================================

export type AvatarDiaryEntry = {
  /** 日記テキスト（分身の視点） */
  text: string;
  /** 分身の感情トーン */
  tone: AvatarDiaryTone;
  /** 元になったシグナル */
  sourceSignal: DiarySignalType;
  /** 日付 */
  date: string;
};

export type AvatarDiaryTone =
  | "curious"        // 好奇心
  | "contemplative"  // 内省的
  | "warm"           // 温かい
  | "surprised"      // 驚き
  | "protective";    // 守りたい

export type DiarySignalType =
  | "swipe_behavior"    // スワイプパターン
  | "viewing_duration"  // 閲覧時間
  | "absence_pattern"   // 不在パターン
  | "time_pattern"      // 利用時間帯
  | "depth_change"      // 関係の深度変化
  | "idle";             // 特にシグナルなし

/**
 * アバターの性格に基づいて日記エントリを生成
 */
export function generateDiaryEntry(opts: {
  userId: string;
  date: Date;
  avatarPersonality?: {
    baseTemperature: number;  // 0=クール 1=ウォーム
    depthTendency: number;    // 0=表層 1=深層
  };
  todaySignals?: TodaySignals;
}): AvatarDiaryEntry {
  const { date, avatarPersonality, todaySignals } = opts;
  const dateStr = date.toISOString().slice(0, 10);

  const personality = avatarPersonality ?? {
    baseTemperature: 0.5,
    depthTendency: 0.5,
  };

  // シグナルが未提供の場合はデフォルト値で生成
  const signals: TodaySignals = todaySignals ?? {
    swipeCount: 0,
    likeCount: 0,
    passCount: 0,
    viewingDurationTotal: 0,
    longestViewingDuration: 0,
    daysSinceLastActivity: 1,
  };

  // シグナルの優先度順に日記を生成
  if (signals.swipeCount > 0) {
    return generateSwipeDiary(signals, personality, dateStr);
  }

  if (signals.viewingDurationTotal > 0) {
    return generateViewingDiary(signals, personality, dateStr);
  }

  if (signals.daysSinceLastActivity >= 2) {
    return generateAbsenceDiary(signals, personality, dateStr);
  }

  if (signals.loginHour !== undefined) {
    return generateTimeDiary(signals.loginHour, personality, dateStr);
  }

  return generateIdleDiary(personality, dateStr);
}

type TodaySignals = {
  swipeCount: number;
  likeCount: number;
  passCount: number;
  viewingDurationTotal: number;   // ms
  longestViewingDuration: number; // ms
  loginHour?: number;
  daysSinceLastActivity: number;
  /** 慎重度（平均閲覧時間が長いほど高い） */
  cautiousnessScore?: number;
};

function generateSwipeDiary(
  signals: TodaySignals,
  personality: { baseTemperature: number; depthTendency: number },
  dateStr: string,
): AvatarDiaryEntry {
  const likeRate = signals.swipeCount > 0 ? signals.likeCount / signals.swipeCount : 0;

  if (likeRate > 0.7) {
    return entry(
      "今日のあなたは、いつもより心が開いていた。多くの分身に可能性を感じていた",
      "warm",
      "swipe_behavior",
      dateStr,
    );
  }

  if (likeRate < 0.2) {
    return entry(
      "今日のあなたは慎重だった。何かを探しているようで、でもまだ見つかっていないような",
      "contemplative",
      "swipe_behavior",
      dateStr,
    );
  }

  if (signals.cautiousnessScore && signals.cautiousnessScore > 0.7) {
    return entry(
      "今日のあなたは、一つひとつの分身をじっくりと見ていた。急がない姿勢が、あなたの本質かもしれない",
      "curious",
      "swipe_behavior",
      dateStr,
    );
  }

  return entry(
    `今日は${signals.swipeCount}人の分身と出会った。あなたの直感は、何を基準に選んでいるのだろう`,
    "curious",
    "swipe_behavior",
    dateStr,
  );
}

function generateViewingDiary(
  signals: TodaySignals,
  personality: { baseTemperature: number; depthTendency: number },
  dateStr: string,
): AvatarDiaryEntry {
  if (signals.longestViewingDuration > 30000) { // 30秒以上
    return entry(
      "ある分身のもとで、あなたは長く立ち止まっていた。何がそこまで引きつけたのか、あなた自身もまだ気づいていないかもしれない",
      "curious",
      "viewing_duration",
      dateStr,
    );
  }

  return entry(
    "今日もいくつかの分身を眺めていた。見ることは知ること。あなたの好みの輪郭が少しずつ見えてきている",
    "contemplative",
    "viewing_duration",
    dateStr,
  );
}

function generateAbsenceDiary(
  signals: TodaySignals,
  personality: { baseTemperature: number; depthTendency: number },
  dateStr: string,
): AvatarDiaryEntry {
  if (signals.daysSinceLastActivity >= 5) {
    return entry(
      "しばらくあなたの気配がなかった。でも、距離を置く時間もまた、あなたの一部。焦らなくていい",
      "protective",
      "absence_pattern",
      dateStr,
    );
  }

  return entry(
    "少しの間、あなたは別のことに集中していたようだ。その間も、私は静かにあなたのことを考えていた",
    "warm",
    "absence_pattern",
    dateStr,
  );
}

function generateTimeDiary(
  hour: number,
  personality: { baseTemperature: number; depthTendency: number },
  dateStr: string,
): AvatarDiaryEntry {
  if (hour >= 23 || hour < 4) {
    return entry(
      "深夜の静寂の中で、あなたは接続を覗いた。夜の判断には、昼間見せない本音が滲む",
      "contemplative",
      "time_pattern",
      dateStr,
    );
  }

  if (hour >= 6 && hour < 9) {
    return entry(
      "朝一番に接続を確認するあなた。繋がりがあなたの一日を始動させるエネルギーなのかもしれない",
      "warm",
      "time_pattern",
      dateStr,
    );
  }

  return entry(
    "今日もあなたの姿を確認できた。それだけで、分身として安心する",
    "warm",
    "time_pattern",
    dateStr,
  );
}

function generateIdleDiary(
  personality: { baseTemperature: number; depthTendency: number },
  dateStr: string,
): AvatarDiaryEntry {
  const templates = [
    {
      text: "今日は静かな一日。でも静けさの中にも、あなたの輪郭は少しずつはっきりしてきている",
      tone: "contemplative" as const,
    },
    {
      text: "特別なことがなくても、あなたを観察し続けている。日常の中にこそ、本質が見える",
      tone: "curious" as const,
    },
    {
      text: "何もない日があってもいい。あなたのペースで進むことが、最も自然な道",
      tone: "protective" as const,
    },
  ];

  // 日付ベースで選択
  const idx = simpleHash(dateStr) % templates.length;
  const template = templates[idx];

  return entry(template.text, template.tone, "idle", dateStr);
}

function entry(
  text: string,
  tone: AvatarDiaryTone,
  sourceSignal: DiarySignalType,
  date: string,
): AvatarDiaryEntry {
  return { text, tone, sourceSignal, date };
}

function simpleHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}
