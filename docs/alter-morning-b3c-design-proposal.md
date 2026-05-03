# B-3c-1 設計提案 — journey_origin selection promotion + travel 生成 (flag 維持)

**作成**: 2026-05-03 (Build Unit)
**前提**: PR #69 (B-3b'-2 wiring) merge 済 (`3f9a074e`)
**対象 reviewer**: CEO + GPT
**Status**: 提案 (CEO/GPT 判断反映 1 回完了 — `12.A` 参照)
**判断履歴**:
- 1st (2026-05-03 GPT): 4 論点判断 → 本 doc に反映済 (= flag 削除を後置、3 PR 構成、derivedFrom 後回し)
- 2nd (2026-05-03 GPT): 必須 #2 補正 → coordinates 無 = 単純維持ではなく **明示 reject** + activePresentation clear しない (= 半壊 UX 防止) → 反映 (§3 必須 #2、§5 Commit 1, 3、§10、§12.A.2nd)

---

## 1. ゴール逆算

```
T-0 (最終ゴール、推定 D+14-21)
  └─ journey_origin grounding 全 user 安定稼働
  └─ flag 削除済 (= dead code ゼロ)
  └─ journey_end (B-3e) 着手前提揃う

T-1 (B-3c-3、推定 D+10-14)  ── flag 削除専用 PR
  ├─ journeyOriginGrounding flag 削除
  ├─ AND gate を 2-gate に縮約 (= dialogStateV2 + placesSearch のみ)
  └─ dead code cleanup
  ⚠ 本 doc では設計しない (= 別 PR で着手、本 doc は B-3c-1 のみ精密化)

T-2 (B-3c-2、推定 D+5-10)  ── rollout 判断 PR
  ├─ staging E2E 結果 CEO 共有
  ├─ canary allowlist (= 数 user で flag ON)
  ├─ canary 1 週間監視 (= provider failure rate / dispatch error rate)
  └─ canary OK → global allowlist 拡大
  ⚠ 本 doc では設計しない (= rollout 判断 PR は monitoring 込みで別途設計)

T-3 (B-3c-1、推定 D+1-3)  ── 機能実装 PR、本 doc 主対象
  ├─ selection route で journey_origin promotion path
  ├─ candidate.coordinates 無 → known_label_only 維持
  ├─ promotion → known_exact (source = "user_override")
  ├─ plan rebuild → travel segment 生成
  ├─ events 変更なし
  ├─ event_where 既存 flow 完全不変
  ├─ flag default false 維持
  ├─ 9 必須条件カバー test
  └─ flag OFF で production 挙動ゼロ

T-4 (現在)  ── 設計提案待ち
```

## 2. Scope (= B-3c-1 で完結させるもの)

PR #69 で構築した 3 層 gate のうち、**Layer 3 を journey_origin に限り narrow** + **promotion path 実装**。
**flag (Layer 1) は維持。Layer 2 default も保守的に維持** (= rollout 判断 PR で UI default を変える)。

| 層 | 現状 (PR #69 後) | B-3c-1 終了時 | B-3c-3 終了時 |
|----|------------------|---------------|---------------|
| Layer 1 (flag) | `journeyOriginGrounding` default false | **default false 維持** (= 本 PR 範囲外) | **削除** (= 別 PR) |
| Layer 2 (UI disabled) | `disabledTargetKinds` props で block | **default 維持** (= caller 側で flag ON 時のみ unblock) | **default 空に変更** (= 別 PR) |
| Layer 3 (server reject) | journey_origin と journey_end 両方 reject | **journey_origin promotion path、journey_end のみ reject 残存** | (変更なし) |

**core change**: Layer 3 は narrow するが、Layer 1 (flag) で全体 gate されるため production 影響ゼロ。

## 3. 9 必須条件 (= GPT 指定、test 必須カバレッジ)

| # | 内容 | 担当 |
|---|------|------|
| 1 | selection route で `target.kind === "journey_origin"` を **promotion path** に変更 | Commit 3 |
| 2 | `candidate.coordinates` 無 → **明示 reject** (= `journey_anchor_promotion_not_possible`) + journeyOrigin known_label_only 維持 + **activePresentation clear しない** + travel 非生成 (= 半壊 UX 防止、GPT 2nd 補正) | Commit 1, 3 |
| 3 | candidate.coordinates **あり** + selection 成功時のみ `journeyOrigin = known_exact + coordinates` (= 半壊 UX を構造的不可能化) | Commit 1 |
| 4 | **events は変更しない** (= persistedEvents は完全不変、anchor のみ変更) | Commit 4 |
| 5 | **event_where 既存 flow は完全不変** (= regression 0) | Commit 2 + 全 commits |
| 6 | generic / private / ambiguous は引き続き **Places API に流さない** (= 既存 PR #69 動作) | Commit 0 (= 既存維持) |
| 7 | selection 後に **rebuild が走り、travel segment が生成される** ことを test | Commit 5 |
| 8 | **flag OFF では production 挙動ゼロ** (= 既存 reject 経路維持) | Commit 3 |
| 9 | **Vercel SUCCESS 必須** | CI 検証 |

## 4. 変更ファイル一覧 (= production code only、B-3c-1 範囲)

| File | 変更内容 | 推定 LOC |
|------|----------|----------|
| `lib/alter-morning/dialog/journeyOriginPromotion.ts` (新) | known_label_only → known_exact 昇格 pure helper | +60 |
| `lib/alter-morning/dialog/applyPlaceSelectionByTarget.ts` (新) | target 別 dispatch helper (= event_where 既存呼び出し / journey_origin 新呼び出し / journey_end no-op) | +120 |
| `app/api/stargazer/alter/selection/route.ts` | Layer 3 narrow + applyPlaceSelectionByTarget 経由化 + flag 連動 reject | +70 / -10 |
| `lib/alter-morning/legacyAdapter.ts` | journey_origin 昇格後の plan rebuild 経路 (= travel synthesize) | +30 |
| **flag 削除** | (B-3c-1 範囲外、B-3c-3 で実施) | 0 |
| **Layer 2 default 変更** | (B-3c-1 範囲外、B-3c-2/3 で実施) | 0 |

合計推定: **+270 / -10 production code**, **+200 tests** (= 9 categories × 3-5 sub-tests)
CEO 限度 900 行に対し約 **52% (470/900)**、十分な余裕。

## 5. Commit 構成 (= 5 commits、 1 PR)

1. **Commit 1**: `journeyOriginPromotion.ts` 新ファイル — pure helper
   - 入力: `JourneyAnchorState | undefined` + `NormalizedPlaceCandidate`
   - 出力: `{ kind: "promoted"; state: JourneyAnchorState & { kind: "known_exact" } } | { kind: "blocked"; reason: "missing_coordinates" | "invalid_state" }`
   - candidate.coordinates 不在 → `{ kind: "blocked", reason: "missing_coordinates" }` (= GPT 2nd 補正、必須 #2)
   - state.kind !== "known_label_only" → `{ kind: "blocked", reason: "invalid_state" }` (= idempotent 防御)
   - **元の state を変更せずに pure に判定** (= caller が dispatch / log 制御)
2. **Commit 2**: `applyPlaceSelectionByTarget.ts` 新ファイル — target 別 dispatch
   - target.kind === "event_where" → 既存 `applyPlaceSelection` 呼び出し (= 必須 #5、不変)
   - target.kind === "journey_origin" → `journeyOriginPromotion` 呼び出し + plan rebuild
   - target.kind === "journey_end" → no-op (= B-3c-1 範囲外、必須 #3 維持)
   - exhaustive switch (= TS `never` assertion で型安全)
3. **Commit 3**: `selection/route.ts` 修正
   - Layer 3 を flag-aware narrow:
     - `journeyOriginGrounding` flag OFF → journey_origin も従来通り reject (= 必須 #8)
     - flag ON → journey_origin は applyPlaceSelectionByTarget へ
     - journey_end は flag 関係なく **常に reject 維持** (= 必須 #5、必須 #3)
   - 新 reject reason: `journey_anchor_promotion_not_possible` (= GPT 2nd 補正、必須 #2)
     - `journeyOriginPromotion` が `{ kind: "blocked" }` を返した場合に発火
     - **dialogReducer を dispatch しない** → activePresentation clear されない (= 半壊 UX 防止)
     - `accepted: false, reason: "journey_anchor_promotion_not_possible"` で 200 return
4. **Commit 4**: `legacyAdapter.ts` で plan rebuild path
   - journey_origin 昇格後、既存 travel synthesize ロジックを呼び出し (= 必須 #7)
   - events は変更しない (= 必須 #4、persistedEvents pass-through)
5. **Commit 5**: integration tests (= 9 必須条件 全カバー、`b3cJourneyOriginPromotion.test.ts`)

各 commit は前後を build break しない逐次構成。

## 6. 既存契約への影響 (= regression risk audit)

### 影響 0 の範囲
- `event_where` selection: Commit 2 で applyPlaceSelectionByTarget が target.kind === "event_where" のとき既存 `applyPlaceSelection` を呼ぶ → **完全不変** (= 必須 #5)
- `journey_end` selection: Layer 3 で常に reject (= 必須 #3 維持)
- production global: flag default false → reject 経路維持 (= 必須 #8)
- events: pass-through、変更なし (= 必須 #4)
- generic/private/ambiguous: route.ts wiring 既存維持 (= 必須 #6)

### 影響あり (= 意図的、staging/canary/allowlist でのみ発生)
- flag ON user の `journey_origin` selection: rejected → accepted
- `morningSession.plan.journeyOrigin`: known_label_only → known_exact (= 必須 #1, #3)
- travel item count: +1 (= origin → first event、必須 #7)

### 構造的 invariant (= 本 PR で保証)
- selection route は target.kind で **完全 dispatch** (= 1 path 1 logic)
- `applyPlaceSelectionByTarget` は **必ず target を見る** (= switch exhaustive、`never` assertion)
- candidate.coordinates 不在時 promotion 不発火 (= 必須 #2)
- events 不変 (= 必須 #4、persistedEvents 入出力で同じ参照確認)
- flag OFF 時 既存挙動完全不変 (= 必須 #8)

## 7. CEO/GPT 確認論点 (= 本 doc 1st 判断で確定)

### Q1: 昇格時の `source` field
**確定**: `"user_override"`
**根拠 (GPT 判断 2026-05-03)**:
- origin clarify への回答から来た anchor → user_override 流用 OK
- candidate 選択の詳細 trace (rawAnswer/selectedPlace/selectedAt/targetKind) は **derivedFrom field** に切り出す
- derivedFrom は **B-3d 範囲** (= B-3c-1 では追加しない、scope 厳守)

### Q2: B-3c-1 / B-3c-2 / B-3c-3 分離
**確定**: 3 PR 構成
- **B-3c-1**: known_exact 昇格 + travel segment 生成 (= 機能実装、本 doc 対象)
- **B-3c-2**: rollout 判断 PR (= staging E2E → canary → allowlist 拡大)
- **B-3c-3**: flag 削除専用 PR (= rollout 安定確認後)

**根拠 (GPT 判断 2026-05-03)**:
- B-3c-2 を「flag 削除 PR」と固定すると、rollout 監視期間が消える
- canary allowlist で稼働実績が出てから dead code 化 → 安全

### Q3: journey_end の B-3e はいつ着手
**確定**: B-3c-3 (flag 削除) 完了 → 1-2 週間 観測 → B-3e (end) 着手
**根拠 (GPT 判断 2026-05-03)**: origin が安定してから別 PR / 別 flag

### Q4: flag 戦略
**確定**: B-3c-1 で flag 維持・default false。staging/canary/allowlist 後に B-3c-3 で削除判断
**根拠 (GPT 判断 2026-05-03)**:
- B-3c は初めて selection → anchor 昇格 → travel 生成まで繋ぐ PR (= 失敗時 UX 影響大)
- rollback 手段を残す必要 (= flag OFF は数秒、git revert は CI/Vercel/deploy で 10 分)
- 私の元提案 (= flag 削除、git revert で十分) は **時間応答性** の観点を欠いていた

## 8. Out of scope (= B-3c-1 で**やらないこと**)

- ❌ journey_end の grounding/promotion → B-3e
- ❌ derivedFrom field 追加 → B-3d (= source は user_override のまま、選択 trace は別 field で表現)
- ❌ sentinel `PLAN_ORIGIN_SENTINEL_EVENT_ID` 廃止 → B-3d
- ❌ journey_origin selection の analytics emit → 別 PR (= rollout 判断 PR の監視機能で追加)
- ❌ Layer 2 default 変更 (= `disabledTargetKinds` の default 修正) → B-3c-2 (= rollout 判断 PR)
- ❌ flag 削除 → B-3c-3
- ❌ canary allowlist 機能の env 追加 → B-3c-2

## 9. risk register

| Risk | 確率 | 影響 | 緩和 |
|------|------|------|------|
| journey_origin 昇格後 travel segment 生成失敗 | 低 | 中 (= UI で travel 消える) | 既存 travel synthesize ロジック流用 + integration test (必須 #7) |
| Layer 3 narrow ミス (= journey_end も同時に開放) | 中 | 高 (= unimplemented path 開放) | Commit 3 type-level exhaustive switch + integration test (必須 #3) |
| events 不変違反 (= 必須 #4) | 低 | 高 (= state 不整合) | Commit 2 で persistedEvents 参照 pass-through、test で同一参照確認 |
| flag OFF 時挙動変化 (= 必須 #8) | 低 | 高 (= 全 user 影響) | flag check を Layer 3 narrow の **手前** に置く、test で OFF 時 reject 確認 |
| candidate.coordinates 不在時 promotion 暴走 (= 必須 #2) | 低 | 中 (= unknown coords が known_exact になる) | journeyOriginPromotion で coordinates 必須 guard、unit test で coords=null 入力 → 元 state 不変返却 |
| event_where 既存 path 影響 (= 必須 #5) | 低 | 高 (= core flow 退行) | Commit 2 で event_where 専用 path に既存 applyPlaceSelection を呼び出し、3161 regression PASS 必須 |

## 10. 検証戦略

### Unit (= Commit 1, 2)
- `journeyOriginPromotion.test.ts`:
  - input variant: known_label_only / known_exact / unknown
  - candidate.coordinates 不在 → 元の state 不変返却 (必須 #2)
  - candidate.coordinates あり + state.kind === "known_label_only" → known_exact 昇格
  - state.kind === "known_exact" → 既存値 prior、昇格しない (= 既に確定なので idempotent)
- `applyPlaceSelectionByTarget.test.ts`:
  - target.kind === "event_where" → 既存 applyPlaceSelection 呼び出し (= 必須 #5、test で behaviour 同一確認)
  - target.kind === "journey_origin" → journeyOriginPromotion 呼び出し
  - target.kind === "journey_end" → no-op (= 必須 #3)
  - exhaustive switch type test (TS never assertion 動作)

### Integration (= Commit 5、`b3cJourneyOriginPromotion.test.ts`)
- 必須 #1: flag ON + public_poi → known_exact 昇格 (3-4 sub-tests)
- 必須 #2 (GPT 2nd 補正): coordinates 無 → 明示 reject (`journey_anchor_promotion_not_possible`) + activePresentation 不変 + journeyOrigin 不変 + travel 非生成 (4 sub-tests)
- 必須 #3: target.kind === "journey_end" → reject 維持 (2 sub-tests)
- 必須 #4: events 不変 (= persistedEvents 同一参照、3 sub-tests)
- 必須 #5: event_where 既存 flow 不変 (4 sub-tests)
- 必須 #6: generic/private/ambiguous skip 維持 (= 既存 PR #69 test 流用 + spot check)
- 必須 #7: travel segment 生成 (= origin → first event、3 sub-tests)
- 必須 #8: flag OFF 時 reject 維持 (2 sub-tests)
- 計 19-22 sub-tests

### Regression
- alter-morning 全 tests (= 3161 + B-3c-1 新規) 緑
- selection route tests (= 既存 event_where path) 完全不変
- B-3b'-2 27 sub-tests も含めて全 PASS

### Manual (= Step A、CEO 担当、B-3c-2 で実施)
- staging で `journeyOriginGrounding=true` env → 「東京駅から…」入力
- 候補表示 → 丸の内口選択 → travel item 表示確認
- CEO judgment → B-3c-2 へ canary 拡大

### CI 必須 (= 必須 #9)
- Vercel SUCCESS 必須

## 11. 想定スケジュール

- **D+0 (今日)**: 本 doc 2 度目 CEO/GPT 判断 (= 本 forward-fix 反映後)
- **D+1**: 判断 OK なら B-3c-1 着手 (= 約 4-6 時間、5 commits)
- **D+2**: B-3c-1 PR 提出 → CEO/GPT review
- **D+3-5**: B-3c-2 (rollout 判断 PR) で staging E2E + canary allowlist 設定
- **D+10-14**: canary 安定 → B-3c-3 (flag 削除) PR

## 12. 開閉 token

本 doc は **提案** であり実装ではない。CEO/GPT 判断が出るまで:
- ✋ コードに触らない
- ✋ B-3c branch を切らない
- ✋ B-3c の test を書かない

判断後の対応:
- ✅ 「OK」 → 上記 5 commit 構成で B-3c-1 着手
- ✏ 「修正要」 → 12.A 章に判断履歴を残しつつ本 doc を forward-fix → 再判断
- 🚫 「reject」 → 別アプローチ提案 (= B-3c の前に audit を追加など)

### 12.A 判断履歴

#### 1st (2026-05-03 GPT)
- **Q1 source**: user_override OK、derivedFrom は B-3d 後回し → 反映 (§7 Q1)
- **Q2 PR 分離**: 3 PR 構成、B-3c-2 = rollout 判断、B-3c-3 = flag 削除 → 反映 (§1 ゴール逆算 + §7 Q2)
- **Q3 journey_end 後回し**: B-3c-3 完了後 1-2 週間観測 → 反映 (§7 Q3)
- **Q4 flag 戦略**: flag 維持・default false、別 PR で削除判断 → 反映 (§7 Q4、私の元案を撤回)
- **9 必須条件**: GPT 提示の 9 項目を §3 に採用、私の元 6 項目から拡張 → 反映 (§3, §4, §5, §10)

#### 2nd (2026-05-03 GPT)
- **必須 #2 補正**: coordinates 無 = 単純維持ではなく **明示 reject** + activePresentation clear しない + travel 非生成 (= 半壊 UX 防止) → 反映
  - §3 必須 #2 を「明示 reject」に書き換え
  - §3 必須 #3 を「coordinates あり時のみ昇格」に明示
  - §5 Commit 1 戻り値を `{ kind: "promoted" } | { kind: "blocked", reason }` に
  - §5 Commit 3 に新 reject reason `journey_anchor_promotion_not_possible` 追加
  - §10 必須 #2 sub-test を 2→4 sub-tests に拡張
- **論理検証**: 私の元案「known_label_only 維持」は **内部状態のみ言及**、UX 観点 (= activePresentation clear → 「選んだのに変わらない」) を欠いていた → GPT 補正は PR #69 で禁止した「半壊 UX」と同型 → 全面採用
- **判断**: ✅ GO — 補正反映後 B-3c-1 着手
