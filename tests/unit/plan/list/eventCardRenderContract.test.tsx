/**
 * Phase 3-N List impl sub-phase 6 — EventCard render contract test (= 第 13 補正 #2 必須化 + sub-phase 6 反映)
 *
 * 検証範囲 (= GPT 第 13 補正 5 必須項目 + sub-phase 6 反映、 react-dom/server で string HTML 検査):
 *   §1 primary 情報が出る (= title / 時刻 / 場所 / Alter 補助文)
 *   §2 proposed の見え方 (= dashed border + opacity 0.7 + 「受け入れる」 chip)
 *   §3 origin 表示 (= SourceIndicator compact 経由、 第 12 補正 #2 hierarchy 反映)
 *   §4 clonedFrom が main card に出ない (= 第 12 補正 #2 機械保証)
 *   §5 focus-visible slate (= brand focus 出ない、 規約 24-extended 機械保証)
 *
 * 第 12 補正 #2 hierarchy (= sub-phase 6 で反映):
 *   - imported origin: dot + 📄 icon + aria-label="source: ${importedFrom} imported"
 *   - alter_generated proposed: dot + ✨ icon + aria-label="source: Alter proposed"
 *   - alter_generated accepted (compact): null (= main card で user_owned 同等表示、 dot 消滅)
 *   - user origin: null (= visual noise 回避、 cloned event も同等)
 *
 * 不変原則:
 *   - @testing-library なし (= react-dom/server.renderToStaticMarkup のみ使用)
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *
 * 設計書:
 *   - Spec audit §19.11 (= 第 13 補正) + §19.13 (= 第 15 補正)
 *   - lib/plan/list/sourceProvenance.ts
 *   - app/(culcept)/plan/components/list/SourceIndicator.tsx
 *   - decision-log (= 第 13 / 14 / 15 補正引き継ぎ commit)
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "@/app/(culcept)/plan/components/list/EventCard";
import {
  createUserEvent,
  createImportedEvent,
  createAlterProposedEvent,
  acceptAlterProposed,
  cloneImported,
} from "@/lib/plan/list/sourceProvenance";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 primary 情報が出る (= title / 時刻 / 場所 / Alter 補助文)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EventCard render contract §1. primary 情報", () => {
  it("§1.1 title / 時刻 range / 場所 / Alter 補助文 が出力 HTML に含まれる", () => {
    const event = createUserEvent({
      id: 'e1',
      title: 'カフェ',
      startTime: '09:00',
      endTime: '11:00',
      location: '甲府駅前',
      alterNote: '集中しやすい場所',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('カフェ');
    expect(html).toContain('09:00-11:00');
    expect(html).toContain('甲府駅前');
    expect(html).toContain('集中しやすい場所');
  });

  it("§1.2 endTime なしなら startTime のみ表示", () => {
    const event = createUserEvent({
      id: 'e2',
      title: '昼食',
      startTime: '12:00',
      category: 'meal',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('12:00');
    expect(html).not.toMatch(/12:00-/);
  });

  it("§1.3 場所 / Alter 補助文 が optional (= 出さない時は HTML に含まれない)", () => {
    const event = createUserEvent({
      id: 'e3',
      title: 'minimal',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('minimal');
    expect(html).not.toContain('📍');
    // user origin で alterNote なし → ✨ も出ない (= SourceIndicator も null)
    expect(html).not.toContain('✨');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 proposed の見え方 (= dashed / opacity / 受け入れる chip)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EventCard render contract §2. proposed 見え方", () => {
  it("§2.1 proposed は dashed border + opacity-70 + 受け入れる chip", () => {
    const event = createAlterProposedEvent({
      id: 'e4',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('border-dashed');
    expect(html).toContain('opacity-70');
    expect(html).toContain('受け入れる');
  });

  it("§2.2 confirmed event は dashed / opacity / 受け入れる chip が出ない", () => {
    const event = createUserEvent({
      id: 'e5',
      title: 'user 作成',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).not.toContain('border-dashed');
    expect(html).not.toContain('opacity-70');
    expect(html).not.toContain('受け入れる');
  });

  it("§2.3 accepted Alter event (= proposed ではない) も dashed / opacity / chip 出ない", () => {
    const proposed = createAlterProposedEvent({
      id: 'e6',
      title: 'Alter 受け入れ済',
      startTime: '16:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T16:00:00Z');
    const html = renderToStaticMarkup(<EventCard event={accepted} />);
    expect(html).not.toContain('border-dashed');
    expect(html).not.toContain('opacity-70');
    expect(html).not.toContain('受け入れる');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 origin 表示 (= SourceIndicator compact 経由、 第 12 補正 #2 hierarchy 反映)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EventCard render contract §3. origin 表示 (= sub-phase 6 SourceIndicator 経由)", () => {
  it("§3.1 imported は SourceIndicator compact (= bg-slate-500 dot + 📄 icon + aria-label に importedFrom 名)", () => {
    const event = createImportedEvent({
      id: 'e7',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    // 第 11 補正 #1 origin axis: dot + icon + (compact なので label 出さない)
    expect(html).toContain('bg-slate-500');
    expect(html).toContain('📄');
    expect(html).toContain('aria-label="source: シフト表 imported"');
    // compact なので label (= 「シフト表から」) は出さない
    expect(html).not.toContain('シフト表から');
  });

  it("§3.2 alter_generated_accepted は SourceIndicator compact で null (= 第 12 補正 #2 dot 消滅、 main card で user_owned 同等表示)", () => {
    const proposed = createAlterProposedEvent({
      id: 'e8',
      title: 'Alter 受け入れ',
      startTime: '15:00',
      category: 'other',
    });
    const accepted = acceptAlterProposed(proposed, '2026-05-24T15:00:00Z');
    const html = renderToStaticMarkup(<EventCard event={accepted} />);
    // 第 12 補正 #2: accepted の dot 消滅 (= main card で user_owned 同等)
    expect(html).not.toContain('bg-indigo-400');
    expect(html).not.toContain('source: Alter');
    expect(html).not.toContain('Alter 提案を受け入れ済');
  });

  it("§3.3 user_entered は SourceIndicator compact で null (= default、 visual noise 回避)", () => {
    const event = createUserEvent({
      id: 'e9',
      title: 'user 作成',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).not.toContain('source: imported');
    expect(html).not.toContain('source: Alter');
    expect(html).not.toContain('bg-slate-500');
    expect(html).not.toContain('bg-indigo-400');
  });

  it("§3.4 alter_generated_proposed は SourceIndicator compact (= bg-indigo-400 dot + ✨ icon)、 同時に 受け入れる chip も出る (= 第 11 補正 #1 origin / authority 軸独立)", () => {
    const event = createAlterProposedEvent({
      id: 'e10',
      title: 'Alter 提案',
      startTime: '15:00',
      category: 'other',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    // 第 11 補正 #1: origin axis (= SourceIndicator) と authority axis (= proposed chip) が独立
    expect(html).toContain('bg-indigo-400');
    expect(html).toContain('aria-label="source: Alter proposed"');
    expect(html).toContain('✨');
    expect(html).toContain('受け入れる');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 clonedFrom が main card に出ない (= 第 12 補正 #2 機械保証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EventCard render contract §4. clonedFrom 非表示 (= 第 12 補正 #2)", () => {
  it("§4.1 cloned event の HTML に importedSource (= 「シフト表」) が含まれない", () => {
    const imported = createImportedEvent({
      id: 'imp-1',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const cloned = cloneImported(imported, 'cloned-1');
    const html = renderToStaticMarkup(<EventCard event={cloned} />);
    // clonedFrom.importedSource が main card に出ない
    expect(html).not.toContain('シフト表');
    expect(html).not.toContain('複製');
    expect(html).not.toContain('clonedFrom');
    expect(html).not.toContain('imp-1'); // 元 imported event id も出さない
  });

  it("§4.2 cloned event は main card で user_entered と区別なし (= SourceIndicator compact で null、 chip なし)", () => {
    const imported = createImportedEvent({
      id: 'imp-2',
      title: 'シフト',
      startTime: '14:00',
      category: 'work',
      importedFrom: 'シフト表',
    });
    const cloned = cloneImported(imported, 'cloned-2');
    const html = renderToStaticMarkup(<EventCard event={cloned} />);
    // cloned = user origin → SourceIndicator compact null
    expect(html).not.toContain('source: imported');
    expect(html).not.toContain('source: Alter');
    expect(html).not.toContain('bg-slate-500');
    expect(html).not.toContain('bg-indigo-400');
    expect(html).not.toContain('受け入れる');
    expect(html).not.toContain('border-dashed');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 focus-visible slate (= 規約 24-extended 機械保証、 brand focus 出ない)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EventCard render contract §5. focus-visible slate (= 規約 24-extended)", () => {
  it("§5.1 focus-visible:border-slate-300 が含まれる", () => {
    const event = createUserEvent({
      id: 'e11',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('focus-visible:border-slate-300');
  });

  it("§5.2 focus-visible:border-{indigo|purple|amber|orange|red} 等の brand / warning 色が含まれない", () => {
    const event = createUserEvent({
      id: 'e12',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).not.toMatch(/focus-visible:border-indigo/);
    expect(html).not.toMatch(/focus-visible:border-purple/);
    expect(html).not.toMatch(/focus-visible:border-amber/);
    expect(html).not.toMatch(/focus-visible:border-orange/);
    expect(html).not.toMatch(/focus-visible:border-red/);
  });

  it("§5.3 focus: (= focus-visible なし) brand 系も含まれない", () => {
    const event = createUserEvent({
      id: 'e13',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).not.toMatch(/focus:border-indigo/);
    expect(html).not.toMatch(/focus:border-purple/);
    expect(html).not.toMatch(/focus:border-slate/); // visibility なし slate も禁止
  });

  it("§5.4 focus:outline-none 維持 (= browser default outline 排除)", () => {
    const event = createUserEvent({
      id: 'e14',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('focus:outline-none');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 semantic tint (= 8b-3 追加、 CEO + GPT mock 整合、 「白い箱」 感の解消)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EventCard render contract §6. semantic tint (= 8b-3)", () => {
  it("§6.1 cafe → bg-indigo-50", () => {
    const event = createUserEvent({
      id: 'tint-cafe',
      title: 'カフェ',
      startTime: '09:00',
      category: 'cafe',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('bg-indigo-50');
  });

  it("§6.2 meal → bg-orange-50", () => {
    const event = createUserEvent({
      id: 'tint-meal',
      title: 'ランチ',
      startTime: '12:00',
      category: 'meal',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('bg-orange-50');
  });

  it("§6.3 work → bg-blue-50", () => {
    const event = createUserEvent({
      id: 'tint-work',
      title: 'オフィス',
      startTime: '14:00',
      category: 'work',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('bg-blue-50');
  });

  it("§6.4 home → bg-emerald-50", () => {
    const event = createUserEvent({
      id: 'tint-home',
      title: '帰宅',
      startTime: '18:30',
      category: 'home',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('bg-emerald-50');
  });

  it("§6.5 other → bg-white (= 中立、 default)", () => {
    const event = createUserEvent({
      id: 'tint-other',
      title: 'その他',
      startTime: '10:00',
      category: 'other',
    });
    const html = renderToStaticMarkup(<EventCard event={event} />);
    expect(html).toContain('bg-white');
  });
});
