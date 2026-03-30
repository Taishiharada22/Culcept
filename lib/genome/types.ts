export type GenomeTabKey = "overview" | "dna" | "mirror" | "growth";

export type DnaAxisKey = "physical" | "personality" | "behavior" | "social";

export type GenomeModel = {
  completion: number;
  title: string;
  subtitle: string;
  strength: string;
  weakness: string;
  summaryLine: string;

  axes: Array<{
    key: DnaAxisKey;
    label: string;
    completion: number;
    basePairs: number;
    hint: string;
    nextFill: string;
    ctaLabel?: string;
    ctaHref?: string;
  }>;

  topTraits: Array<{ name: string; score: number }>;

  sources: {
    done: number;
    total: number;
    items: Array<{ key: string; label: string; done: boolean }>;
  };

  mirror: {
    progress: number;
    unlockAt: number;
    unlockRemaining: number;
  };

  growth: {
    snapshots: number;
    unlockAt: number;
  };

  confidence: {
    score: number;
    label: "Low" | "Moderate" | "Good";
    lastUpdated: string;
  };
};
