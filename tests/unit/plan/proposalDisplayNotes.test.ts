/**
 * Phase 3-J-6b: displayProposalAwareNotes helper + UI 露出 grep test
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-6 / §D source.notes 露出対策 / §10.4 Smoke 38
 *
 * 検証対象:
 *   - displayProposalAwareNotes 全 case (= prefix / 通常 / 空 / undefined)
 *   - alter-proposal: raw が UI 表示 file に漏れないこと (= grep test)
 *
 * 不変原則 (= 本 test で機械的に強制):
 *   - Invariant 17 Internal data disclosure only (= proposalId UI 非可視)
 *   - Invariant 39 No Penalty for Ignore (= 「提案から追加」 中立 label)
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  PROPOSAL_DISPLAY_LABEL,
  displayProposalAwareNotes,
} from "@/lib/plan/proposal/displayNotes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// displayProposalAwareNotes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("displayProposalAwareNotes — PROPOSAL_DISPLAY_LABEL", () => {
  it("constant is the user-visible label", () => {
    expect(PROPOSAL_DISPLAY_LABEL).toBe("提案から追加");
  });
});

describe("displayProposalAwareNotes — empty / undefined", () => {
  it("undefined → null", () => {
    expect(displayProposalAwareNotes(undefined)).toBeNull();
  });

  it("empty string → null", () => {
    expect(displayProposalAwareNotes("")).toBeNull();
  });
});

describe("displayProposalAwareNotes — proposal prefix", () => {
  it("'alter-proposal:proposal_xyz' → '提案から追加' (= proposalId hide)", () => {
    expect(displayProposalAwareNotes("alter-proposal:proposal_xyz")).toBe(
      "提案から追加",
    );
  });

  it("'alter-proposal:' (= empty proposalId) → still '提案から追加'", () => {
    expect(displayProposalAwareNotes("alter-proposal:")).toBe("提案から追加");
  });

  it("proposalId never leaks (= 確認: 出力に proposalId 文字列なし)", () => {
    const out = displayProposalAwareNotes("alter-proposal:proposal_secret_12345");
    expect(out).not.toContain("proposal_secret_12345");
    expect(out).not.toContain("alter-proposal:");
  });
});

describe("displayProposalAwareNotes — regular notes (= prefix なし)", () => {
  it("普通 notes はそのまま返す", () => {
    expect(displayProposalAwareNotes("ユーザーメモ")).toBe("ユーザーメモ");
    expect(displayProposalAwareNotes("PDF 由来 2026-05-22")).toBe(
      "PDF 由来 2026-05-22",
    );
  });

  it("「alter-proposal:」 substring (= prefix ではなく中間) は通常 notes 扱い", () => {
    // 「alter-proposal:」 が prefix でない場合は変換しない
    expect(displayProposalAwareNotes("user note: alter-proposal:xyz")).toBe(
      "user note: alter-proposal:xyz",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRITICAL: UI 表示系 file で raw "alter-proposal:" が漏れていないか grep
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("UI display files: raw 'alter-proposal:' exposure grep", () => {
  /**
   * 露出 NG file (= source.notes を **直接** display する可能性のある UI files)。
   * これらの file 内で source.notes を直接表示する箇所がないこと (= 必ず
   * displayProposalAwareNotes を経由していること) を verify する。
   */
  const UI_FILES = [
    "app/(culcept)/plan/components/AnchorDetailModal.tsx",
    "app/(culcept)/plan/components/SourceListModal.tsx",
  ];

  for (const file of UI_FILES) {
    it(`${file}: raw source.notes / s.notes が user 表示 expression に出ない (= displayProposalAwareNotes 経由)`, () => {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      // 直接表示 pattern 検出 (= JSX expression 内で生 source.notes / s.notes が `${...}` template literal に使われていないか)
      const FORBIDDEN_PATTERNS = [
        /\$\{source\.notes\}/, // ${source.notes} = 生 trace 露出 risk
        /\$\{s\.notes\}/, // ${s.notes} = 同上
      ];

      const violations: { line: number; content: string }[] = [];
      lines.forEach((line, idx) => {
        for (const pattern of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({ line: idx + 1, content: line.trim() });
          }
        }
      });

      if (violations.length > 0) {
        const msg = violations
          .map((v) => `${file}:${v.line}: ${v.content}`)
          .join("\n");
        throw new Error(
          `[source.notes raw exposure violation] (Invariant 17):\n${msg}`,
        );
      }
    });

    it(`${file}: displayProposalAwareNotes が import されている (= 変換 helper 経由 保証)`, () => {
      const content = readFileSync(file, "utf-8");
      expect(content).toMatch(
        /import\s+\{[^}]*displayProposalAwareNotes[^}]*\}\s+from\s+["']@\/lib\/plan\/proposal\/displayNotes["']/,
      );
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 全 app/ + components/ 範囲で "alter-proposal:" raw literal が
// 表示用 string literal として書かれていないか (= 念押し grep)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Global UI source: 'alter-proposal:' literal の意図外露出 grep", () => {
  it("app/ + components/ 全体で 'alter-proposal:' literal が JSX content に存在しない", () => {
    const violations: { file: string; line: number; content: string }[] = [];

    function scan(dir: string) {
      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") {
          continue;
        }
        const full = join(dir, entry);
        let stats;
        try {
          stats = statSync(full);
        } catch {
          continue;
        }
        if (stats.isDirectory()) {
          scan(full);
        } else if (stats.isFile() && /\.(tsx|jsx)$/.test(entry)) {
          let content;
          try {
            content = readFileSync(full, "utf-8");
          } catch {
            continue;
          }
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            // skip コメント行
            const trimmed = line.trim();
            if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
            // "alter-proposal:" を含む string literal が JSX context にある場合 violation
            if (/["']alter-proposal:[^"']*["']/.test(line)) {
              violations.push({ file: full, line: idx + 1, content: trimmed });
            }
          });
        }
      }
    }

    scan("app");
    scan("components");

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `${v.file}:${v.line}: ${v.content}`)
        .join("\n");
      throw new Error(
        `[alter-proposal: literal exposure in UI] (Invariant 17):\n${msg}`,
      );
    }
  });
});
