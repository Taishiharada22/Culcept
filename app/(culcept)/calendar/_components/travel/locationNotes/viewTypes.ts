// app/(culcept)/calendar/_components/travel/locationNotes/viewTypes.ts
// Location Notes 各タブ view の共通 props。
import type { LocationNotesData, LocationItem } from "../../../_lib/travel/types";

/** Match/旅行/スポット/王道/穴場/テーマ/検索 view 共通 props。 */
export interface LocationViewProps {
  /** prefecture で絞り込み済み＋ユーザー追加分をマージ済みのデータ。 */
  data: LocationNotesData;
  prefecture: string;
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  onAddToItinerary: (item: LocationItem) => void;
  /** 空状態などから ＋追加タブへ誘導。 */
  onGoToAdd: () => void;
}
