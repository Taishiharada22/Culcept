// app/stargazer/_components/SimulationCards.tsx
// シミュレーションカード — 観測データで、試してみる
"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

const SIMULATIONS = [
  {
    id: "love",
    emoji: "💕",
    title: "恋愛シミュレーション",
    hook: "いま気になる人がいたら、あなたはどう動く？",
    color: "#f472b6",
    bgColor: "rgba(244,114,182,0.06)",
    borderColor: "rgba(244,114,182,0.15)",
  },
  {
    id: "friends",
    emoji: "🧩",
    title: "友人シミュレーション",
    hook: "この人とは合う？ その理由は？",
    color: "#b0a060",
    bgColor: "rgba(190,170,110,0.06)",
    borderColor: "rgba(190,170,110,0.15)",
  },
  {
    id: "message",
    emoji: "💬",
    title: "メッセージシミュレーション",
    hook: '既読スルー？ 即レス？ あなたの\u201C間\u201Dの正体',
    color: "#60a5fa",
    bgColor: "rgba(96,165,250,0.06)",
    borderColor: "rgba(96,165,250,0.15)",
  },
] as const;

export default function SimulationCards() {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(to right, rgba(160,170,200,0.15), transparent)",
          }}
        />
        <span
          className="font-mono-sg text-xs tracking-[0.25em] uppercase font-medium"
          style={{ color: "rgba(100,105,130,0.5)" }}
        >
          観測データで、試してみる
        </span>
        <div
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(to left, rgba(160,170,200,0.15), transparent)",
          }}
        />
      </div>

      <div className="grid gap-3">
        {SIMULATIONS.map((sim, i) => (
          <motion.button
            key={sim.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06, duration: 0.22 }}
            whileHover={{ y: -1 }}
            onClick={() => router.push(`/stargazer/simulation?type=${sim.id}`)}
            className="w-full rounded-xl p-5 text-left transition-all group cursor-pointer"
            style={{
              background: sim.bgColor,
              border: `1px solid ${sim.borderColor}`,
            }}
          >
            <div className="flex items-start gap-4">
              <span
                className="text-2xl flex-shrink-0"
                style={{
                  filter: `drop-shadow(0 0 8px ${sim.color}40)`,
                }}
              >
                {sim.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <h4
                  className="font-body text-sm font-semibold mb-1"
                  style={{ color: sim.color }}
                >
                  {sim.title}
                </h4>
                <p
                  className="font-body text-sm leading-relaxed"
                  style={{ color: "rgba(100,105,130,0.6)" }}
                >
                  {sim.hook}
                </p>
              </div>
              <motion.span
                className="text-sm flex-shrink-0 mt-1 opacity-40 group-hover:opacity-70 transition-opacity"
                style={{ color: sim.color }}
                animate={{ x: [0, 2, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                →
              </motion.span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
