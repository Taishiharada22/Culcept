"use client";

const particles = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: ((i * 37 + 13) % 97) + 1,
  y: ((i * 53 + 7) % 93) + 3,
  size: Math.min((i % 3) + 1, 2.5), // max 2.5px
  duration: (i % 4) + 3,
  delay: (i % 5) + (i % 3),
}));

export default function StarParticles() {
  return (
    <div className="star-particles fixed inset-0 pointer-events-none z-[1]">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            // わずかにamber寄り — 「観測装置のセンサーが拾った光」
            background: "rgba(251, 220, 150, 0.7)",
            animation: `twinkle ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
