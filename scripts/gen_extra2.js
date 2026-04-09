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
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.9, max_tokens: 1000 }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

const scenarios2 = [
  '自分の意見を押し通したあとに罪悪感がある', '何度も同じ失敗を繰り返してしまう',
  '他人の成功を素直に喜べない自分がいる', '家族のためと言いながら自分を犠牲にしている',
  '自分の本当の感情が分からなくなった', '新しい環境に飛び込む勇気が出ない',
  '信頼していた人に裏切られた気がする', '自分の中の矛盾した二つの気持ち',
  '「あの時ああしていれば」という後悔が消えない', '自分の存在意義を感じられない瞬間がある',
  '努力が報われない虚しさ', '誰かに必要とされたいという気持ち',
  '自分だけ取り残されている感覚', '完璧じゃなくても大丈夫と思えない',
  '本当はもっと自由に生きたい', '人に甘えるのが怖い',
  '自分の気持ちを言葉にできないもどかしさ', '何かを選ぶことへの恐れ',
  '「自分らしさ」を見失った感覚', '誰にも見せていない本当の自分がいる',
  '期待に応えようとして疲れてしまう', '自分のペースで生きることへの罪悪感',
  '大切にしたいのに距離を取ってしまう', '変わりたいけど変わることが怖い',
  '自分の弱さを認めたくない', '「頑張れ」と言われるのがつらい',
  '自分の中の怒りをどう扱えばいいか分からない', '一歩踏み出せない自分への苛立ち',
  '自分を守るために嘘をついてしまった', '誰かと深くつながりたいけど怖い',
];

async function main() {
  const evalResp = await fetch(
    `${SUPABASE_URL}/rest/v1/student_eval_cases?select=prompt_text&quality_tier=eq.gold&limit=10000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const evalCases = await evalResp.json();
  const evalPrompts = new Set(evalCases.map(c => c.prompt_text.trim().slice(0, 80)));

  const existing1 = fs.readFileSync('exports/v2-gen-cleaned.jsonl', 'utf-8').trim().split('\n').map(l => JSON.parse(l));
  const existing2 = fs.readFileSync('exports/v2-gen-synth.jsonl', 'utf-8').trim().split('\n').map(l => JSON.parse(l));
  const existingPrompts = new Set([...existing1, ...existing2].map(t => t.messages.find(m => m.role === 'user').content.trim().slice(0, 80)));

  const genericOpenings = /^(はい|了解|わかりました|承知しました|ありがとうございます|もちろん|かしこまりました)/;
  const personalityKeywords = /…|——|っ[てたとな]|かな[ぁ]?|だよね|みたいな|だけど|じゃない|ような気|思うんだ|感じる|心|好き|嫌い|怖|不安|楽し|嬉し|悲し|寂し|怒り|苦し|幸せ|優し|強い|弱い|深い|揺れ/;

  const results = [];
  const target = 30;

  for (const scenario of scenarios2) {
    if (results.length >= target) break;
    try {
      const userMsg = await callGPT([
        { role: 'system', content: 'ユーザーがAlter（内なるAI）に話しかけるメッセージを1つ生成。自然な口語体で1-3文。テーマ: ' + scenario },
        { role: 'user', content: 'メッセージだけ返してください。' },
      ]);

      if (evalPrompts.has(userMsg.trim().slice(0, 80)) || existingPrompts.has(userMsg.trim().slice(0, 80))) continue;

      const alterResp = await callGPT([
        { role: 'system', content: ALTER_SYSTEM_PROMPT + '\n\n重要: 定型的な挨拶や同意から入らない。具体的な観察や洞察から入る。ユーザーの心の奥にある本質に触れる。150-400文字程度で。' },
        { role: 'user', content: userMsg.trim() },
      ]);

      const text = alterResp.trim();
      if (text.length < 50 || text.length > 800) continue;
      if (genericOpenings.test(text)) continue;
      if (!personalityKeywords.test(text)) continue;

      results.push({
        messages: [
          { role: 'system', content: ALTER_SYSTEM_PROMPT },
          { role: 'user', content: userMsg.trim() },
          { role: 'assistant', content: text },
        ],
        metadata: { task_category: 'generation', task_type: 'stargazer_alter_response', source: 'gpt4o_synth_v2_batch2' },
      });
      existingPrompts.add(userMsg.trim().slice(0, 80));
      if (results.length % 10 === 0) console.log(`  ... ${results.length}/${target}`);
    } catch (e) { console.log('error:', e.message); }
  }

  console.log(`Total batch2: ${results.length}`);
  fs.writeFileSync('exports/v2-gen-synth-batch2.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
}
main();
