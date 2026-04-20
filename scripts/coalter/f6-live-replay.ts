/**
 * F-6 venue quality gate — deterministic replay (2026-04-20)
 *
 * /tmp/f6-live.log で確認された live 残差（S1/S2/S3 で candidate または proposalCard に
 * 昇格していた municipal / directory / news URL）を classifyPageType に通し、新しい
 * venue quality gate で全件 block されることを確認する。
 *
 * live smoke は web 検索の non-determinism によって同一結果が得られないため、
 * baseline log で実際に leak していた URL を直接 replay することで deterministic
 * な before/after 比較を行う。
 *
 * 実行:
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/coalter/f6-live-replay.ts
 */

import {
  classifyPageType,
  isDirectCandidateBlocked,
} from "@/lib/coalter/pageTypeClassifier";

// ─────────────────────────────────────────────
// /tmp/f6-live.log の 3 scenario に実際に現れた URL
// ─────────────────────────────────────────────

interface LoggedCandidate {
  title: string;
  url: string;
  baselineRole: "proposalCard" | "rawCandidate";
  note: string;
}

const S1: LoggedCandidate[] = [
  {
    title: "東京都新宿区役所",
    url: "https://city.shinjuku.lg.jp/",
    baselineRole: "proposalCard",
    note: "proposalCard candidate[1] に昇格（leak）",
  },
  {
    title: "新宿区",
    url: "https://www.city.shinjuku.lg.jp/reserve_facilities.html",
    baselineRole: "proposalCard",
    note: "proposalCard candidate[2] に昇格（leak）",
  },
  {
    title: "【定番＋穴場】新宿東口・歌舞伎町で人気のおしゃれなランチ20選",
    url: "https://retty.me/area/PRE13/ARE1/SUB101/PUR57/",
    baselineRole: "rawCandidate",
    note: "raw candidate — listicle として既に block 済（baseline）",
  },
];

const S2: LoggedCandidate[] = [
  {
    title: "渋谷区ポ",
    url: "http://www.city.shibuya.tokyo.jp/",
    baselineRole: "proposalCard",
    note: "proposalCard candidate[1] に昇格（leak）",
  },
  {
    title: "【2026年最新！】渋谷の美味しい店で今年人気のおすすめ21店 - Rettyまとめ",
    url: "https://retty.me/theme/200250483/",
    baselineRole: "rawCandidate",
    note: "raw candidate — listicle として既に block 済（baseline）",
  },
];

const S3: LoggedCandidate[] = [
  {
    title: "料理ジャンル一覧 - Retty（レッティ） 日本最大級の実名型グルメサービス",
    url: "https://retty.me/category/",
    baselineRole: "rawCandidate",
    note: "pre-gate: listicle として block されていた可能性 / 新 gate: non-venue-title + directory-path の両方に hit",
  },
  {
    title: "全国約7万店から選ばれたRettyの人気店最新情報 - Ladytopi ニュース",
    url: "https://news.ladytopi.jp/article/1298ee6c-d983-11f0-8458-9ca3ba08d54b",
    baselineRole: "rawCandidate",
    note: "news 系（baseline block 済）",
  },
];

// ─────────────────────────────────────────────
// Control: 正規 venue_detail / third_party_listing は誤爆しない
// ─────────────────────────────────────────────

const CONTROL: LoggedCandidate[] = [
  {
    title: "『焼肉ABC』渋谷店",
    url: "https://tabelog.com/tokyo/A1303/A130301/13012345/",
    baselineRole: "rawCandidate",
    note: "control: 正規 venue detail URL は third_party_listing を維持",
  },
  {
    title: "『寿司DEF』銀座店",
    url: "https://retty.me/restaurants/RTN100200/",
    baselineRole: "rawCandidate",
    note: "control: retty restaurants/* は third_party_listing を維持",
  },
];

// ─────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────

function banner(text: string): void {
  console.log(`\n┌─── ${text}`);
}

function runScenario(label: string, cases: LoggedCandidate[]): {
  blocked: number;
  promoted: number;
} {
  banner(label);
  let blocked = 0;
  let promoted = 0;
  for (const c of cases) {
    const r = classifyPageType({
      url: c.url,
      title: c.title,
    });
    const isBlocked = isDirectCandidateBlocked(r.pageType);
    const marker = isBlocked ? "[BLOCKED]" : "[PROMOTED]";
    console.log(`│ ${marker} pageType=${r.pageType} conf=${r.confidence}`);
    console.log(`│   title: ${c.title}`);
    console.log(`│   url:   ${c.url}`);
    console.log(`│   reason:${r.signals.reason}`);
    console.log(`│   note:  ${c.note}`);
    if (isBlocked) blocked += 1;
    else promoted += 1;
  }
  console.log(`└─ ${label}: blocked=${blocked} / promoted=${promoted}`);
  return { blocked, promoted };
}

function main(): void {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║ F-6 venue quality gate — deterministic replay             ║");
  console.log("║   source: /tmp/f6-live.log (2026-04-20 pre-gate baseline) ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const s1 = runScenario("S1 新宿 / 11時 / ラーメン / 醤油", S1);
  const s2 = runScenario("S2 気分語あり (落ち着いた / 会話できる)", S2);
  const s3 = runScenario("S3 早朝時間帯で T0 が薄いケース", S3);
  const ctl = runScenario("CONTROL (venue detail は誤爆しない)", CONTROL);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║ Summary                                                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("  Known-leak URLs (should all be BLOCKED post-gate):");
  console.log(`    S1: blocked=${s1.blocked} / promoted=${s1.promoted}`);
  console.log(`    S2: blocked=${s2.blocked} / promoted=${s2.promoted}`);
  console.log(`    S3: blocked=${s3.blocked} / promoted=${s3.promoted}`);
  console.log("");
  console.log("  Control URLs (should all be PROMOTED):");
  console.log(`    CTL: blocked=${ctl.blocked} / promoted=${ctl.promoted}`);
  console.log("");

  const leakPromoted = s1.promoted + s2.promoted + s3.promoted;
  const ctlBlocked = ctl.blocked;
  const ok = leakPromoted === 0 && ctlBlocked === 0;
  console.log(`  Result: ${ok ? "PASS ✓" : "FAIL ✗"}`);
  if (!ok) {
    console.log(`    leak-promoted=${leakPromoted} (expect 0)`);
    console.log(`    control-blocked=${ctlBlocked} (expect 0)`);
    process.exitCode = 1;
  }
}

main();
