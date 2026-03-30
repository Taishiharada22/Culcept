// lib/stargazer/milestoneDetector.ts
// マイルストーン検知 — 観測回数に基づくセレブレーション判定

const MILESTONES = [7, 14, 30, 50, 100] as const;
export type MilestoneNumber = (typeof MILESTONES)[number];

const LS_KEY = "stargazer_milestones_shown";

type MilestoneTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface MilestoneInfo {
  title: string;
  subtitle: string;
  tier: MilestoneTier;
}

const MILESTONE_MAP: Record<MilestoneNumber, MilestoneInfo> = {
  7: {
    title: "最初の1週間",
    subtitle: "7回の観測を達成しました。あなたの輪郭が見え始めています。",
    tier: "bronze",
  },
  14: {
    title: "2週間の観測者",
    subtitle: "14回の観測で、あなたのパターンが浮かび上がってきました。",
    tier: "silver",
  },
  30: {
    title: "1ヶ月の探求者",
    subtitle: "30回の観測を突破。深層の特性が明らかになり始めました。",
    tier: "gold",
  },
  50: {
    title: "深層への旅人",
    subtitle: "50回の観測を達成。矛盾や揺らぎまで観測できるようになりました。",
    tier: "platinum",
  },
  100: {
    title: "星の観測者",
    subtitle: "100回の観測を達成。あなたのプロフィールが完成に近づいています。",
    tier: "diamond",
  },
};

function getShownMilestones(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const arr: number[] = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

/**
 * 現在の観測回数に対して、まだ表示していないマイルストーンがあるか確認する。
 * あれば最大のマイルストーン番号を返す。なければ null。
 */
export function checkMilestone(totalObservations: number): MilestoneNumber | null {
  const shown = getShownMilestones();
  let highest: MilestoneNumber | null = null;

  for (const m of MILESTONES) {
    if (totalObservations >= m && !shown.has(m)) {
      highest = m;
    }
  }

  return highest;
}

/**
 * マイルストーンを表示済みとして localStorage に記録する。
 * 該当マイルストーン以下の全マイルストーンもまとめて記録する（スキップ防止）。
 */
export function markMilestoneShown(milestone: number): void {
  if (typeof window === "undefined") return;
  try {
    const shown = getShownMilestones();
    // 達成マイルストーン以下を全て記録
    for (const m of MILESTONES) {
      if (m <= milestone) {
        shown.add(m);
      }
    }
    localStorage.setItem(LS_KEY, JSON.stringify([...shown]));
  } catch {
    // localStorage 書き込み失敗は無視
  }
}

export function getMilestoneInfo(milestone: number): MilestoneInfo {
  const info = MILESTONE_MAP[milestone as MilestoneNumber];
  if (info) return info;
  // フォールバック
  return {
    title: `${milestone}回の観測`,
    subtitle: `${milestone}回の観測を達成しました。`,
    tier: "bronze",
  };
}

export { MILESTONES };
