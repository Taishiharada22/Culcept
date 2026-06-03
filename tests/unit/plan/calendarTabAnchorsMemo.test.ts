import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * freeze 回帰固定（2026-05-31）— CalendarTab の anchors ref 安定化。
 *
 * 背景:
 *   selectedDayAnchors を直書き（毎レンダー新配列）で生成し、 それを effect 依存に取る
 *   useMapTabMovementDisplay / useCalendarTabFeasibilityDisplay が async setState を繰り返し、
 *   無限ループ化して main thread を固めていた（Chrome「ページが応答しません」）。
 *   修正は MapTab と同じく useMemo で安定化すること。
 *
 * このテストは構造（source assertion）で「useMemo 経由 + 正しい deps + hook へ受け渡し」を固定する。
 *   ※ CalendarTab は fetch/framer-motion 等の副作用 hook を多数持つため full render テストは脆い。
 *     CEO 承認の fallback（grep / source assertion）でリグレッションを固定する。
 */

const SRC_PATH = "app/(culcept)/plan/tabs/CalendarTab.tsx";
// 空白・改行を 1 スペースへ正規化（インデント/改行差に強い比較にする）
const NORM = readFileSync(SRC_PATH, "utf8").replace(/\s+/g, " ");

describe("CalendarTab — selectedDayAnchors / selectedDateObj の ref 安定化（freeze 回帰固定）", () => {
  it("① selectedDayAnchors は useMemo 経由で生成される（直書きしない）", () => {
    expect(NORM).toContain("const selectedDayAnchors = useMemo(");
    // 旧・直書き形（毎レンダー新配列）に戻っていないこと
    expect(NORM).not.toContain("const selectedDayAnchors = anchorsForDay(");
  });

  it("② selectedDayAnchors の useMemo deps は [anchors, selectedDateObj]（実変化時のみ再計算）", () => {
    expect(NORM).toContain(
      "const selectedDayAnchors = useMemo( () => anchorsForDay(anchors, selectedDateObj), [anchors, selectedDateObj], )",
    );
  });

  it("③ selectedDateObj も useMemo([selectedDate]) で安定化（毎レンダー new Date を作らない）", () => {
    expect(NORM).toContain("const selectedDateObj = useMemo(");
    expect(NORM).toContain("[selectedDate], )");
    // 旧・直書き形に戻っていないこと
    expect(NORM).not.toContain('const selectedDateObj = new Date(selectedDate + "T00:00:00.000Z")');
  });

  it("④ 安定化した selectedDayAnchors が両 display hook に渡されている（effect 依存が安定する経路）", () => {
    expect(NORM).toContain("useMapTabMovementDisplay( selectedDayAnchors,");
    expect(NORM).toContain("useCalendarTabFeasibilityDisplay( selectedDayAnchors,");
  });

  it("⑤ useMemo が import されている（hook 利用の前提）", () => {
    expect(NORM).toContain("useMemo");
    expect(NORM).toMatch(/import \{[^}]*useMemo[^}]*\} from "react"/);
  });
});
