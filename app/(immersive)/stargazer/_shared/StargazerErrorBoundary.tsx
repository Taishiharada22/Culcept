"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  tabName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Stargazer タブ用エラーバウンダリ
 * 個別タブのレンダリングエラーを捕捉し、他タブに影響させない
 */
export default class StargazerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Stargazer ${this.props.tabName ?? "Tab"}] Render error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "32px 20px",
            textAlign: "center",
            color: "rgba(56,62,84,0.7)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {this.props.tabName ? `${this.props.tabName}の` : ""}表示中にエラーが発生しました
          </p>
          <p style={{ fontSize: 12, color: "rgba(56,62,84,0.5)", marginBottom: 16 }}>
            一時的な問題の可能性があります。ページを再読み込みしてください。
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: undefined });
              window.location.reload();
            }}
            style={{
              padding: "8px 20px",
              borderRadius: 10,
              background: "rgba(140,120,60,0.08)",
              border: "1px solid rgba(140,120,60,0.15)",
              color: "rgba(140,120,60,0.8)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
