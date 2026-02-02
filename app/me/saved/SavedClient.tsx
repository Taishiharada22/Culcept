// app/me/saved/SavedClient.tsx
"use client";

import React from "react";

export default function SavedClient({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}

            {/* ✅ styled-jsx は Client Component でのみ使う */}
            <style jsx global>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
        </>
    );
}
