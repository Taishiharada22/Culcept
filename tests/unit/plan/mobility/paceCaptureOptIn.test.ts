import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readPaceCaptureOptIn,
  writePaceCaptureOptIn,
  getPaceCaptureOptInState,
  loadPaceCaptureOptInState,
  markPaceCaptureGranted,
  markPaceCaptureDeclined,
  resetPaceCaptureOptIn,
  PACE_CAPTURE_OPT_IN_KEY,
} from "@/lib/plan/mobility/paceCaptureOptIn";

describe("paceCaptureOptIn — 専用 opt-in store（汎用 location opt-in と別キー）", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => Array.from(m.keys())[i] ?? null,
      get length() {
        return m.size;
      },
    } as Storage;
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("★別キー（汎用 location opt-in と分離）", () => {
    expect(PACE_CAPTURE_OPT_IN_KEY).toBe("aneurasync.plan.pace-capture-opt-in.v1");
    expect(PACE_CAPTURE_OPT_IN_KEY).not.toBe("aneurasync.location-opt-in.v1");
  });
  it("初期は not_asked（不在 fail-open）", () => {
    expect(loadPaceCaptureOptInState()).toBe("not_asked");
  });
  it("markPaceCaptureGranted → granted（read で反映）", () => {
    markPaceCaptureGranted(Date.parse("2026-06-08T00:00:00.000Z"));
    expect(loadPaceCaptureOptInState()).toBe("granted");
    expect(readPaceCaptureOptIn().grantedAt).toBe("2026-06-08T00:00:00.000Z");
  });
  it("markPaceCaptureDeclined → declined（可逆）", () => {
    markPaceCaptureGranted();
    markPaceCaptureDeclined();
    expect(loadPaceCaptureOptInState()).toBe("declined");
  });
  it("reset → not_asked", () => {
    markPaceCaptureGranted();
    resetPaceCaptureOptIn();
    expect(loadPaceCaptureOptInState()).toBe("not_asked");
  });
  it("破損 JSON / 不正 record → not_asked（fail-open）", () => {
    localStorage.setItem(PACE_CAPTURE_OPT_IN_KEY, "{broken");
    expect(loadPaceCaptureOptInState()).toBe("not_asked");
    localStorage.setItem(PACE_CAPTURE_OPT_IN_KEY, JSON.stringify({ state: "bogus", updatedAt: "x" }));
    expect(loadPaceCaptureOptInState()).toBe("not_asked");
    localStorage.setItem(PACE_CAPTURE_OPT_IN_KEY, JSON.stringify({ state: "granted" })); // updatedAt 欠落
    expect(loadPaceCaptureOptInState()).toBe("not_asked");
  });
  it("write→read round-trip（updatedAt 自動付与）", () => {
    writePaceCaptureOptIn({ state: "granted" });
    const r = readPaceCaptureOptIn();
    expect(r.state).toBe("granted");
    expect(typeof r.updatedAt).toBe("string");
    expect(getPaceCaptureOptInState(r)).toBe("granted");
  });
});
