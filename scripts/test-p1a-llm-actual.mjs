/**
 * P1-A LLM実出力検証スクリプト
 * 5タイプルーター + knowledge/strategy専用プロンプト + before/after比較
 */

const BASE_URL = "http://localhost:3000";

// ━━━━ Before: P0時点の実出力（前回テストから） ━━━━
const P0_RESPONSES = {
  "だいぶしんどい1日だったよ": "テストさん、今日しんどかったのは、誰かとの関係で特に疲れたのかな？\n具体的な相手がいるかどうかで、しんどさの種類や対処法が変わってくるからね。",
  "もう疲れた": "テストさんは、誰に対して「もう疲れた」と感じているのかな？\nその相手によって、テストさんの感じている「疲れ」の質が大きく変わるからね。",
  "俺って何が向いてるんだろう": "テストさんは、誰かの役に立ちたいという気持ちが強いのかな？\nその気持ちが、向いていることを見つけるヒかりになるかもしれないね。",
  "何が私の核ですか？": "テストさんが一番達成感を感じるのは、混沌の中から筋を見つけた瞬間じゃないかな。\nひとりで考える時間を大切にするタイプで、対人場面が続くと消耗しやすい傾向があるから、深く集中して本質を探るプロセスが核になっていると思う。\nこれは僕の仮説だけど、もう少し話してくれたら、もっと解像度が上がるはず。",
  "今の私には何が必要ですか？": "今のテストさんには、一度立ち止まって「内側の整理」をすることが必要だと僕は思う。\n対人場面が続くと消耗しやすいテストさんだからこそ、今はひとりで考える時間を確保して、散らかった思考を整理するのが回復の源になるはずだ。\n次の一手: 今日中に、頭の中にあるモヤモヤを紙かテキストに書き出してみるのがよさそうだ。",
  "俺が最も達成感を感じやすいものは何？": "テストさんが一番達成感を感じるのは、混沌の中から筋を見つけ、自分なりの秩序を築き上げた瞬間じゃないかな。\n分析的に物事を捉え、ひとりで深く考える時間を大切にするテストさんだからこそ、複雑な状況を整理し、明確な答えを導き出すことに喜びを感じる傾向があるんだ。\nこれは僕の仮説だけど、もっと話してくれたら精度が上がると思う。",
  "例えばどんな職業があってる？": "テストさんは、誰かの役に立つ仕事に興味があるのかな？\n具体的な相手がいるかどうかで、向いている職業の方向性が大きく変わるからね。",
  "日本の企業だと、具体的に何の企業？": "今は焦って具体的な企業名を挙げるより、一旦立ち止まって「なぜその情報が必要なのか」を整理するのが合っています。",
  "面接はどう言う感じで攻めればいい？": "今回の面接は、自分の軸を明確に伝える形で攻めるのが合っています。\nテストさんは深い1対1の関係を重視し、自分の軸を大事にするタイプだからこそ...",
  "飲み会に誘われたんだけど行くべき？": "今回は、誰が来るのか、どんな雰囲気の飲み会なのかをまず確認するのが合っていそうです。",
};

// テスト質問セット（P1-A拡張版）
const TEST_QUESTIONS = [
  { id: 1, message: "だいぶしんどい1日だったよ", type: "emotional", expectedType: "emotional",
    checkFor: ["no_action", "no_homework", "empathy_first"] },
  { id: 2, message: "もう疲れた", type: "emotional", expectedType: "emotional",
    checkFor: ["no_action", "no_homework", "empathy_first"] },
  { id: 3, message: "俺って何が向いてるんだろう", type: "self_understanding", expectedType: "self_understanding",
    checkFor: ["hypothesis", "no_homework", "no_generic_list"] },
  { id: 4, message: "何が私の核ですか？", type: "self_understanding", expectedType: "self_understanding",
    checkFor: ["hypothesis", "no_homework"] },
  // ★ P1-A最優先検証ケース: self_understanding と strategy の境界
  { id: 5, message: "今の私には何が必要ですか？", type: "self_understanding_gap", expectedType: "self_understanding",
    checkFor: ["hypothesis", "no_homework", "no_action_label"] },
  { id: 6, message: "俺が最も達成感を感じやすいものは何？", type: "self_understanding", expectedType: "self_understanding",
    checkFor: ["hypothesis", "no_homework"] },
  // knowledge: 仮説+確信度+不足情報
  { id: 7, message: "例えばどんな職業があってる？", type: "knowledge", expectedType: "knowledge",
    checkFor: ["no_homework", "has_confidence", "has_missing_info", "no_generic_list", "has_examples"] },
  { id: 8, message: "日本の企業だと、具体的に何の企業？", type: "knowledge", expectedType: "knowledge",
    checkFor: ["no_homework", "has_confidence", "has_missing_info", "no_generic_list", "has_examples"] },
  // strategy: アプローチ+性格根拠
  { id: 9, message: "面接はどう言う感じで攻めればいい？", type: "strategy", expectedType: "strategy",
    checkFor: ["no_homework", "has_direction", "has_personal_reason"] },
  // judgment: 従来の判断パイプライン
  { id: 10, message: "飲み会に誘われたんだけど行くべき？", type: "judgment", expectedType: "judgment",
    checkFor: ["has_action"] },
];

// 検証パターン
const HOMEWORK_PATTERNS = /書き出[しすせ]|リストアップ|ピックアップ|[3３]つ.*(?:書|挙|出し|考え)てみ|候補を.*(?:挙|出|ピック)|.*つだけ.*書[きく]|[3３]つだけ/;
const ACTION_LABEL_PATTERNS = /次の一手[:：]/;
const GENERIC_LIST_PATTERNS = /NTTデータ|アクセンチュア|野村総合研究所|NRI|マッキンゼー|ボストン.*コンサル|デロイト/;
const T0_LEAK_PATTERNS = /転職を検討|無職・求職中|転職検討中/;

function evaluate(question, responseText) {
  const text = responseText || "";
  const checks = {};

  if (question.checkFor.includes("no_homework")) {
    checks.no_homework = !HOMEWORK_PATTERNS.test(text);
  }
  if (question.checkFor.includes("no_action")) {
    checks.no_action = !ACTION_LABEL_PATTERNS.test(text);
  }
  if (question.checkFor.includes("no_action_label")) {
    checks.no_action_label = !ACTION_LABEL_PATTERNS.test(text);
  }
  if (question.checkFor.includes("has_action")) {
    checks.has_action = ACTION_LABEL_PATTERNS.test(text) || /今日中に|今すぐ|今から|今夜|まず/.test(text);
  }
  if (question.checkFor.includes("empathy_first")) {
    const firstLine = text.split(/[。\n]/)[0] || "";
    checks.empathy_first = /重い|しんどい|つらい|大変|疲れ|きつ|わかる|そうだよね|だよね|頑張|よく/.test(firstLine);
  }
  if (question.checkFor.includes("hypothesis")) {
    checks.hypothesis = /と思う|じゃないかな|と感じ|だと僕は|かもしれない|仮説|と見て|はず|だろう|気がする/.test(text);
  }
  if (question.checkFor.includes("no_generic_list")) {
    checks.no_generic_list = !GENERIC_LIST_PATTERNS.test(text);
  }
  // P1-A knowledge checks
  if (question.checkFor.includes("has_confidence")) {
    checks.has_confidence = /確度|見立て|仮説|確信|自信|精度|合ってると思う|方向.*合って|情報が少ない|と思う|はず|じゃないかな|かもしれない/.test(text);
  }
  if (question.checkFor.includes("has_missing_info")) {
    checks.has_missing_info = /わかれば|分かれば|わかると|分かると|教えてくれれば|教えてもらえれば|情報があれば|精度.*上がる|もっと絞[れり込]|もっと.*わかる|もっと.*分かる|もっと.*具体|聞けば|聞かせて|知れ[ばたる]/.test(text);
  }
  if (question.checkFor.includes("has_examples")) {
    // 具体例が含まれているか（回答拒否ではなく実際に例を出しているか）
    checks.has_examples = text.length > 50 && !/整理するのが|なぜその情報が|考えてみて/.test(text);
  }
  // P1-A strategy checks
  if (question.checkFor.includes("has_direction")) {
    checks.has_direction = /合っている|合う|から入る|方が[いい力]|強み|を活かす|が合って|が武器|が鍵/.test(text);
  }
  if (question.checkFor.includes("has_personal_reason")) {
    checks.has_personal_reason = /タイプ|傾向|だからこそ|なので|場合|さんは|強み|分析|深い|慎重|消耗|パターン/.test(text);
  }

  // 共通: T0漏出
  checks.no_t0_leak = !T0_LEAK_PATTERNS.test(text);

  const passed = Object.values(checks).every(v => v === true);
  return { checks, passed };
}

async function callTestEndpoint(message) {
  try {
    const resp = await fetch(`${BASE_URL}/api/test/alter-p0`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userName: "テスト" }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { error: `HTTP ${resp.status}: ${text.slice(0, 300)}` };
    }
    return await resp.json();
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║    P1-A LLM出力 Before/After 検証レポート          ║");
  console.log("║    5タイプルーター + knowledge/strategy専用プロンプト ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`テスト開始: ${new Date().toISOString()}\n`);

  const results = [];
  let afterPassCount = 0;
  let p0PassCount = 0;
  let routerCorrect = 0;

  for (const q of TEST_QUESTIONS) {
    console.log(`━━━ Q${q.id}: [${q.type}] "${q.message}" ━━━`);

    const afterData = await callTestEndpoint(q.message);

    if (afterData.error) {
      console.log(`  ❗ ERROR: ${afterData.error}\n`);
      results.push({ ...q, error: afterData.error });
      continue;
    }

    const afterText = (afterData.response || "").replace(/---DECISION_META---[\s\S]*$/, "").trim();
    const afterEval = evaluate(q, afterText);
    const detectedType = afterData.detection?.questionType;
    const typeCorrect = detectedType === q.expectedType;
    if (typeCorrect) routerCorrect++;

    // P0 baseline
    const p0Text = P0_RESPONSES[q.message];
    const p0Eval = p0Text ? evaluate(q, p0Text) : null;
    if (p0Eval?.passed) p0PassCount++;
    if (afterEval.passed) afterPassCount++;

    // ルーター結果
    console.log(`  ルーター: ${typeCorrect ? "✅" : "❌"} detected=${detectedType} expected=${q.expectedType}`);
    console.log(`  mode=${afterData.detection?.responseMode} retried=${afterData.meta?.retried || false}`);

    // P0 baseline
    if (p0Text) {
      console.log(`  ┌─ P0:`);
      console.log(`  │ "${p0Text.slice(0, 120)}${p0Text.length > 120 ? "..." : ""}"`);
    }

    // P1-A output
    console.log(`  ├─ P1-A:`);
    console.log(`  │ "${afterText.slice(0, 200)}${afterText.length > 200 ? "..." : ""}"`);
    for (const [name, passed] of Object.entries(afterEval.checks)) {
      console.log(`  │ ${passed ? "✅" : "❌"} ${name}`);
    }
    console.log(`  └─ バリデーション: ${afterData.validation?.pass ? "✅ PASS" : `❌ FAIL (${afterData.validation?.failures?.join(", ")})`}`);
    console.log("");

    results.push({
      ...q, afterText: afterText.slice(0, 300), p0Text: p0Text?.slice(0, 200),
      afterEval, p0Eval, detectedType, typeCorrect,
      validationPass: afterData.validation?.pass,
    });

    await new Promise(r => setTimeout(r, 3000));
  }

  // ━━━━ サマリ ━━━━
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║                      サマリ                         ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log(`ルーター正解率:  ${routerCorrect}/${TEST_QUESTIONS.length}`);
  console.log(`P0 PASS:         ${p0PassCount}/${Object.keys(P0_RESPONSES).length}`);
  console.log(`P1-A PASS:       ${afterPassCount}/${TEST_QUESTIONS.length}`);
  console.log("");

  // タイプ別集計
  const byType = {};
  for (const r of results) {
    if (!byType[r.type]) byType[r.type] = { total: 0, pass: 0, routerOk: 0 };
    byType[r.type].total++;
    if (r.afterEval?.passed) byType[r.type].pass++;
    if (r.typeCorrect) byType[r.type].routerOk++;
  }
  console.log("タイプ別:");
  for (const [type, stats] of Object.entries(byType)) {
    console.log(`  ${type}: PASS ${stats.pass}/${stats.total}, ルーター ${stats.routerOk}/${stats.total}`);
  }

  // CEO評価基準
  console.log("\n━━━ CEO評価基準 ━━━\n");
  const knowledgeResults = results.filter(r => r.type === "knowledge");
  const strategyResults = results.filter(r => r.type === "strategy");
  const q5 = results.find(r => r.id === 5);

  console.log(`1. 5タイプルーター正確性:    ${routerCorrect}/${TEST_QUESTIONS.length} (${routerCorrect === TEST_QUESTIONS.length ? "✅" : "要確認"})`);
  console.log(`2. Q5境界問題:              ${q5?.typeCorrect ? "✅ self_understandingに正しく分類" : "❌"} → ${q5?.afterEval?.passed ? "PASS" : "FAIL"}`);
  console.log(`3. knowledge仮説+確信度:    ${knowledgeResults.filter(r => r.afterEval?.checks?.has_confidence).length}/${knowledgeResults.length}`);
  console.log(`4. knowledge不足情報:       ${knowledgeResults.filter(r => r.afterEval?.checks?.has_missing_info).length}/${knowledgeResults.length}`);
  console.log(`5. knowledge具体例提示:     ${knowledgeResults.filter(r => r.afterEval?.checks?.has_examples).length}/${knowledgeResults.length}`);
  console.log(`6. strategy方向性:          ${strategyResults.filter(r => r.afterEval?.checks?.has_direction).length}/${strategyResults.length}`);
  console.log(`7. strategy性格根拠:        ${strategyResults.filter(r => r.afterEval?.checks?.has_personal_reason).length}/${strategyResults.length}`);
  console.log(`8. 宿題消滅:               ${results.filter(r => r.afterEval?.checks?.no_homework === true).length}/${results.filter(r => r.afterEval?.checks?.no_homework !== undefined).length}`);
}

main().catch(console.error);
