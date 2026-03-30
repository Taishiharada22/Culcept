"use client";
import React from "react";

type Props = { children: React.ReactNode; fallbackMessage?: string };
type State = { hasError: boolean; error: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[MyStyle ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg rounded-2xl border border-red-200/60 bg-red-50/80 p-6 text-center backdrop-blur">
          <div className="text-3xl">⚠️</div>
          <h3 className="mt-3 text-lg font-bold text-red-800">
            {this.props.fallbackMessage ?? "表示中にエラーが発生しました"}
          </h3>
          <p className="mt-2 text-sm text-red-600">
            {this.state.error?.message ?? "不明なエラー"}
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
            >
              リセットして再試行
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            >
              再読み込み
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
