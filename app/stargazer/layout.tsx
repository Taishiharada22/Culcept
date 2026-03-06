// app/stargazer/layout.tsx
// Stargazer専用レイアウト: Precision Observatory — 天文台の没入体験

import StarParticles from "./_components/StarParticles";

export default function StargazerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* ── Google Fonts ── */
            @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Noto+Serif+JP:wght@400;500;600;700&display=swap');

            :root {
              --font-display: 'Cormorant Garamond', 'Noto Serif JP', 'Georgia', serif;
              --font-body: 'IBM Plex Sans', system-ui, sans-serif;
              --font-mono: 'IBM Plex Mono', 'Menlo', monospace;
              --sg-amber-400: #fbbf24;
              --sg-amber-300: #fcd34d;
              --sg-amber-500: #f59e0b;
            }

            /* Stargazer: SiteHeaderを非表示 */
            body > div > header,
            header.sticky {
              display: none !important;
            }
            /* Stargazer: ルートラッパーのpadding/maxwidthを解除 */
            body > div,
            body > div > div {
              max-width: none !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            /* Stargazer: bodyの背景を深宇宙色に */
            body {
              background: #060a14 !important;
              overflow-x: hidden;
            }
            /* Stargazer: スクロールバーをダークに */
            ::-webkit-scrollbar { width: 4px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            .scrollbar-hide::-webkit-scrollbar { display: none; }
            .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

            /* ── Card Hierarchy ── */
            .card-hero {
              position: relative;
              background: linear-gradient(165deg, rgba(251,191,36,0.08) 0%, rgba(20,20,40,0.6) 30%, rgba(10,10,25,0.8) 100%);
              backdrop-filter: blur(24px);
              border: 1px solid rgba(251,191,36,0.15);
              border-radius: 1.25rem;
              padding: 2.5rem;
              overflow: hidden;
              box-shadow: 0 0 0 1px rgba(251,191,36,0.05), 0 8px 32px rgba(0,0,0,0.4), 0 0 80px -20px rgba(251,191,36,0.15);
            }
            .card-hero::before {
              content: '';
              position: absolute;
              top: 16px; left: 16px;
              width: 32px; height: 32px;
              border-top: 1px solid rgba(251,191,36,0.3);
              border-left: 1px solid rgba(251,191,36,0.3);
              pointer-events: none;
            }
            .card-hero::after {
              content: '';
              position: absolute;
              bottom: 16px; right: 16px;
              width: 32px; height: 32px;
              border-bottom: 1px solid rgba(251,191,36,0.3);
              border-right: 1px solid rgba(251,191,36,0.3);
              pointer-events: none;
            }
            .card-instrument {
              background: rgba(12,12,28,0.7);
              backdrop-filter: blur(16px);
              border: 1px solid rgba(255,255,255,0.06);
              border-radius: 1rem;
              padding: 1.75rem;
              box-shadow: 0 4px 24px rgba(0,0,0,0.3);
            }
            .card-info {
              background: rgba(255,255,255,0.02);
              border: 1px solid rgba(255,255,255,0.04);
              border-radius: 0.75rem;
              padding: 1.25rem;
            }

            /* ── Font utility classes ── */
            .font-display { font-family: var(--font-display); }
            .font-body { font-family: var(--font-body); }
            .font-mono-sg { font-family: var(--font-mono); }

            /* ── Animations ── */
            @keyframes twinkle {
              0%, 100% { opacity: 0; }
              50% { opacity: 0.6; }
            }
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(16px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes tabEnter {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .stagger-item {
              opacity: 0;
              animation: slideUp 0.6s cubic-bezier(0.16,1,0.3,1) forwards;
            }
            .stagger-item:nth-child(1) { animation-delay: 0.05s; }
            .stagger-item:nth-child(2) { animation-delay: 0.12s; }
            .stagger-item:nth-child(3) { animation-delay: 0.19s; }
            .stagger-item:nth-child(4) { animation-delay: 0.26s; }
            .stagger-item:nth-child(5) { animation-delay: 0.33s; }
            .tab-content-enter { animation: tabEnter 0.35s cubic-bezier(0.16,1,0.3,1) forwards; }

            /* ── Reticle grid (CSS only) ── */
            .stargazer-shell::after {
              content: '';
              position: fixed;
              inset: 0;
              z-index: 0;
              pointer-events: none;
              opacity: 0.03;
              background-image:
                linear-gradient(rgba(251,191,36,0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(251,191,36,0.5) 1px, transparent 1px),
                linear-gradient(rgba(251,191,36,1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(251,191,36,1) 1px, transparent 1px);
              background-size: 40px 40px, 40px 40px, 200px 200px, 200px 200px;
              mask-image: radial-gradient(ellipse at 50% 50%, black 20%, transparent 70%);
              -webkit-mask-image: radial-gradient(ellipse at 50% 50%, black 20%, transparent 70%);
            }

            /* ── prefers-reduced-motion ── */
            @media (prefers-reduced-motion: reduce) {
              .stargazer-shell::after { display: none; }
              .star-particles { display: none !important; }
              .reticle-overlay { display: none !important; }
              .stagger-item { animation: none; opacity: 1; }
            }
          `,
        }}
      />
      <div className="stargazer-shell relative min-h-screen">
        {/* 背景画像レイヤー */}
        <div
          className="fixed inset-0 z-0"
          style={{
            backgroundImage: "url('/stargazer_bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
          }}
        />
        {/* 読みやすさ用オーバーレイ */}
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse at 50% 20%, rgba(8,8,25,0.4) 0%, rgba(4,4,12,0.88) 70%),
              linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)
            `,
          }}
        />
        {/* レティクル十字線 */}
        <div className="reticle-overlay fixed inset-0 pointer-events-none z-[1] flex items-center justify-center">
          <div className="absolute w-[200px] h-[1px] bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
          <div className="absolute w-[1px] h-[200px] bg-gradient-to-b from-transparent via-amber-500/15 to-transparent" />
          <div className="absolute w-8 h-8 rounded-full border border-amber-500/10" />
          <div className="absolute w-16 h-16 rounded-full border border-amber-500/5" />
        </div>
        {/* 星パーティクル */}
        <StarParticles />
        {/* コンテンツ */}
        <div className="relative z-10">{children}</div>
      </div>
    </>
  );
}
