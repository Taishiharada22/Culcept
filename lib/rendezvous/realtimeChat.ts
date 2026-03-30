"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================
// Realtime Chat Subscription Helper
// Supabase Realtime を使ったチャットのリアルタイム通信ヘルパー
// postgres_changes + presence (typing) + broadcast (read receipts)
// ============================================================

export type RealtimeMessage = {
  id: string;
  thread_id: string;
  candidate_id: string;
  sender_id: string;
  body: string;
  message_type: "text" | "image" | "voice" | "system";
  media_url?: string | null;
  media_metadata?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at: string;
};

export type RealtimeChatCallbacks = {
  onNewMessage: (msg: RealtimeMessage) => void;
  onTyping: (userId: string, isTyping: boolean) => void;
  onReadReceipt: (readBy: string, readAt: string) => void;
  onConnectionChange?: (connected: boolean) => void;
};

export type RealtimeChatHandle = {
  channel: RealtimeChannel;
  unsubscribe: () => void;
  setTyping: (isTyping: boolean) => void;
  broadcastReadReceipt: (readAt: string) => void;
};

/**
 * チャットスレッドに Realtime サブスクリプションを張る
 *
 * 戻り値の unsubscribe を useEffect cleanup で呼ぶこと。
 * 既存の RendezvousChatView 内のインラインsubscriptionと同等の機能を
 * 再利用可能なヘルパーとして提供する。
 */
export function subscribeToChat(
  threadId: string,
  myUserId: string,
  callbacks: RealtimeChatCallbacks,
): RealtimeChatHandle {
  const supabase = supabaseBrowser();

  const channel = supabase
    .channel(`chat:${threadId}`)
    // 新しいメッセージの検知
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "rendezvous_messages",
        filter: `thread_id=eq.${threadId}`,
      },
      (payload: { new: Record<string, unknown> }) => {
        callbacks.onNewMessage(payload.new as RealtimeMessage);
      },
    )
    // タイピングインジケータ (presence)
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const allPresences = Object.values(state).flat() as Array<{
        user_id?: string;
        typing?: boolean;
      }>;

      // 自分以外のユーザーのtyping状態を通知
      for (const p of allPresences) {
        if (p.user_id && p.user_id !== myUserId) {
          callbacks.onTyping(p.user_id, p.typing === true);
        }
      }
    })
    // 既読通知 (broadcast)
    .on("broadcast", { event: "read_receipt" }, ({ payload }: { payload: Record<string, unknown> }) => {
      if (
        payload?.readBy &&
        payload.readBy !== myUserId &&
        typeof payload?.readAt === "string"
      ) {
        callbacks.onReadReceipt(payload.readBy as string, payload.readAt as string);
      }
    })
    .subscribe(async (status: string) => {
      const connected = status === "SUBSCRIBED";
      callbacks.onConnectionChange?.(connected);
      if (connected) {
        await channel.track({ user_id: myUserId, typing: false });
      }
    });

  // --- Typing control ---
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;

  const setTyping = (isTyping: boolean) => {
    if (typingTimeout) clearTimeout(typingTimeout);

    channel.track({ user_id: myUserId, typing: isTyping }).catch(() => {});

    if (isTyping) {
      // 3秒後に自動でtyping解除
      typingTimeout = setTimeout(() => {
        channel.track({ user_id: myUserId, typing: false }).catch(() => {});
      }, 3000);
    }
  };

  // --- Read receipt broadcast ---
  const broadcastReadReceipt = (readAt: string) => {
    channel
      .send({
        type: "broadcast",
        event: "read_receipt",
        payload: { readBy: myUserId, readAt },
      })
      .catch(() => {});
  };

  // --- Cleanup ---
  const unsubscribe = () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    supabase.removeChannel(channel);
  };

  return {
    channel,
    unsubscribe,
    setTyping,
    broadcastReadReceipt,
  };
}
