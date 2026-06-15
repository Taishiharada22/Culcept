/**
 * U1-minimal startTimeSource 永続化（manual + ICS-timed）— CEO 必須テスト
 * 正本: docs/reality-leaveby-u1-minimal-startsource-0.md
 *
 * 核: client は label を渡さず signal のみ。server が startTimeSource を導出。
 *   manual+typed→user_explicit / prefill→assumed_default / template→unknown /
 *   ICS all-day→assumed_default / timed+tzid→imported_exact / timed+floating→system_inferred。
 *   両書込経路（sequential / RPC）で provenance 一致。read は NULL→unknown（fail-closed）。
 */
import {
  deriveStartTimeProvenance,
  startTimeProvenanceRecordedAt,
  coerceStartTimeSource,
} from "@/lib/plan/anchor-start-time-provenance";
import {
  anchorInsertPayload,
  anchorInsertPayloadForRpc,
} from "@/lib/plan/external-anchor-repository-supabase";
import type { CreateExternalAnchorInput } from "@/lib/plan/external-anchor-input";
import { draftToAnchorInput } from "@/lib/plan/ics/importIcsAnchorsHelpers";
import type { IcsAnchorDraft } from "@/lib/plan/ics/icsToAnchorMapper";
import type { ParsedIcsEvent } from "@/lib/plan/ics/icsParser";
import { emptyAnchorFormState, mergeInitialState, buildAnchorInputFromForm } from "@/lib/plan/anchor-input-form";
import { sanitizeAnchorPatch } from "@/lib/plan/anchor-update-validation";

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

function oneOffInput(over: Partial<CreateExternalAnchorInput> = {}): CreateExternalAnchorInput {
  return {
    title: "T",
    startTime: "10:00",
    rigidity: "hard",
    sourceType: "manual",
    anchorKind: "one_off",
    date: "2026-06-12",
    ...over,
  } as CreateExternalAnchorInput;
}
function icsEvent(over: Partial<ParsedIcsEvent> = {}): ParsedIcsEvent {
  return {
    uid: "u1",
    summary: "S",
    startDateIso: "2026-06-12T10:00:00+09:00",
    isAllDay: false,
    ...over,
  } as ParsedIcsEvent;
}
function icsDraft(over: Partial<IcsAnchorDraft> = {}, evOver: Partial<ParsedIcsEvent> = {}): IcsAnchorDraft {
  return {
    anchorKind: "one_off",
    title: "S",
    startTime: "10:00",
    date: "2026-06-12",
    rigidity: "hard",
    sourceUid: "u1",
    source: icsEvent(evOver),
    ...over,
  } as IcsAnchorDraft;
}

// ── #1/#2/#10 manual / template derive ─────────────────────────────────────────────────────────

describe("U1-minimal derive: manual / template", () => {
  it("#1 manual + startTimeUserEntered=true → user_explicit", () => {
    expect(deriveStartTimeProvenance(oneOffInput({ sourceType: "manual", startTimeUserEntered: true })).source).toBe("user_explicit");
  });
  it("#2 manual + prefill 未編集（false / undefined）→ assumed_default", () => {
    expect(deriveStartTimeProvenance(oneOffInput({ sourceType: "manual", startTimeUserEntered: false })).source).toBe("assumed_default");
    expect(deriveStartTimeProvenance(oneOffInput({ sourceType: "manual" })).source).toBe("assumed_default");
  });
  it("#10 template は user_explicit にならない（scope 外 → unknown・typed でも）", () => {
    expect(deriveStartTimeProvenance(oneOffInput({ sourceType: "template", startTimeUserEntered: true })).source).toBe("unknown");
  });
  it("他 path（shift_image 等）→ unknown（fail-closed）", () => {
    expect(deriveStartTimeProvenance(oneOffInput({ sourceType: "shift_image", startTimeUserEntered: true })).source).toBe("unknown");
  });
});

// ── #3/#4/#5 ICS derive ───────────────────────────────────────────────────────────────────────

describe("U1-minimal derive: ICS-timed", () => {
  it("#3 ICS all-day → assumed_default・is_all_day_placeholder=true", () => {
    const d = deriveStartTimeProvenance(oneOffInput({ sourceType: "ics", icsIsAllDay: true }));
    expect(d.source).toBe("assumed_default");
    expect(d.isAllDayPlaceholder).toBe(true);
  });
  it("#4 ICS timed + tzid → imported_exact・timezoneOfRecord=tzid", () => {
    const d = deriveStartTimeProvenance(oneOffInput({ sourceType: "ics", icsIsAllDay: false, icsTzid: "Asia/Tokyo" }));
    expect(d.source).toBe("imported_exact");
    expect(d.timezoneOfRecord).toBe("Asia/Tokyo");
  });
  it("#5 ICS timed + floating（tzid 無）→ system_inferred（exact にしない）", () => {
    expect(deriveStartTimeProvenance(oneOffInput({ sourceType: "ics", icsIsAllDay: false, icsTzid: null })).source).toBe("system_inferred");
    expect(deriveStartTimeProvenance(oneOffInput({ sourceType: "ics", icsIsAllDay: false })).source).toBe("system_inferred");
  });
});

// ── #6 二重書込経路一致 ───────────────────────────────────────────────────────────────────────

describe("U1-minimal #6 sequential / RPC 経路で provenance 一致", () => {
  const cases: CreateExternalAnchorInput[] = [
    oneOffInput({ sourceType: "manual", startTimeUserEntered: true }),
    oneOffInput({ sourceType: "manual", startTimeUserEntered: false }),
    oneOffInput({ sourceType: "ics", icsIsAllDay: true }),
    oneOffInput({ sourceType: "ics", icsIsAllDay: false, icsTzid: "UTC" }),
    oneOffInput({ sourceType: "ics", icsIsAllDay: false, icsTzid: null }),
    oneOffInput({ sourceType: "template", startTimeUserEntered: true }),
  ];
  it("start_time_source / is_all_day_placeholder / timezone_of_record が両経路で同一", () => {
    for (const c of cases) {
      const seq = anchorInsertPayload("u", "s", c, "2026-06-12T08:00:00Z");
      const rpc = anchorInsertPayloadForRpc(c);
      expect(seq.start_time_source).toBe(rpc.start_time_source);
      expect(seq.is_all_day_placeholder).toBe(rpc.is_all_day_placeholder);
      expect(seq.timezone_of_record).toBe(rpc.timezone_of_record);
    }
  });
  it("sequential は recorded_at を nowIso で埋める（unknown は null）", () => {
    const exact = anchorInsertPayload("u", "s", oneOffInput({ sourceType: "manual", startTimeUserEntered: true }), "2026-06-12T08:00:00Z");
    expect(exact.start_time_provenance_recorded_at).toBe("2026-06-12T08:00:00Z");
    const unknown = anchorInsertPayload("u", "s", oneOffInput({ sourceType: "template" }), "2026-06-12T08:00:00Z");
    expect(unknown.start_time_provenance_recorded_at).toBeNull();
  });
});

// ── #8 read coercion / recorded_at ────────────────────────────────────────────────────────────

describe("U1-minimal #8 read coercion / recorded_at", () => {
  it("coerceStartTimeSource: NULL / undefined / 未知値 → unknown", () => {
    expect(coerceStartTimeSource(null)).toBe("unknown");
    expect(coerceStartTimeSource(undefined)).toBe("unknown");
    expect(coerceStartTimeSource("garbage")).toBe("unknown");
  });
  it("coerceStartTimeSource: 既知値はそのまま", () => {
    for (const v of ["user_explicit", "imported_exact", "system_inferred", "assumed_default", "unknown"] as const) {
      expect(coerceStartTimeSource(v)).toBe(v);
    }
  });
  it("startTimeProvenanceRecordedAt: unknown→null・他→nowIso", () => {
    expect(startTimeProvenanceRecordedAt("unknown", "T")).toBeNull();
    expect(startTimeProvenanceRecordedAt("user_explicit", "T")).toBe("T");
  });
});

// ── #7 update sanitization ────────────────────────────────────────────────────────────────────

describe("U1-minimal #7 update: provenance は client patch 不可（SANITIZED_KEYS）", () => {
  it("startTimeSource / isAllDayPlaceholder 等を patch しても sanitizeAnchorPatch が落とす", () => {
    const sanitized = sanitizeAnchorPatch({
      title: "new",
      startTimeSource: "user_explicit",
      isAllDayPlaceholder: false,
      timezoneOfRecord: "Asia/Tokyo",
      startTimeProvenanceRecordedAt: "2026-06-12T00:00:00Z",
    });
    expect(sanitized.title).toBe("new"); // 通常 field は残る
    expect("startTimeSource" in sanitized).toBe(false);
    expect("isAllDayPlaceholder" in sanitized).toBe(false);
    expect("timezoneOfRecord" in sanitized).toBe(false);
    expect("startTimeProvenanceRecordedAt" in sanitized).toBe(false);
  });
});

// ── ICS thread / form prefill ─────────────────────────────────────────────────────────────────

describe("U1-minimal #13 ICS isAllDay/tzid を draft→input に thread", () => {
  it("all-day draft → icsIsAllDay=true", () => {
    const inp = draftToAnchorInput(icsDraft({}, { isAllDay: true }));
    expect(inp.icsIsAllDay).toBe(true);
  });
  it("timed + tzid draft → icsTzid 伝播", () => {
    const inp = draftToAnchorInput(icsDraft({}, { isAllDay: false, tzid: "Europe/Paris" }));
    expect(inp.icsIsAllDay).toBe(false);
    expect(inp.icsTzid).toBe("Europe/Paris");
  });
  it("derive と組み合わせ: timed+tzid → imported_exact", () => {
    expect(deriveStartTimeProvenance(draftToAnchorInput(icsDraft({}, { isAllDay: false, tzid: "UTC" }))).source).toBe("imported_exact");
  });
});

describe("U1-minimal manual form: prefill は startTimeUserEntered=false", () => {
  it("mergeInitialState（prefill startTime）→ startTimeUserEntered=false", () => {
    const merged = mergeInitialState(emptyAnchorFormState(), { startTime: "09:00", sourceType: "manual", rigidity: "hard", title: "X" });
    expect(merged.startTimeUserEntered).toBe(false);
  });
  it("buildAnchorInputFromForm が startTimeUserEntered を input に渡す（manual 経路で signal 生存）", () => {
    const state = mergeInitialState(emptyAnchorFormState(), { startTime: "09:00", sourceType: "manual", rigidity: "hard", title: "X", date: "2026-06-12" });
    const typed = { ...state, startTimeUserEntered: true };
    const res = buildAnchorInputFromForm(typed);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.input.startTimeUserEntered).toBe(true);
      expect(deriveStartTimeProvenance(res.input).source).toBe("user_explicit");
    }
  });
});
