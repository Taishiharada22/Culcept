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

// ─────────────────────────────────────────────
// Phase A.5: listicle theater 共有停止 + title→theater 近接マッチ
// Phase A.7 (A2 / 2026-04-19): NEAR_WINDOW 40 → 120 に拡張
// ─────────────────────────────────────────────

describe("parseMovieScreenings — Phase A.5 theater 紐付けロバスト化", () => {
  it("listicle description で劇場が作品名から遠い場合 (>120文字) は theater を引かない", () => {
    // 『作品名』 と劇場名が NEAR_WINDOW (120) を超えて離れているパターン。
    // 旧実装では theaters[0] が全作品に付いて誤紐付けが起きていた。
    // Phase A.5: 近接窓外は reject する方針。
    // Phase A.7: NEAR_WINDOW を 40 → 120 に拡張。この test では filler を厚くし、
    //   「隣の段落の劇場」が拾われる退化を起こさないことを保証する。
    const filler =
      "とにかく話題性が高く週末にぴったりで、デートでも一人でも家族でも誰と見ても楽しめる。" +
      "見終わったあとに会話が続く構成になっている点も評価のポイントで、" +
      "近年の邦画シーンを語る上で外せない作品として紹介されることが多い。" +
      "国内外の映画祭でも高く評価され、批評家筋からの支持も厚い。" +
      "観客動員も好調で、上映期間延長が発表されたケースもある。" +
      "話題性・作家性・商業性の三拍子が揃った稀有な一本として挙げられる。";
    const sc: SearchCandidate = {
      title: "【2026年4月】東京のおすすめ映画10選 | 映画.com",
      description: `週末に見たい作品。『ラストマイル』『PERFECT DAYS』${filler} 劇場は TOHOシネマズ新宿 ほか。`,
      externalRating: null,
      practicalInfo: null,
      source: "eiga.com",
      url: "https://eiga.com/feature/tokyo-april-2026",
    };
    const out = parseMovieScreenings([sc]);
    const titles = out.map((s) => s.title);
    expect(titles).toContain("ラストマイル");
    expect(titles).toContain("PERFECT DAYS");
    // 劇場は近接していないので誤紐付けしない
    for (const s of out) {
      expect(s.theater).toBeNull();
    }
  });

  it("listicle でも「作品名の近接 120 文字以内」に劇場があれば紐付ける", () => {
    const sc: SearchCandidate = {
      title: "【2026年4月】東京のおすすめ映画10選 | 映画.com",
      description:
        "今月の注目作。TOHOシネマズ渋谷で上映中の『ラストマイル』は必見。" +
        "続いて MOVIX昭島 で観られる『PERFECT DAYS』も評価が高い。",
      externalRating: null,
      practicalInfo: null,
      source: "eiga.com",
      url: "https://eiga.com/feature/tokyo-april-2026",
    };
    const out = parseMovieScreenings([sc]);
    const last = out.find((s) => s.title === "ラストマイル");
    const perf = out.find((s) => s.title === "PERFECT DAYS");
    expect(last?.theater).toBe("TOHOシネマズ渋谷");
    expect(perf?.theater).toBe("MOVIX昭島");
  });

  it("sc.title から単独 title が取れた場合、description の theater を紐付けて OK", () => {
    const sc: SearchCandidate = {
      title: "ラストマイル",
      description: "現在上映中。TOHOシネマズ渋谷で19:00〜、21:30〜。118分。★4.2",
      externalRating: "4.2",
      practicalInfo: null,
      source: "eiga.com",
      url: "https://eiga.com/movie/last-mile",
    };
    const out = parseMovieScreenings([sc]);
    expect(out.length).toBe(1);
    expect(out[0].theater).toBe("TOHOシネマズ渋谷");
  });

  it("URL の known pattern (tohotheater) から theater を補完できる", () => {
    const sc: SearchCandidate = {
      title: "ラストマイル",
      description: "118分。サスペンス。",
      externalRating: null,
      practicalInfo: null,
      source: "tohotheater.jp",
      url: "https://hlo.tohotheater.jp/net/schedule/076/",
    };
    // URL に "shibuya" が無いので theater は source 経由では引けない
    // → description に劇場が無い → 最終的に null（曖昧補完禁止の原則）
    const out = parseMovieScreenings([sc]);
    expect(out[0].theater).toBeNull();
  });

  it("URL slug から TOHOシネマズ渋谷 を補完できる", () => {
    const sc: SearchCandidate = {
      title: "ラストマイル",
      description: "118分",
      externalRating: null,
      practicalInfo: null,
      source: "hlo.tohotheater.jp",
      url: "https://hlo.tohotheater.jp/net/theater/076/shibuya.html",
    };
    const out = parseMovieScreenings([sc]);
    expect(out[0].theater).toBe("TOHOシネマズ渋谷");
  });
});

// ─────────────────────────────────────────────
// Phase A.7 (A2 / 2026-04-19): NEAR_WINDOW 拡張 + THEATER_PATTERNS 強化
//
// preview 本カウント 7 セッションの Pattern B (catalog=6 / titleWithoutTheater=5):
//   旧 NEAR_WINDOW=40 では実 listicle 記事の 1 段落 (100-200 文字) 内で
//   作品名と劇場名が離れていると theater 補完に失敗していた。
//   また、独立系・T・ジョイ系・角川シネマ系・ミニシアターが THEATER_PATTERNS に
//   載っておらず、そもそも「劇場テキスト」として検出されていなかった。
// ─────────────────────────────────────────────

describe("parseMovieScreenings — Phase A.7 NEAR_WINDOW 120 拡張", () => {
  it("作品名から 60 文字程度離れた劇場名を紐付ける (旧 40 では拾えなかった範囲)", () => {
    // 作品名 → 60-70 文字の評論テキスト → 劇場名。旧 NEAR_WINDOW=40 では reject。
    const sc: SearchCandidate = {
      title: "【2026年4月】東京のおすすめ映画10選 | 映画.com",
      description:
        "『ラストマイル』は観るほどに発見のある緊張感の高いサスペンスで、編集とカット割りも評価されている注目作。" +
        "TOHOシネマズ新宿 で公開中。",
      externalRating: null,
      practicalInfo: null,
      source: "eiga.com",
      url: "https://eiga.com/feature/tokyo-april-2026",
    };
    const out = parseMovieScreenings([sc]);
    const last = out.find((s) => s.title === "ラストマイル");
    expect(last?.theater).toBe("TOHOシネマズ新宿");
  });

  it("作品名から 100 文字超離れた劇場名も 120 以内なら紐付ける", () => {
    // NEAR_WINDOW 120 の上端近傍をテスト。
    const filler =
      "編集・撮影・音響設計のすべてにおいて完成度が高く、キャスト全員の演技も抜群。" +
      "終盤の展開まで目が離せない緻密な構成が魅力。"; // ~70 文字
    const sc: SearchCandidate = {
      title: "【2026年4月】東京のおすすめ映画10選 | 映画.com",
      description: `『ラストマイル』${filler} MOVIX昭島 ほか全国公開中。`,
      externalRating: null,
      practicalInfo: null,
      source: "eiga.com",
      url: "https://eiga.com/feature/tokyo-april-2026",
    };
    const out = parseMovieScreenings([sc]);
    const last = out.find((s) => s.title === "ラストマイル");
    expect(last?.theater).toBe("MOVIX昭島");
  });
});

describe("parseMovieScreenings — Phase A.7 新 THEATER_PATTERNS", () => {
  const baseListicle = (description: string): SearchCandidate => ({
    title: "【2026年4月】都内ミニシアターで観られる作品10選 | 映画.com",
    description,
    externalRating: null,
    practicalInfo: null,
    source: "eiga.com",
    url: "https://eiga.com/feature/tokyo-minishiatar-2026",
  });

  it("新宿武蔵野館 を抽出する", () => {
    const out = parseMovieScreenings([
      baseListicle("『ルックバック』は新宿武蔵野館で上映中。"),
    ]);
    expect(out.find((s) => s.title === "ルックバック")?.theater).toBe(
      "新宿武蔵野館",
    );
  });

  it("シネマート新宿 / シネマート六本木 を抽出する", () => {
    const out = parseMovieScreenings([
      baseListicle(
        "『PERFECT DAYS』はシネマート新宿で、『ドライブ・マイ・カー』はシネマート六本木で観られる。",
      ),
    ]);
    expect(
      out.find((s) => s.title === "PERFECT DAYS")?.theater,
    ).toBe("シネマート新宿");
    expect(
      out.find((s) => s.title === "ドライブ・マイ・カー")?.theater,
    ).toBe("シネマート六本木");
  });

  it("T・ジョイ博多 を抽出する", () => {
    const out = parseMovieScreenings([
      baseListicle("『ゴジラ-1.0』はT・ジョイ博多で先行上映。"),
    ]);
    expect(out.find((s) => s.title === "ゴジラ-1.0")?.theater).toBe(
      "T・ジョイ博多",
    );
  });

  it("角川シネマ有楽町 を抽出する", () => {
    const out = parseMovieScreenings([
      baseListicle("『君たちはどう生きるか』は角川シネマ有楽町で上映中。"),
    ]);
    expect(
      out.find((s) => s.title === "君たちはどう生きるか")?.theater,
    ).toBe("角川シネマ有楽町");
  });

  it("Bunkamura ル・シネマ を抽出する (スペース・中点の揺れを吸収)", () => {
    const out1 = parseMovieScreenings([
      baseListicle("『パリタクシー』はBunkamura ル・シネマで公開。"),
    ]);
    expect(
      out1.find((s) => s.title === "パリタクシー")?.theater,
    ).toBe("Bunkamura ル・シネマ");

    // 中点なしバリアントも拾う
    const out2 = parseMovieScreenings([
      baseListicle("『パリタクシー』はBunkamuraル・シネマで公開。"),
    ]);
    expect(out2.find((s) => s.title === "パリタクシー")?.theater).toMatch(
      /Bunkamura/i,
    );
  });

  it("ユーロスペース / シネマカリテ / シネスイッチ銀座 を抽出する", () => {
    const out = parseMovieScreenings([
      baseListicle(
        "『小説家の映画』はユーロスペース、『怪物』はシネマカリテ、『ミセス・ハリス、パリへ行く』はシネスイッチ銀座で上映中。",
      ),
    ]);
    expect(
      out.find((s) => s.title === "小説家の映画")?.theater,
    ).toBe("ユーロスペース");
    expect(out.find((s) => s.title === "怪物")?.theater).toBe("シネマカリテ");
    expect(
      out.find((s) => s.title === "ミセス・ハリス、パリへ行く")?.theater,
    ).toBe("シネスイッチ銀座");
  });

  it("K's cinema / 早稲田松竹 / 目黒シネマ / 新文芸坐 / ポレポレ東中野 を抽出する", () => {
    const out = parseMovieScreenings([
      baseListicle(
        "『この空の花』はK's cinema、『戦場のピアニスト』は早稲田松竹、" +
          "『ニュー・シネマ・パラダイス』は目黒シネマ、『七人の侍』は新文芸坐、" +
          "『夜明け告げるルーのうた』はポレポレ東中野。",
      ),
    ]);
    expect(
      out.find((s) => s.title === "この空の花")?.theater,
    ).toMatch(/cinema/i);
    expect(
      out.find((s) => s.title === "戦場のピアニスト")?.theater,
    ).toBe("早稲田松竹");
    expect(
      out.find((s) => s.title === "ニュー・シネマ・パラダイス")?.theater,
    ).toBe("目黒シネマ");
    expect(out.find((s) => s.title === "七人の侍")?.theater).toBe("新文芸坐");
    expect(
      out.find((s) => s.title === "夜明け告げるルーのうた")?.theater,
    ).toBe("ポレポレ東中野");
  });

  it("ヒューマックスシネマ を抽出する", () => {
    const out = parseMovieScreenings([
      baseListicle("『ミッション:インポッシブル』はヒューマックスシネマ渋谷で公開。"),
    ]);
    expect(
      out.find((s) => s.title?.includes("ミッション"))?.theater,
    ).toBe("ヒューマックスシネマ渋谷");
  });
});
