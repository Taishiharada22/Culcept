/**
 * routeEtaSafety（RD2d-b-B route/ETA 共有 safety primitive）— CEO 必須 16 fixtures
 * 正本: docs/reality-route-eta-duration-value-rd2d-b-value-0.md §7 / CEO RD2d-b-B GO
 *
 * 核: capability/adapter/wrapper/future value channel が同一の raw-location 検出 + redact + safe exception を共有（drift 排除）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  containsRawLocation,
  redactRouteEtaUnsafeValue,
  routeEtaSafeViolationMessage,
  routeEtaSafeExceptionReason,
  ROUTE_ETA_SAFE_EXCEPTION_REASON,
} from "@/lib/plan/realityCore/routeEtaSafety";

const lc = (s: string) => containsRawLocation(s.toLowerCase());

describe("RD2d-b-B #1-6 containsRawLocation 検出範囲（coord pair / encoding token）", () => {
  it("#1 coordinate pair comma（高精度）", () => expect(lc("geo:35.6895,139.7006")).toBe(true));
  it("#2 coordinate pair space（粗い）", () => expect(lc("35.68 139.76")).toBe(true));
  it("#3 integer coordinate pair", () => expect(lc("35,139")).toBe(true));
  it("1-decimal pair", () => expect(lc("35.6,139.7")).toBe(true));
  it("4-decimal single", () => expect(lc("35.6895")).toBe(true));
  it("3-decimal single（~110m）", () => expect(lc("35.689")).toBe(true));
  it("#4 plus-code", () => expect(lc("8q7xmqhc+2v")).toBe(true));
  it("#5 geohash-like token", () => expect(lc("geohash:xn76urx6")).toBe(true));
  it("#6 polyline / encodedPolyline / waypoints / route response", () => {
    expect(lc("polyline:abc")).toBe(true);
    expect(lc("encodedpolyline:xyz")).toBe(true);
    expect(lc("waypoints:[...]")).toBe(true);
    expect(lc("routeresponse:{...}")).toBe(true);
    expect(lc("latitude:35")).toBe(true);
    expect(lc("placeid:chij")).toBe(true);
    expect(lc("graphviewerkey:abc")).toBe(true);
  });
});

describe("RD2d-b-B #7 known safe tokens は false-positive しない", () => {
  it("safe IDs / providerVersion / 日付 / 普通の語 → false", () => {
    for (const safe of [
      "opaque-route-h1",
      "cascade-v0",
      "external_route_api",
      "2026-06-12",
      "v1",
      "ern-1",
      "priv-ok-abc",
      "12.34", // 単一小数（pair でない）
      "route:shape:x@v1#opaque",
      "user_confirmed",
      "static_assumption",
      "subjectiveDate",
      "coordinatePrecisionPolicy", // legit field 名（coordinate 単数・coordinates 複数でない）
      "rawCoordinateLoggingProhibited",
      "currentObservationInvolved",
    ]) {
      expect(lc(safe)).toBe(false);
    }
  });
});

describe("RD2d-b-B #11/#12/#13 redact / no raw echo", () => {
  it("#11 exception/座標 値は redact", () => {
    expect(redactRouteEtaUnsafeValue("35.6895,139.7006")).toBe("<redacted: matched raw-data pattern>");
    expect(redactRouteEtaUnsafeValue("polyline:abc")).toBe("<redacted: matched raw-data pattern>");
  });
  it("safe 値は redact しない（そのまま）", () => {
    expect(redactRouteEtaUnsafeValue("external_route")).toBe("external_route");
    expect(redactRouteEtaUnsafeValue("v1")).toBe("v1");
  });
  it("#12 routeEtaSafeViolationMessage は raw 値を echo しない", () => {
    const m = routeEtaSafeViolationMessage("invalid durationBasis", "35.68,139.76");
    expect(m.includes("35.68")).toBe(false);
    expect(m.includes("redacted")).toBe(true);
    expect(routeEtaSafeViolationMessage("invalid status", "WAT")).toBe("invalid status: WAT");
  });
  it("#13 safe exception reason は constant（raw を含まない）", () => {
    expect(routeEtaSafeExceptionReason()).toBe("dependency_error");
    expect(ROUTE_ETA_SAFE_EXCEPTION_REASON).toBe("dependency_error");
  });
});

describe("RD2d-b-B #8/#9/#10 adapter/capability/wrapper が shared を使う（source-scan）", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), "lib/plan/realityCore", f), "utf8");
  it("#8 adapter が routeEtaSafety を import", () => {
    expect(read("routeEtaProviderAdapter.ts").includes('from "./routeEtaSafety"')).toBe(true);
  });
  it("#9 capability walker が routeEtaSafety を import", () => {
    expect(read("routeEtaCapability.ts").includes('from "./routeEtaSafety"')).toBe(true);
  });
  it("#10 transport wrapper が routeEtaSafety を import", () => {
    expect(read("transportCascadeRouteEtaProvider.ts").includes('from "./routeEtaSafety"')).toBe(true);
  });
  it("3 ファイルが local COORD_PATTERN/COORD_PAIR_PATTERN を重複定義しない（shared に集約）", () => {
    for (const f of ["routeEtaProviderAdapter.ts", "routeEtaCapability.ts", "transportCascadeRouteEtaProvider.ts"]) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code.includes("const COORD_PATTERN")).toBe(false);
      expect(code.includes("const COORD_PAIR_PATTERN")).toBe(false);
    }
  });
});

describe("RD2d-b-B IO source-scan green", () => {
  it("routeEtaSafety.ts に IO / 時刻 / 乱数 / external import なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/realityCore/routeEtaSafety.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of [".insert(", ".update(", "service_role", "notification", "push(", "Date.now", "Math.random", "new Date(", "navigator", "geolocation", "fetch(", "supabase", "localStorage", "import"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
