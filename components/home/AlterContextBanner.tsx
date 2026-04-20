"use client";

import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import AneurasyncLogo from "@/components/ui/AneurasyncLogo";

/**
 * AlterContextBanner
 * AskHero から遷移してきた時だけ表示する 1行の文脈バナー。
 * `?from=alter` がある時のみ描画。主役UIには干渉しない。
 */

const PAGE_MESSAGES: Record<string, string> = {
  origin: "Alterの判断をここに残せます",
  calendar: "Alterの提案を、今日の予定に落とし込めます",
  stargazer: "Alterの判断を、ここでもう少し深く見ていけます",
};

interface Props {
  /** このページの識別子（origin / calendar / stargazer） */
  page: "origin" | "calendar" | "stargazer";
}

export default function AlterContextBanner({ page }: Props) {
  const searchParams = useSearchParams();
  const fromAlter = searchParams.get("from") === "alter";

  if (!fromAlter) return null;

  const message = PAGE_MESSAGES[page];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="flex items-center gap-2 px-4 py-2"
      style={{
        background: "rgba(99,102,241,0.06)",
        borderBottom: "1px solid rgba(99,102,241,0.10)",
      }}
    >
      <AneurasyncLogo size={15} color="#6366F1" />
      <span className="text-[11px] font-medium" style={{ color: "#4338CA", opacity: 0.75 }}>
        {message}
      </span>
    </motion.div>
  );
}
