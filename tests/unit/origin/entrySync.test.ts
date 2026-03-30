import { describe, it, expect } from "vitest";
import { mergeEntryRecords, trimToWindow } from "@/lib/origin/entrySync";
import type { EntryRecord } from "@/lib/origin/entryContract";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rec(date: string, category: string, time: string): EntryRecord {
  return {
    date,
    category: category as EntryRecord["category"],
    recordedAt: `${date}T${time}Z`,
  };
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// mergeEntryRecords
// ---------------------------------------------------------------------------

describe("mergeEntryRecords", () => {
  it("local only → merged = local, toUpload = all", () => {
    const local = [rec("2026-03-28", "work_decision", "10:00:00")];
    const server: EntryRecord[] = [];
    const result = mergeEntryRecords(local, server);
    expect(result.merged).toHaveLength(1);
    expect(result.toUpload).toHaveLength(1);
    expect(result.localUpdated).toBe(false);
  });

  it("server only → merged = server, toUpload = empty, localUpdated", () => {
    const local: EntryRecord[] = [];
    const server = [rec("2026-03-28", "relationship", "10:00:00")];
    const result = mergeEntryRecords(local, server);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].category).toBe("relationship");
    expect(result.toUpload).toHaveLength(0);
    expect(result.localUpdated).toBe(true);
  });

  it("same date, local newer → keep local, upload local", () => {
    const local = [rec("2026-03-28", "work_decision", "14:00:00")];
    const server = [rec("2026-03-28", "relationship", "10:00:00")];
    const result = mergeEntryRecords(local, server);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].category).toBe("work_decision");
    expect(result.toUpload).toHaveLength(1);
    expect(result.localUpdated).toBe(false);
  });

  it("same date, server newer → keep server, no upload", () => {
    const local = [rec("2026-03-28", "work_decision", "10:00:00")];
    const server = [rec("2026-03-28", "self_care", "14:00:00")];
    const result = mergeEntryRecords(local, server);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].category).toBe("self_care");
    expect(result.toUpload).toHaveLength(0);
    expect(result.localUpdated).toBe(true);
  });

  it("same date, same time → keep local (no change)", () => {
    const local = [rec("2026-03-28", "work_decision", "10:00:00")];
    const server = [rec("2026-03-28", "work_decision", "10:00:00")];
    const result = mergeEntryRecords(local, server);
    expect(result.merged).toHaveLength(1);
    expect(result.localUpdated).toBe(false);
    expect(result.toUpload).toHaveLength(0);
  });

  it("disjoint dates → merge both, upload local-only", () => {
    const local = [
      rec("2026-03-27", "work_decision", "10:00:00"),
      rec("2026-03-29", "money", "12:00:00"),
    ];
    const server = [
      rec("2026-03-28", "relationship", "10:00:00"),
    ];
    const result = mergeEntryRecords(local, server);
    expect(result.merged).toHaveLength(3);
    expect(result.merged[0].date).toBe("2026-03-29"); // sorted desc
    expect(result.merged[1].date).toBe("2026-03-28");
    expect(result.merged[2].date).toBe("2026-03-27");
    expect(result.toUpload).toHaveLength(2); // 27 and 29
    expect(result.localUpdated).toBe(true); // server added 28
  });

  it("multi-device: both have updates on different days", () => {
    const local = [
      rec("2026-03-25", "work_decision", "10:00:00"),
      rec("2026-03-26", "self_care", "10:00:00"),
      rec("2026-03-27", "money", "14:00:00"), // local newer
    ];
    const server = [
      rec("2026-03-25", "work_decision", "10:00:00"), // same
      rec("2026-03-26", "relationship", "14:00:00"),   // server newer
      rec("2026-03-27", "money", "10:00:00"),          // local newer
      rec("2026-03-28", "self_care", "10:00:00"),      // server only
    ];
    const result = mergeEntryRecords(local, server);
    expect(result.merged).toHaveLength(4);

    const byDate = new Map(result.merged.map((r) => [r.date, r]));
    expect(byDate.get("2026-03-25")!.category).toBe("work_decision"); // same
    expect(byDate.get("2026-03-26")!.category).toBe("relationship");  // server won
    expect(byDate.get("2026-03-27")!.category).toBe("money");         // local won
    expect(byDate.get("2026-03-28")!.category).toBe("self_care");     // server only

    expect(result.toUpload).toHaveLength(1); // only 03-27 (local newer)
    expect(result.toUpload[0].date).toBe("2026-03-27");
    expect(result.localUpdated).toBe(true); // 26 updated + 28 added
  });

  it("offline recovery: many local, empty server → upload all", () => {
    const local: EntryRecord[] = [];
    for (let i = 0; i < 10; i++) {
      local.push(rec(dateStr(i), "work_decision", "10:00:00"));
    }
    const result = mergeEntryRecords(local, []);
    expect(result.merged).toHaveLength(10);
    expect(result.toUpload).toHaveLength(10);
    expect(result.localUpdated).toBe(false);
  });

  it("same-day update: user edits entry later on same device", () => {
    // Simulates: user recorded "work_decision" at 10am, changed to "self_care" at 3pm
    const local = [rec("2026-03-29", "self_care", "15:00:00")];
    const server = [rec("2026-03-29", "work_decision", "10:00:00")];
    const result = mergeEntryRecords(local, server);
    expect(result.merged[0].category).toBe("self_care"); // local is newer
    expect(result.toUpload).toHaveLength(1);
  });

  it("handles note field correctly in merge", () => {
    const local = [{ ...rec("2026-03-29", "work_decision", "10:00:00"), note: "meeting" }];
    const server = [rec("2026-03-29", "work_decision", "14:00:00")]; // no note, but newer
    const result = mergeEntryRecords(local, server);
    expect(result.merged[0].note).toBeUndefined(); // server won, no note
    expect(result.localUpdated).toBe(true);
  });

  it("preserves sort order (newest first)", () => {
    const local = [
      rec("2026-03-20", "work_decision", "10:00:00"),
      rec("2026-03-25", "money", "10:00:00"),
    ];
    const server = [
      rec("2026-03-22", "self_care", "10:00:00"),
      rec("2026-03-28", "relationship", "10:00:00"),
    ];
    const result = mergeEntryRecords(local, server);
    const dates = result.merged.map((r) => r.date);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });
});

// ---------------------------------------------------------------------------
// trimToWindow
// ---------------------------------------------------------------------------

describe("trimToWindow", () => {
  it("keeps records within window", () => {
    const records = [
      rec(dateStr(0), "work_decision", "10:00:00"),
      rec(dateStr(30), "relationship", "10:00:00"),
      rec(dateStr(89), "money", "10:00:00"),
    ];
    const trimmed = trimToWindow(records, 90);
    expect(trimmed).toHaveLength(3);
  });

  it("removes records outside window", () => {
    const records = [
      rec(dateStr(0), "work_decision", "10:00:00"),
      rec(dateStr(91), "relationship", "10:00:00"),
      rec(dateStr(120), "money", "10:00:00"),
    ];
    const trimmed = trimToWindow(records, 90);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0].date).toBe(dateStr(0));
  });

  it("returns empty for all-expired records", () => {
    const records = [
      rec(dateStr(100), "work_decision", "10:00:00"),
    ];
    const trimmed = trimToWindow(records, 90);
    expect(trimmed).toHaveLength(0);
  });

  it("custom window size", () => {
    const records = [
      rec(dateStr(0), "work_decision", "10:00:00"),
      rec(dateStr(5), "relationship", "10:00:00"),
      rec(dateStr(8), "money", "10:00:00"),
    ];
    const trimmed = trimToWindow(records, 7);
    expect(trimmed).toHaveLength(2); // 0 and 5 days ago
  });
});
