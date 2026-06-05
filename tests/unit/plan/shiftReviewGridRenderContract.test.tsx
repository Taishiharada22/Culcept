import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShiftReviewGrid,
  type ShiftReviewCell,
} from "@/app/(culcept)/plan/components/ShiftReviewGrid";
import { HARADA_SPRIX_DICTIONARY } from "@/lib/plan/shift/shiftCodeDictionary";
import {
  HARADA_SPRIX_JULY_GEOMETRY,
  type ShiftGridGeometry,
} from "@/lib/plan/shift/shiftGridGeometry";
import type { GridCalibration } from "@/lib/plan/shift/assistedRowSelection";

// 全 cell kind + blank-risk を網羅する fixture（2025年7月）
const FIXTURE: ShiftReviewCell[] = [
  { day: 1, date: "2025-07-01", rawCode: "G", confidence: 0.95 }, // work
  { day: 2, date: "2025-07-02", rawCode: "H", confidence: 0.95 }, // off
  { day: 3, date: "2025-07-03", rawCode: "HREQ", confidence: 0.95 }, // candidate（day4 空に隣接）
  { day: 4, date: "2025-07-04", rawCode: "", confidence: 0.9 }, // empty
  { day: 5, date: "2025-07-05", rawCode: "ZZ", confidence: 0.9 }, // unresolved（day4 空に隣接）
  { day: 6, date: "2025-07-06", rawCode: "N", confidence: 0.5 }, // work・低信頼
  { day: 7, date: "2025-07-07", rawCode: "L", confidence: 0.95 }, // work
];

function render() {
  return renderToStaticMarkup(
    <ShiftReviewGrid
      cells={FIXTURE}
      dictionary={HARADA_SPRIX_DICTIONARY}
      monthLabel="2025年7月"
      year={2025}
      month={7}
    />
  );
}

describe("ShiftReviewGrid（カレンダー型 source-of-truth cell review）", () => {
  it("grid・曜日ヘッダ（日〜土）・7 セルを描画", () => {
    const html = render();
    expect(html).toContain('data-testid="shift-review-grid"');
    expect(html).toContain('data-testid="shift-review-weekday-header"');
    expect(html).toContain("日");
    expect(html).toContain("土");
    for (let d = 1; d <= 7; d += 1) {
      expect(html).toContain(`data-testid="shift-review-cell-${d}"`);
    }
  });

  it("各 cell kind を分類（work/off/candidate/empty/unresolved）", () => {
    const html = render();
    expect(html).toMatch(/shift-review-cell-1"[^>]*data-kind="work"/);
    expect(html).toMatch(/shift-review-cell-2"[^>]*data-kind="off"/);
    expect(html).toMatch(/shift-review-cell-3"[^>]*data-kind="candidate"/);
    expect(html).toMatch(/shift-review-cell-4"[^>]*data-kind="empty"/);
    expect(html).toMatch(/shift-review-cell-5"[^>]*data-kind="unresolved"/);
  });

  it("blank-risk を heuristic 強調（低信頼 + 空欄隣接）", () => {
    const html = render();
    expect(html).toMatch(/shift-review-cell-6"[^>]*data-blank-risk="true"/); // 低信頼
    expect(html).toMatch(/shift-review-cell-3"[^>]*data-blank-risk="true"/); // 空欄隣接
    expect(html).toMatch(/shift-review-cell-5"[^>]*data-blank-risk="true"/); // 空欄隣接
  });

  it("projection preview の件数（勤務3 / 休み1 / 候補1 / 要確認1）", () => {
    const html = render();
    expect(html).toContain('data-testid="shift-review-preview"');
    expect(html).toContain("勤務");
    expect(html).toMatch(/勤務 <b[^>]*>3<\/b>/);
    expect(html).toMatch(/休み <b[^>]*>1<\/b>/);
    expect(html).toMatch(/候補 <b[^>]*>1<\/b>/);
    expect(html).toMatch(/要確認 <b>1<\/b>/);
  });

  it("保存ボタンは disabled（DB は次段 gate）", () => {
    const html = render();
    expect(html).toMatch(/shift-review-save"[^>]*disabled/);
  });

  it("honest banner（強調が無くても全セル照合）を表示", () => {
    const html = render();
    expect(html).toContain('data-testid="shift-review-notice"');
    expect(html).toContain("強調が無くても");
  });

  it("初期表示では詳細 sheet は非表示（選択なし）", () => {
    const html = render();
    expect(html).not.toContain('data-testid="shift-review-sheet"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S3A-2-4: 原稿（元画像）インライン照合トグル
const SOURCE_SENTINEL = "blob:s3a24-source-sentinel";
function renderWithImage(imageSrc?: string) {
  return renderToStaticMarkup(
    <ShiftReviewGrid
      cells={FIXTURE}
      dictionary={HARADA_SPRIX_DICTIONARY}
      monthLabel="2025年7月"
      year={2025}
      month={7}
      imageSrc={imageSrc}
    />
  );
}

describe("ShiftReviewGrid — 原稿インライン照合トグルは廃止（SourceImageHighlight に統合・重複排除）", () => {
  it("「原稿を表示して照合」トグル/セクションは出ない（CEO 2026-06-05・SourceImageHighlight が校正付きで原稿全体を表示）", () => {
    const html = renderWithImage(SOURCE_SENTINEL);
    expect(html).not.toContain('data-testid="shift-review-source-section"');
    expect(html).not.toContain('data-testid="shift-review-source-toggle"');
    expect(html).not.toContain('data-testid="shift-review-source-image"');
    expect(html).not.toContain("原稿を表示して照合");
  });

  it("imageSrc があっても保存 CTA は変わらず disabled（saveEnabled 未指定）", () => {
    const html = renderWithImage(SOURCE_SENTINEL);
    expect(html).toMatch(/shift-review-save"[^>]*disabled/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S-geo-3-2: SourceCellZoom（該当セル拡大）配線
function renderWithGeometry(imageSrc?: string) {
  return renderToStaticMarkup(
    <ShiftReviewGrid
      cells={FIXTURE}
      dictionary={HARADA_SPRIX_DICTIONARY}
      monthLabel="2025年7月"
      year={2025}
      month={7}
      imageSrc={imageSrc}
      geometry={HARADA_SPRIX_JULY_GEOMETRY}
    />
  );
}

describe("ShiftReviewGrid — S-geo-3-2 SourceCellZoom 配線", () => {
  const SRC = "blob:sgeo3-src";

  it("imageSrc + geometry → 俯瞰の SourceImageHighlight が出る（案A 併存・既存維持）", () => {
    expect(renderWithGeometry(SRC)).toContain(
      'data-testid="source-image-highlight"'
    );
  });

  it("未 hover/未選択（highlightDay null）→ SourceCellZoom は出ない（fail-soft gating）", () => {
    // 静的 render は hover/選択が無く highlightDay=null → 拡大は非表示。
    // 拡大出現の実検証は 3-1 component test + 3-3 ライブ smoke。
    expect(renderWithGeometry(SRC)).not.toContain(
      'data-testid="source-cell-zoom"'
    );
  });

  it("geometry あり時、原稿全体は SourceImageHighlight に一本化（重複トグルは廃止）", () => {
    const html = renderWithGeometry(SRC);
    expect(html).toContain('data-testid="source-image-highlight"');
    expect(html).not.toContain('data-testid="shift-review-source-section"');
    expect(html).not.toContain('data-testid="shift-review-source-toggle"');
  });

  it("geometry が無ければ俯瞰も拡大も出ない（imageSrc のみ・既存 fail-soft）", () => {
    const html = renderWithImage(SOURCE_SENTINEL); // geometry なし
    expect(html).not.toContain('data-testid="source-image-highlight"');
    expect(html).not.toContain('data-testid="source-cell-zoom"');
  });

  it("geometry あっても保存 CTA は disabled 維持（saveEnabled 未指定）", () => {
    expect(renderWithGeometry(SRC)).toMatch(/shift-review-save"[^>]*disabled/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// S-geo Persist-2/3: controlled 校正パネル + mismatch-aware「校正済」表示
//   gridCalibration が「存在するだけ」では校正済にしない（CEO 補正 2026-06-05）。
//   校正済 = effectiveGeometry が calibration 由来を採用（geometry.gridLeft/colWidth が cal 値と一致）。
const CAL_J: GridCalibration = {
  gridLeft: 260,
  colWidth: 49,
  source: "manual_overlay",
  imageW: 1860,
  imageH: 846,
  dayCount: 31,
};
// resolveEffectiveGeometry が CAL_J を採用したときの geometry（gridLeft/colWidth が CAL_J と一致）。
const APPLIED_GEOMETRY: ShiftGridGeometry = {
  imageWidth: 1860,
  imageHeight: 846,
  gridLeft: 260,
  colWidth: 49,
  cropTop: 298,
  cropHeight: 52,
};
function renderCalib(opts: {
  gridCalibration?: GridCalibration | null;
  withHandler?: boolean;
  geometry?: ShiftGridGeometry;
}) {
  return renderToStaticMarkup(
    <ShiftReviewGrid
      cells={FIXTURE}
      dictionary={HARADA_SPRIX_DICTIONARY}
      monthLabel="2025年7月"
      year={2025}
      month={7}
      imageSrc="blob:calib-src"
      geometry={opts.geometry ?? HARADA_SPRIX_JULY_GEOMETRY}
      gridCalibration={opts.gridCalibration}
      onGridCalibrationChange={opts.withHandler ? () => {} : undefined}
    />
  );
}

describe("ShiftReviewGrid — controlled 校正パネル（描画 + slider）", () => {
  it("geometry → 校正パネル + gridleft/colwidth slider + reset を描画", () => {
    const html = renderCalib({});
    expect(html).toContain('data-testid="shift-review-calibration"');
    expect(html).toContain('data-testid="shift-review-calibration-gridleft"');
    expect(html).toContain('data-testid="shift-review-calibration-colwidth"');
    expect(html).toContain('data-testid="shift-review-calibration-reset"');
  });

  it("slider は絶対値（effective geometry 由来）。gridleft value=275 / max=930（imageWidth/2）", () => {
    const html = renderCalib({});
    // 絶対値 slider: gridLeft value=geometry.gridLeft(275) / max=round(1860/2)=930。
    // colWidth value=51.5 / max=max(20, round((1860/31)*2))=120。
    // いずれの数値も markup 内で一意（readout は text・slider は value 属性）。順序非依存で照合。
    expect(html).toContain('max="930"');
    expect(html).toContain('value="275"');
    expect(html).toContain('max="120"');
    expect(html).toContain('value="51.5"');
  });

  it("geometry なし → 校正パネルは出ない（fail-soft）", () => {
    const html = renderToStaticMarkup(
      <ShiftReviewGrid
        cells={FIXTURE}
        dictionary={HARADA_SPRIX_DICTIONARY}
        monthLabel="2025年7月"
        year={2025}
        month={7}
        imageSrc="blob:no-geo"
      />
    );
    expect(html).not.toContain('data-testid="shift-review-calibration"');
  });
});

describe("ShiftReviewGrid — Persist-3 mismatch-aware「校正済」表示", () => {
  it("校正値なし → state=none /「自動・未校正」/ reset disabled（handler なし）", () => {
    const html = renderCalib({});
    expect(html).toContain('data-calibration-state="none"');
    expect(html).toContain("（自動・未校正）");
    expect(html).not.toContain("（校正済）");
    expect(html).toMatch(/shift-review-calibration-reset"[^>]*disabled=""/);
  });

  it("calibration 採用（geometry が cal 値と一致）→ state=applied /「校正済」/ reset enabled", () => {
    const html = renderCalib({
      gridCalibration: CAL_J,
      withHandler: true,
      geometry: APPLIED_GEOMETRY, // resolveEffectiveGeometry が CAL_J を採用した状態
    });
    expect(html).toContain('data-calibration-state="applied"');
    expect(html).toContain("（校正済）");
    expect(html).not.toContain("（自動・未校正）");
    // reset は活性（disabled 属性が付かない）
    expect(html).not.toMatch(/shift-review-calibration-reset"[^>]*disabled=""/);
  });

  it("mismatch（cal あり・geometry は dayColumns 由来で不一致）→ state=mismatch / 校正済にしない / reset は活性（raw 消せる）", () => {
    const html = renderCalib({
      gridCalibration: CAL_J, // 260/49
      withHandler: true,
      geometry: HARADA_SPRIX_JULY_GEOMETRY, // 275/51.5（採用されていない）
    });
    expect(html).toContain('data-calibration-state="mismatch"');
    expect(html).not.toContain("（校正済）"); // 誤点灯しない
    expect(html).toContain("（別の画像/月の校正値・未適用）");
    // raw calibration は存在するので reset は活性（古い/不一致の校正値を消せる）
    expect(html).not.toMatch(/shift-review-calibration-reset"[^>]*disabled=""/);
  });

  it("mismatch + handler なし → reset は disabled（read-only degrade・誤点灯もしない）", () => {
    const html = renderCalib({
      gridCalibration: CAL_J,
      withHandler: false,
      geometry: HARADA_SPRIX_JULY_GEOMETRY,
    });
    expect(html).toContain('data-calibration-state="mismatch"');
    expect(html).not.toContain("（校正済）");
    expect(html).toMatch(/shift-review-calibration-reset"[^>]*disabled=""/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// A1B: confusable コードの cell マーカー（似た形で紛らわしい・常時 amber「要確認」）
describe("ShiftReviewGrid — A1B confusable cell marker", () => {
  it("FIXTURE の confusable コード（H/HREQ/N）の cell は data-confusable=true", () => {
    const html = render();
    expect(html).toMatch(/shift-review-cell-2"[^>]*data-confusable="true"/); // H
    expect(html).toMatch(/shift-review-cell-3"[^>]*data-confusable="true"/); // HREQ
    expect(html).toMatch(/shift-review-cell-6"[^>]*data-confusable="true"/); // N
  });

  it("非 confusable（G/L）の cell は data-confusable=false", () => {
    const html = render();
    expect(html).toMatch(/shift-review-cell-1"[^>]*data-confusable="false"/); // G
    expect(html).toMatch(/shift-review-cell-7"[^>]*data-confusable="false"/); // L
  });

  it("confusable のみ（高 conf・空欄隣接なし）の cell に「要確認」amber が点く（blank-risk 不要）", () => {
    // day2(E) だけ confusable・高 conf・両隣 非空 → blank-risk ではない。amber が点く唯一の理由は confusable。
    const ONE: ShiftReviewCell[] = [
      { day: 1, date: "2025-07-01", rawCode: "L", confidence: 1 }, // 非 confusable・非空
      { day: 2, date: "2025-07-02", rawCode: "E", confidence: 1 }, // confusable・高 conf
      { day: 3, date: "2025-07-03", rawCode: "G", confidence: 1 }, // 非 confusable・非空
    ];
    const html = renderToStaticMarkup(
      <ShiftReviewGrid
        cells={ONE}
        dictionary={HARADA_SPRIX_DICTIONARY}
        monthLabel="2025年7月"
        year={2025}
        month={7}
      />
    );
    expect(html).toMatch(/shift-review-cell-2"[^>]*data-confusable="true"/);
    expect(html).toMatch(/shift-review-cell-1"[^>]*data-confusable="false"/);
    // amber「要確認」dot は aria-label で 1 個だけ（day2 のみ）。legend の「要確認」は aria-label を持たない。
    expect((html.match(/aria-label="要確認"/g) ?? []).length).toBe(1);
  });
});
