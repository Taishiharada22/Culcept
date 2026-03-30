"use client";

/**
 * ReadReceipt
 * メッセージの送信状態を視覚的に表示
 * - 単一チェック (送信済み)
 * - ダブルチェック (配信済み)
 * - 青色ダブルチェック (既読)
 *
 * コンパクトにタイムスタンプの横に表示する
 */

import { motion } from "framer-motion";

export type ReceiptStatus = "sending" | "sent" | "delivered" | "read";

type Props = {
  status: ReceiptStatus;
  /** コンパクト表示時のサイズ */
  size?: number;
};

function CheckIcon({
  filled,
  size,
}: {
  filled: boolean;
  size: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <motion.path
        d="M3 8.5L6.5 12L13 4"
        stroke={filled ? "#6366F1" : "currentColor"}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
    </svg>
  );
}

function DoubleCheckIcon({
  filled,
  size,
}: {
  filled: boolean;
  size: number;
}) {
  const color = filled ? "#6366F1" : "currentColor";
  return (
    <svg
      width={size + 4}
      height={size}
      viewBox="0 0 20 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 1つ目のチェック（後ろ） */}
      <motion.path
        d="M1 8.5L4.5 12L11 4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
      {/* 2つ目のチェック（前） */}
      <motion.path
        d="M6 8.5L9.5 12L16 4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.25, delay: 0.1, ease: "easeOut" }}
      />
    </svg>
  );
}

export default function ReadReceipt({ status, size = 12 }: Props) {
  if (status === "sending") {
    // 送信中: 時計アイコン
    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: "rgba(30,30,60,0.3)",
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle
            cx={8}
            cy={8}
            r={6}
            stroke="currentColor"
            strokeWidth={1.5}
          />
          <path
            d="M8 5V8.5L10.5 10"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      </motion.span>
    );
  }

  if (status === "sent") {
    // 送信済み: 単一チェック（グレー）
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: "rgba(30,30,60,0.3)",
        }}
      >
        <CheckIcon filled={false} size={size} />
      </span>
    );
  }

  if (status === "delivered") {
    // 配信済み: ダブルチェック（グレー）
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: "rgba(30,30,60,0.3)",
        }}
      >
        <DoubleCheckIcon filled={false} size={size} />
      </span>
    );
  }

  // 既読: ダブルチェック（ブルー/インディゴ）
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <DoubleCheckIcon filled={true} size={size} />
    </span>
  );
}
