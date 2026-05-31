/**
 * D1-1: 3 候補保証 pure helper（adapter から呼び出す）
 *
 * 役割:
 *   engine が返す 1〜3 件の VM を、 必ず `[relaxed, main, smart]` の 3 件並びに整形する。
 *   不足は wardrobe pool から swap-by-axis で派生生成し、 それでも埋まらなければ mock で pad。
 *   diff 保証: 任意の 2 候補ペアで diffScore ≥ 1 を保証（完全同一なら片方を mock で置換）。
 *
 * 設計判断（D1 design gate, 2026-05-31）:
 *   - 既存 engine 出力（generateDayProposal）には触らない（Calendar 共用回避）
 *   - **proposals[1] = main を厳守**。 既存 OutfitCarousel L37 の `initialIndex = Math.floor((count-1)/2)`
 *     が count=3 で 1 を返すため、 配列順を `[relaxed, main, smart]` にすれば自動で中央 = main。
 *   - bag / accessory は対象外（D2）。 D1 は outer / tops / bottoms / shoes の 4 カテゴリ。
 *   - swap-by-axis は **1 item swap のみ**（main からの距離を最小限に、 意味ある差を 1 軸に集約）
 *   - pure: 副作用 / I/O / 現在時刻参照 / 乱数なし
 *   - 入力を mutate しない
 */

import type { WardrobeItem } from "@/lib/shared/wardrobe";

import type {
  CalendarOutfitItemVM,
  CalendarOutfitProposalSource,
  CalendarOutfitProposalVM,
} from "./types";

// ── 公開 type ──────────────────────────────────────────────

export type ThreeProposals = readonly [
  CalendarOutfitProposalVM,
  CalendarOutfitProposalVM,
  CalendarOutfitProposalVM,
];

export type EnsureThreeProposalsResult = {
  proposals: ThreeProposals;
  source: Extract<CalendarOutfitProposalSource, "engine" | "engine_padded">;
};

/** swap 派生 / pad に必要な adapter 依存を callback として注入する seam */
export type EnsureThreeProposalsDeps = {
  /** wardrobe item を VM item へ写像する（adapter 側の wardrobeItemToVM を渡す） */
  itemToVM: (item: WardrobeItem) => CalendarOutfitItemVM;
};

// ── 定数 ──────────────────────────────────────────────────

const FORMALITY_RANK: Record<string, number> = { casual: 0, smart: 1, dress: 2 };

/** engine の OutfitProposal.id 命名 `${variant}-${seed}` を解釈する */
const VARIANT_PREFIXES = ["main-", "casual-", "dressy-", "rain-", "cold-"] as const;

const OUTER_CATEGORY_LABEL = "アウター";

// ── helper (export して unit test 可能) ───────────────────

/**
 * VM の id prefix から engine variant を推定する。
 * engine OutfitProposal.id は `${variant}-${seed}` 形式（outfitEngine.ts L337）。
 * mock や hydrated_mock の id（"mock-outfit-..." 等）には該当しないので null。
 */
export function variantOfVM(vm: CalendarOutfitProposalVM): "main" | "casual" | "dressy" | "rain" | "cold" | null {
  for (const prefix of VARIANT_PREFIXES) {
    if (vm.id.startsWith(prefix)) {
      return prefix.slice(0, -1) as "main" | "casual" | "dressy" | "rain" | "cold";
    }
  }
  return null;
}

/**
 * 候補ペアの差分スコア（高いほど別物）。
 *   - itemIds の対称差: 1 件あたり ×1.0
 *   - outer 有無の差: ×0.5
 * 完全同一なら 0、 通常は 2 以上（1 件入れ替えで 2 = 失った 1 + 足した 1）。
 * 「意味ある差分」は **≥1.0** を閾値とする。
 */
export function diffScore(
  a: CalendarOutfitProposalVM,
  b: CalendarOutfitProposalVM,
): number {
  const idsA = new Set(a.items.map((i) => i.id));
  const idsB = new Set(b.items.map((i) => i.id));
  let diff = 0;
  for (const id of idsA) if (!idsB.has(id)) diff += 1;
  for (const id of idsB) if (!idsA.has(id)) diff += 1;
  const outerA = a.items.some((i) => i.category === OUTER_CATEGORY_LABEL);
  const outerB = b.items.some((i) => i.category === OUTER_CATEGORY_LABEL);
  if (outerA !== outerB) diff += 0.5;
  return diff;
}

/** wardrobe item の formality rank（0=casual, 1=smart, 2=dress、 不明は 0=casual 扱い） */
export function formalityRankOf(item: WardrobeItem): number {
  const f = item.formality;
  if (typeof f === "string" && f in FORMALITY_RANK) return FORMALITY_RANK[f];
  return 0;
}

/**
 * 同カテゴリの swap 候補を 1 件探す。
 *   - direction = -1 (relaxed): base より formality rank が **低い** item を返す。 同 rank でも別 id なら候補。
 *   - direction = +1 (smart): base より formality rank が **高い** item を返す。 同 rank でも別 id なら候補。
 *   - 該当複数あれば、 base に最も rank 差が近い 1 件（保守的 swap）を選ぶ。
 *   - 該当無し → null。
 */
export function findSwapCandidate(
  base: WardrobeItem,
  pool: ReadonlyArray<WardrobeItem>,
  direction: -1 | 1,
): WardrobeItem | null {
  const baseRank = formalityRankOf(base);
  const baseCat = base.categoryMain ?? base.category;
  const candidates: Array<{ item: WardrobeItem; delta: number }> = [];
  for (const item of pool) {
    if (item.id === base.id) continue;
    const cat = item.categoryMain ?? item.category;
    if (cat !== baseCat) continue;
    const rank = formalityRankOf(item);
    const delta = (rank - baseRank) * direction;
    // 厳密に方向一致（delta > 0）or 同 rank の異 id（delta === 0、 形式違いで意味差を作る保険）
    if (delta >= 0) candidates.push({ item, delta });
  }
  if (candidates.length === 0) return null;
  // 方向一致を優先（delta > 0 を delta=0 より優先）、 同位は最小 delta（近い rank）
  candidates.sort((a, b) => {
    const ap = a.delta > 0 ? 0 : 1;
    const bp = b.delta > 0 ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return Math.abs(a.delta) - Math.abs(b.delta);
  });
  return candidates[0].item;
}

/**
 * base VM の wardrobe 由来 item 1 件を、 formality 軸で swap した派生 VM を作る。
 *   - direction = -1: base の最も formality 高い item を pool の 1 段低い item に置換
 *   - direction = +1: base の最も formality 低い item を pool の 1 段高い item に置換
 *   - swap 候補が見つからなければ null。
 *
 * 入力 base に紐づく WardrobeItem の引き当ては `wardrobeById` で行う（base.items[i].id == wardrobe item.id）。
 * 紐づかない item は swap 対象から除外（mock item のみで構成された VM などは null）。
 */
export function swapProposalAxis(input: {
  base: CalendarOutfitProposalVM;
  wardrobeById: ReadonlyMap<string, WardrobeItem>;
  pool: ReadonlyArray<WardrobeItem>;
  direction: -1 | 1;
  idSuffix: string; // 派生 VM の id サフィックス（衝突回避）
  titleOverride?: string; // "リラックス寄り" 等
  deps: EnsureThreeProposalsDeps;
}): CalendarOutfitProposalVM | null {
  const baseWardrobeItems = input.base.items
    .map((vm) => input.wardrobeById.get(vm.id))
    .filter((w): w is WardrobeItem => w != null);
  if (baseWardrobeItems.length === 0) return null;

  // direction=-1 → 最も formality 高い item を swap 対象に
  // direction=+1 → 最も formality 低い item を swap 対象に
  const sortedByRank = [...baseWardrobeItems].sort((a, b) =>
    input.direction === -1
      ? formalityRankOf(b) - formalityRankOf(a)
      : formalityRankOf(a) - formalityRankOf(b),
  );

  for (const candidate of sortedByRank) {
    const swap = findSwapCandidate(candidate, input.pool, input.direction);
    if (!swap) continue;
    // candidate を swap に差し替え
    const swappedItems = input.base.items.map((vm) =>
      vm.id === candidate.id ? input.deps.itemToVM(swap) : vm,
    );
    return {
      ...input.base,
      id: `${input.base.id}-${input.idSuffix}`,
      ...(input.titleOverride ? { title: input.titleOverride } : {}),
      items: swappedItems,
    };
  }
  return null;
}

/**
 * engine VMs から `[relaxed, main, smart]` の役割スロットを埋める（pure 振り分け）。
 *   - main: 必ず先頭（engine.main 想定）。 無ければ null（caller は早期 return）。
 *   - relaxed: variant="casual" を最優先、 次に "rain"（雨は relaxed 寄り傾向）、 さらに残りから先頭。
 *   - smart: variant="dressy" を最優先、 次に "cold"（cold は厚手で formal 寄り傾向）、 さらに残り。
 *   - 既に他スロットに採用済の VM は再採用しない。
 */
export function assignRolesFromEngine(engineVMs: ReadonlyArray<CalendarOutfitProposalVM>): {
  relaxed: CalendarOutfitProposalVM | null;
  main: CalendarOutfitProposalVM | null;
  smart: CalendarOutfitProposalVM | null;
} {
  if (engineVMs.length === 0) return { relaxed: null, main: null, smart: null };
  const main = engineVMs[0];
  const rest = engineVMs.slice(1);
  const used = new Set<string>([main.id]);
  const pick = (priorities: ReadonlyArray<"casual" | "dressy" | "rain" | "cold">): CalendarOutfitProposalVM | null => {
    for (const variant of priorities) {
      const v = rest.find((vm) => !used.has(vm.id) && variantOfVM(vm) === variant);
      if (v) {
        used.add(v.id);
        return v;
      }
    }
    // priorities に無い variant も最終 fallback として残り 1 件を採用
    const v = rest.find((vm) => !used.has(vm.id));
    if (v) {
      used.add(v.id);
      return v;
    }
    return null;
  };
  const relaxed = pick(["casual", "rain"]);
  const smart = pick(["dressy", "cold"]);
  return { relaxed, main, smart };
}

// ── main ───────────────────────────────────────────────

/**
 * D1 中核: engine VM を `[relaxed, main, smart]` 3 件並びに整形する。
 *
 * 呼び出し前提:
 *   - `engineVMs[0]` が engine.main 想定（caller は engine 戻り順をそのまま渡す）
 *   - `engineVMs.length === 0` のときは caller が事前に hydrated_mock / mock path に分岐すること
 *     （本 helper の責任は **Tier A / B のみ**。 Tier C/D は adapter 側）
 *
 * 出力:
 *   - proposals: 必ず 3 件、 配列順 `[relaxed, main, smart]`、 `proposals[1] = main`
 *   - source: "engine"（全部 engine 由来）/ "engine_padded"（swap 派生 or mock pad が混じる）
 *
 * diff 保証:
 *   - 任意ペアで diffScore ≥ 1.0。 完全同一が混じったら mock pad で置換。
 */
export function ensureThreeProposals(input: {
  engineVMs: ReadonlyArray<CalendarOutfitProposalVM>;
  wardrobe: ReadonlyArray<WardrobeItem>;
  mockProposals: ReadonlyArray<CalendarOutfitProposalVM>; // 少なくとも 3 件（caller が保証）
  deps: EnsureThreeProposalsDeps;
}): EnsureThreeProposalsResult | null {
  if (input.engineVMs.length === 0) return null; // caller は Tier C/D に分岐すること

  const wardrobeById = new Map(input.wardrobe.map((w) => [w.id, w] as const));
  const { relaxed: relaxedFromEngine, main, smart: smartFromEngine } =
    assignRolesFromEngine(input.engineVMs);
  if (!main) return null;

  let padded = false;

  // relaxed: engine → swap 派生 → mock pad の順
  let relaxed: CalendarOutfitProposalVM | null = relaxedFromEngine;
  if (!relaxed) {
    relaxed = swapProposalAxis({
      base: main,
      wardrobeById,
      pool: input.wardrobe,
      direction: -1,
      idSuffix: "relaxed",
      titleOverride: "リラックス寄り",
      deps: input.deps,
    });
    if (relaxed) padded = true;
  }
  if (!relaxed) {
    relaxed = padFromMock(input.mockProposals, 0, "リラックス寄り");
    padded = true;
  }

  // smart: 同様
  let smart: CalendarOutfitProposalVM | null = smartFromEngine;
  if (!smart) {
    smart = swapProposalAxis({
      base: main,
      wardrobeById,
      pool: input.wardrobe,
      direction: 1,
      idSuffix: "smart",
      titleOverride: "きちんと寄り",
      deps: input.deps,
    });
    if (smart) padded = true;
  }
  if (!smart) {
    smart = padFromMock(input.mockProposals, 2, "きちんと寄り");
    padded = true;
  }

  // diff 保証: 完全同一ペアが残らないように、 必要なら片方を mock で置換
  const initial: [
    CalendarOutfitProposalVM,
    CalendarOutfitProposalVM,
    CalendarOutfitProposalVM,
  ] = [relaxed, main, smart];
  const enforced = enforceDiff(initial, input.mockProposals);
  if (enforced.replaced) padded = true;

  return {
    proposals: enforced.proposals,
    source: padded ? "engine_padded" : "engine",
  };
}

/**
 * mock proposals の指定スロット番号から VM を取り、 title を上書きして返す。
 * mock は 3 件以上ある前提（caller が保証）。 index が範囲外なら最後の要素を fallback。
 */
function padFromMock(
  mockProposals: ReadonlyArray<CalendarOutfitProposalVM>,
  index: number,
  titleOverride: string,
): CalendarOutfitProposalVM {
  const src = mockProposals[Math.min(index, mockProposals.length - 1)];
  return {
    ...src,
    id: `${src.id}-pad-${index}`,
    title: titleOverride,
  };
}

/**
 * 3 件の中で diffScore = 0（完全同一）のペアが残っていれば、 main 以外を mock で置換する。
 *   - main は中央（[1]）として絶対に置換しない。
 *   - relaxed と main が同一 → relaxed を mock pad（slot 0）
 *   - smart と main が同一 → smart を mock pad（slot 2）
 *   - relaxed と smart が同一（main とは違う場合）→ smart を mock pad（slot 2）
 *   - 置換後も同一が残るケースは想定しない（mock は engine と完全同一 id を持たない）。
 */
function enforceDiff(
  initial: [CalendarOutfitProposalVM, CalendarOutfitProposalVM, CalendarOutfitProposalVM],
  mockProposals: ReadonlyArray<CalendarOutfitProposalVM>,
): {
  proposals: ThreeProposals;
  replaced: boolean;
} {
  let [relaxed, mainP, smart] = initial;
  let replaced = false;
  if (diffScore(relaxed, mainP) < 1) {
    relaxed = padFromMock(mockProposals, 0, "リラックス寄り");
    replaced = true;
  }
  if (diffScore(smart, mainP) < 1) {
    smart = padFromMock(mockProposals, 2, "きちんと寄り");
    replaced = true;
  }
  if (diffScore(relaxed, smart) < 1) {
    smart = padFromMock(mockProposals, 2, "きちんと寄り");
    replaced = true;
  }
  return { proposals: [relaxed, mainP, smart], replaced };
}
