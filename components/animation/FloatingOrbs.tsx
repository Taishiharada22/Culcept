// components/animation/FloatingOrbs.tsx
// Stub: floating ambient orbs animation component
"use client";

export default function FloatingOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, #a78bfa 0%, transparent 70%)" }}
      />
      <div
        className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, #f472b6 0%, transparent 70%)" }}
      />
    </div>
  );
}
