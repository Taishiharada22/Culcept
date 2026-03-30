"use client";

import type { SectionId } from "@/types/face-phenotype";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { id: "skeletal", label: "骨格", icon: "🫥" },
  { id: "impression", label: "印象", icon: "👃" },
  { id: "hair", label: "ヘア", icon: "💇" },
  { id: "overall", label: "全体", icon: "✨" },
];

interface Props {
  active: SectionId;
  completed: Set<SectionId>;
  onChange: (section: SectionId) => void;
}

export default function CategoryNav({ active, completed, onChange }: Props) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-4">
      {SECTIONS.map((s, i) => {
        const isDone = completed.has(s.id);
        const isActive = active === s.id;
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <button
              onClick={() => onChange(s.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? "bg-amber-500/15 text-amber-600 border border-amber-500/40"
                  : isDone
                    ? "bg-green-500/10 text-green-600 border border-green-500/20"
                    : "bg-white/60 text-slate-500 border border-slate-200 hover:border-slate-300"
              }`}
            >
              <span>{isDone ? "✓" : s.icon}</span>
              <span>{s.label}</span>
            </button>
            {i < SECTIONS.length - 1 && (
              <div
                className={`w-3 h-[1.5px] ${
                  isDone ? "bg-green-500/30" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
