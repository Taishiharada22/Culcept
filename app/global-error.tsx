"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
          <h2 style={{ fontSize: 20, marginBottom: 16 }}>問題が発生しました</h2>
          <p style={{ color: "#555", marginBottom: 24 }}>エラーは自動的に報告されました。</p>
          <button
            onClick={reset}
            style={{
              padding: "10px 24px",
              borderRadius: 12,
              border: "none",
              background: "#6366F1",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            もう一度試す
          </button>
        </div>
      </body>
    </html>
  );
}
