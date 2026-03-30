"use client";
import { ALL_CONTEXTS, CONTEXT_BACKGROUND_GRADIENTS } from "@/lib/rendezvous/questions/types";
import type { ContextType } from "@/lib/rendezvous/questions/types";

type Props = {
  activeContext: ContextType;
};

export default function RendezvousBackgroundLayers({ activeContext }: Props) {
  return (
    <>
      {ALL_CONTEXTS.map((ctx) => (
        <div
          key={ctx}
          style={{
            position: "fixed",
            inset: 0,
            background: CONTEXT_BACKGROUND_GRADIENTS[ctx],
            opacity: activeContext === ctx ? 1 : 0,
            transition: "opacity 0.6s ease",
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
      ))}
    </>
  );
}
