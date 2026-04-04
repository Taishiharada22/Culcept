/**
 * TASK-3c: 質問候補の可視化スクリプト
 *
 * STARGAZER_AXES を読み込み、各軸の probe_seeds を一覧表示する。
 * 実行: npx tsx scripts/audit-probe-seeds.ts
 *
 * 用途: 手動監査用（CI には組み込まない���
 */

import { TRAIT_AXIS_KEYS } from "../lib/stargazer/traitAxes";
import { STARGAZER_AXES } from "../lib/stargazer/proactiveUnderstanding";

const SEPARATOR = "─".repeat(100);

console.log("\n🔍 StargazerAxis Probe Seeds 監査レポート\n");
console.log(SEPARATOR);
console.log(
  padRight("軸ID", 35) +
  padRight("カ���ゴリ", 18) +
  padRight("sensitivity", 14) +
  padRight("seeds数", 8) +
  "質問候補"
);
console.log(SEPARATOR);

let totalWithSeeds = 0;
let totalSeeds = 0;

for (const key of TRAIT_AXIS_KEYS) {
  const axis = STARGAZER_AXES[key];
  const seedCount = axis.probe_seeds.length;
  if (seedCount > 0) totalWithSeeds++;
  totalSeeds += seedCount;

  const seedsPreview = axis.probe_seeds.length > 0
    ? axis.probe_seeds.map(s => `"${truncate(s, 40)}"`).join(", ")
    : "(なし)";

  console.log(
    padRight(key, 35) +
    padRight(axis.category, 18) +
    padRight(axis.sensitivity, 14) +
    padRight(String(seedCount), 8) +
    seedsPreview
  );
}

console.log(SEPARATOR);
console.log(`\n📊 サマリー:`);
console.log(`   総軸数: ${TRAIT_AXIS_KEYS.length}`);
console.log(`   probe_seeds あり: ${totalWithSeeds}/${TRAIT_AXIS_KEYS.length} (${((totalWithSeeds / TRAIT_AXIS_KEYS.length) * 100).toFixed(1)}%)`);
console.log(`   総 seeds 数: ${totalSeeds}`);
console.log(`   平均 seeds/軸: ${(totalSeeds / TRAIT_AXIS_KEYS.length).toFixed(1)}`);

// sensitivity 別集計
const bySensitivity = { low: 0, medium: 0, high: 0 };
for (const key of TRAIT_AXIS_KEYS) {
  bySensitivity[STARGAZER_AXES[key].sensitivity]++;
}
console.log(`\n   sensitivity 分布: low=${bySensitivity.low} / medium=${bySensitivity.medium} / high=${bySensitivity.high}`);
console.log("");

function padRight(str: string, len: number): string {
  // 日本語文字は2幅で計算
  let width = 0;
  for (const ch of str) {
    width += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  }
  return str + " ".repeat(Math.max(0, len - width));
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}
