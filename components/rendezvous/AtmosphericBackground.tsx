"use client";

/**
 * AtmosphericBackground
 * 時間帯に応じた大気の雰囲気背景 + キャンバスベースのパーティクルシステム
 * グラスモーフィズムのウォームベースカラーを維持しつつ、微細な演出を加える
 */

import { ReactNode, useEffect, useRef, useState, useCallback } from "react";
import {
  getCurrentTimeSlotLocal,
  getTimeAtmosphere,
  getParticleConfig,
} from "@/lib/rendezvous/atmosphere";
import type { TimeSlot } from "@/lib/rendezvous/avatarScheduler";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  children: ReactNode;
};

type Particle = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  fadeDir: 1 | -1; // 1 = fading in, -1 = fading out
  speed: number;
  drift: number; // horizontal drift per frame
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AtmosphericBackground({ children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const scrollOffsetRef = useRef(0);
  const [timeSlot, setTimeSlot] = useState<TimeSlot>(() =>
    getCurrentTimeSlotLocal(),
  );

  const atmosphere = getTimeAtmosphere(timeSlot);
  const pConfig = getParticleConfig(timeSlot);

  // -- Initialize particles --
  const initParticles = useCallback(
    (width: number, height: number) => {
      const particles: Particle[] = [];
      for (let i = 0; i < pConfig.count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size:
            pConfig.sizeRange[0] +
            Math.random() * (pConfig.sizeRange[1] - pConfig.sizeRange[0]),
          opacity: Math.random() * pConfig.opacity,
          fadeDir: Math.random() > 0.5 ? 1 : -1,
          speed:
            pConfig.speedRange[0] +
            Math.random() * (pConfig.speedRange[1] - pConfig.speedRange[0]),
          drift: (Math.random() - 0.5) * 0.3,
        });
      }
      particlesRef.current = particles;
    },
    [pConfig],
  );

  // -- Animation loop --
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      initParticles(window.innerWidth, window.innerHeight);
    };

    resize();
    window.addEventListener("resize", resize);

    // Scroll interaction: scatter particles slightly
    const onScroll = () => {
      scrollOffsetRef.current = Math.min(window.scrollY / 500, 1);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const animate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const scrollInfluence = scrollOffsetRef.current;

      for (const p of particlesRef.current) {
        // Move upward
        p.y -= p.speed + scrollInfluence * 0.3;
        p.x += p.drift + scrollInfluence * (p.drift > 0 ? 0.5 : -0.5);

        // Fade in/out
        const fadeSpeed = 0.003 + scrollInfluence * 0.002;
        p.opacity += p.fadeDir * fadeSpeed;
        if (p.opacity >= pConfig.opacity) {
          p.opacity = pConfig.opacity;
          p.fadeDir = -1;
        } else if (p.opacity <= 0) {
          p.opacity = 0;
          p.fadeDir = 1;
          // Reset to bottom when fully faded out
          p.y = h + 10;
          p.x = Math.random() * w;
        }

        // Wrap around if off screen
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        // Draw glowing circle
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

        // Glow effect via shadow
        ctx.shadowColor = pConfig.color;
        ctx.shadowBlur = pConfig.glowRadius;
        ctx.fillStyle = pConfig.color;
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [initParticles, pConfig]);

  // -- Recalculate time slot every 5 minutes --
  useEffect(() => {
    const interval = setInterval(() => {
      const newSlot = getCurrentTimeSlotLocal();
      setTimeSlot((prev) => (prev !== newSlot ? newSlot : prev));
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: atmosphere.bgGradient,
        transition: "background 2s ease-in-out",
      }}
    >
      {/* Canvas particle layer */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* Content layer */}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
