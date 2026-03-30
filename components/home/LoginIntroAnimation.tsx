"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const INTRO_KEY = "aneurasync_intro_seen";
const DISPLAY_MS = 800;
const FADE_MS = 400;

export default function LoginIntroAnimation({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"check" | "show" | "fade" | "done">("check");

  useEffect(() => {
    if (sessionStorage.getItem(INTRO_KEY)) {
      setPhase("done");
      onComplete();
      return;
    }
    setPhase("show");
    const showTimer = setTimeout(() => setPhase("fade"), DISPLAY_MS);
    const doneTimer = setTimeout(() => {
      sessionStorage.setItem(INTRO_KEY, "1");
      setPhase("done");
      onComplete();
    }, DISPLAY_MS + FADE_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  if (phase === "check" || phase === "done") return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#060510",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        opacity: phase === "fade" ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
        overflow: "hidden",
      }}
    >
      {/* Earth background */}
      <div className="absolute inset-0 pointer-events-none select-none" style={{ zIndex: 1 }}>
        <Image
          src="/haikei/earth.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{
            objectPosition: "50% 72%",
            filter: "brightness(0.88) saturate(1.14) contrast(1.05)",
          }}
        />
      </div>

      {/* Atmospheric overlays */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          background:
            "linear-gradient(100deg, rgba(6,5,16,0.68) 0%, rgba(6,5,16,0.42) 24%, rgba(6,5,16,0.12) 48%, transparent 66%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          mixBlendMode: "screen",
          background:
            "radial-gradient(circle at 54% 70%, rgba(118,188,255,0.18) 0%, rgba(118,188,255,0.1) 18%, transparent 46%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          opacity: 0.72,
          filter: "blur(14px)",
          mixBlendMode: "screen",
          background:
            "radial-gradient(ellipse 72% 11% at 50% 71%, rgba(138,206,255,0.34) 0%, rgba(138,206,255,0.14) 26%, transparent 68%), radial-gradient(circle at 62% 75%, rgba(255,208,120,0.32) 0%, rgba(255,208,120,0.12) 10%, transparent 20%)",
        }}
      />

      {/* Robot */}
      <div
        className="absolute pointer-events-none select-none"
        style={{
          bottom: "18%",
          right: "5%",
          width: "clamp(300px, 36vw, 500px)",
          zIndex: 5,
        }}
      >
        <Image
          src="/haikei/robot_telescope_transparent_rough.png"
          alt=""
          width={1536}
          height={1024}
          priority
          sizes="(max-width: 480px) 56vw, 36vw"
          className="w-full h-auto"
          style={{
            filter:
              "drop-shadow(0 24px 40px rgba(0,0,0,0.5)) drop-shadow(0 8px 18px rgba(60,110,210,0.14))",
          }}
        />
      </div>

      {/* Neuron */}
      <div
        className="absolute pointer-events-none select-none"
        style={{
          top: "3%",
          right: "1%",
          width: "clamp(360px, 40vw, 600px)",
          zIndex: 3,
          opacity: 0.9,
          mixBlendMode: "screen",
        }}
      >
        <Image
          src="/haikei/neuron.png"
          alt=""
          width={1536}
          height={1024}
          sizes="40vw"
          className="w-full h-auto object-contain"
        />
      </div>

      {/* Text */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          textAlign: "left",
          padding: "0 clamp(32px, 6vw, 96px)",
          maxWidth: 480,
          alignSelf: "flex-start",
          marginTop: "clamp(96px, 14vh, 172px)",
          animation: "introTextIn 1.2s ease-out both",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(1.8rem, 3.2vw, 2.8rem)",
            fontWeight: 900,
            color: "#fff",
            letterSpacing: "-0.03em",
            lineHeight: 1.3,
            textShadow: "0 4px 30px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5)",
            marginBottom: 16,
          }}
        >
          あなたの本質を、
          <br />
          観測しつづける。
        </h1>
        <p
          style={{
            fontSize: "clamp(11px, 0.9vw, 13px)",
            color: "rgba(255,255,255,0.50)",
            lineHeight: 1.6,
            textShadow: "0 1px 8px rgba(0,0,0,0.4)",
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
            letterSpacing: 0.5,
          }}
        >
          Aneurasync
        </p>
      </div>

      <style>{`
        @keyframes introTextIn {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
