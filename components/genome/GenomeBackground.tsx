"use client";

const FLOAT_KEYFRAMES = `
@keyframes genome-float {
  0% { transform: translateY(0); }
  100% { transform: translateY(-8px); }
}
@keyframes genome-pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.3); }
}
@keyframes genome-breathe {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(1.15); opacity: 0.5; }
}
@keyframes genome-spiral-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes radar-gap-pulse {
  0%, 100% { stroke-opacity: 0.3; }
  50% { stroke-opacity: 0.8; }
}
`;

const DOTS = [
  { left: "11%", top: "24%", size: "h-3 w-3", color: "bg-violet-300", delay: 0 },
  { left: "18%", top: "72%", size: "h-2.5 w-2.5", color: "bg-sky-300", delay: 1 },
  { left: "46%", top: "30%", size: "h-2.5 w-2.5", color: "bg-fuchsia-300", delay: 2 },
  { right: "16%", top: "18%", size: "h-3 w-3", color: "bg-pink-300", delay: 3 },
  { right: "22%", top: "64%", size: "h-2.5 w-2.5", color: "bg-violet-300", delay: 4 },
  { right: "34%", top: "82%", size: "h-2 w-2", color: "bg-emerald-300", delay: 5 },
  { left: "32%", top: "12%", size: "h-2 w-2", color: "bg-sky-200", delay: 6 },
  { left: "62%", top: "56%", size: "h-2.5 w-2.5", color: "bg-violet-200", delay: 7 },
  { right: "8%", top: "42%", size: "h-2 w-2", color: "bg-fuchsia-200", delay: 8 },
  { left: "7%", top: "50%", size: "h-3.5 w-3.5", color: "bg-pink-200", delay: 9 },
  { right: "42%", top: "10%", size: "h-2 w-2", color: "bg-emerald-200", delay: 10 },
  { left: "54%", top: "88%", size: "h-2.5 w-2.5", color: "bg-sky-300", delay: 11 },
];

export default function GenomeBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{FLOAT_KEYFRAMES}</style>

      <div
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(180deg, #fcfdff 0%, #fbfcff 48%, #fffdfa 100%)",
            "radial-gradient(70% 120% at 0% 50%, rgba(147,197,253,0.28), transparent 58%)",
            "radial-gradient(62% 115% at 100% 18%, rgba(244,114,182,0.20), transparent 56%)",
            "radial-gradient(42% 28% at 43% 86%, rgba(187,247,208,0.22), transparent 62%)",
            "radial-gradient(38% 26% at 66% 90%, rgba(253,230,138,0.16), transparent 64%)",
          ].join(","),
        }}
      />

      <div className="absolute inset-y-0 left-0 w-[22vw] bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.55),rgba(255,255,255,0))] opacity-70" />
      <div className="absolute inset-y-0 right-0 w-[24vw] bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.5),rgba(255,255,255,0))] opacity-70" />

      <div className="absolute inset-0 opacity-[0.18]">
        {DOTS.map((dot, i) => (
          <div
            key={i}
            className={`absolute rounded-full ${dot.size} ${dot.color} blur-[1px]`}
            style={{
              left: dot.left,
              right: dot.right,
              top: dot.top,
              animation: `genome-float ${3 + i * 0.5}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute bottom-[12%] left-1/2 h-[300px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.76),rgba(255,255,255,0.22),transparent_72%)] blur-3xl" />
    </div>
  );
}
