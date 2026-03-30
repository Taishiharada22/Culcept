"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import BodyFootGuide from "@/components/body/BodyFootGuide";
import BodyGuide from "@/components/body/BodyGuide";
import {
  GlassBadge,
  GlassButton,
  GlassCard,
  ProgressRing,
} from "@/components/ui/glassmorphism-design";
import {
  BODY_AXIS_DEFS,
  BODY_FIELD_DEFS,
  JP3_LABELS,
  JP3_OPTIONS,
  JP7_LABELS,
  JP7_OPTIONS,
  buildMyStyleDiagnosis,
  computeBodyAverageDrift,
  computeDerivedMetrics,
  normalizeBirthDateInput,
  readFiniteNumber,
} from "@/lib/my-style/diagnosisEngine";
import {
  BODY_FOOT_MEASUREMENT_FIELDS,
  type BodyFootMeasurementKey,
} from "@/lib/body/footMeasurements";
import { resolveShoeWidthCodeClient } from "@/lib/shoeWidthClient";
import { formatShoeWidthCode } from "@/lib/shoeWidth";
import {
  validateMeasurement,
  estimateInitialMeasurements,
  type ValidationResult,
  type ValidationContext,
} from "@/lib/body/measurementValidation";
import { getStatsForProfile, MEASURE_LABELS, type Gender } from "@/lib/body/japaneseBodyStats";
import PoseEstimationCapture from "@/components/body/PoseEstimationCapture";

type BodyProfileResponse = {
  ok?: boolean;
  body_profile?: {
    cfv?: Record<string, number>;
    display_labels?: Record<string, unknown>;
    confidence?: Record<string, unknown>;
  } | null;
  measurement?: Record<string, number> | null;
  diagnosis?: ReturnType<typeof buildMyStyleDiagnosis> | null;
};

type BodyProfileWizardProps = {
  birthDate?: string;
  onBirthDateChange?: (value: string) => void;
  hideBirthDateInput?: boolean;
  embedded?: boolean;
  onSaved?: (payload: {
    bodyProfile?: BodyProfileResponse["body_profile"];
    measurement?: BodyProfileResponse["measurement"];
    diagnosis?: BodyProfileResponse["diagnosis"];
  }) => void;
};

const AXIS_SCALE = [
  { value: "0", label: "低" },
  { value: "1", label: "中" },
  { value: "2", label: "高" },
] as const;

const EMBEDDED_HIDDEN_AXIS_KEYS = new Set([
  "vertical_line",
  "pelvis_width",
  "mobility_upper",
]);

const EMBEDDED_FRAME_AXIS_MAP: Record<string, string[]> = {
  shoulder_breadth: ["shoulder_width", "shoulder_slope", "posture_round_shoulders"],
  chest_circ: ["ribcage_width"],
  torso_depth: ["torso_depth"],
  waist_circ: ["waist_position"],
  hip_circ: ["pelvic_tilt"],
  inseam: ["leg_ratio"],
  sleeve_length: ["arm_ratio", "joint_size", "bone_sharpness"],
};

const OVERLAY_FIELD_MAP = Object.fromEntries(
  BODY_FIELD_DEFS.filter((field) => field.overlayId).map((field) => [field.overlayId!, field.key]),
) as Record<string, string>;

function toStringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return "";
}

function toNumberValue(value: unknown) {
  const numeric = Number(String(value ?? ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function ratioLabel(value: number | null, short: [string, string, string]) {
  if (value == null) return "未計算";
  if (value >= 0.49) return short[2];
  if (value <= 0.44) return short[0];
  return short[1];
}

function scoreLabel(score: number) {
  if (score >= 90) return "プロ級";
  if (score >= 70) return "かなり当たる";
  if (score >= 40) return "基本OK";
  return "入力不足";
}

function scoreTone(score: number) {
  if (score >= 90) return "from-emerald-400 to-teal-500";
  if (score >= 70) return "from-cyan-400 to-blue-500";
  if (score >= 40) return "from-amber-400 to-orange-500";
  return "from-slate-300 to-slate-400";
}

export default function BodyProfileWizard({
  birthDate,
  onBirthDateChange,
  hideBirthDateInput = false,
  embedded = false,
  onSaved,
}: BodyProfileWizardProps) {
  const searchParams = useSearchParams();
  const contextType = searchParams.get("context_type") ?? searchParams.get("contextType") ?? "";
  const streamId = searchParams.get("stream_id") ?? searchParams.get("streamId") ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeFieldKey, setActiveFieldKey] = useState(BODY_FIELD_DEFS[0].key);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [axes, setAxes] = useState<Record<string, string>>({});
  const [birthDateInternal, setBirthDateInternal] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [derivedWidthSize, setDerivedWidthSize] = useState("");
  const [derivedWidthAudience, setDerivedWidthAudience] = useState<"women" | "men">("women");
  const [widthResolving, setWidthResolving] = useState(false);
  const [overrideJp3, setOverrideJp3] = useState("");
  const [overrideJp7, setOverrideJp7] = useState("");
  const [savedDiagnosis, setSavedDiagnosis] = useState<ReturnType<typeof buildMyStyleDiagnosis> | null>(null);
  const [gender, setGender] = useState<Gender>("female");
  const [showPoseCapture, setShowPoseCapture] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<Record<string, ValidationResult>>({});

  const birthDateValue = birthDate ?? birthDateInternal;
  const setBirthDateValue = onBirthDateChange ?? setBirthDateInternal;

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/my-style/body-profile", { cache: "no-store" });
        if (!response.ok) {
          if (response.status === 401) {
            setError("ログインが必要です");
            return;
          }
          throw new Error("体型プロフィールを読み込めませんでした");
        }

        const data = (await response.json()) as BodyProfileResponse;
        const nextMeasurements: Record<string, string> = {};
        BODY_FIELD_DEFS.forEach((field) => {
          nextMeasurements[field.key] = toStringValue(data.measurement?.[field.key]);
        });
        setMeasurements(nextMeasurements);

        const nextAxes: Record<string, string> = {};
        BODY_AXIS_DEFS.forEach((axis) => {
          nextAxes[axis.key] = toStringValue(data.body_profile?.cfv?.[axis.key]);
        });
        setAxes(nextAxes);

        const labels = (data.body_profile?.display_labels ?? {}) as Record<string, unknown>;
        const storedBirthDate = normalizeBirthDateInput(labels.birth_date);
        if (storedBirthDate) setBirthDateValue(storedBirthDate);
        setWeightKg(toStringValue(labels.weight_kg));
        setDerivedWidthSize(toStringValue(labels.derived_width_size));
        setDerivedWidthAudience(toStringValue(labels.derived_width_audience) === "men" ? "men" : "women");
        setOverrideJp3(toStringValue(labels.jp_3type_override).toLowerCase());
        setOverrideJp7(toStringValue(labels.jp_7type_override).toLowerCase());
        setSavedDiagnosis(data.diagnosis ?? null);
      } catch (nextError: any) {
        setError(String(nextError?.message ?? nextError));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [setBirthDateValue]);

  useEffect(() => {
    const footLength = toNumberValue(measurements.foot_length_cm);
    const footGirth = toNumberValue(measurements.foot_girth_cm);
    if (footLength == null || footGirth == null) {
      setWidthResolving(false);
      return;
    }

    let cancelled = false;
    setWidthResolving(true);

    void resolveShoeWidthCodeClient({
      audience: derivedWidthAudience,
      footLengthCm: footLength,
      footGirthCm: footGirth,
    })
      .then((result) => {
        if (cancelled) return;
        setDerivedWidthSize(result.widthCode ?? "");
        setDerivedWidthAudience(result.audience);
      })
      .catch(() => {
        if (!cancelled) setDerivedWidthSize("manual_required");
      })
      .finally(() => {
        if (!cancelled) setWidthResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [derivedWidthAudience, measurements.foot_girth_cm, measurements.foot_length_cm]);

  const activeIndex = useMemo(
    () => Math.max(0, BODY_FIELD_DEFS.findIndex((field) => field.key === activeFieldKey)),
    [activeFieldKey],
  );
  const activeField = BODY_FIELD_DEFS[activeIndex] ?? BODY_FIELD_DEFS[0];
  const activeFootField = (activeField.category === "foot" ? activeField.key : null) as BodyFootMeasurementKey | null;

  const numericMeasurements = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(measurements)
          .map(([key, value]) => [key, toNumberValue(value)])
          .filter((entry): entry is [string, number] => entry[1] != null),
      ),
    [measurements],
  );

  // バリデーションコンテキスト
  const validationContext: ValidationContext = useMemo(() => ({
    heightCm: toNumberValue(measurements.stature) ?? undefined,
    weightKg: toNumberValue(weightKg) ?? undefined,
    gender,
  }), [measurements.stature, weightKg, gender]);

  // アクティブフィールドの統計範囲
  const activeFieldStats = useMemo(() => {
    const heightCm = toNumberValue(measurements.stature);
    if (!heightCm || heightCm < 100) return null;
    const stats = getStatsForProfile(gender, heightCm, toNumberValue(weightKg) ?? undefined);
    return stats[activeField.key as keyof typeof stats] ?? null;
  }, [measurements.stature, weightKg, gender, activeField.key]);

  // フィールド値変更時のバリデーション
  const setMeasurementWithValidation = (key: string, value: string) => {
    setMeasurement(key, value);
    const numVal = toNumberValue(value);
    if (numVal != null) {
      const result = validateMeasurement(key, numVal, validationContext);
      setValidationWarnings((prev) => ({ ...prev, [key]: result }));
    } else {
      setValidationWarnings((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // 推定値一括入力
  const applyEstimates = () => {
    const heightCm = toNumberValue(measurements.stature);
    const weight = toNumberValue(weightKg);
    if (!heightCm || !weight) return;
    const estimates = estimateInitialMeasurements(heightCm, weight, gender);
    const next = { ...measurements };
    for (const [key, val] of Object.entries(estimates)) {
      if (!next[key] || next[key] === "") {
        next[key] = String(val);
      }
    }
    setMeasurements(next);
  };

  // カメラ推定結果の適用
  const applyPoseEstimates = (estimates: Record<string, number>) => {
    const next = { ...measurements };
    for (const [key, val] of Object.entries(estimates)) {
      if (!next[key] || next[key] === "") {
        next[key] = String(val);
      }
    }
    setMeasurements(next);
  };

  const numericAxes = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(axes)
          .map(([key, value]) => [key, toNumberValue(value)])
          .filter((entry): entry is [string, number] => entry[1] != null),
      ),
    [axes],
  );

  const axisDefsForUi = useMemo(
    () =>
      embedded
        ? BODY_AXIS_DEFS.filter((axis) => !EMBEDDED_HIDDEN_AXIS_KEYS.has(axis.key))
        : BODY_AXIS_DEFS,
    [embedded],
  );

  const activeFieldAxes = useMemo(() => {
    if (!embedded) return [];
    const axisKeys = EMBEDDED_FRAME_AXIS_MAP[activeField.key] ?? [];
    return axisDefsForUi.filter((axis) => axisKeys.includes(axis.key));
  }, [activeField.key, axisDefsForUi, embedded]);

  const completion = useMemo(() => {
    const measured = Object.keys(numericMeasurements).length;
    const axisCount = axisDefsForUi.filter((axis) => numericAxes[axis.key] != null).length;
    const measurementPct = Math.round((measured / BODY_FIELD_DEFS.length) * 100);
    const axisPct = Math.round((axisCount / Math.max(axisDefsForUi.length, 1)) * 100);
    return {
      measured,
      axisCount,
      measurementPct,
      axisPct,
      total: Math.round(measurementPct * 0.7 + axisPct * 0.3),
    };
  }, [axisDefsForUi, numericAxes, numericMeasurements]);

  const previewDiagnosis = useMemo(
    () =>
      buildMyStyleDiagnosis({
        bodyProfile: {
          cfv: numericAxes,
          display_labels: {
            birth_date: birthDateValue || undefined,
            weight_kg: readFiniteNumber(weightKg) ?? undefined,
            jp_3type_override: overrideJp3 || undefined,
            jp_7type_override: overrideJp7 || undefined,
            derived_width_size: derivedWidthSize || undefined,
            derived_width_audience: derivedWidthAudience || undefined,
          },
        },
        measurements: numericMeasurements,
      }),
    [birthDateValue, derivedWidthAudience, derivedWidthSize, numericAxes, numericMeasurements, overrideJp3, overrideJp7, weightKg],
  );

  const derived = useMemo(() => computeDerivedMetrics(numericMeasurements), [numericMeasurements]);
  const comparison = useMemo(
    () => computeBodyAverageDrift({ measurements: numericMeasurements, birthDate: birthDateValue, weightKg }),
    [birthDateValue, numericMeasurements, weightKg],
  );

  const summaryNotes = useMemo(() => {
    const notes: string[] = [];
    if (derived.legRatio != null) {
      notes.push(`脚比率は ${(derived.legRatio * 100).toFixed(1)}% で、${ratioLabel(derived.legRatio, ["コンパクト脚", "標準域", "脚長寄り"])}`);
    }
    if (derived.waistHipRatio != null) {
      notes.push(`ウエスト/ヒップ比は ${derived.waistHipRatio.toFixed(2)}。シルエットの余白設計に効きます。`);
    }
    if (derived.shoulderHipRatio != null) {
      notes.push(`肩幅/ヒップ比は ${derived.shoulderHipRatio.toFixed(2)}。上半身フレームの見え方の基礎値です。`);
    }
    previewDiagnosis.summary.top_factors.forEach((factor) => {
      notes.push(`${factor.label}: ${factor.reason}`);
    });
    return notes.slice(0, 4);
  }, [derived.legRatio, derived.shoulderHipRatio, derived.waistHipRatio, previewDiagnosis.summary.top_factors]);

  const setMeasurement = (key: string, value: string) => {
    setMeasurements((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
    setError(null);
  };

  const setAxis = (key: string, value: string) => {
    setAxes((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
    setError(null);
  };

  const moveStep = (direction: 1 | -1) => {
    const next = BODY_FIELD_DEFS[activeIndex + direction];
    if (next) setActiveFieldKey(next.key);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/my-style/body-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          measurements: numericMeasurements,
          axes: numericAxes,
          body_profile: {
            display_labels: {
              birth_date: birthDateValue || undefined,
              weight_kg: readFiniteNumber(weightKg) ?? undefined,
              derived_width_size: derivedWidthSize || undefined,
              derived_width_audience: derivedWidthAudience || undefined,
              jp_3type_override: overrideJp3 || undefined,
              jp_7type_override: overrideJp7 || undefined,
              context_type: contextType || undefined,
              stream_id: streamId || undefined,
            },
            confidence: {
              input_completion: Number((completion.total / 100).toFixed(3)),
              cfv_completion: Number((completion.axisPct / 100).toFixed(3)),
            },
          },
        }),
      });

      const data = (await response.json().catch(() => ({}))) as BodyProfileResponse & { error?: string };
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? "保存に失敗しました");
      }

      setSavedDiagnosis(data.diagnosis ?? previewDiagnosis);
      onSaved?.({
        bodyProfile: data.body_profile,
        measurement: data.measurement,
        diagnosis: data.diagnosis ?? previewDiagnosis,
      });
      setMessage("体型入力を保存しました。総合診断に即時反映されます。");
    } catch (nextError: any) {
      setError(String(nextError?.message ?? nextError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-violet-500" />
          体型プロフィールを読み込み中
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {contextType || streamId ? (
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-900">文脈つきの体型入力</div>
              <div className="mt-1 text-sm text-slate-500">
                Live や外部導線から来た場合の context を保持したまま保存します。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {contextType ? <GlassBadge variant="default">context {contextType}</GlassBadge> : null}
              {streamId ? <GlassBadge variant="default">stream {streamId.slice(0, 8)}...</GlassBadge> : null}
            </div>
          </div>
        </GlassCard>
      ) : null}

      <div className="grid gap-3 grid-cols-[0.45fr_0.55fr] lg:gap-6 lg:grid-cols-[1.16fr_0.84fr]">
        <GlassCard className="overflow-hidden p-0">
          <div className="border-b border-white/50 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-4 py-3 text-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Body Guide</div>
                <div className="mt-0.5 text-base font-black">
                  {activeField.step}. {activeField.label}
                </div>
                <p className="mt-1 max-w-xl text-xs leading-5 text-white/80">{activeField.description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <GlassBadge variant="default">
                  {completion.measured}/{BODY_FIELD_DEFS.length}
                </GlassBadge>
                <GlassBadge variant="default">
                  {completion.axisCount}/{axisDefsForUi.length} axes
                </GlassBadge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[0.45fr_0.55fr] gap-3 p-3">
            {/* LEFT: Body/Foot Guide */}
            <div className="space-y-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  {activeFootField ? "Foot" : "Body"}
                </div>
                {activeFootField ? (
                  <BodyFootGuide activeFieldKey={activeFootField} className="mx-auto w-full" />
                ) : (
                  <BodyGuide
                    activeOverlayId={activeField.overlayId ?? null}
                    onOverlayTap={(overlayId) => {
                      const nextFieldKey = OVERLAY_FIELD_MAP[overlayId];
                      if (nextFieldKey) setActiveFieldKey(nextFieldKey);
                    }}
                    className="mx-auto w-full"
                  />
                )}
              </div>

              {!embedded ? (
                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400 mb-1.5">Index</div>
                  <div className="grid grid-cols-2 gap-1">
                    {BODY_FIELD_DEFS.map((field) => (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => setActiveFieldKey(field.key)}
                        className={`rounded-lg border px-1.5 py-1 text-left text-[10px] font-bold transition ${
                          field.key === activeField.key
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* RIGHT: Input form + Frame */}
            <div className="space-y-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeField.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="rounded-xl border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                        {activeField.category}
                      </div>
                      <div className="mt-0.5 text-sm font-black text-slate-900">{activeField.label}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-right">
                      <div className="text-[9px] font-black uppercase text-slate-400">Unit</div>
                      <div className="text-sm font-black text-slate-900">{activeField.unit}</div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Value
                      <div className="mt-1 flex items-end gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          value={measurements[activeField.key] ?? ""}
                          onChange={(event) => setMeasurementWithValidation(activeField.key, event.target.value)}
                          placeholder={activeField.placeholder}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base font-black text-slate-900 outline-none"
                          aria-label={activeField.label}
                        />
                        <span className="pb-2 text-xs font-bold text-slate-400">{activeField.unit}</span>
                      </div>
                    </label>

                    {activeFieldStats && (
                      <div className="mt-1.5 text-[10px] text-slate-400">
                        目安: {activeFieldStats.min}〜{activeFieldStats.max}
                        <span className="ml-1 text-slate-300">(平均 {activeFieldStats.mean})</span>
                      </div>
                    )}

                    {validationWarnings[activeField.key]?.status === "warning" && (
                      <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
                        {validationWarnings[activeField.key].message}
                      </div>
                    )}
                    {validationWarnings[activeField.key]?.status === "error" && (
                      <div className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
                        {validationWarnings[activeField.key].message}
                      </div>
                    )}
                  </div>

                  {activeFieldAxes.length > 0 ? (
                    <div className="mt-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Frame</div>
                      <div className="mt-1.5 space-y-2">
                        {activeFieldAxes.map((axis) => (
                          <div key={axis.key} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <div className="text-xs font-black text-slate-900">{axis.label}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {AXIS_SCALE.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => setAxis(axis.key, option.value)}
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-black transition ${
                                    axes[axis.key] === option.value
                                      ? "border-slate-900 bg-slate-900 text-white"
                                      : "border-slate-200 bg-white text-slate-600"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {activeFootField ? (
                    <div className="mt-2.5 rounded-lg border border-cyan-100 bg-cyan-50/80 p-2.5">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-600">Width</div>
                      <div className="mt-0.5 text-sm font-black text-cyan-950">
                        {widthResolving ? "..." : formatShoeWidthCode(derivedWidthSize as any) || "未計算"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-cyan-700">
                        {derivedWidthAudience === "men" ? "men" : "women"}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => moveStep(-1)}
                      disabled={activeIndex === 0}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 disabled:opacity-40"
                    >
                      前へ
                    </button>
                    <div className="text-[10px] font-semibold text-slate-500">
                      {activeIndex + 1} / {BODY_FIELD_DEFS.length}
                    </div>
                    <button
                      type="button"
                      onClick={() => moveStep(1)}
                      disabled={activeIndex === BODY_FIELD_DEFS.length - 1}
                      className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-black text-white disabled:opacity-40"
                    >
                      次へ
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className={`grid gap-2 ${hideBirthDateInput ? "grid-cols-1" : "grid-cols-2"}`}>
                {!hideBirthDateInput ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Birth</div>
                    <input
                      type="date"
                      value={birthDateValue}
                      onChange={(event) => setBirthDateValue(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                    />
                  </div>
                ) : null}
                <div className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Weight</div>
                  <div className="mt-1 flex items-end gap-1">
                    <input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={weightKg}
                      onChange={(event) => setWeightKg(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none"
                      placeholder="52.0"
                    />
                    <span className="pb-1 text-[10px] font-bold text-slate-400">kg</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        <div className="space-y-6">
          {/* ---- Diagnosis Preview: あなたの骨格タイプ ---- */}
          <GlassCard className="overflow-hidden p-0">
            {/* Hero: prominent type card with gradient */}
            {(() => {
              const jp3Meta: Record<string, { emoji: string; gradient: string; gradientLight: string; ring: string; subtitle: string }> = {
                straight: { emoji: "\uD83D\uDCD0", gradient: "from-blue-500 to-indigo-600", gradientLight: "from-blue-50 to-indigo-50", ring: "ring-blue-400/30", subtitle: "\u30E1\u30EA\u30CF\u30EA\u4F53\u578B\u30FB\u7ACB\u4F53\u7684\u306A\u30D0\u30C7\u30A3\u30E9\u30A4\u30F3" },
                wave: { emoji: "\uD83C\uDF0A", gradient: "from-pink-500 to-rose-600", gradientLight: "from-pink-50 to-rose-50", ring: "ring-pink-400/30", subtitle: "\u83EF\u5962\u3067\u67D4\u3089\u304B\u3044\u66F2\u7DDA\u30E9\u30A4\u30F3" },
                natural: { emoji: "\uD83C\uDF3F", gradient: "from-emerald-500 to-teal-600", gradientLight: "from-emerald-50 to-teal-50", ring: "ring-emerald-400/30", subtitle: "\u9AA8\u683C\u3057\u3063\u304B\u308A\u30FB\u30D5\u30EC\u30FC\u30E0\u304C\u5F37\u3044" },
              };
              const meta = jp3Meta[previewDiagnosis.jp_3type] ?? jp3Meta.straight;
              const q = previewDiagnosis.quality_score;
              return (
                <>
                  {/* Top gradient header */}
                  <div className={`bg-gradient-to-r ${meta.gradient} px-4 pb-5 pt-4`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-bold tracking-wide text-white/70">{"\u3042\u306A\u305F\u306E\u9AA8\u683C\u30BF\u30A4\u30D7"}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-2xl">{meta.emoji}</span>
                          <div>
                            <div className="text-lg font-black leading-tight text-white">{previewDiagnosis.jp_3type_label}</div>
                            <div className="text-[10px] font-medium text-white/80">{meta.subtitle}</div>
                          </div>
                        </div>
                      </div>
                      {/* Compact quality ring */}
                      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/20 ring-2 ${meta.ring} backdrop-blur-sm`}>
                        <div className="text-center">
                          <div className="text-sm font-black leading-none text-white">{q}</div>
                          <div className="text-[7px] font-bold text-white/70">{"\u7CBE\u5EA6"}</div>
                        </div>
                      </div>
                    </div>
                    {/* Confidence bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-white/60">{"\u8A3A\u65AD\u306E\u78BA\u4FE1\u5EA6"}</span>
                        <span className="text-[10px] font-black text-white/90">{scoreLabel(q)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/20">
                        <motion.div
                          className="h-full rounded-full bg-white/80"
                          initial={{ width: 0 }}
                          animate={{ width: `${q}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Current diagnosis detail */}
                  <div className="px-4 pb-3 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">{"\u73FE\u5728\u306E\u8A3A\u65AD"}</span>
                      <div className={`rounded-full bg-gradient-to-r px-2 py-0.5 text-[9px] font-black text-white ${scoreTone(q)}`}>
                        {scoreLabel(q)}
                      </div>
                    </div>
                    <div className="mt-1 text-sm font-black text-slate-900">
                      {previewDiagnosis.jp_3type_label} x {previewDiagnosis.jp_7type_label}
                    </div>
                    <div className="mt-1.5 text-[11px] leading-[1.6] text-slate-500">{previewDiagnosis.summary.description}</div>
                  </div>

                  {/* Override sections */}
                  <div className="grid gap-0 border-t border-slate-100 md:grid-cols-2 md:divide-x md:divide-slate-100">
                    {/* JP3 */}
                    <div className="px-4 py-3">
                      <div className="text-[10px] font-bold text-slate-400">{"\u9AA8\u683C3\u30BF\u30A4\u30D7"}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {JP3_OPTIONS.map((option) => {
                          const m = jp3Meta[option] ?? jp3Meta.straight;
                          const selected = overrideJp3 === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setOverrideJp3((current) => (current === option ? "" : option))}
                              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                                selected
                                  ? `border-transparent bg-gradient-to-r ${m.gradient} text-white shadow-sm`
                                  : `border-slate-200 bg-white text-slate-600 hover:border-slate-300`
                              }`}
                            >
                              <span className="text-xs">{m.emoji}</span>
                              {JP3_LABELS[option]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {/* JP7 */}
                    <div className="border-t border-slate-100 px-4 py-3 md:border-t-0">
                      <div className="text-[10px] font-bold text-slate-400">{"\u8A73\u7D307\u30BF\u30A4\u30D7"}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {JP7_OPTIONS.map((option) => {
                          const selected = overrideJp7 === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setOverrideJp7((current) => (current === option ? "" : option))}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                                selected
                                  ? `border-transparent bg-gradient-to-r ${meta.gradient} text-white shadow-sm`
                                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                              }`}
                            >
                              {JP7_LABELS[option]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Average Drift</div>
                <div className="mt-0.5 text-sm font-black text-slate-900">平均との差分</div>
                <div className="mt-1 text-sm text-slate-500">
                  {comparison.age != null ? `年齢 ${comparison.age} 歳を基準に補正しています。` : "年齢未入力。身長と体重を中心に比較します。"}
                </div>
              </div>
              {comparison.age != null ? <GlassBadge variant="default">age {comparison.age}</GlassBadge> : null}
            </div>

            <div className="mt-4 space-y-2">
              {comparison.rows.map((row) => {
                const barPct = row.diff != null ? Math.min(Math.abs(row.diff) / 8, 1) * 50 : 0;
                const isPositive = (row.diff ?? 0) > 0;
                return (
                  <div key={row.key} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="w-16 text-[11px] font-bold text-slate-600">{row.label}</span>
                    <span className="w-12 text-right text-[11px] font-semibold text-slate-700">
                      {row.mineNum == null ? "-" : row.mineNum.toFixed(1)}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-white">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200" />
                      {row.diff != null ? (
                        <div
                          className={`absolute top-1/2 h-2 -translate-y-1/2 rounded-full ${
                            isPositive
                              ? "bg-gradient-to-r from-emerald-300 to-emerald-500"
                              : "bg-gradient-to-l from-amber-300 to-amber-500"
                          }`}
                          style={{
                            left: isPositive ? "50%" : `${50 - barPct}%`,
                            width: `${barPct}%`,
                          }}
                        />
                      ) : null}
                    </div>
                    <span
                      className={`w-12 text-right text-[11px] font-black ${
                        row.diff == null
                          ? "text-slate-300"
                          : isPositive
                            ? "text-emerald-600"
                            : row.diff < 0
                              ? "text-amber-600"
                              : "text-slate-400"
                      }`}
                    >
                      {row.diff == null ? "-" : row.diff > 0 ? `+${row.diff.toFixed(1)}` : row.diff.toFixed(1)}
                    </span>
                    <span className="w-12 text-right text-[10px] text-slate-400">{row.average.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Input Quality</div>
            <div className="mt-0.5 text-sm font-black text-slate-900">入力の充足度</div>
            <div className="mt-3 grid gap-2 grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">脚比率</div>
                <div className="mt-1 text-base font-black text-slate-900">
                  {derived.legRatio != null ? `${(derived.legRatio * 100).toFixed(1)}%` : "-"}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  {ratioLabel(derived.legRatio, ["コンパクト脚", "標準域", "脚長寄り"])}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">肩/ヒップ</div>
                <div className="mt-1 text-base font-black text-slate-900">
                  {derived.shoulderHipRatio != null ? derived.shoulderHipRatio.toFixed(2) : "-"}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">上半身フレーム</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">ワイズ</div>
                <div className="mt-1 text-base font-black text-slate-900">
                  {widthResolving ? "..." : formatShoeWidthCode(derivedWidthSize as any) || "-"}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">{derivedWidthAudience === "men" ? "men" : "women"}</div>
              </div>
            </div>

            <div className="mt-2 space-y-1.5 text-xs text-slate-600">
              {summaryNotes.length > 0 ? (
                summaryNotes.map((note) => (
                  <div key={note} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    {note}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-slate-400">
                  身長、股下、肩幅、ウエスト、ヒップの入力が揃うと要約が出ます。
                </div>
              )}
            </div>
          </GlassCard>

          {!embedded ? (
            <GlassCard className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">CFV14</div>
                  <div className="mt-1 text-lg font-black text-slate-900">骨格軸の手動補正</div>
                </div>
                <GlassBadge variant="default">0 / 1 / 2</GlassBadge>
              </div>

              <div className="mt-4 space-y-3">
                {BODY_AXIS_DEFS.map((axis) => (
                  <div key={axis.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-slate-900">{axis.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{axis.description}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {AXIS_SCALE.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setAxis(axis.key, option.value)}
                            className={`rounded-full border px-3 py-1 text-xs font-black transition ${
                              axes[axis.key] === option.value
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          ) : null}

          {!embedded ? (
            <GlassCard className="p-6">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Smart Input</div>
              <div className="mt-1 text-lg font-black text-slate-900">入力アシスタント</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                身長と体重から統計ベースの推定値を空欄に一括入力できます。カメラからは肩幅・袖丈・股下等を推定できます。
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-bold text-slate-500">性別</span>
                  {(["female", "male", "other"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                        gender === g
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                      aria-label={`性別: ${g === "female" ? "女性" : g === "male" ? "男性" : "その他"}`}
                    >
                      {g === "female" ? "女性" : g === "male" ? "男性" : "その他"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <GlassButton
                  onClick={applyEstimates}
                  variant="default"
                  size="sm"
                  disabled={!toNumberValue(measurements.stature) || !toNumberValue(weightKg)}
                >
                  推定値を空欄に一括入力
                </GlassButton>
                <GlassButton
                  onClick={() => setShowPoseCapture(true)}
                  variant="default"
                  size="sm"
                  disabled={!toNumberValue(measurements.stature)}
                >
                  カメラから推定
                </GlassButton>
              </div>

              {(!toNumberValue(measurements.stature) || !toNumberValue(weightKg)) && (
                <div className="mt-2 text-xs text-slate-400">
                  推定には身長と体重の入力が必要です
                </div>
              )}
            </GlassCard>
          ) : null}

          {/* カメラ推定モーダル */}
          <PoseEstimationCapture
            isOpen={showPoseCapture}
            onClose={() => setShowPoseCapture(false)}
            heightCm={toNumberValue(measurements.stature) ?? 160}
            onEstimated={applyPoseEstimates}
          />

          {!embedded ? (
            <GlassCard className="p-6">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Actions</div>
              <div className="mt-1 text-lg font-black text-slate-900">保存と周辺導線</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                `my-style/body` の役割に合わせて、ここで計測と CFV14 を固め、撮影ガイドと総合診断へ戻します。
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <GlassButton onClick={handleSave} loading={saving} variant="gradient">
                  体型を保存
                </GlassButton>
                <GlassButton href="/my-style/body/photo" variant="default">
                  全身撮影ガイド
                </GlassButton>
                {!embedded ? (
                  <GlassButton href="/body-color/avatar?tab=body" variant="default">
                    アバター体型へ
                  </GlassButton>
                ) : null}
                <GlassButton href="/my-style/diagnosis" variant="default">
                  総合診断へ
                </GlassButton>
              </div>

              {savedDiagnosis ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  保存済み推定: {savedDiagnosis.jp_3type_label} / {savedDiagnosis.jp_7type_label}
                </div>
              ) : null}

              {message ? <div className="mt-4 text-sm font-semibold text-emerald-600">{message}</div> : null}
              {error ? (
                <div className="mt-4 text-sm font-semibold text-rose-600">
                  {error}
                  {error === "ログインが必要です" ? (
                    <>
                      {" "}
                      <Link href="/login?next=/my-style/body" className="underline">
                        ログインへ
                      </Link>
                    </>
                  ) : null}
                </div>
              ) : null}
            </GlassCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
