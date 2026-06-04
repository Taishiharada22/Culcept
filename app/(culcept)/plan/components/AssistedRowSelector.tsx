"use client";

/**
 * AssistedRowSelector — 本人行 band を assisted 指定する UI（SR B1b-2C-2）
 *
 * 役割（表示器に徹する）:
 *   - 元画像を blob: ObjectURL で fit-to-width 表示
 *   - 画像 tap で personRowBand を suggest（B1b-2C-1 pure model 委譲）
 *   - 上下ハンドル（mouse / touch / keyboard）で各 band の y を調整
 *   - band 切替（ヘッダ / 行）+ クリア + 確認 CTA
 *   - validation は B1b-2C-1 `validateSelection` を直接消費（component に独自検証なし）
 *
 * 不変原則（CEO 補正・2026-05-31）:
 *   - **画像本体（File/Blob/dataURL/base64）は props/state/localStorage に保持しない**。
 *     `imageObjectUrl` は host が `URL.createObjectURL(file)` で作る blob: URL のみ受け取る。
 *     **`data:` URL は禁止**（content を文字列で運ぶため）。`revokeObjectURL` は host 責務。
 *   - **headerBand は contract 必須**（B1b-2C-1）。両 band valid + ordering OK でのみ CTA active。
 *   - **永続化は host が担当**: component は onChange で通知するだけ（localStorage は触らない）。
 *   - **fingerprint は host が生成**: component は受け取って onChange に乗せるのみ。
 *
 * 範囲外（CEO 提示どおり）:
 *   - canvas crop 生成（B1b-2C-3）
 *   - VLM 実行 / upload UI 本実装 / 本流入口 / DB write
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type AssistedRowSelection,
  type BandY,
  type SelectionValidation,
  normalizeBand,
  normalizeSelection,
  suggestBandsFromTap,
  validateBand,
  validateDayColumns,
  validateSelection,
} from "@/lib/plan/shift/assistedRowSelection";

type BandKind = "header" | "personRow";
/** 編集対象: 帯 2 種 + day列中心 X（S-geo-2）。 */
type EditTarget = BandKind | "dayColumn";

export interface AssistedRowSelectorProps {
  /**
   * 表示用 URL。**blob: ObjectURL のみ許可**（host 側で createObjectURL → revokeObjectURL を担当）。
   * - 許可: `blob:...`, 将来の signed HTTPS URL
   * - 禁止: `data:image/...` / base64 文字列 / File / Blob を直接渡すこと
   * 画像本体を component の props/state に入れないため。
   */
  imageObjectUrl: string;
  /** 元画像 px 幅（host が File→Image で取得）。 */
  imageW: number;
  /** 元画像 px 高さ。 */
  imageH: number;
  /** 任意: 再開時の初期 selection（host が localStorage 由来などで渡す）。 */
  initialSelection?: AssistedRowSelection;
  /** 任意: image fingerprint（host が生成・component は計算しない）。 */
  imageFingerprint?: string;
  /** selection 編集の通知（host が永続化を担当・component は触らない）。 */
  onChange?: (selection: AssistedRowSelection) => void;
  /** CTA active 時のみ呼ばれる（= 両 band valid + ordering OK）。 */
  onConfirm: (selection: AssistedRowSelection) => void;
  /** modal 閉じる等。任意。 */
  onCancel?: () => void;
}

/** band overlay の色（header=sky / personRow=violet で一目判別）。 */
const BAND_TINT: Record<BandKind, string> = {
  header: "bg-sky-300/30 border-sky-400/70",
  personRow: "bg-violet-300/35 border-violet-500/70",
};
const BAND_LABEL: Record<BandKind, string> = {
  header: "ヘッダ帯",
  personRow: "行帯",
};
/** editTarget 切替の表示名（帯 2 種 + day列中心）。 */
const EDIT_TARGET_LABEL: Record<EditTarget, string> = {
  header: "ヘッダを調整",
  personRow: "本人行を調整",
  dayColumn: "日列の中心",
};

interface HandleDragState {
  band: BandKind;
  edge: "top" | "bottom";
  /** 画像高さに対する 1px 相当の表示 px（ratio 計算用） */
  imageH: number;
  /** drag 開始時の画像 y（offsetY 計算の起点） */
  startImageY: number;
  /** drag 開始時の clientY */
  startClientY: number;
}

export function AssistedRowSelector({
  imageObjectUrl,
  imageW,
  imageH,
  initialSelection,
  imageFingerprint,
  onChange,
  onConfirm,
  onCancel,
}: AssistedRowSelectorProps) {
  const [selection, setSelection] = useState<AssistedRowSelection | undefined>(
    initialSelection
  );
  const [editTarget, setEditTarget] = useState<EditTarget>("personRow");
  /** dayColumn モードで 1 点目（pending）を保持。2 点目で dayColumns 確定。 */
  const [pendingFirstX, setPendingFirstX] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<HandleDragState | null>(null);

  // initialSelection が変わったら追従（host の再オープン用）
  useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection]);

  const emit = useCallback(
    (next: AssistedRowSelection) => {
      setSelection(next);
      onChange?.(next);
    },
    [onChange]
  );

  /** 表示 client y → 画像 px y（fit-to-width で aspect 維持・integer snap） */
  const clientToImageY = useCallback(
    (clientY: number): number | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) return null;
      const ratio = imageH / rect.height;
      const y = Math.round((clientY - rect.top) * ratio);
      return Math.max(0, Math.min(imageH, y));
    },
    [imageH]
  );

  /** 表示 client x → 画像 px x（fit-to-width で aspect 維持・integer snap）。dayColumn 用。 */
  const clientToImageX = useCallback(
    (clientX: number): number | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const ratio = imageW / rect.width;
      const x = Math.round((clientX - rect.left) * ratio);
      return Math.max(0, Math.min(imageW, x));
    },
    [imageW]
  );

  /** 画像 tap（空白）→ suggest（pure model 委譲）。ハンドル/band 内 click は除外。 */
  const handleImageTap = useCallback(
    (clientY: number) => {
      const y = clientToImageY(clientY);
      if (y === null) return;
      const suggested = suggestBandsFromTap(y, imageH);
      emit({
        imageW,
        imageH,
        headerBand: suggested.headerBand,
        personRowBand: suggested.personRowBand,
        ...(imageFingerprint ? { imageFingerprint } : {}),
      });
      setEditTarget("personRow");
    },
    [clientToImageY, emit, imageFingerprint, imageH, imageW]
  );

  /**
   * dayColumn モードの画像 tap → day1中心/月末日中心 を 2 点で取る。
   * 1 点目を pending に置き、2 点目で確定（left=day1・right=月末日 に auto-sort）。
   * 帯指定前（selection なし）は X を取らない（帯 → X の順）。
   */
  const handleDayColumnTap = useCallback(
    (clientX: number) => {
      if (!selection) return;
      const x = clientToImageX(clientX);
      if (x === null) return;
      if (pendingFirstX === null) {
        // 1 点目: pending に置き、確定済 dayColumns は一旦クリア（新ペアを作る）
        setPendingFirstX(x);
        if (selection.dayColumns) emit({ ...selection, dayColumns: undefined });
      } else {
        // 2 点目: ペア確定（位置で左=day1, 右=月末日 に並べ替え）
        const firstDayCenterX = Math.min(pendingFirstX, x);
        const lastDayCenterX = Math.max(pendingFirstX, x);
        setPendingFirstX(null);
        emit({ ...selection, dayColumns: { firstDayCenterX, lastDayCenterX } });
      }
    },
    [clientToImageX, emit, pendingFirstX, selection]
  );

  /** Pointer events: mouse + touch + pen を一本化（モバイル/PC 共通） */
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !selection) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = imageH / Math.max(1, rect.height);
      const deltaImageY = Math.round((e.clientY - d.startClientY) * ratio);
      const newY = Math.max(0, Math.min(imageH, d.startImageY + deltaImageY));
      const band = selection[d.band === "header" ? "headerBand" : "personRowBand"];
      const nextBand: BandY =
        d.edge === "top" ? { top: newY, bottom: band.bottom } : { top: band.top, bottom: newY };
      const normalized = normalizeBand(nextBand, imageH);
      emit(
        normalizeSelection({
          ...selection,
          [d.band === "header" ? "headerBand" : "personRowBand"]: normalized,
        } as AssistedRowSelection)
      );
    },
    [emit, imageH, selection]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  }, [onPointerMove]);

  const beginHandleDrag = useCallback(
    (e: React.PointerEvent, band: BandKind, edge: "top" | "bottom") => {
      e.stopPropagation();
      if (!selection) return;
      const cur = selection[band === "header" ? "headerBand" : "personRowBand"];
      dragRef.current = {
        band,
        edge,
        imageH,
        startImageY: edge === "top" ? cur.top : cur.bottom,
        startClientY: e.clientY,
      };
      setEditTarget(band);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [imageH, onPointerMove, onPointerUp, selection]
  );

  /** keyboard: ↑↓ ±1 / Shift+↑↓ ±10 / Home=0 / End=imageH（a11y） */
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent, band: BandKind, edge: "top" | "bottom") => {
      if (!selection) return;
      let dy = 0;
      if (e.key === "ArrowUp") dy = e.shiftKey ? -10 : -1;
      else if (e.key === "ArrowDown") dy = e.shiftKey ? 10 : 1;
      else if (e.key === "Home") {
        e.preventDefault();
        const cur = selection[band === "header" ? "headerBand" : "personRowBand"];
        const next: BandY = edge === "top" ? { top: 0, bottom: cur.bottom } : { top: cur.top, bottom: 0 };
        emit(
          normalizeSelection({
            ...selection,
            [band === "header" ? "headerBand" : "personRowBand"]: normalizeBand(next, imageH),
          } as AssistedRowSelection)
        );
        return;
      } else if (e.key === "End") {
        e.preventDefault();
        const cur = selection[band === "header" ? "headerBand" : "personRowBand"];
        const next: BandY =
          edge === "top" ? { top: imageH, bottom: cur.bottom } : { top: cur.top, bottom: imageH };
        emit(
          normalizeSelection({
            ...selection,
            [band === "header" ? "headerBand" : "personRowBand"]: normalizeBand(next, imageH),
          } as AssistedRowSelection)
        );
        return;
      } else return;
      e.preventDefault();
      const cur = selection[band === "header" ? "headerBand" : "personRowBand"];
      const next: BandY =
        edge === "top" ? { top: cur.top + dy, bottom: cur.bottom } : { top: cur.top, bottom: cur.bottom + dy };
      emit(
        normalizeSelection({
          ...selection,
          [band === "header" ? "headerBand" : "personRowBand"]: normalizeBand(next, imageH),
        } as AssistedRowSelection)
      );
    },
    [emit, imageH, selection]
  );

  const handleClear = useCallback(() => {
    setSelection(undefined);
    setEditTarget("personRow");
    setPendingFirstX(null);
    // onChange は host の永続化が undefined を扱えるとは限らないため、ここでは emit しない（host は CTA で確定）
  }, []);

  const validation: SelectionValidation = useMemo(
    () =>
      selection
        ? validateSelection(selection)
        : { ok: false, ctaActive: false, headerIssues: [], personRowIssues: [], orderingIssue: null },
    [selection]
  );
  // day列中心 X が valid か（S-geo-2）。CTA は Y 帯 valid ∧ X 2 点 valid で active。
  const dayColumnsValid =
    !!selection?.dayColumns &&
    validateDayColumns(selection.dayColumns, imageW).length === 0;
  const ctaActive = !!selection && validation.ctaActive && dayColumnsValid;

  // ── render ──
  // band overlay の位置（画像高さに対する %）
  const overlayStyle = (band: BandY | undefined) => {
    if (!band || imageH <= 0) return undefined;
    const topPct = (band.top / imageH) * 100;
    const heightPct = ((band.bottom - band.top) / imageH) * 100;
    return { top: `${topPct}%`, height: `${heightPct}%` };
  };

  return (
    <div data-testid="assisted-row-selector" className="flex flex-col gap-3">
      {/* hint */}
      <p
        data-testid="assisted-row-hint"
        className="text-[11px] text-slate-600"
      >
        {selection
          ? "ハンドルで上下を調整できます。「ヘッダ帯」と「行帯」を切り替えて指定してください。"
          : "画像を tap して自分の行を指定してください。"}
      </p>

      {/* day列中心モードの誘導（S-geo-2・1日中心 → 月末日中心） */}
      {editTarget === "dayColumn" && (
        <p
          data-testid="assisted-row-daycolumn-hint"
          className="text-[11px] text-emerald-700"
        >
          {selection?.dayColumns && pendingFirstX === null
            ? "日列の中心を指定済みです（やり直すには再度タップ）。"
            : pendingFirstX !== null
              ? "次に「月末日」の列中心をタップしてください。"
              : "ヘッダの「1日」の列中心をタップしてください。"}
        </p>
      )}

      {/* image + overlays */}
      <div
        ref={containerRef}
        data-testid="assisted-row-image-wrapper"
        className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
        style={{ aspectRatio: imageW > 0 && imageH > 0 ? `${imageW} / ${imageH}` : undefined }}
        onPointerDown={(e) => {
          // band/handle の click は stopPropagation で除外（ここに来るのは画像空白のみ）
          if (e.button !== undefined && e.button !== 0) return;
          if (editTarget === "dayColumn") handleDayColumnTap(e.clientX);
          else handleImageTap(e.clientY);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="assisted-row-selector-image"
          src={imageObjectUrl}
          alt="シフト原稿"
          draggable={false}
          className="pointer-events-none block h-full w-full select-none object-cover"
        />

        {/* header band overlay */}
        {selection?.headerBand && (
          <div
            data-testid="assisted-row-header-band"
            data-edit={editTarget === "header" ? "true" : "false"}
            className={`absolute left-0 right-0 border ${BAND_TINT.header} ${
              editTarget === "header" ? "ring-1 ring-sky-500" : ""
            }`}
            style={overlayStyle(selection.headerBand)}
            onPointerDown={(e) => {
              e.stopPropagation();
              setEditTarget("header");
            }}
            aria-label={BAND_LABEL.header}
          >
            <Handle
              band="header"
              edge="top"
              y={selection.headerBand.top}
              imageH={imageH}
              onPointerDown={(e) => beginHandleDrag(e, "header", "top")}
              onKeyDown={(e) => onHandleKeyDown(e, "header", "top")}
            />
            <Handle
              band="header"
              edge="bottom"
              y={selection.headerBand.bottom}
              imageH={imageH}
              onPointerDown={(e) => beginHandleDrag(e, "header", "bottom")}
              onKeyDown={(e) => onHandleKeyDown(e, "header", "bottom")}
            />
          </div>
        )}

        {/* person row band overlay */}
        {selection?.personRowBand && (
          <div
            data-testid="assisted-row-person-band"
            data-edit={editTarget === "personRow" ? "true" : "false"}
            className={`absolute left-0 right-0 border ${BAND_TINT.personRow} ${
              editTarget === "personRow" ? "ring-1 ring-violet-500" : ""
            }`}
            style={overlayStyle(selection.personRowBand)}
            onPointerDown={(e) => {
              e.stopPropagation();
              setEditTarget("personRow");
            }}
            aria-label={BAND_LABEL.personRow}
          >
            <Handle
              band="personRow"
              edge="top"
              y={selection.personRowBand.top}
              imageH={imageH}
              onPointerDown={(e) => beginHandleDrag(e, "personRow", "top")}
              onKeyDown={(e) => onHandleKeyDown(e, "personRow", "top")}
            />
            <Handle
              band="personRow"
              edge="bottom"
              y={selection.personRowBand.bottom}
              imageH={imageH}
              onPointerDown={(e) => beginHandleDrag(e, "personRow", "bottom")}
              onKeyDown={(e) => onHandleKeyDown(e, "personRow", "bottom")}
            />
          </div>
        )}

        {/* day列中心 markers（確定: emerald 縦線 2 本・S-geo-2） */}
        {selection?.dayColumns && imageW > 0 && (
          <>
            <div
              data-testid="assisted-row-daycolumn-marker-first"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-emerald-500/80"
              style={{ left: `${(selection.dayColumns.firstDayCenterX / imageW) * 100}%` }}
            />
            <div
              data-testid="assisted-row-daycolumn-marker-last"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-emerald-500/80"
              style={{ left: `${(selection.dayColumns.lastDayCenterX / imageW) * 100}%` }}
            />
          </>
        )}
        {/* pending 1 点目（dayColumn モード入力中: amber 縦線） */}
        {editTarget === "dayColumn" && pendingFirstX !== null && imageW > 0 && (
          <div
            data-testid="assisted-row-daycolumn-marker-pending"
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-500"
            style={{ left: `${(pendingFirstX / imageW) * 100}%` }}
          />
        )}
      </div>

      {/* band 切替（編集対象） */}
      <fieldset
        data-testid="assisted-row-edit-target"
        className="flex gap-2 text-[11px]"
      >
        <legend className="sr-only">調整する帯</legend>
        {(["header", "personRow", "dayColumn"] as const).map((t) => (
          <label
            key={t}
            data-testid={`assisted-row-edit-target-${t}`}
            data-checked={editTarget === t ? "true" : "false"}
            className={`cursor-pointer rounded-full border px-3 py-1 ${
              editTarget === t
                ? "border-slate-400 bg-slate-100 text-slate-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            <input
              type="radio"
              name="assisted-row-edit-target"
              className="sr-only"
              checked={editTarget === t}
              onChange={() => setEditTarget(t)}
            />
            {EDIT_TARGET_LABEL[t]}
          </label>
        ))}
      </fieldset>

      {/* validation 表示（safe copy。要確認・原稿と照合 寄り） */}
      {selection && !ctaActive && (
        <div
          data-testid="assisted-row-validation"
          className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800"
        >
          <p className="mb-1">要確認: 帯の指定を見直してください。</p>
          <ul className="space-y-0.5">
            {validation.headerIssues.length > 0 && (
              <li data-testid="assisted-row-validation-header">ヘッダ帯: 範囲または高さを確認してください。</li>
            )}
            {validation.personRowIssues.length > 0 && (
              <li data-testid="assisted-row-validation-person">行帯: 範囲または高さを確認してください。</li>
            )}
            {validation.orderingIssue && (
              <li data-testid="assisted-row-validation-ordering">ヘッダ帯は行帯より上に置いてください。</li>
            )}
          </ul>
        </div>
      )}

      {/* 確認文言（CTA active 時のみ・「このヘッダとこの行を読み取る」） */}
      {ctaActive && selection && (
        <p
          data-testid="assisted-row-confirm-summary"
          className="text-[11px] text-slate-700"
        >
          このヘッダ（y={selection.headerBand.top}〜{selection.headerBand.bottom}）と
          この行（y={selection.personRowBand.top}〜{selection.personRowBand.bottom}）を読み取ります。
        </p>
      )}

      {/* footer: clear / cancel / confirm */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="assisted-row-clear"
          onClick={handleClear}
          disabled={!selection}
          className="rounded-lg border border-slate-200 px-3 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          クリア
        </button>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              data-testid="assisted-row-cancel"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 px-3 py-1 text-[11px] text-slate-600"
            >
              戻る
            </button>
          )}
          <button
            type="button"
            data-testid="assisted-row-confirm"
            disabled={!ctaActive}
            onClick={() => {
              if (ctaActive && selection) onConfirm(selection);
            }}
            className={`rounded-lg px-3 py-1 text-[11px] ${
              ctaActive
                ? "bg-sky-500 text-white shadow-sm shadow-sky-200/50"
                : "cursor-not-allowed bg-gray-200/80 text-gray-400"
            }`}
            title={ctaActive ? "このヘッダとこの行を読み取る" : "帯と日列中心の指定を完了してください"}
          >
            このヘッダとこの行を読み取る
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 内部 component: Handle（a11y / hit area 44×44 / vertical slider）
// ─────────────────────────────────────────────────────────────

interface HandleProps {
  band: BandKind;
  edge: "top" | "bottom";
  y: number;
  imageH: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}
function Handle({ band, edge, y, imageH, onPointerDown, onKeyDown }: HandleProps) {
  // band 内での top% （band overlay の中で、edge=top は 0%・bottom は 100% に配置）
  return (
    <div
      data-testid={`assisted-row-handle-${band}-${edge}`}
      role="slider"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={imageH}
      aria-valuenow={y}
      aria-label={`${BAND_LABEL[band]}の${edge === "top" ? "上端" : "下端"}`}
      tabIndex={0}
      className={`absolute left-1/2 -translate-x-1/2 ${
        edge === "top" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"
      } flex h-11 w-11 cursor-ns-resize items-center justify-center touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-8 rounded-full ${band === "header" ? "bg-sky-500" : "bg-violet-500"} shadow`}
      />
    </div>
  );
}
