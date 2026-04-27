"use client";

/**
 * Pattern picker UI (L1-c)
 *
 * 正本: layout plan v0.2 §4.3 / UI spec §7.10 合成規則 / §7.12 Pattern→State 許可 matrix
 *
 * 7 Pattern variant の切替 + 各 Pattern の文面カード mount。
 * Pattern→State 許可 matrix (9 state × 7 pattern = 63 セル) を視覚化。
 *
 * 本 component は scaffold (L1-c)。permission logic は Stage 2 patternSelector (L2-d) で実装。
 */

import { useState } from "react";
import { PATTERN_MOCKS, type PatternVariant } from "../mock/patterns";
import PatternA from "./patterns/PatternA";
import PatternB from "./patterns/PatternB";
import PatternC from "./patterns/PatternC";
import PatternD from "./patterns/PatternD";
import PatternE from "./patterns/PatternE";
import PatternF1 from "./patterns/PatternF1";
import PatternF2 from "./patterns/PatternF2";

const PRESENCE_STATES = [
  "S0",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
] as const;

type State = (typeof PRESENCE_STATES)[number];

function PatternRenderer({ variant }: { variant: PatternVariant }) {
  switch (variant) {
    case "A":
      return <PatternA />;
    case "B":
      return <PatternB />;
    case "C":
      return <PatternC />;
    case "D":
      return <PatternD />;
    case "E":
      return <PatternE />;
    case "F-1":
      return <PatternF1 />;
    case "F-2":
      return <PatternF2 />;
  }
}

export default function PatternPicker() {
  const [selected, setSelected] = useState<PatternVariant>("A");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Pattern picker buttons */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {PATTERN_MOCKS.map((p) => (
          <button
            key={p.variant}
            onClick={() => setSelected(p.variant)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              border: "1px solid",
              borderColor: selected === p.variant ? "#6366F1" : "#e8e8ec",
              background: selected === p.variant ? "#6366F1" : "#ffffff",
              color: selected === p.variant ? "#ffffff" : "#1a1a2e",
              borderRadius: 6,
              cursor: "pointer",
              minWidth: 44,
            }}
          >
            {p.variant}
          </button>
        ))}
      </div>

      {/* Pattern card */}
      <div>
        <PatternRenderer variant={selected} />
      </div>

      {/* Pattern → State 許可 matrix (UI spec §7.12) */}
      <details style={{ fontSize: 12 }}>
        <summary style={{ cursor: "pointer", color: "#4a4a68" }}>
          Pattern → State 許可 matrix (UI spec §7.12、9 × 7 = 63 セル)
        </summary>
        <table
          style={{
            marginTop: 8,
            borderCollapse: "collapse",
            fontSize: 11,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  border: "1px solid #c8c8dc",
                  padding: "4px 8px",
                  background: "#f5f6fa",
                  textAlign: "left",
                }}
              >
                Pattern \ State
              </th>
              {PRESENCE_STATES.map((s) => (
                <th
                  key={s}
                  style={{
                    border: "1px solid #c8c8dc",
                    padding: "4px 8px",
                    background: "#f5f6fa",
                  }}
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PATTERN_MOCKS.map((p) => (
              <tr key={p.variant}>
                <th
                  style={{
                    border: "1px solid #c8c8dc",
                    padding: "4px 8px",
                    background: "#f5f6fa",
                    textAlign: "left",
                  }}
                >
                  {p.variant}
                </th>
                {PRESENCE_STATES.map((s) => {
                  const allowed = p.allowedStates.includes(s as State);
                  return (
                    <td
                      key={s}
                      style={{
                        border: "1px solid #c8c8dc",
                        padding: "4px 8px",
                        textAlign: "center",
                        background: allowed ? "#e0e7ff" : "#ffffff",
                        color: allowed ? "#6366F1" : "#c8c8dc",
                        fontWeight: allowed ? 600 : 400,
                      }}
                      aria-label={`${p.variant} × ${s}: ${allowed ? "許可" : "禁止"}`}
                    >
                      {allowed ? "○" : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            color: "#8888a0",
          }}
        >
          ○ = 許可、— = 禁止 (実機 logic は Stage 2 patternSelector L2-d で実装)
        </div>
      </details>
    </div>
  );
}
