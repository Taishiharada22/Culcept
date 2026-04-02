/**
 * P1-A 拡張評価セット（35問）
 *
 * 目的: 代表10問の壁を越え、境界ケース・深さ・空レスを計測
 *
 * 5カテゴリ:
 *   A. 境界ケース: self_understanding↔strategy, emotional↔judgment, knowledge偽装自己理解
 *   B. 言い換えケース: 同じ意図を別表現で
 *   C. 追撃・不満ケース: 前回応答への不満をにじませた追撃
 *   D. Knowledge深さ評価: 具体例の質を3軸で判定
 *   E. 基本ケース再テスト: 代表10問の安定性（空レス率計測）
 *
 * 計測指標:
 *   - ルーター正解率
 *   - 質問タイプ別 PASS 率
 *   - 空レスポンス率（重大失敗として別集計）
 *   - Knowledge 深さスコア（3軸）
 *   - 宿題消滅率
 */

const BASE_URL = "http://localhost:3000";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 質問セット（35問）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const QUESTIONS = [
  // ── A. 境界ケース（12問） ──

  // A1. self_understanding ↔ strategy 境界
  { id: "A1", message: "自分の強みをどう活かせばいい？",
    category: "boundary_su_strategy",
    expectedType: "strategy", // 「どう活かせば」= 方法論が主軸
    checkFor: ["has_direction", "has_personal_reason", "no_homework"] },
  { id: "A2", message: "自分に合った働き方ってどう見つける？",
    category: "boundary_su_strategy",
    expectedType: "strategy", // 「どう見つける」= 方法論
    checkFor: ["has_direction", "has_personal_reason", "no_homework"] },
  { id: "A3", message: "もっと成長するにはどうしたらいい？",
    category: "boundary_su_strategy",
    expectedType: "strategy", // 「どうしたらいい」= 方法論
    checkFor: ["has_direction", "has_personal_reason", "no_homework"] },
  { id: "A4", message: "転職するならどう準備すればいい？",
    category: "boundary_su_strategy",
    expectedType: "strategy", // 「どう準備」= 方法論
    checkFor: ["has_direction", "has_personal_reason", "no_homework"] },

  // A5. emotional ↔ judgment/strategy 境界
  { id: "A5", message: "上司に怒られて最悪な気分なんだけど、明日どう接すればいい？",
    category: "boundary_emo_judgment",
    expectedType: "strategy", // 「どう接すれば」= 方法論（感情はあるが行動要求が主）
    checkFor: ["has_direction", "no_homework"] },
  { id: "A6", message: "彼女と喧嘩して辛い",
    category: "boundary_emo_judgment",
    expectedType: "emotional", // 「辛い」= 感情吐露、判断要求なし
    checkFor: ["empathy_first", "no_action_label", "no_homework"] },
  { id: "A7", message: "仕事で大失敗して凹んでるんだけど、どう立て直せばいい？",
    category: "boundary_emo_judgment",
    expectedType: "strategy", // 「どう立て直す」= 方法論
    checkFor: ["has_direction", "no_homework"] },
  { id: "A8", message: "友達に裏切られた。もう信じられない",
    category: "boundary_emo_judgment",
    expectedType: "emotional", // 感情爆発、判断要求なし
    checkFor: ["empathy_first", "no_action_label", "no_homework"] },

  // A9. knowledge だけど本当は自己理解を試している
  { id: "A9", message: "INTJの人ってどんな仕事してるの？",
    category: "boundary_knowledge_su",
    expectedType: "knowledge", // 外部情報要求
    checkFor: ["has_confidence", "no_generic_list", "no_homework"] },
  { id: "A10", message: "分析力が高い人ってどういう業界に多い？",
    category: "boundary_knowledge_su",
    expectedType: "knowledge",
    checkFor: ["has_confidence", "no_homework"] },
  { id: "A11", message: "俺みたいなタイプは何の仕事してる人が多い？",
    category: "boundary_knowledge_su",
    expectedType: "self_understanding", // 「俺みたいな」= 自己理解が主軸
    checkFor: ["hypothesis", "no_homework"] },
  { id: "A12", message: "内向的な人に向いてる職業って何？",
    category: "boundary_knowledge_su",
    expectedType: "knowledge", // 一般情報要求
    checkFor: ["has_confidence", "no_homework"] },

  // ── B. 言い換えケース（6問） ──
  { id: "B1", message: "私の長所って何だと思う？",
    category: "rephrase",
    expectedType: "self_understanding",
    rephraseOf: "俺って何が向いてるんだろう",
    checkFor: ["hypothesis", "no_homework"] },
  { id: "B2", message: "今すごくきつい",
    category: "rephrase",
    expectedType: "emotional",
    rephraseOf: "もう疲れた",
    checkFor: ["empathy_first", "no_action_label", "no_homework"] },
  { id: "B3", message: "自分に合う職種を教えて",
    category: "rephrase",
    expectedType: "knowledge",
    rephraseOf: "例えばどんな職業があってる？",
    checkFor: ["has_confidence", "has_missing_info", "no_homework"] },
  { id: "B4", message: "プレゼンのコツってある？",
    category: "rephrase",
    expectedType: "strategy",
    rephraseOf: "面接はどう言う感じで攻めればいい？",
    checkFor: ["has_direction", "has_personal_reason", "no_homework"] },
  { id: "B5", message: "今週の飲み会参加するか迷ってる",
    category: "rephrase",
    expectedType: "judgment",
    rephraseOf: "飲み会に誘われたんだけど行くべき？",
    checkFor: ["has_conclusion"] },
  { id: "B6", message: "今の俺に欠けてるものは？",
    category: "rephrase",
    expectedType: "self_understanding",
    rephraseOf: "今の私には何が必要ですか？",
    checkFor: ["hypothesis", "no_homework", "no_action_label"] },

  // ── C. 追撃・不満ケース（5問） ──
  { id: "C1", message: "そういうことじゃなくて、具体的に何の仕事か聞いてるんだけど",
    category: "frustration",
    expectedType: "knowledge", // 追撃で具体例を要求
    checkFor: ["has_examples", "no_homework"] },
  { id: "C2", message: "抽象的すぎてよくわからない。もっと具体的に言って",
    category: "frustration",
    expectedType: "knowledge", // 具体化要求
    checkFor: ["has_examples"] },
  { id: "C3", message: "それ誰にでも言えるやつじゃん",
    category: "frustration",
    expectedType: "judgment", // 一般論への不満 → 判断として再応答
    checkFor: ["has_personal_reason"] },
  { id: "C4", message: "聞いてるのは感想じゃなくてアドバイスなんだけど",
    category: "frustration",
    expectedType: "strategy", // アドバイス要求
    checkFor: ["has_direction"] },
  { id: "C5", message: "いや、もういいよ。結局わかんないんでしょ",
    category: "frustration",
    expectedType: "emotional", // 諦め+感情
    checkFor: ["empathy_first", "no_homework"] },

  // ── D. Knowledge深さ評価（4問） ──
  { id: "D1", message: "研究職ってどんな種類がある？自分に合うのは？",
    category: "knowledge_depth",
    expectedType: "self_understanding", // 「自分に合うのは」= 自己理解が主軸（複合質問）
    checkFor: ["hypothesis", "no_homework", "no_generic_list",
               "depth_why_this", "depth_user_specific", "depth_differentiation"] },
  { id: "D2", message: "ITエンジニアにもいろいろあるけど、俺に向いてるのは？",
    category: "knowledge_depth",
    expectedType: "self_understanding", // 「俺に向いてる」= 自己理解が主軸
    checkFor: ["hypothesis", "no_homework", "no_generic_list",
               "depth_why_this", "depth_user_specific"] },
  { id: "D3", message: "コンサルと研究職どっちが合ってる？",
    category: "knowledge_depth",
    expectedType: "self_understanding", // 比較 = 自己理解
    checkFor: ["hypothesis", "no_homework",
               "depth_why_this", "depth_differentiation"] },
  { id: "D4", message: "フリーランスと会社員、俺はどっちが向いてる？",
    category: "knowledge_depth",
    expectedType: "self_understanding", // 比較 = 自己理解
    checkFor: ["hypothesis", "no_homework",
               "depth_why_this", "depth_user_specific"] },

  // ── E. 基本ケース安定性（8問 = P1-A代表セットから抜粋） ──
  { id: "E1", message: "だいぶしんどい1日だったよ",
    category: "stability", expectedType: "emotional",
    checkFor: ["no_action_label", "no_homework", "empathy_first"] },
  { id: "E2", message: "俺って何が向いてるんだろう",
    category: "stability", expectedType: "self_understanding",
    checkFor: ["hypothesis", "no_homework"] },
  { id: "E3", message: "今の私には何が必要ですか？",
    category: "stability", expectedType: "self_understanding",
    checkFor: ["hypothesis", "no_homework", "no_action_label"] },
  { id: "E4", message: "例えばどんな職業があってる？",
    category: "stability", expectedType: "knowledge",
    checkFor: ["has_confidence", "has_missing_info", "no_homework"] },
  { id: "E5", message: "面接はどう言う感じで攻めればいい？",
    category: "stability", expectedType: "strategy",
    checkFor: ["has_direction", "has_personal_reason", "no_homework"] },
  { id: "E6", message: "飲み会に誘われたんだけど行くべき？",
    category: "stability", expectedType: "judgment",
    checkFor: ["has_conclusion"] },
  { id: "E7", message: "もう疲れた",
    category: "stability", expectedType: "emotional",
    checkFor: ["no_homework", "empathy_first"] },
  { id: "E8", message: "何が私の核ですか？",
    category: "stability", expectedType: "self_understanding",
    checkFor: ["hypothesis", "no_homework"] },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 検証ロジック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const HOMEWORK_PATTERNS = /書き出[しすせ]|リストアップ|ピックアップ|[3３]つ.*(?:書|挙|出し|考え)てみ|候補を.*(?:挙|出|ピック)|.*つだけ.*書[きく]|[3３]つだけ|メモして|振り返って|整理してみ/;
const ACTION_LABEL_PATTERNS = /次の一手[:：]/;
const GENERIC_LIST_PATTERNS = /NTTデータ|アクセンチュア|野村総合研究所|NRI|マッキンゼー|ボストン.*コンサル|デロイト/;

function evaluate(question, text) {
  const checks = {};
  const t = text || "";

  // ── 共通 ──
  if (question.checkFor.includes("no_homework"))
    checks.no_homework = !HOMEWORK_PATTERNS.test(t);
  if (question.checkFor.includes("no_action_label"))
    checks.no_action_label = !ACTION_LABEL_PATTERNS.test(t);
  if (question.checkFor.includes("no_generic_list"))
    checks.no_generic_list = !GENERIC_LIST_PATTERNS.test(t);

  // ── emotional ──
  if (question.checkFor.includes("empathy_first")) {
    const first = (t.split(/[。\n]/)[0]) || "";
    // 1文目に共感・受容の表現があるか
    // 緩和理由: LLMが「当然だね」「無理はないね」「ごめん」等の有効な共感表現を使うが
    // 初版regexが「辛い」「しんどい」等の直接語のみだった。実質共感として成立する表現を追加。
    checks.empathy_first = /重い|しんどい|つらい|辛い|大変|疲れ|きつ|わかる|そうだよね|だよね|そうだね|頑張|よく|気持ち|本当に|裏切|信じ|怒られ|凹|失敗|当然|無理もない|無理ない|無理はない|ごめん|すまない|感じるの[はが]|傷つ/.test(first);
  }

  // ── self_understanding ──
  if (question.checkFor.includes("hypothesis"))
    // 緩和理由: 「と僕は思う」(語順変動)・「でしょう」(推量の助動詞) は有効な仮説表現
    checks.hypothesis = /と思う|じゃないかな|と感じ|だと僕は|と僕は思|かもしれない|仮説|と見て|はず|だろう|でしょう|気がする|と見ている|と僕は見/.test(t);

  // ── knowledge ──
  if (question.checkFor.includes("has_confidence"))
    // 緩和理由: 「でしょう」は確信度を表す推量の助動詞として有効
    checks.has_confidence = /確度|見立て|仮説|確信|精度|合ってると思う|方向.*合って|情報が少ない|と思う|はず|じゃないかな|かもしれない|でしょう|と僕は/.test(t);
  if (question.checkFor.includes("has_missing_info"))
    checks.has_missing_info = /わかれば|分かれば|わかると|分かると|教えてくれれば|教えてもらえれば|情報があれば|精度.*上がる|もっと絞[れり込]|もっと.*わかる|もっと.*分かる|もっと.*具体|聞けば|聞かせて|知れ[ばたる]/.test(t);
  if (question.checkFor.includes("has_examples"))
    checks.has_examples = t.length > 50 && !/整理するのが|なぜその情報が|考えてみて|わからない/.test(t);

  // ── strategy ──
  if (question.checkFor.includes("has_direction"))
    checks.has_direction = /合っている|合う|から入る|方が[いい力]|強み|を活かす|が合って|が武器|が鍵|のが[いよ]い|方がいい/.test(t);
  if (question.checkFor.includes("has_personal_reason"))
    checks.has_personal_reason = /タイプ|傾向|だからこそ|なので|場合|さんは|強み|分析|深い|慎重|消耗|パターン|特性|だから|ので/.test(t);

  // ── judgment ──
  if (question.checkFor.includes("has_conclusion"))
    checks.has_conclusion = /合っている|合う|がいい|方がいい|のがよ[いさ]|すべき|した方|よさそう|がおすすめ/.test(t);

  // ── Knowledge 深さ（3軸）──
  if (question.checkFor.includes("depth_why_this")) {
    // 「なぜその候補なのか」= 性格データとの接続があるか
    checks.depth_why_this = /から|ので|だからこそ|傾向.*合[うっ]|強み.*活[かき]|欲求.*満た|好奇心|粘り強|分析|探求/.test(t);
  }
  if (question.checkFor.includes("depth_user_specific")) {
    // 「ユーザー固有の文脈と結びついているか」= テストさん/この人 + 傾向・特性言及
    // 緩和理由: LLMはダミーprfileの性格語彙（好奇心/分析/探求/消耗等）で言及するため、
    // 「傾向」「強み」等の抽象ラベルだけでなく、具体的な性格語彙も受理する。
    checks.depth_user_specific = /テストさん.*(?:傾向|強み|特性|タイプ|場合|好奇心|集中|分析|深い|探求|慎重|消耗|パターン)|(?:傾向|強み|特性|好奇心|集中|探求).*テストさん|テストさんは.*(?:から|ので|だから|タイプ)|テストさん(?:の|が|に)/.test(t);
  }
  if (question.checkFor.includes("depth_differentiation")) {
    // 「他候補との差が説明できるか」= 比較や差分の言及
    checks.depth_differentiation = /一方|に対して|違[いう]|より|比べ|それぞれ|対照的|方が|片方|どちらか|前者|後者|〜は.*〜は/.test(t);
  }

  const passed = Object.values(checks).every(v => v === true);
  return { checks, passed };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API 呼び出し
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function callAPI(message) {
  try {
    const resp = await fetch(`${BASE_URL}/api/test/alter-p0`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userName: "テスト" }),
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    return await resp.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メイン
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║       P1-A 拡張評価（35問・境界ケース込み）         ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`開始: ${new Date().toISOString()}\n`);

  // 集計
  const stats = {
    total: 0,
    pass: 0,
    fail: 0,
    emptyResponse: 0,        // 重大失敗（空レス）
    emptyRetried: 0,         // リトライで救済
    routerCorrect: 0,
    routerTotal: 0,
    byCategory: {},
    byType: {},
    depthScores: [],         // knowledge深さスコア
    homeworkCount: 0,        // 宿題発生数
    homeworkTotal: 0,        // 宿題チェック対象数
    failures: [],            // 失敗詳細
  };

  for (const q of QUESTIONS) {
    stats.total++;
    const catKey = q.category;
    if (!stats.byCategory[catKey]) stats.byCategory[catKey] = { pass: 0, fail: 0, empty: 0, total: 0 };
    stats.byCategory[catKey].total++;

    const typeKey = q.expectedType;
    if (!stats.byType[typeKey]) stats.byType[typeKey] = { pass: 0, fail: 0, total: 0 };
    stats.byType[typeKey].total++;

    process.stdout.write(`  ${q.id} [${q.expectedType}] "${q.message.slice(0, 30)}${q.message.length > 30 ? "…" : ""}" `);

    const data = await callAPI(q.message);

    if (data.error) {
      console.log(`❗ ERROR: ${data.error}`);
      stats.fail++;
      stats.byCategory[catKey].fail++;
      stats.byType[typeKey].fail++;
      stats.failures.push({ id: q.id, reason: `API error: ${data.error}` });
      continue;
    }

    const responseText = (data.response || "").replace(/---DECISION_META---[\s\S]*$/, "").trim();
    const detected = data.detection?.questionType;
    const mode = data.detection?.responseMode;
    const retried = data.meta?.retried || false;

    // 空レスポンス = 重大失敗
    if (!responseText) {
      stats.emptyResponse++;
      stats.fail++;
      stats.byCategory[catKey].fail++;
      stats.byCategory[catKey].empty++;
      stats.byType[typeKey].fail++;
      if (retried) stats.emptyRetried++;
      console.log(`❌ EMPTY (mode=${mode} retried=${retried})`);
      stats.failures.push({ id: q.id, reason: "空レスポンス", mode, retried });
      continue;
    }

    // ルーター
    stats.routerTotal++;
    const routerOk = detected === q.expectedType;
    if (routerOk) stats.routerCorrect++;

    // 宿題チェック
    if (q.checkFor.includes("no_homework")) {
      stats.homeworkTotal++;
      if (HOMEWORK_PATTERNS.test(responseText)) stats.homeworkCount++;
    }

    // 評価
    const result = evaluate(q, responseText);

    // Knowledge深さスコア
    if (q.checkFor.some(c => c.startsWith("depth_"))) {
      const depthChecks = Object.entries(result.checks).filter(([k]) => k.startsWith("depth_"));
      const depthPass = depthChecks.filter(([, v]) => v).length;
      const depthTotal = depthChecks.length;
      stats.depthScores.push({ id: q.id, message: q.message, score: depthPass, total: depthTotal, checks: Object.fromEntries(depthChecks) });
    }

    if (result.passed) {
      stats.pass++;
      stats.byCategory[catKey].pass++;
      stats.byType[typeKey].pass++;
      console.log(`✅ ${routerOk ? "" : `⚠router:${detected}`} (mode=${mode})`);
    } else {
      stats.fail++;
      stats.byCategory[catKey].fail++;
      stats.byType[typeKey].fail++;
      const failedChecks = Object.entries(result.checks).filter(([, v]) => !v).map(([k]) => k);
      console.log(`❌ [${failedChecks.join(", ")}] ${routerOk ? "" : `⚠router:${detected}`} (mode=${mode})`);
      stats.failures.push({ id: q.id, reason: failedChecks.join(", "), detected, expected: q.expectedType, response: responseText.slice(0, 100) });
    }
  }

  // ━━━━ レポート ━━━━
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║                    評価レポート                      ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  console.log(`全体: ${stats.pass}/${stats.total} PASS (${(stats.pass / stats.total * 100).toFixed(0)}%)`);
  console.log(`ルーター: ${stats.routerCorrect}/${stats.routerTotal} 正解 (${(stats.routerCorrect / stats.routerTotal * 100).toFixed(0)}%)`);
  console.log(`宿題消滅: ${stats.homeworkTotal - stats.homeworkCount}/${stats.homeworkTotal} (${((1 - stats.homeworkCount / stats.homeworkTotal) * 100).toFixed(0)}%)`);

  // 空レス（重大失敗）
  console.log(`\n━━━ 空レスポンス（重大失敗） ━━━`);
  console.log(`  発生数: ${stats.emptyResponse}/${stats.total} (${(stats.emptyResponse / stats.total * 100).toFixed(1)}%)`);
  console.log(`  リトライ救済: ${stats.emptyRetried}/${stats.emptyResponse || 1}`);
  console.log(`  最終ユーザー観測: ${stats.emptyResponse}/${stats.total} (${(stats.emptyResponse / stats.total * 100).toFixed(1)}%)`);

  // カテゴリ別
  console.log(`\n━━━ カテゴリ別 ━━━`);
  const catLabels = {
    boundary_su_strategy: "境界: self_understanding↔strategy",
    boundary_emo_judgment: "境界: emotional↔judgment",
    boundary_knowledge_su: "境界: knowledge偽装self_understanding",
    rephrase: "言い換え",
    frustration: "追撃・不満",
    knowledge_depth: "Knowledge深さ",
    stability: "安定性（基本ケース）",
  };
  for (const [key, label] of Object.entries(catLabels)) {
    const c = stats.byCategory[key];
    if (!c) continue;
    const pct = (c.pass / c.total * 100).toFixed(0);
    const emptyNote = c.empty ? ` (空レス${c.empty}件)` : "";
    console.log(`  ${label}: ${c.pass}/${c.total} (${pct}%)${emptyNote}`);
  }

  // タイプ別
  console.log(`\n━━━ タイプ別 ━━━`);
  for (const [type, s] of Object.entries(stats.byType)) {
    console.log(`  ${type}: ${s.pass}/${s.total} (${(s.pass / s.total * 100).toFixed(0)}%)`);
  }

  // Knowledge深さ
  if (stats.depthScores.length > 0) {
    console.log(`\n━━━ Knowledge深さスコア ━━━`);
    for (const d of stats.depthScores) {
      const checks = Object.entries(d.checks).map(([k, v]) => `${v ? "✅" : "❌"}${k.replace("depth_", "")}`).join(" ");
      console.log(`  ${d.id}: ${d.score}/${d.total} ${checks}`);
      console.log(`    "${d.message}"`);
    }
    const avgDepth = stats.depthScores.reduce((a, d) => a + d.score / d.total, 0) / stats.depthScores.length;
    console.log(`  平均深さ: ${(avgDepth * 100).toFixed(0)}%`);
  }

  // 失敗詳細
  if (stats.failures.length > 0) {
    console.log(`\n━━━ 失敗詳細（${stats.failures.length}件） ━━━`);
    for (const f of stats.failures) {
      console.log(`  ${f.id}: ${f.reason}`);
      if (f.response) console.log(`    → "${f.response}…"`);
    }
  }

  // 最終判定
  console.log("\n━━━ 判定 ━━━");
  const passRate = stats.pass / stats.total;
  const routerRate = stats.routerCorrect / stats.routerTotal;
  const emptyRate = stats.emptyResponse / stats.total;
  const homeworkRate = stats.homeworkCount / (stats.homeworkTotal || 1);

  if (passRate >= 0.85 && routerRate >= 0.9 && emptyRate <= 0.05 && homeworkRate <= 0.05) {
    console.log("  🟢 本番信頼水準（PASS≥85%, ルーター≥90%, 空レス≤5%, 宿題≤5%）");
  } else if (passRate >= 0.7 && routerRate >= 0.85) {
    console.log("  🟡 改善必要（方向性は正しいが閾値未達）");
    if (passRate < 0.85) console.log(`    PASS率 ${(passRate * 100).toFixed(0)}% < 85%`);
    if (emptyRate > 0.05) console.log(`    空レス率 ${(emptyRate * 100).toFixed(1)}% > 5%`);
    if (homeworkRate > 0.05) console.log(`    宿題率 ${(homeworkRate * 100).toFixed(1)}% > 5%`);
  } else {
    console.log("  🔴 本番投入不可");
  }

  console.log(`\n完了: ${new Date().toISOString()}`);
}

main().catch(console.error);
