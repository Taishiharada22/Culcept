# M2-B closeout + liveCollector owning タスク設計（docs-only）

**作成日**: 2026-06-12
**ステータス**: docs-only。実装・route/server action 変更・service_role 配線・invoke route 変更・UI・Travel runtime・T1A・migration・DB write・remote apply・production・push すべて**なし**。local only。
**指示**: M2-B-2 配線は **HOLD**（CEO 2026-06-12）。本書は closeout と、liveCollector silent 欠落の owning タスク設計のみ。

---

## Part 1: M2-B closeout summary

### §1.1 完了コミット（本 branch `claude/objective-mcnulty-a554c9`・local only）

| commit | 内容 | 種別 |
|---|---|---|
| `5f568f9e` | 平日プラン監査 + Travel Mode Plan OS 拡張設計 v1（M1-M6） | docs |
| `a0770da3` | M2 Port 設計計画 + CoAlter /plan タブ UI 契約ドラフト | docs |
| `3380b98d` | **M2-A**: PersonalizationPort 最小 read-only 実装（new files 5・23 tests） | feat |
| `1a998575` | **M2-B 設計**: ペア read / RLS 設計（推奨 A 案・CEO 承認済み） | docs |
| `7f68f349` | **M2-B-1**: consent-gated pair engine reader + EngineOnly guard（new files 4・23 tests） | feat |
| `b6999f40` / `fa09e893` | decision-log 記録 | docs |

### §1.2 公開 API（`lib/shared/personalization/`・すべて未配線の純ライブラリ）

```typescript
// M2-A (3380b98d)
getPersonalizationSnapshot(client, userId, asOf) → PersonalizationSnapshot | null
getPairPersonalizationContext(client, pairStateId) → PairPersonalizationContext | null
derivePlanParams(snapshot) → PlanParams                 // pure・9 param・confidence 付き
deriveTravelTraits(snapshot) → TravelTraitsV0           // pure・8 trait・T1A まで暫定

// M2-B-1 (7f68f349)
getPairSnapshotsForEngine({ userClient, adminReadClient, pairStateId, callerUserId, asOf })
  → EngineOnlyPairSnapshots | null                      // consent 前置検査→特権 read→ブランド付与
markEngineOnly / isEngineOnly / assertNoEngineOnlyLeak  // 出口 leak guard（serialize 前契約）
```

### §1.3 いま安全である理由

1. **runtime 到達ゼロ**: 全関数に production/staging からの呼び出し元が存在しない（grep: lib/app からの import 0。テストのみ）。挙動変化は構造的に不可能。
2. **特権の実体化ゼロ**: 実 service_role / sb_secret client の生成コードなし（DI のみ）。`supabaseAdmin.ts` 不変更。env 変更なし。鍵に関する新しい攻撃面は増えていない。
3. **schema 不変**: migration 0・RLS 不変・DB write 経路 0（型レベルでも select chain のみ）。
4. **検証固定**: 46 unit tests（M2-A 23 + M2-B-1 23）が consent-gate・null-safe・leak guard の契約を回帰として lock。full suite 20654 GREEN・tsc 55 baseline 不変。

### §1.4 未接続のもの（明示 GO までこのまま）

| 未接続 | 内容 |
|---|---|
| adminReadClient の実体供給 | `getPairSnapshotsForEngine` に `supabaseAdmin`（または将来の専用 sb_secret client）を渡す配線が存在しない |
| consumer 配線（M2-C/M2-B-2） | empty-day / CoAlter invoke / Travel から port を呼ぶ箇所 0 |
| per-viewer 射影の実装 | `assertNoEngineOnlyLeak` を通す出口（serializer）が未実装（ガード関数のみ存在） |
| UI 契約 | `coalter-plan-tab-backend-contract-draft.md` は CEO の UI 完成待ち |
| liveCollector 修正 | Part 2 の owning タスク（別 GO） |

### §1.5 M2-B-2 が引き続き HOLD である理由

1. **リスク階級が変わる**: M2-A/B-1 は「未消費の純ライブラリ」＝ゼロリスク。M2-B-2 は**初めて実特権 client が CoAlter runtime に流れ込む**統合であり、純ライブラリ slice の直後に勢いで行うべきでない（CEO 判断と一致）。
2. **Stage 1 の挙動が実際に変わる**: 相手の軸が初めて本当に bundle に入る＝LLM への入力が変わる＝既存ペアの CoAlter 応答が変わる。shadow 並走での事前観測が先（Part 2 §2.7 L-2）。
3. **最小開示の形が未決**: 相手軸を LLM にどの粒度で渡すか（生スコア vs band 化）は M2-B 設計 §3 T2 の対策と一体で決める必要がある。配線前の設計判断。
4. **レビュー体制**: GitHub 停止中で PR レビュー・CI が使えない。統合 slice は復旧後の通常レビュー経路に乗せるのが安全（純ライブラリ slice とはリスクが違う）。
5. **配線の正しい順序**: liveCollector の欠落確認（Part 2 L-0）→ shadow（L-1/L-2）→ flip、の段階設計が先にあるべきで、M2-B-2 はその L-2 と同一の統合作業になる（§2.6）。

---

## Part 2: liveCollector owning タスク設計（設計のみ・実装禁止）

### §2.1 疑われている silent 欠落の経路（現状整理）

```
app/api/coalter/invoke/route.ts:44   supabase = await supabaseServer()   ← anon キー + cookie = caller の user-RLS
  └→ liveCollector.fetchAxesByUser(supabase, userA, userB)              liveCollector.ts:252-290
       .from("stargazer_axis_snapshots").select(...).in("user_id",[userA,userB]).is("context",null)
       ← RLS: SELECT USING (auth.uid() = user_id)                        20260307170000:47-62
       ⇒ 相手（caller でない側）の行は**エラーにならず結果から除外**される（PostgREST の RLS はフィルタ）
  └→ fetchGrowthByUser(...)                                             liveCollector.ts:299-316（同型）
  └→ buildObservationBundle(): 空をデフォルト埋め                        observationBundle.ts:203-213, 231-239
  └→ invoke route: stage1 例外 catch → fail-open                         route.ts:346-349
  └→ narration: 失敗を UI に出さない設計
⇒ 「相手の軸・phase・trust が常に欠けた bundle」で Stage 1 が動いている疑い。エラー・警告・UI 兆候なし。
```

注意: talk_messages（thread RLS）と coalter_fairness_ledger（pair RLS）は**ペア双方が読める**ため欠落しない。欠落が疑われるのは **stargazer_axis_snapshots / stargazer_alter_growth の相手行のみ**。

### §2.2 挙動を変えずに確認する方法（L-0: zero-code 検証手順）

コード変更なし・read-only で確認できる。local Supabase（または staging の read 専用確認）で:

1. **前提データ確認**（SQL・read-only）: 対象ペア（user_a=A, user_b=B, state='enabled'）と、**B に `stargazer_axis_snapshots` の行が実在する**こと（`context IS NULL` の行）を確認。B に行がなければ「欠落」ではなく「未観測」であり別問題。
2. **RLS 再現クエリ**: A の JWT で認証した supabase-js client（または SQL の `set role authenticated; set request.jwt.claims ...` 相当のローカル再現）から、liveCollector と**同一のクエリ**（`.in("user_id",[A,B]).is("context",null)`）を発行し、結果の `user_id` distinct を数える。
3. **対照**: 同じクエリを B 自身の JWT で発行（B の行が返ることを確認）し、admin（local の service key）で発行（両者の行が返る）。

### §2.3 バグを確定させる証拠

以下が**すべて**揃えば確定:
- (a) B に `context IS NULL` の axis 行が存在する（admin/B 自身の読みで確認）
- (b) A の JWT での同一クエリ結果に **user_id = B の行が 0 件**
- (c) `stargazer_axis_snapshots` / `stargazer_alter_growth` にペア向け SELECT ポリシーが存在しない（migration 全量 grep 済み・確認済み: M2-B 設計 F5）
- (d) （補強）実セッションの observationBundle/collectorMeta 相当の記録で personB の decisionAxes が空

(a)+(b) が核心。(c) は既に文面で確定しているため、実質 L-0 は (a)(b) の実測のみ。

### §2.4 最終的な修正オプション

| 案 | 内容 | 評価 |
|---|---|---|
| **FIX-1（本命）**: M2-B-1 経由 | invoke route で `getPairSnapshotsForEngine`（consent-gated・adminReadClient 注入）を呼び、axes/growth の相手分を bundle に供給。talk/ledger は現行 user-RLS のまま | M2-B 設計 A 案の第一消費者。**M2-B-2 配線と同一作業**。consent 検査・EngineOnly ガード・null-safe が実装済みで再利用できる |
| FIX-2: ペア向け RLS ポリシー追加 | migration で「enabled pair の相手は SELECT 可」を追加 | **不採用**（M2-B 設計で確定）: user JWT に開放した瞬間、相手の生 53 軸が**相手の client から直読可能**になる。private 層の原則に反する |
| FIX-3: 仕様としての受容 | 「Stage 1 は自分側のみ」を正式仕様化し、`.in([A,B])` を `.eq(A)` に直す | CEO lock（2026-04-20 M1 1b: 両者の軸を読む）と矛盾。**CEO が意図を変更する場合のみ** |

### §2.5 M2-B-1 pairEngineReader を使うか、より狭い診断を先にするか

**狭い診断（L-0）が先。** 理由:
1. L-0 は**コード変更ゼロ**で、バグの実在と影響範囲（どれだけのペアで B 行が実在するのに欠けているか）を確定できる。修正の緊急度・優先度の判断材料が先に要る。
2. 仮に「B に行がそもそも無い」(未観測) が大勢なら、修正の体感効果は小さく、優先度が変わる。
3. FIX-1 は M2-B-2 と同一のリスク階級（特権 client の runtime 流入）であり、HOLD 判断（§1.5）に従う。診断はその判断を変えるための入力。

### §2.6 既存 CoAlter Stage 1 を変えるリスク

1. **応答の質的変化**: 相手軸が初めて実データで入る → LLM 入力が変わる → 既存ペアへの CoAlter 応答のトーン・内容が変わる（改善のはずだが、体験の連続性は崩れ得る）。
2. **プライバシー脅威の現実化**: 相手の軸が bundle に入った瞬間、M2-B 設計 §3 **T2（チャット経由の引き出し）と T8（推論攻撃）が机上から実害候補に変わる**。最小開示（band 化）と出力 post-check を修正と同時に入れる必要がある。
3. **テスト lock**: `tests/unit/coalter/understanding/liveCollector.test.ts` ほか Stage 1 系テストが現挙動を固定している。修正は lock の意図的更新を伴う（無自覚に壊さない）。
4. **fail-open の罠**: 現在の「失敗を隠す」設計のため、統合バグも silent になり得る。shadow 比較の観測なしの flip は不可。
5. **コスト/レイテンシ**: 特権 read 追加でクエリ数+2、prompt サイズ増。collectorMeta の queryCount/sources（`liveCollector.ts:131-133`）の snapshot 固定テストも更新対象。

### §2.7 最安全の将来実装スライス（すべて別 GO・本書では実装しない）

CoAlter には **shadow 並走の house pattern が既にある**（`COALTER_UNDERSTANDING_SHADOW_MOVIE`: flag 既定 OFF・fire-and-forget・失敗握り潰し・本流の挙動 1 bit 不変、`lib/coalter/flags.ts:104-121` + `understandingShadowFlag.test.ts`）。これを踏襲する:

| Slice | 内容 | 挙動変化 |
|---|---|---|
| **L-0** | zero-code 検証（§2.2 の手順を実行・結果を docs 化） | なし |
| **L-1** | 観測のみ: collectorMeta に `partnerAxisRowCount` 等の診断フィールドを追加（読み取り結果のカウントのみ・bundle 内容不変・flag 不要 or 既定 OFF） | なし（メタデータのみ） |
| **L-2** | shadow 並走: 新 flag（既定 OFF）下で `getPairSnapshotsForEngine` を fire-and-forget 実行し、現行 bundle との**差分をログ**（本流は現行のまま）。= 実質 M2-B-2 の shadow 段 | なし（flag OFF 既定・ON でも本流不変） |
| **L-3** | flip: 最小開示形（band 化）+ 出力 post-check を実装した上で、flag で本流を新経路に切替（canary→全量） | **あり**（ここで初めて） |

### §2.8 必要テスト

- **L-0**: テスト不要（手順書と結果記録のみ）。
- **L-1**: collectorMeta 診断フィールドの unit（partner 行 0/N でのカウント正確性）+ 既存 snapshot 固定テストの意図的更新。
- **L-2**: shadow flag invariant（既定 OFF・OFF 時 call flow 不変 — `understandingShadowFlag.test.ts` と同型）/ shadow 失敗握り潰し / 差分ログの shape。
- **L-3**: ①consent-gate 回帰（M2-B-1 の 23 tests を統合点でも通す）②**canary leak テスト**: 相手軸にカナリア値を仕込み、narration・response payload・ログに非出現を assert ③band 化（最小開示）の写像 unit ④fail-open 維持（特権 read 失敗時に Stage 1 全体が落ちない）⑤既存ペアの応答 regression（golden 比較は意図的更新）⑥integration: local Supabase 実 RLS で「user client では B 行 0・admin read client では取得」の両建て確認。

---

## 付記: CEO 判断が必要になる将来ポイント（本書では要求しない）

1. L-0 実施 GO（zero-code・local/staging read のみ）
2. L-1〜L-3 の段階 GO（L-3 は Stage 1 挙動変更＝CoAlter 体験に影響）
3. 相手軸の LLM への開示粒度（生スコア vs band 化 — M2-B 設計 T2 と一体）
4. M2-B-2 の HOLD 解除条件（GitHub 復旧後のレビュー経路を推奨）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
