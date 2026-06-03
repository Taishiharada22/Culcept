import { describe, it, expect } from "vitest";

import {
  detectContainmentRelations,
  classifyTimelineBlockRole,
  classifyTimelineRoles,
  qualifiesAsContainer,
  isContextLabel,
  isExclusiveLabel,
  DEFAULT_CONTAINMENT_POLICY,
  type ContainmentBlock,
} from "@/lib/plan/timeline-containment";
import { layoutLanes } from "@/lib/plan/timeline-geometry";

// 9:00=540 12:00=720 13:00=780 14:00=840 15:00=900 16:00=960 18:00=1080
const blk = (
  id: string,
  label: string,
  startMin: number,
  endMin: number,
  tone: "existing" | "draft" = "existing",
): ContainmentBlock => ({ id, label, startMin, endMin, tone });

const roles = (blocks: ContainmentBlock[]) => classifyTimelineRoles(blocks);

describe("timeline-containment — 必須9件（CEO 補正）", () => {
  it("1. 仕事 9-18 が 会議 13-14 を含む → 仕事 container / 会議 contained", () => {
    const r = roles([blk("w", "仕事", 540, 1080), blk("m", "会議", 780, 840)]);
    expect(r.get("w")).toBe("container");
    expect(r.get("m")).toBe("contained");
  });

  it("2. 仕事 9-18 が ランチ 12-13 / 会議 15-16 を含む → 仕事 container・child foreground", () => {
    const r = roles([
      blk("w", "仕事", 540, 1080),
      blk("l", "ランチ", 720, 780),
      blk("m", "会議", 900, 960),
    ]);
    expect(r.get("w")).toBe("container");
    expect(r.get("l")).toBe("contained");
    expect(r.get("m")).toBe("contained");
  });

  it("3. 映画 9-18 が別予定を含む → container にしない（exclusive）", () => {
    const r = roles([blk("mv", "映画", 540, 1080), blk("x", "メモ確認", 780, 840)]);
    expect(r.get("mv")).toBe("normal");
    expect(r.get("x")).toBe("normal"); // parent 非資格 → child も normal
  });

  it("4. フライト 9-18 が別予定を含む → container にしない（exclusive）", () => {
    const r = roles([blk("fl", "フライト", 540, 1080), blk("x", "資料", 780, 840)]);
    expect(r.get("fl")).toBe("normal");
    expect(r.get("x")).toBe("normal");
  });

  it("5. partial overlap は従来 lane（containment 扱いしない）", () => {
    const a = blk("a", "打合せ", 540, 720); // 9-12
    const b = blk("b", "打合せ", 660, 840); // 11-14（A も B も互いを内包しない）
    const r = roles([a, b]);
    expect(r.get("a")).toBe("normal");
    expect(r.get("b")).toBe("normal");
    // render 側は従来 layoutLanes → 2 lane
    expect(layoutLanes([a, b]).get("a")?.lanes).toBe(2);
  });

  it("6. 同時刻 duplicate は containment 扱いしない", () => {
    const r = roles([blk("w1", "仕事", 540, 1080), blk("w2", "仕事", 540, 1080)]);
    expect(r.get("w1")).toBe("normal");
    expect(r.get("w2")).toBe("normal");
  });

  it("7. child 同士が重なる → 両方 contained・foreground 側で lane 分割", () => {
    const w = blk("w", "仕事", 540, 1080);
    const ma = blk("ma", "会議A", 780, 900); // 13-15
    const mb = blk("mb", "会議B", 840, 960); // 14-16（A と B は部分重なり）
    const r = roles([w, ma, mb]);
    expect(r.get("w")).toBe("container");
    expect(r.get("ma")).toBe("contained");
    expect(r.get("mb")).toBe("contained");
    // foreground（非 container）を layoutLanes に通すと child 同士は 2 lane
    expect(layoutLanes([ma, mb]).get("ma")?.lanes).toBe(2);
  });

  it("8. parent に child が無い → 通常表示（band 化しない）", () => {
    const r = roles([blk("w", "仕事", 540, 1080)]);
    expect(r.get("w")).toBe("normal");
  });

  it("9. missing/不正な start/end では band 化しない", () => {
    const bad = { id: "w", label: "仕事", startMin: Number.NaN, endMin: 1080, tone: "existing" as const };
    const r = roles([bad, blk("m", "会議", 780, 840)]);
    expect(r.get("w")).toBe("normal");
    expect(r.get("m")).toBe("normal"); // 親が無効 → child も normal
  });
});

describe("timeline-containment — tone / duration / 語競合", () => {
  it("draft container は v1 では band 化しない（existing のみ）", () => {
    const r = roles([blk("w", "仕事", 540, 1080, "draft"), blk("m", "会議", 780, 840)]);
    expect(r.get("w")).toBe("normal");
    expect(r.get("m")).toBe("normal");
  });

  it("duration < 120分 の context parent は band 化しない", () => {
    const r = roles([blk("w", "仕事", 540, 600), blk("m", "会議", 550, 560)]); // 60分枠
    expect(r.get("w")).toBe("normal");
  });

  it("context と exclusive 両方に当たる label は band 化しない（安全側）", () => {
    // 「授業(exclusive)」を含むため context「作業」が当たっても非資格
    const r = roles([blk("w", "授業の準備作業", 540, 1080), blk("m", "会議", 780, 840)]);
    expect(r.get("w")).toBe("normal");
  });

  it("context 判定が無い long parent は band 化しない（誤 band 回避）", () => {
    // 「リハーサル」は context 語に無い → 内包 child があっても normal
    const r = roles([blk("p", "リハーサル", 540, 1080), blk("m", "休憩", 780, 840)]);
    expect(r.get("p")).toBe("normal");
  });
});

describe("timeline-containment — label 分類 / relations", () => {
  it("isContextLabel / isExclusiveLabel", () => {
    expect(isContextLabel("仕事")).toBe(true);
    expect(isContextLabel("勉強枠")).toBe(true);
    expect(isContextLabel("ワークブロック")).toBe(true);
    expect(isContextLabel("映画")).toBe(false);
    expect(isExclusiveLabel("映画")).toBe(true);
    expect(isExclusiveLabel("フライト")).toBe(true);
    expect(isExclusiveLabel("面接")).toBe(true);
    expect(isExclusiveLabel("仕事")).toBe(false);
    expect(isContextLabel("")).toBe(false);
    expect(isExclusiveLabel("")).toBe(false);
  });

  it("detectContainmentRelations: 親子関係を時間だけで抽出", () => {
    const rel = detectContainmentRelations([
      blk("w", "仕事", 540, 1080),
      blk("m", "会議", 780, 840),
    ]);
    expect(rel.childrenOf.get("w")).toEqual(["m"]);
    expect(rel.parentsOf.get("m")).toEqual(["w"]);
    expect(rel.byId.has("w")).toBe(true);
  });

  it("qualifiesAsContainer は per-block 述語として独立に効く", () => {
    const w = blk("w", "仕事", 540, 1080);
    const rel = detectContainmentRelations([w, blk("m", "会議", 780, 840)]);
    expect(qualifiesAsContainer(w, rel, DEFAULT_CONTAINMENT_POLICY)).toBe(true);
    // 2段目を直接呼んでも同結果
    expect(classifyTimelineBlockRole(w, rel, DEFAULT_CONTAINMENT_POLICY)).toBe("container");
  });

  it("空配列 → 空 Map", () => {
    expect(roles([]).size).toBe(0);
    expect(detectContainmentRelations([]).childrenOf.size).toBe(0);
  });
});
