"use client";

/**
 * EditAnchorModal — 「Alter に教え直す」編集モーダル (W1-X2)
 *
 * 設計書: docs/alter-plan-w1x2-edit-anchor-mini-design.md §3
 *
 * 機能:
 *   - 既存 anchor を domain → form 変換して初期表示
 *   - kindMutable=false で kind 切替 disabled + 注釈
 *   - context subtitle に「現在: <title> / <date or 曜日>」を表示
 *   - submit → buildAnchorInputFromForm → updateAnchor (PATCH) → onSuccess
 *   - close 時に state 必ず reset
 *
 * 範囲外:
 *   - kind 変更（CHECK 制約 + 設計意図）
 *   - source 自体の編集
 */

import { useEffect, useMemo, useState } from "react";

import {
  GlassButton,
  GlassModal,
} from "@/components/ui/glassmorphism-design";
import {
  type AnchorFormState,
  buildAnchorInputFromForm,
  emptyAnchorFormState,
} from "@/lib/plan/anchor-input-form";
import { domainToFormState } from "@/lib/plan/domain-to-form-state";
import type { AnchorInputValidationError } from "@/lib/plan/external-anchor-input";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { updateAnchor } from "@/lib/plan/anchor-fetch";

import { AnchorFormFields } from "./AnchorFormFields";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; errors: AnchorInputValidationError[]; serverError?: string };

const WEEKDAY_JP: Record<string, string> = {
  MO: "月",
  TU: "火",
  WE: "水",
  TH: "木",
  FR: "金",
  SA: "土",
  SU: "日",
};

/** 「現在: <title> / <date or 曜日>」context を組み立てる */
function buildCurrentContext(anchor: ExternalAnchor): string {
  if (anchor.anchorKind === "one_off") {
    return `現在: ${anchor.title} / ${anchor.date}`;
  }
  // recurring: BYDAY 抽出して 日本語表記
  const m = anchor.recurrenceRule.match(/BYDAY=([A-Z,]+)/i);
  const byday = m ? m[1] : "";
  const days = (byday ?? "")
    .split(",")
    .map((d) => WEEKDAY_JP[d.trim()] ?? d.trim())
    .filter(Boolean)
    .join("・");
  return `現在: ${anchor.title} / 毎週 ${days}曜`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function EditAnchorModal({
  isOpen,
  onClose,
  onSuccess,
  anchor,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** 編集対象の既存 anchor（null なら non-render を呼び出し側が制御） */
  anchor: ExternalAnchor | null;
}) {
  const [form, setForm] = useState<AnchorFormState>(() =>
    anchor ? domainToFormState(anchor) : emptyAnchorFormState()
  );
  const [showOptional, setShowOptional] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  // Modal open transition: anchor から form を再構築 + reset
  // close: state を空に戻す（CEO 補正 4 と同パターン）
  useEffect(() => {
    if (isOpen && anchor) {
      setForm(domainToFormState(anchor));
      setShowOptional(false);
      setState({ kind: "idle" });
    } else if (!isOpen) {
      setForm(emptyAnchorFormState());
      setShowOptional(false);
      setState({ kind: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, anchor?.id]);

  const errorsByField = useMemo(() => {
    if (state.kind !== "error") return new Map<string, string>();
    const map = new Map<string, string>();
    for (const e of state.errors) {
      if (!map.has(e.field)) map.set(e.field, e.message);
    }
    return map;
  }, [state]);

  const contextSubtitle = useMemo(
    () => (anchor ? buildCurrentContext(anchor) : undefined),
    [anchor]
  );

  function resetAndClose() {
    setForm(emptyAnchorFormState());
    setShowOptional(false);
    setState({ kind: "idle" });
    onClose();
  }

  function update<K extends keyof AnchorFormState>(
    key: K,
    value: AnchorFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // EditModal では kind 切替を無効化（kindMutable=false）
  // AnchorFormFields が呼ぶ場合に no-op
  function noopSwitchKind() {
    /* 不変原則: kind 変更禁止 */
  }

  async function handleSubmit() {
    if (!anchor) return;
    setState({ kind: "submitting" });

    const built = buildAnchorInputFromForm(form);
    if (!built.valid) {
      setState({ kind: "error", errors: built.errors });
      return;
    }

    // PATCH 用 patch を構築（id / userId / sourceId / anchorKind は除外）
    const patch: Record<string, unknown> = { ...built.input };
    delete patch.anchorKind;
    delete patch.sourceType; // sourceType も anchor 単位編集では送らない

    const r = await updateAnchor(anchor.id, patch);
    if (!r.ok) {
      setState({
        kind: "error",
        errors: r.errors ?? [],
        serverError: r.error,
      });
      return;
    }
    setShowOptional(false);
    setState({ kind: "idle" });
    onSuccess();
  }

  const submitting = state.kind === "submitting";
  const serverError = state.kind === "error" ? state.serverError : undefined;

  if (!anchor) return null;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Alter に教え直す"
      size="md"
    >
      <AnchorFormFields
        form={form}
        onChange={update}
        onSwitchKind={noopSwitchKind}
        errorsByField={errorsByField}
        submitting={submitting}
        showOptional={showOptional}
        onToggleOptional={() => setShowOptional((v) => !v)}
        contextSubtitle={contextSubtitle}
        kindMutable={false}
        serverError={serverError}
      />

      <div className="mt-4 flex justify-end gap-2 pt-2">
        <GlassButton
          variant="secondary"
          onClick={resetAndClose}
          disabled={submitting}
        >
          やめる
        </GlassButton>
        <GlassButton
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? "送信中…" : "教え直す"}
        </GlassButton>
      </div>
    </GlassModal>
  );
}
