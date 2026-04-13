"use client";

import type { CurrentPosition, DraftChapter, ExplorationStep, MemoryChapter } from "./types";
import type { OriginSessionStatus } from "./persistence";
import { retryFetch } from "@/lib/retryFetch";

export async function persistOriginSessionState(input: {
  sessionId?: string | null;
  status?: OriginSessionStatus;
  currentStep?: ExplorationStep | null;
  draft?: DraftChapter | null;
  currentPosition?: CurrentPosition | null;
}): Promise<{ sessionId: string | null; status: OriginSessionStatus | null }> {
  const result = await retryFetch<{ sessionId?: string; status?: string }>("/api/origin/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!result.ok) {
    throw new Error(result.error ?? "Session state sync failed");
  }

  const data = result.data;
  return {
    sessionId:
      data && typeof data === "object" && "sessionId" in data && typeof data.sessionId === "string"
        ? data.sessionId
        : null,
    status:
      data &&
      typeof data === "object" &&
      "status" in data &&
      typeof data.status === "string"
        ? (data.status as OriginSessionStatus)
        : null,
  };
}

export async function completeOriginChapter(input: {
  sessionId?: string | null;
  chapter: MemoryChapter;
  currentPosition?: CurrentPosition | null;
}): Promise<{ sessionId: string; recordId: string }> {
  const result = await retryFetch<{ sessionId?: string; recordId?: string }>("/api/origin/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!result.ok) {
    throw new Error(result.error ?? "Chapter completion sync failed");
  }

  const data = result.data;
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.sessionId !== "string" ||
    typeof data.recordId !== "string"
  ) {
    throw new Error("Invalid completion response");
  }

  return {
    sessionId: data.sessionId,
    recordId: data.recordId,
  };
}
