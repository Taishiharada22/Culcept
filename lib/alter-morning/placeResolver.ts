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
  haversineKm,
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
 * CEO方針 2026-04-17 P0:
 *   exact_proper_noun も Places API Text Search を先に試行し、lat/lng を取得する。
 *   Places で coords 付き候補が取れない場合のみ、従来の Web検索にフォールバック。
 *
 *   根拠: 「サドヤ」のような固有名 Web 検索だけだと lat/lng が乗らず、
 *         extractHardAnchors が空 anchor 扱いし、距離ペナルティが効かなくなる。
 *         → 甲府のランチなのに杉並のカフェを提案する事故を誘発していた。
 *
 * パイプライン:
 *   1. キャッシュ確認
 *   2. Places API（coords 取得可能な経路）— high/medium で採用
 *   3. Web検索フォールバック（固有名がローカルで Places 未登録のときの救済）
 *   4. confidence 判定 + キャッシュ保存
 *
 * fail-open: 両経路とも失敗 → unresolved
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

  // 2. Places API を先に試す（P0 2026-04-17）
  //    coords が取れて high/medium の結果が出れば採用 → hard anchor 化が可能になる
  //    low or coords 無しなら Web search フォールバックへ落とす
  if (isPlacesApiAvailable()) {
    const placesResolution = await tryResolveExactViaPlacesApi(placeName, context);
    if (placesResolution) {
      if (userId && placesResolution.bestCandidate) {
        await setCachedResolution(
          userId,
          placeName,
          context.userArea,
          placesResolution,
          "exact_proper_noun",
        );
      }
      return placesResolution;
    }
    // Places で取れなかった → Web フォールバックに落ちる
  }

  // 3. Web検索（固有名が Places に未登録 or Places 使用不能のフォールバック）
  const query = buildSearchQuery(placeName, context);
  let searchResults: SearchResult[];
  try {
    searchResults = await executeSearch([query], 3000);
  } catch {
    console.warn(`[PlaceResolver] Web search failed for "${placeName}"`);
    return unresolvedResult(placeName, "Web検索失敗");
  }

  // 4. 候補抽出 & スコアリング
  const candidates = extractCandidatesFromSearch(searchResults, placeName, context);

  // 5. confidence 判定
  const { confidence, reason } = determineConfidence(candidates);

  const resolution: PlaceResolution = {
    originalText: placeName,
    candidates,
    bestCandidate: candidates[0],
    confidence,
    reason,
  };

  // 6. キャッシュ保存（high/medium のみ、L1 + L2）
  if (userId && resolution.bestCandidate) {
    await setCachedResolution(userId, placeName, context.userArea, resolution, "exact_proper_noun");
  }

  return resolution;
}

/**
 * exact_proper_noun を Places API 経由で解決する内部ヘルパー。
 *
 * CEO方針 2026-04-17 P0:
 *   - Places が low or 空 or coords 欠落の場合は null を返し、呼び出し側で Web にフォールバック
 *   - high/medium で coords 付きなら PlaceResolution を返す
 *
 * 返り値:
 *   - PlaceResolution: Places で coords 付きの候補が取れた
 *   - null: Places では解決できなかった（Web フォールバックに落とす）
 */
async function tryResolveExactViaPlacesApi(
  placeName: string,
  context: ResolutionContext,
): Promise<PlaceResolution | null> {
  const query = buildSearchQuery(placeName, context);
  let places: PlacesApiPlace[] = [];
  try {
    places = await searchPlacesByText({
      textQuery: query,
      maxResultCount: 3,
      languageCode: "ja",
    });
  } catch (e) {
    console.warn(`[PlaceResolver] Places API failed for exact_proper_noun "${placeName}" — falling back to web:`, e);
    return null;
  }
  if (!places || places.length === 0) return null;

  const candidates = placesApiToCandidates(places, placeName, context);
  if (candidates.length === 0) return null;

  // coords が無い候補しか取れなかった場合は anchor 化に使えないので Web 経路へ
  const hasCoords = candidates[0]?.lat != null && candidates[0]?.lng != null;
  if (!hasCoords) return null;

  const { confidence, reason } = determineConfidence(candidates);

  // low は結局 anchor 化しないので Web search に救済機会を渡す
  if (confidence === "low" || confidence === "unresolved") return null;

  return {
    originalText: placeName,
    candidates,
    bestCandidate: candidates[0],
    confidence,
    reason: `places_api: ${reason}`,
  };
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

/**
 * hard anchor 近傍にある top 候補を medium に昇格する。
 *
 * CEO方針 2026-04-17 P1-C:
 *   「ランチが甲府サドヤ（anchor）」と決まっているのに、「マックどこ？」と
 *   候補を羅列するのは UX が悪い。anchor に十分近い候補があれば、
 *   "近くのマクドナルド甲府駅前店でどう？" と 1件絞って提示するべき。
 *
 * 条件:
 *   - 現在の confidence が "low"
 *   - candidates の先頭に lat/lng が揃っている
 *   - 先頭候補が最寄り anchor から ANCHOR_NEAR_KM 以内
 *   - 2位候補があっても、先頭が十分優勢（matchScore 差 >= 0.05 以上）
 *
 * 戻り値: 昇格した場合 medium + candidates を先頭1件に絞る。
 */
const ANCHOR_NEAR_KM = 2.0;
const ANCHOR_PROMOTE_MIN_GAP = 0.05;

function maybePromoteAnchorNearCandidate(
  candidates: PlaceCandidate[],
  context: ResolutionContext,
  currentConfidence: ResolutionConfidence,
): { confidence: ResolutionConfidence; candidates: PlaceCandidate[]; reason?: string } {
  if (currentConfidence !== "low") return { confidence: currentConfidence, candidates };
  if (candidates.length === 0) return { confidence: currentConfidence, candidates };
  if (!context.resolvedAnchors || context.resolvedAnchors.length === 0) {
    return { confidence: currentConfidence, candidates };
  }

  const top = candidates[0];
  if (top.lat == null || top.lng == null) {
    return { confidence: currentConfidence, candidates };
  }

  // gap チェック（2位と拮抗なら promote しない）
  if (candidates.length >= 2) {
    const gap = top.matchScore - candidates[1].matchScore;
    if (gap < ANCHOR_PROMOTE_MIN_GAP) {
      return { confidence: currentConfidence, candidates };
    }
  }

  // 最寄り anchor までの距離
  const topCoords: LatLng = { lat: top.lat, lng: top.lng };
  let minKm = Infinity;
  for (const a of context.resolvedAnchors) {
    if (!a.coords) continue; // coords 欠落の anchor は距離計算不可 → skip
    const km = haversineKm(topCoords, a.coords);
    if (km < minKm) minKm = km;
  }
  if (!isFinite(minKm)) {
    return { confidence: currentConfidence, candidates };
  }

  if (minKm > ANCHOR_NEAR_KM) {
    return { confidence: currentConfidence, candidates };
  }

  // 昇格: top 1件に絞る（候補羅列せずに "○○でどう？" を誘発）
  return {
    confidence: "medium",
    candidates: [top],
    reason: `anchor近傍 (${minKm.toFixed(2)}km) → medium昇格`,
  };
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
// P1-b Resolver 側 near-anchor 防御（CEO方針 2026-04-17）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「近くの/付近の/周辺の〜」系の prefix を持つ場所名を検出するための正規表現。
 * llmPlanExtractor の DECLARATIVE_NEAR_RE と独立に resolver 側で再検査するため複製している。
 * （parser が hint 化に失敗した場合の最終防御線 — 単一の真実源を共有すると
 *   片方を修正しても片方が取りこぼすリスクがあるので、あえて二箇所に持つ設計）
 */
const RESOLVER_NEAR_ANCHOR_RE = /(近く|付近|周り|周辺|近辺)(の|に)?/;

/** P1-b 防御が発動する半径（chain / generic 共通）。徒歩〜車で妥当な 2km。 */
const NEAR_ANCHOR_BIAS_RADIUS_M = 2000;

/**
 * 「近くの〜」系 placeName が渡され、かつ context.resolvedAnchors に高確信な
 * coords 付き anchor があれば、locationBias を返す。
 *
 * CEO方針 2026-04-17 P1-b:
 *   parser 側（DECLARATIVE_NEAR_RE）で hint 化されずに resolver に到達した場合でも、
 *   userArea ではなく anchor の周辺を優先して検索することで「甲府ランチ → 杉並カフェ」
 *   のような事故を防ぐ最終防御線。
 *
 * 採用条件:
 *   - placeName が「近く/付近/周辺」等を含む
 *   - context.resolvedAnchors に 1件以上 coords 付きがある
 *   - resolutionConfidence === "high" の anchor を優先（なければ先頭）
 *
 * 返り値: locationBias 相当 or null（通常経路で userArea を使う）
 */
function resolveNearAnchorLocationBias(
  placeName: string,
  context: ResolutionContext,
): { lat: number; lng: number; radius: number } | null {
  if (!RESOLVER_NEAR_ANCHOR_RE.test(placeName)) return null;
  const anchors = context.resolvedAnchors;
  if (!anchors || anchors.length === 0) return null;

  // coords 付きの anchor を拾う（extractHardAnchors 通過済みなので通常は全件に coords あり）
  const withCoords = anchors.filter(a => a.coords);
  if (withCoords.length === 0) return null;

  // 時刻が近いものを優先（placeName 時刻情報は現状保持していないので先頭を採用）
  const picked = withCoords[0];
  if (!picked.coords) return null;

  return {
    lat: picked.coords.lat,
    lng: picked.coords.lng,
    radius: NEAR_ANCHOR_BIAS_RADIUS_M,
  };
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

  // CEO方針 2026-04-17 P1-b: 二重防御（chain_brand でも anchor 近傍を優先）
  //   「近くのマック」「サドヤ付近のスタバ」のような near-anchor プレフィクス表記に備える。
  const nearAnchorBias = resolveNearAnchorLocationBias(placeName, context);
  const query = nearAnchorBias
    ? normalizedBrand
    : context.userArea
      ? `${normalizedBrand} ${context.userArea}`
      : normalizedBrand;

  // 4. Places Text Search（コスト最適化: maxResultCount=3）
  let places: PlacesApiPlace[];
  try {
    places = await searchPlacesByText({
      textQuery: query,
      maxResultCount: 3,
      ...(nearAnchorBias ? { locationBias: nearAnchorBias } : {}),
    });
  } catch {
    console.warn(`[PlaceResolver] Places API failed for chain_brand "${placeName}"`);
    return unresolvedResult(placeName, "Places API 検索失敗");
  }

  // 5. 候補抽出
  let candidates = placesApiToCandidates(places, placeName, context);

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

  // CEO方針 2026-04-17 P1-C: hard anchor 近傍で 1件絞れるなら medium 昇格
  const promoted = maybePromoteAnchorNearCandidate(candidates, context, confidence);
  if (promoted.reason) {
    confidence = promoted.confidence;
    candidates = promoted.candidates;
    reason = promoted.reason;
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

  // CEO方針 2026-04-17 P1-b: 二重防御
  //   placeName が near-anchor prefix（「近くの〜」「付近の〜」等）を含み、
  //   context.resolvedAnchors に coords 付きの anchor があれば、userArea より
  //   anchor 座標を優先して locationBias を組む。
  //   → parser 側（llmPlanExtractor）が hint 化に失敗しても、resolver 側で救済。
  const nearAnchorBias = resolveNearAnchorLocationBias(placeName, context);
  const query = nearAnchorBias
    ? searchTerm // bias があるときは userArea を query に混ぜない（anchor エリアを汚染しないため）
    : context.userArea
      ? `${searchTerm} ${context.userArea}`
      : searchTerm;

  // 4. Places Text Search（コスト最適化: maxResultCount=5、候補提示用に多めに取る）
  let places: PlacesApiPlace[];
  try {
    places = await searchPlacesByText({
      textQuery: query,
      maxResultCount: 5,
      ...(nearAnchorBias ? { locationBias: nearAnchorBias } : {}),
    });
  } catch {
    console.warn(`[PlaceResolver] Places API failed for generic_place "${placeName}"`);
    return unresolvedResult(placeName, "Places API 検索失敗");
  }

  // 5. 候補抽出
  let candidates = placesApiToCandidates(places, placeName, context);

  // 6. Confidence 判定 + generic ルール適用
  let { confidence, reason } = determineConfidence(candidates);

  // generic_place は常に medium 以下（どの施設か不明）
  if (confidence === "high") {
    confidence = "medium";
    reason = `一般名詞のため medium に制限（元: ${reason}）`;
  }

  // CEO方針 2026-04-17 P1-C: hard anchor 近傍で 1件絞れるなら medium 昇格
  const promoted = maybePromoteAnchorNearCandidate(candidates, context, confidence);
  if (promoted.reason) {
    confidence = promoted.confidence;
    candidates = promoted.candidates;
    reason = promoted.reason;
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
        // P0 2026-04-17: high 確信のみ anchor 化
        resolutionConfidence: r.resolutionConfidence,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// resolveNearAnchorPlaces — Block 2-(c) find_near_anchor intent
//
// CEO方針 2026-04-17:
//   ユーザーが「サドヤ近くのカフェないかな？」のように疑問形で場所を探す場合、
//   Block 1-(2) で placeSearchHint: { nearAnchorLabel, searchCategory, originalQuery } が
//   PlanSegment に設定される。resolveAnchors は placeType で switch するので、疑問文は
//   anchor 扱いされず未解決のまま通過する。
//
//   本関数は placeSearchHint を持つセグメントに対して:
//   1) nearAnchorLabel の座標を解決（既 resolved な anchor を優先、無ければ単独 resolve）
//   2) searchPlacesByText(textQuery=searchCategory, locationBias=anchor±1.5km)
//   3) 結果を候補として needsConfirmation に積む（confidence=medium 固定、
//      勝手に採用しない＝CEO方針「候補確認は全部ユーザーに聞く」）
//
//   fail-open: Places API 未設定・失敗時はスキップしてプラン生成を続行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * カテゴリ別 near-anchor 検索半径（メートル）。
 *
 * GPT提案 2026-04-17:
 *   cafe / restaurant / bar は徒歩圏 1.5km、park / library / 図書館 はちょっと足を伸ばしていい 2km、
 *   station / hospital / shopping mall は車前提で 3km。
 *   hardcode ではなく調整可能な形で定数化しておき、今後キャリブレーション可能にする。
 *
 * 未知カテゴリは DEFAULT_NEAR_ANCHOR_RADIUS_M に落とす。
 */
const NEAR_ANCHOR_RADIUS_BY_CATEGORY: Record<string, number> = {
  // 徒歩圏
  cafe: 1500,
  restaurant: 1500,
  bar: 1500,
  izakaya: 1500,
  fast_food: 1500,
  convenience_store: 1000,
  bakery: 1500,
  // 少し広め（公園・図書館は目的地が散在）
  park: 2000,
  library: 2000,
  museum: 2000,
  gym: 2000,
  // 広域（車前提）
  station: 3000,
  hospital: 3000,
  shopping: 3000,
  shopping_mall: 3000,
  supermarket: 2000,
};
const DEFAULT_NEAR_ANCHOR_RADIUS_M = 1500;

/**
 * searchCategory 文字列から radius を決める。
 * カテゴリ名は日本語/英語/カテゴリ slug が混在しうるので
 * ゆるめの includes マッチで正規化する。
 */
function getNearAnchorRadius(searchCategory: string | undefined): number {
  if (!searchCategory) return DEFAULT_NEAR_ANCHOR_RADIUS_M;
  const lower = searchCategory.toLowerCase();
  // 日本語 → 英語 slug への正規化
  const jpMap: Record<string, string> = {
    "カフェ": "cafe",
    "喫茶": "cafe",
    "レストラン": "restaurant",
    "バー": "bar",
    "居酒屋": "izakaya",
    "コンビニ": "convenience_store",
    "ベーカリー": "bakery",
    "パン屋": "bakery",
    "公園": "park",
    "図書館": "library",
    "ジム": "gym",
    "駅": "station",
    "病院": "hospital",
    "ショッピング": "shopping",
    "モール": "shopping_mall",
    "スーパー": "supermarket",
    "美術館": "museum",
    "博物館": "museum",
  };
  for (const [jp, slug] of Object.entries(jpMap)) {
    if (searchCategory.includes(jp)) {
      return NEAR_ANCHOR_RADIUS_BY_CATEGORY[slug] ?? DEFAULT_NEAR_ANCHOR_RADIUS_M;
    }
  }
  // 英語 slug の直接マッチ
  for (const key of Object.keys(NEAR_ANCHOR_RADIUS_BY_CATEGORY)) {
    if (lower.includes(key)) return NEAR_ANCHOR_RADIUS_BY_CATEGORY[key];
  }
  return DEFAULT_NEAR_ANCHOR_RADIUS_M;
}

// 後方互換: 既存テスト/呼び出し用の alias（新規利用は getNearAnchorRadius 経由）
const NEAR_ANCHOR_SEARCH_RADIUS_M = DEFAULT_NEAR_ANCHOR_RADIUS_M;

/**
 * nearAnchorLabel から anchor 座標 + confidence を取得する。
 *
 * GPT追加ルール 2026-04-17:
 *   anchor 自体が曖昧（medium/low/unresolved）なら near search を走らせない。
 *   → 本関数は confidence も返し、呼び出し側で high のみ許可する。
 *
 * 優先順位:
 *   1. 既に resolved な segment に同名 label があれば、その resolved 座標 + confidence を返す
 *      （同じプラン内で「サドヤでディナー → サドヤ近くのカフェ」の組み合わせに対応）
 *   2. いずれも無ければ null（呼び出し側でスキップ）
 *
 * 注: 単独 resolve（resolvePlace 呼び出し）はコスト的に高いため Phase 1 では
 *     同プラン内参照のみ。必要なら Phase 2 で拡張する。
 */
function findAnchorCoords(
  resolved: PlanSegment[],
  anchorLabel: string,
): { coords: LatLng; confidence: ResolutionConfidence } | null {
  if (!anchorLabel) return null;
  const needle = anchorLabel.trim();
  for (const r of resolved) {
    const name = r.resolvedPlaceName ?? r.placeCanonical ?? r.place;
    if (!name || r.resolvedLat === undefined || r.resolvedLng === undefined) continue;
    // 正規化比較: 部分一致（「サドヤ」が「サドヤ ワイナリー」にマッチ）
    if (name.includes(needle) || needle.includes(name)) {
      return {
        coords: { lat: r.resolvedLat, lng: r.resolvedLng },
        // resolvedPlaceName が乗っている以上、resolutionConfidence は high であるべきだが
        // 万が一欠落していた場合は low 扱いで安全側に倒す
        confidence: r.resolutionConfidence ?? "low",
      };
    }
  }
  return null;
}

/**
 * PlacesApiPlace → PlaceCandidate 変換
 */
function placesApiToNearCandidate(
  p: PlacesApiPlace,
  anchorCoords: LatLng,
  radiusM: number,
): PlaceCandidate {
  const candLat = p.location?.latitude;
  const candLng = p.location?.longitude;
  // 距離ベースのスコア: 近いほど高い（1.0 at 0m → 0.5 at radius → 0.0 at 2×radius）
  let matchScore = 0.5;
  if (candLat !== undefined && candLng !== undefined) {
    const distKm = haversineKm(anchorCoords, { lat: candLat, lng: candLng });
    const distM = distKm * 1000;
    matchScore = Math.max(0, 1 - distM / (radiusM * 2));
  }
  return {
    name: p.displayName?.text ?? "",
    address: p.shortFormattedAddress ?? p.formattedAddress,
    category: p.types?.[0],
    placeId: p.id,
    lat: candLat,
    lng: candLng,
    source: "places_api",
    matchScore,
  };
}

/**
 * 候補の重複除去。
 *
 * GPT追加ルール 2026-04-17:
 *   同じ駅前カフェが placeId 違い / 表記揺れで複数件返ることがある。
 *   placeId → 正規化 address → 正規化 name の順で dedupe する。
 */
function dedupeCandidates(candidates: PlaceCandidate[]): PlaceCandidate[] {
  const seen = new Set<string>();
  const out: PlaceCandidate[] = [];
  for (const c of candidates) {
    const normalizedAddress = c.address ? c.address.replace(/\s+/g, "") : null;
    const normalizedName = c.name.replace(/\s+/g, "");
    const key = c.placeId ?? normalizedAddress ?? normalizedName;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * 0 件時の reason に乗せる識別子。
 *
 * GPT追加ルール 2026-04-17:
 *   候補 0 件で通常の「場所を教えて」に落とすと、"near anchor" 文脈が消えてしまう。
 *   UI 側で「範囲を広げる」「別カテゴリで探す」を出せるよう、reason を機械可読にする。
 *
 * 形式: "near_anchor_zero:<searchCategory>@<anchorLabel>:radius=<meters>"
 */
export const NEAR_ANCHOR_ZERO_REASON_PREFIX = "near_anchor_zero";

function buildZeroCandidateReason(
  anchorLabel: string,
  searchCategory: string,
  radiusM: number,
): string {
  return `${NEAR_ANCHOR_ZERO_REASON_PREFIX}:${searchCategory}@${anchorLabel}:radius=${radiusM}`;
}

export async function resolveNearAnchorPlaces(
  segments: PlanSegment[],
  _userArea?: string,
  _userId?: string,
): Promise<{
  resolved: PlanSegment[];
  needsConfirmation: Array<{ segmentId: string; resolution: PlaceResolution }>;
}> {
  const resolved = [...segments];
  const needsConfirmation: Array<{ segmentId: string; resolution: PlaceResolution }> = [];

  // Places API 未設定 → fail-open（何もしない）
  if (!isPlacesApiAvailable()) {
    return { resolved, needsConfirmation };
  }

  for (let i = 0; i < resolved.length; i++) {
    const seg = resolved[i];
    const hint = seg.placeSearchHint;
    if (!hint || !hint.searchCategory) continue;
    // 既に解決済みならスキップ（ユーザーが後から場所を上書きした場合）
    if (seg.resolvedPlaceName) continue;

    // 1) anchor 座標取得 + confidence チェック
    const anchor = hint.nearAnchorLabel
      ? findAnchorCoords(resolved, hint.nearAnchorLabel)
      : null;
    // anchor 座標が取れない → Phase 1 ではスキップ
    if (!anchor) continue;
    // GPT追加ルール: anchor 自体が曖昧（high 未満）なら near search を走らせない。
    // まず anchor 確認を優先し、曖昧な anchor の近くを探すことはしない。
    if (anchor.confidence !== "high") continue;

    const anchorCoords = anchor.coords;
    // GPT rule 4 UI side: ユーザーが「広げる」と応えた結果 radiusOverrideM が乗っていれば優先
    const radiusM = hint.radiusOverrideM ?? getNearAnchorRadius(hint.searchCategory);

    // 2) Places API 呼び出し
    let apiResults: PlacesApiPlace[] = [];
    try {
      apiResults = await searchPlacesByText({
        textQuery: hint.searchCategory,
        locationBias: {
          lat: anchorCoords.lat,
          lng: anchorCoords.lng,
          radius: radiusM,
        },
        maxResultCount: 5,
        languageCode: "ja",
      });
    } catch (e) {
      console.warn("[resolveNearAnchorPlaces] searchPlacesByText failed:", e);
      continue;
    }

    // 3) 候補を PlaceCandidate に変換（距離スコア順）+ dedupe
    const rawCandidates = apiResults
      .filter(p => p.businessStatus !== "CLOSED_PERMANENTLY")
      .map(p => placesApiToNearCandidate(p, anchorCoords, radiusM))
      .sort((a, b) => b.matchScore - a.matchScore);
    const candidates = dedupeCandidates(rawCandidates).slice(0, 3);

    // 候補 0 件: near-anchor 専用 clarify 用の reason を乗せる
    // → UI 側で「サドヤ近くで候補なし。範囲を広げる／別カテゴリ？」を出せる
    const resolution: PlaceResolution = candidates.length === 0
      ? {
          originalText: hint.originalQuery ?? seg.place ?? hint.searchCategory,
          candidates: [],
          bestCandidate: undefined,
          confidence: "low",
          reason: buildZeroCandidateReason(
            hint.nearAnchorLabel ?? "anchor",
            hint.searchCategory,
            radiusM,
          ),
        }
      : {
          originalText: hint.originalQuery ?? seg.place ?? hint.searchCategory,
          candidates,
          bestCandidate: candidates[0],
          // CEO方針: 勝手に採用しない → 常に medium（ユーザー選択させる）
          confidence: "medium",
          reason: `near ${hint.nearAnchorLabel ?? "anchor"} (r=${radiusM}m): ${candidates.length} 件の候補`,
        };

    // resolved セグメントには bestCandidate を暫定セット（住所・座標が plan 表示で使われるため）
    // ただし status は「確認待ち」— pendingPlaceConfirmations に積むので UI 側で確認を出す
    if (resolution.bestCandidate) {
      resolved[i] = {
        ...seg,
        resolutionConfidence: resolution.confidence,
        resolvedPlaceName: resolution.bestCandidate.name,
        resolvedAddress: resolution.bestCandidate.address,
        resolvedPlaceId: resolution.bestCandidate.placeId,
        resolvedLat: resolution.bestCandidate.lat,
        resolvedLng: resolution.bestCandidate.lng,
      };
    }
    needsConfirmation.push({ segmentId: seg.id, resolution });
  }

  return { resolved, needsConfirmation };
}

// 未使用 alias（将来の外部参照用に残す）— tsc が未使用警告を出さないよう void に渡す
void NEAR_ANCHOR_SEARCH_RADIUS_M;
