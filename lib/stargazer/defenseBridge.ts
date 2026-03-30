// lib/stargazer/defenseBridge.ts
// 防衛機制検出をAha/Alterコンテキストに接続するブリッジ
//
// innerWeather.ts が検出した防衛機制データを localStorage から取得し、
// Alter の system prompt に供給する軽量ブリッジ。

const WEATHER_STORAGE_KEY = "stargazer_inner_weather_latest_v1";

export interface DefenseContext {
  activeDefenses: string[];
  summary: string;
}

const DEFENSE_LABELS: Record<string, string> = {
  denial: "否認",
  projection: "投影",
  rationalization: "合理化",
  avoidance: "回避",
  displacement: "置換",
  regression: "退行",
  intellectualization: "知性化",
};

/**
 * 最近の inner-weather データから防衛機制コンテキストを取得。
 * Alter と Aha エンジンに供給するための軽量ブリッジ。
 */
export function getActiveDefenseContext(): DefenseContext | null {
  if (typeof globalThis.localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    // Expire stale data (>24h) to avoid referencing outdated defense context
    if (data.timestamp) {
      const age = Date.now() - new Date(data.timestamp).getTime();
      if (age > 24 * 60 * 60 * 1000) return null;
    }

    const defenses: string[] =
      data.activeDefenses || data.defense_mechanisms || [];
    if (defenses.length === 0) return null;

    const labels = defenses.map((d: string) => DEFENSE_LABELS[d] || d);
    return {
      activeDefenses: defenses,
      summary: `現在活性化している防衛機制: ${labels.join("、")}`,
    };
  } catch {
    return null;
  }
}

/**
 * Alter system prompt 用のセクションを構築する。
 * 防衛機制が検出されている場合のみテキストを返す。
 */
export function buildDefenseContextForAlter(): string {
  const ctx = getActiveDefenseContext();
  if (!ctx) return "";

  return `
## 防衛機制の検出
${ctx.summary}
この防衛機制はユーザーの心理的安全装置であり、否定せず、尊重する。
ただし、防衛の裏にある本当の欲求や恐れに対話の中で自然に触れる機会があれば活用する。
防衛が強く働いている領域こそ、最も重要なインサイトが眠っている可能性がある。
`.trim();
}
