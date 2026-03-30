"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface Props {
  rendezvousCandidates?: number;
  unreadTalkCount?: number;
  /** Teaser: shared axis label for anonymous candidate preview */
  sharedAxisHint?: string;
  /** Teaser: latest message preview (first 20 chars) */
  latestMessagePreview?: string;
}

export default function ConnectionZone({
  rendezvousCandidates = 0,
  unreadTalkCount = 0,
  sharedAxisHint,
  latestMessagePreview,
}: Props) {
  return (
    <section className="px-4 space-y-3">
      <h2 className="text-sm font-bold" style={{ color: "#1a1a2e" }}>
        つながり
      </h2>

      <div className="flex gap-3">
        {/* Rendezvous */}
        <motion.div
          className="flex-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Link
            href="/rendezvous"
            className="block"
            style={{
              borderRadius: 16,
              background: "linear-gradient(145deg, #FFF5F5 0%, #ffffff 60%, #FFE8E4 100%)",
              border: "1.5px solid rgba(239,68,68,0.15)",
              boxShadow: "0 2px 8px rgba(239,68,68,0.08)",
              padding: "14px 12px",
              textDecoration: "none",
              color: "inherit",
              transition: "transform 0.2s",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">∞</span>
              <span className="text-xs font-bold" style={{ color: "#1a1a2e" }}>Rendezvous</span>
            </div>
            {rendezvousCandidates > 0 ? (
              <>
                <p className="text-xs" style={{ color: "#EF4444" }}>
                  新しい候補が{rendezvousCandidates}人いるよ
                </p>
                {sharedAxisHint && (
                  <p className="text-[11px] mt-1" style={{ color: "#8888a0" }}>
                    {sharedAxisHint}が似てる人がいるよ
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs" style={{ color: "#8888a0" }}>
                Genome Cardを作ると出会いが始まるよ
              </p>
            )}
          </Link>
        </motion.div>

        {/* Talk */}
        <motion.div
          className="flex-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.18 }}
        >
          <Link
            href="/talk"
            className="block"
            style={{
              borderRadius: 16,
              background: "linear-gradient(145deg, #F5F3FF 0%, #ffffff 60%, #EDE9FE 100%)",
              border: "1.5px solid rgba(139,92,246,0.15)",
              boxShadow: "0 2px 8px rgba(139,92,246,0.08)",
              padding: "14px 12px",
              textDecoration: "none",
              color: "inherit",
              transition: "transform 0.2s",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">💬</span>
              <span className="text-xs font-bold" style={{ color: "#1a1a2e" }}>トーク</span>
            </div>
            {unreadTalkCount > 0 ? (
              <>
                <p className="text-xs" style={{ color: "#8B5CF6" }}>
                  未読: {unreadTalkCount}件
                </p>
                {latestMessagePreview && (
                  <p className="text-[11px] mt-1 truncate" style={{ color: "#8888a0", maxWidth: 140 }}>
                    {latestMessagePreview}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs" style={{ color: "#8888a0" }}>
                メッセージ
              </p>
            )}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
