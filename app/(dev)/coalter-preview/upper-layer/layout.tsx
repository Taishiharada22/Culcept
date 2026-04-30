/**
 * CoAlter Stage 1 上部レイヤー preview — layout
 *
 * 正本: layout plan v0.2 §4.1 (Phase L1-a)
 *
 * preview 用 layout。本番 layout (app/layout.tsx) と分離し、上部レイヤー
 * 試作中の影響範囲を `app/(dev)/coalter-preview/upper-layer/**` 内に閉じる。
 *
 * 不可触対象:
 *   - 本番 ChatClient (app/(culcept)/talk/[threadId]/ChatClient.tsx)
 *   - lib/coalter/** (executor / understanding / presence)
 *   - 既存 (dev)/coalter-preview/page.tsx (legacy preview、本書範囲外)
 *
 * 配置原則:
 *   - 認証不要 (dev route group が既に passthrough)
 *   - preview 完結、本番 navigation に乗せない
 *   - glassmorphism design system の borrow は L1-b 以降で行う (本 layout は scaffold のみ)
 */
export default function UpperLayerPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f6f3",
        color: "#1a1a2e",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif",
      }}
    >
      {children}
    </div>
  );
}
