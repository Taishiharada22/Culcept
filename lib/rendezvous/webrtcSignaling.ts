/**
 * webrtcSignaling.ts
 * Supabase Realtime broadcast を使った WebRTC シグナリング
 * SDP offer/answer + ICE candidate 交換
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export type SignalType =
  | "call-request"
  | "call-accepted"
  | "call-rejected"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "hang-up";

export type SignalPayload = {
  type: SignalType;
  senderId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export type SignalHandler = (payload: SignalPayload) => void;

// ────────────────────────────────────────────
// STUN / TURN config
// ────────────────────────────────────────────

function buildRtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // TURN server（環境変数が設定されている場合のみ追加）
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    iceServers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnCred,
    });
  }

  return { iceServers };
}

export const RTC_CONFIG: RTCConfiguration = buildRtcConfig();

// ────────────────────────────────────────────
// Signaling Channel
// ────────────────────────────────────────────

export class VideoSignaling {
  private channel: RealtimeChannel;
  private handler: SignalHandler | null = null;
  private candidateId: string;
  private myUserId: string;

  constructor(
    supabase: SupabaseClient,
    candidateId: string,
    myUserId: string,
  ) {
    this.candidateId = candidateId;
    this.myUserId = myUserId;

    this.channel = supabase
      .channel(`video:${candidateId}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        if (payload && payload.senderId !== myUserId) {
          this.handler?.(payload as SignalPayload);
        }
      });
  }

  async subscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") resolve();
        else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          reject(new Error(`Channel error: ${status}`));
        }
      });
    });
  }

  onSignal(handler: SignalHandler) {
    this.handler = handler;
  }

  async send(payload: Omit<SignalPayload, "senderId">) {
    await this.channel.send({
      type: "broadcast",
      event: "signal",
      payload: { ...payload, senderId: this.myUserId },
    });
  }

  async requestCall() {
    await this.send({ type: "call-request" });
  }

  async acceptCall() {
    await this.send({ type: "call-accepted" });
  }

  async rejectCall() {
    await this.send({ type: "call-rejected" });
  }

  async sendOffer(sdp: RTCSessionDescriptionInit) {
    await this.send({ type: "offer", sdp });
  }

  async sendAnswer(sdp: RTCSessionDescriptionInit) {
    await this.send({ type: "answer", sdp });
  }

  async sendIceCandidate(candidate: RTCIceCandidateInit) {
    await this.send({ type: "ice-candidate", candidate });
  }

  async hangUp() {
    await this.send({ type: "hang-up" });
  }

  destroy() {
    this.handler = null;
    this.channel.unsubscribe();
  }
}
