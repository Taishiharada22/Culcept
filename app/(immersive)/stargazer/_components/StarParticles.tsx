// app/stargazer/_components/StarParticles.tsx
// 白背景の朝の観測空間 — 微細な銀・淡金・淡ブルーの星粒
"use client";

// ── Layer 1: 遠い微光星（淡いシルバー粒）──
const distantStars = Array.from({ length: 50 }, (_, i) => ({
  id: `d${i}`,
  x: ((i * 41 + 17) % 99) + 0.5,
  y: ((i * 59 + 11) % 97) + 1,
  size: 0.8 + (i % 3) * 0.4,
  opacity: 0.08 + (i % 5) * 0.04,
  color:
    i % 6 === 0
      ? "rgba(140,160,200,VAR)" // 淡いブルー
      : i % 4 === 0
        ? "rgba(190,170,130,VAR)" // 淡いゴールド
        : "rgba(160,165,185,VAR)", // シルバー
}));

// ── Layer 2: 中間星（ごく淡い瞬き）──
const midStars = Array.from({ length: 22 }, (_, i) => ({
  id: `m${i}`,
  x: ((i * 37 + 23) % 97) + 1,
  y: ((i * 53 + 7) % 93) + 3,
  size: 1.2 + (i % 3) * 0.5,
  duration: (i % 5) + 5,
  delay: (i % 7) + (i % 3) * 0.5,
  color:
    i % 5 === 0
      ? "rgba(190,170,110,0.25)" // 淡い金
      : i % 4 === 0
        ? "rgba(150,170,210,0.22)" // 淡いブルー
        : i % 3 === 0
          ? "rgba(180,165,130,0.2)" // ウォーム
          : "rgba(170,175,195,0.18)", // シルバー
}));

// ── Layer 3: 明るい恒星（少数・ごく淡いグロー）──
const brightStars = [
  { id: "b0", x: 15, y: 8, size: 2.0, color: "rgba(190,170,110,0.35)", glowColor: "rgba(190,170,110,0.06)", duration: 7, delay: 0 },
  { id: "b1", x: 78, y: 12, size: 1.8, color: "rgba(150,170,210,0.3)", glowColor: "rgba(150,170,210,0.05)", duration: 8, delay: 2 },
  { id: "b2", x: 45, y: 5, size: 1.6, color: "rgba(185,165,125,0.28)", glowColor: "rgba(185,165,125,0.04)", duration: 6, delay: 1 },
  { id: "b3", x: 92, y: 25, size: 1.8, color: "rgba(170,165,200,0.25)", glowColor: "rgba(170,165,200,0.04)", duration: 9, delay: 3 },
  { id: "b4", x: 8, y: 35, size: 1.4, color: "rgba(195,180,120,0.22)", glowColor: "rgba(195,180,120,0.03)", duration: 7, delay: 4 },
  { id: "b5", x: 62, y: 18, size: 1.6, color: "rgba(155,175,210,0.28)", glowColor: "rgba(155,175,210,0.04)", duration: 8, delay: 1.5 },
];

export default function StarParticles() {
  return (
    <div
      className="star-particles fixed inset-0 pointer-events-none z-[2]"
      style={{
        maskImage:
          "linear-gradient(180deg, black 0%, black 50%, transparent 75%)",
        WebkitMaskImage:
          "linear-gradient(180deg, black 0%, black 50%, transparent 75%)",
      }}
    >
      {/* Distant stars — static, faint shimmer */}
      {distantStars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full star-distant"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: s.color.replace("VAR", String(s.opacity)),
          }}
        />
      ))}

      {/* Mid-layer stars — gentle twinkling */}
      {midStars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full star-mid"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            background: s.color,
            animation: `sg-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}

      {/* Bright stars — with subtle glow halo */}
      {brightStars.map((s) => (
        <div
          key={s.id}
          className="absolute star-bright"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
          }}
        >
          {/* Glow halo */}
          <div
            className="absolute rounded-full"
            style={{
              width: `${s.size * 10}px`,
              height: `${s.size * 10}px`,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${s.glowColor} 0%, transparent 70%)`,
              animation: `sg-twinkle-bright ${s.duration}s ease-in-out ${s.delay}s infinite`,
            }}
          />
          {/* Star core */}
          <div
            className="absolute rounded-full"
            style={{
              width: `${s.size}px`,
              height: `${s.size}px`,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: s.color,
              boxShadow: `0 0 ${s.size * 3}px ${s.glowColor}`,
              animation: `sg-twinkle-bright ${s.duration}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
