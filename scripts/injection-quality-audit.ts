/**
 * injection-quality-audit.ts
 *
 * 4層注入ブロックの品質監査スクリプト。
 * 4ドメイン × 4層 の注入ブロックをすべて生成し、
 * 注入強度・自然さ・再質問抑制の妥当性を検査する。
 *
 * 実行: node -e "require('tsx/cjs'); require('./scripts/injection-quality-audit.ts')"
 */

import {
  deriveBaselineContext,
  deriveRelationshipContext,
  deriveLifeContext,
  buildBaselinePromptSection,
  buildRelationshipContextPromptSection,
  buildLifeContextPromptSection,
  scoreBaselineRelevance,
  shouldInjectBaseline,
  shouldInjectRelationshipContext,
  shouldInjectLifeContext,
  buildTeenSafeguardLines,
  type QueryDomainForBaseline,
} from "../lib/stargazer/baselineContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テストユーザー: 典型的な回答済みユーザー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const baselineCtx = deriveBaselineContext({
  gender: "male",
  dateOfBirth: "1998-03-20",
  prefecture: "東京都",
});

const relationshipCtx = deriveRelationshipContext({
  marriageIntent: "いい人がいれば",
  childrenPreference: "未定",
  smokingStatus: "non_smoker",
  lifestyleMorningNight: 45,
  enabledCategories: ["romantic", "friendship"],
  updatedAt: new Date().toISOString(),
});

const lifeCtx = deriveLifeContext({
  values: ["誠実さ", "自由", "成長"],
  passions: ["音楽", "旅行", "読書"],
  career: ["エンジニア", "フリーランス"],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4ドメインの想定質問
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DOMAIN_QUERIES: Record<QueryDomainForBaseline, string> = {
  career: "転職しようか迷ってる。今の仕事にやりがい感じないんだよね",
  relationship: "最近いい感じの人がいるんだけど、距離の縮め方がわからない",
  lifestyle: "最近生活リズムが乱れてて、なんか疲れが取れない",
  self_understanding: "自分が本当に何がしたいのかわからなくなってきた",
  health: "最近肩こりがひどくて集中できない",
  general: "今日なにしようかな",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 監査実行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const AUDIT_DOMAINS: QueryDomainForBaseline[] = [
  "career", "relationship", "self_understanding", "general",
];

for (const domain of AUDIT_DOMAINS) {
  console.log("\n" + "═".repeat(72));
  console.log(`DOMAIN: ${domain}`);
  console.log(`質問: 「${DOMAIN_QUERIES[domain]}」`);
  console.log("═".repeat(72));

  // 注入ブロック集計
  let totalInjectedLines = 0;
  let totalInjectedChars = 0;
  const injectedLayers: string[] = [];

  // ── A baseline ──
  const aInject = shouldInjectBaseline(baselineCtx, domain);
  if (aInject) {
    const relevance = scoreBaselineRelevance(baselineCtx, domain);
    const aLines = buildBaselinePromptSection(baselineCtx, relevance, domain);
    const teenLines = buildTeenSafeguardLines(baselineCtx, domain);
    const allALines = [...aLines, ...teenLines];
    if (allALines.length > 0) {
      console.log("\n[A baseline] ✅ 注入");
      console.log(`  行数: ${allALines.length}  文字数: ${allALines.join("").length}`);
      console.log(`  relevance: lifeStage=${relevance.lifeStage}, gender=${relevance.gender}, area=${relevance.area}`);
      totalInjectedLines += allALines.length;
      totalInjectedChars += allALines.join("").length;
      injectedLayers.push("A");
      // 注入テキストの先頭3行だけ表示
      console.log("  プレビュー:");
      for (const line of allALines.filter(l => l.startsWith("- ")).slice(0, 3)) {
        console.log(`    ${line}`);
      }
    }
  } else {
    console.log("\n[A baseline] ⬜ スキップ");
  }

  // ── C (B normalization) ──
  const cInject = shouldInjectRelationshipContext(relationshipCtx, domain);
  if (cInject) {
    const cLines = buildRelationshipContextPromptSection(relationshipCtx, domain);
    if (cLines.length > 0) {
      console.log("\n[C (B→正規化)] ✅ 注入");
      console.log(`  行数: ${cLines.length}  文字数: ${cLines.join("").length}`);
      totalInjectedLines += cLines.length;
      totalInjectedChars += cLines.join("").length;
      injectedLayers.push("C");
      console.log("  プレビュー:");
      for (const line of cLines.filter(l => l.startsWith("- ")).slice(0, 3)) {
        console.log(`    ${line}`);
      }
    }
  } else {
    console.log("\n[C (B→正規化)] ⬜ スキップ");
  }

  // ── Life layer ──
  const lInject = shouldInjectLifeContext(lifeCtx, domain);
  if (lInject) {
    const lLines = buildLifeContextPromptSection(lifeCtx, domain);
    if (lLines.length > 0) {
      console.log("\n[Life layer] ✅ 注入");
      console.log(`  行数: ${lLines.length}  文字数: ${lLines.join("").length}`);
      totalInjectedLines += lLines.length;
      totalInjectedChars += lLines.join("").length;
      injectedLayers.push("Life");
      console.log("  プレビュー:");
      for (const line of lLines.filter(l => l.startsWith("- ")).slice(0, 3)) {
        console.log(`    ${line}`);
      }
    }
  } else {
    console.log("\n[Life layer] ⬜ スキップ");
  }

  // ── サマリ ──
  console.log("\n┌─────────────────────────────────────────┐");
  console.log(`│ 注入層: ${injectedLayers.length === 0 ? "なし" : injectedLayers.join(" + ")}`.padEnd(42) + "│");
  console.log(`│ 合計行数: ${totalInjectedLines}  合計文字数: ${totalInjectedChars}`.padEnd(42) + "│");

  // 強度判定
  let intensity: string;
  if (totalInjectedChars === 0) {
    intensity = "⬜ ゼロ（personalization なし）";
  } else if (totalInjectedChars < 200) {
    intensity = "🟢 軽微（自然）";
  } else if (totalInjectedChars < 500) {
    intensity = "🟡 中程度（許容範囲）";
  } else if (totalInjectedChars < 800) {
    intensity = "🟠 やや重い（要注意）";
  } else {
    intensity = "🔴 過剰（プロフィール読み感のリスク）";
  }
  console.log(`│ 強度判定: ${intensity}`.padEnd(42) + "│");
  console.log("└─────────────────────────────────────────┘");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 再質問抑制テスト: 全層の制約文言を検査
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log("\n" + "═".repeat(72));
console.log("再質問抑制: 全注入ブロックの制約文言検査");
console.log("═".repeat(72));

const RE_ASK_PATTERNS = [
  "再度聞く", "再度確認", "再質問", "禁止",
  "同じ内容", "聞かない", "確認しない",
];

for (const domain of AUDIT_DOMAINS) {
  const allLines: string[] = [];

  if (shouldInjectBaseline(baselineCtx, domain)) {
    const rel = scoreBaselineRelevance(baselineCtx, domain);
    allLines.push(...buildBaselinePromptSection(baselineCtx, rel, domain));
  }
  if (shouldInjectRelationshipContext(relationshipCtx, domain)) {
    allLines.push(...buildRelationshipContextPromptSection(relationshipCtx, domain));
  }
  if (shouldInjectLifeContext(lifeCtx, domain)) {
    allLines.push(...buildLifeContextPromptSection(lifeCtx, domain));
  }

  const constraintLines = allLines.filter(l =>
    RE_ASK_PATTERNS.some(p => l.includes(p))
  );

  const hasConstraint = constraintLines.length > 0;
  const hasData = allLines.filter(l => l.startsWith("- ") && !l.includes("禁止") && !l.includes("制約")).length > 0;

  console.log(`\n[${domain}] データ注入: ${hasData ? "あり" : "なし"} / 再質問禁止制約: ${hasConstraint ? "あり ✅" : hasData ? "⚠️ 欠落" : "不要（データなし）"}`);
  if (constraintLines.length > 0) {
    for (const cl of constraintLines.slice(0, 2)) {
      console.log(`  ${cl.trim()}`);
    }
  }
}

console.log("\n" + "═".repeat(72));
console.log("監査完了");
console.log("═".repeat(72));
