# PRM Persistence Schema Design（A1-7-5・**docs-only・migration 実行禁止**）

設計: `docs/aneurasync-reality-control-os-connection-design.md` §3（PRM 永続化設計）/ §10.0〜10.4（A1-7-0〜7-4 dry-run learning）/ §10.5（本設計の要約）
状態: **設計のみ**。DB migration / Supabase schema 実装 / persistence 実装 / route / Home / production / env / remote / LLM は**書かない**。

> 本ドキュメントは「将来何を永続化すべきか」の設計。**migration は次段階の CEO 承認まで絶対に書かない**（§7 stop gate）。

---

## 0. 前提・現状（A1-7-0〜7-4 で確定・全て pure / 未永続化）

- **A1-7-0 events**: candidate action（accept/dismiss/later）→ `DryRunLearningEvent`（非断定・複数 hypothesis・文脈付き）。
- **A1-7-1 patterns**: events → `TentativePatternReport`（文脈相関で disambiguate・certainty 上限 tentative・counter-evidence）。
- **A1-7-3 proposals**: patterns → `PrmDryRunProposal[]`（candidate/blocked・reviewRequired・tendency framing）。
- **A1-7-4 dev-report**: proposal を人間が目視（candidate/blocked/blockedReason/certainty/counter/stillPossible）。
- いずれも **pure・no-persist**。patterns/proposals は events の **純関数**（再計算で再導出可能）。

---

## 1. Goal / Non-goal

**Goal**: PRM が **セッションを跨いで学習**するために、何を・どう永続化するかを、過断定防止・privacy・review gate を保ったまま設計する。

**Non-goal（本設計でやらない）**: migration を書く / schema を実装する / persistence を実装する / 自動で PRM を更新する / 性格を断定する。

**北極星**: PRM はユーザーの「第二の自己」。ゆえに **(a) 人間が review した結論だけが入る・(b) ユーザーが見て訂正できる・(c) いつでも再導出・rollback できる・(d) 過断定を構造的に不可能化する**。

---

## 2. 保存対象の比較（events / patterns / proposals）

| layer | 永続化 | 理由 |
|---|---|---|
| **events**（A1-7-0） | ✅ **保存（源泉）** | 不変の事実（「user が候補 X に action Y を時刻 Z」）。append-only。**patterns/proposals は events の純関数ゆえ、events さえ持てば改良した rule で後から再導出できる**。audit clean。 |
| **patterns**（A1-7-1） | ❌ 保存しない（read 時に派生） | ephemeral・再計算物。保存すると **集約 rule を凍結**し snapshot が stale 化。必要なら cache（明示 stale-able）に留める。 |
| **proposals**（A1-7-3） | ❌ 事実としては保存しない（派生）。但し **review 決定は保存** | proposal 自体は派生。但し人間が proposal を review した **決定（approve/reject/defer）は新しい事実**＝PRM model への唯一の入口。 |

**結論**: **events を源泉として保存**し、patterns/proposals は read 時に純関数で再導出。**PRM model = 人間が review し approve した tendency のみ**（events から自動生成しない）。

**なぜ events か（前提を疑った結果）**: 「学習結果（proposal）を保存」が直感だが、proposal/pattern は rule（disambiguation/projection）に依存する派生物。rule は今後改良される。**派生物を保存すると v1 の rule を凍結**してしまう。源泉（events）を保存すれば、rule 改良が遡って全洞察を改善する。

---

## 3. Schema 設計（**設計のみ・migration 禁止**）

### 3.1 `prm_learning_events`（**段階1で migrate・源泉の signal log**）

append-only な事実ログ。patterns/proposals は本テーブルから read 時に純関数（A1-7-1/7-3）で派生。

| column | type | 備考 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | **RLS owner-only**（auth.uid()=user_id） |
| handle | text | **opaque candidate handle**（一方向 hash・seedRef を含まない） |
| action | text | CHECK in (accept, dismiss, later) |
| signal | text | CHECK in (adoption, non_adoption, deferral)・中立（評価でない） |
| desired_date | date null | 候補の希望日（context） |
| band | text null | CHECK in (morning, afternoon, evening)・context |
| confidence_band | text | CHECK in (high, medium, low)・**元候補の確信度**（context） |
| duration_min | int null | context |
| source_kind | text | CHECK in (seed_explicit, correction) |
| acted_at | timestamptz | action 時刻（注入・decay/recency 用） |
| captured_at | timestamptz default now() | |
| expires_at | timestamptz null | **TTL**（§5） |

**契約**: **raw / seedRef / source_ref / 発話本文 / 性格を持たない**（A1-7-0 event と同じ redaction）。append-only（UPDATE しない・訂正は新 row）。enum / date / int のみ。

### 3.2 `prm_review_decisions`（**段階2・review の橋渡し・reviewRequired の実体**）

人間が proposal（candidate）を review した決定。**PRM model への唯一の入口**。

| column | type | 備考 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | RLS owner |
| proposal_fingerprint | text | source dimension+value+dominantAction（どの proposal か） |
| decision | text | CHECK in (approved, rejected, deferred) |
| reviewed_by | text | CHECK in (user, operator)・誰が review したか |
| reviewed_at | timestamptz | |
| proposal_snapshot | jsonb | review 時点の evidence/counter/stillPossible/certainty（再現性・audit） |

**契約**: certainty snapshot は **CHECK で high を許さない**（jsonb の検証は app + trigger）。**自動 approve 禁止**（decision は人間が入れる）。

### 3.3 `prm_model_entries`（**段階3・review 済 tendency = 実 PRM**）

人間が approve した tendency の蓄積。**これが「PRM 本体」**。

| column | type | 備考 |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | RLS owner |
| context_dimension | text | CHECK in (band, durationBucket, confidence, source)・**文脈軸** |
| context_value | text | 文脈値 |
| tendency_direction | text | CHECK in (adoption, non_adoption, deferral)・**傾向（性格でない）** |
| favored_hypothesis | text | disambiguate された仮説（not_now / mismatch_unknown 等） |
| still_possible | jsonb | **代替仮説（潰さない）** |
| evidence_count | int | |
| counter_count | int | **counter-evidence（弱化に使う）** |
| certainty | text | **CHECK in (low, tentative)** ← high を DB で不可能化 |
| review_decision_id | uuid fk → prm_review_decisions | **NOT NULL**（review 必須の実体） |
| supersedes_id | uuid null fk → self | **versioning / rollback** |
| user_visible | boolean default true | **ユーザーが見える** |
| user_correction | jsonb null | **ユーザーの訂正（強い override signal）** |
| decay_weight | real | **recency 減衰**（古いほど小・§5） |
| created_at / retracted_at | timestamptz | retracted で論理削除（rollback） |

**契約**: 性格 column を持たない。**(context_dimension, context_value, tendency_direction) の文脈束縛 tendency のみ**＝trait でない。

---

## 4. 保存契約（過断定防止を schema で構造化）

| 要件 | schema での担保 |
|---|---|
| **reviewRequired** | `prm_model_entries.review_decision_id NOT NULL`＝review 決定なしに PRM entry は生まれない。自動学習禁止。 |
| **counter-evidence** | `counter_count` を必ず保持。disconfirming event で entry を**弱化**（捨てない）。 |
| **stillPossible** | `still_possible jsonb` で代替仮説を保持（潰さない）。 |
| **certainty cap** | `CHECK (certainty IN ('low','tentative'))`＝**DB level で high 不可能**。fixed preference を作れない。 |
| **non-personality assertion** | 性格/trait column なし。文脈束縛 tendency のみ。「夜は採用されにくい傾向」は OK、「あなたは内向的」は表現不能。 |

---

## 5. retention / TTL / deletion / audit / rollback / user-visibility

- **retention / TTL**: `prm_learning_events.expires_at`（例 180 日）で古い signal を age out。PRM model は `decay_weight`（recency 減衰）で**現在の自己**を反映（過去に凍結しない）。
- **deletion**: ユーザー起点削除を cascade（events → review_decisions → model_entries）。候補単位削除でその影響を除去。GDPR 整合（user-RLS・owner のみ）。
- **audit**: `prm_model_entries` の変更は append-only audit（誰/いつ/なぜ・どの review・どの events）。全 entry が events + review に provenance trace。
- **rollback**: `supersedes_id` で versioning。review 決定の撤回 → entry を `retracted_at` で論理削除/supersede。**完全可逆**。
- **user-visibility**: `user_visible` で PRM をユーザーに開示（透明性）。`user_correction` でユーザーが訂正＝**強い override signal**（推論より優先）。「第二の自己」をユーザーが所有・編集する。

---

## 6. privacy + 過断定防止策（まとめ）

- **privacy**: redacted（raw/seedRef なし）・user-RLS owner-only・service_role 不使用・cross-user なし・性格ラベルなし・user 削除可・user 可視。
- **過断定防止**: certainty CHECK で high 不可能 / reviewRequired（自動学習なし）/ counter-evidence で弱化 / stillPossible で代替保持 / decay で recency / user_correction で override / tendency-not-trait。**5 重の構造的 gate**。

---

## 7. migration 前 stop gate（**この順序を満たすまで migration を書かない**）

1. **A1-7-4 dev-report で proposal 品質を CEO/dev が review**（candidate/blocked の妥当性・counter-evidence・過断定なし）。
2. **本 schema 設計（A1-7-5）を CEO 承認**。
3. **review flow 設計**（人間が proposal を review → decision を入れる UI/route の設計・別 docs）。
4. **migration 計画を CEO 承認**（段階1 events table から・段階2/3 は後）。
5. ④の承認後にのみ migration を書く。**①〜④未了の間は schema/DB に一切触れない**。

---

## 8. しない（範囲外・本設計の境界）

migration / Supabase schema 実装 / persistence 実装 / 自動 PRM 更新 / route / Home 本線 / production / env / remote / LLM / 性格断定 / patterns·proposals の保存（派生ゆえ）。
