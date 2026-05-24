/**
 * Phase 3-N List impl sub-phase 3 — Source provenance factory contract test
 *
 * 検証範囲 (= 第 9 補正 #1 機械的禁止確認):
 *   §1 StrictSourceProvenance discriminated union (= 4 variant、 不正組み合わせ表現不能)
 *   §2 StrictEventCardViewModel (= confirmed | proposed、 source + confirmedState 整合性)
 *   §3 Factory functions (= 4 create + 1 transition、 validated API)
 *   §4 Source display variants (= 第 7 補正 #1 多軸表現)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *   - regression test 永続化
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §19.7
 *   - decision-log `98a7b924`
 */

import { describe, expect, it } from "vitest";
import {
  type UserEnteredProvenance,
  type ImportedProvenance,
  type AlterGeneratedProposedProvenance,
  type AlterGeneratedAcceptedProvenance,
  type StrictSourceProvenance,
  type ConfirmedEventCard,
  type ProposedEventCard,
  createUserEnteredEventCard,
  createImportedEventCard,
  createAlterProposedEventCard,
  acceptAlterProposed,
  COMPACT_VARIANT,
  FULL_VARIANT,
} from "@/lib/plan/list/sourceProvenance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 StrictSourceProvenance — discriminated union 4 variant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3 §1. StrictSourceProvenance — discriminated union", () => {
  it("§1.1 UserEnteredProvenance (= 最小、 importedFrom も alterAcceptedAt も型上追加不可)", () => {
    const p: UserEnteredProvenance = { source: 'user_entered' };
    expect(p.source).toBe('user_entered');
  });

  it("§1.2 ImportedProvenance (= importedFrom required)", () => {
    const p: ImportedProvenance = { source: 'imported', importedFrom: 'シフト表' };
    expect(p.importedFrom).toBe('シフト表');
  });

  it("§1.3 AlterGeneratedProposedProvenance (= alterAcceptedAt 型上追加不可、 第 9 補正 #1 機械的禁止)", () => {
    const p: AlterGeneratedProposedProvenance = { source: 'alter_generated_proposed' };
    expect(p.source).toBe('alter_generated_proposed');
    // 注: { source: 'alter_generated_proposed', alterAcceptedAt: '...' } は TS compile error
  });

  it("§1.4 AlterGeneratedAcceptedProvenance (= alterAcceptedAt required、 第 8 補正 #2 metadata 確保)", () => {
    const p: AlterGeneratedAcceptedProvenance = {
      source: 'alter_generated_accepted',
      alterAcceptedAt: '2026-05-24T14:00:00Z',
    };
    expect(p.alterAcceptedAt).toBe('2026-05-24T14:00:00Z');
  });

  it("§1.5 StrictSourceProvenance union — 4 variants 全て構築可能", () => {
    const variants: ReadonlyArray<StrictSourceProvenance> = [
      { source: 'user_entered' },
      { source: 'imported', importedFrom: 'シフト表' },
      { source: 'alter_generated_proposed' },
      { source: 'alter_generated_accepted', alterAcceptedAt: '2026-05-24T14:00:00Z' },
    ];
    expect(variants.length).toBe(4);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 StrictEventCardViewModel — confirmedState + source 整合性 (= 第 9 補正 #1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3 §2. StrictEventCardViewModel — 整合性", () => {
  it("§2.1 ConfirmedEventCard with user_entered (= valid)", () => {
    const card: ConfirmedEventCard = {
      id: 'e1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
      confirmedState: 'confirmed',
      provenance: { source: 'user_entered' },
    };
    expect(card.confirmedState).toBe('confirmed');
    expect(card.provenance.source).toBe('user_entered');
  });

  it("§2.2 ConfirmedEventCard with imported (= valid)", () => {
    const card: ConfirmedEventCard = {
      id: 'e2',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      confirmedState: 'confirmed',
      provenance: { source: 'imported', importedFrom: 'シフト表' },
    };
    expect(card.provenance.source).toBe('imported');
  });

  it("§2.3 ConfirmedEventCard with alter_generated_accepted (= valid)", () => {
    const card: ConfirmedEventCard = {
      id: 'e3',
      title: 'Alter 受け入れ済',
      startTime: '15:00',
      category: 'other',
      confirmedState: 'confirmed',
      provenance: {
        source: 'alter_generated_accepted',
        alterAcceptedAt: '2026-05-24T14:00:00Z',
      },
    };
    expect(card.confirmedState).toBe('confirmed');
  });

  it("§2.4 ProposedEventCard with alter_generated_proposed (= 唯一 valid)", () => {
    const card: ProposedEventCard = {
      id: 'e4',
      title: 'Alter 提案',
      startTime: '16:00',
      category: 'other',
      confirmedState: 'proposed',
      provenance: { source: 'alter_generated_proposed' },
    };
    expect(card.confirmedState).toBe('proposed');
    expect(card.provenance.source).toBe('alter_generated_proposed');
  });

  // 注: 以下の不正組み合わせは TS compile error (= 第 9 補正 #1 機械的禁止):
  //   - { confirmedState: 'confirmed', provenance: { source: 'alter_generated_proposed' } }
  //   - { confirmedState: 'proposed', provenance: { source: 'user_entered' } }
  //   - { confirmedState: 'proposed', provenance: { source: 'imported', importedFrom: '...' } }
  //   - { confirmedState: 'proposed', provenance: { source: 'alter_generated_accepted', alterAcceptedAt: '...' } }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 Factory functions — validated transition
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3 §3. Factory functions — validated API", () => {
  it("§3.1 createUserEnteredEventCard (= confirmed + user_entered 自動付与)", () => {
    const card = createUserEnteredEventCard({
      id: 'e1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    expect(card.provenance.source).toBe('user_entered');
    expect(card.confirmedState).toBe('confirmed');
  });

  it("§3.2 createImportedEventCard (= importedFrom required input、 confirmed 自動付与)", () => {
    const card = createImportedEventCard({
      id: 'e2',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    expect(card.provenance.source).toBe('imported');
    if (card.provenance.source === 'imported') {
      expect(card.provenance.importedFrom).toBe('シフト表');
    }
  });

  it("§3.3 createAlterProposedEventCard (= proposed + alter_generated_proposed 自動付与)", () => {
    const card = createAlterProposedEventCard({
      id: 'e3',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    expect(card.provenance.source).toBe('alter_generated_proposed');
    expect(card.confirmedState).toBe('proposed');
  });

  it("§3.4 acceptAlterProposed transition (= proposed → confirmed、 alterAcceptedAt 自動付与、 第 8 補正 #2)", () => {
    const proposed = createAlterProposedEventCard({
      id: 'e4',
      title: 'Alter 提案',
      startTime: '16:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T14:00:00Z');
    expect(accepted.confirmedState).toBe('confirmed');
    expect(accepted.provenance.source).toBe('alter_generated_accepted');
    if (accepted.provenance.source === 'alter_generated_accepted') {
      expect(accepted.provenance.alterAcceptedAt).toBe('2026-05-24T14:00:00Z');
    }
  });

  it("§3.5 acceptAlterProposed default acceptedAt (= 現在時刻 ISO 自動付与)", () => {
    const proposed = createAlterProposedEventCard({
      id: 'e5',
      title: 'Alter 提案 2',
      startTime: '17:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed);
    if (accepted.provenance.source === 'alter_generated_accepted') {
      // ISO 8601 format: YYYY-MM-DDTHH:MM:SS...
      expect(accepted.provenance.alterAcceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("§3.6 acceptAlterProposed - 元 input 保持 (= title / startTime 等)", () => {
    const proposed = createAlterProposedEventCard({
      id: 'e6',
      title: 'カフェで作業',
      startTime: '10:00',
      endTime: '12:00',
      location: '甲府駅前',
      category: 'cafe',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T10:00:00Z');
    expect(accepted.id).toBe('e6');
    expect(accepted.title).toBe('カフェで作業');
    expect(accepted.startTime).toBe('10:00');
    expect(accepted.endTime).toBe('12:00');
    expect(accepted.location).toBe('甲府駅前');
    expect(accepted.category).toBe('cafe');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 Source display variants — 第 7 補正 #1 多軸表現
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3 §4. Source display variants — 第 7 補正 #1 多軸", () => {
  it("§4.1 COMPACT_VARIANT (= 色 + icon、 label なし、 main 主表示)", () => {
    expect(COMPACT_VARIANT.showDot).toBe(true);
    expect(COMPACT_VARIANT.showIcon).toBe(true);
    expect(COMPACT_VARIANT.showLabel).toBe(false);
  });

  it("§4.2 FULL_VARIANT (= 全 3 軸、 詳細 sheet / 競合 modal)", () => {
    expect(FULL_VARIANT.showDot).toBe(true);
    expect(FULL_VARIANT.showIcon).toBe(true);
    expect(FULL_VARIANT.showLabel).toBe(true);
  });

  it("§4.3 COMPACT は 2 軸、 FULL は 3 軸 (= 色 dot だけ禁止の機械保証)", () => {
    const compactAxes = [COMPACT_VARIANT.showDot, COMPACT_VARIANT.showIcon, COMPACT_VARIANT.showLabel].filter(Boolean).length;
    const fullAxes = [FULL_VARIANT.showDot, FULL_VARIANT.showIcon, FULL_VARIANT.showLabel].filter(Boolean).length;
    expect(compactAxes).toBeGreaterThanOrEqual(2);
    expect(fullAxes).toBe(3);
  });
});
