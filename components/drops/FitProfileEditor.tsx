"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FitMeasurementGuide from "@/components/drops/FitMeasurementGuide";
import {
  calculateFitCompleteness,
  getFitProfileConfig,
  isFieldVisibleForSubcategory,
  type FitFormValueMap,
  type UserFootReference,
} from "@/lib/drops/fitProfile";
import { formatShoeWidthCode } from "@/lib/shoeWidth";
import { resolveShoeWidthCodeClient } from "@/lib/shoeWidthClient";

type Props = {
  categoryMain: string;
  subcategoryId: string;
  values: FitFormValueMap;
  onChange: (key: string, value: string) => void;
  userFootReference?: UserFootReference | null;
  layout?: "wizard" | "page";
};

function inputId(key: string) {
  return `fit-field-${key}`;
}

export default function FitProfileEditor({
  categoryMain,
  subcategoryId,
  values,
  onChange,
  userFootReference,
  layout = "page",
}: Props) {
  const config = useMemo(() => getFitProfileConfig(categoryMain, subcategoryId), [categoryMain, subcategoryId]);
  const completeness = useMemo(() => calculateFitCompleteness(config, values), [config, values]);
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (config.categoryMain !== "shoes") return;
    const footLength = Number(values.recommended_foot_length_cm ?? NaN);
    const footGirth = Number(values.recommended_foot_girth_cm ?? NaN);

    if (!Number.isFinite(footLength) || !Number.isFinite(footGirth)) {
      if (values.recommended_width) {
        onChange("recommended_width", "");
        onChange("recommended_width_size", "");
      }
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    void resolveShoeWidthCodeClient({
      audience: values.shoe_width_audience === "men" ? "men" : undefined,
      footLengthCm: footLength,
      footGirthCm: footGirth,
      subcategoryId,
    }).then((result) => {
      if (requestIdRef.current !== requestId) return;
      const nextValue = result.widthCode ?? "";
      if (values.recommended_width !== nextValue) {
        onChange("recommended_width", nextValue);
      }
      if (values.recommended_width_size !== nextValue) {
        onChange("recommended_width_size", nextValue);
      }
      if (!values.shoe_width_audience) {
        onChange("shoe_width_audience", result.audience);
      }
    }).catch(() => {
      if (requestIdRef.current !== requestId) return;
      onChange("recommended_width", "manual_required");
      onChange("recommended_width_size", "manual_required");
    });
  }, [
    config.categoryMain,
    onChange,
    subcategoryId,
    values.recommended_foot_girth_cm,
    values.recommended_foot_length_cm,
    values.recommended_width,
    values.recommended_width_size,
    values.shoe_width_audience,
  ]);

  const wrapperClasses =
    layout === "wizard"
      ? "grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]"
      : "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]";

  return (
    <div className={wrapperClasses}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-700">{config.completenessTitle}</div>
            <div className="text-xs text-slate-400">
              必須 {completeness.requiredFilled}/{completeness.requiredTotal}
            </div>
          </div>
          <div className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white">
            {completeness.percent}% 完了
          </div>
        </div>

        {config.attributeFields.length > 0 ? (
          <div className="rounded-3xl border border-white/80 bg-white/70 p-5">
            <div className="mb-4 text-sm font-semibold text-slate-700">評価項目</div>
            <div className="grid gap-4 md:grid-cols-2">
              {config.attributeFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <button
                    type="button"
                    className="text-left text-sm font-medium text-slate-600"
                    onClick={() => setActiveFieldKey(field.key)}
                  >
                    {field.label}
                    {field.required ? <span className="ml-1 text-rose-500">*</span> : null}
                  </button>
                  <select
                    id={inputId(field.key)}
                    value={values[field.key] ?? ""}
                    onFocus={() => setActiveFieldKey(field.key)}
                    onChange={(event) => onChange(field.key, event.currentTarget.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="">選択してください</option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {config.measurementSections.map((section) => {
          const visibleFields = section.fields.filter((field) => isFieldVisibleForSubcategory(field, config.subcategoryId));
          if (visibleFields.length === 0) return null;
          return (
            <div key={section.key} className="rounded-3xl border border-white/80 bg-white/70 p-5">
              <div className="mb-4">
                <div className="text-sm font-semibold text-slate-700">{section.title}</div>
                {section.description ? <div className="text-xs text-slate-400">{section.description}</div> : null}
              </div>

              {section.key === "user_reference" && userFootReference ? (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  <div className="font-semibold text-slate-700">登録済みの足データ</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {userFootReference.foot_length_cm != null ? (
                      <span>足長 {userFootReference.foot_length_cm}cm</span>
                    ) : null}
                    {userFootReference.foot_girth_cm != null ? (
                      <span>足囲 {userFootReference.foot_girth_cm}cm</span>
                    ) : null}
                    {userFootReference.foot_width_cm != null ? (
                      <span>足幅 {userFootReference.foot_width_cm}cm</span>
                    ) : null}
                    {userFootReference.derived_width_size ? (
                      <span>標準ワイズ {formatShoeWidthCode(userFootReference.derived_width_size as any)}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {visibleFields.map((field) => {
                  const value = values[field.key] ?? "";
                  const readOnlyValue =
                    field.key === "recommended_width" ? formatShoeWidthCode((value || null) as any) : value;
                  return (
                    <div key={field.key} className="space-y-2">
                      <button
                        type="button"
                        className="text-left text-sm font-medium text-slate-600"
                        onClick={() => setActiveFieldKey(field.key)}
                      >
                        {field.label}
                        {field.required ? <span className="ml-1 text-rose-500">*</span> : null}
                      </button>

                      {field.readOnly ? (
                        <div
                          className="flex min-h-[52px] items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
                          onClick={() => setActiveFieldKey(field.key)}
                        >
                          {readOnlyValue || "足長と足囲を入力すると自動表示されます"}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            id={inputId(field.key)}
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            value={value}
                            onFocus={() => setActiveFieldKey(field.key)}
                            onClick={() => setActiveFieldKey(field.key)}
                            onChange={(event) => onChange(field.key, event.currentTarget.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                            placeholder={field.placeholder ?? "0.0"}
                          />
                          {field.unit ? <span className="w-10 text-xs text-slate-400">{field.unit}</span> : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {config.guideId ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/80 bg-white/70 p-5">
            <div className="mb-4">
              <div className="text-sm font-semibold text-slate-700">計測ガイド</div>
              <div className="text-xs text-slate-400">
                入力欄を選ぶと、対応する計測位置だけを表示します。
              </div>
            </div>
            <FitMeasurementGuide guideId={config.guideId} activeFieldKey={activeFieldKey} />
          </div>

          {completeness.missingLabels.length > 0 ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700">
              未入力: {completeness.missingLabels.join(" / ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
