# Alter Episodic Recall — Phase 1 技術設計

> **ステータス**: CEO議論済み・方針確定（実装禁止）  
> **作成**: 2026-04-16  
> **更新**: 2026-04-16（CEO + GPT + Claude 三者議論反映）  
> **北極星**: 「記憶量ではなく、想起の選択性が本質」（CEO方針）

---

## 1. 問題定義

### ユーザーが期待するもの
```
ユーザー: 「昨日何話したっけ？」
Alter:    「昨日は転職のことで悩んでたね。結論は "まず情報収集から" で、
           次に年収の相場を調べようって話になってた」
```

### 現状のAlterが返すもの
```
ユーザー: 「昨日何話したっけ？」
Alter:    「ごめん、前の会話の内容は正確に思い出せないんだ。
           でもたいしさんは論理的で実用性を重視する傾向があるから…」
           → 性格モデルの一般論にフォールバック
```

### ギャップの根本原因

Alterの記憶は **意味記憶（この人はどういう人か）が強く、エピソード記憶（いつ何を話したか）が弱い**。

| 記憶層 | 保存 | cross-session ロード | 状態 |
|---|---|---|---|
| 性格軸スコア（50+軸） | ✅ | ✅ | 🟢 稼働中 |
| セッションサマリ（themes, hooks等） | ✅ | ✅ 最新20件 | 🟢 稼働中 |
| Life Context（人物・環境・生活段階） | ✅ | ✅ | 🟢 稼働中 |
| ナラティブ（「俺は〜なタイプ」） | ✅ | ✅ | 🟢 稼働中 |
| 仮説（recurring_pattern等） | ✅ | ✅ | 🟢 稼働中 |
| **生対話ログ**（alter_dialogues） | ✅ | **❌ 現セッションのみ** | 🔴 **ここがギャップ** |

`stargazer_alter_dialogues` に全対話が保存されているが、ロードは `WHERE session_id = 現在のセッション` でフィルタされている。cross-session の生ログは一切参照していない。

---

## 2. 現在のDBスキーマ

### stargazer_alter_dialogues（生ログ）
```sql
id UUID, user_id UUID, session_id UUID,
role TEXT ('alter'|'user'|'system'),
message TEXT,
alter_mode TEXT ('warm'|'provocative'|'analytical'),
insight TEXT,
emotional_context JSONB,    -- response_mode, domain, shape, thin_slice 等
turn_number INT,
created_at TIMESTAMPTZ
```
- Index: `(user_id, session_id, created_at)`
- **全発話が保存済み** — データは既にある

### stargazer_alter_session_summaries（セッション要約）
```sql
id UUID, user_id UUID, session_id TEXT,
summary_date DATE,
key_themes TEXT[],           -- 「転職」「自己効力感」等
contradictions_discovered TEXT[],
user_admissions TEXT[],
resistance_points TEXT[],
emotional_arc TEXT,          -- 「guarded → open → reflective」
deepest_moment TEXT,
follow_up_hooks TEXT[],      -- 「次は年収の相場を調べてみよう」
raw_message_count INT,
created_at TIMESTAMPTZ
```
- Index: `(user_id, summary_date DESC)`, UNIQUE `(user_id, session_id)`
- 最新20件がロード済み → **Phase 1 の主要データソース**

---

## 3. Phase 1 設計

### 3.1 設計原則（CEO承認済み）

1. **UIは1本** — 新しい画面やチャット一覧は作らない
2. **内部ではエピソード分離** — session_id 単位で検索可能
3. **想起は条件付き** — シグナル検出時のみ。毎回全ロードしない
4. **まずは要約想起** — 全文復元は目指さない。何の話/結論/残論点で十分

### 3.2 全体フロー

```
ユーザー入力
  │
  ├─ [Signal Detection] 過去参照シグナルを検出
  │   「昨日」「前に」「あの話」「この前」「さっき」等
  │
  ├─ 検出あり → [Episodic Recall]
  │   │
  │   ├─ Step 1: session_summaries から候補セッションを検索
  │   │   → key_themes + summary_date でマッチング
  │   │
  │   ├─ Step 2: 最も関連性の高いセッションを選択（最大3件）
  │   │
  │   ├─ Step 3: 必要なら alter_dialogues から核心部分を引用
  │   │   → 全文ロードではなく、ターン数制限付きで重要箇所のみ
  │   │
  │   └─ Step 4: 想起ブロックを Alter プロンプトに注入
  │       → 「前回の会話で…」形式で自然に語れるようにする
  │
  └─ 検出なし → 通常フロー（変更なし）
```

### 3.3 Signal Detection（想起シグナル検出）

**独立関数として設計**。Phase 1 は regex only だが、将来 utterance reading 統合に差し替え可能な
インターフェースにする。

```typescript
/**
 * エピソード想起シグナルの検出。
 * Phase 1: regex only（LLMコール0、~1ms）
 * 将来: utterance reading の intent を補助入力に追加可能
 */
export function detectEpisodicRecallSignal(
  message: string,
  /** 将来拡張: utterance reading の intent を受け取る口 */
  utteranceIntent?: string,
): RecallSignal {
  // ── Phase 1: regex only ──
  const PATTERNS = {
    temporal: /昨日|一昨日|おととい|前回|この前|さっき|先週|先月|前に|以前|あの(時|とき)/,
    topic_ref: /あの(話|件|こと)|その(話|件|こと|続き)|何(話した|の話)|覚えて(る|いる)|思い出/,
    continuation: /続き|途中だった|あれ(から|って)|どうなった/,
  };

  for (const [type, pattern] of Object.entries(PATTERNS)) {
    if (pattern.test(message)) {
      return {
        detected: true,
        type: type as RecallSignal['type'],
        timeHint: extractTimeHint(message),
        topicHint: extractTopicHint(message),
        personHint: extractPersonHint(message),  // 追加: 人物名検出
      };
    }
  }
  return { detected: false, type: 'temporal' };
}

type RecallSignal = {
  detected: boolean;
  type: 'temporal' | 'topic_ref' | 'continuation';
  timeHint?: 'yesterday' | 'last_week' | 'recent' | 'unspecified';
  topicHint?: string;    // 「あの仕事の話」→ "仕事"
  personHint?: string;   // 「田中さんの話」→ "田中"
};
```

**設計判断（Q1 確定）**: regex only。utteranceIntent パラメータは `?` で将来用に予約するのみ。

### 3.4 Retrieval Strategy（検索戦略）

Phase 1 は **2段階検索 × 2想起モード**:

| モード | トリガー例 | データソース | 返す粒度 |
|---|---|---|---|
| **要約想起** | 「昨日何話した？」「前回のテーマは？」 | session_summaries のみ | テーマ・結論・残論点 |
| **具体想起** | 「俺なんて言ったっけ？」「あの時の言葉」 | summaries + dialogues | 実際の発言引用 |

#### Stage 1: 要約想起（セッションサマリ検索）

```typescript
async function findRelevantSessions(
  userId: string,
  signal: RecallSignal,
  userTZ: string = 'Asia/Tokyo',
): Promise<SessionMatch[]> {
  // ── 1. 時間フィルタ（前日カレンダー優先 + fallback）──
  // 設計判断 Q2: 「昨日」= カレンダー上の前日。直近24時間ではない。
  // 理由: 日本語の「昨日」はカレンダー日を指す。深夜2時に「昨日」と言えば前日の話。
  //        24時間ベースだと0時過ぎの会話が「昨日」に混入し、ユーザー感覚とズレる。
  const now = new Date();
  const userToday = toCalendarDate(now, userTZ);      // "2026-04-16"
  const userYesterday = addDays(userToday, -1);        // "2026-04-15"

  let dateRange: { gte: string; lte: string };
  if (signal.timeHint === 'yesterday') {
    dateRange = { gte: userYesterday, lte: userYesterday };
  } else if (signal.timeHint === 'last_week') {
    dateRange = { gte: addDays(userToday, -7), lte: addDays(userToday, -1) };
  } else {
    dateRange = { gte: addDays(userToday, -30), lte: userToday };
  }

  // 2. primary 検索
  let sessions = await querySessionSummaries(userId, dateRange);

  // 3. fallback: 「昨日」でヒットしなければ直近36時間に拡張
  //    ユーザーが日付境界を跨いで会話していた場合のセーフティネット
  if (sessions.length === 0 && signal.timeHint === 'yesterday') {
    const fallbackStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);
    sessions = await querySessionSummaries(userId, {
      gte: toCalendarDate(fallbackStart, userTZ),
      lte: userToday,
    });
  }

  // ── 4. 重み付きランキング ──
  // 候補が複数ある場合、以下の優先順位で選択:
  //   (a) 日付一致:       完全一致 +1.0 / 近接 +0.5
  //   (b) テーマ一致:     topicHint と key_themes の部分一致 +0.8
  //   (c) follow_up一致:  topicHint と follow_up_hooks の部分一致 +0.6
  //   (d) 人物名一致:     personHint と session内容の一致 +0.9（人物は強シグナル）
  return rankAndSelect(sessions, signal, { maxResults: 3 });
}
```

**ポイント**: vector search やLLMは使わない。日付 + key_themes + 人物名の text match で十分。

#### Stage 2: 具体想起（核心メッセージ引用・条件付き）

**発動条件（Q3 確定）**: サマリで足りない時だけ。

| ユーザー発話 | モード | Stage 2 |
|---|---|---|
| 「昨日何話した？」 | 要約想起 | ❌ 不要（サマリで返せる） |
| 「何の結論になったっけ？」 | 要約想起 | ❌ 不要（follow_up_hooks で返せる） |
| 「俺あの時なんて言った？」 | 具体想起 | ✅ 実行 |
| 「Alterは何て返してきた？」 | 具体想起 | ✅ 実行 |

```typescript
async function loadCoreExchanges(
  userId: string,
  sessionId: string,
  maxTurns: number = 6, // 最大6ターン（3往復）
): Promise<CoreExchange[]> {
  // emotional_context に insight/deepest_moment がマークされたターンを優先
  // なければ最後の3往復
  const { data } = await supabaseAdmin
    .from('stargazer_alter_dialogues')
    .select('role, message, turn_number, created_at')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('turn_number', { ascending: false })
    .limit(maxTurns);
  
  return data?.reverse() ?? [];
}
```

### 3.5 Prompt Injection（プロンプト注入）

想起結果を Alter プロンプトに注入するブロック:

```typescript
function buildRecallBlock(
  matches: SessionMatch[],
  coreExchanges?: CoreExchange[],
): string {
  if (matches.length === 0) return '';

  const lines: string[] = [
    '## 過去の会話の記憶',
    '',
    '以下はユーザーとの過去の会話から想起された内容。',
    '自然に語ること。「データベースで確認した」とは絶対に言わない。',
    '「あの時」「前に話した時」のように、自分の記憶として語る。',
    '確信がない場合は「確か…だったよね？」と聞き返してよい。',
    '',
  ];

  for (const m of matches) {
    lines.push(`### ${m.date} の会話`);
    lines.push(`- テーマ: ${m.keyThemes.join('、')}`);
    lines.push(`- 流れ: ${m.emotionalArc}`);
    if (m.deepestMoment) lines.push(`- 核心: ${m.deepestMoment}`);
    if (m.followUpHooks.length > 0) {
      lines.push(`- 次にやろうと言ってたこと: ${m.followUpHooks.join('、')}`);
    }
    lines.push('');
  }

  if (coreExchanges && coreExchanges.length > 0) {
    lines.push('### 具体的なやりとり');
    for (const ex of coreExchanges) {
      const speaker = ex.role === 'user' ? 'ユーザー' : 'Alter';
      lines.push(`${speaker}: ${ex.message.slice(0, 150)}`);
    }
  }

  return lines.join('\n');
}
```

注入位置: Alter のメインプロンプト内、memory context の後、response generation の前。

### 3.6 想起の語り方ガイドライン

Alter が過去の会話を語る時の制約:

| ルール | 理由 |
|---|---|
| 「記録を確認した」とは言わない | 人間は記憶を「確認」しない |
| 確信度に応じて語調を変える | 「確か…」「前に話してた気がするけど」 |
| 間違ってたらユーザーの訂正を歓迎する | 人間の記憶も曖昧 |
| 全文復元は目指さない | 「仕事のことで悩んでたよね」で十分 |
| follow_up_hooks を最優先で返す | 「あの件」= 直近の未解決テーマの可能性が高い |

### 3.7 想起失敗時の振る舞い

想起シグナルを検出したが、該当セッションが見つからない / サマリが薄い場合の返し方。

**原則: 無理にそれっぽく返さない。曖昧さを正直に出す。**

| 失敗パターン | Alter の返し方 | ❌ やってはいけない返し |
|---|---|---|
| 該当日にセッションなし | 「その日は話してない気がする…別の日じゃなかった？」 | 「昨日は〜について話しましたね」（捏造） |
| サマリはあるが薄い | 「話してたのは覚えてるけど、細かい言い回しまでは曖昧だな」 | 「〜とおっしゃっていましたよね」（偽引用） |
| テーマは分かるが詳細不明 | 「確か仕事の話だったよね。でも具体的に何って聞かれると自信ないな」 | 機械的にサマリを読み上げる |
| 完全に該当なし | 「ごめん、思い出せない。いつ頃の話？」 | 沈黙 / 話題逸らし |

```
プロンプト注入例（想起失敗時）:

## 過去の会話の記憶
ユーザーが過去の会話に言及しているが、該当する記録が見つからなかった。
以下の原則に従って応答すること:
- 「思い出せない」と正直に伝えてよい。人間の記憶も完璧ではない。
- 「いつ頃？」「どんな話だったっけ？」と聞き返してよい。
- 捏造は絶対にしない。曖昧な記憶を確定的に語らない。
- テーマだけ分かる場合は「確か〜の話だったよね」まで。詳細は推測しない。
```

### 3.8 具体想起の引用上限

生ログ引用（Stage 2）には**厳格な上限**を設ける。

| 制約 | 値 | 根拠 |
|---|---|---|
| 最大引用ターン数 | **6ターン（3往復）** | 超えると監視感。人間の記憶も断片的 |
| 1メッセージ最大文字数 | **150文字** | 長文引用は不自然。要点だけ |
| 引用セッション数 | **1セッション** | 複数セッションの生ログを同時引用しない |

```typescript
// Stage 2 の制約定数
const RECALL_LIMITS = {
  maxCoreTurns: 6,           // 3往復まで
  maxMessageChars: 150,      // 1メッセージ150文字で切り詰め
  maxQuoteSessions: 1,       // 生ログ引用は1セッションのみ
} as const;
```

**要約想起には上限不要**（サマリ自体が圧縮済みデータのため）。

---

## 4. レイテンシ・コスト分析

### レイテンシバジェット

```
Signal Detection:     ~1ms  (regex, CPU のみ)
Stage 1 (summaries):  ~50ms (Supabase query, indexed)
Stage 2 (dialogues):  ~80ms (Supabase query, indexed, 条件付き)
Prompt Build:         ~1ms  (string concatenation)
──────────────────────────────
合計:                 ~130ms (最大)
```

現在の Alter 応答が 8-22秒かかっている中で、+130ms は **誤差の範囲**。
LLM追加コールなし。DB クエリ1-2回のみ。

### コスト

- DB クエリ: 1-2回/リクエスト（シグナル検出時のみ）
- LLM トークン増: 想起ブロック分 ~200-400 tokens（サマリのみなら ~100 tokens）
- 月間コスト増: 想起シグナル発生率を5%と仮定 → **ほぼ無視できる**

---

## 5. DB変更（不要 or 最小限）

### Phase 1 で新テーブルは不要

既存テーブルだけで実現可能:
- `stargazer_alter_session_summaries` → 候補セッション検索
- `stargazer_alter_dialogues` → 核心メッセージ引用

### あると良い追加インデックス（オプション）

```sql
-- summary_date でのレンジ検索を高速化
CREATE INDEX IF NOT EXISTS idx_alter_summaries_date_range 
  ON stargazer_alter_session_summaries (user_id, summary_date DESC)
  WHERE summary_date >= (CURRENT_DATE - INTERVAL '90 days');

-- dialogues の cross-session 検索用
CREATE INDEX IF NOT EXISTS idx_alter_dialogues_user_date
  ON stargazer_alter_dialogues (user_id, created_at DESC);
```

→ 既存の `idx_alter_summaries_user` で十分な可能性もある。本番データ量次第。

---

## 6. Phase 1 スコープ

### やること
- [ ] 想起シグナル検出（`detectEpisodicRecallSignal()` — regex ベース、独立関数）
- [ ] セッションサマリ検索（前日カレンダー優先 + 36h fallback + 重み付きランキング）
- [ ] 想起ブロックのプロンプト注入（要約想起 / 具体想起の2モード）
- [ ] 想起失敗時の振る舞い（捏造禁止、曖昧さを正直に出す）
- [ ] 生ログ核心引用（Stage 2、条件付き、3往復上限、150文字切り詰め）
- [ ] 語り方ガイドライン（prompt constraint）

### やらないこと（Phase 2以降）
- vector embedding による意味検索
- 記憶間のエッジ（関連付け）構造
- Spreading Activation（関連記憶の連鎖的想起）
- 自動的な記憶の統合・圧縮
- 複数ユーザー間の共有記憶

---

## 7. リスク分析

| リスク | 影響 | 対策 |
|---|---|---|
| 誤想起（間違った会話を引く） | 信頼低下 | 確信度に応じた語調 + 「違ったら教えて」 |
| 想起しすぎ（毎回過去を引く） | うるさい | シグナル検出は厳密に。偽陽性低く |
| サマリの質が低い | 想起内容が薄い | summarizeAlterSession の品質次第。必要なら改善 |
| 生ログが大量 | クエリ遅延 | Stage 2 は maxTurns=6 制限。インデックスで担保 |
| プロンプト長の膨張 | コスト増 | 想起ブロックは最大400 tokens。超えたら切り詰め |

---

## 8. 将来のPhaseとの接続

```
Phase 1: エピソード想起（本設計書）
  「昨日何話した？」に答えられる
  │
  ▼ 成功条件: シグナル検出精度 > 90%, 想起精度 > 80%
  │
Phase 2: 記憶間エッジ
  alter_memory_edges テーブル
  node_a ←(weight, relation_type)→ node_b
  会話終了時に自動エッジ生成
  │
  ▼ 成功条件: 関連記憶の自動浮上精度 > 70%
  │
Phase 3: Spreading Activation
  入力から関連ノードを活性化
  重み付きエッジを伝搬
  最も活性化の高い記憶をコンテキストに注入
  「仕事の話をしたら、前に話した父との関係が自然に浮かぶ」
```

Phase 1 は Phase 2-3 の **基盤** でもある。  
エピソード単位の検索ができなければ、エッジも活性化も始まらない。

---

## 9. 設計判断（確定）

> CEO + GPT + Claude 三者議論（2026-04-16）で確定。

### Q1: 想起シグナル検出 → **regex only + 拡張可能インターフェース**

- **確定**: `detectEpisodicRecallSignal()` を独立関数として実装
- Phase 1 は regex のみ（LLMコスト0、~1ms）
- `utteranceIntent?: string` パラメータを予約し、将来差し替え可能に
- 根拠: 軽量・説明可能・暴走しにくい。「あの件さ」レベルの曖昧参照は Phase 1 では許容的に見逃す

### Q2: 「昨日」の解釈 → **前日カレンダー優先 + 近接時間 fallback**

- **確定**: 直近24時間ではなく、ユーザーTZでのカレンダー前日を基本とする
- fallback: 前日でヒットしなければ直近36時間に拡張
- 根拠: 日本語の「昨日」はカレンダー上の前日。深夜2時に「昨日」と言えば前日の話であり、
  3時間前の会話ではない。24時間ベースだと日付境界を跨いだ会話が混入しユーザー感覚とズレる
- TZ: Phase 1 は `Asia/Tokyo` 固定。将来はユーザーTZを `lib/shared/location.ts` から取得

### Q3: 生ログ引用（Stage 2） → **サマリで足りない時だけ**

- **確定**: 要約想起（Stage 1）で返せる場合は Stage 2 をスキップ
- 具体想起トリガー: 「何て言った」「どんな話をした」等、発言内容への直接参照時のみ
- 根拠: 速度（+80ms 節約）+ 人間らしさ（毎回ログ引用すると機械的）+ 監視感の低減

### Q4: follow_up_hooks の能動想起 → **Phase 1 は受動のみ**

- **確定**: ユーザーが過去を聞いた時だけ想起。能動的な蒸し返しはしない
- 根拠: Alter は「同じ人として続く」世界観。勝手に蒸し返すと監視感が出る。
  まず受動想起を確実にしてから、将来的に能動想起（限定的に）を検討する
