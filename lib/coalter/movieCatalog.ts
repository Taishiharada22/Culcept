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

/**
 * リリース年を拾う（Phase A.6 P1）。
 *
 * 対応パターン:
 *   - "2024年公開" "2024年10月公開"
 *   - "（2024）" "(2024)" "[2024]" "【2024】"
 *   - "2024年の話題作" （snippet 内の言及）
 *   - "2024/10/25" "2024-10-25" （日付）
 *   - "公開日: 2024年" （最低限）
 *
 * 拾う範囲は 1960-2099 に限定（電話番号 / 時刻 / 映画コード等を拾わないため）。
 */
export function extractReleaseYear(text: string): number | null {
  if (!text) return null;

  const candidates: number[] = [];

  // "2024年" (直前に ISBN/ID 的な数字列が来ないもの)
  const reYearJp = /(?<![\d])((?:19|20)\d{2})年/g;
  let m: RegExpExecArray | null;
  while ((m = reYearJp.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n >= 1960 && n <= 2099) candidates.push(n);
  }

  // 括弧内の年: （2024） / (2024) / [2024] / 【2024】
  const reBracket = /[（(\[【]\s*((?:19|20)\d{2})\s*[）)\]】]/g;
  while ((m = reBracket.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n >= 1960 && n <= 2099) candidates.push(n);
  }

  // 日付 2024/10/25 or 2024-10-25 (月・日が妥当な範囲)
  const reDate = /(?<![\d])((?:19|20)\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/g;
  while ((m = reDate.exec(text)) !== null) {
    const y = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    if (y >= 1960 && y <= 2099 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      candidates.push(y);
    }
  }

  if (candidates.length === 0) return null;
  // 複数の年が出たら「最新」を採用（リリース年は他の年より新しいことが多い）
  return Math.max(...candidates);
}

/**
 * 公開ステータス。
 *
 * Phase A.6 P1: "ended" を追加。
 *   - 明示的「上映終了 / 公開終了 / 終映」→ ended
 *   - release year が reference date より 1 年以上前で showing 明示なし → ended
 *   - 明示的 showing が優先（再上映・ロングラン対応）
 *
 * @param text 検査対象の文字列
 * @param referenceNow stale 判定の基準日（省略時は new Date()）
 */
export function extractStatus(
  text: string,
  referenceNow: Date = new Date(),
): "showing" | "upcoming" | "ended" | "unknown" {
  if (!text) return "unknown";

  // (1) 明示的 showing が最優先（再上映・リバイバルケース）
  const explicitShowing =
    /上映中|公開中|絶賛上映|好評上映|現在上映|ただいま上映|ロードショー公開中/.test(text);
  if (explicitShowing) return "showing";

  // (2) 明示的 ended
  if (/上映[はを]?終了|公開[はを]?終了|上映終了しました|公開終了しました|終映/.test(text)) {
    return "ended";
  }

  // (3) 明示的 upcoming
  if (
    /公開予定|近日公開|\d{1,2}月\d{1,2}日.{0,3}公開|今冬公開|今秋公開|今夏公開|今春公開|\d{4}年\d{1,2}月公開/.test(
      text,
    )
  ) {
    return "upcoming";
  }

  // (4) release year による stale 判定
  //    reference 年 - release 年 >= 2 → ended（2026 現在、2024 年公開は「もう終わってる」確度が高い）
  //    reference 年 - release 年 == 1 で reference 月 >= 4 → ended（14 ヶ月以上経過）
  const releaseYear = extractReleaseYear(text);
  if (releaseYear !== null) {
    const currentYear = referenceNow.getFullYear();
    const currentMonth = referenceNow.getMonth() + 1; // 1-12
    const diffYears = currentYear - releaseYear;
    if (diffYears >= 2) return "ended";
    if (diffYears === 1 && currentMonth >= 4) return "ended";
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
 * 現実の title は装飾が多様:
 *   - 「『ラストマイル』 | 映画-映画.com」          … 括弧あり
 *   - 「ラストマイル｜TOHOシネマズ渋谷｜上映時間」   … パイプ分割の先頭
 *   - 「映画『PERFECT DAYS』 - 公式サイト」         … 接頭辞 + 括弧
 *   - 「【2026年4月】渋谷のおすすめ映画10選 | 映画.com」 … リスティクル (除外)
 *   - 「上映スケジュール | TOHOシネマズ渋谷」         … スケジュールページ (除外)
 *
 * 方針:
 *   1. `『...』` `「...」` の括弧優先（ここに作品名が入る規約が強い）
 *   2. パイプ `| ｜` でセグメント分割 → サイト/劇場/meta を除いた先頭セグメント
 *      （ハイフンは作品名内に混入しやすいので分割に使わない）
 *   3. リスティクル / スケジュール系の非タイトル語を検出したら reject
 *   4. ジャンル名単体も reject
 */

/**
 * サイト名・劇場名・meta 語（title 分解時に「これは title ではない」印）。
 *
 * 2026-04-26 追加: `クランクイン` (crank-in.net の page 名)。
 *   実 retrieval で「【TOHOシネマズ 池袋】上映作品・スケジュール・アクセス ｜クランクイン！」が
 *   パイプ分割の 2 番目 segment として「クランクイン！」が title 候補として採用されていた。
 *   genuine 映画「クランクイン」は `『クランクイン』` 括弧付きで来る想定 (Step 1 経由で救済)。
 */
const NON_TITLE_SEGMENT = /(映画\.com|Filmarks|filmarks|Yahoo|Wikipedia|wiki|eiga|gqjapan|moviewalker|シネフィル|ぴあ|クランクイン|TOHOシネマズ|MOVIX|109シネマズ|イオンシネマ|ユナイテッド.?シネマ|新宿バルト|ピカデリー|テアトル|シネクイント|ヒューマントラスト|アップリンク|映画館|シアター|cinema|Cinema|CINEMA|シネマ|公式サイト|Official Site|Trailer|予告(編)?|レビュー|あらすじ|キャスト|監督|作品情報|映画情報|上映時間|上映館|上映情報|上映スケジュール|上映中の映画|上映中|スケジュール)/i;

/** リスティクル / まとめ記事系の非タイトル */
const LISTICLE_PATTERNS: RegExp[] = [
  /\d+\s*選/,
  /ランキング/,
  /おすすめ.{0,4}(映画|作品|邦画|洋画|デート)/,
  /人気.{0,4}(映画|作品)/,
  /話題の(映画|作品)/,
  /特集/,
  /まとめ/,
  /比較/,
  /一覧|ラインナップ/,
  /今週の(映画|上映)/,
  /(春|夏|秋|冬)の.{0,3}(映画|おすすめ)/,
  /最新作品|最新映画/,
];

function isListicleOrMeta(s: string): boolean {
  if (!s) return true;
  return LISTICLE_PATTERNS.some((re) => re.test(s));
}

const GENRE_ONLY = new Set([
  "恋愛映画", "アクション", "サスペンス", "ホラー", "コメディ",
  "SF", "ファンタジー", "ドキュメンタリー", "ミステリー",
  "ロマンス", "アニメ", "邦画", "洋画", "実写",
  "映画", "作品", "新作", "話題作",
]);

function cleanSegment(s: string): string {
  return s
    .replace(/^\s*映画\s*/i, "")
    .replace(/\s*[（(][^）)]{0,14}[）)]\s*$/, "") // 末尾の (2024) (2026年)
    .replace(/\s*【[^】]{0,14}】\s*$/, "")          // 末尾の【公式】【予告】
    .replace(/\s*[|｜]\s*\d{4}.*$/, "")             // 末尾の | 2026...
    .trim();
}

function acceptTitleCandidate(raw: string): string | null {
  const cleaned = cleanSegment(raw).trim();
  if (!cleaned) return null;
  if (cleaned.length > 40) return null;
  if (GENRE_ONLY.has(cleaned)) return null;
  if (isListicleOrMeta(cleaned)) return null;
  return cleaned;
}

export function extractMovieTitle(rawTitle: string): string | null {
  if (!rawTitle) return null;
  const source = rawTitle.trim();
  if (!source) return null;

  // 1) 括弧優先: 『』「」 （【...】は「【公式】」のような装飾枠なので除外）
  const bracketed = source.match(/[『「]([^』」]+)[』」]/);
  if (bracketed) {
    const picked = acceptTitleCandidate(bracketed[1]);
    if (picked) return picked;
  }

  // 2) パイプ分割 → site/meta/listicle を除いた先頭セグメント
  const segments = source.split(/[|｜]/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (NON_TITLE_SEGMENT.test(seg)) continue;
    if (isListicleOrMeta(seg)) continue;
    const picked = acceptTitleCandidate(seg);
    if (picked) return picked;
  }

  // 3) 最後のフォールバック: source 全体を cleanup して受け入れ
  const picked = acceptTitleCandidate(source);
  if (picked && !NON_TITLE_SEGMENT.test(picked)) return picked;

  return null;
}

/**
 * description / snippet から `『X』` `「X」` で囲まれた作品名を全部拾う。
 *
 * リスティクル記事 (「渋谷のおすすめ映画10選」) では、title 自体は記事タイトルだが
 * description に複数の作品名が 『』 で列挙される。これを拾うと
 * 1 検索結果 → 複数 screening に展開でき、映画テーマの提案枯渇を防げる。
 */
export function extractBracketedTitles(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const re = /[『「]([^』」]+)[』」]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const picked = acceptTitleCandidate(m[1]);
    if (!picked) continue;
    const key = picked.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(picked);
    if (found.length >= 6) break;
  }
  return found;
}

/**
 * 2026-04-27 Bug 2: description 内の markdown heading から作品名候補を抽出する。
 *
 * 動機: crank-in / その他の listing page の description は `『...』` `「...」` ではなく
 *   `# {作品名}` (markdown level-1 heading) で作品が列挙される構造を持つ。
 *   `extractBracketedTitles` だけでは拾えず、Bug 1 修正（page 名 reject）後に
 *   description fallback が機能しなくなる問題があった。
 *
 * 採用条件:
 *   - level-1 heading `^#\s+...` のみを採用（`##`, `###` は meta header の傾向が強い、
 *     例: `## 上映作品・スケジュール` `## 映画情報`）
 *   - 既存 `acceptTitleCandidate` (cleanSegment + length + GENRE_ONLY + isListicleOrMeta) を必ず通す
 *   - 加えて `NON_TITLE_SEGMENT` で source/site/theater/meta 名を reject
 *     （`# TOHOシネマズ` `# クランクイン！` `# 池袋の映画館 上映スケジュール` 等）
 *   - 重複排除 + 上限 6 件
 *
 * 失敗時 fail-open: 例外を投げず `[]` を返す。
 */
export function extractMarkdownHeadingTitles(text: string): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  // level-1 heading のみ。`^##` `^###` 等は match させない (negative lookahead は使わず、
  // capture 後に `##` で始まらないことを確認する設計でも可だが、ここでは簡潔に
  // `(?:^|\n)# ` で開始位置を制約する)。
  const re = /(?:^|\n)#\s+([^\n]+)/g;
  let m: RegExpExecArray | null;
  try {
    while ((m = re.exec(text)) !== null) {
      const raw = m[1].trim();
      if (!raw) continue;
      const picked = acceptTitleCandidate(raw);
      if (!picked) continue;
      // source / site / theater / meta 名は reject (Bug 1 と同じ規則を適用)
      if (NON_TITLE_SEGMENT.test(picked)) continue;
      const key = picked.replace(/\s+/g, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(picked);
      if (found.length >= 6) break;
    }
  } catch {
    // §2.3 失敗独立: fail-open
    return found;
  }
  return found;
}

// ─────────────────────────────────────────────
// Title → Theater 紐付け
//
// Phase A.5 方針 (GPT 指定):
//   許容する補完ソース:
//     (1) result title 内の明示一致         （ラストマイル｜TOHOシネマズ渋谷）
//     (2) source URL / known page pattern   （hlo.tohotheater.jp/shibuya）
//     (3) clearly structured snippet        （description 内で作品名と劇場が近接）
//   曖昧 snippet からの推測はしない。listicle の combinedText から theaters[0] を
//   全作品に共有する旧挙動が「映画館が消える / 誤紐付け」の主因だった。
// ─────────────────────────────────────────────

/**
 * Phase 3B B'-1 (2026-04-26): listing page の sc.title「【XXX】上映作品...」形式から
 * theater 名を抽出する private helper。
 *
 * 対象: crank-in `/theater/search/all/{areaId}/{theaterId}/{movieId}` のような
 *       「1 page = 1 theater 確定」型の listing page。
 *
 * 4 重 guard:
 *   1. URL pattern が theaterId を含む（呼び出し側で確認済み前提）
 *   2. title 内に「【...】」存在
 *   3. 中身を空白除去（半角 + 全角）して `extractTheaters` の whitelist で照合
 *   4. 照合失敗 → null（誤紐付け回避、既存 fallback に委譲）
 *
 * 既存 `extractTheaters` の `THEATER_PATTERNS` regex は空白を含まないため、
 * 「TOHOシネマズ 池袋」のようなスペース挟み表記は事前に空白除去してから照合する。
 */
function resolveTheaterFromBracketTitle(title: string): string | null {
  if (!title) return null;
  const m = title.match(/【([^】]+)】/);
  if (!m) return null;
  const stripped = m[1].replace(/[\s　]+/g, "").trim();
  if (!stripped) return null;
  const candidates = extractTheaters(stripped);
  if (candidates.length === 0) return null;
  // 最長一致を返す（「グランドシネマサンシャイン」と「グランドシネマサンシャイン池袋」が
  // 両方 match した場合、より具体的な後者を採用する。THEATER_PATTERNS の `*` quantifier
  // で短い prefix が誤抽出されるケースに対応）。
  return candidates.reduce((longest, c) =>
    c.length > longest.length ? c : longest,
  );
}

/**
 * Phase 3B B'-1 (2026-04-26): listing page の sc.title 「{theater 名}（area）...」形式から
 * theater 名を抽出する private helper。
 *
 * 対象: eiga.com `/theater/{prefId}/{areaId}/{theaterId}/...` のような
 *       「1 page = 1 theater 確定」型の theater detail page。
 *
 * 4 重 guard:
 *   1. URL pattern が theaterId を含む（呼び出し側で確認済み前提）
 *   2. title 先頭の `（` または `(` の前部分を取得
 *   3. 空白除去 + `extractTheaters` whitelist 照合
 *   4. 照合失敗 → null
 */
function resolveTheaterFromTitlePrefix(title: string): string | null {
  if (!title) return null;
  const beforeParen = title.split(/[（(]/)[0] ?? "";
  const stripped = beforeParen.replace(/[\s　]+/g, "").trim();
  if (!stripped) return null;
  const candidates = extractTheaters(stripped);
  if (candidates.length === 0) return null;
  // 最長一致を返す（resolveTheaterFromBracketTitle と同じ理由）。
  return candidates.reduce((longest, c) =>
    c.length > longest.length ? c : longest,
  );
}

/** source URL / hostname から一意に劇場名を引けるケースのみ補完する（known pattern のみ） */
function theaterFromSource(sc: SearchCandidate): string | null {
  const url = (sc.url ?? "").toLowerCase();
  const source = (sc.source ?? "").toLowerCase();
  const combined = `${url} ${source}`;

  // TOHOシネマズ: hlo.tohotheater.jp/net/theater/{slug} etc.
  if (/tohotheater|tohocinemas/.test(combined)) {
    const SLUG_TO_THEATER: Record<string, string> = {
      shibuya: "TOHOシネマズ渋谷",
      shinjuku: "TOHOシネマズ新宿",
      roppongi: "TOHOシネマズ六本木ヒルズ",
      ikebukuro: "TOHOシネマズ池袋",
      hibiya: "TOHOシネマズ日比谷",
      ueno: "TOHOシネマズ上野",
      nihonbashi: "TOHOシネマズ日本橋",
      kinshicho: "TOHOシネマズ錦糸町",
      fuchu: "TOHOシネマズ府中",
      hachioji: "TOHOシネマズ八王子",
      umeda: "TOHOシネマズ梅田",
      namba: "TOHOシネマズなんば",
      nagoya: "TOHOシネマズ名古屋",
    };
    for (const [slug, name] of Object.entries(SLUG_TO_THEATER)) {
      if (combined.includes(slug)) return name;
    }
    // Phase A.7 D3 (2026-04-19): TOHO 系 URL なのに slug map に一致しなかった。
    //   実運用で EXA がどの URL を返しているか観測するため log 化。
    //   behavior 非変更、log-only。
    try {
      console.info(
        "[CoAlter] theaterFromSource.null",
        JSON.stringify({
          chain: "toho",
          url: sc.url ?? null,
          sourceHost: sc.source ?? null,
          titleHead: (sc.title ?? "").slice(0, 60),
        }),
      );
    } catch {
      /* noop */
    }
    return null;
  }

  // 109シネマズ: 109cinemas.net/{slug}
  if (/109cinemas/.test(combined)) {
    const slug = combined.match(/109cinemas[^\s/]*\/([a-z_]+)/);
    const map: Record<string, string> = {
      kiba: "109シネマズ木場",
      futakotamagawa: "109シネマズ二子玉川",
      premium_shinjuku: "109シネマズプレミアム新宿",
    };
    if (slug && map[slug[1]]) return map[slug[1]];
    // Phase A.7 D3: 109 系 URL なのに slug map に一致しなかった。
    try {
      console.info(
        "[CoAlter] theaterFromSource.null",
        JSON.stringify({
          chain: "109",
          url: sc.url ?? null,
          sourceHost: sc.source ?? null,
          titleHead: (sc.title ?? "").slice(0, 60),
          slugMatched: slug ? slug[1] : null,
        }),
      );
    } catch {
      /* noop */
    }
    return null;
  }

  // Phase 3B B'-1 (2026-04-26): crank-in theater 単体 page。
  //   URL `crank-in.net/theater/search/all/{areaId}/{theaterId}/{movieId}` は
  //   theater_id を含む = 1 page = 1 theater 確定。sc.title「【XXX】上映作品...」内の
  //   【】部分を空白除去 + whitelist 照合で安全抽出。
  //   照合失敗時は null → 既存 fallback に委譲（誤紐付け回避）。
  //
  //   regex test は `combined` ではなく `url` のみで行う（combined は url+source を
  //   space 結合するため `$` 終端 anchor が機能しない）。
  if (/crank-in\.net\/theater\//.test(url)) {
    return resolveTheaterFromBracketTitle(sc.title ?? "");
  }

  // Phase 3B B'-1 (2026-04-26): eiga.com theater 単体 detail page。
  //   URL `eiga.com/theater/{prefId}/{areaId}/{theaterId}/...` で theaterId 桁数を
  //   厳格 match。`/theater/{prefId}/{areaId}/$` (theaterId 無し = area listing) は
  //   除外（複数 theater 混在 page で誤紐付けを避ける）。
  //   sc.title「{theater 名}（area）上映スケジュール...」の `（` 前を抽出。
  if (/eiga\.com\/theater\/\d+\/\d+\/\d+\/?(\?|#|$)/.test(url)) {
    return resolveTheaterFromTitlePrefix(sc.title ?? "");
  }

  return null;
}

/**
 * title 候補と theater が description 内で「近接して」出るかを見る。
 *
 * 近接 = 対象 title の前後 NEAR_WINDOW 文字以内に theater 名が出現。
 * listicle 記事では 1 段落 = 1 作品解説のことが多く、その段落内に劇場が
 * 書かれていれば採用してよい。
 */
function theaterNearTitle(candidateTitle: string, text: string): string | null {
  if (!text) return null;
  const theaters = extractTheaters(text);
  if (theaters.length === 0) return null;
  // 候補タイトルの位置（見つからなければ近接 check できないので null）
  const idx = text.indexOf(candidateTitle);
  if (idx === -1) return null;
  const NEAR_WINDOW = 40;
  const lo = Math.max(0, idx - NEAR_WINDOW);
  const hi = Math.min(text.length, idx + candidateTitle.length + NEAR_WINDOW);
  const near = text.slice(lo, hi);
  for (const t of theaters) {
    if (near.includes(t)) return t;
  }
  return null;
}

/** title 候補に対して theater を決定する（許容された補完ソースのみ使う） */
function resolveTheaterForTitle(args: {
  candidateTitle: string;
  sc: SearchCandidate;
  titleCameFromScTitle: boolean;
}): string | null {
  const { candidateTitle, sc, titleCameFromScTitle } = args;

  // (0) Phase 3B B'-1 (2026-04-26): URL pattern が theater 単体 page を確定できる場合を最優先。
  //   crank-in / eiga.com / TOHO official / 109cinemas のような known URL pattern は
  //   theater_id を含むため「1 page = 1 theater 確定」。sc.title からの抽出より信頼できる。
  //   特に THEATER_PATTERNS の `*` quantifier (e.g. グランドシネマサンシャイン) で
  //   sc.title「【XXX 池袋】」のスペース挟みケースに対し suffix なし誤抽出が起きるため、
  //   listing page の URL signal を優先する。
  const fromSource = theaterFromSource(sc);
  if (fromSource) return fromSource;

  // (1) title 明示一致: title が sc.title から取れた場合、sc.title 内の劇場をそのまま使える
  if (titleCameFromScTitle) {
    const inTitle = extractTheaters(sc.title);
    if (inTitle.length > 0) return inTitle[0];
  }

  // (3a) title が sc.title から単独で取れた = 検索結果全体が「この 1 作品」の情報。
  //      その description / practicalInfo に劇場が書かれていれば紐付けて OK。
  //      (listicle でない single-movie page の標準ケース)
  if (titleCameFromScTitle) {
    const fromDesc = extractTheaters(sc.description);
    if (fromDesc.length > 0) return fromDesc[0];
    if (sc.practicalInfo) {
      const fromPractical = extractTheaters(sc.practicalInfo);
      if (fromPractical.length > 0) return fromPractical[0];
    }
  }

  // (3b) description 内の近接マッチ（listicle で 1 段落 = 1 作品の場合のみ theater を引く）
  //      title が description 展開 (extractBracketedTitles) で出てきた場合は
  //      近接する劇場だけを採用する（離れて並列列挙される listicle で全作品が
  //      同じ theater を共有する退化を避ける）。
  const nearDesc = theaterNearTitle(candidateTitle, sc.description);
  if (nearDesc) return nearDesc;
  const nearPractical = sc.practicalInfo
    ? theaterNearTitle(candidateTitle, sc.practicalInfo)
    : null;
  if (nearPractical) return nearPractical;

  return null;
}

// ─────────────────────────────────────────────
// メイン: SearchCandidate[] → MovieScreening[]
// ─────────────────────────────────────────────

/**
 * 検索結果を映画上映 catalog に変換する。
 *
 * 1 検索結果 = 多くの場合 1 作品情報。title / snippet から構造化。
 * Phase A.5: theater 紐付けは「明示一致 / source pattern / 近接 snippet」のみ。
 *   曖昧 snippet からの全作品共有は行わない（listicle 誤紐付け防止）。
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

    // title から抽出 → 失敗したら description から 『X』 を全部拾う（リスティクル救済）
    //   → それでも取れなければ description 本文から 1 個だけ拾う。
    const titleCandidates: string[] = [];
    let titleCameFromScTitle = false;
    const titleFromTitle = extractMovieTitle(sc.title);
    if (titleFromTitle) {
      titleCandidates.push(titleFromTitle);
      titleCameFromScTitle = true;
    } else {
      const bracketedFromDesc = extractBracketedTitles(sc.description);
      if (bracketedFromDesc.length > 0) {
        titleCandidates.push(...bracketedFromDesc);
      } else {
        // 2026-04-27 Bug 2: description に `『...』` がない listing page (crank-in 等) でも
        // markdown level-1 heading `# {作品名}` から候補を拾う。
        // acceptTitleCandidate + NON_TITLE_SEGMENT で meta / theater / source 名は reject。
        const headingFromDesc = extractMarkdownHeadingTitles(sc.description);
        if (headingFromDesc.length > 0) {
          titleCandidates.push(...headingFromDesc);
        } else {
          const titleFromDesc = extractMovieTitle(sc.description);
          if (titleFromDesc) titleCandidates.push(titleFromDesc);
        }
      }
    }

    if (titleCandidates.length === 0) continue;

    // showtime / runtime / status / rating は 1 検索結果の単位で拾う（従来どおり）。
    // theater だけは「title 単位」で再決定する（Phase A.5 の核）。
    const showtimes = extractShowtimes(combinedText);
    const runtimeMinutes = extractRuntimeMinutes(combinedText);
    const status = extractStatus(combinedText);
    const releaseYear = extractReleaseYear(combinedText);
    const rating = extractRating(combinedText) ?? sc.externalRating ?? null;

    for (const title of titleCandidates) {
      const normKey = title.replace(/\s+/g, "").toLowerCase();
      if (seenTitles.has(normKey)) continue;
      seenTitles.add(normKey);

      const theater = resolveTheaterForTitle({
        candidateTitle: title,
        sc,
        titleCameFromScTitle,
      });

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
        releaseYear,
      });
    }
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
          : s.status === "ended" ? "上映終了"
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
