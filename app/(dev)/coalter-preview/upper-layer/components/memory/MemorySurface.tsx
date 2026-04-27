"use client";

/**
 * MemorySurface (L1-h)
 *
 * 正本: UI spec §8.2.1 コンポーネント形態 / §8.3 3 軸ラベル
 *
 * 共有メモリ surface 本体。MemoryItemCard を集約表示し、3 軸 (由来 / 確定度 /
 * 可視性) の独立切替フィルタを scaffold として提供する。
 *
 * §8.2.1 4 形態 (panel / drawer / inline / badge) のうち本 component は
 * panel 形態を担当 (drawer 展開は L2 で接続予定)。
 *
 * §8.3.4 禁止組み合わせの除外: MemoryItemCard 側で構造的 enforce
 * (isForbiddenCombination true なら null を返す)。
 */

import { useState } from "react";
import {
  MEMORY_ITEMS,
  type MemorySource,
  type MemoryConfidence,
  type MemoryVisibility,
  SOURCE_LABELS,
  CONFIDENCE_LABELS,
  VISIBILITY_LABELS,
  FORBIDDEN_COMBINATIONS,
} from "../../mock/memoryItems";
import MemoryItemCard from "./MemoryItemCard";

type Filter<T extends string> = "all" | T;

export default function MemorySurface() {
  const [sourceFilter, setSourceFilter] = useState<Filter<MemorySource>>("all");
  const [confFilter, setConfFilter] = useState<Filter<MemoryConfidence>>("all");
  const [visFilter, setVisFilter] = useState<Filter<MemoryVisibility>>("all");

  const filtered = MEMORY_ITEMS.filter((item) => {
    if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
    if (confFilter !== "all" && item.confidence !== confFilter) return false;
    if (visFilter !== "all" && item.visibility !== visFilter) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §8.3.1 3 軸は独立。下記フィルタを別レイヤーで切替 (相関するが 1:1
        mapping ではない)。
      </div>

      {/* 3 軸独立フィルタ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <FilterRow
          label="由来 (§8.3.1)"
          options={[
            ["all", "すべて"],
            ["explicit_shared", SOURCE_LABELS.explicit_shared],
            ["inferred", SOURCE_LABELS.inferred],
            ["transient_summary", SOURCE_LABELS.transient_summary],
          ]}
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as Filter<MemorySource>)}
        />
        <FilterRow
          label="確定度 (§8.3.1)"
          options={[
            ["all", "すべて"],
            ["high", CONFIDENCE_LABELS.high],
            ["medium", CONFIDENCE_LABELS.medium],
            ["low", CONFIDENCE_LABELS.low],
          ]}
          value={confFilter}
          onChange={(v) => setConfFilter(v as Filter<MemoryConfidence>)}
        />
        <FilterRow
          label="可視性 (§8.3.1)"
          options={[
            ["all", "すべて"],
            ["both_visible", VISIBILITY_LABELS.both_visible],
            ["user_a_only", VISIBILITY_LABELS.user_a_only],
            ["user_b_only", VISIBILITY_LABELS.user_b_only],
            ["internal_only", VISIBILITY_LABELS.internal_only],
          ]}
          value={visFilter}
          onChange={(v) => setVisFilter(v as Filter<MemoryVisibility>)}
        />
      </div>

      {/* item リスト */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: "#8888a0", fontStyle: "italic" }}>
            該当する memory 項目はありません
          </div>
        ) : (
          filtered.map((item) => <MemoryItemCard key={item.id} item={item} />)
        )}
      </div>

      {/* §8.3.4 禁止組み合わせ列挙 (構造的 enforce の根拠) */}
      <details style={{ fontSize: 11, color: "#4a4a68" }}>
        <summary style={{ cursor: "pointer", padding: "4px 0" }}>
          §8.3.4 禁止組み合わせ ({FORBIDDEN_COMBINATIONS.length} 件、UI で生成
          されない)
        </summary>
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {FORBIDDEN_COMBINATIONS.map((f, i) => (
            <div
              key={i}
              style={{
                padding: "6px 8px",
                background: "#f5f6fa",
                border: "1px dashed #c8c8dc",
                borderRadius: 4,
              }}
            >
              <code style={{ fontSize: 11 }}>
                {f.source} × {f.confidence} × {f.visibility}
              </code>
              <div style={{ fontSize: 11, marginTop: 2 }}>{f.reason}</div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<readonly [T | "all", string]>;
  value: T | "all";
  onChange: (v: T | "all") => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontSize: 11,
          color: "#4a4a68",
          minWidth: 110,
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            style={{
              padding: "3px 8px",
              fontSize: 11,
              border: "1px solid",
              borderColor: value === v ? "#6366F1" : "#c8c8dc",
              background: value === v ? "#eef2ff" : "#ffffff",
              color: "#1a1a2e",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
