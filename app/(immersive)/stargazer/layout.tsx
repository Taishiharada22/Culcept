// app/stargazer/layout.tsx
// Stargazer — 朝の光に包まれた観測空間
"use client";

import "./components/shared/design-tokens.css";
import StarParticles from "./_components/StarParticles";
import StargazerLayoutClient from "./_components/StargazerLayoutClient";
import PageTransition from "./_shared/PageTransition";
import StargazerErrorBoundary from "./_shared/ErrorBoundary";
import { usePathname } from "next/navigation";

export default function StargazerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* ── Fonts ── */
            @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Noto+Serif+JP:wght@400;500;600;700&display=swap');

            :root {
              --font-display: 'Cormorant Garamond', 'Noto Serif JP', 'Georgia', serif;
              --font-body: 'IBM Plex Sans', system-ui, sans-serif;
              --font-mono: 'IBM Plex Mono', 'Menlo', monospace;
              --sg-gold: #b09050;
              --sg-gold-light: #c9b88a;
              --sg-warm-white: #f8f6f2;
              --sg-page-bg: #fafbfe;
              --sg-layer0: radial-gradient(ellipse 130% 70% at 50% 0%, rgba(230,238,255,0.7) 0%, transparent 55%),
                radial-gradient(ellipse 80% 60% at 85% 15%, rgba(215,225,250,0.35) 0%, transparent 50%),
                radial-gradient(ellipse 70% 50% at 10% 55%, rgba(225,235,255,0.25) 0%, transparent 50%),
                radial-gradient(ellipse 100% 50% at 50% 100%, rgba(245,240,230,0.3) 0%, transparent 50%),
                linear-gradient(180deg, #fafbfe 0%, #f5f7fc 30%, #f2f4fb 60%, #f7f8fc 100%);
              --sg-nebula1: radial-gradient(circle, rgba(180,200,240,0.12) 0%, rgba(190,210,250,0.06) 40%, transparent 70%);
              --sg-nebula2: radial-gradient(circle, rgba(200,195,230,0.08) 0%, rgba(190,195,230,0.04) 40%, transparent 70%);
              --sg-nebula3: radial-gradient(circle, rgba(220,200,150,0.07) 0%, rgba(210,190,140,0.03) 40%, transparent 70%);
              --sg-aurora: linear-gradient(90deg, transparent 5%, rgba(180,195,220,0.15) 30%, rgba(200,190,210,0.1) 50%, rgba(180,195,220,0.15) 70%, transparent 95%);
              --sg-grid-fine: rgba(160,170,200,0.03);
              --sg-grid-coarse: rgba(160,170,200,0.05);
              --sg-crosshair: rgba(160,170,200,0.08);
              --sg-crosshair-ring: rgba(160,170,200,0.05);
              --sg-scrollbar: rgba(120,120,150,0.12);
              --sg-scrollbar-hover: rgba(120,120,150,0.2);
            }
            @media (prefers-color-scheme: dark) {
              :root {
                --sg-page-bg: #080b12;
                --sg-layer0: radial-gradient(ellipse 130% 70% at 50% 0%, rgba(15,25,60,0.7) 0%, transparent 55%),
                  radial-gradient(ellipse 80% 60% at 85% 15%, rgba(20,30,65,0.4) 0%, transparent 50%),
                  radial-gradient(ellipse 70% 50% at 10% 55%, rgba(15,20,55,0.3) 0%, transparent 50%),
                  radial-gradient(ellipse 100% 50% at 50% 100%, rgba(30,25,15,0.3) 0%, transparent 50%),
                  linear-gradient(180deg, #080b12 0%, #0a0e18 30%, #0c1020 60%, #080b12 100%);
                --sg-nebula1: radial-gradient(circle, rgba(60,80,160,0.2) 0%, rgba(70,90,180,0.08) 40%, transparent 70%);
                --sg-nebula2: radial-gradient(circle, rgba(100,80,180,0.12) 0%, rgba(90,80,170,0.05) 40%, transparent 70%);
                --sg-nebula3: radial-gradient(circle, rgba(160,130,60,0.1) 0%, rgba(140,110,50,0.04) 40%, transparent 70%);
                --sg-aurora: linear-gradient(90deg, transparent 5%, rgba(100,130,200,0.12) 30%, rgba(140,100,180,0.08) 50%, rgba(100,130,200,0.12) 70%, transparent 95%);
                --sg-grid-fine: rgba(80,90,130,0.04);
                --sg-grid-coarse: rgba(80,90,130,0.06);
                --sg-crosshair: rgba(100,110,150,0.1);
                --sg-crosshair-ring: rgba(100,110,150,0.06);
                --sg-scrollbar: rgba(100,110,150,0.15);
                --sg-scrollbar-hover: rgba(100,110,150,0.25);
              }
            }

            body {
              background: var(--sg-page-bg, #fafbfe) !important;
              overflow-x: hidden;
              transition: background 0.6s ease;
            }

            /* Scrollbar */
            ::-webkit-scrollbar { width: 4px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: var(--sg-scrollbar); border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: var(--sg-scrollbar-hover); }
            .scrollbar-hide::-webkit-scrollbar { display: none; }
            .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

            /* ── Font utilities ── */
            .font-display { font-family: var(--font-display); }
            .font-body { font-family: var(--font-body); }
            .font-mono-sg { font-family: var(--font-mono); }

            /* ── Light theme color overrides for inline styles ── */
            .stargazer-shell [style*="rgba(240,235,220"] {
              color: rgba(30,35,55,0.88) !important;
            }
            .stargazer-shell [style*="rgba(200,195,170"] {
              color: rgba(100,105,130,0.7) !important;
            }
            .stargazer-shell [style*="color: rgba(8,10,24"] {
              color: rgba(30,35,55,0.88) !important;
            }

            /* ── Animations ── */
            @keyframes sg-twinkle {
              0%, 100% { opacity: 0; }
              50% { opacity: 0.7; }
            }
            @keyframes sg-twinkle-bright {
              0%, 100% { opacity: 0.15; }
              50% { opacity: 1; }
            }
            @keyframes sg-float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            @keyframes sg-glow-pulse {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 0.7; }
            }
            @keyframes sg-orbit-slow {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes sg-fade-up {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes sg-breathe {
              0%, 100% { transform: scale(1); opacity: 0.6; }
              50% { transform: scale(1.05); opacity: 1; }
            }
            @keyframes sg-nebula-drift {
              0% { transform: translate(0, 0) scale(1); }
              33% { transform: translate(15px, -10px) scale(1.05); }
              66% { transform: translate(-10px, 8px) scale(0.97); }
              100% { transform: translate(0, 0) scale(1); }
            }
            @keyframes sg-aurora-shift {
              0% { opacity: 0.4; filter: hue-rotate(0deg); }
              50% { opacity: 0.65; filter: hue-rotate(10deg); }
              100% { opacity: 0.4; filter: hue-rotate(0deg); }
            }

            /* ── Dark mode star brightness ── */
            @media (prefers-color-scheme: dark) {
              .star-particles { opacity: 1 !important; }
              .star-particles .star-distant { opacity: 0.4 !important; }
              .star-particles .star-mid { filter: brightness(2.5); }
              .star-particles .star-bright { filter: brightness(3); }
            }

            /* ── Global readability boost for Stargazer ── */
            /* Tailwind font-size classes を一括拡大 */
            .stargazer-shell .text-xs { font-size: 0.85rem !important; line-height: 1.4 !important; }
            .stargazer-shell .text-sm { font-size: 0.95rem !important; line-height: 1.5 !important; }
            .stargazer-shell .text-base { font-size: 1.1rem !important; }
            .stargazer-shell .text-lg { font-size: 1.25rem !important; }
            .stargazer-shell .text-xl { font-size: 1.4rem !important; }
            .stargazer-shell .text-2xl { font-size: 1.7rem !important; }
            .stargazer-shell .text-3xl { font-size: 2.1rem !important; }
            .stargazer-shell .text-4xl { font-size: 2.5rem !important; }
            .stargazer-shell .text-5xl { font-size: 3.2rem !important; }

            /* Tailwind arbitrary values の底上げ */
            .stargazer-shell [class*="text-[8px]"] { font-size: 12px !important; }
            .stargazer-shell [class*="text-[9px]"] { font-size: 12px !important; }
            .stargazer-shell [class*="text-[10px]"] { font-size: 13px !important; }
            .stargazer-shell [class*="text-[11px]"] { font-size: 14px !important; }
            .stargazer-shell [class*="text-[12px]"] { font-size: 14px !important; }
            .stargazer-shell [class*="text-[13px]"] { font-size: 15px !important; }

            /* テキスト色のコントラスト強化 */
            .stargazer-shell {
              --sg-text-readability-boost: 1;
            }

            /* ── Reduced motion ── */
            @media (prefers-reduced-motion: reduce) {
              .star-particles { display: none !important; }
              .sg-nebula-layer { display: none !important; }
              * { animation-duration: 0s !important; transition-duration: 0s !important; }
            }
          `,
        }}
      />
      <div className="stargazer-shell relative min-h-screen">
        {/* ── Layer 0: Base gradient (light/dark adaptive via CSS var) ── */}
        <div
          className="fixed inset-0 z-[0] pointer-events-none"
          style={{ background: 'var(--sg-layer0)' }}
        />

        {/* ── Layer 1: Nebula glow — very subtle, morning light ── */}
        <div className="sg-nebula-layer fixed inset-0 z-[1] pointer-events-none overflow-hidden">
          {/* Upper-right — pale blue wash */}
          <div
            style={{
              position: 'absolute',
              top: '-10%',
              right: '-15%',
              width: '60vw',
              height: '50vh',
              borderRadius: '50%',
              background: 'var(--sg-nebula1)',
              filter: 'blur(60px)',
              animation: 'sg-nebula-drift 40s ease-in-out infinite',
            }}
          />
          {/* Center-left — very pale lavender */}
          <div
            style={{
              position: 'absolute',
              top: '30%',
              left: '-10%',
              width: '50vw',
              height: '40vh',
              borderRadius: '50%',
              background: 'var(--sg-nebula2)',
              filter: 'blur(50px)',
              animation: 'sg-nebula-drift 50s ease-in-out infinite reverse',
            }}
          />
          {/* Bottom — warm pale gold hint */}
          <div
            style={{
              position: 'absolute',
              bottom: '-5%',
              left: '30%',
              width: '50vw',
              height: '30vh',
              borderRadius: '50%',
              background: 'var(--sg-nebula3)',
              filter: 'blur(40px)',
              animation: 'sg-nebula-drift 35s ease-in-out 5s infinite',
            }}
          />
          {/* Horizon aurora line — very subtle silver */}
          <div
            style={{
              position: 'absolute',
              top: '15%',
              left: '0',
              right: '0',
              height: '1px',
              background: 'var(--sg-aurora)',
              filter: 'blur(2px)',
              animation: 'sg-aurora-shift 20s ease-in-out infinite',
            }}
          />
        </div>

        {/* ── Layer 2: Star particles ── */}
        <StarParticles />

        {/* ── Layer 3: Reticle grid — ultra-fine, silver ── */}
        <div
          className="fixed inset-0 pointer-events-none z-[3]"
          style={{
            backgroundImage: `
              linear-gradient(var(--sg-grid-fine) 1px, transparent 1px),
              linear-gradient(90deg, var(--sg-grid-fine) 1px, transparent 1px),
              linear-gradient(var(--sg-grid-coarse) 1px, transparent 1px),
              linear-gradient(90deg, var(--sg-grid-coarse) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
            maskImage: 'radial-gradient(ellipse 70% 55% at 50% 25%, black 0%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 25%, black 0%, transparent 75%)',
          }}
        />

        {/* ── Layer 4: Reticle crosshair — faint silver ── */}
        <div className="fixed inset-0 pointer-events-none z-[3] flex items-start justify-center" style={{ paddingTop: '28vh' }}>
          <div className="relative" style={{ width: 200, height: 200 }}>
            <div className="absolute left-1/2 top-0 bottom-0 w-px" style={{ background: `linear-gradient(180deg, transparent, var(--sg-crosshair), transparent)` }} />
            <div className="absolute top-1/2 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, var(--sg-crosshair), transparent)` }} />
            <div className="absolute rounded-full" style={{
              top: '50%', left: '50%',
              width: 60, height: 60,
              transform: 'translate(-50%, -50%)',
              border: '1px solid var(--sg-crosshair-ring)',
            }} />
            <div className="absolute rounded-full" style={{
              top: '50%', left: '50%',
              width: 120, height: 120,
              transform: 'translate(-50%, -50%)',
              border: '1px solid var(--sg-crosshair-ring)',
            }} />
          </div>
        </div>

        {/* ── Content ── */}
        <StargazerLayoutClient emotionalState="calm">
          <div className="relative z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <StargazerErrorBoundary>
              <PageTransition pageKey={pathname}>
                {children}
              </PageTransition>
            </StargazerErrorBoundary>
          </div>
        </StargazerLayoutClient>
      </div>
    </>
  );
}
