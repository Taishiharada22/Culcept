"use client";

/**
 * Rendezvous Video Call
 * WebRTC P2P ビデオ通話 + Supabase Realtime signaling
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  VideoSignaling,
  RTC_CONFIG,
  type SignalPayload,
} from "@/lib/rendezvous/webrtcSignaling";

type CallState =
  | "preview"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended";

export default function VideoCallPage() {
  const params = useParams();
  const router = useRouter();
  const candidateId = params.candidateId as string;
  const supabase = supabaseBrowser();

  const [callState, setCallState] = useState<CallState>("preview");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const signalingRef = useRef<VideoSignaling | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get auth user
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setMyUserId(user.id);
    })();
  }, [supabase]);

  // Start camera
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  // Timer for connected state
  useEffect(() => {
    if (callState === "connected") {
      elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [callState]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access failed:", err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const cleanupCall = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    signalingRef.current?.destroy();
    signalingRef.current = null;
    if (elapsedRef.current) clearInterval(elapsedRef.current);
  }, []);

  // Create PeerConnection and wire up
  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Add local tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current!);
      });
    }

    // Remote track
    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signalingRef.current?.sendIceCandidate(e.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === "connected" ||
        pc.iceConnectionState === "completed"
      ) {
        setCallState("connected");
      }
      if (
        pc.iceConnectionState === "disconnected" ||
        pc.iceConnectionState === "failed"
      ) {
        handleEnd();
      }
    };

    return pc;
  }, []);

  // Handle incoming signals
  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      const sig = signalingRef.current;
      if (!sig) return;

      switch (payload.type) {
        case "call-request":
          // Someone is calling us (if we're on preview)
          setCallState("ringing");
          break;

        case "call-accepted": {
          // They accepted, create offer
          setCallState("connecting");
          const pc = createPC();
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sig.sendOffer(offer);
          break;
        }

        case "call-rejected":
          setCallState("ended");
          setTimeout(() => router.push(`/rendezvous/${candidateId}`), 1500);
          break;

        case "offer": {
          // Received offer, create answer
          setCallState("connecting");
          let pc = pcRef.current;
          if (!pc) pc = createPC();
          if (payload.sdp) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(payload.sdp),
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sig.sendAnswer(answer);
          }
          break;
        }

        case "answer": {
          const pc = pcRef.current;
          if (pc && payload.sdp) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(payload.sdp),
            );
          }
          break;
        }

        case "ice-candidate": {
          const pc = pcRef.current;
          if (pc && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
          break;
        }

        case "hang-up":
          handleEnd();
          break;
      }
    },
    [candidateId, createPC, router],
  );

  // Setup signaling channel
  useEffect(() => {
    if (!myUserId) return;

    const sig = new VideoSignaling(supabase, candidateId, myUserId);
    signalingRef.current = sig;
    sig.onSignal(handleSignal);
    sig.subscribe().catch(console.error);

    return () => {
      sig.destroy();
    };
  }, [myUserId, candidateId, supabase, handleSignal]);

  // Start call (caller side)
  const handleStartCall = async () => {
    setCallState("calling");
    await signalingRef.current?.requestCall();
  };

  // Accept incoming call
  const handleAcceptCall = async () => {
    setCallState("connecting");
    await signalingRef.current?.acceptCall();
    // The caller will create an offer after receiving "call-accepted"
  };

  // Reject incoming call
  const handleRejectCall = async () => {
    await signalingRef.current?.rejectCall();
    setCallState("preview");
  };

  const handleEnd = useCallback(() => {
    signalingRef.current?.hangUp().catch(() => {});
    cleanupCall();
    stopCamera();
    setCallState("ended");
    setTimeout(() => router.push(`/rendezvous/${candidateId}`), 1500);
  }, [candidateId, cleanupCall, router]);

  const toggleCamera = () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setCameraOn(track.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (streamRef.current) {
      const track = streamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setMicOn(track.enabled);
      }
    }
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const isConnected = callState === "connected";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0a0a1a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* Remote video (main) — visible when connected */}
      {isConnected && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
          }}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* Timer */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "4px 12px",
              borderRadius: 12,
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
              fontSize: 12,
              color: "rgba(255,255,255,0.8)",
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
            }}
          >
            {formatElapsed(elapsed)}
          </div>
        </div>
      )}

      {/* Local video: full preview or PiP when connected */}
      <div
        style={
          isConnected
            ? {
                position: "absolute",
                bottom: 100,
                right: 16,
                width: 120,
                height: 160,
                borderRadius: 12,
                overflow: "hidden",
                zIndex: 10,
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                border: "2px solid rgba(255,255,255,0.15)",
              }
            : {
                width: "100%",
                maxWidth: 480,
                aspectRatio: "3/4",
                borderRadius: 20,
                overflow: "hidden",
                background: "#1a1a2e",
                position: "relative",
              }
        }
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />

        {/* Preview overlay */}
        {callState === "preview" && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "40px 20px 30px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.8)",
                marginBottom: 16,
              }}
            >
              カメラプレビュー
            </p>
            <button
              onClick={handleStartCall}
              style={{
                padding: "14px 32px",
                borderRadius: 16,
                border: "none",
                background: "linear-gradient(135deg, #22C55E, #16A34A)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(34,197,94,0.3)",
              }}
            >
              通話を開始
            </button>
          </div>
        )}

        {/* Calling overlay */}
        {callState === "calling" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: "3px solid rgba(255,255,255,0.2)",
                  borderTopColor: "#22C55E",
                  animation: "vc-spin 1s linear infinite",
                  margin: "0 auto 16px",
                }}
              />
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>
                発信中...
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 4,
                }}
              >
                相手の応答を待っています
              </p>
              <button
                onClick={handleEnd}
                style={{
                  marginTop: 20,
                  padding: "8px 20px",
                  borderRadius: 12,
                  border: "none",
                  background: "#EF4444",
                  color: "#fff",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Ringing overlay (incoming call) */}
        {callState === "ringing" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(34,197,94,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  animation: "vc-pulse 1.5s ease-in-out infinite",
                }}
              >
                <span style={{ fontSize: 28 }}>📞</span>
              </div>
              <p style={{ fontSize: 16, color: "#fff", fontWeight: 700 }}>
                着信中...
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginTop: 20,
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={handleRejectCall}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    border: "none",
                    background: "#EF4444",
                    color: "#fff",
                    fontSize: 20,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
                <button
                  onClick={handleAcceptCall}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    border: "none",
                    background: "#22C55E",
                    color: "#fff",
                    fontSize: 20,
                    cursor: "pointer",
                  }}
                >
                  ✓
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connecting overlay */}
        {callState === "connecting" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  border: "3px solid rgba(255,255,255,0.2)",
                  borderTopColor: "#6366F1",
                  animation: "vc-spin 1s linear infinite",
                  margin: "0 auto 16px",
                }}
              />
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>
                接続中...
              </p>
            </div>
          </div>
        )}

        {/* Ended overlay */}
        {callState === "ended" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.7)",
            }}
          >
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.8)" }}>
              通話終了
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: isConnected ? 0 : 24,
          ...(isConnected
            ? {
                position: "absolute",
                bottom: 24,
                zIndex: 10,
              }
            : {}),
        }}
      >
        <ControlButton
          active={micOn}
          label={micOn ? "ミュート" : "ミュート解除"}
          icon={micOn ? "🎤" : "🔇"}
          onClick={toggleMic}
        />
        <ControlButton
          active={cameraOn}
          label={cameraOn ? "カメラOFF" : "カメラON"}
          icon={cameraOn ? "📹" : "📷"}
          onClick={toggleCamera}
        />
        <button
          onClick={handleEnd}
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "none",
            background: "#EF4444",
            color: "#fff",
            fontSize: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>

      {/* Back link */}
      {!isConnected && (
        <Link
          href={`/rendezvous/${candidateId}`}
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            marginTop: 20,
            textDecoration: "none",
          }}
        >
          ← 戻る
        </Link>
      )}

      <style>{`
        @keyframes vc-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes vc-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

function ControlButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: active
            ? "rgba(255,255,255,0.15)"
            : "rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
    </button>
  );
}
