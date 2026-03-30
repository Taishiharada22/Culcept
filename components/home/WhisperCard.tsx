"use client";

// WhisperCard — セッション間の概日リズム連動ウィスパー
// 変動間隔強化: 不定期の報酬で「何か来てるかも」と確認癖を作る
// 朝: 予言配信 / 昼: パターン異常 / 夕: 時間帯比較 / 夜: カウントダウン

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getTimeOfDayDetail } from "@/lib/shared/timeOfDay";

type WhisperType = "prophecy" | "pattern" | "reflection" | "countdown" | "curiosity" | "implicit_signal";

interface Whisper {
  type: WhisperType;
  message: string;
  icon: string;
  color: string;
  /** アクションリンク */
  href?: string;
  actionLabel?: string;
}

interface WhisperCardProps {
  /** 累計観測回数 */
  observationCount: number;
  /** 消えるインサイトの残時間 */
  vanishingHoursLeft?: number;
  /** 予言テキスト（あれば） */
  prophecyText?: string;
  /** ストリーク日数 */
  streakDays?: number;
  /** 暗黙的シグナルからの行動フィードバック */
  implicitSignalMessage?: string | null;
  className?: string;
}

const WHISPER_KEY = "stargazer_whisper_seen_v1";

function hasSeenWhisperThisHour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(WHISPER_KEY);
    if (!raw) return false;
    const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    return raw === hourKey;
  } catch {
    return false;
  }
}

function markWhisperSeen(): void {
  if (typeof window === "undefined") return;
  try {
    const hourKey = new Date().toISOString().slice(0, 13);
    localStorage.setItem(WHISPER_KEY, hourKey);
  } catch {
    // ignore
  }
}

const IMPLICIT_WHISPER_KEY = "stargazer_implicit_whisper_date_v1";

function canShowImplicitWhisper(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const dateKey = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(IMPLICIT_WHISPER_KEY) !== dateKey;
  } catch { return false; }
}

function markImplicitWhisperShown(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IMPLICIT_WHISPER_KEY, new Date().toISOString().slice(0, 10));
  } catch { /* ignore */ }
}

function generateWhisper(props: WhisperCardProps): Whisper | null {
  const tod = getTimeOfDayDetail();
  const { observationCount, vanishingHoursLeft, prophecyText, streakDays, implicitSignalMessage } = props;

  // 暗黙的シグナルフィードバック（1日1回、他のwhisperより低優先）
  // ただし afternoon/evening に限定（内省的な時間帯）
  if (
    implicitSignalMessage &&
    canShowImplicitWhisper() &&
    (tod === "afternoon" || tod === "late_afternoon" || tod === "evening")
  ) {
    markImplicitWhisperShown();
    return {
      type: "implicit_signal",
      message: implicitSignalMessage,
      icon: "👁‍🗨",
      color: "rgba(99,102,241,0.5)",
    };
  }

  // 朝: 予言配信
  if ((tod === "morning" || tod === "late_night") && prophecyText) {
    return {
      type: "prophecy",
      message: `今日の予言: 「${prophecyText.slice(0, 30)}${prophecyText.length > 30 ? "..." : ""}」`,
      icon: "🔮",
      color: "rgba(99,102,241,0.7)",
      href: "/stargazer",
      actionLabel: "詳しく見る",
    };
  }

  // 昼: パターン異常 or 好奇心
  if (tod === "afternoon") {
    if (observationCount >= 10) {
      return {
        type: "pattern",
        message: "あなたの回答パターンに、まだ説明のつかない揺れがある。",
        icon: "⚡",
        color: "rgba(245,158,11,0.7)",
        href: "/stargazer",
        actionLabel: "確かめる",
      };
    }
    return {
      type: "curiosity",
      message: "今の気分で答えると、朝と違う結果が出るかもしれない。",
      icon: "🌀",
      color: "rgba(168,85,247,0.6)",
      href: "/stargazer",
      actionLabel: "試してみる",
    };
  }

  // 夕方: 時間帯比較リフレクション
  if (tod === "late_afternoon" || tod === "evening") {
    return {
      type: "reflection",
      message: "朝の自分と夕方の自分。同じ問いへの答えが変わる瞬間がある。",
      icon: "🌆",
      color: "rgba(244,114,182,0.6)",
      href: "/stargazer",
      actionLabel: "振り返る",
    };
  }

  // 夜: 消えるインサイトカウントダウン or ストリーク
  if (tod === "late_night") {
    if (vanishingHoursLeft && vanishingHoursLeft > 0 && vanishingHoursLeft <= 6) {
      return {
        type: "countdown",
        message: `消えるインサイトがあと${Math.ceil(vanishingHoursLeft)}時間で消滅する。`,
        icon: "⏳",
        color: "rgba(239,68,68,0.6)",
        href: "/stargazer",
        actionLabel: "今すぐ見る",
      };
    }
    if (streakDays && streakDays >= 3) {
      return {
        type: "countdown",
        message: `${streakDays}日連続の観測。明日で一つ上の段階に近づく。`,
        icon: "🔥",
        color: "rgba(201,169,110,0.7)",
      };
    }
  }

  return null;
}

export default function WhisperCard(props: WhisperCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [alreadySeen, setAlreadySeen] = useState(true); // default true to suppress flash
  const whisper = useMemo(() => generateWhisper(props), [props]);

  useEffect(() => {
    setAlreadySeen(hasSeenWhisperThisHour());
  }, []);

  const handleDismiss = useCallback(() => {
    markWhisperSeen();
    setDismissed(true);
  }, []);

  if (!whisper || alreadySeen || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        className={props.className}
        initial={{ opacity: 0, y: 10, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div
          style={{
            borderRadius: 16,
            background: `linear-gradient(135deg, ${whisper.color.replace(/[\d.]+\)$/, "0.06)")}, rgba(255,255,255,0.8))`,
            border: `1px solid ${whisper.color.replace(/[\d.]+\)$/, "0.12)")}`,
            padding: "14px 16px",
            position: "relative",
          }}
        >
          {/* 閉じるボタン */}
          <button
            onClick={handleDismiss}
            style={{
              position: "absolute",
              top: 8,
              right: 10,
              fontSize: 14,
              color: "rgba(160,170,200,0.4)",
              background: "none",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
            }}
            aria-label="閉じる"
          >
            ×
          </button>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{whisper.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(24,30,50,0.8)",
                  lineHeight: 1.6,
                  marginBottom: whisper.href ? 8 : 0,
                }}
              >
                {whisper.message}
              </p>
              {whisper.href && whisper.actionLabel && (
                <a
                  href={whisper.href}
                  onClick={handleDismiss}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: whisper.color,
                    textDecoration: "none",
                  }}
                >
                  {whisper.actionLabel} →
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
