// app/stargazer/_shared/SectionHeader.tsx
// 共通セクションヘッダー
"use client";

interface SectionHeaderProps {
  label: string;
  sublabel?: string;
  icon?: string;
  accentColor?: string;
}

export default function SectionHeader({
  label,
  sublabel,
  icon,
  accentColor = "rgba(170,150,90,0.55)",
}: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon && <span className="text-lg">{icon}</span>}
      <div>
        <h3
          className="font-display text-base font-medium"
          style={{ color: "rgba(30,35,55,0.85)" }}
        >
          {label}
        </h3>
        {sublabel && (
          <span
            className="font-mono-sg text-xs tracking-widest"
            style={{ color: accentColor, fontSize: "0.81rem", letterSpacing: "0.12em" }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
