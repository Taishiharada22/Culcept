export type BodyFootMeasurementKey = "foot_length_cm" | "foot_girth_cm" | "foot_width_cm";

export type BodyFootMeasurementField = {
  key: BodyFootMeasurementKey;
  label: string;
  unit: string;
  description: string;
  shortTip: string;
};

export const BODY_FOOT_MEASUREMENT_FIELDS: BodyFootMeasurementField[] = [
  {
    key: "foot_length_cm",
    label: "足長（cm）",
    unit: "cm",
    description: "かかとから最も長いつま先までを測る",
    shortTip: "かかと〜最長つま先",
  },
  {
    key: "foot_girth_cm",
    label: "足囲（cm）",
    unit: "cm",
    description: "親指の付け根と小指の付け根を通る、最も張っている部分を一周して測る",
    shortTip: "最も張る部分を一周",
  },
  {
    key: "foot_width_cm",
    label: "足幅（cm）",
    unit: "cm",
    description: "足の最も幅広い部分を、横一直線で測る",
    shortTip: "最も幅広い部分",
  },
];

export type StoredBodyFootReference = {
  foot_length_cm?: number | null;
  foot_girth_cm?: number | null;
  foot_width_cm?: number | null;
  derived_width_size?: string | null;
  derived_width_audience?: string | null;
};

function readNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function extractStoredBodyFootReference(args: {
  measurements?: Record<string, unknown> | null;
  displayLabels?: Record<string, unknown> | null;
}): StoredBodyFootReference {
  const measurements = args.measurements ?? {};
  const displayLabels = args.displayLabels ?? {};
  return {
    foot_length_cm: readNumber(measurements.foot_length_cm),
    foot_girth_cm: readNumber(measurements.foot_girth_cm),
    foot_width_cm: readNumber(measurements.foot_width_cm),
    derived_width_size: typeof displayLabels.derived_width_size === "string" ? displayLabels.derived_width_size : null,
    derived_width_audience:
      typeof displayLabels.derived_width_audience === "string" ? displayLabels.derived_width_audience : null,
  };
}
