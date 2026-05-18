"use client";

/**
 * AddAnchorModal — 「Alter に教える」入力モーダル (W1-X1)
 *
 * 設計書: docs/alter-plan-w1x1-mini-design.md §3
 *
 * 機能:
 *   - one_off / recurring を segmented control で切替
 *   - 必須 4 欄 (title / date or validFrom+weekdays / startTime / rigidity) + 折り畳み optional
 *   - 曜日ショートカット (平日 / 週末 / 毎日)
 *   - submit → buildAnchorInputFromForm → createAnchorBundle → onSuccess
 *   - submitting / error state を内蔵
 *
 * 範囲外:
 *   - PATCH/PUT (編集)
 *   - exception dates の UI
 *   - notes / extractedAt / raw storage
 */

import { useEffect, useMemo, useState } from "react";

import {
  GlassBadge,
  GlassButton,
  GlassModal,
} from "@/components/ui/glassmorphism-design";
import {
  type AnchorFormKind,
  type AnchorFormState,
  buildAnchorInputFromForm,
  buildSourceInputFromForm,
  defaultSourceTypeForKind,
  detectWeekdayShortcut,
  emptyAnchorFormState,
  LOCATION_CATEGORY_OPTIONS,
  mergeInitialState,
  RIGIDITY_OPTIONS,
  SENSITIVE_CATEGORY_OPTIONS,
  shortcutToWeekdays,
  SOURCE_TYPE_OPTIONS,
  toggleWeekday,
  type WeekdayShortcut,
} from "@/lib/plan/anchor-input-form";
import type { AnchorInputValidationError } from "@/lib/plan/external-anchor-input";
import { createAnchorBundle } from "@/lib/plan/anchor-fetch";
import type { Weekday } from "@/lib/plan/weekday-template";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; errors: AnchorInputValidationError[]; serverError?: string };

const WEEKDAY_LABELS: ReadonlyArray<{ value: Weekday; label: string }> = [
  { value: "MO", label: "月" },
  { value: "TU", label: "火" },
  { value: "WE", label: "水" },
  { value: "TH", label: "木" },
  { value: "FR", label: "金" },
  { value: "SA", label: "土" },
  { value: "SU", label: "日" },
];

const SHORTCUT_LABELS: ReadonlyArray<{ key: WeekdayShortcut; label: string }> = [
  { key: "weekdays", label: "平日" },
  { key: "weekend", label: "週末" },
  { key: "everyday", label: "毎日" },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function AddAnchorModal({
  isOpen,
  onClose,
  onSuccess,
  initialState,
  contextSubtitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** W1-X3: cell add 起動時の pre-fill。modal open ごとに反映 + close で reset。 */
  initialState?: Partial<AnchorFormState>;
  /** W1-X3: modal title 下に表示する context（"カレンダー / 4月8日(水) から" 等） */
  contextSubtitle?: string;
}) {
  const [form, setForm] = useState<AnchorFormState>(() =>
    mergeInitialState(emptyAnchorFormState(), initialState)
  );
  const [showOptional, setShowOptional] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  // Modal open transition: empty + initialState を merge して reset
  // close 時も reset（次回 open に state が漏れない）
  // initialState は deps から意図的に外す（親が render ごとに新 object を返しても reset 連鎖しない）
  useEffect(() => {
    if (isOpen) {
      setForm(mergeInitialState(emptyAnchorFormState(), initialState));
      setShowOptional(false);
      setState({ kind: "idle" });
    } else {
      // close 時 reset (CEO 補正 4)
      setForm(emptyAnchorFormState());
      setShowOptional(false);
      setState({ kind: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const errorsByField = useMemo(() => {
    if (state.kind !== "error") return new Map<string, string>();
    const map = new Map<string, string>();
    for (const e of state.errors) {
      if (!map.has(e.field)) map.set(e.field, e.message);
    }
    return map;
  }, [state]);

  const activeShortcut = useMemo(
    () => detectWeekdayShortcut(form.selectedWeekdays),
    [form.selectedWeekdays]
  );

  function resetAndClose() {
    setForm(emptyAnchorFormState());
    setShowOptional(false);
    setState({ kind: "idle" });
    onClose();
  }

  function update<K extends keyof AnchorFormState>(key: K, value: AnchorFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function switchKind(kind: AnchorFormKind) {
    setForm((prev) => ({
      ...prev,
      kind,
      // kind を変えたら排他 field をクリア（CHECK 制約とも整合）
      date: kind === "one_off" ? prev.date : "",
      validFrom: kind === "recurring" ? prev.validFrom : "",
      validUntil: kind === "recurring" ? prev.validUntil : "",
      selectedWeekdays: kind === "recurring" ? prev.selectedWeekdays : [],
    }));
  }

  async function handleSubmit() {
    setState({ kind: "submitting" });

    const built = buildAnchorInputFromForm(form);
    if (!built.valid) {
      setState({ kind: "error", errors: built.errors });
      return;
    }
    const sourceInput = buildSourceInputFromForm(form);
    const r = await createAnchorBundle({
      source: sourceInput,
      anchors: [built.input],
    });
    if (!r.ok) {
      setState({
        kind: "error",
        errors: r.errors?.flatMap((b) =>
          b.kind === "anchor_invalid" || b.kind === "source_invalid" ? b.errors : []
        ) ?? [],
        serverError: r.error,
      });
      return;
    }
    // 成功: リセット + onSuccess
    setForm(emptyAnchorFormState());
    setShowOptional(false);
    setState({ kind: "idle" });
    onSuccess();
  }

  const submitting = state.kind === "submitting";
  const sourceTypeDefault = defaultSourceTypeForKind(form.kind);

  return (
    <GlassModal isOpen={isOpen} onClose={resetAndClose} title="Alter に教える" size="md">
      <div className="space-y-4">
        {/* Context subtitle (W1-X3: pre-fill 起点を明示) */}
        {contextSubtitle && (
          <p
            className="text-xs font-medium text-indigo-600"
            data-testid="plan-add-context-subtitle"
          >
            {contextSubtitle}
          </p>
        )}

        {/* Kind segmented */}
        <div className="flex gap-2">
          {(["one_off", "recurring"] as const).map((k) => {
            const active = form.kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => switchKind(k)}
                disabled={submitting}
                className={
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                  (active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                }
              >
                {k === "one_off" ? "1 回だけ" : "繰り返し"}
              </button>
            );
          })}
        </div>

        {/* Title */}
        <Field label="予定名" error={errorsByField.get("title")}>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            disabled={submitting}
            placeholder="歯科予約 / 週次ミーティング 等"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
          />
        </Field>

        {/* one_off: date / recurring: validFrom + weekdays */}
        {form.kind === "one_off" ? (
          <Field label="日付" error={errorsByField.get("date")}>
            <input
              type="date"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
            />
          </Field>
        ) : (
          <>
            <Field label="開始日" error={errorsByField.get("validFrom")}>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) => update("validFrom", e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
              />
            </Field>
            <Field label="曜日" error={errorsByField.get("recurrenceRule")}>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {WEEKDAY_LABELS.map((wd) => {
                    const active = form.selectedWeekdays.includes(wd.value);
                    return (
                      <button
                        key={wd.value}
                        type="button"
                        onClick={() =>
                          update(
                            "selectedWeekdays",
                            toggleWeekday(form.selectedWeekdays, wd.value)
                          )
                        }
                        disabled={submitting}
                        className={
                          "h-9 w-9 rounded-full border text-sm font-medium transition " +
                          (active
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                        }
                      >
                        {wd.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-1">
                  {SHORTCUT_LABELS.map((sc) => {
                    const active = activeShortcut === sc.key;
                    return (
                      <button
                        key={sc.key}
                        type="button"
                        onClick={() => update("selectedWeekdays", shortcutToWeekdays(sc.key))}
                        disabled={submitting}
                        className={
                          "rounded-md border px-2 py-1 text-xs font-medium transition " +
                          (active
                            ? "border-indigo-500 bg-indigo-100 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")
                        }
                      >
                        {sc.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Field>
          </>
        )}

        {/* startTime */}
        <Field label="開始時刻" error={errorsByField.get("startTime")}>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => update("startTime", e.target.value)}
            disabled={submitting}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
          />
        </Field>

        {/* rigidity */}
        <Field label="動かせなさ" error={errorsByField.get("rigidity")}>
          <div className="grid grid-cols-2 gap-2">
            {RIGIDITY_OPTIONS.map((opt) => {
              const active = form.rigidity === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update("rigidity", opt.value)}
                  disabled={submitting}
                  className={
                    "rounded-lg border px-3 py-2 text-left text-sm transition " +
                    (active
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                  }
                >
                  <p className="font-medium">{opt.label}</p>
                  <p className="text-xs text-slate-500">{opt.hint}</p>
                </button>
              );
            })}
          </div>
        </Field>

        {/* Optional 折り畳み */}
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600"
        >
          <span>{showOptional ? "▼" : "▶"}</span>
          もっと細かく教える
        </button>

        {showOptional && (
          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <Field label="終了時刻（任意）" error={errorsByField.get("endTime")}>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => update("endTime", e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
              />
            </Field>

            {form.kind === "recurring" && (
              <Field label="終了日（任意）" error={errorsByField.get("validUntil")}>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => update("validUntil", e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
                />
              </Field>
            )}

            <Field label="場所カテゴリ（任意）" error={errorsByField.get("locationCategory")}>
              <select
                value={form.locationCategory}
                onChange={(e) => update("locationCategory", e.target.value as AnchorFormState["locationCategory"])}
                disabled={submitting}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
              >
                <option value="">未選択</option>
                {LOCATION_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="場所名（任意）" error={errorsByField.get("locationText")}>
              <input
                type="text"
                value={form.locationText}
                onChange={(e) => update("locationText", e.target.value)}
                disabled={submitting}
                placeholder="渋谷歯科クリニック 等"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
              />
            </Field>

            <Field label="敏感カテゴリ（任意）" error={errorsByField.get("sensitiveCategory")}>
              <select
                value={form.sensitiveCategory}
                onChange={(e) =>
                  update("sensitiveCategory", e.target.value as AnchorFormState["sensitiveCategory"])
                }
                disabled={submitting}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
              >
                <option value="">未選択</option>
                {SENSITIVE_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="ソース">
              <div className="flex gap-2">
                {SOURCE_TYPE_OPTIONS.map((o) => {
                  const effective = form.sourceType === "" ? sourceTypeDefault : form.sourceType;
                  const active = effective === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => update("sourceType", o.value)}
                      disabled={submitting}
                      className={
                        "flex-1 rounded-lg border px-3 py-2 text-sm transition " +
                        (active
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        )}

        {/* Server error */}
        {state.kind === "error" && state.serverError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {state.serverError}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <GlassButton variant="secondary" onClick={resetAndClose} disabled={submitting}>
            やめる
          </GlassButton>
          <GlassButton variant="primary" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "送信中…" : "教える"}
          </GlassButton>
        </div>

        {form.kind === "recurring" && form.selectedWeekdays.length > 0 && (
          <p className="text-xs text-slate-400">
            <GlassBadge variant="default" size="sm">プレビュー</GlassBadge>{" "}
            {form.selectedWeekdays.join(",")} に繰り返す予定として Alter に教えます
          </p>
        )}
      </div>
    </GlassModal>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </label>
  );
}
