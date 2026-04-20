/**
 * [CoAlter Stage 1 observation runner 2026-04-20]
 *   stage1-observation.sql の Q1〜Q7 を TS + supabase-js で実装し、
 *   markdown-ready なテーブル文字列を stdout に出す。
 *
 *   使い方:
 *     npx tsx scripts/coalter/stage1-observe.ts [label]
 *
 *     label は任意（例: T0 / T1 / T3-preflight）。stdout 見出しに入るだけで
 *     DB には触らない。
 *
 *   契約:
 *     - READ ONLY。INSERT/UPDATE/DELETE は絶対に発行しない。
 *     - 値は docs/coalter-stage1-observation-protocol.md に手動コピペする想定。
 *     - 実装は supabase-js の query builder のみ使い、raw SQL は走らせない
 *       （既存 step4-*.ts と同じ手口）。
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type PairRow = {
  id: string;
  thread_id: string;
  state: string;
  accepted_at: string | null;
  onboarded_at: string | null;
};

type LedgerRow = {
  id: string;
  pair_state_id: string;
  session_id: string | null;
  decided_at: string;
};

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = (sorted.length - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

function fmt(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return Number(n.toFixed(digits)).toString();
}

function printTable(title: string, rows: Array<[string, string]>): void {
  console.log(`### ${title}\n`);
  console.log(`| 指標 | 値 |`);
  console.log(`|---|---|`);
  for (const [k, v] of rows) console.log(`| ${k} | ${v} |`);
  console.log("");
}

// ─────────────────────────────────────────────
// main load: 全 pair_states と全 fairness_ledger を 1 回だけ取得
// ─────────────────────────────────────────────

async function loadAll() {
  const { data: pairs, error: e1 } = await admin
    .from("coalter_pair_states")
    .select("id, thread_id, state, accepted_at, onboarded_at");
  if (e1) throw new Error(`pair_states fetch failed: ${e1.message}`);

  const { data: ledger, error: e2 } = await admin
    .from("coalter_fairness_ledger")
    .select("id, pair_state_id, session_id, decided_at");
  if (e2) throw new Error(`fairness_ledger fetch failed: ${e2.message}`);

  return {
    pairs: (pairs ?? []) as PairRow[],
    ledger: (ledger ?? []) as LedgerRow[],
  };
}

// ─────────────────────────────────────────────
// Q1
// ─────────────────────────────────────────────
function q1(pairs: PairRow[]) {
  const total = pairs.length;
  const onboarded = pairs.filter((p) => p.onboarded_at).length;
  const notOnboarded = total - onboarded;
  const enabled = pairs.filter((p) => p.state === "enabled").length;
  const ratio =
    enabled === 0 ? null : Math.round((onboarded / enabled) * 1000) / 10;
  printTable("Q1 ペア単位のオンボード状況", [
    ["total_pairs", String(total)],
    ["onboarded_pairs", String(onboarded)],
    ["not_onboarded_pairs", String(notOnboarded)],
    ["enabled_pairs", String(enabled)],
    ["onboarded_ratio_of_enabled_pct", ratio === null ? "—" : `${ratio}%`],
  ]);
}

// ─────────────────────────────────────────────
// Q2  — 異常（seed_count != 1）のみ列挙
// ─────────────────────────────────────────────
function q2(pairs: PairRow[], ledger: LedgerRow[]) {
  const onboarded = pairs.filter((p) => p.onboarded_at);
  const byPair = new Map<string, { seed: number; normal: number }>();
  for (const p of onboarded) byPair.set(p.id, { seed: 0, normal: 0 });
  for (const l of ledger) {
    const acc = byPair.get(l.pair_state_id);
    if (!acc) continue;
    if (l.session_id === null) acc.seed++;
    else acc.normal++;
  }
  const anomalies = [...byPair.entries()].filter(([, v]) => v.seed !== 1);
  console.log(`### Q2 onboarded ペアの seed cardinality 異常（期待 seed=1）\n`);
  if (anomalies.length === 0) {
    console.log("✅ 異常なし — すべての onboarded ペアが seed_count = 1\n");
  } else {
    console.log(`❌ ${anomalies.length} 件の異常\n`);
    console.log(`| pair_state_id | seed_count | normal_count |`);
    console.log(`|---|---|---|`);
    for (const [id, v] of anomalies) {
      console.log(`| ${id} | ${v.seed} | ${v.normal} |`);
    }
    console.log("");
  }
}

// ─────────────────────────────────────────────
// Q3  retro-seed
// ─────────────────────────────────────────────
function q3(pairs: PairRow[], ledger: LedgerRow[]) {
  const notOnboardedIds = new Set(
    pairs.filter((p) => !p.onboarded_at).map((p) => p.id),
  );
  const violations = ledger.filter(
    (l) => l.session_id === null && notOnboardedIds.has(l.pair_state_id),
  );
  console.log(`### Q3 未オンボードペアの retro-seed 検知（期待 0）\n`);
  if (violations.length === 0) {
    console.log("✅ 違反なし\n");
  } else {
    const byPair = new Map<string, number>();
    for (const v of violations) {
      byPair.set(v.pair_state_id, (byPair.get(v.pair_state_id) ?? 0) + 1);
    }
    console.log(`❌ ${violations.length} 行の retro-seed (${byPair.size} ペア)\n`);
    console.log(`| pair_state_id | unexpected_seed_count |`);
    console.log(`|---|---|`);
    for (const [id, n] of byPair) console.log(`| ${id} | ${n} |`);
    console.log("");
  }
}

// ─────────────────────────────────────────────
// Q4  accept→activate lag 分布
// ─────────────────────────────────────────────
function q4(pairs: PairRow[]) {
  const lags: number[] = [];
  for (const p of pairs) {
    if (!p.onboarded_at || !p.accepted_at) continue;
    const diff =
      (new Date(p.onboarded_at).getTime() -
        new Date(p.accepted_at).getTime()) /
      1000;
    lags.push(diff);
  }
  const sorted = [...lags].sort((a, b) => a - b);
  printTable("Q4 accept→activate ラグ分布（秒）", [
    ["n", String(lags.length)],
    ["min_sec", lags.length === 0 ? "—" : fmt(sorted[0])],
    [
      "avg_sec",
      lags.length === 0
        ? "—"
        : fmt(lags.reduce((s, x) => s + x, 0) / lags.length),
    ],
    ["p50_sec", fmt(percentile(sorted, 0.5))],
    ["p95_sec", fmt(percentile(sorted, 0.95))],
    ["max_sec", lags.length === 0 ? "—" : fmt(sorted[sorted.length - 1])],
    [
      "negative_values",
      String(lags.filter((x) => x < 0).length) +
        (lags.some((x) => x < 0) ? " ❌ 時刻整合性バグ" : " ✅"),
    ],
  ]);
}

// ─────────────────────────────────────────────
// Q5  normal ledger 進展
// ─────────────────────────────────────────────
function q5(ledger: LedgerRow[]) {
  const normal = ledger.filter((l) => l.session_id !== null);
  const pairsWith = new Set(normal.map((l) => l.pair_state_id));
  const decided = normal
    .map((l) => new Date(l.decided_at).getTime())
    .sort((a, b) => a - b);
  const earliest = decided[0] ?? null;
  const latest = decided[decided.length - 1] ?? null;
  printTable("Q5 normal ledger 進展", [
    ["total_normal_ledger_rows", String(normal.length)],
    ["pairs_with_normal_ledger", String(pairsWith.size)],
    ["earliest_normal_decided", earliest ? new Date(earliest).toISOString() : "—"],
    ["latest_normal_decided", latest ? new Date(latest).toISOString() : "—"],
  ]);
}

// ─────────────────────────────────────────────
// Q6  24h 新規 onboard / session
// ─────────────────────────────────────────────
async function q6(pairs: PairRow[]) {
  const since = Date.now() - 24 * 3600 * 1000;
  const newOnboarded = pairs.filter(
    (p) => p.onboarded_at && new Date(p.onboarded_at).getTime() >= since,
  ).length;

  // coalter_sessions は別テーブルなのでここだけクエリする
  const { data: sessions, error } = await admin
    .from("coalter_sessions")
    .select("id, pair_state_id, created_at")
    .gte("created_at", new Date(since).toISOString());
  if (error) {
    console.log(`### Q6 取得失敗: ${error.message}\n`);
    return;
  }
  const rows = (sessions ?? []) as Array<{ id: string; pair_state_id: string; created_at: string }>;
  const pairsWithSession = new Set(rows.map((r) => r.pair_state_id)).size;

  printTable("Q6 直近 24h の onboard vs session 生成", [
    ["new_onboarded_24h", String(newOnboarded)],
    ["pairs_with_session_24h", String(pairsWithSession)],
    ["sessions_created_24h", String(rows.length)],
  ]);
}

// ─────────────────────────────────────────────
// Q7  G1 canary 判断指標
// ─────────────────────────────────────────────
function q7(pairs: PairRow[], ledger: LedgerRow[]) {
  const onboardedTotal = pairs.filter((p) => p.onboarded_at).length;

  const notOnboardedIds = new Set(
    pairs.filter((p) => !p.onboarded_at).map((p) => p.id),
  );
  const contractViolations = new Set(
    ledger
      .filter((l) => l.session_id === null && notOnboardedIds.has(l.pair_state_id))
      .map((l) => l.pair_state_id),
  ).size;

  const byPair = new Map<string, number>();
  for (const p of pairs) if (p.onboarded_at) byPair.set(p.id, 0);
  for (const l of ledger) {
    if (l.session_id === null && byPair.has(l.pair_state_id)) {
      byPair.set(l.pair_state_id, (byPair.get(l.pair_state_id) ?? 0) + 1);
    }
  }
  const seedCardinalityViolations = [...byPair.values()].filter(
    (n) => n !== 1,
  ).length;

  printTable("Q7 G1 Canary 判断集約", [
    ["onboarded_total", String(onboardedTotal)],
    [
      "contract_violations",
      contractViolations === 0 ? "0 ✅" : `${contractViolations} ❌`,
    ],
    [
      "seed_cardinality_violations",
      seedCardinalityViolations === 0
        ? "0 ✅"
        : `${seedCardinalityViolations} ❌`,
    ],
  ]);
}

// ─────────────────────────────────────────────
// main
// ─────────────────────────────────────────────

async function main() {
  const label = process.argv[2] ?? new Date().toISOString();
  console.log(`# CoAlter Stage 1 observation snapshot — ${label}\n`);
  console.log(`_generated: ${new Date().toISOString()}_\n`);

  const { pairs, ledger } = await loadAll();
  q1(pairs);
  q2(pairs, ledger);
  q3(pairs, ledger);
  q4(pairs);
  q5(ledger);
  await q6(pairs);
  q7(pairs, ledger);

  console.log(
    "---\n上記を docs/coalter-stage1-observation-protocol.md の対応スナップショット欄に貼り付け。",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
