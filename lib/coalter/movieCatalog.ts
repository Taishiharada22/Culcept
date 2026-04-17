/**
 * CoAlter L4.5: 映画上映情報の構造化 — P0-1
 *
 * 目的: LLM が作品名を「発明」するのを防ぐ。
 *
 * パイプライン:
 *   検索結果 (SearchCandidate[])
 *     ↓  parseMovieScreenings
 *   構造化された上映情報 (MovieScreening[])  ← これを LLM に「この中から選べ」と渡す
 *
 * 抽出対象:
 *   - 作品名（title を正規化）
 *   - 映画館名（TOHOシネマズ / MOVIX / 109シネマズ 等のパターン）
 *   - 公開ステータス（上映中 / 公開予定）
 *   - 上映時刻（"19:00" 等）
 *   - 上映時間（"118分" → 118）
 *   - 評価（★4.2 / Filmarks 3.9 / 4.2点 等）
 */

import type { MovieScreening, SearchCandidate } from "./types";

// ─────────────────────────────────────────────
// 映画館チェーン・劇場名の識別パターン
// ─────────────────────────────────────────────

/**
 * 主要な映画館チェーン + 単館の表記ゆれをカバー。
 *
 * "TOHOシネマズ新宿" "109シネマズ木場" "新宿バルト9" 等を抽出する正規表現。
 */
const THEATER_PATTERNS: RegExp[] = [
  /TOHOシネマズ[\u30A0-\u30FF\u4E00-\u9FFF\w]+/gi,
  /MOVIX[\u30A0-\u30FF\u4E00-\u9FFF\w]+/gi,
  /109シネマズ[\u30A0-\u30FF\u4E00-\u9FFF\w]+/gi,
  /ユナイテッド・?シネマ[\u30A0-\u30FF\u4E00-\u9FFF\w]*/gi,
  /イオンシネマ[\u30A0-\u30FF\u4E00-\u9FFF\w]+/gi,
  /グランドシネマサンシャイン[\u30A0-\u30FF\u4E00-\u9FFF\w]*/gi,
  /[新旧]?宿ピカデリー/gi,
  /新宿バルト9/gi,
  /新宿ピカデリー/gi,
  /丸の内ピカデリー/gi,
  /日比谷シャンテ/gi,
  /TOHOシネマズ日比谷/gi,
  /シネクイント/gi,
  /kino cinéma[\u30A0-\u30FF\u4E00-\u9FFFa-z]*/gi,
  /ヒューマントラスト[\u30A0-\u30FF\u4E00-\u9FFF]+/gi,
  /テアトル[\u30A0-\u30FF\u4E00-\u9FFF]+/gi,
  /アップリンク[\u30A0-\u30FF\u4E00-\u9FFF]*/gi,
];

/** snippet 内に含まれる映画館名を全部拾う */
export function extractTheaters(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const pat of THEATER_PATTERNS) {
    const matches = text.match(pat);
    if (matches) {
      for (const m of matches) {
        const cleaned = m.trim();
        if (cleaned.length >= 3 && cleaned.length <= 30) found.add(cleaned);
      }
    }
  }
  return [...found];
}

// ─────────────────────────────────────────────
// 上映時刻 / 上映時間 / 公開ステータス 抽出
// ─────────────────────────────────────────────

/** "19:00", "21:30" 等の時刻を拾う（最大6個まで） */
export function extractShowtimes(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const re = /\b(\d{1,2}):(\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const h = Number(m[1]);
    const mm = Number(m[2]);
    // 映画上映は 0:00〜27:00 程度の範囲（深夜上映対応）
    if (h < 0 || h > 27) continue;
    if (mm < 0 || mm > 59) continue;
    // 0-6 時は深夜上映以外ではノイズが多いので除外
    if (h < 8) continue;
    found.add(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
    if (found.size >= 6) break;
  }
  return [...found].sort();
}

/** "118分" → 118 */
export function extractRuntimeMinutes(text: string): number | null {
  if (!text) return null;
  // "118分" or "2時間5分" or "120min"
  const mMin = text.match(/(\d{2,3})\s*分/);
  if (mMin) {
    const n = Number(mMin[1]);
    if (n >= 40 && n <= 260) return n;
  }
  const mHour = text.match(/(\d)\s*時間\s*(\d{1,2})?\s*分?/);
  if (mHour) {
    const h = Number(mHour[1]);
    const m2 = mHour[2] ? Number(mHour[2]) : 0;
    const total = h * 60 + m2;
    if (total >= 40 && total <= 260) return total;
  }
  return null;
}

/** 公開ステータス */
export function extractStatus(
  text: string,
): "showing" | "upcoming" | "unknown" {
  if (!text) return "unknown";
  if (/公開予定|近日公開|\d{1,2}月\d{1,2}日.{0,3}公開|今冬公開|今秋公開|今夏公開|今春公開/.test(text)) {
    return "upcoming";
  }
  if (/上映中|公開中|絶賛上映|好評上映|現在上映/.test(text)) {
    return "showing";
  }
  return "unknown";
}

/** 評価: Filmarks / 映画.com / 星 等の表記から拾う */
export function extractRating(text: string): string | null {
  if (!text) return null;
  // Filmarks 4.2, 映画.com 3.8
  const site = text.match(/(Filmarks|映画\.com|filmarks)\s*[:：]?\s*(\d\.\d{1,2})/);
  if (site) return `${site[1]} ${site[2]}`;
  // "4.2点" or "4.2/5"
  const score = text.match(/(\d\.\d{1,2})\s*(点|\/\s*5)/);
  if (score) return `★${score[1]}`;
  // ★4.2 / ☆
  const stars = text.match(/★\s*(\d(?:\.\d)?)/);
  if (stars) return `★${stars[1]}`;
  return null;
}

// ─────────────────────────────────────────────
// タイトル正規化
// ─────────────────────────────────────────────

/**
 * 検索結果の title から作品名を抽出する。
 *
 * 検索結果の title は:
 *   - 「『ラストマイル』 | 映画-映画.com」
 *   - 「ラストマイル | 上映時間・上映館 - Filmarks」
 *   - 「映画『PERFECT DAYS』 - 公式サイト」
 *
 * みたいに装飾が付いているので、本体の作品名だけを抽出する。
 */
export function extractMovieTitle(rawTitle: string): string | null {
  if (!rawTitle) return null;
  let t = rawTitle.trim();

  // サイト名を末尾から削る: "| 映画.com", "- Filmarks", "| Yahoo!映画"
  t = t.replace(/\s*[|｜\-—‐]\s*.{0,4}(映画\.com|Filmarks|filmarks|Yahoo|eiga|gqjapan|moviewalker|シネフィル|ぴあ|公式|Official|Trailer|公式サイト|上映時間|上映館|予告|レビュー|あらすじ).*$/i, "");

  // 括弧で囲まれたタイトル: 『』「」
  const bracketed = t.match(/[『「【]([^』」】]+)[』」】]/);
  if (bracketed) {
    const inner = bracketed[1].trim();
    if (inner.length >= 1 && inner.length <= 40) return inner;
  }

  // "映画『X』" などの接頭を削る
  t = t.replace(/^映画\s*/i, "");
  t = t.trim();

  // 末尾のノイズ: "（2024）" "(2026年)" "| 2026" "【公式】"
  t = t.replace(/\s*[（(【][^）)】]{0,10}[）)】]\s*$/, "");
  t = t.replace(/\s*[|｜]\s*\d{4}.*$/, "");

  if (t.length < 1 || t.length > 40) return null;

  // ジャンル名だけなら reject (「恋愛映画」「アクション」)
  const GENRE_ONLY = [
    "恋愛映画", "アクション", "サスペンス", "ホラー", "コメディ",
    "SF", "ファンタジー", "ドキュメンタリー", "ミステリー",
    "ロマンス", "アニメ", "邦画", "洋画", "実写",
    "映画", "作品", "新作", "話題作",
  ];
  if (GENRE_ONLY.includes(t.trim())) return null;

  return t.trim();
}

// ─────────────────────────────────────────────
// メイン: SearchCandidate[] → MovieScreening[]
// ─────────────────────────────────────────────

/**
 * 検索結果を映画上映 catalog に変換する。
 *
 * 1 検索結果 = 多くの場合 1 作品情報。title / snippet から構造化。
 *
 * @param searchCandidates 検索結果
 * @returns 構造化された上映情報リスト（title が抽出できたものだけ）
 */
export function parseMovieScreenings(
  searchCandidates: SearchCandidate[],
): MovieScreening[] {
  const screenings: MovieScreening[] = [];
  const seenTitles = new Set<string>();

  for (const sc of searchCandidates) {
    const combinedText = [sc.title, sc.description, sc.practicalInfo ?? ""].join(
      " ",
    );

    const title = extractMovieTitle(sc.title) ?? extractMovieTitle(sc.description);
    if (!title) continue;
    // 既出は skip（複数検索結果に同じ作品が出ることが多い）
    const normKey = title.replace(/\s+/g, "").toLowerCase();
    if (seenTitles.has(normKey)) continue;
    seenTitles.add(normKey);

    const theaters = extractTheaters(combinedText);
    const showtimes = extractShowtimes(combinedText);
    const runtimeMinutes = extractRuntimeMinutes(combinedText);
    const status = extractStatus(combinedText);
    const rating = extractRating(combinedText) ?? sc.externalRating ?? null;

    // theater は先頭1件を代表値として持つ。全てのリストは ui 側で使わないので省略。
    const theater = theaters[0] ?? null;

    screenings.push({
      title,
      theater,
      status,
      showtimes,
      runtimeMinutes,
      rating,
      sourceUrl: sc.url ?? "",
      source: sc.source,
      snippet: sc.description.slice(0, 140),
    });
  }

  return screenings;
}

// ─────────────────────────────────────────────
// Catalog lookup ヘルパ（validator / prompt 用）
// ─────────────────────────────────────────────

/** 正規化して fuzzy 比較する（「 」「・」「〜」等の違いを吸収） */
function normalizeForMatch(s: string): string {
  return s
    .replace(/[\s\u3000・〜～\-−ー!?！？「」『』【】（）()]+/g, "")
    .toLowerCase();
}

/**
 * label が catalog 内の作品 title と fuzzy match するか。
 *
 * 完全一致 / label が title に含まれる / title が label に含まれる で OK。
 * いずれも最低 3 文字の共通部分が必要（短すぎは偶然の一致を拾う）。
 */
export function matchesCatalogTitle(
  label: string,
  catalog: MovieScreening[],
): boolean {
  if (!label || catalog.length === 0) return false;
  const target = normalizeForMatch(label);
  if (target.length < 2) return false;
  for (const s of catalog) {
    const t = normalizeForMatch(s.title);
    if (t.length < 2) continue;
    if (target === t) return true;
    if (t.includes(target) && target.length >= 3) return true;
    if (target.includes(t) && t.length >= 3) return true;
  }
  return false;
}

/**
 * label が catalog の theater list と match するか。
 *
 * label が null / 空 → false（映画館未指定として扱う）
 * catalog に theater 情報が1つも無い → true（validator では theater 検査を skip するため）
 */
export function matchesCatalogTheater(
  label: string | undefined | null,
  catalog: MovieScreening[],
): boolean {
  if (!label) return false;
  const theaters = catalog
    .map((s) => s.theater)
    .filter((t): t is string => !!t);
  if (theaters.length === 0) return true; // catalog に theater が無ければ検査 skip
  const target = normalizeForMatch(label);
  if (target.length < 2) return false;
  return theaters.some((t) => {
    const n = normalizeForMatch(t);
    return target === n || target.includes(n) || n.includes(target);
  });
}

/** catalog からユニークな theater 名のリスト */
export function listCatalogTheaters(catalog: MovieScreening[]): string[] {
  const set = new Set<string>();
  for (const s of catalog) {
    if (s.theater) set.add(s.theater);
  }
  return [...set];
}

/**
 * catalog を LLM 用プロンプトブロックに整形する。
 *
 * 形式（LLM が「この中から選ぶ」のに最適な構造）:
 *   1. ラストマイル（上映中）
 *      - 劇場: TOHOシネマズ新宿
 *      - 上映: 14:00 / 17:30 / 20:50
 *      - 上映時間: 118 分
 *      - 評価: ★4.2 (Filmarks)
 *      - https://eiga.com/...
 */
export function catalogToPromptBlock(catalog: MovieScreening[]): string {
  if (catalog.length === 0) return "";
  const lines: string[] = [];
  lines.push("## 上映情報カタログ（この中から候補を選ぶこと。作品名を発明してはいけない）");
  for (let i = 0; i < catalog.length; i++) {
    const s = catalog[i];
    const statusLabel =
      s.status === "showing" ? "上映中"
        : s.status === "upcoming" ? "公開予定"
          : "状態不明";
    lines.push(`${i + 1}. ${s.title}（${statusLabel}）`);
    if (s.theater) lines.push(`   - 劇場: ${s.theater}`);
    if (s.showtimes.length > 0) lines.push(`   - 上映: ${s.showtimes.join(" / ")}`);
    if (s.runtimeMinutes) lines.push(`   - 上映時間: ${s.runtimeMinutes} 分`);
    if (s.rating) lines.push(`   - 評価: ${s.rating}`);
    if (s.sourceUrl) lines.push(`   - ${s.sourceUrl}`);
  }
  lines.push("");
  lines.push(
    "候補の slots.what.label は上記 title と一致させること。劇場を埋める場合は上記 theater から選ぶこと。発明禁止。",
  );
  return lines.join("\n");
}
