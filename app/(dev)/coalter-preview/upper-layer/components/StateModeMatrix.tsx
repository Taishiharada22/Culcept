"use client";

/**
 * 状態 × モード 優先順位マトリクス可視化 (L1-d)
 *
 * 正本: layout plan v0.2 §4.4 / UI spec §4 マトリクス本体
 *
 * 27 セル × 6 属性を表で表示。state 単位で展開（accordion 形式）。
 * 通常 / Daily / Travel の差分を override 注記として可視化。
 *
 * 本 component は scaffold (L1-d)。実機 logic は Stage 2 reducer / patternSelector で実装。
 */

import { useState } from "react";
import {
  getMatrix,
  getStateTitle,
  STATE_PRIORITY_EXCEPTION,
  type StateKey,
  type ModeKey,
} from "../mock/stateModeMatrix";

const MODE_LABELS: Record<ModeKey, string> = {
  normal: "通常モード（基線）",
  daily: "Daily",
  travel: "Travel",
};

const STATES: StateKey[] = [
  "S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8",
];

export default function StateModeMatrix() {
  const [expandedState, setExpandedState] = useState<StateKey | null>("S0");
  const matrix = getMatrix();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", marginBottom: 4 }}>
        27 セル × 6 属性。state ヘッダ click で 3 mode 列を展開。Daily / Travel の
        override / 追加注記がある場合は専用行で強調表示。
      </div>

      {STATES.map((s) => {
        const cells = matrix.filter((c) => c.state === s);
        const isExpanded = expandedState === s;
        return (
          <div
            key={s}
            style={{
              border: "1px solid #e8e8ec",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setExpandedState(isExpanded ? null : s)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                fontSize: 13,
                background: isExpanded ? "#f5f6fa" : "#ffffff",
                border: "none",
                borderBottom: isExpanded ? "1px solid #e8e8ec" : "none",
                cursor: "pointer",
                fontWeight: 600,
                color: "#1a1a2e",
              }}
            >
              {isExpanded ? "▼" : "▶"} {getStateTitle(s)}
            </button>

            {isExpanded && (
              <div style={{ padding: 8 }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 11,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          border: "1px solid #c8c8dc",
                          padding: "4px 6px",
                          background: "#f5f6fa",
                          textAlign: "left",
                          width: "16%",
                        }}
                      >
                        属性
                      </th>
                      {(["normal", "daily", "travel"] as ModeKey[]).map((m) => (
                        <th
                          key={m}
                          style={{
                            border: "1px solid #c8c8dc",
                            padding: "4px 6px",
                            background: "#f5f6fa",
                            textAlign: "left",
                            width: "28%",
                          }}
                        >
                          {MODE_LABELS[m]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <RowAttr label="1. 表示面" cells={cells} accessor={(c) => c.cell.display} />
                    <RowAttr
                      label="2. 許可 action"
                      cells={cells}
                      accessor={(c) => c.cell.allowedActions}
                    />
                    <RowAttr
                      label="3. 禁止 action"
                      cells={cells}
                      accessor={(c) => c.cell.forbiddenActions}
                    />
                    <RowAttr
                      label="4. 発話トーン"
                      cells={cells}
                      accessor={(c) => c.cell.toneCategory}
                    />
                    <RowAttr
                      label="5. 昇格／降格"
                      cells={cells}
                      accessor={(c) => c.cell.promotion}
                    />
                    <RowAttr
                      label="6. UI 密度"
                      cells={cells}
                      accessor={(c) => c.cell.density}
                    />
                    {/* override 注記 (Daily / Travel に差分がある場合のみ) */}
                    {cells.some((c) => c.cell.overrideNote) && (
                      <tr>
                        <th
                          style={{
                            border: "1px solid #c8c8dc",
                            padding: "4px 6px",
                            background: "#fff7ed",
                            textAlign: "left",
                            color: "#92400e",
                          }}
                        >
                          override / 追加
                        </th>
                        {(["normal", "daily", "travel"] as ModeKey[]).map((m) => {
                          const target = cells.find((c) => c.mode === m);
                          const note = target?.cell.overrideNote ?? "—";
                          return (
                            <td
                              key={m}
                              style={{
                                border: "1px solid #c8c8dc",
                                padding: "4px 6px",
                                background:
                                  note !== "—" ? "#fff7ed" : "#ffffff",
                                color: note !== "—" ? "#92400e" : "#c8c8dc",
                                fontSize: 10,
                              }}
                            >
                              {note}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* §4.4 状態優先切替の例外 (A3 visual demo) */}
      <details
        style={{
          marginTop: 12,
          fontSize: 12,
          background: "#fef3c7",
          border: "1px solid #fbbf24",
          borderRadius: 6,
          padding: "8px 12px",
        }}
      >
        <summary style={{ cursor: "pointer", color: "#92400e", fontWeight: 600 }}>
          状態優先切替の例外 (UI spec §4.4 / §1.3 A3、対象: {STATE_PRIORITY_EXCEPTION.applicableStates.join(" / ")})
        </summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "#78350f" }}>
          {STATE_PRIORITY_EXCEPTION.notes.map((n) => (
            <li key={n} style={{ marginBottom: 4 }}>
              {n}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function RowAttr({
  label,
  cells,
  accessor,
}: {
  label: string;
  cells: ReturnType<typeof getMatrix>;
  accessor: (c: ReturnType<typeof getMatrix>[number]) => string;
}) {
  const normal = cells.find((c) => c.mode === "normal");
  const daily = cells.find((c) => c.mode === "daily");
  const travel = cells.find((c) => c.mode === "travel");
  return (
    <tr>
      <th
        style={{
          border: "1px solid #c8c8dc",
          padding: "4px 6px",
          background: "#f5f6fa",
          textAlign: "left",
          fontSize: 11,
          color: "#4a4a68",
        }}
      >
        {label}
      </th>
      {[normal, daily, travel].map((c, i) => {
        const m: ModeKey = ["normal", "daily", "travel"][i] as ModeKey;
        const value = c ? accessor(c) : "—";
        const sameAsNormal =
          c && c.mode !== "normal" && normal && accessor(c) === accessor(normal);
        return (
          <td
            key={m}
            style={{
              border: "1px solid #c8c8dc",
              padding: "4px 6px",
              fontSize: 10,
              color: sameAsNormal ? "#8888a0" : "#1a1a2e",
            }}
          >
            {sameAsNormal ? "= 通常" : value}
          </td>
        );
      })}
    </tr>
  );
}
