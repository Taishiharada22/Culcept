/**
 * CoAlter movieCatalog — title 抽出ロバスト化 (Bug A 修正: 2026-04-18)
 *
 * 実環境の web 検索結果タイトルは装飾パターンが多様で、旧 extractMovieTitle は
 * 「パイプ区切り」「リスティクル」「スケジュールページ」を正しく扱えず title が
 * 抽出できずに candidate がゼロ件になる障害を起こしていた。
 *
 * このテストは現実のタイトル形を列挙して、
 *   - 具体作品タイトル → 正しく抽出
 *   - リスティクル / スケジュール / meta ページ → reject
 *   - description 内の複数 『X』 → 全部 screening に展開
 * を保証する。
 */

import { describe, it, expect } from "vitest";
import {
  extractMovieTitle,
  extractBracketedTitles,
  parseMovieScreenings,
} from "@/lib/coalter/movieCatalog";
import type { SearchCandidate } from "@/lib/coalter/types";

describe("extractMovieTitle", () => {
  it("bare title を通す", () => {
    expect(extractMovieTitle("ラストマイル")).toBe("ラストマイル");
    expect(extractMovieTitle("PERFECT DAYS")).toBe("PERFECT DAYS");
  });

  it("『』 括弧付きタイトルから中身を取り出す", () => {
    expect(extractMovieTitle("映画『ラストマイル』 | 映画.com")).toBe(
      "ラストマイル",
    );
    expect(extractMovieTitle("『PERFECT DAYS』公式サイト")).toBe(
      "PERFECT DAYS",
    );
    expect(extractMovieTitle("「ゴジラ-1.0」レビュー")).toBe("ゴジラ-1.0");
  });

  it("全角パイプ区切りの先頭セグメントを採用する（劇場・meta セグメント除外）", () => {
    expect(extractMovieTitle("ラストマイル｜TOHOシネマズ渋谷｜上映時間")).toBe(
      "ラストマイル",
    );
    expect(
      extractMovieTitle("アナログ｜映画情報・レビュー・あらすじ｜映画.com"),
    ).toBe("アナログ");
  });

  it("半角パイプ区切りも扱う", () => {
    expect(extractMovieTitle("ラストマイル | Filmarks")).toBe("ラストマイル");
  });

  it("ハイフンは分割しない（作品名内に混入しうる）", () => {
    expect(extractMovieTitle("ゴジラ-1.0")).toBe("ゴジラ-1.0");
    expect(extractMovieTitle("007 - No Time to Die")).toBe(
      "007 - No Time to Die",
    );
  });

  it("リスティクル系は reject する", () => {
    expect(
      extractMovieTitle("【2026年4月】渋谷のおすすめ映画10選 | 映画.com"),
    ).toBeNull();
    expect(extractMovieTitle("2026 春の映画ランキング")).toBeNull();
    expect(
      extractMovieTitle("今週の映画おすすめ特集 | Filmarks"),
    ).toBeNull();
  });

  it("スケジュール / 上映情報ページは reject する", () => {
    expect(
      extractMovieTitle("上映スケジュール | TOHOシネマズ渋谷"),
    ).toBeNull();
    expect(extractMovieTitle("上映中の映画一覧 | 映画.com")).toBeNull();
    expect(extractMovieTitle("劇場ラインナップ｜MOVIX")).toBeNull();
  });

  it("劇場名のみは reject する", () => {
    expect(extractMovieTitle("TOHOシネマズ渋谷")).toBeNull();
    expect(extractMovieTitle("109シネマズ二子玉川")).toBeNull();
  });

  it("ジャンル名のみは reject する", () => {
    expect(extractMovieTitle("恋愛映画")).toBeNull();
    expect(extractMovieTitle("サスペンス")).toBeNull();
    expect(extractMovieTitle("映画")).toBeNull();
  });

  it("末尾の装飾（(2024) / 【公式】 / | 2026）を削る", () => {
    expect(extractMovieTitle("ラストマイル (2024)")).toBe("ラストマイル");
    expect(extractMovieTitle("ラストマイル【公式】")).toBe("ラストマイル");
    expect(extractMovieTitle("ラストマイル | 2026年公開")).toBe(
      "ラストマイル",
    );
  });

  it("長すぎる文字列 / 空文字 / null-ish は reject する", () => {
    expect(extractMovieTitle("")).toBeNull();
    expect(
      extractMovieTitle(
        "非常に長い非タイトル的文字列がどこまでもどこまでも続いてタイトルの体を成さないパターン",
      ),
    ).toBeNull();
  });
});

describe("extractBracketedTitles", () => {
  it("description に複数 『X』 があれば全部拾う", () => {
    const got = extractBracketedTitles(
      "渋谷の映画館で上映中の作品。『ラストマイル』や『PERFECT DAYS』、それに『アナログ』が人気。",
    );
    expect(got).toEqual(["ラストマイル", "PERFECT DAYS", "アナログ"]);
  });

  it("リスティクル語は除外する", () => {
    const got = extractBracketedTitles(
      "『2026年おすすめ映画10選』と『ラストマイル』を紹介。",
    );
    expect(got).toEqual(["ラストマイル"]);
  });

  it("最大 6 件まで", () => {
    const txt = Array.from({ length: 10 }, (_, i) => `『movie${i}』`).join(
      " ",
    );
    const got = extractBracketedTitles(txt);
    expect(got.length).toBe(6);
  });

  it("重複は除外する", () => {
    const got = extractBracketedTitles(
      "『ラストマイル』と『ラストマイル』は同じ作品。",
    );
    expect(got).toEqual(["ラストマイル"]);
  });
});

describe("parseMovieScreenings — Bug A 回帰防止", () => {
  it("パイプ区切り title からも作品名を拾える", () => {
    const sc: SearchCandidate = {
      title: "ラストマイル｜TOHOシネマズ渋谷｜上映時間",
      description: "TOHOシネマズ渋谷で19:00〜。118分。★4.2",
      externalRating: "4.2",
      practicalInfo: null,
      source: "eiga.com",
      url: "https://eiga.com/movie/last-mile",
    };
    const out = parseMovieScreenings([sc]);
    expect(out.length).toBe(1);
    expect(out[0].title).toBe("ラストマイル");
    expect(out[0].theater).toBe("TOHOシネマズ渋谷");
  });

  it("リスティクル title はスキップされるが description 内の 『X』 は救済される", () => {
    const sc: SearchCandidate = {
      title: "【2026年4月】渋谷のおすすめ映画10選 | 映画.com",
      description:
        "TOHOシネマズ渋谷で上映中の作品から厳選。『ラストマイル』『PERFECT DAYS』『アナログ』が今週のイチ押し。",
      externalRating: null,
      practicalInfo: null,
      source: "eiga.com",
      url: "https://eiga.com/feature/shibuya-april-2026",
    };
    const out = parseMovieScreenings([sc]);
    const titles = out.map((s) => s.title);
    expect(titles).toContain("ラストマイル");
    expect(titles).toContain("PERFECT DAYS");
    expect(titles).toContain("アナログ");
  });

  it("スケジュールページ only の結果は screening を生まない", () => {
    const sc: SearchCandidate = {
      title: "上映スケジュール | TOHOシネマズ渋谷",
      description:
        "TOHOシネマズ渋谷の本日の上映スケジュール一覧。各回の時間と空席状況をご確認ください。",
      externalRating: null,
      practicalInfo: null,
      source: "hlo.tohotheater.jp",
      url: "https://hlo.tohotheater.jp/net/schedule",
    };
    const out = parseMovieScreenings([sc]);
    expect(out.length).toBe(0);
  });

  it("同一作品は複数 SearchCandidate でも 1 screening に統合される", () => {
    const candidates: SearchCandidate[] = [
      {
        title: "映画『ラストマイル』 | 映画.com",
        description: "118分。Filmarks 4.2",
        externalRating: "4.2",
        practicalInfo: null,
        source: "eiga.com",
        url: "https://eiga.com/movie/last-mile",
      },
      {
        title: "ラストマイル｜TOHOシネマズ渋谷",
        description: "19:00 / 21:30",
        externalRating: null,
        practicalInfo: null,
        source: "tohotheater.jp",
        url: "https://hlo.tohotheater.jp/net/movie/last-mile",
      },
    ];
    const out = parseMovieScreenings(candidates);
    expect(out.length).toBe(1);
    expect(out[0].title).toBe("ラストマイル");
  });
});
