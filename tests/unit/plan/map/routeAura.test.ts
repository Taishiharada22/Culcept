import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GmapsApi,
  GmapsLatLng,
  GmapsMap,
  GmapsPolyline,
} from "@/lib/shared/googleMapsLoader";
import { createRouteAuraAnimation } from "@/lib/plan/map/routeStyle";

describe("createRouteAuraAnimation (呼吸+鼓動・cleanup 契約・FH 忠実)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { window?: unknown }).window = globalThis;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it("リング2本+timerId を返す / timer で glow.setOptions・ring.setIcon / clearInterval で停止", () => {
    const setOptions = vi.fn();
    const setIcon = vi.fn();
    const fakeMaps = {
      Marker: class {
        setIcon(i: unknown) {
          setIcon(i);
        }
        setMap() {}
      },
      SymbolPath: { CIRCLE: 0 },
    } as unknown as GmapsApi;
    const glow = { setOptions } as unknown as GmapsPolyline;
    const node: GmapsLatLng = { lat: 35, lng: 139 };

    const { markers, timerId } = createRouteAuraAnimation(
      fakeMaps,
      {} as GmapsMap,
      glow,
      node,
      "#1a73e8",
    );
    expect(markers.length).toBe(2);
    expect(timerId).toBeDefined();

    vi.advanceTimersByTime(180);
    expect(setOptions).toHaveBeenCalled();
    expect(setIcon).toHaveBeenCalled();

    clearInterval(timerId);
    const breaths = setOptions.mock.calls.length;
    vi.advanceTimersByTime(180);
    expect(setOptions.mock.calls.length).toBe(breaths);
  });
});
