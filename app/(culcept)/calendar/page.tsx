// app/(culcept)/calendar/page.tsx
//
// Phase 6（2026-06-01・CEO 承認）: 旧スタンドアロン /calendar 画面は /plan の Calendar タブに UI 移行済。
//   ユーザーが画面に到達できないよう、 /plan へ redirect する（307 一時 redirect = 可逆）。
//
// 温存（「バックで動くのは OK」）:
//   - calendar/_lib/*（推薦エンジン outfitEngine / rotationTracker / 学習）は /plan が facade
//     `@/lib/shared/outfitEngine` 経由で使用中 → 無改修で生かす。
//   - /api/calendar/*（server-sync）/ culcept_calendar_worn_v1（学習正本）も無改修。
//   - CalendarPageClient / _components / _lib の物理削除は Phase 7（別ゲート）。 ここでは画面到達のみ塞ぐ。
import { redirect } from "next/navigation";

export default function CalendarPage() {
    redirect("/plan");
}
