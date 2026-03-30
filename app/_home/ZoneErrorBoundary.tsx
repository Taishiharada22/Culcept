"use client";

import React from "react";

type Props = {
  zoneName: string;
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string | null;
};

/**
 * Lightweight error boundary for Home page zones.
 * If a zone crashes, it shows a minimal fallback with retry instead of breaking the whole page.
 */
export default class ZoneErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[Home:${this.props.zoneName}]`, error?.message, error?.stack, errorInfo?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "16px 20px",
            maxWidth: 780,
            margin: "8px auto",
            textAlign: "center",
            color: "#8888a0",
            fontSize: 12,
          }}
        >
          一時的にこのセクションを表示できません
          <br />
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
            style={{
              marginTop: 8,
              padding: "6px 16px",
              borderRadius: 8,
              background: "rgba(99,102,241,0.08)",
              border: "1px solid rgba(99,102,241,0.15)",
              color: "#6366F1",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            再試行
          </button>
          {process.env.NODE_ENV === "development" && this.state.errorMessage && (
            <div style={{ marginTop: 8, fontSize: 10, color: "#ef4444", fontFamily: "monospace" }}>
              {this.state.errorMessage}
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
