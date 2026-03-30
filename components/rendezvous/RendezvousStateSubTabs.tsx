"use client";
import type { RendezvousListTab } from "@/lib/rendezvous/types";

const TABS: { key: RendezvousListTab; label: string }[] = [
  { key: "new", label: "新しい交差" },
  { key: "waiting", label: "応答待ち" },
  { key: "saved", label: "保留中" },
  { key: "conversations", label: "会話" },
];

type Props = {
  activeTab: RendezvousListTab;
  onChange: (tab: RendezvousListTab) => void;
  contextColor: string;
};

export default function RendezvousStateSubTabs({ activeTab, onChange, contextColor }: Props) {
  return (
    <div style={{
      display: "flex",
      gap: 2,
      padding: 2,
      borderRadius: 10,
      background: "rgba(255,255,255,0.5)",
      border: "1px solid rgba(30,30,60,0.04)",
    }}>
      {TABS.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              flex: 1,
              padding: "7px 4px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              background: active ? `${contextColor}0a` : "transparent",
              color: active ? contextColor : "rgba(30,30,60,0.35)",
              transition: "all 0.25s ease",
              boxShadow: active ? `0 1px 3px ${contextColor}10` : "none",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
