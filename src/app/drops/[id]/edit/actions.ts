// src/app/drops/[id]/edit/actions.ts
// Stub: server actions for drop editing
"use server";

import type { DropActionState } from "@/app/drops/_types";

export async function addDropImagesAction(
  dropId: string,
  _prevState: DropActionState,
  formData: FormData,
): Promise<DropActionState> {
  // Stub implementation
  return { ok: false, error: "Not implemented" };
}

export async function updateDropMetaAction(
  dropId: string,
  _prevState: DropActionState,
  formData: FormData,
): Promise<DropActionState> {
  // Stub implementation
  return { ok: false, error: "Not implemented" };
}
