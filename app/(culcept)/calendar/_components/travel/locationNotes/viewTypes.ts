// app/(culcept)/calendar/_components/travel/locationNotes/viewTypes.ts
// Location Notes 各タブ view の共通 props。
import type { LocationNotesData, LocationItem } from "../../../_lib/travel/types";
import type { LocationTab } from "./TopTabBar";

/** Match/旅行/スポット/王道/穴場/テーマ/検索 view 共通 props。 */
export interface LocationViewProps {
  /** prefecture で絞り込み済み＋ユーザー追加分をマージ済みのデータ。 */
  data: LocationNotesData;
  prefecture: string;
  /** 保存済み id 集合。 */
  savedIds: Set<string>;
  /** 旅程に追加済みか（CTA を「追加済み」表示に切替）。 */
  isAdded: (id: string) => boolean;
  onToggleSave: (id: string) => void;
  onAddToItinerary: (item: LocationItem) => void;
  /** カードタップ→詳細シート。 */
  onOpenDetail: (item: LocationItem) => void;
  /** 別タブへ遷移（すべて見る等）。 */
  onOpenTab: (tab: LocationTab) => void;
  /** 空状態などから ＋追加タブへ誘導。 */
  onGoToAdd: () => void;
}
