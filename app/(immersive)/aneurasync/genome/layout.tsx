// app/aneurasync/genome/layout.tsx
// Genome — グローバルヘッダー/ナビを非表示にして独自UIに専念

export default function GenomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* Genome-specific keyframes */
            @keyframes genome-pulse {
              0%, 100% { opacity: 0.5; }
              50% { opacity: 1; }
            }
            @keyframes genome-backbone-draw {
              from { stroke-dashoffset: 2000; }
              to { stroke-dashoffset: 0; }
            }
            @keyframes genome-breathe {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.03); }
            }
            @keyframes genome-glow {
              0%, 100% { filter: drop-shadow(0 0 4px rgba(139,92,246,0.2)); }
              50% { filter: drop-shadow(0 0 12px rgba(139,92,246,0.45)); }
            }
            @keyframes genome-spiral-draw {
              from { stroke-dashoffset: 3000; }
              to { stroke-dashoffset: 0; }
            }
            @keyframes radar-gap-pulse {
              0%, 100% { opacity: 0.12; }
              50% { opacity: 0.32; }
            }
            @media (prefers-reduced-motion: reduce) {
              * { animation-duration: 0s !important; transition-duration: 0s !important; }
            }
          `,
        }}
      />
      {children}
    </>
  );
}
