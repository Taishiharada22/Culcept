"use client";

/**
 * Stage 4 L4-k — Upper Layer Error Boundary (class component)
 *
 * 正本: layout plan v0.3 §7.11 / UI spec §6.8 非判定性継承
 *
 * UpperLayerMountActive の child throw を catch し、StateErrorFallback を mount。
 * §6.8 非判定性: 警告色なし、indigo 系で穏やかに通知。
 *
 * 範囲 (CEO 厳守 2026-04-30):
 *   - UpperLayerMountActive のみを包む
 *   - ChatClient の chat input / scroll / message rendering は包まない
 *   - retry で内部 state を reset (children 再 mount)
 *
 * telemetry (CEO 厳守):
 *   - 本 phase は console.error のみ
 *   - Sentry breadcrumb / telemetry 8 項目は L4-j で別接続 (L4-j 衝突回避)
 *
 * React の古典 ErrorBoundary は class component 必須:
 *   - getDerivedStateFromError は static method、hook で代替不可
 *   - componentDidCatch も class instance method
 *
 * 新 dependency 追加なし (CEO 厳守、react-error-boundary 不使用)。
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

import StateErrorFallback from "./StateErrorFallback";

interface UpperLayerErrorBoundaryProps {
  children: ReactNode;
}

interface UpperLayerErrorBoundaryState {
  error: Error | null;
}

export default class UpperLayerErrorBoundary extends Component<
  UpperLayerErrorBoundaryProps,
  UpperLayerErrorBoundaryState
> {
  state: UpperLayerErrorBoundaryState = { error: null };

  static getDerivedStateFromError(
    error: Error,
  ): UpperLayerErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // CEO 厳守: telemetry / Sentry breadcrumb は L4-j で別接続、本 phase は console.error のみ
    // eslint-disable-next-line no-console
    console.error(
      "[UpperLayerErrorBoundary]",
      error,
      info.componentStack,
    );
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <StateErrorFallback
          state="S0"
          mode="normal"
          error={this.state.error}
          onRetry={this.reset}
        />
      );
    }
    return this.props.children;
  }
}
