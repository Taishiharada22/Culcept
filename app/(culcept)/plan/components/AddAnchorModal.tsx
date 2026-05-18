"use client";

/**
 * AddAnchorModal — 「Alter に教える」入力モーダル (W1-X1 → W1-X2 refactor)
 *
 * 設計書: docs/alter-plan-w1x1-mini-design.md / docs/alter-plan-w1x2-edit-anchor-mini-design.md
 *
 * W1-X2 で form 部分を AnchorFormFields に extract、kindMutable=true で利用。
 * 既存の挙動（POST → 即時反映 / close 時 reset / context subtitle）は不変。
 *
 * 範囲外:
 *   - PATCH (編集) は EditAnchorModal が担当
 *   - exception dates の UI / notes / extractedAt / raw storage
 */

import { useEffect, useState } from "react";

import {
  GlassButton,
  GlassModal,
} from "@/components/ui/glassmorphism-design";
import {
  type AnchorFormKind,
  type AnchorFormState,
  buildAnchorInputFromForm,
  buildSourceInputFromForm,
  emptyAnchorFormState,
  mergeInitialState,
} from "@/lib/plan/anchor-input-form";
import type { AnchorInputValidationError } from "@/lib/plan/external-anchor-input";
import { createAnchorBundle } from "@/lib/plan/anchor-fetch";

import { AnchorFormFields } from "./AnchorFormFields";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; errors: AnchorInputValidationError[]; serverError?: string };

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
  initialState?: Partial<AnchorFormState>;
  contextSubtitle?: string;
}) {
  const [form, setForm] = useState<AnchorFormState>(() =>
    mergeInitialState(emptyAnchorFormState(), initialState)
  );
  const [showOptional, setShowOptional] = useState(false);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    if (isOpen) {
      setForm(mergeInitialState(emptyAnchorFormState(), initialState));
      setShowOptional(false);
      setState({ kind: "idle" });
    } else {
      setForm(emptyAnchorFormState());
      setShowOptional(false);
      setState({ kind: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const errorsByField = useErrorMap(state);

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

  function switchKind(kind: AnchorFormKind) {
    setForm((prev) => ({
      ...prev,
      kind,
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
        errors:
          r.errors?.flatMap((b) =>
            b.kind === "anchor_invalid" || b.kind === "source_invalid"
              ? b.errors
              : []
          ) ?? [],
        serverError: r.error,
      });
      return;
    }
    setForm(emptyAnchorFormState());
    setShowOptional(false);
    setState({ kind: "idle" });
    onSuccess();
  }

  const submitting = state.kind === "submitting";
  const serverError = state.kind === "error" ? state.serverError : undefined;

  return (
    <GlassModal isOpen={isOpen} onClose={resetAndClose} title="Alter に教える" size="md">
      <AnchorFormFields
        form={form}
        onChange={update}
        onSwitchKind={switchKind}
        errorsByField={errorsByField}
        submitting={submitting}
        showOptional={showOptional}
        onToggleOptional={() => setShowOptional((v) => !v)}
        contextSubtitle={contextSubtitle}
        kindMutable={true}
        serverError={serverError}
      />

      <div className="mt-4 flex justify-end gap-2 pt-2">
        <GlassButton variant="secondary" onClick={resetAndClose} disabled={submitting}>
          やめる
        </GlassButton>
        <GlassButton
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? "送信中…" : "教える"}
        </GlassButton>
      </div>
    </GlassModal>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useErrorMap(state: SubmitState): Map<string, string> {
  if (state.kind !== "error") return new Map();
  const map = new Map<string, string>();
  for (const e of state.errors) {
    if (!map.has(e.field)) map.set(e.field, e.message);
  }
  return map;
}
