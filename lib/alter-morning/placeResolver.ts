/**
 * Place Resolver — 場所名の解決 + 確信度判定
 *
 * Phase A-2: Web検索による固有名解決 + confidence判定器
 * Phase B-1: Google Places API (New) による chain_brand / generic_place 解決
 * Phase B-2: 2層キャッシュ（L1 in-memory + L2 Supabase）永続化
 *
 * placeType ごとの解決戦略:
 *   - exact_proper_noun → Web検索（Exa.ai）: 固有名の正式名称を特定
 *   - chain_brand → Places Text Search: 略称→正式名 + 最寄り店舗を特定
 *   - generic_place → Places Text Search: 一般名詞→具体的な施設を候補提示
 *   - known_base → スキップ（プロフィールから解決済み）
 *
 * 設計原則:
 *   - 分類(placeType)と確信度(resolutionConfidence)は別物（GPT指摘）
 *   - fail-open: 検索失敗・APIキー未設定時は unresolved を返し、プラン生成を止めない
 *   - キャッシュファースト: 同一ユーザーの同一場所名は再検索しない
 *   - chain_brand はどの店舗でも代替可能 → エリア一致なら high
 *   - generic_place は常に medium 以下（どの「図書館」か確認が必要）
 *
 * CEO方針:
 *   - 不確かなら聞く（Medium → 「〇〇であってる？」, Low → 候補提示）
 *   - 確からしければ黙って採用（High → 自動採用）
 */

import { executeSearch, type SearchResult } from "@/lib/stargazer/perspectiveEngine";
import {
  searchPlacesByText,
  isPlacesApiAvailable,
  type PlacesApiPlace,
} from "./placesApiClient";
import {
  readFromSupabase,
  writeToSupabase,
  type CacheWriteParams,
} from "./placeCacheStore";
import type { PlanSegment, PlaceType, ResolutionConfidence } from "./planState";
import {
  adjustCandidateScore,
  extractHardAnchors,
  type HardAnchor,
  type LatLng,
} from "./objectiveFunction";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Web検索/Places APIから取得した場所候補 */
export interface PlaceCandidate {
  /** 正式名称（「サドヤ ワイナリー」等） */
  name: string;
  /** 住所（「甲府市丸の内1-20-16」等） */
  address?: string;
  /** カテゴリ（「restaurant」「winery」「library」等） */
  category?: string;
  /** Google Place ID（Phase B 以降） */
  placeId?: string;
  /** 緯度（Phase C: Routes API で移動時間計算に使用） */
  lat?: number;
  /** 経度（Phase C: Routes API で移動時間計算に使用） */
  lng?: number;
  /** 情報源 */
  source: "web_search" | "cache" | "places_api";
  /** 候補のスコア（0-1, 高いほど文脈に合致） */
  matchScore: number;
}

/** 場所解決の結果 */
export interface PlaceResolution {
  /** ユーザーが言った元のテキスト */
  originalText: string;
  /** 候補リスト（スコア降順） */
  candidates: PlaceCandidate[];
  /** 最有力候補（candidates[0]） */
  bestCandidate?: PlaceCandidate;
  /** 確信度 */
  confidence: ResolutionConfidence;
  /** 確信度の理由（デバッグ/ログ用） */
  reason: string;
}

/** 解決時の文脈情報 */
export interface ResolutionContext {
  /** ユーザーのエリア（都道府県 or 市区町村） */
  userArea?: string;
  /** 活動カテゴリ（「ランチ」「仕事」等） */
  activityHint?: string;
  /** 同行者 */
  companions?: string[];
  /** プラン内の他のセグメントの場所（動線推定用） */
  otherPlaces?: string[];
  /** 時間帯ヒント */
  timeHint?: string;
  /**
   * 既に解決済みの hard anchor 群（距離ペナルティ用）
   *
   * CEO方針 2026-04-17: ユーザーが明示した場所・時刻を軸に、
   * 曖昧候補（チェーン店等）は anchor 近傍を優遇・遠方を減点する。
   */
  resolvedAnchors?: HardAnchor[];
  /**
   * この候補の直前 anchor（往復ペナルティ計算用）
   *
   * 順序上この候補の前に置かれる hard anchor。
   */
  prevAnchor?: HardAnchor;
  /**
   * この候補の直後 anchor（往復ペナルティ計算用）
   *
   * 順序上この候補の後に置かれる hard anchor。
   */
  nextAnchor?: HardAnchor;
}

/** キャッシュエントリ */
export interface PlaceResolutionCacheEntry {
  /** 解決済みの正式名称 */
  resolvedName: string;
  /** 住所 */
  address?: string;
  /** Google Place ID */
  placeId?: string;
  /** 緯度（Phase C: Routes API 用） */
  lat?: number;
  /** 経度（Phase C: Routes API 用） */
  lng?: number;
  /** 確信度 */
  confidence: ResolutionConfidence;
  /** キャッシュ作成日時 */
  cachedAt: string;
  /** 最終使用日時 */
  lastUsedAt: string;
  /** 使用回数（多いほど confidence が上がる） */
  useCount: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cache — 2層キャッシュ（L1: in-memory, L2: Supabase）
//
// Read:  L1 → miss → L2 → hit → L1 に書き戻し → return
// Write: L1 + L2（L2 は fire-and-forget）
// fail-open: L2 障害時は L1 のみで動作継続
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

/**
 * キャッシュキー: user_id + normalized_place_text + coarse_area
 * GPT推奨の3要素キー
 */
function cacheKey(userId: string, placeText: string, area?: string): string {
  const normalizedPlace = placeText.trim().toLowerCase();
  const normalizedArea = area?.trim().toLowerCase() ?? "unknown";
  return `${userId}:${normalizedPlace}:${normalizedArea}`;
}

/** L1: in-memory キャッシュ（プロセスローカル、高速パス） */
const resolvedPlaceCache = new Map<string, PlaceResolutionCacheEntry>();

/**
 * キャッシュから取得（L1 → L2 フォールバック）
 *
 * Phase B-2: L1(in-memory) ミス時に L2(Supabase) を照会し、
 * ヒットした場合は L1 に書き戻して次回の高速パスを確保する。
 */
export async function getCachedResolution(
  userId: string,
  placeText: string,
  area?: string,
): Promise<PlaceResolutionCacheEntry | null> {
  const key = cacheKey(userId, placeText, area);

  // ── L1: in-memory ──
  const l1 = resolvedPlaceCache.get(key);
  if (l1) {
    const age = Date.now() - new Date(l1.cachedAt).getTime();
    if (age <= CACHE_TTL_MS) {
      l1.lastUsedAt = new Date().toISOString();
      l1.useCount += 1;
      return l1;
    }
    resolvedPlaceCache.delete(key);
  }

  // ── L2: Supabase（fail-open: L2 障害時は null で続行） ──
  try {
    const l2 = await readFromSupabase(userId, placeText, area);
    if (l2) {
      // L1 に書き戻し（次回は L1 ヒット）
      resolvedPlaceCache.set(key, l2);
      return l2;
    }
  } catch {
    // L2 read failure → L1 のみで動作（API が次に呼ばれる）
  }

  return null;
}

/**
 * キャッシュに保存（L1 + L2 同時書き込み）
 *
 * Phase B-2: L1 に即時書き込み + L2(Supabase) に fire-and-forget で永続化。
 * placeType が指定されている場合のみ L2 に書き込む。
 */
export async function setCachedResolution(
  userId: string,
  placeText: string,
  area: string | undefined,
  resolution: PlaceResolution,
  placeType?: PlaceType,
): Promise<void> {
  if (!resolution.bestCandidate || resolution.confidence === "low") return; // low は保存しない

  // ── L1: in-memory ──
  const key = cacheKey(userId, placeText, area);
  resolvedPlaceCache.set(key, {
    resolvedName: resolution.bestCandidate.name,
    address: resolution.bestCandidate.address,
    placeId: resolution.bestCandidate.placeId,
    lat: resolution.bestCandidate.lat,
    lng: resolution.bestCandidate.lng,
    confidence: resolution.confidence,
    cachedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    useCount: 1,
  });

  // ── L2: Supabase（fire-and-forget） ──
  // placeType が指定されている場合のみ永続化
  // bestCandidate.source が "cache" の場合は既に永続化済みなのでスキップ
  if (placeType && resolution.bestCandidate.source !== "cache") {
    const params: CacheWriteParams = {
      resolvedName: resolution.bestCandidate.name,
      address: resolution.bestCandidate.address,
      placeId: resolution.bestCandidate.placeId,
      confidence: resolution.confidence as "high" | "medium",
      source: resolution.bestCandidate.source as "web_search" | "places_api",
      placeType,
      lat: resolution.bestCandidate.lat,
      lng: resolution.bestCandidate.lng,
    };
    // fire-and-forget: L1 が正本なので L2 の完了を待たない
    void writeToSupabase(userId, placeText, area, params);
  }
}

/** テスト用: L1 キャッシュクリア */
export function clearPlaceCache(): void {
  resolvedPlaceCache.clear();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Chain Brand 正規化テーブル（略称 → 正式名称）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CHAIN_BRAND_NORMALIZE: Record<string, string> = {
  // ── ファストフード ──
  "マック": "マクドナルド",
  "マクド": "マクドナルド",
  "モス": "モスバーガー",
  "ケンタ": "ケンタッキーフライドチキン",
  "KFC": "ケンタッキーフライドチキン",
  "バーキン": "バーガーキング",
  "サブウェイ": "サブウェイ",
  "ミスド": "ミスタードーナツ",
  // ── カフェ ──
  "スタバ": "スターバックス",
  "ドトール": "ドトールコーヒー",
  "コメダ": "コメダ珈琲店",
  "タリーズ": "タリーズコーヒー",
  // ── ファミレス ──
  "サイゼ": "サイゼリヤ",
  "ガスト": "ガスト",
  "ロイホ": "ロイヤルホスト",
  "デニーズ": "デニーズ",
  "ジョナサン": "ジョナサン",
  // ── 牛丼・定食 ──
  "吉野家": "吉野家",
  "松屋": "松屋",
  "すき家": "すき家",
  "なか卯": "なか卯",
  "大戸屋": "大戸屋",
  "やよい軒": "やよい軒",
  // ── ラーメン・うどん ──
  "天下一品": "天下一品",
  "一蘭": "一蘭",
  "丸亀": "丸亀製麺",
  "日高屋": "日高屋",
  // ── 居酒屋 ──
  "鳥貴族": "鳥貴族",
  "CoCo壱": "CoCo壱番屋",
  "ココイチ": "CoCo壱番屋",
  // ── コンビニ ──
  "セブン": "セブンイレブン",
  "ローソン": "ローソン",
  "ファミマ": "ファミリーマート",
  // ── 小売 ──
  "ユニクロ": "ユニクロ",
  "GU": "GU",
  "無印": "無印良品",
  "ダイソー": "ダイソー",
  "ニトリ": "ニトリ",
  "イオン": "イオン",
  "ブックオフ": "ブックオフ",
  "TSUTAYA": "TSUTAYA",
  "ツタヤ": "TSUTAYA",
};

/**
 * チェーン店の略称を正式名称に変換する。
 * マップに存在しない場合はそのまま返す。
 */
export function normalizeChainBrand(place: string): string {
  return CHAIN_BRAND_NORMALIZE[place] ?? place;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Generic Place → 検索ヒント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 一般名詞から Places API Text Search 用のヒント語を返す。
 * Text Search は自然言語クエリなのでタイプフィルタではなくヒント語を付加する。
 */
export function getGenericPlaceSearchHint(place: string): string | null {
  // 既に具体的な場所名ならそのまま使う
  const hints: Record<string, string> = {
    "図書館": "公立図書館",
    "カフェ": "カフェ",
    "喫茶店": "喫茶店",
    "公園": "公園",
    "病院": "総合病院",
    "クリニック": "クリニック",
    "コンビニ": "コンビニエンスストア",
    "スーパー": "スーパーマーケット",
    "薬局": "薬局 ドラッグストア",
    "ジム": "スポーツジム フィットネス",
    "プール": "プール 水泳",
    "美容院": "美容室 ヘアサロン",
    "美容室": "美容室 ヘアサロン",
    "床屋": "理髪店 バーバー",
    "居酒屋": "居酒屋",
    "本屋": "書店",
    "書店": "書店",
    "映画館": "映画館 シネマ",
    "銀行": "銀行",
    "郵便局": "郵便局",
    "役所": "市役所 区役所",
    "レストラン": "レストラン",
  };
  for (const [key, hint] of Object.entries(hints)) {
    if (place.includes(key)) return hint;
  }
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Web Search → Candidate Extraction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 場所名からWeb検索クエリを構築する。
 *
 * エリアヒントと活動ヒントを組み合わせて精度を上げる。
 * 例: placeName="サドヤ", area="甲府", activity="ランチ"
 *   → "サドヤ 甲府 レストラン"
 */
function buildSearchQuery(placeName: string, context: ResolutionContext): string {
  const parts = [placeName];

  // エリアヒント
  if (context.userArea) {
    parts.push(context.userArea);
  }

  // 活動から場所カテゴリを推定
  const categoryHint = inferCategoryFromActivity(context.activityHint);
  if (categoryHint) {
    parts.push(categoryHint);
  }

  return parts.join(" ");
}

/** 活動内容から場所カテゴリキーワードを推定 */
function inferCategoryFromActivity(activity?: string): string | null {
  if (!activity) return null;
  if (/ランチ|ディナー|食事|夕食|昼食/.test(activity)) return "レストラン";
  if (/飲み|飲み会/.test(activity)) return "居酒屋";
  if (/カフェ|コーヒー/.test(activity)) return "カフェ";
  if (/仕事|作業/.test(activity)) return "";  // 仕事場所は多様なので追加しない
  if (/勉強|読書/.test(activity)) return "";
  return null;
}

/**
 * Web検索結果から場所候補を抽出する。
 *
 * 検索結果の title/text/url から場所情報を推定。
 * Phase B で Places API に切り替える際はここを差し替え。
 */
function extractCandidatesFromSearch(
  results: SearchResult[],
  originalText: string,
  context: ResolutionContext,
): PlaceCandidate[] {
  if (results.length === 0) return [];

  const candidates: PlaceCandidate[] = [];
  const seen = new Set<string>(); // 重複排除

  for (const r of results) {
    if (!r.title) continue;

    // タイトルから正式名称を抽出（「サドヤ - 甲府のワイナリー」→「サドヤ」）
    const name = extractPlaceName(r.title, originalText);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    // 住所を text から抽出
    const address = extractAddress(r.text);

    // カテゴリを推定
    const category = inferCategoryFromSearchResult(r);

    // マッチスコア計算
    const matchScore = computeMatchScore(name, address, category, originalText, context);

    candidates.push({
      name,
      address,
      category,
      source: "web_search",
      matchScore,
    });
  }

  // スコア降順でソート
  return candidates.sort((a, b) => b.matchScore - a.matchScore);
}

/** 検索タイトルから場所名を抽出 */
function extractPlaceName(title: string, originalText: string): string | null {
  // 「サドヤ ワイナリー - 甲府市」→「サドヤ ワイナリー」
  // 「叙々苑 | 焼肉レストラン」→「叙々苑」
  const cleaned = title
    .split(/\s*[-|–—]\s*/)[0]  // 区切り文字以降を除去
    .replace(/【.*?】/g, "")    // 【公式】等を除去
    .replace(/\(.*?\)/g, "")    // (公式サイト)等を除去
    .trim();

  if (!cleaned || cleaned.length > 50) return null;

  // 元のテキストとの関連性チェック（最低限の類似性）
  const lcOrig = originalText.toLowerCase();
  const lcCleaned = cleaned.toLowerCase();
  if (lcCleaned.includes(lcOrig) || lcOrig.includes(lcCleaned.split(/\s/)[0])) {
    return cleaned;
  }

  return cleaned; // 関連性が不明でも候補としては残す（スコアで判断）
}

/** テキストから住所パターンを抽出 */
const ADDRESS_RE = /(?:〒?\d{3}-?\d{4}\s*)?([東西南北]?京?都?[道府県]?[^\s]{1,4}[市区町村郡][^\s,。、]{2,20})/;

function extractAddress(text?: string): string | undefined {
  if (!text) return undefined;
  const match = text.match(ADDRESS_RE);
  return match ? match[0].trim() : undefined;
}

/** 検索結果からカテゴリを推定 */
function inferCategoryFromSearchResult(result: SearchResult): string | undefined {
  const combined = `${result.title} ${result.text}`.toLowerCase();
  if (/レストラン|飲食|グルメ|食べログ|ぐるなび|ホットペッパー/.test(combined)) return "restaurant";
  if (/ワイナリー|ワイン/.test(combined)) return "winery";
  if (/カフェ|コーヒー|喫茶/.test(combined)) return "cafe";
  if (/ホテル|旅館|宿/.test(combined)) return "accommodation";
  if (/居酒屋|バー|パブ/.test(combined)) return "bar";
  if (/美容院|サロン|美容室/.test(combined)) return "salon";
  if (/病院|クリニック|医院/.test(combined)) return "medical";
  return undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Match Score & Confidence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 候補のマッチスコアを計算する（0-1）
 *
 * 要素:
 *   - 名前の一致度（元テキストとの類似性）
 *   - 地域の一致（ユーザーエリアと住所の一致）
 *   - カテゴリの整合（活動と場所カテゴリの一致）
 */
function computeMatchScore(
  candidateName: string,
  address: string | undefined,
  category: string | undefined,
  originalText: string,
  context: ResolutionContext,
): number {
  let score = 0;

  // 名前の一致度（0.4 max）
  const lcName = candidateName.toLowerCase();
  const lcOrig = originalText.toLowerCase();
  if (lcName.includes(lcOrig) || lcOrig.includes(lcName.split(/\s/)[0])) {
    score += 0.4;
  } else {
    score += 0.1; // 部分一致
  }

  // 地域の一致（0.3 max）
  if (address && context.userArea) {
    if (address.includes(context.userArea)) {
      score += 0.3;
    }
  }
  // 他セグメントの場所との地域一致（動線整合）
  if (address && context.otherPlaces) {
    for (const otherPlace of context.otherPlaces) {
      if (address.includes(otherPlace)) {
        score += 0.1;
        break;
      }
    }
  }

  // カテゴリ整合（0.2 max）
  if (category && context.activityHint) {
    const expectedCat = inferCategoryFromActivity(context.activityHint);
    if (expectedCat && category.includes(expectedCat)) {
      score += 0.2;
    } else if (category === "restaurant" && /ランチ|ディナー|食事/.test(context.activityHint)) {
      score += 0.2;
    }
  }

  // 同行者がいる = 対人活動 → レストラン系ならボーナス（0.1 max）
  if (context.companions && context.companions.length > 0 && category === "restaurant") {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

/**
 * 候補リストから確信度を判定する。
 *
 * High:   候補1件 & matchScore >= 0.5
 * Medium: 候補あり & top候補が2位以上を0.2以上引き離している
 * Low:    その他（候補なし、候補拮抗、スコア低い）
 */
export function determineConfidence(
  candidates: PlaceCandidate[],
  fromCache: boolean = false,
): { confidence: ResolutionConfidence; reason: string } {
  if (candidates.length === 0) {
    return { confidence: "low", reason: "候補なし" };
  }

  const top = candidates[0];

  // キャッシュから取得 = 過去に採用済み → high
  if (fromCache) {
    return { confidence: "high", reason: "キャッシュヒット（過去に採用済み）" };
  }

  if (candidates.length === 1 && top.matchScore >= 0.5) {
    return { confidence: "high", reason: `候補1件、matchScore=${top.matchScore.toFixed(2)}` };
  }

  if (candidates.length === 1 && top.matchScore >= 0.3) {
    return { confidence: "medium", reason: `候補1件だがスコアやや低い: ${top.matchScore.toFixed(2)}` };
  }

  if (candidates.length >= 2) {
    const gap = top.matchScore - candidates[1].matchScore;
    if (gap >= 0.2 && top.matchScore >= 0.5) {
      return { confidence: "medium", reason: `top候補が優勢（gap=${gap.toFixed(2)}）` };
    }
  }

  return { confidence: "low", reason: `候補${candidates.length}件、スコア拮抗 or 低い` };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Entry Point
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 場所名を解決する。
 *
 * 1. キャッシュ確認
 * 2. Web検索で候補取得
 * 3. 候補をスコアリング
 * 4. confidence 判定
 *
 * fail-open: 検索失敗時は { confidence: "unresolved" } を返す
 */
export async function resolvePlace(
  placeName: string,
  context: ResolutionContext,
  userId?: string,
): Promise<PlaceResolution> {
  // 1. キャッシュ確認（L1 → L2）
  if (userId) {
    const cached = await getCachedResolution(userId, placeName, context.userArea);
    if (cached) {
      return buildCacheHitResolution(placeName, cached);
    }
  }

  // 2. Web検索
  const query = buildSearchQuery(placeName, context);
  let searchResults: SearchResult[];
  try {
    searchResults = await executeSearch([query], 3000);
  } catch {
    console.warn(`[PlaceResolver] Web search failed for "${placeName}"`);
    return unresolvedResult(placeName, "Web検索失敗");
  }

  // 3. 候補抽出 & スコアリング
  const candidates = extractCandidatesFromSearch(searchResults, placeName, context);

  // 4. confidence 判定
  const { confidence, reason } = determineConfidence(candidates);

  const resolution: PlaceResolution = {
    originalText: placeName,
    candidates,
    bestCandidate: candidates[0],
    confidence,
    reason,
  };

  // 5. キャッシュ保存（high/medium のみ、L1 + L2）
  if (userId && resolution.bestCandidate) {
    await setCachedResolution(userId, placeName, context.userArea, resolution, "exact_proper_noun");
  }

  return resolution;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B-1: Places API → Candidate Extraction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Places API のレスポンスから PlaceCandidate リストを生成する */
function placesApiToCandidates(
  places: PlacesApiPlace[],
  originalText: string,
  context: ResolutionContext,
): PlaceCandidate[] {
  const candidates: PlaceCandidate[] = [];

  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    // 閉店済みを除外
    if (p.businessStatus === "CLOSED_PERMANENTLY") continue;

    const name = p.displayName?.text ?? "";
    if (!name) continue;

    const address = p.shortFormattedAddress ?? p.formattedAddress;

    // カテゴリ推定
    const category = inferCategoryFromPlacesTypes(p.types);

    // マッチスコア計算
    const matchScore = computePlacesMatchScore(p, originalText, context, i);

    candidates.push({
      name,
      address,
      category,
      placeId: p.id,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      source: "places_api",
      matchScore,
    });
  }

  // CEO方針 2026-04-17: hard anchor 距離ペナルティ・近傍ボーナスを適用
  // resolvedAnchors が指定されている場合のみ発動（旧動作は壊さない）
  const rescored = applyObjectiveFunctionReranking(candidates, context);

  return rescored.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * 候補リストに hard anchor 距離ペナルティを適用する。
 *
 * CEO方針 2026-04-17:
 *   - 同じ「マック」候補でも、甲府サドヤ anchor に近い店舗を優遇
 *   - 「甲府↔増穂」のような不自然な逆走候補を減点
 *
 * 発動条件: context.resolvedAnchors が 1件以上 + 候補に lat/lng
 * fail-open: 条件不備なら元の matchScore をそのまま返す
 */
function applyObjectiveFunctionReranking(
  candidates: PlaceCandidate[],
  context: ResolutionContext,
): PlaceCandidate[] {
  if (!context.resolvedAnchors || context.resolvedAnchors.length === 0) {
    return candidates;
  }

  return candidates.map(c => {
    if (c.lat == null || c.lng == null) return c;
    const coords: LatLng = { lat: c.lat, lng: c.lng };
    const { adjustment } = adjustCandidateScore(
      { coords, baseScore: c.matchScore, label: c.name },
      {
        anchors: context.resolvedAnchors!,
        prevAnchor: context.prevAnchor,
        nextAnchor: context.nextAnchor,
      },
    );
    // 0-1 にクリップ
    const newScore = Math.max(0, Math.min(1, c.matchScore + adjustment));
    return { ...c, matchScore: newScore };
  });
}

/** Places API の types[] からカテゴリを推定 */
function inferCategoryFromPlacesTypes(types?: string[]): string | undefined {
  if (!types || types.length === 0) return undefined;
  if (types.includes("restaurant") || types.includes("food")) return "restaurant";
  if (types.includes("cafe")) return "cafe";
  if (types.includes("bar")) return "bar";
  if (types.includes("library")) return "library";
  if (types.includes("park")) return "park";
  if (types.includes("hospital") || types.includes("doctor")) return "medical";
  if (types.includes("gym")) return "gym";
  if (types.includes("book_store")) return "bookstore";
  if (types.includes("convenience_store")) return "convenience";
  if (types.includes("supermarket")) return "supermarket";
  return types[0]; // フォールバック: 最初のタイプ
}

/**
 * Places API 結果のマッチスコア計算（0-1）
 *
 * Web検索版 computeMatchScore と同じスケールで計算。
 * determineConfidence をそのまま再利用できるようにする。
 */
function computePlacesMatchScore(
  place: PlacesApiPlace,
  originalText: string,
  context: ResolutionContext,
  rank: number,
): number {
  let score = 0;

  // 名前の関連性（0.4 max）
  const displayName = place.displayName?.text?.toLowerCase() ?? "";
  const lcOrig = originalText.toLowerCase();
  // ブランド正規化後の名前もチェック
  const normalized = normalizeChainBrand(originalText).toLowerCase();
  if (displayName.includes(lcOrig) || displayName.includes(normalized)) {
    score += 0.4;
  } else if (lcOrig.includes(displayName.split(/\s/)[0])) {
    score += 0.3;
  } else {
    score += 0.1;
  }

  // エリア一致（0.3 max）
  const address = place.formattedAddress ?? place.shortFormattedAddress ?? "";
  if (address && context.userArea && address.includes(context.userArea)) {
    score += 0.3;
  }

  // ランク（Google の relevance 順 — 0.1 for top, diminishing）
  score += Math.max(0, 0.1 - rank * 0.03);

  // 営業中（0.1）
  if (place.businessStatus === "OPERATIONAL") {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B-1: Chain Brand Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * チェーン店の場所を解決する。
 *
 * 戦略: 略称を正式名称に変換 → Places Text Search でエリア内の店舗を検索
 *
 * Confidence:
 *   - チェーン + エリアあり + 結果あり → high（どの店舗でも代替可能）
 *   - チェーン + エリアなし + 結果あり → medium（エリア確認したい）
 *   - 結果なし → low
 *
 * fail-open: API キー未設定 or 検索失敗 → unresolved
 */
export async function resolveChainBrand(
  placeName: string,
  context: ResolutionContext,
  userId?: string,
): Promise<PlaceResolution> {
  // 1. キャッシュ確認（L1 → L2）
  if (userId) {
    const cached = await getCachedResolution(userId, placeName, context.userArea);
    if (cached) {
      return buildCacheHitResolution(placeName, cached);
    }
  }

  // 2. API キー確認
  if (!isPlacesApiAvailable()) {
    return unresolvedResult(placeName, "Places API キー未設定");
  }

  // 3. ブランド名を正規化してクエリ構築
  const normalizedBrand = normalizeChainBrand(placeName);
  const query = context.userArea
    ? `${normalizedBrand} ${context.userArea}`
    : normalizedBrand;

  // 4. Places Text Search（コスト最適化: maxResultCount=3）
  let places: PlacesApiPlace[];
  try {
    places = await searchPlacesByText({ textQuery: query, maxResultCount: 3 });
  } catch {
    console.warn(`[PlaceResolver] Places API failed for chain_brand "${placeName}"`);
    return unresolvedResult(placeName, "Places API 検索失敗");
  }

  // 5. 候補抽出
  const candidates = placesApiToCandidates(places, placeName, context);

  // 6. Confidence 判定 + チェーン店ルール適用
  let { confidence, reason } = determineConfidence(candidates);
  const hasArea = !!context.userArea;

  // チェーン店 + エリアあり → high に昇格（代替可能だから）
  if (candidates.length > 0 && hasArea && confidence === "medium") {
    confidence = "high";
    reason = "チェーン店 + エリア一致（代替可能）";
  }
  // チェーン店 + エリアなし → high でも medium に制限
  if (!hasArea && confidence === "high") {
    confidence = "medium";
    reason = "チェーン店だがエリア不明";
  }

  const resolution: PlaceResolution = {
    originalText: placeName,
    candidates,
    bestCandidate: candidates[0],
    confidence,
    reason,
  };

  // 7. キャッシュ保存（L1 + L2）
  if (userId && resolution.bestCandidate) {
    await setCachedResolution(userId, placeName, context.userArea, resolution, "chain_brand");
  }

  return resolution;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase B-1: Generic Place Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 一般名詞の場所を解決する。
 *
 * 戦略: Places Text Search で「図書館 甲府」等を検索し候補提示
 *
 * Confidence:
 *   - generic は常に medium 以下（どの「図書館」か確認が必要）
 *   - エリアあり + 結果あり → medium
 *   - エリアなし or 結果なし → low
 *
 * fail-open: API キー未設定 or 検索失敗 → unresolved
 */
export async function resolveGenericPlace(
  placeName: string,
  context: ResolutionContext,
  userId?: string,
): Promise<PlaceResolution> {
  // 1. キャッシュ確認（L1 → L2）
  if (userId) {
    const cached = await getCachedResolution(userId, placeName, context.userArea);
    if (cached) {
      return buildCacheHitResolution(placeName, cached);
    }
  }

  // 2. API キー確認
  if (!isPlacesApiAvailable()) {
    return unresolvedResult(placeName, "Places API キー未設定");
  }

  // 3. 検索クエリ構築（検索ヒントがあれば付加）
  const hint = getGenericPlaceSearchHint(placeName);
  const searchTerm = hint ?? placeName;
  const query = context.userArea
    ? `${searchTerm} ${context.userArea}`
    : searchTerm;

  // 4. Places Text Search（コスト最適化: maxResultCount=5、候補提示用に多めに取る）
  let places: PlacesApiPlace[];
  try {
    places = await searchPlacesByText({ textQuery: query, maxResultCount: 5 });
  } catch {
    console.warn(`[PlaceResolver] Places API failed for generic_place "${placeName}"`);
    return unresolvedResult(placeName, "Places API 検索失敗");
  }

  // 5. 候補抽出
  const candidates = placesApiToCandidates(places, placeName, context);

  // 6. Confidence 判定 + generic ルール適用
  let { confidence, reason } = determineConfidence(candidates);

  // generic_place は常に medium 以下（どの施設か不明）
  if (confidence === "high") {
    confidence = "medium";
    reason = `一般名詞のため medium に制限（元: ${reason}）`;
  }

  const resolution: PlaceResolution = {
    originalText: placeName,
    candidates,
    bestCandidate: candidates[0],
    confidence,
    reason,
  };

  // 7. キャッシュ保存（L1 + L2）
  if (userId && resolution.bestCandidate) {
    await setCachedResolution(userId, placeName, context.userArea, resolution, "generic_place");
  }

  return resolution;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** キャッシュヒット時の共通レスポンス生成 */
function buildCacheHitResolution(
  placeName: string,
  cached: PlaceResolutionCacheEntry,
): PlaceResolution {
  const candidate: PlaceCandidate = {
    name: cached.resolvedName,
    address: cached.address,
    placeId: cached.placeId,
    lat: cached.lat,
    lng: cached.lng,
    source: "cache",
    matchScore: 1.0,
  };
  return {
    originalText: placeName,
    candidates: [candidate],
    bestCandidate: candidate,
    confidence: cached.confidence,
    reason: `キャッシュヒット（使用${cached.useCount}回目）`,
  };
}

/** unresolved レスポンス生成（fail-open） */
function unresolvedResult(placeName: string, reason: string): PlaceResolution {
  return {
    originalText: placeName,
    candidates: [],
    confidence: "unresolved",
    reason,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Resolve Anchors（全 placeType 対応）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * プランのセグメント群からアンカー順に場所を解決する。
 *
 * 1. anchorScore 降順でソート（Hard anchor を先に解決）
 * 2. placeType ごとに適切な resolver にディスパッチ:
 *    - exact_proper_noun → Web検索（resolvePlace）
 *    - chain_brand → Places Text Search（resolveChainBrand）
 *    - generic_place → Places Text Search（resolveGenericPlace）
 *    - known_base → スキップ（プロフィールから解決済み）
 * 3. 解決結果をセグメントに反映
 *
 * 戻り値: 更新されたセグメント配列 + 確認が必要なセグメントのリスト
 */
export async function resolveAnchors(
  segments: PlanSegment[],
  userArea?: string,
  userId?: string,
): Promise<{
  resolved: PlanSegment[];
  needsConfirmation: Array<{ segmentId: string; resolution: PlaceResolution }>;
}> {
  // anchorScore 降順でソート（Hard anchor を先に解決）
  const sortedByAnchor = [...segments]
    .map((seg, idx) => ({ seg, idx }))
    .sort((a, b) => (b.seg.anchorScore ?? 0) - (a.seg.anchorScore ?? 0));

  const resolved = [...segments]; // コピー
  const needsConfirmation: Array<{ segmentId: string; resolution: PlaceResolution }> = [];

  // 解決済みの場所名を収集（動線推定用）
  const resolvedPlaces: string[] = [];

  for (const { seg, idx } of sortedByAnchor) {
    // known_base はプロフィールから解決済み → スキップ
    if (seg.placeType === "known_base" || !seg.place) continue;
    // 既に解決済みならスキップ
    if (seg.resolvedPlaceName) continue;

    // ── CEO方針 2026-04-17: hard anchor を抽出 ──
    // ここまでに解決済みの anchor（anchorScore >= 閾値 + lat/lng 解決済み）を集め、
    // 距離ペナルティ・往復ペナルティ計算に使う。
    const resolvedAnchors = extractHardAnchors(
      resolved.map(r => ({
        id: r.id,
        order: r.order,
        anchorScore: r.anchorScore,
        startTime: r.startTime,
        resolvedLat: r.resolvedLat,
        resolvedLng: r.resolvedLng,
        resolvedPlaceName: r.resolvedPlaceName,
      })),
    );

    // この候補の順序上の直前/直後 anchor を特定（往復ペナルティ用）
    const prevAnchor = resolvedAnchors
      .filter(a => a.order < seg.order)
      .slice(-1)[0];
    const nextAnchor = resolvedAnchors.find(a => a.order > seg.order);

    const context: ResolutionContext = {
      userArea,
      activityHint: seg.activityCanonical ?? seg.activity,
      companions: seg.companions,
      otherPlaces: resolvedPlaces,
      resolvedAnchors,
      prevAnchor,
      nextAnchor,
    };

    // placeType ごとに適切な resolver にディスパッチ
    let resolution: PlaceResolution;
    switch (seg.placeType) {
      case "exact_proper_noun":
        resolution = await resolvePlace(seg.place, context, userId);
        break;
      case "chain_brand":
        resolution = await resolveChainBrand(seg.place, context, userId);
        break;
      case "generic_place":
        resolution = await resolveGenericPlace(seg.place, context, userId);
        break;
      default:
        continue; // placeType 未設定 → スキップ
    }

    // 結果をセグメントに反映
    resolved[idx] = {
      ...resolved[idx],
      resolutionConfidence: resolution.confidence,
      resolvedPlaceName: resolution.bestCandidate?.name,
      resolvedAddress: resolution.bestCandidate?.address,
      resolvedPlaceId: resolution.bestCandidate?.placeId,
      resolvedLat: resolution.bestCandidate?.lat,
      resolvedLng: resolution.bestCandidate?.lng,
    };

    // 確認が必要な場合はリストに追加
    if (resolution.confidence === "medium" || resolution.confidence === "low") {
      needsConfirmation.push({ segmentId: seg.id, resolution });
    }

    // 解決済み場所を記録（後続セグメントの動線推定に使う）
    if (resolution.bestCandidate?.address) {
      resolvedPlaces.push(resolution.bestCandidate.address);
    }
  }

  return { resolved, needsConfirmation };
}
