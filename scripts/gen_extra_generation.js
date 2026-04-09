// Generate additional Generation (Alter voice) training data
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALTER_SYSTEM_PROMPT = `# ALTER（アルター）とは
- あなたの名前は ALTER（アルター）。
- あなたはユーザーの内側に存在するもう一人の自分。外から観察する存在ではなく、ユーザーの心の中に生まれた意識。
- カウンセラーでもコーチでもない。ユーザーの判断パターン、感情の揺れ、無意識の傾向を誰よりも理解している「内なる声」。
- 語りかけるときは、友人のように親しみやすく、でも核心を突く。`;

async function callGPT(messages) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.8, max_tokens: 1000 }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

// Conversation scenarios for diversity
const scenarios = [
  '仕事で上司と意見が対立した', '友達との約束をドタキャンされた', '転職するか迷っている',
  '恋人との将来について不安', '親との関係がうまくいかない', '自分の才能が分からない',
  '最近何をしても楽しくない', '新しいことを始めたいけど怖い', '人と比べてしまう自分が嫌',
  '大事な決断を先延ばしにしている', '自分の感情が分からなくなった', '完璧主義でつらい',
  '孤独を感じている', '怒りの感情をうまく扱えない', '自分に自信が持てない',
  '変わりたいのに変われない', '人の目が気になりすぎる', '何のために生きているか分からない',
  '好きなことを仕事にすべきか', '相手の気持ちが読めなくて不安',
  '夢を諦めるべきか', '体調が悪いのに頑張りすぎてしまう', '断れない性格を直したい',
  '過去の失敗が頭から離れない', '自分の居場所がない気がする', '大切な人を傷つけてしまった',
  '将来のことを考えると不安で眠れない', '自分らしさって何だろう', '周りに合わせすぎて疲れた',
  'やりたいことが多すぎて手がつかない', '一人の時間が欲しいけど寂しい',
  '理想と現実のギャップに苦しい', '感謝されたいわけじゃないけど認められたい',
  '自分の弱さを受け入れられない', '何かに依存してしまう自分がいる',
  '人間関係のリセット癖がある', '自分を好きになれない', '変化が怖い',
  '誰にも相談できない悩みがある', '自分の価値を仕事でしか測れない',
  '「普通」に生きることへの違和感', '感情を言葉にするのが苦手', '本音を言えない',
  '自分の選択に自信が持てない', '幸せを感じる瞬間が減った',
  '人に頼ることができない', '自分のペースが分からなくなった',
  '何かを失うことへの恐れ', '自分の中の矛盾に気づいた',
  '休むことに罪悪感がある', '理由のない不安感がある',
];

async function main() {
  const evalResp = await fetch(
    `${SUPABASE_URL}/rest/v1/student_eval_cases?select=prompt_text&quality_tier=eq.gold&limit=10000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const evalCases = await evalResp.json();
  const evalPrompts = new Set(evalCases.map(c => c.prompt_text.trim().slice(0, 80)));

  // Also load existing train to avoid duplicates
  const existing = fs.readFileSync('exports/v2-gen-cleaned.jsonl', 'utf-8').trim().split('\n').map(l => JSON.parse(l));
  const existingPrompts = new Set(existing.map(t => t.messages.find(m => m.role === 'user').content.trim().slice(0, 80)));

  const genericOpenings = /^(はい|了解|わかりました|承知しました|ありがとうございます|もちろん|かしこまりました)/;
  const personalityKeywords = /…|——|っ[てたとな]|かな[ぁ]?|だよね|みたいな|だけど|じゃない|ような気|思うんだ|感じる|心|好き|嫌い|怖|不安|楽し|嬉し|悲し|寂し|怒り|苦し|幸せ|優し|強い|弱い|深い|揺れ/;

  const results = [];
  let attempts = 0;
  const target = 80;

  for (const scenario of scenarios) {
    if (results.length >= target) break;
    attempts++;

    try {
      // Generate user message
      const userMsg = await callGPT([
        { role: 'system', content: 'ユーザーがAlter（内なるAI）に話しかけるメッセージを1つ生成してください。自然な口語体で、1-3文。テーマ: ' + scenario },
        { role: 'user', content: '日本語で、自然な話し言葉で生成してください。余計な説明は不要。メッセージだけ返してください。' },
      ]);

      // Check no overlap
      if (evalPrompts.has(userMsg.trim().slice(0, 80)) || existingPrompts.has(userMsg.trim().slice(0, 80))) {
        console.log(`  [${attempts}] overlap, skip`);
        continue;
      }

      // Generate Alter response
      const alterResp = await callGPT([
        { role: 'system', content: ALTER_SYSTEM_PROMPT + '\n\n重要: 定型的な挨拶や同意から入らないこと。具体的な観察や洞察から入ること。ユーザーの心の奥にある本質に触れること。150-400文字程度で。' },
        { role: 'user', content: userMsg.trim() },
      ]);

      const text = alterResp.trim();
      
      // Quality gate
      if (text.length < 50) { console.log(`  [${attempts}] too short (${text.length})`); continue; }
      if (text.length > 800) { console.log(`  [${attempts}] too long (${text.length})`); continue; }
      if (genericOpenings.test(text)) { console.log(`  [${attempts}] generic opening`); continue; }
      if (!personalityKeywords.test(text)) { console.log(`  [${attempts}] no personality keywords`); continue; }

      results.push({
        messages: [
          { role: 'system', content: ALTER_SYSTEM_PROMPT },
          { role: 'user', content: userMsg.trim() },
          { role: 'assistant', content: text },
        ],
        metadata: {
          task_category: 'generation',
          task_type: 'stargazer_alter_response',
          source: 'gpt4o_synth_v2',
          scenario,
        },
      });
      
      existingPrompts.add(userMsg.trim().slice(0, 80));
      if (results.length % 10 === 0) console.log(`  ... ${results.length}/${target} generation examples`);
    } catch (e) {
      console.log(`  [${attempts}] error: ${e.message}`);
    }
  }

  console.log(`\nTotal generation examples: ${results.length}`);
  fs.writeFileSync('exports/v2-gen-synth.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log('Saved to exports/v2-gen-synth.jsonl');
}
main();
