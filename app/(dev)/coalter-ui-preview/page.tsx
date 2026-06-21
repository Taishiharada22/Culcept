/**
 * (dev) CoAlter UI preview — 認証/flag 不要で CoAlterTab を直接マウントし、
 *   Home/Talk のデザインを目視確認するための **dev-only プレビュー**（本番導線に無し）。
 *
 * 全 flag OFF・fixture data のまま（send/write/brain なし）。視覚検証専用。
 */
import { CoAlterTab } from "@/app/(culcept)/plan/tabs/coalter/CoAlterTab";

export default function CoAlterUiPreviewPage() {
  return (
    <div className="min-h-screen bg-[#eef0f4]">
      <CoAlterTab />
    </div>
  );
}
