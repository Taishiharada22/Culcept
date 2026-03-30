"use client";

import { motion } from "framer-motion";

const shimmerClass =
  "bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]";

export default function GenomeLoadingSkeleton() {
  return (
    <div
      className="space-y-6 px-5 pb-28 pt-14"
      role="status"
      aria-label="読み込み中"
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Helix placeholder */}
      <div className="mx-auto flex h-[340px] max-w-[640px] items-center justify-center rounded-[32px] border border-white/85 bg-white/76 shadow-[0_18px_48px_rgba(148,163,184,0.14)] backdrop-blur-xl">
        <motion.div
          className="h-10 w-10 rounded-full"
          style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899)" }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Tab placeholder */}
      <div className="mx-auto grid max-w-[640px] grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-16 rounded-[24px] ${shimmerClass}`}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      {/* Content skeleton - matches actual page layout */}
      <div className="mx-auto max-w-[640px] space-y-4">
        {/* Title area */}
        <div className="rounded-[32px] border border-white/85 bg-white/76 p-7 backdrop-blur-xl">
          <div className={`mx-auto h-6 w-48 rounded-full ${shimmerClass}`} />
          <div className={`mx-auto mt-3 h-4 w-64 rounded-full ${shimmerClass}`} style={{ animationDelay: "0.1s" }} />
          <div className={`mt-6 h-44 rounded-[24px] ${shimmerClass}`} style={{ animationDelay: "0.2s" }} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-20 rounded-[20px] ${shimmerClass}`}
              style={{ animationDelay: `${0.3 + i * 0.1}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
