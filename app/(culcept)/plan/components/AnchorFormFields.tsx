"use client";

/**
 * AnchorFormFields — Add / Edit modal で共通の form fields (W1-X2)
 *
 * 設計書: docs/alter-plan-w1x2-edit-anchor-mini-design.md §3
 *
 * 責務:
 *   - context subtitle / kind segmented / title / date or validFrom+weekdays /
 *     startTime / rigidity / 折り畳み optional (endTime / validUntil /
 *     locationCategory / locationText / sensitiveCategory / sourceType)
 *   - kindMutable=false で kind 切替 disabled + 注釈表示（EditAnchorModal）
 *   - server error メッセージの表示
 *
 * 範囲外:
 *   - submit / cancel button (親 Modal で持つ)
 *   - data fetch / Modal open/close 制御
 */

import { useMemo, useState } from "react";

import { GlassBadge } from "@/components/ui/glassmorphism-design";
import {
  addExceptionDate,
  type AnchorFormKind,
  type AnchorFormState,
  defaultSourceTypeForKind,
  detectWeekdayShortcut,
  formatExceptionDateLabel,
  LOCATION_CATEGORY_OPTIONS,
  removeExceptionDate,
  RIGIDITY_OPTIONS,
  SENSITIVE_CATEGORY_OPTIONS,
  shortcutToWeekdays,
  SOURCE_TYPE_OPTIONS,
  toggleWeekday,
  type WeekdayShortcut,
} from "@/lib/plan/anchor-input-form";
import type { Weekday } from "@/lib/plan/weekday-template";

import {
  PlaceCandidatesPanel,
  type PlaceCandidate,
} from "./PlaceCandidatesPanel";
import { useBiasContext } from "./_useBiasContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

export interface AnchorFormFieldsProps {
  form: AnchorFormState;
  onChange: <K extends keyof AnchorFormState>(
    key: K,
    value: AnchorFormState[K]
  ) => void;
  /** kind 切替時に排他 field をクリアする callback（kindMutable=true 時のみ呼ばれる） */
  onSwitchKind: (kind: AnchorFormKind) => void;
  errorsByField: Map<string, string>;
  submitting: boolean;
  showOptional: boolean;
  onToggleOptional: () => void;
  contextSubtitle?: string;
  /** false なら kind segmented control を disabled + 注釈表示（Edit modal） */
  kindMutable: boolean;
  /** server-side validation 失敗以外の汎用エラー（network / 5xx 等） */
  serverError?: string;
}

export function AnchorFormFields({
  form,
  onChange,
  onSwitchKind,
  errorsByField,
  submitting,
  showOptional,
  onToggleOptional,
  contextSubtitle,
  kindMutable,
  serverError,
}: AnchorFormFieldsProps) {
  const activeShortcut = useMemo(
    () => detectWeekdayShortcut(form.selectedWeekdays),
    [form.selectedWeekdays]
  );
  const sourceTypeDefault = defaultSourceTypeForKind(form.kind);

  // Phase 2-D: PlaceCandidatesPanel 用 bias context (baseline-only v1)
  const { biasContext } = useBiasContext();

  // Phase 2-D: PlaceCandidatesPanel handlers
  // 候補 tap → locationText を canonical text に更新 (= "displayName · address")
  const handlePlaceCandidateSelect = (
    canonicalText: string,
    _candidate: PlaceCandidate,
  ) => {
    onChange("locationText", canonicalText);
    // Note: cache write to place_resolution_cache は本 wave 範囲外 (Phase 2-D+ 預け)。
    // MapTab 初回 geocode で resolved になる (+1 Places API call、cache 化される)。
  };

  // 候補を選ばずに保存 → 何もしない (panel 内部で close 処理)
  const handlePlaceCandidateSkip = () => {
    // no-op: 親では locationText を変えない、panel が closed 状態に
  };

  // W1-X4: exception dates の add 候補（form state には含めない、submit 対象でない）
  const [exceptionCandidate, setExceptionCandidate] = useState("");

  function handleAddException() {
    if (!exceptionCandidate) return;
    onChange(
      "exceptionDates",
      addExceptionDate(form.exceptionDates, exceptionCandidate)
    );
    setExceptionCandidate("");
  }

  return (
    <div className="space-y-4">
      {contextSubtitle && (
        <p
          className="text-xs font-medium text-indigo-600"
          data-testid="plan-form-context-subtitle"
        >
          {contextSubtitle}
        </p>
      )}

      {/* Kind segmented */}
      <div>
        <div className="flex gap-2">
          {(["one_off", "recurring"] as const).map((k) => {
            const active = form.kind === k;
            const disabled = submitting || !kindMutable;
            return (
              <button
                key={k}
                type="button"
                onClick={() => kindMutable && onSwitchKind(k)}
                disabled={disabled}
                aria-disabled={!kindMutable}
                className={
                  "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                  (active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300") +
                  (!kindMutable && !active ? " opacity-50" : "") +
                  (!kindMutable ? " cursor-not-allowed" : "")
                }
              >
                {k === "one_off" ? "1 回だけ" : "繰り返し"}
              </button>
            );
          })}
        </div>
        {!kindMutable && (
          <p className="mt-1 text-xs text-slate-400">
            ここは変えられません（種類は新規登録時のみ選べます）
          </p>
        )}
      </div>

      {/* Title */}
      <Field label="予定名" error={errorsByField.get("title")}>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange("title", e.target.value)}
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
            onChange={(e) => onChange("date", e.target.value)}
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
              onChange={(e) => onChange("validFrom", e.target.value)}
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
                        onChange(
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
                      onClick={() =>
                        onChange("selectedWeekdays", shortcutToWeekdays(sc.key))
                      }
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

          {/* W1-X4: Exception dates（祝日や出張をスキップ） */}
          <Field
            label="例外日（任意）"
            error={errorsByField.get("exceptionDates")}
          >
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                祝日や出張など、この日だけスキップする日を教えます
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={exceptionCandidate}
                  onChange={(e) => setExceptionCandidate(e.target.value)}
                  disabled={submitting}
                  data-testid="plan-form-exception-candidate"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleAddException}
                  disabled={submitting || !exceptionCandidate}
                  data-testid="plan-form-exception-add"
                  className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-600 transition hover:border-indigo-500 hover:bg-indigo-50 disabled:opacity-50"
                >
                  + 追加
                </button>
              </div>
              {form.exceptionDates.length === 0 ? (
                <p
                  className="text-xs text-slate-400"
                  data-testid="plan-form-exception-empty"
                >
                  例外日なし（毎週繰り返し）
                </p>
              ) : (
                <ul
                  className="space-y-1"
                  data-testid="plan-form-exception-list"
                >
                  {form.exceptionDates.map((d) => (
                    <li
                      key={d}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1.5"
                      data-testid={`plan-form-exception-item-${d}`}
                    >
                      <span className="text-sm text-slate-700">
                        {formatExceptionDateLabel(d)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onChange(
                            "exceptionDates",
                            removeExceptionDate(form.exceptionDates, d)
                          )
                        }
                        disabled={submitting}
                        aria-label={`${formatExceptionDateLabel(d)} を例外日から削除`}
                        data-testid={`plan-form-exception-remove-${d}`}
                        className="rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        </>
      )}

      {/* startTime */}
      <Field label="開始時刻" error={errorsByField.get("startTime")}>
        <input
          type="time"
          value={form.startTime}
          onChange={(e) => onChange("startTime", e.target.value)}
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
                onClick={() => onChange("rigidity", opt.value)}
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

      {/*
       * Phase 2-D 補正 (CEO 補正 2026-05-21): locationText を「もっと細かく」 disclosure 外の
       * 主要 field へ昇格。CEO 指示「場所の設定が教える の下に埋もれている」 の core 解決。
       *
       * - input は常時 visible (rigidity の直下)
       * - 直下に PlaceCandidatesPanel (非強制 UI、close/skip 可)
       * - sensitiveCategory が set されたら panel は完全抑制
       * - locationCategory は disclosure 内に残す (CEO C2 scope minimum、locationText のみ昇格)
       */}
      <Field label="場所（任意）" error={errorsByField.get("locationText")}>
        {/*
         * Phase 2-D C3 polish: focus-visible ring 統一 (PlaceCandidatesPanel と整合)
         * keyboard focus 時に subtle indigo ring、mouse focus 時は不要
         */}
        <input
          type="text"
          value={form.locationText}
          onChange={(e) => onChange("locationText", e.target.value)}
          disabled={submitting}
          placeholder="例: 成田のスタバ / 渋谷歯科クリニック"
          data-testid="plan-form-location-text"
          className="
            w-full rounded-lg border border-slate-200 px-3 py-2 text-sm
            transition-colors duration-150
            focus:border-indigo-400 focus:outline-none
            focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1
            disabled:opacity-50
          "
        />
        <PlaceCandidatesPanel
          query={form.locationText}
          biasContext={biasContext}
          sensitive={!!form.sensitiveCategory}
          onSelect={handlePlaceCandidateSelect}
          onSkip={handlePlaceCandidateSkip}
        />
      </Field>

      {/* Optional 折り畳み */}
      <button
        type="button"
        onClick={onToggleOptional}
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
              onChange={(e) => onChange("endTime", e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
            />
          </Field>

          {form.kind === "recurring" && (
            <Field label="終了日（任意）" error={errorsByField.get("validUntil")}>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => onChange("validUntil", e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-50"
              />
            </Field>
          )}

          <Field label="場所カテゴリ（任意）" error={errorsByField.get("locationCategory")}>
            <select
              value={form.locationCategory}
              onChange={(e) =>
                onChange(
                  "locationCategory",
                  e.target.value as AnchorFormState["locationCategory"]
                )
              }
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

          {/*
           * Phase 2-D 補正: locationText (場所名) は disclosure 外の主要 field へ昇格済 (上記参照)。
           * 本 disclosure には locationCategory / sensitiveCategory / endTime / validUntil 等の
           * advanced field のみ残す。
           */}

          <Field label="敏感カテゴリ（任意）" error={errorsByField.get("sensitiveCategory")}>
            <select
              value={form.sensitiveCategory}
              onChange={(e) =>
                onChange(
                  "sensitiveCategory",
                  e.target.value as AnchorFormState["sensitiveCategory"]
                )
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
                const effective =
                  form.sourceType === "" ? sourceTypeDefault : form.sourceType;
                const active = effective === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange("sourceType", o.value)}
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

      {serverError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {serverError}
        </div>
      )}

      {form.kind === "recurring" && form.selectedWeekdays.length > 0 && (
        <p className="text-xs text-slate-400">
          <GlassBadge variant="default" size="sm">プレビュー</GlassBadge>{" "}
          {form.selectedWeekdays.join(",")} に繰り返す予定として Alter に教えます
        </p>
      )}
    </div>
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
