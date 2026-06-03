/**
 * activityIcon — 予定名(title) → 内容アイコン種別の keyword 推定（P4-2・pure）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md（理想画像準拠）
 *
 * 「何をする？」入力に応じて右端アイコンを切り替えるための表示専用推定。
 * 保存契約には一切影響しない（display-only）。まずは keyword based。
 */

export type ActivityIconKey =
  | "meeting"
  | "food"
  | "fitness"
  | "travel"
  | "work"
  | "generic";

const RULES: ReadonlyArray<{ key: ActivityIconKey; kw: readonly string[] }> = [
  {
    key: "meeting",
    kw: [
      "ミーティング", "会議", "mtg", "打ち合わせ", "打合せ", "商談", "面談",
      "1on1", "スタンドアップ", "standup", "面接", "顔合わせ",
    ],
  },
  {
    key: "food",
    kw: [
      "ランチ", "ご飯", "ごはん", "食事", "ディナー", "朝食", "昼食", "夕食",
      "飲み", "カフェ", "お茶", "ランチョン", "会食", "ブランチ",
    ],
  },
  {
    key: "fitness",
    kw: [
      "ジム", "筋トレ", "運動", "ヨガ", "ラン", "ランニング", "トレーニング",
      "散歩", "ワークアウト", "gym", "ストレッチ", "水泳",
    ],
  },
  {
    key: "travel",
    kw: [
      "移動", "フライト", "飛行機", "電車", "新幹線", "出張", "旅行", "空港",
      "ドライブ", "帰省", "通院", "送迎",
    ],
  },
  {
    key: "work",
    kw: [
      "作業", "仕事", "資料", "企画", "開発", "レビュー", "コーディング",
      "タスク", "業務", "プロジェクト", "設計", "実装", "執筆", "勉強",
    ],
  },
];

/** title → ActivityIconKey（小文字化・部分一致。未判定は generic）。 */
export function classifyActivityIconKey(title: string): ActivityIconKey {
  const t = title.toLowerCase();
  if (t.trim().length === 0) return "generic";
  for (const r of RULES) {
    if (r.kw.some((k) => t.includes(k.toLowerCase()))) return r.key;
  }
  return "generic";
}
