"use client";

import { Component, type ReactNode } from "react";

const C = { s1: "#ffffff", s2: "#f5f6fa", t1: "#1a1a2e", t3: "#8888a0", t4: "#c8c8dc", neural: "#8B5CF6" };

interface Props { children: ReactNode; fallbackMessage?: string; }
interface State { hasError: boolean; }

export default class CardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("GenomeCard render error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl text-center py-10" style={{
          background: C.s1, border: `1px solid ${C.s2}`, padding: 24,
        }}>
          <div style={{ fontSize: 36, color: C.t4, marginBottom: 12 }}>✦</div>
          <p style={{ fontSize: 13, color: C.t3 }}>
            {this.props.fallbackMessage ?? "カードの表示に問題が発生しました"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 px-6 py-2 rounded-xl text-sm font-medium"
            style={{ background: C.s2, color: C.t1 }}
          >
            再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
