/**
 * P1-C リアクション分類器の精度検証（30例）
 *
 * 分類ラベル: agree / disagree(strong|weak) / deepen / redirect(correction|topic_change) / null
 * 高精度優先: 曖昧なものは null に倒す設計。false positive が低いことを重視。
 */

// ── テストケース（30例） ──
const CASES = [
  // ── agree（6例）──
  { id: "AG1", message: "そうそう", lastAlter: "テストさんは分析的な...", expected: "agree", label: "明確な同意" },
  { id: "AG2", message: "まさにそれ", lastAlter: "テストさんは...", expected: "agree", label: "強い同意" },
  { id: "AG3", message: "当たってる", lastAlter: "テストさんは...", expected: "agree", label: "仮説承認" },
  { id: "AG4", message: "うん、そうなんだよ", lastAlter: "テストさんは...", expected: "agree", label: "接頭辞付き同意" },
  { id: "AG5", message: "めっちゃわかる", lastAlter: "テストさんは...", expected: "agree", label: "共感同意" },
  { id: "AG6", message: "それな", lastAlter: "テストさんは...", expected: "agree", label: "カジュアル同意" },

  // ── disagree strong（5例）──
  { id: "DS1", message: "違う", lastAlter: "テストさんは...", expected: "disagree:strong", label: "端的な否定" },
  { id: "DS2", message: "全然違うよ", lastAlter: "テストさんは...", expected: "disagree:strong", label: "強い否定" },
  { id: "DS3", message: "いや、そうじゃない", lastAlter: "テストさんは...", expected: "disagree:strong", label: "前置き+否定" },
  { id: "DS4", message: "それは違うと思う", lastAlter: "テストさんは...", expected: "disagree:strong", label: "丁寧な否定" },
  { id: "DS5", message: "違うって", lastAlter: "テストさんは...", expected: "disagree:strong", label: "強調否定" },

  // ── disagree weak（4例）──
  { id: "DW1", message: "ピンとこない", lastAlter: "テストさんは...", expected: "disagree:weak", label: "やんわり否定" },
  { id: "DW2", message: "ちょっと違うかも", lastAlter: "テストさんは...", expected: "disagree:weak", label: "婉曲否定" },
  { id: "DW3", message: "うーん、そうかな", lastAlter: "テストさんは...", expected: "disagree:weak", label: "迷い否定" },
  { id: "DW4", message: "しっくりこない", lastAlter: "テストさんは...", expected: "disagree:weak", label: "不一致感" },

  // ── deepen（4例）──
  { id: "DE1", message: "もっと詳しく教えて", lastAlter: "テストさんは...", expected: "deepen", label: "詳細要求" },
  { id: "DE2", message: "具体的には？", lastAlter: "テストさんは...", expected: "deepen", label: "具体化要求" },
  { id: "DE3", message: "例えば？", lastAlter: "テストさんは...", expected: "deepen", label: "例示要求" },
  { id: "DE4", message: "他には？", lastAlter: "テストさんは...", expected: "deepen", label: "追加要求" },

  // ── redirect correction（3例）──
  { id: "RC1", message: "そうじゃなくて、仕事の話なんだけど", lastAlter: "テストさんは...", expected: "redirect:correction", label: "方向修正" },
  { id: "RC2", message: "いや、聞きたいのはそこじゃない", lastAlter: "テストさんは...", expected: "redirect:correction", label: "焦点修正" },
  { id: "RC3", message: "ポイントはそこじゃないんだけど", lastAlter: "テストさんは...", expected: "redirect:correction", label: "論点修正" },

  // ── redirect topic_change（2例）──
  { id: "RT1", message: "話変わるけど、最近元気？", lastAlter: "テストさんは...", expected: "redirect:topic_change", label: "話題転換" },
  { id: "RT2", message: "ところで別の相談があるんだけど", lastAlter: "テストさんは...", expected: "redirect:topic_change", label: "別話題" },

  // ── null（false positive 防止: 6例）──
  { id: "NL1", message: "なるほど", lastAlter: "テストさんは...", expected: "null", label: "中立相づち→nullが正しい" },
  { id: "NL2", message: "ふーん", lastAlter: "テストさんは...", expected: "null", label: "中立反応→null" },
  { id: "NL3", message: "すごいね", lastAlter: "テストさんは...", expected: "null", label: "賞賛→null" },
  { id: "NL4", message: "わかった、ありがとう", lastAlter: "テストさんは...", expected: "null", label: "了承→null" },
  { id: "NL5", message: "転職したいんだけど向いてる仕事ある？", lastAlter: "テストさんは...", expected: "null", label: "新規質問→null" },
  { id: "NL6", message: "俺って何が向いてるんだろう", lastAlter: null, expected: "null", label: "初回発話→null" },
];

// ── 動的 import（ESM + TypeScript） ──
async function loadClassifier() {
  // tsx or ts-node で直接 import できない場合に備え、
  // alterHomeAdapter の classifyReaction をテスト
  // → Next.js のランタイムに依存するため、パターンだけ抽出してテスト

  // classifyReaction のロジックを直接埋め込み（本体と同期を保つこと）
  // NOTE: 本来は import するが、ESM/CJS 混在環境では直接テストの方が確実

  function classifyReaction(message, lastAlterContent) {
    if (!lastAlterContent) return null;
    const trimmed = message.trim();
    if (!trimmed) return null;

    // agree
    if (trimmed.length <= 30) {
      if (/^(?:そうそう|まさに(?:それ|そう)?|それそれ|それだ|当たってる|合ってる|その通り|ほんとそう|ほんとにそう|そうなんだよ|そうなの|それな)[。！!]?$/.test(trimmed))
        return { type: "agree", confidence: 0.95 };
      if (/^(?:そう|うん|ああ|はい)[、。！!]?(?:そう(?:なんだ|だね|だよね|です)|まさに|それ|当たって|合って)/.test(trimmed))
        return { type: "agree", confidence: 0.9 };
      if (/^(?:めっちゃ|超|すごい?)?わかる[！!。]?$/.test(trimmed))
        return { type: "agree", confidence: 0.85 };
    }

    // disagree strong
    if (/^(?:違う|ちがう|違います|全然違う|違うよ|違うって|いやいや|ないない|ありえない|絶対違う)[。！!]?$/.test(trimmed))
      return { type: "disagree", disagree_strength: "strong", confidence: 0.95 };
    if (trimmed.length <= 40 && /^(?:いや|うーん)?[、\s]*(?:そうじゃない|そういうことじゃない|それは違う|全然ピンとこない|全く違う)/.test(trimmed))
      return { type: "disagree", disagree_strength: "strong", confidence: 0.9 };
    if (trimmed.length <= 30 && /違[うくい](?:よ|って|から|けど|んだ)/.test(trimmed))
      return { type: "disagree", disagree_strength: "strong", confidence: 0.85 };

    // disagree weak
    if (trimmed.length <= 40) {
      if (/ピンとこない|しっくりこない|しっくり来ない|微妙|ちょっと違う(?:かも)?|そうかなぁ?|うーん(?:、)?(?:そうかな|どうだろう|どうかな)|自分的にはちょっと/.test(trimmed))
        return { type: "disagree", disagree_strength: "weak", confidence: 0.8 };
    }

    // deepen
    if (/^(?:もっと(?:詳しく|教えて|知りたい|聞かせて)|具体的に(?:は|教えて|言うと)?|例えば[？?]?|どういうこと[？?]|どういう意味[？?]|もう少し(?:教えて|詳しく|聞かせて))/.test(trimmed))
      return { type: "deepen", confidence: 0.9 };
    if (/^(?:他には[？?]?|他にある[？?]?|続き(?:は|を)?[？?]?|それで[？?]|で[？?])[。！!]?$/.test(trimmed))
      return { type: "deepen", confidence: 0.85 };

    // redirect correction
    if (/^(?:いや[、\s]*)?(?:そうじゃなくて|そういうことじゃなくて|聞きたいのは|知りたいのは|言いたいのは|そうじゃなく)/.test(trimmed))
      return { type: "redirect", redirect_subtype: "correction", confidence: 0.9 };
    if (/^(?:いや[、\s]*)?(?:そういう(?:意味|話)じゃなく|そこじゃなくて|ポイントはそこじゃない|論点が違|そこが聞きたいんじゃない)/.test(trimmed))
      return { type: "redirect", redirect_subtype: "correction", confidence: 0.85 };

    // redirect topic_change
    if (/^(?:話変わるけど|ところで|別の話|それはいいとして|それは置いといて|あ、そうだ|ちなみに|全然関係ない(?:けど|んだけど))/.test(trimmed))
      return { type: "redirect", redirect_subtype: "topic_change", confidence: 0.9 };

    return null;
  }

  return classifyReaction;
}

// ── テスト実行 ──
function formatExpected(expected) {
  if (expected === "null") return null;
  if (expected === "agree") return { type: "agree" };
  if (expected === "deepen") return { type: "deepen" };
  if (expected.startsWith("disagree:")) return { type: "disagree", disagree_strength: expected.split(":")[1] };
  if (expected.startsWith("redirect:")) return { type: "redirect", redirect_subtype: expected.split(":")[1] };
  return null;
}

function matchResult(actual, expected) {
  const exp = formatExpected(expected);
  if (exp === null) return actual === null;
  if (actual === null) return false;
  if (actual.type !== exp.type) return false;
  if (exp.disagree_strength && actual.disagree_strength !== exp.disagree_strength) return false;
  if (exp.redirect_subtype && actual.redirect_subtype !== exp.redirect_subtype) return false;
  return true;
}

async function main() {
  const classifyReaction = await loadClassifier();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     P1-C リアクション分類器 精度検証（30例）         ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  let pass = 0;
  let fail = 0;
  const failures = [];
  const byCategory = {};

  for (const c of CASES) {
    const result = classifyReaction(c.message, c.lastAlter);
    const ok = matchResult(result, c.expected);

    const cat = c.expected === "null" ? "null" : c.expected.split(":")[0];
    if (!byCategory[cat]) byCategory[cat] = { pass: 0, fail: 0, total: 0 };
    byCategory[cat].total++;

    if (ok) {
      pass++;
      byCategory[cat].pass++;
      console.log(`  ✅ ${c.id} [${c.expected}] "${c.message}" — ${c.label}`);
    } else {
      fail++;
      byCategory[cat].fail++;
      const actual = result ? `${result.type}${result.disagree_strength ? ":" + result.disagree_strength : ""}${result.redirect_subtype ? ":" + result.redirect_subtype : ""}` : "null";
      console.log(`  ❌ ${c.id} [expected=${c.expected} actual=${actual}] "${c.message}" — ${c.label}`);
      failures.push({ id: c.id, expected: c.expected, actual, message: c.message });
    }
  }

  console.log("\n━━━ カテゴリ別 ━━━");
  for (const [cat, s] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${s.pass}/${s.total} (${(s.pass / s.total * 100).toFixed(0)}%)`);
  }

  console.log(`\n全体: ${pass}/${CASES.length} (${(pass / CASES.length * 100).toFixed(0)}%)`);

  if (failures.length > 0) {
    console.log(`\n━━━ 失敗詳細（${failures.length}件） ━━━`);
    for (const f of failures) {
      console.log(`  ${f.id}: expected=${f.expected} actual=${f.actual} "${f.message}"`);
    }
  }

  const rate = pass / CASES.length;
  if (rate >= 0.9) {
    console.log("\n🟢 高精度（≥90%）— P1-D接続可");
  } else if (rate >= 0.8) {
    console.log("\n🟡 改善必要（80-90%）");
  } else {
    console.log("\n🔴 精度不足（<80%）");
  }
}

main().catch(console.error);
