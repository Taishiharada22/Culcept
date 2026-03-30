"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  RV_COLORS,
  RvCard,
} from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import SuccessStoriesCarousel from "@/components/rendezvous/SuccessStoriesCarousel";
import ReferralShareCard from "@/components/rendezvous/ReferralShareCard";

// =============================================================================
// Types
// =============================================================================

type FeedItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  createdAt: string;
};

type RecommendedAction = {
  id: string;
  icon: string;
  title: string;
  description: string;
  actionPath: string;
};

type Props = {
  feedPreview: FeedItem[];
  recommendedAction: RecommendedAction | null;
};

// =============================================================================
// Quick link items
// =============================================================================

const DISCOVER_LINKS = [
  { href: "/rendezvous/explore", icon: "\u2666", label: "候補を探す", desc: "新しい出会いを発見" },
  { href: "/rendezvous/topic", icon: "\u270E", label: "お題に答える", desc: "今日の話題に参加" },
  { href: "/rendezvous/topic/gallery", icon: "\u25C7", label: "ギャラリー", desc: "みんなの回答を見る" },
  { href: "/genome-card", icon: "\u2742", label: "Genome Card", desc: "性格・価値観カード" },
  { href: "/rendezvous/universe", icon: "\u2726", label: "宇宙", desc: "つながりのフィード" },
  { href: "/rendezvous/live", icon: "\u26A1", label: "ライブ", desc: "リアルタイムセッション" },
  { href: "/rendezvous/mission", icon: "\u2605", label: "ミッション", desc: "深化クエスト" },
] as const;

// =============================================================================
// DiscoverTab: 発見 -- Explore + stories + community
// =============================================================================

export default function DiscoverTab({
  feedPreview,
  recommendedAction,
}: Props) {
  return (
    <div className="flex flex-col">
      {/* Recommended action */}
      {recommendedAction && (
        <FadeInView delay={0}>
          <div className="px-5 pt-4 pb-2">
            <Link href={recommendedAction.actionPath} className="no-underline">
              <RvCard elevated>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{
                      background: RV_COLORS.gradientSubtle,
                    }}
                  >
                    <span className="text-xl">{recommendedAction.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: RV_COLORS.text }}>
                      {recommendedAction.title}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: RV_COLORS.textSub }}>
                      {recommendedAction.description}
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: RV_COLORS.textMuted }}>&#x203A;</span>
                </div>
              </RvCard>
            </Link>
          </div>
        </FadeInView>
      )}

      {/* Quick links grid */}
      <FadeInView delay={0.05}>
        <div className="px-5 pt-4">
          <p
            className="text-xs font-bold mb-3 tracking-wider uppercase"
            style={{ color: RV_COLORS.textMuted }}
          >
            探索する
          </p>
          <div className="grid grid-cols-3 gap-2">
            {DISCOVER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="no-underline">
                <motion.div
                  className="rounded-2xl p-3 text-center"
                  style={{
                    background: RV_COLORS.surface,
                    border: `1px solid ${RV_COLORS.border}`,
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  <span className="text-lg block mb-1">{link.icon}</span>
                  <p className="text-[11px] font-bold" style={{ color: RV_COLORS.text }}>
                    {link.label}
                  </p>
                  <p className="text-[9px] mt-0.5" style={{ color: RV_COLORS.textMuted }}>
                    {link.desc}
                  </p>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      </FadeInView>

      {/* Success stories */}
      <FadeInView delay={0.1}>
        <div className="px-5 mt-6">
          <p
            className="text-xs font-bold mb-3 tracking-wider uppercase"
            style={{ color: RV_COLORS.textMuted }}
          >
            成功ストーリー
          </p>
          <SuccessStoriesCarousel />
        </div>
      </FadeInView>

      {/* Community resonance stats */}
      <FadeInView delay={0.15}>
        <div className="px-5 mt-6">
          <RvCard>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-lg">&#x2728;</span>
              <p className="text-xs font-bold" style={{ color: RV_COLORS.text }}>
                コミュニティの共鳴
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <motion.p
                  className="text-xl font-black"
                  style={{ color: RV_COLORS.primary }}
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  24
                </motion.p>
                <p className="text-[10px] mt-0.5" style={{ color: RV_COLORS.textMuted }}>
                  今日の接触
                </p>
              </div>
              <div className="text-center">
                <motion.p
                  className="text-xl font-black"
                  style={{ color: RV_COLORS.accent }}
                >
                  7
                </motion.p>
                <p className="text-[10px] mt-0.5" style={{ color: RV_COLORS.textMuted }}>
                  今週の共鳴
                </p>
              </div>
              <div className="text-center">
                <motion.p
                  className="text-xl font-black"
                  style={{ color: RV_COLORS.secondary }}
                >
                  156
                </motion.p>
                <p className="text-[10px] mt-0.5" style={{ color: RV_COLORS.textMuted }}>
                  参加者
                </p>
              </div>
            </div>
          </RvCard>
        </div>
      </FadeInView>

      {/* Referral card */}
      <FadeInView delay={0.2}>
        <div className="px-5 mt-6 mb-4">
          <ReferralShareCard />
        </div>
      </FadeInView>
    </div>
  );
}
