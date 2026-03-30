/**
 * Feature Unlock System — Stargazer リテンションメカニクス
 *
 * 観測回数に応じて機能が段階的にアンロックされる。
 * ユーザーに「続ければ新しい自分が見える」という動機を与える。
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeatureGate {
  feature: string;
  requiredObservations: number;
  label: string;
  description: string;
  icon: string;
}

// ─── Feature Gate Definitions ────────────────────────────────────────────────

export const FEATURE_GATES: FeatureGate[] = [
  {
    feature: "basic_observation",
    requiredObservations: 0,
    label: "基本観測",
    description: "日々の観測とアーキタイプ",
    icon: "🔭",
  },
  {
    feature: "morning_question",
    requiredObservations: 3,
    label: "朝の一問",
    description: "毎朝の深掘り質問",
    icon: "🌅",
  },
  {
    feature: "vanishing_insight",
    requiredObservations: 7,
    label: "消えるインサイト",
    description: "24時間で消える洞察",
    icon: "✨",
  },
  {
    feature: "blind_spot",
    requiredObservations: 10,
    label: "見えない自分",
    description: "盲点の発見",
    icon: "◎",
  },
  {
    feature: "inner_weather",
    requiredObservations: 10,
    label: "内面天気",
    description: "今日の心の天気図",
    icon: "🌤️",
  },
  {
    feature: "prophecy",
    requiredObservations: 14,
    label: "行動予測",
    description: "明日の行動を予測",
    icon: "🔮",
  },
  {
    feature: "ghost_resonance",
    requiredObservations: 15,
    label: "似た星の共鳴",
    description: "似たタイプとの共鳴",
    icon: "👻",
  },
  {
    feature: "alter_dialogue",
    requiredObservations: 20,
    label: "Alter対話",
    description: "もうひとりの自分との対話",
    icon: "🪞",
  },
  {
    feature: "unseen_map",
    requiredObservations: 25,
    label: "未知の地図",
    description: "まだ見ぬ自分の領域",
    icon: "🗺️",
  },
  {
    feature: "psyche_signature",
    requiredObservations: 30,
    label: "心理シグネチャ",
    description: "あなた固有の心理的指紋",
    icon: "✦",
  },
];

// 昇順ソート済み（requiredObservations の低い順）
const SORTED_GATES = [...FEATURE_GATES].sort(
  (a, b) => a.requiredObservations - b.requiredObservations,
);

// ─── localStorage Key ────────────────────────────────────────────────────────

const NOTIFIED_KEY = "stargazer-unlock-notified";

function getNotifiedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveNotifiedSet(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * 現在の観測回数でアンロック済みの全機能を返す
 */
export function getUnlockedFeatures(totalObservations: number): FeatureGate[] {
  return SORTED_GATES.filter(
    (gate) => totalObservations >= gate.requiredObservations,
  );
}

/**
 * 次にアンロックされる機能を返す（全てアンロック済みなら null）
 */
export function getNextUnlock(totalObservations: number): {
  gate: FeatureGate;
  remaining: number;
} | null {
  const next = SORTED_GATES.find(
    (gate) => totalObservations < gate.requiredObservations,
  );
  if (!next) return null;
  return {
    gate: next,
    remaining: next.requiredObservations - totalObservations,
  };
}

/**
 * まだ通知していない新しいアンロックがあれば返す。
 * 複数同時アンロックの場合は最も高い requiredObservations のものを返す。
 */
export function getJustUnlocked(
  totalObservations: number,
): FeatureGate | null {
  const notified = getNotifiedSet();
  const unlocked = getUnlockedFeatures(totalObservations);

  // まだ通知されていないアンロック済み機能を取得
  const unnotified = unlocked.filter(
    (gate) =>
      gate.requiredObservations > 0 && !notified.has(gate.feature),
  );

  if (unnotified.length === 0) return null;

  // 最も requiredObservations が高いものを優先表示
  return unnotified.reduce((best, gate) =>
    gate.requiredObservations > best.requiredObservations ? gate : best,
  );
}

/**
 * アンロック通知を表示済みとしてマークする
 */
export function markUnlockNotified(feature: string): void {
  const set = getNotifiedSet();
  set.add(feature);
  saveNotifiedSet(set);
}

/**
 * 特定の機能がアンロック済みかどうか
 */
export function isFeatureUnlocked(
  feature: string,
  totalObservations: number,
): boolean {
  const gate = SORTED_GATES.find((g) => g.feature === feature);
  if (!gate) return false;
  return totalObservations >= gate.requiredObservations;
}
