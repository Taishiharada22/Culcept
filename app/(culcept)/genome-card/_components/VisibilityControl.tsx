"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { VisibilityLevel } from "@/lib/genome/cardTypes";

const C = { s1: "#ffffff", s2: "#f5f6fa", t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc", neural: "#8B5CF6", pulse: "#EC4899" };

const LEVELS: { value: VisibilityLevel; label: string; name: string; description: string; detail: string }[] = [
  { value: 1, label: "🤝", name: "名刺", description: "はじめましての距離感", detail: "タイプ名・モットー" },
  { value: 2, label: "💬", name: "会話", description: "もう少し知りたい", detail: "レーダー・強み・名言" },
  { value: 3, label: "🔓", name: "信頼", description: "この人には見せていい", detail: "恋愛・独白・すべて" },
];

interface Props {
  connectionId: string;
  currentLevel: VisibilityLevel;
  onChanged?: (level: VisibilityLevel) => void;
}

export default function VisibilityControl({ connectionId, currentLevel, onChanged }: Props) {
  const [level, setLevel] = useState(currentLevel);
  const [saving, setSaving] = useState(false);

  const handleChange = async (newLevel: VisibilityLevel) => {
    if (newLevel === level) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/genome-connections/${connectionId}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: newLevel }),
      });
      if (res.ok) {
        setLevel(newLevel);
        onChanged?.(newLevel);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <p style={{ fontSize: 10, fontWeight: 500, color: C.t3 }}>公開レベル</p>
      <div className="flex gap-1.5">
        {LEVELS.map((l) => {
          const isActive = level === l.value;
          return (
            <motion.button
              key={l.value}
              onClick={() => handleChange(l.value)}
              disabled={saving}
              whileTap={{ scale: 0.95 }}
              className="relative flex-1 py-2.5 px-1 rounded-xl text-center transition-all"
              style={{
                background: isActive
                  ? `linear-gradient(135deg, ${C.neural}, ${C.pulse})`
                  : C.s2,
                boxShadow: isActive ? `0 4px 12px ${C.neural}30` : "none",
                opacity: saving ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: 14, display: "block" }}>{l.label}</span>
              <span style={{
                fontSize: 10, fontWeight: isActive ? 600 : 400, display: "block", marginTop: 2,
                color: isActive ? "white" : C.t2,
              }}>
                {l.name}
              </span>
              <span style={{
                fontSize: 7, display: "block", marginTop: 1,
                color: isActive ? "rgba(255,255,255,0.6)" : C.t4,
              }}>
                {l.detail}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
