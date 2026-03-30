"use client";

/**
 * RendezvousChatView
 * Chat interface for connected candidates.
 * Light-mode: 透明感のある会話画面、淡い色合い
 *
 * 機能:
 * - メッセージ取得・ポーリング + Realtime
 * - 楽観的UI更新
 * - テキスト/画像/ボイス/システムメッセージ表示
 * - 画像送信UI（圧縮+アップロード）
 * - ヘッダー安全メニュー（ブロック/通報/ビデオ通話）
 * - 空状態表示 + アイスブレイカー
 */

import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase/client";
import { compressImage } from "@/lib/rendezvous/imageCompression";
import OrbiterReflectionModal from "@/components/orbiter/OrbiterReflectionModal";
import IceBreakerSuggestions from "@/components/rendezvous/IceBreakerSuggestions";
import DisconnectReasonSelector from "@/components/rendezvous/counselor/DisconnectReasonSelector";
import RecoveryFlow from "@/components/rendezvous/counselor/RecoveryFlow";
import type { DisconnectReasonCode } from "@/lib/rendezvous/counselor/types";
import ChatSkeleton from "@/components/rendezvous/skeletons/ChatSkeleton";
import MatchQualityPulse from "@/components/rendezvous/MatchQualityPulse";
import MilestoneCelebration from "@/components/rendezvous/MilestoneCelebration";
import { hapticLight, hapticMedium } from "@/lib/rendezvous/haptics";
import VoiceRecorder from "@/components/rendezvous/VoiceRecorder";
import TypingIndicator from "@/components/rendezvous/chat/TypingIndicator";
import ReadReceipt from "@/components/rendezvous/chat/ReadReceipt";
import type { ReceiptStatus } from "@/components/rendezvous/chat/ReadReceipt";
import GameSelector from "@/components/rendezvous/chat/GameSelector";
import type { CoupleGame } from "@/lib/rendezvous/coupleGames";
import ConversationClimate from "@/components/rendezvous/ConversationClimate";
import IncomingCallOverlay from "@/components/rendezvous/IncomingCallOverlay";
import type { Crystal } from "@/lib/rendezvous/memoryCrystal";
import CrystalDetectionToast from "@/components/rendezvous/CrystalDetectionToast";
import { analyzeSelfPatterns } from "@/lib/rendezvous/selfDiscovery";
import { observeRelationshipChanges } from "@/lib/rendezvous/relationshipObserver";
import SelfDiscoveryInsight from "@/components/rendezvous/SelfDiscoveryInsight";
import RelationshipWhisperCard from "@/components/rendezvous/RelationshipWhisper";
import { detectCrystals as detectMemoryCrystals, type MemoryCrystal as MemCrystal } from "@/lib/rendezvous/memoryCrystals";
import MemoryCrystalBadge from "@/components/rendezvous/MemoryCrystalBadge";
import MemoryCrystalList from "@/components/rendezvous/MemoryCrystalList";
import { safeLSSet } from "@/lib/safeLocalStorage";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  message_type?: "text" | "image" | "voice" | "system";
  media_url?: string | null;
  media_metadata?: { duration?: number; width?: number; height?: number } | null;
};

type Props = {
  candidateId: string;
  counterpartName: string;
};

// ────────────────────────────────────────────
// ImageLightbox — タップで全画面表示
// ────────────────────────────────────────────

const ImageLightbox = memo(function ImageLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-out",
      }}
    >
      <motion.img
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", damping: 25 }}
        src={src}
        alt=""
        style={{
          maxWidth: "92vw",
          maxHeight: "90vh",
          borderRadius: 12,
          objectFit: "contain",
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.15)",
          border: "none",
          color: "#fff",
          fontSize: 18,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ✕
      </button>
    </motion.div>
  );
});

// ────────────────────────────────────────────
// VoiceBubble — 音声メッセージ再生
// ────────────────────────────────────────────

const VoiceBubble = memo(function VoiceBubble({
  src,
  duration,
}: {
  src: string;
  duration?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const sec = duration ?? 0;
  const label = sec > 0 ? `${Math.ceil(sec)}秒` : "";

  return (
    <div
      onClick={toggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        minWidth: 120,
        padding: "2px 0",
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      {/* Play/Pause icon */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: playing
            ? "rgba(99,102,241,0.15)"
            : "rgba(99,102,241,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {playing ? (
          <svg width={12} height={12} viewBox="0 0 12 12" fill="#6366F1">
            <rect x={2} y={2} width={3} height={8} rx={0.5} />
            <rect x={7} y={2} width={3} height={8} rx={0.5} />
          </svg>
        ) : (
          <svg width={12} height={12} viewBox="0 0 12 12" fill="#6366F1">
            <polygon points="3,1.5 10.5,6 3,10.5" />
          </svg>
        )}
      </div>
      {/* Progress bar */}
      <div
        style={{
          flex: 1,
          height: 3,
          background: "rgba(99,102,241,0.1)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: "#6366F1",
            borderRadius: 2,
            transition: "width 0.1s linear",
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: 10, color: "rgba(30,30,60,0.35)", flexShrink: 0 }}>
          {label}
        </span>
      )}
    </div>
  );
});

// ────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────

export default function RendezvousChatView({
  candidateId,
  counterpartName,
}: Props) {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReflection, setShowReflection] = useState(false);
  const [counterpartTyping, setCounterpartTyping] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const reflectionTriggeredRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Image send states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<{
    file: File;
    url: string;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // Read receipts
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Safety menu
  const [showMenu, setShowMenu] = useState(false);

  // Match quality feedback
  const [feedbackMilestone, setFeedbackMilestone] = useState<string | null>(null);

  // Milestone celebration
  const [celebrateMilestone, setCelebrateMilestone] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Crystal detection
  const [detectedCrystal, setDetectedCrystal] = useState<Crystal | null>(null);
  const messageCountSinceLastDetect = useRef(0);

  // Memory Crystal v2 (記憶の結晶化)
  const [showCrystalList, setShowCrystalList] = useState(false);
  const memoryCrystals = useMemo<MemCrystal[]>(() => {
    if (messages.length < 5) return [];
    const chatMsgs = messages.map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      content: m.body,
      created_at: m.created_at,
    }));
    return detectMemoryCrystals(chatMsgs);
  }, [messages]);

  // Game selector
  const [showGameSelector, setShowGameSelector] = useState(false);

  // Self-Discovery & Relationship Whisper
  const selfInsights = useMemo(() => {
    if (!myUserId || messages.length < 20) return [];
    const mapped = messages
      .filter((m) => !m.id.startsWith("opt-"))
      .map((m) => ({
        sender_id: m.sender_id,
        content: m.body,
        created_at: m.created_at,
      }));
    return analyzeSelfPatterns(mapped, myUserId);
  }, [messages, myUserId]);

  const relationshipWhisper = useMemo(() => {
    if (!myUserId || messages.length < 30) return null;
    const mapped = messages
      .filter((m) => !m.id.startsWith("opt-"))
      .map((m) => ({
        sender_id: m.sender_id,
        content: m.body,
        created_at: m.created_at,
      }));
    return observeRelationshipChanges(mapped, myUserId);
  }, [messages, myUserId]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  // Chat reflection trigger: after 5+ user messages
  const CHAT_REFLECTION_THRESHOLD = 5;
  useEffect(() => {
    if (!myUserId || reflectionTriggeredRef.current) return;
    const myMessageCount = messages.filter(
      (m) => m.sender_id === myUserId && !m.id.startsWith("opt-"),
    ).length;
    if (myMessageCount >= CHAT_REFLECTION_THRESHOLD) {
      const key = `orbiter_reflection_chat_${candidateId}`;
      if (!localStorage.getItem(key)) {
        reflectionTriggeredRef.current = true;
        setShowReflection(true);
      }
    }
  }, [messages, myUserId, candidateId]);

  // Milestone detection & feedback trigger
  useEffect(() => {
    if (!myUserId || messages.length === 0) return;
    const totalMessages = messages.filter((m) => !m.id.startsWith("opt-")).length;

    // Milestone celebration: detect system messages with milestone keywords
    const milestoneKeywords: Record<string, string> = {
      "初めて": "first_reply",
      "10通": "ten_messages",
      "50通": "fifty_messages",
      "3日間": "three_day_streak",
      "1週間": "seven_day_streak",
    };
    const lastSystemMsg = [...messages].reverse().find(
      (m) => m.message_type === "system" && !m.id.startsWith("opt-"),
    );
    if (lastSystemMsg) {
      for (const [keyword, milestone] of Object.entries(milestoneKeywords)) {
        if (lastSystemMsg.body.includes(keyword)) {
          const key = `culcept_milestone_shown_${candidateId}_${milestone}`;
          if (!localStorage.getItem(key)) {
            safeLSSet(key, "1");
            setCelebrateMilestone(milestone);
            break;
          }
        }
      }
    }

    // Feedback pulse: at 50 messages
    if (totalMessages >= 50) {
      const key = `culcept_match_feedback_${candidateId}_messages_50`;
      if (!localStorage.getItem(key) && !feedbackMilestone) {
        setFeedbackMilestone("messages_50");
      }
    }
  }, [messages, myUserId, candidateId, feedbackMilestone]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/chat`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
      if (data.myUserId) setMyUserId(data.myUserId);
      if (data.threadId) setThreadId(data.threadId);
    } catch {
      // ignore
    }
  }, [candidateId]);

  // --- Supabase Realtime subscription ---
  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`chat:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rendezvous_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            const cleaned = prev.filter(
              (m) => !m.id.startsWith("opt-") || m.sender_id !== newMsg.sender_id,
            );
            return [...cleaned, newMsg];
          });
          if (newMsg.sender_id !== myUserId) {
            setCounterpartTyping(false);
          }
        },
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const allPresences = Object.values(state).flat() as Array<{
          user_id?: string;
          typing?: boolean;
        }>;
        const others = allPresences.filter((p) => p.user_id !== myUserId);
        setCounterpartTyping(others.some((p) => p.typing === true));
      })
      .on("broadcast", { event: "read_receipt" }, ({ payload }: { payload: Record<string, unknown> }) => {
        if (payload?.readBy !== myUserId && typeof payload?.readAt === "string") {
          setLastReadAt(payload.readAt as string);
        }
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
          if (myUserId) {
            await channel.track({ user_id: myUserId, typing: false });
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      setRealtimeConnected(false);
    };
  }, [threadId, myUserId, supabase]);

  // --- Mark as read on open (triggers broadcast) ---
  useEffect(() => {
    if (!candidateId) return;
    fetch(`/api/rendezvous/${candidateId}/chat`, {
      method: "PATCH",
      credentials: "include",
    }).catch(() => {});
  }, [candidateId]);

  // --- Fallback polling ---
  useEffect(() => {
    fetchMessages().finally(() => setLoading(false));
    const interval = realtimeConnected ? 15000 : 3000;
    pollingRef.current = setInterval(fetchMessages, interval);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchMessages, realtimeConnected]);

  // --- Typing indicator broadcast ---
  const broadcastTyping = useCallback(
    (isTyping: boolean) => {
      if (!threadId || !myUserId) return;
      const channel = supabase.channel(`chat:${threadId}`);
      channel.track({ user_id: myUserId, typing: isTyping }).catch(() => {});
    },
    [threadId, myUserId, supabase],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      broadcastTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), 2000);
    },
    [broadcastTyping],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Send text ---
  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;

    setSending(true);
    setInput("");
    broadcastTyping(false);

    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      sender_id: myUserId ?? "",
      body,
      created_at: new Date().toISOString(),
      message_type: "text",
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(`/api/rendezvous/${candidateId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        hapticLight();
        await fetchMessages();

        // Crystal detection: every 5 messages, fire-and-forget detection
        messageCountSinceLastDetect.current += 1;
        if (messageCountSinceLastDetect.current >= 5) {
          messageCountSinceLastDetect.current = 0;
          fetch(`/api/rendezvous/${candidateId}/crystals/detect`, {
            method: "POST",
            credentials: "include",
          })
            .then((r) => r.json())
            .then((data) => {
              if (data?.newCrystals?.length > 0) {
                setDetectedCrystal(data.newCrystals[0]);
              }
            })
            .catch(() => {});
        }
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  // --- Image send ---
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview({ file, url });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImageCancel = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview.url);
    setImagePreview(null);
    setUploadProgress(0);
  };

  const handleImageSend = async () => {
    if (!imagePreview || uploading) return;
    setUploading(true);
    setUploadProgress(10);

    try {
      const compressed = await compressImage(imagePreview.file);
      setUploadProgress(40);

      const form = new FormData();
      form.append("file", compressed, "image.jpg");
      setUploadProgress(60);

      const res = await fetch(`/api/rendezvous/${candidateId}/chat/media`, {
        method: "POST",
        body: form,
      });
      setUploadProgress(90);

      if (res.ok) {
        hapticMedium();
        await fetchMessages();
        setUploadProgress(100);
      }
    } catch {
      // ignore
    } finally {
      handleImageCancel();
      setUploading(false);
    }
  };

  // --- Safety actions ---
  const handleBlock = async () => {
    if (!confirm("この相手をブロックしますか？")) return;
    try {
      await fetch(`/api/rendezvous/${candidateId}/block`, {
        method: "POST",
        credentials: "include",
      });
      router.push("/rendezvous");
    } catch {
      // ignore
    }
  };

  // --- Counselor disconnect flow ---
  const [showDisconnectSelector, setShowDisconnectSelector] = useState(false);
  const [disconnectAnalysisId, setDisconnectAnalysisId] = useState<string | null>(null);

  const handleUnmatch = () => {
    setShowMenu(false);
    setShowDisconnectSelector(true);
  };

  const handleDisconnectSubmit = async (reasonCode: DisconnectReasonCode, detail?: string) => {
    setShowDisconnectSelector(false);
    try {
      const res = await fetch("/api/rendezvous/counselor/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ candidateId, reasonCode, reasonDetail: detail }),
      });
      const data = await res.json();
      if (data.analysisId) {
        setDisconnectAnalysisId(data.analysisId);
      } else {
        router.push("/rendezvous");
      }
    } catch {
      router.push("/rendezvous");
    }
  };

  const handleReport = async () => {
    const reason = prompt("通報の理由を入力してください:");
    if (!reason) return;
    try {
      await fetch(`/api/rendezvous/${candidateId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      alert("通報を受け付けました。");
    } catch {
      // ignore
    }
    setShowMenu(false);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // --- Message bubble renderer ---
  const renderBubble = (msg: Message) => {
    const isMine = msg.sender_id === myUserId;
    const type = msg.message_type ?? "text";

    // System message: centered grey
    if (type === "system") {
      return (
        <div
          key={msg.id}
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "4px 0",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "rgba(30,30,60,0.4)",
              background: "rgba(99,102,241,0.04)",
              padding: "4px 12px",
              borderRadius: 12,
            }}
          >
            {msg.body}
          </span>
        </div>
      );
    }

    return (
      <div
        key={msg.id}
        style={{
          display: "flex",
          justifyContent: isMine ? "flex-end" : "flex-start",
        }}
      >
        <div
          style={{
            maxWidth: "75%",
            padding: type === "image" ? 4 : "10px 14px",
            borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: isMine
              ? "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))"
              : "rgba(255,255,255,0.8)",
            border: `1px solid ${
              isMine ? "rgba(99,102,241,0.15)" : "rgba(30,30,60,0.06)"
            }`,
            boxShadow: isMine
              ? "0 1px 4px rgba(99,102,241,0.08)"
              : "0 1px 3px rgba(30,30,60,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Image message */}
          {type === "image" && msg.media_url && (
            <div
              onClick={() => setLightboxSrc(msg.media_url!)}
              style={{ cursor: "zoom-in" }}
            >
              <img
                src={msg.media_url}
                alt=""
                loading="lazy"
                style={{
                  width: "100%",
                  maxWidth: 240,
                  borderRadius: 10,
                  display: "block",
                }}
              />
            </div>
          )}

          {/* Voice message */}
          {type === "voice" && msg.media_url && (
            <VoiceBubble
              src={msg.media_url}
              duration={msg.media_metadata?.duration}
            />
          )}

          {/* Text message (also show body for image captions if present) */}
          {(type === "text" || (type !== "voice" && msg.body && type !== "image")) && (
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "#1E1E3C",
                margin: 0,
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.body}
            </p>
          )}

          {/* Timestamp */}
          <div
            style={{
              fontSize: 9,
              color: "rgba(30,30,60,0.3)",
              textAlign: isMine ? "right" : "left",
              marginTop: 4,
              padding: type === "image" ? "0 8px 4px" : 0,
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
              display: "flex",
              alignItems: "center",
              justifyContent: isMine ? "flex-end" : "flex-start",
              gap: 4,
            }}
          >
            {formatTime(msg.created_at)}
            {isMine && (() => {
              let receiptStatus: ReceiptStatus = "sent";
              if (msg.id.startsWith("opt-")) receiptStatus = "sending";
              else if (lastReadAt && msg.created_at <= lastReadAt) receiptStatus = "read";
              else receiptStatus = "delivered";
              return <ReadReceipt status={receiptStatus} size={11} />;
            })()}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <ChatSkeleton />;
  }

  // --- Counselor overlay: disconnect reason selector ---
  if (showDisconnectSelector) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #F8F7FF 0%, #EEF0FF 50%, #FFF8F6 100%)", padding: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <DisconnectReasonSelector
          candidateId={candidateId}
          onSubmit={handleDisconnectSubmit}
          onCancel={() => setShowDisconnectSelector(false)}
        />
      </div>
    );
  }

  // --- Counselor overlay: recovery flow (shown to disconnected user) ---
  if (disconnectAnalysisId) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #F8F7FF 0%, #EEF0FF 50%, #FFF8F6 100%)", padding: 20 }}>
        <RecoveryFlow
          analysisId={disconnectAnalysisId}
          onComplete={() => router.push("/rendezvous")}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #F8F7FF 0%, #EEF0FF 50%, #FFF8F6 100%)",
        color: "#1E1E3C",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Noto Sans JP',-apple-system,sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(248,247,255,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(99,102,241,0.08)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Link
          href={`/rendezvous/${candidateId}`}
          style={{
            color: "rgba(30,30,60,0.4)",
            textDecoration: "none",
            fontSize: 18,
            lineHeight: 1,
            padding: "4px",
          }}
        >
          ←
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1E1E3C" }}>
            {counterpartName}
          </div>
          <div
            style={{
              fontSize: 9,
              color: "#6366F1",
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
              letterSpacing: 1,
              opacity: 0.6,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: realtimeConnected
                  ? "#22C55E"
                  : "rgba(30,30,60,0.2)",
                display: "inline-block",
              }}
            />
            {counterpartTyping ? "入力中..." : "RENDEZVOUS CHAT"}
          </div>
        </div>

        {/* Memory Crystal Badge */}
        {memoryCrystals.length > 0 && (
          <MemoryCrystalBadge
            count={memoryCrystals.length}
            onClick={() => setShowCrystalList(true)}
          />
        )}

        {/* Safety menu button */}
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            onClick={() => setShowMenu((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "rgba(30,30,60,0.4)",
              padding: "4px 8px",
              borderRadius: 8,
            }}
          >
            ⋮
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 4,
                  minWidth: 180,
                  background: "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(16px)",
                  borderRadius: 12,
                  border: "1px solid rgba(99,102,241,0.08)",
                  boxShadow: "0 4px 20px rgba(30,30,60,0.1)",
                  overflow: "hidden",
                  zIndex: 30,
                }}
              >
                <button
                  onClick={() => {
                    setShowMenu(false);
                    router.push(`/rendezvous/${candidateId}/video`);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid rgba(99,102,241,0.06)",
                    textAlign: "left",
                    fontSize: 13,
                    color: "#1E1E3C",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  📹 ビデオ通話
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    handleUnmatch();
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid rgba(99,102,241,0.06)",
                    textAlign: "left",
                    fontSize: 13,
                    color: "#F59E0B",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  ↩ 接続を解除する
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    handleBlock();
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid rgba(99,102,241,0.06)",
                    textAlign: "left",
                    fontSize: 13,
                    color: "#EF4444",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  🚫 ブロックする
                </button>
                <button
                  onClick={handleReport}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "none",
                    border: "none",
                    textAlign: "left",
                    fontSize: 13,
                    color: "#EF4444",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  ⚠️ 通報する
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Conversation Climate Gauge */}
      <ConversationClimate
        messages={messages.map((m) => ({
          senderId: m.sender_id,
          text: m.body,
          createdAt: m.created_at,
        }))}
        myUserId={myUserId ?? ""}
      />

      {/* Self-Discovery Insight — below header */}
      {selfInsights.length > 0 && (
        <div style={{ paddingTop: 8 }}>
          <SelfDiscoveryInsight insights={selfInsights} />
        </div>
      )}

      {/* Relationship Whisper — above message list */}
      {relationshipWhisper && (
        <div style={{ paddingTop: 4 }}>
          <RelationshipWhisperCard
            whisper={relationshipWhisper}
            candidateId={candidateId}
            onDismiss={() => {}}
          />
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "rgba(99,102,241,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                <circle
                  cx={10}
                  cy={10}
                  r={6}
                  stroke="#6366F1"
                  strokeWidth={1.2}
                  opacity={0.4}
                />
                <circle cx={10} cy={10} r={2} fill="#6366F1" opacity={0.5} />
              </svg>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "rgba(30,30,60,0.5)",
                marginBottom: 4,
              }}
            >
              接続が開きました
            </p>
            <p style={{ fontSize: 11, color: "rgba(30,30,60,0.3)" }}>
              最初のメッセージを送ってみましょう
            </p>
          </div>
        )}

        {messages.length === 0 && (
          <IceBreakerSuggestions
            candidateId={candidateId}
            onSelect={(text) => setInput(text)}
          />
        )}

        {messages.map(renderBubble)}

        {/* Typing indicator (enhanced) */}
        <TypingIndicator
          visible={counterpartTyping}
          partnerName={counterpartName}
        />
        {/* Milestone celebration */}
        {celebrateMilestone && (
          <MilestoneCelebration
            milestone={celebrateMilestone}
            onDismiss={() => setCelebrateMilestone(null)}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Match quality feedback pulse */}
      {feedbackMilestone && (
        <MatchQualityPulse
          candidateId={candidateId}
          milestone={feedbackMilestone}
          onDismiss={() => setFeedbackMilestone(null)}
        />
      )}

      {/* Image preview panel */}
      <AnimatePresence>
        {imagePreview && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              padding: "12px 16px",
              background: "rgba(248,247,255,0.95)",
              backdropFilter: "blur(12px)",
              borderTop: "1px solid rgba(99,102,241,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ position: "relative" }}>
              <img
                src={imagePreview.url}
                alt=""
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 10,
                  objectFit: "cover",
                }}
              />
              {uploading && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      animation: "rv-spin 0.8s linear infinite",
                    }}
                  />
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: 12,
                  color: "rgba(30,30,60,0.5)",
                  margin: 0,
                }}
              >
                画像を送信しますか？
              </p>
              {uploading && (
                <div
                  style={{
                    marginTop: 6,
                    height: 3,
                    borderRadius: 2,
                    background: "rgba(99,102,241,0.1)",
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    animate={{ width: `${uploadProgress}%` }}
                    style={{
                      height: "100%",
                      background: "#6366F1",
                      borderRadius: 2,
                    }}
                  />
                </div>
              )}
            </div>
            {!uploading && (
              <>
                <button
                  onClick={handleImageCancel}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(30,30,60,0.1)",
                    background: "rgba(255,255,255,0.6)",
                    fontSize: 12,
                    color: "rgba(30,30,60,0.5)",
                    cursor: "pointer",
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleImageSend}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fff",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(99,102,241,0.2)",
                  }}
                >
                  送信
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "rgba(248,247,255,0.92)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(99,102,241,0.08)",
          padding: "12px 16px",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        }}
      >
        <div
          style={{
            maxWidth: 600,
            margin: "0 auto",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          {/* Game selector button */}
          <button
            onClick={() => setShowGameSelector(true)}
            style={{
              padding: "10px",
              borderRadius: 12,
              border: "1px solid rgba(30,30,60,0.08)",
              background: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              flexShrink: 0,
              color: "rgba(99,102,241,0.6)",
            }}
            title="ゲームで遊ぶ"
          >
            🎮
          </button>

          {/* Image picker button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "10px",
              borderRadius: 12,
              border: "1px solid rgba(30,30,60,0.08)",
              background: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              flexShrink: 0,
              color: "rgba(99,102,241,0.6)",
            }}
          >
            📷
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            style={{ display: "none" }}
          />

          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="メッセージを入力..."
            rows={1}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(30,30,60,0.08)",
              background: "rgba(255,255,255,0.7)",
              color: "#1E1E3C",
              fontSize: 13,
              fontFamily: "'Noto Sans JP',-apple-system,sans-serif",
              resize: "none",
              outline: "none",
              lineHeight: 1.5,
              maxHeight: 120,
            }}
          />
          {/* Voice Recorder */}
          {!input.trim() && (
            <VoiceRecorder
              onRecordComplete={async (blob, _durationMs) => {
                const form = new FormData();
                form.append("file", blob, "voice.webm");
                try {
                  const res = await fetch(
                    `/api/rendezvous/${candidateId}/chat/media`,
                    { method: "POST", body: form },
                  );
                  if (res.ok) await fetchMessages();
                } catch {}
              }}
            />
          )}
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              cursor:
                input.trim() && !sending ? "pointer" : "default",
              background:
                input.trim() && !sending
                  ? "linear-gradient(135deg, #6366F1, #8B5CF6)"
                  : "rgba(30,30,60,0.06)",
              color:
                input.trim() && !sending
                  ? "#fff"
                  : "rgba(30,30,60,0.25)",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
              opacity: input.trim() && !sending ? 1 : 0.5,
              boxShadow:
                input.trim() && !sending
                  ? "0 2px 8px rgba(99,102,241,0.2)"
                  : "none",
            }}
          >
            送信
          </button>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes rv-typing-dot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes rv-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Image Lightbox */}
      <AnimatePresence>
        {lightboxSrc && (
          <ImageLightbox
            src={lightboxSrc}
            onClose={() => setLightboxSrc(null)}
          />
        )}
      </AnimatePresence>

      {/* Incoming Call Overlay */}
      {myUserId && (
        <IncomingCallOverlay
          candidateId={candidateId}
          myUserId={myUserId}
          counterpartName={counterpartName}
        />
      )}

      {/* Crystal Detection Toast */}
      <AnimatePresence>
        {detectedCrystal && (
          <CrystalDetectionToast
            crystal={detectedCrystal}
            onView={() => {
              setDetectedCrystal(null);
              setShowCrystalList(true);
            }}
            onDismiss={() => setDetectedCrystal(null)}
          />
        )}
      </AnimatePresence>

      {/* Memory Crystal List Overlay (記憶の結晶化) */}
      <AnimatePresence>
        {showCrystalList && (
          <MemoryCrystalList
            candidateId={candidateId}
            onClose={() => setShowCrystalList(false)}
          />
        )}
      </AnimatePresence>

      {/* Game Selector */}
      <GameSelector
        currentPhase="spark"
        visible={showGameSelector}
        onClose={() => setShowGameSelector(false)}
        onSelectGame={(game: CoupleGame) => {
          setShowGameSelector(false);
          // ゲーム開始メッセージをシステムメッセージとして送信
          const gameMsg = `🎮 「${game.titleJa}」を始めましょう！\n${game.descriptionJa}\n⏱ ${game.duration}分`;
          setInput(gameMsg);
        }}
      />

      {/* Orbiter Reflection Modal */}
      {showReflection && (
        <OrbiterReflectionModal
          candidateId={candidateId}
          reflectionType="chat_phase"
          onClose={() => {
            safeLSSet(
              `orbiter_reflection_chat_${candidateId}`,
              "chat_phase",
            );
            setShowReflection(false);
          }}
          onSubmitted={() => {
            safeLSSet(
              `orbiter_reflection_chat_${candidateId}`,
              "chat_phase",
            );
          }}
        />
      )}
    </div>
  );
}
