"use client";

import { getCurrentTimeSlotLocal, getTimeAtmosphere } from "@/lib/rendezvous/atmosphere";

// =============================================================================
// ActivityPulseOrb — 分身が「生きている」ことを示す呼吸するオーブ
// =============================================================================

interface ActivityPulseOrbProps {
  intensity: number; // 0..1
}

export default function ActivityPulseOrb({ intensity }: ActivityPulseOrbProps) {
  const timeSlot = getCurrentTimeSlotLocal();
  const atmosphere = getTimeAtmosphere(timeSlot);
  const accentColor = atmosphere.accentColor;

  // Animation duration: faster when more active
  const breatheDuration = 4 / (0.5 + intensity);

  return (
    <div className="relative flex items-center justify-center" style={{ width: 60, height: 60 }}>
      <div
        className="w-[60px] h-[60px] rounded-full"
        style={{
          background: `radial-gradient(circle at 40% 40%, ${accentColor}88, ${accentColor}33, transparent)`,
          boxShadow: `0 0 ${20 + intensity * 20}px ${accentColor}40`,
          animation: `orbBreathe ${breatheDuration}s ease-in-out infinite`,
        }}
      />

      <style jsx>{`
        @keyframes orbBreathe {
          0%, 100% {
            transform: scale(0.95);
            opacity: 0.4;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.7;
          }
        }
      `}</style>
    </div>
  );
}
