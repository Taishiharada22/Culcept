/**
 * Utterance Decomposer — W2-CEO-Emergency (2026-04-19)
 *
 * CEO 指示（2026-04-19 実機 0 点フィードバック）:
 *   「LLM がユーザーからの言語をすべて受け取る形にして、それをロジックに流して、
 *    LLM が整理して適切な形にして流すフロー」
 *
 * Work Stream A-1: 複合発話の決定論的分解。
 *
 * 背景:
 *   ユーザー発話「カフェはマックにする予定。ランチはサドヤだから、会食もその近くにしてください。」
 *   のような複合発話を LLM に丸投げすると、
 *     - 3 件の独立変更に分解されず 1 件に畳まれる
 *     - `newValue` に生の文章がそのまま入る
 *     - 相対アンカー「その近く」が解けない
 *   ため、ロジックが組み立て直せなくなる。
 *
 * 原則:
 *   - 決定論で分割できる境界（句点・改行・並列接続詞）のみ分ける
 *   - 1 clause 内の自然言語理解は LLM に任せる（分解はしない）
 *   - 分割できない形（単一文で文中に複数意図）は LLM にそのまま渡す
 *
 * 使い方:
 *   decomposeUtterance("a。b。c") → ["a", "b", "c"]
 *   detectDelta は各 clause に対して個別に呼び出し、changes を merge する
 */

/**
 * 句点・改行・「、」＋接続前置き で分割する。
 *
 * 分割境界:
 *   1. 句点: 「。」「．」「！」「？」（疑問・感嘆含む。ただし疑問形自体は 1 clause として保持）
 *   2. 改行: `\n`
 *   3. 接続前置き: 「それから」「あと」「また」「で、」で始まる節（「、」含む前置き）
 *
 * 非分割境界（まとめたままにする）:
 *   - 「XはYだから、Z」の「、」— 因果/理由の接続助詞は 1 clause。因果内の place は
 *      LLM に渡して解釈させる（ロジックで切ると意味が崩れる）。
 *   - 「XかY」「X/Y」「XとY」等の並列列挙 — 候補列挙は 1 clause として扱う。
 *
 * 境界検出は保守的に: 迷ったら分割せず 1 clause として LLM に渡す。
 */
export function decomposeUtterance(utterance: string): string[] {
  if (!utterance) return [];
  const trimmed = utterance.trim();
  if (!trimmed) return [];

  // Step 1: 句点・改行で粗く分割
  //   「。」「．」「\n」で split、末尾の空文字を落とす
  //   「！」「？」は文末記号だが、1 clause 内の emotion として保持したいので分割しない
  const coarseParts = trimmed
    .split(/(?:[。．]|\n)+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Step 2: 各 part について、接続前置きでさらに分割
  //   「それから」「あと」「また」「で、」「そのあと」「続いて」を先頭に持つ節が
  //   「、」区切りで並んでいる場合のみ分ける
  //   例: 「朝はマック、それからサドヤでランチ」→ ["朝はマック", "それからサドヤでランチ"]
  const result: string[] = [];
  for (const part of coarseParts) {
    const subParts = splitOnLeadingConnector(part);
    for (const sp of subParts) {
      const clean = sp.trim();
      if (clean.length > 0) result.push(clean);
    }
  }

  // Step 3: 1 clause しかなかった場合は元文を返す（分割による情報劣化を避ける）
  if (result.length === 0) return [trimmed];
  return result;
}

/**
 * 「、」または空白の後に接続前置きが続くパターンを分割する。
 *
 * 接続前置き:
 *   - 「それから」「その後」「そのあと」「続いて」「で、」
 *   - 「あと」「また」（文頭限定、単語「あと(で)」の誤爆防止のため直後が名詞/副詞のみ許容）
 *
 * 分割前: 「朝はマック、それからサドヤでランチ、あとカフェ」
 * 分割後: ["朝はマック", "それからサドヤでランチ", "あとカフェ"]
 *
 * 注: 「、」単独では分割しない（因果・並列を壊さない）。必ず接続前置きとセットで初めて分ける。
 */
function splitOnLeadingConnector(clause: string): string[] {
  const CONNECTOR_RE = /(、|\s)+(それから|その後|そのあと|続いて|で、|あとは|また、)/g;
  const boundaries: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = CONNECTOR_RE.exec(clause)) !== null) {
    // 境界位置 = 「、」直後（接続前置きの頭から新 clause 開始）
    boundaries.push(m.index + m[1].length);
  }
  if (boundaries.length === 0) return [clause];

  const parts: string[] = [];
  let prev = 0;
  for (const b of boundaries) {
    parts.push(clause.slice(prev, b).replace(/[、\s]+$/, ""));
    prev = b;
  }
  parts.push(clause.slice(prev));
  return parts;
}

/**
 * 相対アンカー検出 — 「その近く」「そこから」「さっきの」等。
 *
 * 返り値: 検出した相対語（見つからなければ null）。
 * 呼び出し側は直前 clause で解決された place を nearAnchorLabel に流し込む。
 */
const RELATIVE_ANCHOR_RE =
  /(その|そこ|さっき)(近く|付近|周辺|周り|近辺|の(?:辺|周辺|近く|付近)?|のとこ(?:ろ)?|から)/;

export function detectRelativeAnchor(clause: string): string | null {
  const m = clause.match(RELATIVE_ANCHOR_RE);
  return m ? m[0] : null;
}

/**
 * clause が place として妥当な newValue かを検証する。
 *
 * 拒否条件（いずれか該当で無効）:
 *   - 句読点（「、」「。」）を含む
 *   - 助詞連続（「だから」「ので」「けど」「から、」）を含む — 節境界が残っている
 *   - 15 文字超
 *   - 動詞語尾（「する」「して」「する予定」「にする」等の文末）を含む
 *
 * 店名・地名は通常 2〜12 文字の体言止め。
 */
const SENTENCE_FRAGMENT_RE =
  /[、。]|だから|なので|けれど|けど|から[、。\s]|ので[、。\s]|ですが|である|にする|にして|して(?:ください|欲しい)|しよう|予定$/;

export function isPlaceNewValueAcceptable(value: unknown): boolean {
  if (typeof value !== "string") {
    // 非文字列（object=placeSearchHint 型等）は別経路。本 validator はここで判定しない。
    return true;
  }
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 15) return false;
  if (SENTENCE_FRAGMENT_RE.test(trimmed)) return false;
  return true;
}
