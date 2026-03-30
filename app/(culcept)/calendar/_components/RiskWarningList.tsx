"use client";

import type { RiskWarning } from "../_lib/types";

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  high:   { bg: "bg-red-50/60",   text: "text-red-600",   border: "border-red-200/40",   icon: "⚠️" },
  medium: { bg: "bg-amber-50/60", text: "text-amber-600", border: "border-amber-200/40", icon: "⚡" },
  low:    { bg: "bg-blue-50/60",  text: "text-blue-600",  border: "border-blue-200/40",  icon: "💡" },
};

export default function RiskWarningList({ risks }: { risks: RiskWarning[] }) {
  if (risks.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase">Mismatch Alert</p>
      {risks.map((risk, i) => {
        const style = SEVERITY_STYLES[risk.severity] ?? SEVERITY_STYLES.low;
        return (
          <div key={i} className={`flex items-start gap-2 rounded-xl ${style.bg} border ${style.border} backdrop-blur-sm px-3 py-2`}>
            <span className="text-sm shrink-0">{style.icon}</span>
            <p className={`text-[10px] ${style.text} font-medium leading-relaxed`}>{risk.message}</p>
          </div>
        );
      })}
    </div>
  );
}
