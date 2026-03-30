export type FitGuideId =
  | "bottoms_pants"
  | "bottoms_skirt"
  | "shoes_leather"
  | "shoes_heal"
  | "shoes_boots";

export type FitGuideViewKey = "mae" | "naname" | "yoko" | "ue";

type FitGuidePoint = { x: number; y: number };
type FitGuideLine = { x1: number; y1: number; x2: number; y2: number };
type FitGuideEllipse = { cx: number; cy: number; rx: number; ry: number };

export type FitGuideOverlay = {
  view: FitGuideViewKey;
  label: string;
  color: string;
  linePct?: FitGuideLine;
  ellipsePct?: FitGuideEllipse;
  dotsPct?: FitGuidePoint[];
  labelPct?: FitGuidePoint;
};

export type FitGuideDefinition = {
  id: FitGuideId;
  defaultView: FitGuideViewKey;
  views: Partial<Record<FitGuideViewKey, string[]>>;
  overlays: Record<string, FitGuideOverlay>;
};

const commonShoeTop = {
  recommended_foot_girth_cm: {
    view: "ue" as const,
    label: "最も張る部分を一周",
    color: "#14b8a6",
    ellipsePct: { cx: 0.53, cy: 0.44, rx: 0.19, ry: 0.11 },
    dotsPct: [{ x: 0.72, y: 0.44 }],
    labelPct: { x: 0.74, y: 0.32 },
  },
  shoe_width_cm: {
    view: "ue" as const,
    label: "最も幅広い部分",
    color: "#f97316",
    linePct: { x1: 0.3, y1: 0.44, x2: 0.73, y2: 0.44 },
    dotsPct: [
      { x: 0.3, y: 0.44 },
      { x: 0.73, y: 0.44 },
    ],
    labelPct: { x: 0.76, y: 0.54 },
  },
};

const commonShoeSide = {
  recommended_foot_length_cm: {
    view: "yoko" as const,
    label: "つま先からかかとまで",
    color: "#0ea5e9",
    linePct: { x1: 0.2, y1: 0.7, x2: 0.83, y2: 0.7 },
    dotsPct: [
      { x: 0.2, y: 0.7 },
      { x: 0.83, y: 0.7 },
    ],
    labelPct: { x: 0.7, y: 0.56 },
  },
  insole_length_cm: {
    view: "yoko" as const,
    label: "中敷きの長さ",
    color: "#8b5cf6",
    linePct: { x1: 0.23, y1: 0.62, x2: 0.79, y2: 0.62 },
    dotsPct: [
      { x: 0.23, y: 0.62 },
      { x: 0.79, y: 0.62 },
    ],
    labelPct: { x: 0.72, y: 0.48 },
  },
};

export const FIT_GUIDES: Record<FitGuideId, FitGuideDefinition> = {
  bottoms_pants: {
    id: "bottoms_pants",
    defaultView: "mae",
    views: {
      mae: ["/bottoms/pants/mae.png", "/guides/bottoms-pants-mae.svg"],
      yoko: ["/bottoms/pants/yoko.png", "/guides/bottoms-pants-yoko.svg"],
    },
    overlays: {
      waist_cm: {
        view: "mae",
        label: "ウエスト上端",
        color: "#0ea5e9",
        linePct: { x1: 0.28, y1: 0.23, x2: 0.72, y2: 0.23 },
        labelPct: { x: 0.74, y: 0.17 },
      },
      hip_cm: {
        view: "mae",
        label: "ヒップ最大幅",
        color: "#14b8a6",
        linePct: { x1: 0.23, y1: 0.38, x2: 0.77, y2: 0.38 },
        labelPct: { x: 0.74, y: 0.32 },
      },
      thigh_width_cm: {
        view: "mae",
        label: "股下すぐ下の太もも幅",
        color: "#f97316",
        linePct: { x1: 0.33, y1: 0.49, x2: 0.63, y2: 0.49 },
        labelPct: { x: 0.78, y: 0.46 },
      },
      inseam_cm: {
        view: "mae",
        label: "股の付け根から裾まで",
        color: "#8b5cf6",
        linePct: { x1: 0.51, y1: 0.43, x2: 0.51, y2: 0.89 },
        dotsPct: [
          { x: 0.51, y: 0.43 },
          { x: 0.51, y: 0.89 },
        ],
        labelPct: { x: 0.68, y: 0.72 },
      },
      hem_width_cm: {
        view: "mae",
        label: "裾口の横幅",
        color: "#ef4444",
        linePct: { x1: 0.35, y1: 0.9, x2: 0.65, y2: 0.9 },
        labelPct: { x: 0.74, y: 0.86 },
      },
      total_length_cm: {
        view: "mae",
        label: "ウエストから裾まで",
        color: "#22c55e",
        linePct: { x1: 0.38, y1: 0.18, x2: 0.38, y2: 0.9 },
        dotsPct: [
          { x: 0.38, y: 0.18 },
          { x: 0.38, y: 0.9 },
        ],
        labelPct: { x: 0.2, y: 0.52 },
      },
      rise_cm: {
        view: "yoko",
        label: "ウエストから股の付け根",
        color: "#06b6d4",
        linePct: { x1: 0.53, y1: 0.22, x2: 0.53, y2: 0.55 },
        dotsPct: [
          { x: 0.53, y: 0.22 },
          { x: 0.53, y: 0.55 },
        ],
        labelPct: { x: 0.69, y: 0.28 },
      },
    },
  },
  bottoms_skirt: {
    id: "bottoms_skirt",
    defaultView: "mae",
    views: {
      mae: ["/bottoms/skirt/mae.png", "/guides/bottoms-skirt-mae.svg"],
      yoko: ["/bottoms/skirt/yoko.png", "/guides/bottoms-skirt-yoko.svg"],
    },
    overlays: {
      waist_cm: {
        view: "mae",
        label: "ウエスト上端",
        color: "#0ea5e9",
        linePct: { x1: 0.34, y1: 0.2, x2: 0.66, y2: 0.2 },
        labelPct: { x: 0.73, y: 0.15 },
      },
      hip_cm: {
        view: "mae",
        label: "腰まわり最大幅",
        color: "#14b8a6",
        linePct: { x1: 0.25, y1: 0.4, x2: 0.75, y2: 0.4 },
        labelPct: { x: 0.75, y: 0.35 },
      },
      total_length_cm: {
        view: "mae",
        label: "ウエストから裾まで",
        color: "#8b5cf6",
        linePct: { x1: 0.42, y1: 0.2, x2: 0.42, y2: 0.9 },
        dotsPct: [
          { x: 0.42, y: 0.2 },
          { x: 0.42, y: 0.9 },
        ],
        labelPct: { x: 0.24, y: 0.56 },
      },
      hem_width_cm: {
        view: "mae",
        label: "裾の横幅",
        color: "#f97316",
        linePct: { x1: 0.22, y1: 0.9, x2: 0.78, y2: 0.9 },
        labelPct: { x: 0.76, y: 0.84 },
      },
    },
  },
  shoes_leather: {
    id: "shoes_leather",
    defaultView: "naname",
    views: {
      naname: ["/shoes/leather/naname.png", "/guides/shoes-leather-naname.svg"],
      yoko: ["/shoes/leather/yoko.png", "/guides/shoes-leather-yoko.svg"],
      ue: ["/shoes/leather/ue.png", "/guides/shoes-leather-ue.svg"],
    },
    overlays: {
      ...commonShoeSide,
      ...commonShoeTop,
    },
  },
  shoes_heal: {
    id: "shoes_heal",
    defaultView: "naname",
    views: {
      naname: ["/shoes/heal/naname.png", "/guides/shoes-heal-naname.svg"],
      yoko: ["/shoes/heal/yoko.png", "/guides/shoes-heal-yoko.svg"],
      ue: ["/shoes/heal/ue.png", "/guides/shoes-heal-ue.svg"],
    },
    overlays: {
      ...commonShoeSide,
      ...commonShoeTop,
      heel_height_cm: {
        view: "yoko",
        label: "地面からヒール上端まで",
        color: "#ec4899",
        linePct: { x1: 0.78, y1: 0.78, x2: 0.78, y2: 0.42 },
        dotsPct: [
          { x: 0.78, y: 0.78 },
          { x: 0.78, y: 0.42 },
        ],
        labelPct: { x: 0.62, y: 0.36 },
      },
    },
  },
  shoes_boots: {
    id: "shoes_boots",
    defaultView: "yoko",
    views: {
      yoko: ["/shoes/boots/yoko.png", "/guides/shoes-boots-yoko.svg"],
      ue: ["/shoes/boots/ue.png", "/guides/shoes-boots-ue.svg"],
    },
    overlays: {
      ...commonShoeSide,
      ...commonShoeTop,
      shaft_height_cm: {
        view: "yoko",
        label: "接地面から筒上端まで",
        color: "#ef4444",
        linePct: { x1: 0.82, y1: 0.88, x2: 0.82, y2: 0.18 },
        dotsPct: [
          { x: 0.82, y: 0.88 },
          { x: 0.82, y: 0.18 },
        ],
        labelPct: { x: 0.62, y: 0.18 },
      },
      opening_circumference_cm: {
        view: "ue",
        label: "履き口まわり",
        color: "#10b981",
        ellipsePct: { cx: 0.56, cy: 0.18, rx: 0.19, ry: 0.08 },
        dotsPct: [{ x: 0.75, y: 0.18 }],
        labelPct: { x: 0.76, y: 0.08 },
      },
    },
  },
};

export function getFitGuideDefinition(guideId: FitGuideId | null | undefined) {
  if (!guideId) return null;
  return FIT_GUIDES[guideId] ?? null;
}
