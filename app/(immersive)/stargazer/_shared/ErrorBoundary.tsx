"use client";
import React from "react";

type Props = { children: React.ReactNode; fallbackMessage?: string };
type State = { hasError: boolean; error: Error | null };

/**
 * Stargazer-themed error boundary.
 * Styled to match the observatory aesthetic — calm, reassuring.
 */
export default class StargazerErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[Stargazer ErrorBoundary]", error.message, error.stack);
    console.error("[Stargazer ErrorBoundary] Component stack:", info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-6">
          <div
            className="mx-auto max-w-md rounded-2xl border p-8 text-center"
            style={{
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(16px)",
              borderColor: "rgba(176,144,80,0.2)",
              boxShadow: "0 8px 32px rgba(120,130,160,0.08)",
            }}
          >
            {/* Icon */}
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: "linear-gradient(135deg, rgba(200,195,230,0.3), rgba(176,144,80,0.15))",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(100,90,140,0.7)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
            </div>

            <h3
              className="mt-4 text-lg font-display"
              style={{ color: "rgba(30,35,55,0.85)", fontFamily: "var(--font-display)" }}
            >
              {this.props.fallbackMessage ?? "観測中に問題が発生しました"}
            </h3>

            <p
              className="mt-2 text-sm"
              style={{ color: "rgba(100,105,130,0.7)", fontFamily: "var(--font-body)" }}
            >
              一時的な不具合です。少し時間をおいて再度お試しください。
            </p>

            {this.state.error && (
              <p
                className="mt-2 rounded-lg p-2 text-xs"
                style={{
                  background: "rgba(200,195,230,0.12)",
                  color: "rgba(100,90,140,0.7)",
                  fontFamily: "var(--font-mono)",
                  wordBreak: "break-all",
                }}
              >
                {this.state.error.message}
              </p>
            )}

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="rounded-full px-5 py-2 text-sm font-medium transition-all hover:scale-[1.03]"
                style={{
                  background: "rgba(255,255,255,0.8)",
                  border: "1px solid rgba(176,144,80,0.25)",
                  color: "rgba(100,90,140,0.8)",
                  fontFamily: "var(--font-body)",
                }}
              >
                再試行
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full px-5 py-2 text-sm font-medium transition-all hover:scale-[1.03]"
                style={{
                  background: "linear-gradient(135deg, rgba(176,144,80,0.9), rgba(160,130,70,0.9))",
                  color: "#fff",
                  fontFamily: "var(--font-body)",
                }}
              >
                ページを再読み込み
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
