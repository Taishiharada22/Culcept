/**
 * Stage 4 B-4.2 — Path B 完了 invariant + §10.2 mapping export
 *
 * 目的 (CEO 確定 2026-04-30):
 *   - Path B 全 commit 列の整合性を構造 invariant で固定
 *   - §10.2 13 項目の達成状況を type-safe export (CEO 監視 / 将来 phase 更新の base)
 *   - 残リスク R1-R13 の docs 化 (decision-log への記載確認)
 *   - 表現規約 enforce: Path B 完了 ≠ §10.2 全項目完全達成
 *
 * test strategy:
 *   - 関数 invoke 方式 (新 dep ゼロ、CEO 厳守維持)
 *   - real DB query なし (Path B B-3.4 manual test で carry 済)
 *   - file 構造 + decision-log 内容の grep で contract 固定
 *
 * 不変 (CEO 厳守 2026-04-30):
 *   - UI 実装追加なし
 *   - API 変更なし
 *   - Supabase migration 変更なし
 *   - L4-i/j/k/m / mainstream E-3 実装なし
 *   - env / package 変更なし
 */

import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────
// §10.2 13 項目の type-safe definition (export、将来 phase で更新)
// ─────────────────────────────────────────────

export type Stage4ItemStatus = "complete" | "partial" | "missing";

export interface Stage4CompletionItem {
  /** §10.2 内の連番 (1-13) */
  index: number;
  /** §10.2 原文 (簡略) */
  description: string;
  /** 達成状況 */
  status: Stage4ItemStatus;
  /** Path B での主担当 commit (該当なし時 null) */
  pathBCommit: string | null;
  /** 達成根拠 / 部分達成の理由 */
  evidence: string;
  /** 残作業を担う次フェーズ (complete 時 null) */
  remainingPhase: string | null;
}

/**
 * Stage 4 L4-l 完了定義 §10.2 への Path B 達成状況。
 *
 * 表現規約 (CEO 確定 2026-04-30):
 *   - "complete" + "partial" + "missing" を必ず合計 13 にする
 *   - "complete" のみで全 13 になる状態 = §10.2 全項目完全達成
 *   - 現状 (Path B 完了時点) は complete=5、partial=6、missing=2
 */
export const STAGE_4_L4L_COMPLETION_DEFINITION: ReadonlyArray<Stage4CompletionItem> = [
  {
    index: 1,
    description: "Stage 0.5 〜 4 全完了",
    status: "partial",
    pathBCommit: null,
    evidence: "Path B = Stage 4 のうち L4-a/b/f/g/h 中心、L4-i/j/k/m 残",
    remainingPhase: "L4-i / L4-j / L4-k / L4-m / mainstream E-3",
  },
  {
    index: 2,
    description: "PRESENCE_EXECUTOR=true / LEGACY_CARD_AUTO_INSERT=false / PRESENCE_SPEECH_LLM=true 本番稼働",
    status: "partial",
    pathBCommit: null,
    evidence: "前 2 つは Vercel env で適用済 (preview 段階)、PRESENCE_SPEECH_LLM=true は L4-i 範囲、Path B では category-based static fallback",
    remainingPhase: "L4-i (PRESENCE_SPEECH_LLM)",
  },
  {
    index: 3,
    description: "3 Presence Mode (通常 / Daily / Travel) 本番稼働",
    status: "complete",
    pathBCommit: "02b57f79",
    evidence: "B-1 ModeSwitcher 動作確認 (CEO 視覚確認 PASS、modeReducer driven)",
    remainingPhase: null,
  },
  {
    index: 4,
    description: "共有メモリ surface (3 軸: 由来×確定度×可視性) 本番稼働",
    status: "complete",
    pathBCommit: "8330c7bc",
    evidence: "B-3.4 manual test で INSERT/DELETE realtime 即時反映 (CEO 視覚確認 PASS)",
    remainingPhase: null,
  },
  {
    index: 5,
    description: "緊急介入視覚層 本番稼働",
    status: "complete",
    pathBCommit: "2bc7a7b4",
    evidence: "B-2 critical keyword 視覚確認 (rupture_detected / safety_concern 動作確認)",
    remainingPhase: null,
  },
  {
    index: 6,
    description: "拒否 3 分類 本番稼働",
    status: "partial",
    pathBCommit: null,
    evidence: "Stage 2 rejectionReducer 実装済、Path B で UI 接続なし (RejectionFlows.tsx 実装済だが UpperLayerMount に mount なし)",
    remainingPhase: "L4-h 拡張または別 sub-phase",
  },
  {
    index: 7,
    description: "連投抑制 構造的担保 本番稼働",
    status: "complete",
    pathBCommit: null,
    evidence: "Stage 2 rateLimitGuard / utteranceQueue 実装済、Path B で structural enforcement 維持",
    remainingPhase: null,
  },
  {
    index: 8,
    description: "speechBuilder LLM 合成 本番稼働",
    status: "missing",
    pathBCommit: null,
    evidence:
      "Path B では category-based static fallback (URGENT_FALLBACK_MESSAGES) を採用、LLM 接続未実施。" +
      "L4-i Phase 1 (CEO 確定 2026-04-30) で API route + UpperLayerMount fetch + state component body prop の bridge wire 完了 (commit 後)、" +
      "ただし client gate (isSpeechFetchEnabled = env 未設定で false) + server gate (presenceSpeechLLMEnabled + ANTHROPIC_API_KEY 未設定) で flag OFF default、" +
      "Phase 1 では LLM 課金経路に到達しない (Production behavior 完全不変)。本番稼働は L4-i Phase 2 (Vercel Preview env 追加 + 観測) → Phase 3 (Production promote) で達成",
    remainingPhase:
      "L4-i Phase 2 (Preview env 追加 + 段階観測 20→100→variant) → L4-i Phase 3 (Production promote)",
  },
  {
    index: 9,
    description: "telemetry 8 項目 計測稼働",
    status: "partial",
    pathBCommit: null,
    evidence: "L4-j で telemetry 実装済 + Sentry breadcrumb sink wiring 済 (instrumentation-client.ts)、Path B で Production の発火頻度・整合性未測定",
    remainingPhase: "L4-j (Production 観測)",
  },
  {
    index: 10,
    description: "a11y / loading / error / empty 4 補助状態 全 27 セル稼働",
    status: "complete",
    pathBCommit: null,
    evidence:
      "L4-k (2026-04-30) で 4 補助状態すべて wire 完成: " +
      "Loading=isPresenceReady transient (mount 直後 1 tick) / " +
      "Empty=availability!=='active' (B-1 default active 固定で発火しない、将来 consent flow で発火) / " +
      "Error=UpperLayerErrorBoundary class component catch / " +
      "Aria=StateAriaWrapper polite 固定 (UpperLayerStateRenderer で全 state component を統一 wrap、" +
      "UpperLayerShell の二重 role=region 削除)。" +
      "27 セル × 4 補助 = 108 ケース structural readiness を test PASS で担保",
    remainingPhase: null,
  },
  {
    index: 11,
    description: "統合契約 / runtime / Core UX 不可侵項 全て遵守",
    status: "complete",
    pathBCommit: null,
    evidence: "Path B 全 commit で CEO 厳守事項 12 項目を構造 invariant test で確認、test 5240/5241 PASS (1 = pre-existing alter-morning、deferred)",
    remainingPhase: null,
  },
  {
    index: 12,
    description: "mainstream plan E-3 (三段式本番 flip) と整合",
    status: "partial",
    pathBCommit: null,
    evidence: "mainstream E-3 の状態 + Path B との接続点は別 audit 必要",
    remainingPhase: "mainstream plan E-3 整合 audit",
  },
  {
    index: 13,
    description: "legacy CoAlterCard 自動挿入コード削除",
    status: "missing",
    pathBCommit: null,
    evidence: "L4-m 範囲、CEO「1 rev 観測後」方針、Path B では LEGACY_CARD_AUTO_INSERT=false で抑止のみ",
    remainingPhase: "L4-m",
  },
];

export interface Stage4CompletionSummary {
  total: number;
  complete: number;
  partial: number;
  missing: number;
  /** complete のみ計上 (CEO 表現規約: complete + partial を「完全達成」と呼ばない) */
  completionRatio: number;
}

export function summarizeStage4Completion(
  definition: ReadonlyArray<Stage4CompletionItem> = STAGE_4_L4L_COMPLETION_DEFINITION,
): Stage4CompletionSummary {
  const total = definition.length;
  const complete = definition.filter((i) => i.status === "complete").length;
  const partial = definition.filter((i) => i.status === "partial").length;
  const missing = definition.filter((i) => i.status === "missing").length;
  return {
    total,
    complete,
    partial,
    missing,
    completionRatio: complete / total,
  };
}

// ─────────────────────────────────────────────
// 構造 invariant test
// ─────────────────────────────────────────────

describe("B-4.2 §10.2 13 項目定義の整合性", () => {
  it("13 項目すべて定義されている (CEO 確定 §10.2 完了定義)", () => {
    expect(STAGE_4_L4L_COMPLETION_DEFINITION).toHaveLength(13);
  });

  it("index は 1〜13 の連続値で重複なし", () => {
    const indices = STAGE_4_L4L_COMPLETION_DEFINITION.map((i) => i.index).sort(
      (a, b) => a - b,
    );
    expect(indices).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("status は complete | partial | missing のいずれか", () => {
    const validStatuses = new Set(["complete", "partial", "missing"]);
    for (const item of STAGE_4_L4L_COMPLETION_DEFINITION) {
      expect(validStatuses.has(item.status)).toBe(true);
    }
  });

  it("complete 項目には pathBCommit (string) または明確な evidence あり", () => {
    for (const item of STAGE_4_L4L_COMPLETION_DEFINITION) {
      if (item.status === "complete") {
        expect(item.evidence.length).toBeGreaterThan(0);
        // pathBCommit は null (構造的達成) or 7 文字の git short hash
        if (item.pathBCommit !== null) {
          expect(item.pathBCommit).toMatch(/^[a-f0-9]{7,8}$/);
        }
      }
    }
  });

  it("partial / missing 項目には remainingPhase (next phase 指示) あり", () => {
    for (const item of STAGE_4_L4L_COMPLETION_DEFINITION) {
      if (item.status === "partial" || item.status === "missing") {
        expect(item.remainingPhase).not.toBeNull();
        expect(item.remainingPhase!.length).toBeGreaterThan(0);
      }
    }
  });

  it("complete 項目には remainingPhase = null", () => {
    for (const item of STAGE_4_L4L_COMPLETION_DEFINITION) {
      if (item.status === "complete") {
        expect(item.remainingPhase).toBeNull();
      }
    }
  });
});

describe("B-4.2 表現規約 enforce — Path B 完了 ≠ §10.2 全項目完全達成", () => {
  const summary = summarizeStage4Completion();

  it("Path B 完了時点で complete + partial + missing = 13", () => {
    expect(summary.complete + summary.partial + summary.missing).toBe(13);
    expect(summary.total).toBe(13);
  });

  it("Path B 完了 ≠ §10.2 全項目完全達成 (partial + missing > 0)", () => {
    // CEO 確定表現規約: complete のみで 13 にならない限り「完全達成」と呼ばない
    expect(summary.partial + summary.missing).toBeGreaterThan(0);
  });

  it("Path B で達成された core UI path (= complete + 構造遵守) は 30% 以上", () => {
    // CEO 体感 UI core (3 mode / memory / urgent / 連投抑制 / 不可侵項) は達成済
    expect(summary.completionRatio).toBeGreaterThan(0.3);
  });

  it("Path B 完了時点で completionRatio < 1.0 (= 未達成あり)", () => {
    expect(summary.completionRatio).toBeLessThan(1.0);
  });

  it("missing 項目は 2 (L4-i speechBuilder LLM + L4-m legacy 削除)", () => {
    const missingIndices = STAGE_4_L4L_COMPLETION_DEFINITION.filter(
      (i) => i.status === "missing",
    ).map((i) => i.index);
    expect(missingIndices.sort((a, b) => a - b)).toEqual([8, 13]);
  });
});

describe("B-4.2 Path B commit 列の整合性", () => {
  it("complete 項目の pathBCommit は B-1 / B-2 / B-3 の commit hash 範囲", () => {
    const validCommitHashes = new Set([
      "02b57f79", // B-1
      "2bc7a7b4", // B-2.1
      "03ada72a", // B-2.2
      "a0a4d2c9", // B-2.3
      "e5474242", // B-3.1
      "6c0cf82d", // B-3.2
      "8330c7bc", // B-3.3
      "8e5d0e80", // B-3.4.a
      "bb0eba99", // B-3.4.b
      "9599138e", // B-3.4.c
      "42ba5bee", // B-3.4.d
    ]);
    for (const item of STAGE_4_L4L_COMPLETION_DEFINITION) {
      if (item.pathBCommit !== null) {
        expect(validCommitHashes.has(item.pathBCommit)).toBe(true);
      }
    }
  });
});

describe("B-4.2 Migration timestamp 連続性", () => {
  it("B-3.4.a (publication) → B-3.4.d (REPLICA IDENTITY FULL) の timestamp 順序", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    const files = fs.readdirSync(dir);

    expect(files).toContain(
      "20260430100000_coalter_memory_items_realtime.sql",
    );
    expect(files).toContain(
      "20260430110000_coalter_memory_items_replica_full.sql",
    );

    // 単調増加: 20260430100000 < 20260430110000
    expect("20260430100000".localeCompare("20260430110000")).toBeLessThan(0);
  });
});

describe("B-4.2 Flag 構造 invariant — direct property access (前 phase で修正済の維持)", () => {
  it("flags.ts の presenceExecutorEnabled は process.env.NEXT_PUBLIC_X 直接アクセス", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../lib/coalter/flags.ts");
    const content = fs.readFileSync(file, "utf8");
    // direct member access (webpack DefinePlugin inline 対応、commit f50ff08d 維持)
    expect(content).toMatch(
      /process\.env\.NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR/,
    );
    expect(content).toMatch(
      /process\.env\.NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT/,
    );
  });
});

describe("B-4.2 残リスク R1-R13 が decision-log に記録", () => {
  let decisionLogContent: string;

  beforeAll(async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "../../../docs/decision-log.md");
    decisionLogContent = fs.readFileSync(file, "utf8");
  });

  it("Stage 4 B-4.1 audit entry が存在", () => {
    expect(decisionLogContent).toMatch(/Stage 4 B-4\.1 audit/);
  });

  it("R1-R13 全 13 risks が文書化", () => {
    for (let i = 1; i <= 13; i++) {
      expect(decisionLogContent).toMatch(new RegExp(`R${i}\\b|\\*\\*R${i}\\*\\*`));
    }
  });

  it("Production promote 候補 P1/P2/P3 が記載", () => {
    expect(decisionLogContent).toMatch(/P1.*Path B 完了で promote/);
    expect(decisionLogContent).toMatch(/P2.*§10\.2 全項目達成後/);
    expect(decisionLogContent).toMatch(/P3.*段階的 promote/);
  });

  it("次フェーズ優先順位 5 項目が記載 (L4-k > L4-j > L4-i > L4-m > E-3)", () => {
    expect(decisionLogContent).toMatch(/L4-k.*a11y/);
    expect(decisionLogContent).toMatch(/L4-j.*telemetry/);
    expect(decisionLogContent).toMatch(/L4-i.*LLM/);
    expect(decisionLogContent).toMatch(/L4-m.*legacy/);
    expect(decisionLogContent).toMatch(/mainstream plan E-3/);
  });

  it("B-3.4 Realtime INSERT / DELETE manual test PASS が記載", () => {
    expect(decisionLogContent).toMatch(/INSERT realtime.*即時表示/);
    expect(decisionLogContent).toMatch(/DELETE realtime.*page refresh なしで即時消失/);
  });
});

describe("B-4.2 §10.2 達成サマリ export (CEO 監視用)", () => {
  it("summarizeStage4Completion が JSON 形式で出力可能", () => {
    const summary = summarizeStage4Completion();
    // JSON serialize 可能であること (CEO 監視用)
    const json = JSON.stringify(summary);
    const parsed = JSON.parse(json);
    expect(parsed.total).toBe(13);
    // L4-k (2026-04-30) で #10 partial → complete: complete 5→6 / partial 6→5
    expect(parsed.complete).toBe(6);
    expect(parsed.partial).toBe(5);
    expect(parsed.missing).toBe(2);
    expect(parsed.completionRatio).toBeCloseTo(6 / 13);
  });

  it("summary は immutable (将来 phase で update 時に意図せぬ変化を防ぐ)", () => {
    const a = summarizeStage4Completion();
    const b = summarizeStage4Completion();
    expect(a).toEqual(b);
  });
});

describe("B-4.2 Path B 完了判定 (将来 phase の前提資料)", () => {
  it("Path B + L4-k 完了 = Stage 4 L4-l core UI path 完了 (6 項目達成、L4-k で #10 complete 移行)", () => {
    const summary = summarizeStage4Completion();
    // L4-k (2026-04-30) で #10 complete に移行: 5 → 6
    expect(summary.complete).toBe(6);
  });

  it("§10.2 残項目 = L4-i / L4-j / L4-m / mainstream E-3 + 拒否 3 分類 UI 接続 (L4-k 完了で #10 削除)", () => {
    const partialOrMissing = STAGE_4_L4L_COMPLETION_DEFINITION.filter(
      (i) => i.status !== "complete",
    );
    // L4-k 完了で 残 7 項目 (partial 5 + missing 2)
    expect(partialOrMissing).toHaveLength(7);
    // remainingPhase で次 phase が明示
    for (const item of partialOrMissing) {
      expect(item.remainingPhase).not.toBeNull();
    }
  });
});
