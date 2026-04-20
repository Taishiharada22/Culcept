/**
 * Person Alias Layer — CEO方針 2026-04-18 Bug B Phase 1
 *
 * 背景: 日本語の人名表記は 1 人につき多様なゆれを持つ。
 *   例: 仙洞田 / 仙洞田さん / せんどうだ / せんちゃん / 田中くん / タナ / 先輩 / 部長
 *   実機ログでも、同じセグメント内で「仙洞田」「仙洞田さん」が重複して companions に
 *   入るケースが観測される。表示上も「仙洞田さんと仙洞田」のような冗長な列挙が出る。
 *
 * Phase 1（本コミット）の最小実装:
 *   - 敬称の末尾剥離のみで canonical key を作る（さん/様/ちゃん/くん/君/殿/氏）
 *   - 完全一致/canonical 一致で同一人物判定
 *   - 敬称つき表記を displayName に格上げ（「仙洞田さん」を優先して表示）
 *
 * Phase 2（将来）で追加:
 *   - ひらがな/カタカナ/漢字のゆれ吸収
 *   - 愛称（せんちゃん、タナ）
 *   - 関係ラベル（先輩・母・彼女）
 *
 * Phase 3（将来）で追加:
 *   - 曖昧時の確認 UI
 */

// 末尾に付く敬称のみ剥離（「田中さんの店」のような所有助詞を含むケースは上流で処理済み）
const TRAILING_HONORIFIC_RE = /(さん|様|ちゃん|くん|君|殿|氏)$/;

/**
 * 照合キー: 敬称を剥離し、前後空白を落とした文字列。
 *
 * 例:
 *   "仙洞田"     → "仙洞田"
 *   "仙洞田さん" → "仙洞田"
 *   "田中くん"   → "田中"
 *   "  佐藤様 " → "佐藤"
 *   "先輩"       → "先輩"（敬称ではない一般語彙）
 *   ""           → ""（空）
 */
export function canonicalPersonKey(raw: string): string {
  return raw.trim().replace(TRAILING_HONORIFIC_RE, "");
}

/** 2 つの人名表記が同一人物を指すかの判定（Phase 1: 敬称剥離のみ） */
export function arePersonsSame(a: string, b: string): boolean {
  const keyA = canonicalPersonKey(a);
  const keyB = canonicalPersonKey(b);
  if (!keyA || !keyB) return false;
  return keyA === keyB;
}

export interface PersonEntry {
  /** セッション内で一意の ID */
  canonicalId: string;
  /** 表示用の名前（敬称つきを優先、最初に見つかった形を fallback） */
  displayName: string;
  /** これまでに観測した表記ゆれ */
  aliases: string[];
}

/**
 * セッション内の人物レジストリ。
 *
 * 呼び出し側の責務:
 *   - 同じ plan turn 内で 1 つのインスタンスを共有する
 *   - plan 全体で名前の一貫性を保ちたい場合、normalizeLLMOutput の先頭で
 *     生成し、全 segment の companions を rewriteWithRegistry で書き換える
 */
export class PersonRegistry {
  private entriesByKey: Map<string, PersonEntry> = new Map();
  private counter = 0;

  /**
   * 新しい表記を登録 or 既存エントリに統合。
   *
   * - 既存 canonical key があれば aliases に追加し、敬称つきなら displayName を昇格
   * - 新規なら新しい canonical ID で登録
   * - 空文字 / 空白のみは null を返し、呼び出し側でスキップさせる
   */
  register(raw: string): PersonEntry | null {
    const trimmed = raw?.trim() ?? "";
    if (!trimmed) return null;
    const key = canonicalPersonKey(trimmed);
    if (!key) return null;

    const existing = this.entriesByKey.get(key);
    if (existing) {
      if (!existing.aliases.includes(trimmed)) {
        existing.aliases.push(trimmed);
      }
      // 敬称つき形式を displayName に格上げ
      if (
        TRAILING_HONORIFIC_RE.test(trimmed) &&
        !TRAILING_HONORIFIC_RE.test(existing.displayName)
      ) {
        existing.displayName = trimmed;
      }
      return existing;
    }

    this.counter += 1;
    const entry: PersonEntry = {
      canonicalId: `p${this.counter}`,
      displayName: trimmed,
      aliases: [trimmed],
    };
    this.entriesByKey.set(key, entry);
    return entry;
  }

  /** canonical key から既存エントリを参照（なければ null） */
  lookup(raw: string): PersonEntry | null {
    const key = canonicalPersonKey(raw?.trim() ?? "");
    if (!key) return null;
    return this.entriesByKey.get(key) ?? null;
  }

  /** 全エントリを表示 — デバッグ/テスト用 */
  getAll(): PersonEntry[] {
    return Array.from(this.entriesByKey.values());
  }

  /**
   * 配列を受け取り、重複除去した displayName 配列を返す。
   *
   * - 同じ canonical key のものは 1 つにまとめる
   * - 敬称つきの表記が出現していれば displayName はそちらに更新されている
   * - 順序は最初に出現した順
   */
  dedupeDisplay(names: readonly string[]): string[] {
    const seenIds = new Set<string>();
    const out: string[] = [];
    for (const name of names) {
      const entry = this.register(name);
      if (!entry) continue;
      if (seenIds.has(entry.canonicalId)) continue;
      seenIds.add(entry.canonicalId);
      out.push(entry.displayName);
    }
    // 既に out に入った名前も、後から敬称つきが登録されていたら更新する
    return out.map((n) => this.lookup(n)?.displayName ?? n);
  }
}

/**
 * 一時的レジストリで配列を一発 dedupe する便利関数。
 * （セッション共有が不要な局所的重複除去用）
 */
export function dedupePersonList(names: readonly string[]): string[] {
  const registry = new PersonRegistry();
  return registry.dedupeDisplay(names);
}
