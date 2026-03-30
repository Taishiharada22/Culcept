# Student Track 3 Design: Unified Profile Update

## Decision

3本目の student track は `identity_profile_update` にする。

これは「Stargazer が観測した性格傾向」と「Orbiter が観測した対人・存在パターン」を、
1つの内部プロフィール状態に束ねて更新する track である。

この track の役割は、ユーザー向けの文章を直接返すことではない。
統括AIが各領域を横断して参照するための、内部の長期状態を育てることが目的である。

## Why This Track Third

Stargazer は「質問生成」を育てている。
Orbiter は「候補理解の記憶要約」を育てている。

この2本の次に必要なのは、両者を束ねて
`今このユーザーをどう理解しているか`
を更新し続ける track である。

recommendation 系は reward が強いが、先に入れると「行動最適化」は進んでも
「理解の中核」が育たない。

3本目を profile update にする理由は次の通り。

- 統括AIに最も近い責務である
- Stargazer / Orbiter の両方を学習素材として再利用できる
- 既存の downstream consumer がすでに複数ある
- 4本目以降の coaching / recommendation / profile copy を支える基盤になる

## Existing Codebase Assets

この track は、既存コードの上に自然に載せられる。

### Source Inputs

- Stargazer の長期状態
  - `stargazer_profiles`
  - `stargazer_axis_snapshots`
  - `stargazer_resolved_types`
  - `stargazer_daily_states`
  - `stargazer_observations`
- Orbiter の長期状態
  - `orbiter_memory_summaries`
  - `orbiter_existential_digests`
  - `rendezvous_user_states`
- 行動シグナル
  - `recommendation_ratings`
  - `recommendation_actions`
  - `recommendation_impressions`
  - `rendezvous_profiles`

### Existing Consumers

- Stargazer profile surfaces
  - `/Users/haradataishi/Culcept/app/api/stargazer/profile/route.ts`
- Stargazer cross-system bridge
  - `/Users/haradataishi/Culcept/lib/stargazer/crossSystemBridge.ts`
- Orbiter existential digest
  - `/Users/haradataishi/Culcept/lib/orbiter/existentialDigest.ts`
- Recommendations behavior profile
  - `/Users/haradataishi/Culcept/app/api/recommendations/profile/route.ts`

このため、Unified Profile は「新しい孤立機能」ではなく、
既存の理解パーツを統括する control plane になれる。

## Track Definition

### Task Type

- `identity_profile_update`

Phase 1 は 1 task に絞る。
Orbiter と同じく、まずは 1 task を teacher/shadow/eval/artifact の loop に載せる。

### Model Registry

- model key: `identity_student`
- initial champion: Gemini
- initial student role: `shadow`
- eval type: `identity_profile_downstream`

### Artifact Types

- `identity_training_jsonl`
- `identity_teacher_jsonl`

## Output Contract

出力はユーザー向け prose ではなく、内部プロフィール JSON とする。

Phase 1 の最小 schema:

```json
{
  "stableTraits": [
    {
      "key": "introversion",
      "label": "静かな環境で深く考える傾向",
      "confidence": 0.74,
      "evidenceRefs": ["stargazer_axis:introvert_vs_extrovert", "orbiter_digest:essence"]
    }
  ],
  "volatileState": {
    "socialEnergy": {
      "value": "recovering",
      "confidence": 0.58
    }
  },
  "relationalStyle": {
    "pace": "slow_deep",
    "distanceNeed": "medium_high",
    "confidence": 0.69
  },
  "decisionStyle": {
    "mode": "observe_then_commit",
    "confidence": 0.71
  },
  "activeHypotheses": [
    {
      "key": "context_builds_warmth",
      "statement": "短い往復より文脈が積まれたときに反応温度が上がる",
      "confidence": 0.62
    }
  ],
  "openQuestions": [
    "安心感が増す条件は、相手の言葉選びか会話の長さか"
  ],
  "changedSinceLast": [
    "distance_need lowered slightly"
  ],
  "contradictions": [
    {
      "key": "social_energy_vs_recovery",
      "severity": 0.22
    }
  ],
  "consumerReadiness": {
    "stargazer": true,
    "orbiter": true,
    "recommendations": false
  }
}
```

重要なのは次の3点である。

- stable trait と volatile state を分ける
- evidence reference を必須にする
- downstream consumer ごとの readiness を持つ

## Storage Design

### New Table

`identity_profile_snapshots`

想定カラム:

- `id`
- `user_id`
- `ai_run_id`
- `version`
- `profile_json`
- `profile_text`
- `previous_snapshot_id`
- `source_summary`
- `contradiction_score`
- `consumer_readiness`
- `confidence`
- `created_at`
- `updated_at`

### Why Snapshot Table

Stargazer は質問候補の pool を持つ。
Orbiter は candidate 単位の summary を持つ。

Unified Profile は「ユーザー自身の長期理解」を versioned snapshot として持つべきで、
毎回上書きだけだと学習素材として弱い。

snapshot 化すると次ができる。

- previous -> current の delta を artifact に入れられる
- oscillation を downstream eval で見られる
- future consumer が point-in-time replay できる

## Trigger Strategy

Phase 1 の trigger は 3 系統。

1. Stargazer state change
- 新しい observation 保存時
- daily state 更新時
- resolved type 更新時

2. Orbiter state change
- `orbiter_memory_summaries` 更新時
- existential digest 更新時

3. Scheduled consolidation
- 日次 cron
- event が少ないユーザーにも最新 snapshot を維持する

初期は debounce を入れる。
1イベントごとに必ず更新せず、
`last snapshot から一定時間以上` または `source delta が一定以上` の時だけ回す。

## Teacher / Shadow Design

### Primary

Gemini を champion にして、structured JSON を生成する。

primary run metadata には最低限これを持たせる。

- `studentTrack: "identity"`
- `profileRequestId`
- `profileSchemaVariant`
- `profilePromptVariant`
- `sourceWindow`
- `sourceCounts`
- `previousSnapshotId`

### Teacher

teacher は同じ schema を返すが、次を厳しく要求する。

- unsupported claim をしない
- evidenceRefs を落とさない
- changedSinceLast を previous snapshot に基づいて書く

### Shadow

student shadow は user-facing output を変えない。

最初は:

- `ai_runs`
- `teacher_outputs`
- `ai_eval_runs`

にだけ積み、
`identity_profile_snapshots` へは primary だけを保存する。

## Downstream Evaluation

この track は JSON 妥当性だけでは評価にならない。

Phase 1 の downstream eval は 4 系統に分ける。

### 1. Coverage

- 必須 field が埋まっているか
- consumerReadiness が妥当か
- evidenceRefs の欠落率が低いか

### 2. Stability

- source delta が小さいのに profile が大きく揺れていないか
- stableTraits が 1イベントで反転していないか
- contradiction score が急増していないか

### 3. Predictive Alignment

snapshot 後に入ってきた Stargazer / Orbiter / behavior signal が、
profile の仮説と整合するかを見る。

例:

- `distanceNeed=high` の後に、Rendezvous 行動が急接近ではなく慎重遷移か
- `observe_then_commit` の後に、評価行動が即断より遅延傾向か
- `context_builds_warmth` の後に、Orbiter memo が同傾向を再確認するか

### 4. Consumer Utility

Unified Profile を読んだ consumer が、
必要な fallback なしで動けるかを見る。

Phase 1 の consumer utility 指標:

- Stargazer consumer completeness
- Orbiter consumer completeness
- recommendation profile completeness

## Hard Negatives

この track では reject を細かく持つ必要がある。

初期 hard negative kinds:

- `malformed_profile_json`
- `missing_evidence_refs`
- `unsupported_claim`
- `contradiction_increase`
- `stale_profile_no_delta`
- `overreacted_to_single_event`
- `consumer_readiness_overclaimed`

特に `unsupported_claim` と `overreacted_to_single_event` は、
「わかった気になる AI」を防ぐ上で重要である。

## Training Artifact Design

### `identity_training_jsonl`

1 row = 1 profile update attempt

最低限含めるもの:

- run metadata
- previous snapshot summary
- accepted profile snapshot
- source counts
- contradiction delta
- later downstream metrics
- hardNegativeKind

### `identity_teacher_jsonl`

SFT / distillation 用の messages 形式。

最低限含めるもの:

- system
- user
- assistant
- metadata.previousSnapshotId
- metadata.sourceCounts
- metadata.consumerReadiness

## Why Not Recommendation Track Yet

recommendation track は 4本目としては強い。
ただし 3本目として先に入れると、学習目標が
`その場のクリック最適化`
へ寄りやすい。

いま必要なのは、
`この人を横断的にどう理解するか`
を internal state に固定することなので、
Unified Profile の方が順番として正しい。

## Minimal Phase 1 Implementation

Phase 1 は次の順に実装する。

1. `lib/identity/studentTrack.ts`
- task type
- artifact type
- metadata helper

2. `identity_profile_snapshots` migration
- snapshot versioning
- ai_run_id join

3. `lib/identity/profileUpdate.ts`
- source loader
- prompt builder
- structured parse
- snapshot persistence

4. `lib/identity/shadowRun.ts`
- champion + shadow dual-run
- `identity_profile_downstream` eval 書き込み

5. `lib/identity/exportDataset.ts`
- training / teacher artifact export

6. `lib/identity/studentOps.ts`
- teacher backfill
- warmup
- sample check
- readiness review

7. `lib/ai/index.ts` / `lib/ai/eval.ts` への hook
- Stargazer / Orbiter と同じ方式で接続

## Promotion Path

昇格は user-facing text ではなく、
まず internal profile writer として行う。

段階:

1. `shadow`
- ai_runs / eval only

2. `challenger`
- snapshot を別テーブルに保存
- consumer にはまだ使わない

3. `internal_champion`
- internal profile snapshot の writer を student に切り替える
- consumer はこの snapshot を読む

4. `externalized_consumer_support`
- profile copy / coaching / recommendation で間接利用する

この順にすると、ユーザー向け出力を急に student に渡さずに済む。

## Success Criteria

Phase 1 の成功条件:

- teacher coverage = `1.0`
- shadow eval coverage = `1.0`
- `identity_teacher_jsonl >= 100`
- current pipeline success rate を別枠で追える
- hard negatives が分類付きで artifact に入る
- consumer utility が少なくとも Stargazer / Orbiter で計測できる

## Recommendation For Next Step

次の実装対象は `identity_profile_update` でよい。

最初にやるべきことは:

1. `studentTrack.ts` と migration を作る
2. source loader を実装する
3. primary snapshot writer を通す
4. shadow + eval + artifact を後追いで載せる

この順なら、3本目は「設計だけ」で終わらず、
Stargazer / Orbiter と同じ育成 loop に短距離で接続できる。
