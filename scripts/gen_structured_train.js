// Generate Structured training data using gpt-4o-mini
// These must NOT overlap with eval hold-out 198 cases
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function callGPT(messages, json_mode = false) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      ...(json_mode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

async function main() {
  // Load eval hold-out prompts to avoid
  const evalResp = await fetch(
    `${SUPABASE_URL}/rest/v1/student_eval_cases?select=id,task_type,prompt_text,system_prompt,gold_response&quality_tier=eq.gold&limit=10000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const evalCases = await evalResp.json();
  const evalPrompts = new Set(evalCases.map(c => c.prompt_text.trim().slice(0, 100)));

  // Structured task templates
  const structuredTasks = [
    {
      task_type: 'stargazer_alter_utterance_reading',
      count: 20,
      genPrompt: `Generate a unique Alter utterance_reading task. This is a Stargazer deep observation system.
The system prompt tells the AI to analyze a user's response to a psychological question.
The user message contains the question asked and the user's answer.
The AI must return JSON with fields like: {"reading": "...", "emotional_signature": "...", "hidden_pattern": "..."}.

Generate a UNIQUE psychological question (in Japanese), a realistic user response (in Japanese),
and the expected structured JSON output. The question should probe deep personality traits,
decision patterns, or emotional tendencies.

Return JSON: {"system_prompt": "...", "user_prompt": "...", "gold_response": "..."}
The gold_response must be valid JSON as a string (not nested object).
All content in Japanese.`,
    },
    {
      task_type: 'stargazer_ai_prediction',
      count: 10,
      genPrompt: `Generate a unique Stargazer AI prediction task. 
The system tells the AI to predict user behavior based on personality axes scores.
The user message contains personality data and context.
The AI returns JSON with: {"prediction": "...", "triggerScenario": "...", "confidence": 0.X}.

Generate a UNIQUE scenario with personality axes data and context.
Return JSON: {"system_prompt": "...", "user_prompt": "...", "gold_response": "..."}
The gold_response must be valid JSON as a string. All in Japanese.`,
    },
    {
      task_type: 'stargazer_question_generation',
      count: 10,
      genPrompt: `Generate a unique Stargazer question generation task.
The system tells AI to create a deep psychological question based on user profile.
The user message contains partial personality profile data.
The AI returns JSON with: {"robotLine": "...", "choices": [...], "axis": "...", "depth": N}.

Generate a UNIQUE profile context and expected question output.
Return JSON: {"system_prompt": "...", "user_prompt": "...", "gold_response": "..."}
The gold_response must be valid JSON as a string. All in Japanese.`,
    },
    {
      task_type: 'stargazer_observation_analysis',
      count: 10,
      genPrompt: `Generate a unique Stargazer observation analysis task.
The system tells AI to analyze a user's response pattern for hidden psychological signals.
The user message contains a series of question-answer pairs.
The AI returns JSON: {"analysis": "...", "detected_patterns": [...], "confidence_axes": {...}}.

Generate a UNIQUE set of Q&A data and expected analysis.
Return JSON: {"system_prompt": "...", "user_prompt": "...", "gold_response": "..."}
The gold_response must be valid JSON as a string. All in Japanese.`,
    },
    {
      task_type: 'stargazer_adaptive_q2',
      count: 10,
      genPrompt: `Generate a unique Stargazer adaptive follow-up question task.
Based on a user's previous answer, generate a deeper follow-up question.
The AI returns JSON: {"followUp": "...", "targetAxis": "...", "rationale": "..."}.

Generate a UNIQUE initial Q&A and expected adaptive follow-up.
Return JSON: {"system_prompt": "...", "user_prompt": "...", "gold_response": "..."}
The gold_response must be valid JSON as a string. All in Japanese.`,
    },
  ];

  const results = [];
  let total = 0;

  for (const task of structuredTasks) {
    console.log(`Generating ${task.count} x ${task.task_type}...`);
    
    for (let i = 0; i < task.count; i++) {
      try {
        const raw = await callGPT([
          { role: 'system', content: 'You are a training data generator for Aneurasync Stargazer, a deep personality observation AI. Generate high-quality, unique examples. Always return valid JSON.' },
          { role: 'user', content: task.genPrompt + `\n\nThis is example ${i + 1}/${task.count}. Make it unique and different from others.` },
        ], true);

        const parsed = JSON.parse(raw);
        
        // Verify gold_response is valid JSON
        let goldJson;
        try {
          goldJson = JSON.parse(parsed.gold_response);
        } catch {
          console.log(`  [${i}] gold_response not valid JSON, skip`);
          continue;
        }

        // Check not in eval hold-out
        const promptSnippet = (parsed.user_prompt || '').trim().slice(0, 100);
        if (evalPrompts.has(promptSnippet)) {
          console.log(`  [${i}] overlaps with eval, skip`);
          continue;
        }

        results.push({
          messages: [
            { role: 'system', content: parsed.system_prompt + '\n\nYou must return exactly one valid JSON value. Return JSON only. Do not use markdown fences.' },
            { role: 'user', content: parsed.user_prompt },
            { role: 'assistant', content: parsed.gold_response },
          ],
          metadata: {
            task_category: 'structured',
            task_type: task.task_type,
            source: 'gpt4o_synth_v2',
          },
        });
        total++;
        if (total % 10 === 0) console.log(`  ... ${total} structured examples generated`);
      } catch (e) {
        console.log(`  [${i}] error: ${e.message}`);
      }
    }
  }

  console.log(`\nTotal structured examples: ${results.length}`);
  fs.writeFileSync('exports/v2-structured-synth.jsonl', results.map(r => JSON.stringify(r)).join('\n'));
  console.log('Saved to exports/v2-structured-synth.jsonl');
}
main();
