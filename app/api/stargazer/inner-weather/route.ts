import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { checkStargazerTier } from "@/lib/stargazer/tierGuard";
import {
  calculatePressureMap,
  detectDefenseMechanism,
  getWeatherEmoji,
  getWeatherLabel,
  type EmotionalTone,
  type WeatherType,
} from "@/lib/stargazer/innerWeather";
import {
  buildAxisScores,
  todayJST,
  clampNumber,
} from "@/lib/stargazer/sharedRouteUtils";
import { runAI } from "@/lib/ai";
import { makeStargazerRunMetadata } from "@/lib/stargazer/studentTrack";
import {
  buildInsightPreference,
  preferenceToPromptContext,
} from "@/lib/stargazer/insightPersonalizer";

export const runtime = "nodejs";

const VALID_TONES = [
  "calm", "excited", "anxious", "melancholic", "joyful", "numb", "conflicted",
] as const;

const WEATHER_REPORTS: Record<WeatherType, string> = {
  sunny: "心の空は晴れ渡っている。今日のあなたは、自分自身と最も近い距離にいる。",
  cloudy: "薄い雲がかかっている。はっきりとは見えないけれど、光は雲の向こうにある。",
  rainy: "雨が降っている。でも雨は、乾いた土地を潤すもの。",
  stormy: "内側で嵐が起きている。矛盾する感情が衝突し、まだ答えは出ていない。でも、嵐の後にしか見えない景色がある。",
  foggy: "霧の中にいる。自分が何を感じているのか、まだはっきりしない。それでいい。霧は、新しい視界の前触れだから。",
  windy: "風が吹いている。変化の気配。今のあなたは、何かを手放す準備をしているのかもしれない。",
  snow: "静かに雪が降り積もっている。全てが白く覆われ、感覚が麻痺しているように感じるかもしれない。でも雪の下で、春の準備は始まっている。",
  aurora: "稀な夜だ。普段は見えないものが、今のあなたには見えている。この瞬間を逃さないで。",
};

const WEATHER_FORECASTS: Record<WeatherType, string> = {
  sunny: "この穏やかさが続くかは分からない。でも今日の晴れを、ちゃんと味わっておくこと。",
  cloudy: "雲の向こうで何かが動いている気配。明日は晴れるか、それとも雨になるか。",
  rainy: "雨はいつか止む。止んだ後の空気は、いつもより澄んでいるはず。",
  stormy: "嵐は永遠には続かない。過ぎた後に見える景色を、楽しみにしていてほしい。",
  foggy: "霧は朝に晴れることが多い。明日の朝、少しだけ視界が開けているかもしれない。",
  windy: "風が何かを運んできている。明日は、新しい発見がある予感。",
  snow: "雪解けは静かに始まる。焦らなくていい。少しずつ、少しずつ。",
  aurora: "この特別な状態は長くは続かない。でも、ここで見たものは忘れないはず。",
};

function getTodayJstWindow() {
  const today = todayJST();
  const start = new Date(`${today}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    today,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

async function fetchLatestTodayWeatherRow(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
) {
  const { today, startIso, endIso } = getTodayJstWindow();

  const { data: latestByWeatherDate } = await supabase
    .from("stargazer_inner_weather")
    .select("*")
    .eq("user_id", userId)
    .eq("weather_date", today)
    .order("recorded_at", { ascending: false })
    .limit(1);

  if (latestByWeatherDate && latestByWeatherDate.length > 0) {
    return latestByWeatherDate[0];
  }

  const { data: latestByRecordedAt } = await supabase
    .from("stargazer_inner_weather")
    .select("*")
    .eq("user_id", userId)
    .gte("recorded_at", startIso)
    .lt("recorded_at", endIso)
    .order("recorded_at", { ascending: false })
    .limit(1);

  return latestByRecordedAt && latestByRecordedAt.length > 0
    ? latestByRecordedAt[0]
    : null;
}

function normalizeStoredForecast(forecast: unknown): string {
  if (typeof forecast === "string") return forecast;
  if (forecast && typeof forecast === "object") {
    const candidate = forecast as Record<string, unknown>;
    if (typeof candidate.text === "string") return candidate.text;
    if (typeof candidate.forecast === "string") return candidate.forecast;
  }
  return "";
}

function buildManualWeather(params: {
  energy: number;
  stress: number;
  emotionalTone: EmotionalTone;
  socialBattery: number;
}) {
  const energyLevel = Math.round((clampNumber(params.energy, 0, 1) * 2 - 1) * 100) / 100;
  const stressLevel = Math.round(clampNumber(params.stress, 0, 1) * 100) / 100;
  const socialBattery = Math.round(clampNumber(params.socialBattery, 0, 1) * 100) / 100;
  const tone = params.emotionalTone;

  let weatherType: WeatherType = "cloudy";
  if (energyLevel > 0.3 && stressLevel < 0.3 && (tone === "calm" || tone === "joyful" || tone === "excited")) {
    weatherType = energyLevel > 0.6 && stressLevel < 0.15 ? "aurora" : "sunny";
  } else if (stressLevel > 0.7 && tone === "conflicted") {
    weatherType = "stormy";
  } else if (tone === "numb" && energyLevel < 0) {
    weatherType = "foggy";
  } else if (energyLevel < -0.5 && tone === "melancholic") {
    weatherType = "snow";
  } else if (energyLevel > 0.2 && stressLevel > 0.4) {
    weatherType = "windy";
  } else if (energyLevel < -0.2 && stressLevel > 0.5) {
    weatherType = "rainy";
  }

  const stability = Math.max(0, 1 - stressLevel - Math.abs(energyLevel) * 0.3);

  return {
    weatherType,
    emoji: getWeatherEmoji(weatherType),
    label: getWeatherLabel(weatherType),
    description: WEATHER_REPORTS[weatherType],
    energyLevel,
    stressLevel,
    emotionalTone: tone,
    socialBattery,
    stability: Math.round(stability * 100) / 100,
    forecast: WEATHER_FORECASTS[weatherType],
  };
}

function serializeWeather(
  weather: {
    weatherType: string;
    emoji: string;
    label: string;
    description: string;
    energyLevel: number;
    stressLevel: number;
    emotionalTone: string;
    socialBattery: number;
    stability?: number;
    forecast?: string;
  },
  defense?: {
    active?: boolean;
    type?: string | null;
    trigger?: string | null;
    message?: string | null;
  },
) {
  return {
    weatherType: weather.weatherType,
    label: weather.label,
    emoji: weather.emoji,
    description: weather.description,
    weatherLabel: weather.label,
    weatherEmoji: weather.emoji,
    weatherReport: weather.description,
    energyLevel: weather.energyLevel,
    stressLevel: weather.stressLevel,
    emotionalTone: weather.emotionalTone,
    socialBattery: weather.socialBattery,
    stability: weather.stability ?? null,
    forecast: weather.forecast ?? "",
    defenseActive: defense?.active ?? false,
    defenseType: defense?.type ?? null,
    defenseDetected: defense?.type ?? null,
    defenseDescription: defense?.trigger ?? null,
    patternInterruption: defense?.message ?? null,
  };
}

// ── GET: 今日の Inner Weather を取得 ──
export async function GET() {
  try {
    const tierCheck = await checkStargazerTier("inner_weather");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const supabase = await supabaseServer();
    const row = await fetchLatestTodayWeatherRow(supabase, userId);

    // 今日のデータがあればそのまま返す
    if (row) {
      const storedWeatherType = row.weather_type as WeatherType;
      const storedWeather = serializeWeather(
        {
          weatherType: storedWeatherType,
          label: getWeatherLabel(storedWeatherType),
          emoji: getWeatherEmoji(storedWeatherType),
          description: row.weather_report ?? "今日の心の天気が記録されています。",
          energyLevel: clampNumber(Number(row.energy_level ?? 0.5) * 2 - 1, -1, 1),
          stressLevel: clampNumber(Number(row.stress_level ?? 0.3), 0, 1),
          emotionalTone: row.emotional_tone ?? "calm",
          socialBattery: clampNumber(Number(row.social_battery ?? 0.5), 0, 1),
          stability: clampNumber(Number(row.stability ?? 0.5), 0, 1),
          forecast: normalizeStoredForecast(row.forecast),
        },
        {
          active: Boolean(row.defense_active),
          type: row.defense_type ?? null,
          trigger: null,
          message: row.pattern_interrupt_message ?? null,
        },
      );
      return NextResponse.json({
        ok: true,
        hasRecord: true,
        needsInput: false,
        weather: storedWeather,
        defense: {
          active: Boolean(row.defense_active),
          type: row.defense_type ?? null,
          confidence: clampNumber(Number(row.defense_confidence ?? 0), 0, 1),
          trigger: null,
          message: row.pattern_interrupt_message ?? null,
        },
        pressureMap: row.pressure_points ?? null,
        recordedAt: row.recorded_at,
      });
    }

    return NextResponse.json({
      ok: true,
      hasRecord: false,
      needsInput: true,
      weather: null,
      prompt: {
        label: "今日の心の天気を記録",
        message: "Inner Weather はまだ未記録です。今日の状態を記録すると Home に反映されます。",
      },
      recordedAt: null,
      suggestedWeather: null,
      pressureMap: null,
      patternContext: null,
    });
  } catch (error) {
    console.error("Failed to get inner weather:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── POST: 1-tap 圧力入力を記録 ──
export async function POST(request: NextRequest) {
  try {
    const tierCheck = await checkStargazerTier("inner_weather");
    if (tierCheck instanceof NextResponse) return tierCheck;
    const { userId } = tierCheck;

    const supabase = await supabaseServer();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const {
      energy,
      stress,
      emotionalTone,
      socialBattery,
      bodySnapshot,
    } = body as {
      energy: number;
      stress: number;
      emotionalTone: string;
      socialBattery: number;
      bodySnapshot?: { head?: string; chest?: string } | null;
    };

    // 型チェック
    if (
      typeof energy !== "number" ||
      typeof stress !== "number" ||
      typeof emotionalTone !== "string" ||
      typeof socialBattery !== "number"
    ) {
      return NextResponse.json({ error: "必須パラメータが不正です" }, { status: 400 });
    }

    // 範囲バリデーション
    const safeEnergy = energy < 0
      ? clampNumber((energy + 1) / 2, 0, 1)
      : clampNumber(energy, 0, 1);
    const safeStress = clampNumber(stress, 0, 1);
    const safeSocialBattery = clampNumber(socialBattery, 0, 1);

    // emotionalTone のホワイトリスト検証
    const safeTone = VALID_TONES.includes(emotionalTone as typeof VALID_TONES[number])
      ? emotionalTone
      : "calm";

    // 軸スコアを取得
    const [{ data: profile }, { data: resolvedTypeRow }, { data: recentObservations }] =
      await Promise.all([
        supabase
          .from("stargazer_profiles")
          .select("dimensions")
          .eq("user_id", userId)
          .single(),
        supabase
          .from("stargazer_resolved_types")
          .select("axis_scores")
          .eq("user_id", userId)
          .single(),
        supabase
          .from("stargazer_observations")
          .select("response_time_ms, hesitation_level")
          .eq("user_id", userId)
          .order("answered_at", { ascending: false })
          .limit(30),
      ]);

    const { axisScores } = buildAxisScores(
      profile?.dimensions ?? null,
      resolvedTypeRow?.axis_scores ?? null,
    );

    // ユーザー入力を主として今日の心の天気を計算
    const weather = buildManualWeather({
      energy: safeEnergy,
      stress: safeStress,
      emotionalTone: safeTone as EmotionalTone,
      socialBattery: safeSocialBattery,
    });

    // ユーザー嗜好プロファイルを構築（失敗しても続行）
    let preferenceContext = "";
    try {
      const pref = await buildInsightPreference(userId, supabase);
      preferenceContext = preferenceToPromptContext(pref);
    } catch (prefError) {
      console.warn("[inner-weather] Preference loading failed, continuing:", prefError);
    }

    // AI でテンプレートテキストを強化（失敗時はテンプレートをそのまま使用）
    try {
      const topAxes = Object.entries(axisScores)
        .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
        .slice(0, 3)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");

      const aiResult = await runAI({
        taskType: "stargazer_inner_weather_enhance",
        metadata: makeStargazerRunMetadata({ feature: "inner_weather" }),
        prompt: JSON.stringify({
          weatherType: weather.weatherType,
          templateDescription: weather.description,
          templateForecast: weather.forecast,
          emotionalTone: safeTone,
          energyLevel: weather.energyLevel,
          stressLevel: safeStress,
          topAxes,
        }),
        systemPrompt: `あなたはAneurasyncの内面天気観測者です。以下のテンプレートテキストを、ユーザーの性格データを踏まえて書き直してください。声のルール：褒めない。慰めない。見たものを言う。余韻を残す。最大80文字。${preferenceContext}`,
        requireJson: false,
        temperature: 0.7,
        maxOutputTokens: 150,
        userId: userId,
      });

      if (aiResult.success && aiResult.text) {
        weather.description = aiResult.text.slice(0, 120);
      }
    } catch (aiError) {
      // AI 強化失敗はログのみ。テンプレート本文で続行
      console.warn("InnerWeather AI enhancement failed, using template:", aiError);
    }

    // 圧力マップを計算
    const pressureMap = calculatePressureMap(axisScores);

    // 防衛機制を検知
    const obsData = (recentObservations ?? [])
      .filter((o: Record<string, unknown>) => typeof o.response_time_ms === "number" && o.response_time_ms > 0)
      .map((o: Record<string, unknown>) => ({
        timestamp: new Date().toISOString(),
        responseTimeMs: o.response_time_ms as number,
        hesitation: typeof o.hesitation_level === "number" ? o.hesitation_level : 0,
      }));
    const defense = detectDefenseMechanism(obsData);

    // DB に保存 (同日重複は許容: 1日に複数回の気圧入力を記録できる)
    const { error: insertError } = await supabase
      .from("stargazer_inner_weather")
      .insert({
        user_id: userId,
        weather_date: todayJST(),
        recorded_at: new Date().toISOString(),
        weather_type: weather.weatherType,
        weather_report: weather.description,
        energy_level: safeEnergy,
        stress_level: safeStress,
        emotional_tone: safeTone,
        social_battery: safeSocialBattery,
        stability: weather.stability,
        defense_active: defense.active,
        defense_type: defense.type ?? null,
        defense_confidence: defense.confidence ?? 0,
        pressure_points: pressureMap,
        body_snapshot: bodySnapshot ?? null,
        forecast: weather.forecast ? { text: weather.forecast } : null,
        pattern_interrupt_triggered: Boolean(defense.message),
        pattern_interrupt_message: defense.message ?? null,
      });

    if (insertError) {
      console.error("Failed to insert inner weather:", insertError);
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      hasRecord: true,
      needsInput: false,
      weather: serializeWeather(
        {
          weatherType: weather.weatherType,
          label: weather.label,
          emoji: weather.emoji,
          description: weather.description,
          energyLevel: weather.energyLevel,
          stressLevel: safeStress,
          emotionalTone: safeTone,
          socialBattery: safeSocialBattery,
          stability: weather.stability,
          forecast: weather.forecast,
        },
        {
          active: defense.active,
          type: defense.type ?? null,
          trigger: defense.trigger ?? null,
          message: defense.message ?? null,
        },
      ),
      defense: {
        active: defense.active,
        type: defense.type ?? null,
        confidence: defense.confidence ?? 0,
        trigger: defense.trigger ?? null,
        message: defense.message ?? null,
        signals: defense.signals ?? [],
      },
      pressureMap,
      recordedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to record inner weather:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
