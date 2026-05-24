/**
 * Phase 3-N List impl sub-phase 3.5 — Source model 2-axis refactor contract test
 *
 * 検証範囲 (= 第 10 補正 2 軸分離反映):
 *   §1 Origin axis (= 3 valid value)
 *   §2 Authority axis (= 3 valid value)
 *   §3 SourceModel 5 valid variant (= 9 組合せから 4 不正除外)
 *   §4 Factory functions (= 3 create)
 *   §5 Transition functions (= 第 7 補正 #2 + 第 8 補正 #2 = 3 transition)
 *   §6 Derived state helpers (= isProposed / isImportLocked / isAlterOrigin)
 *   §7 Source display variants (= 第 7 補正 #1 多軸表現 = 維持)
 *   §8 「由来は消えない」 (= 第 10 補正本質、 accepted 後も origin 保持)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触 (= 本 file は sub-phase 3 で着地、 sub-phase 3.5 で refactor)
 *   - regression test 永続化
 *
 * 設計書:
 *   - lib/plan/list/sourceProvenance.ts (= 2 軸モデル refactor)
 *   - decision-log (= 第 10 補正引き継ぎ commit)
 */

import { describe, expect, it } from "vitest";
import {
  type Origin,
  type Authority,
  type SourceModel,
  type UserOwnedSource,
  type ImportedLockedSource,
  type ImportedOverriddenSource,
  type AlterProposedSource,
  type AlterAcceptedSource,
  type StrictEventCardViewModel,
  createUserEvent,
  createImportedEvent,
  createAlterProposedEvent,
  acceptAlterProposed,
  overrideImported,
  cloneImported,
  isProposed,
  isImportLocked,
  isAlterOrigin,
  COMPACT_VARIANT,
  FULL_VARIANT,
} from "@/lib/plan/list/sourceProvenance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 Origin axis — 3 valid value
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3.5 §1. Origin axis — 由来 (immutable)", () => {
  it("§1.1 3 valid value (= user / imported / alter_generated)", () => {
    const origins: ReadonlyArray<Origin> = ['user', 'imported', 'alter_generated'];
    expect(origins.length).toBe(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 Authority axis — 3 valid value
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3.5 §2. Authority axis — 所有権 (transition 可能)", () => {
  it("§2.1 3 valid value (= proposed / user_owned / import_locked)", () => {
    const authorities: ReadonlyArray<Authority> = ['proposed', 'user_owned', 'import_locked'];
    expect(authorities.length).toBe(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 SourceModel 5 valid variant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3.5 §3. SourceModel — 5 valid variant (= 9 組合せから 4 不正除外)", () => {
  it("§3.1 UserOwnedSource (= user + user_owned)", () => {
    const s: UserOwnedSource = { origin: 'user', authority: 'user_owned' };
    expect(s.origin).toBe('user');
    expect(s.authority).toBe('user_owned');
  });

  it("§3.2 ImportedLockedSource (= imported + import_locked、 importedFrom required)", () => {
    const s: ImportedLockedSource = {
      origin: 'imported',
      authority: 'import_locked',
      importedFrom: 'シフト表',
    };
    expect(s.importedFrom).toBe('シフト表');
  });

  it("§3.3 ImportedOverriddenSource (= imported + user_owned、 第 7 補正 #2 override 後)", () => {
    const s: ImportedOverriddenSource = {
      origin: 'imported',
      authority: 'user_owned',
      importedFrom: 'シフト表',
    };
    expect(s.authority).toBe('user_owned');
    expect(s.importedFrom).toBe('シフト表'); // 由来保持
  });

  it("§3.4 AlterProposedSource (= alter_generated + proposed、 acceptedAt なし)", () => {
    const s: AlterProposedSource = {
      origin: 'alter_generated',
      authority: 'proposed',
    };
    expect(s.authority).toBe('proposed');
  });

  it("§3.5 AlterAcceptedSource (= alter_generated + user_owned、 第 8 補正 #2 acceptedAt 保持)", () => {
    const s: AlterAcceptedSource = {
      origin: 'alter_generated',
      authority: 'user_owned',
      acceptedAt: '2026-05-24T14:00:00Z',
    };
    expect(s.origin).toBe('alter_generated'); // 由来 不変
    expect(s.authority).toBe('user_owned');
    expect(s.acceptedAt).toBe('2026-05-24T14:00:00Z');
  });

  it("§3.6 SourceModel union — 5 variant 全て構築可能", () => {
    const variants: ReadonlyArray<SourceModel> = [
      { origin: 'user', authority: 'user_owned' },
      { origin: 'imported', authority: 'import_locked', importedFrom: 'シフト表' },
      { origin: 'imported', authority: 'user_owned', importedFrom: 'シフト表' },
      { origin: 'alter_generated', authority: 'proposed' },
      { origin: 'alter_generated', authority: 'user_owned', acceptedAt: '2026-05-24T14:00:00Z' },
    ];
    expect(variants.length).toBe(5);
  });

  // 注: 以下 4 不正組み合わせは TS compile error (= 機械的禁止):
  //   - { origin: 'user', authority: 'proposed' }
  //   - { origin: 'user', authority: 'import_locked' }
  //   - { origin: 'imported', authority: 'proposed' }
  //   - { origin: 'alter_generated', authority: 'import_locked' }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 Factory functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3.5 §4. Factory functions — validated API", () => {
  it("§4.1 createUserEvent (= user + user_owned 自動)", () => {
    const e = createUserEvent({
      id: 'e1',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    expect(e.sourceModel.origin).toBe('user');
    expect(e.sourceModel.authority).toBe('user_owned');
  });

  it("§4.2 createImportedEvent (= imported + import_locked 自動、 importedFrom 保持)", () => {
    const e = createImportedEvent({
      id: 'e2',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    expect(e.sourceModel.origin).toBe('imported');
    expect(e.sourceModel.authority).toBe('import_locked');
    if (e.sourceModel.origin === 'imported') {
      expect(e.sourceModel.importedFrom).toBe('シフト表');
    }
  });

  it("§4.3 createAlterProposedEvent (= alter_generated + proposed 自動)", () => {
    const e = createAlterProposedEvent({
      id: 'e3',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    expect(e.sourceModel.origin).toBe('alter_generated');
    expect(e.sourceModel.authority).toBe('proposed');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 Transition functions (= 第 7 補正 #2 + 第 8 補正 #2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3.5 §5. Transition functions — state transition", () => {
  it("§5.1 acceptAlterProposed: proposed → accepted (= 第 8 補正 #2 acceptedAt 保持)", () => {
    const proposed = createAlterProposedEvent({
      id: 'e1',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T14:00:00Z');
    expect(accepted.sourceModel.origin).toBe('alter_generated'); // 由来不変
    expect(accepted.sourceModel.authority).toBe('user_owned'); // authority transition
    if (accepted.sourceModel.origin === 'alter_generated' && accepted.sourceModel.authority === 'user_owned') {
      expect(accepted.sourceModel.acceptedAt).toBe('2026-05-24T14:00:00Z');
    }
  });

  it("§5.2 acceptAlterProposed default acceptedAt (= 現在時刻 ISO)", () => {
    const proposed = createAlterProposedEvent({
      id: 'e2',
      title: 'Alter 提案 2',
      startTime: '16:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed);
    if (accepted.sourceModel.origin === 'alter_generated' && accepted.sourceModel.authority === 'user_owned') {
      expect(accepted.sourceModel.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("§5.3 acceptAlterProposed throws on invalid input (= 非 proposed)", () => {
    const userEvent = createUserEvent({
      id: 'e3',
      title: 'user 作成',
      startTime: '10:00',
      category: 'cafe',
    });
    expect(() => acceptAlterProposed(userEvent)).toThrow();
  });

  it("§5.4 overrideImported: import_locked → user_owned (= 第 7 補正 #2 主方式、 importedFrom 保持)", () => {
    const imported = createImportedEvent({
      id: 'e4',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const overridden = overrideImported(imported);
    expect(overridden.sourceModel.origin).toBe('imported'); // 由来不変
    expect(overridden.sourceModel.authority).toBe('user_owned'); // authority transition
    if (overridden.sourceModel.origin === 'imported') {
      expect(overridden.sourceModel.importedFrom).toBe('シフト表'); // 由来 source 名保持
    }
  });

  it("§5.5 overrideImported throws on invalid input (= 非 import_locked)", () => {
    const userEvent = createUserEvent({
      id: 'e5',
      title: 'user 作成',
      startTime: '10:00',
      category: 'cafe',
    });
    expect(() => overrideImported(userEvent)).toThrow();
  });

  it("§5.6 cloneImported: imported → 新規 user event (= 第 7 補正 #2 補助方式、 元 imported 不変)", () => {
    const imported = createImportedEvent({
      id: 'e6',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const cloned = cloneImported(imported, 'e6-cloned');
    expect(cloned.id).toBe('e6-cloned');
    expect(cloned.title).toBe('シフト'); // title 継承
    expect(cloned.sourceModel.origin).toBe('user'); // 新規 user
    expect(cloned.sourceModel.authority).toBe('user_owned');
    // 元 imported 不変
    expect(imported.sourceModel.origin).toBe('imported');
    expect(imported.sourceModel.authority).toBe('import_locked');
  });

  it("§5.7 cloneImported throws on invalid input (= 非 imported origin)", () => {
    const userEvent = createUserEvent({
      id: 'e7',
      title: 'user 作成',
      startTime: '10:00',
      category: 'cafe',
    });
    expect(() => cloneImported(userEvent, 'new-id')).toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 Derived state helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3.5 §6. Derived state helpers — UI 判定", () => {
  it("§6.1 isProposed: true (= alter_generated + proposed)", () => {
    expect(isProposed({ origin: 'alter_generated', authority: 'proposed' })).toBe(true);
  });

  it("§6.2 isProposed: false (= 他の全 variant)", () => {
    expect(isProposed({ origin: 'user', authority: 'user_owned' })).toBe(false);
    expect(isProposed({ origin: 'imported', authority: 'import_locked', importedFrom: 'シフト表' })).toBe(false);
    expect(isProposed({ origin: 'imported', authority: 'user_owned', importedFrom: 'シフト表' })).toBe(false);
    expect(isProposed({ origin: 'alter_generated', authority: 'user_owned', acceptedAt: '2026-05-24T14:00:00Z' })).toBe(false);
  });

  it("§6.3 isImportLocked: true (= imported + import_locked)", () => {
    expect(isImportLocked({ origin: 'imported', authority: 'import_locked', importedFrom: 'シフト表' })).toBe(true);
  });

  it("§6.4 isImportLocked: false (= 他の全 variant)", () => {
    expect(isImportLocked({ origin: 'user', authority: 'user_owned' })).toBe(false);
    expect(isImportLocked({ origin: 'imported', authority: 'user_owned', importedFrom: 'シフト表' })).toBe(false);
    expect(isImportLocked({ origin: 'alter_generated', authority: 'proposed' })).toBe(false);
  });

  it("§6.5 isAlterOrigin: true (= alter_generated origin、 proposed/accepted 問わず)", () => {
    expect(isAlterOrigin({ origin: 'alter_generated', authority: 'proposed' })).toBe(true);
    expect(isAlterOrigin({ origin: 'alter_generated', authority: 'user_owned', acceptedAt: '2026-05-24T14:00:00Z' })).toBe(true);
  });

  it("§6.6 isAlterOrigin: false (= user / imported)", () => {
    expect(isAlterOrigin({ origin: 'user', authority: 'user_owned' })).toBe(false);
    expect(isAlterOrigin({ origin: 'imported', authority: 'import_locked', importedFrom: 'シフト表' })).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7 Source display variants (= 第 7 補正 #1 多軸表現)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3.5 §7. Source display variants — 第 7 補正 #1 多軸 (= 維持)", () => {
  it("§7.1 COMPACT_VARIANT (= 色 + icon、 label なし、 main 主表示)", () => {
    expect(COMPACT_VARIANT.showDot).toBe(true);
    expect(COMPACT_VARIANT.showIcon).toBe(true);
    expect(COMPACT_VARIANT.showLabel).toBe(false);
  });

  it("§7.2 FULL_VARIANT (= 全 3 軸、 詳細 sheet / 競合 modal)", () => {
    expect(FULL_VARIANT.showDot).toBe(true);
    expect(FULL_VARIANT.showIcon).toBe(true);
    expect(FULL_VARIANT.showLabel).toBe(true);
  });

  it("§7.3 COMPACT は 2 軸最低保証、 FULL は 3 軸 (= 色 dot だけ禁止)", () => {
    const compactAxes = [COMPACT_VARIANT.showDot, COMPACT_VARIANT.showIcon, COMPACT_VARIANT.showLabel].filter(Boolean).length;
    const fullAxes = [FULL_VARIANT.showDot, FULL_VARIANT.showIcon, FULL_VARIANT.showLabel].filter(Boolean).length;
    expect(compactAxes).toBeGreaterThanOrEqual(2);
    expect(fullAxes).toBe(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8 「由来は消えない」 (= 第 10 補正の本質、 accepted 後も origin 保持)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3.5 §8. 「由来は消えない」 — 第 10 補正本質", () => {
  it("§8.1 accept 後も origin === alter_generated (= 永遠保持)", () => {
    const proposed = createAlterProposedEvent({
      id: 'e1',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T14:00:00Z');
    expect(accepted.sourceModel.origin).toBe('alter_generated');
    expect(isAlterOrigin(accepted.sourceModel)).toBe(true);
  });

  it("§8.2 override 後も origin === imported (= imported 真実保持)", () => {
    const imported = createImportedEvent({
      id: 'e2',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const overridden = overrideImported(imported);
    expect(overridden.sourceModel.origin).toBe('imported');
    if (overridden.sourceModel.origin === 'imported') {
      expect(overridden.sourceModel.importedFrom).toBe('シフト表');
    }
  });

  it("§8.3 「由来」 と「所有権」 の分離 (= 由来 imported + 所有 user の 2 軸表現)", () => {
    // imported origin で user_owned authority な event (= override 後)
    const overridden: StrictEventCardViewModel = {
      id: 'e3',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      sourceModel: {
        origin: 'imported',
        authority: 'user_owned',
        importedFrom: 'シフト表',
      },
    };
    // 「由来は imported」 と「user 編集可」 が矛盾なく共存
    expect(overridden.sourceModel.origin).toBe('imported');
    expect(overridden.sourceModel.authority).toBe('user_owned');
    expect(isImportLocked(overridden.sourceModel)).toBe(false); // 編集可
  });

  it("§8.4 accepted Alter generated の正準形 (= origin=alter_generated + authority=user_owned + acceptedAt)", () => {
    const proposed = createAlterProposedEvent({
      id: 'e4',
      title: 'Alter 提案 → 受け入れ',
      startTime: '16:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T16:00:00Z');
    // 第 10 補正の本質: 3 要素全てが揃う
    expect(accepted.sourceModel.origin).toBe('alter_generated');
    expect(accepted.sourceModel.authority).toBe('user_owned');
    if (accepted.sourceModel.origin === 'alter_generated' && accepted.sourceModel.authority === 'user_owned') {
      expect(accepted.sourceModel.acceptedAt).toBe('2026-05-24T16:00:00Z');
    }
  });
});
