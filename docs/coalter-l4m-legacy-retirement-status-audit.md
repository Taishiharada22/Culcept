# CoAlter L4-m Legacy Retirement Status Audit

**作成日**: 2026-05-15
**ステータス**: docs-only audit、runtime / code 変更なし
**起草 branch**: `docs/coalter-implementation-unblock-audit-batch` (Batch-A の 3/3)

## §0 本書の position

### §0.1 目的

PR #122 §6 6-State Incomplete 定義で「Layout L4-m 着手未達」(🟡) と分類された L4-m (legacy CoAlterCard 完全退役) の状態を、**main merge 済 commit + 既存 docs (L4-l runbook / legacy retirement plan) を一次資料**として棚卸しする。

L4-l (PR #95、2026-05-10) 完了から本 audit 時点 (2026-05-15) で 5 日経過。L4-m 着手 timing の **判断材料 (audit material)** を整理し、Layout / UpperLayer / Gap 4 / production reachability の残りを棚卸し (**最終採用判断は CEO 承認待ち**)。

**重要 (CEO 2026-05-15 補正)**:
- 本 audit は L4-m 着手 timing そのものを決定するものではない。
- claude 側の整理結果として「急がない推奨」「Phase 3 後 cleanup 推奨」等を提示するが、**最終採用判断は CEO 承認待ち**。

### §0.2 Source-of-truth Hierarchy

- **Tier 1**: PR #95 (`62dff94b`、2026-05-10、L4-l 完了) main 反映済
- **Tier 1**: `docs/coalter-l4l-execution-runbook.md` §9 (L4-m 着手判定基準、CEO ops doc)
- **Tier 1**: `docs/coalter-legacy-cardplacement-retirement-plan.md` (legacy 退役計画、Stage 0.5 bfcf6c5b)
- **Tier 1**: `docs/coalter-handoff-2026-05-11-stepd.md` §1.1 / §3 (3 旗 ON 反映確認)
- **Tier 2**: 実コード `app/components/coalter/CoAlterCard.tsx` (legacy 残存確認)

### §0.3 制約

- ❌ runtime 実装 / lib / src / tests / package / migration 変更
- ❌ env / production 変更 / Step E 開始 / bug1 cleanup / Stargazer pivot
- ✅ docs-only audit

---

## §1 L4-l 完了状態 (一次資料)

### §1.1 PR #95 (62dff94b、2026-05-10、L4-l flip)

PR #95 の効果 (handoff §1.1 + §3 一次資料):

| 要素 | 状態 |
|---|---|
| 3 production env 旗 ON | ✅ |
| `COALTER_PRESENCE_SPEECH_LLM=true` | ✅ |
| `NEXT_PUBLIC_COALTER_PRESENCE_SPEECH_FETCH=true` | ✅ |
| `NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR=true` | ✅ |
| `NEXT_PUBLIC_COALTER_LEGACY_CARD_AUTO_INSERT=false` | ✅ (legacy auto-insert OFF) |
| UpperLayerMount integration | ✅ `ChatClient.tsx:1520` |
| Stage 4 L4-a 〜 L4-k 完了 (11 commits) | ✅ |
| L4-pre-3 instrumentation startup wiring | ✅ (`431d2074`) |

### §1.2 L4-l 完了の意味

- **flag flip**: `COALTER_LEGACY_CARD_AUTO_INSERT=false` で legacy 自動挿入を停止
- **production deploy**: 3 旗 ON 状態が production env に反映
- **UpperLayer 起動**: production user に新上部レイヤーが mount される (variant 発火は Gap 4 で薄、PR #123 §1.2 参照)
- **legacy dead code 化**: legacy CoAlterCard auto-insert は OFF だが、**code 自体は残存**

---

## §2 L4-m の定義 (L4-l との違い)

### §2.1 L4-l vs L4-m 比較

**正本**: `docs/coalter-legacy-cardplacement-retirement-plan.md:166-168` + `docs/coalter-l4l-execution-runbook.md` §9

| 項目 | **L4-l (完了済)** | **L4-m (未着手)** |
|---|---|---|
| 役割 | flag flip + 3 旗 ON + production deploy | **legacy code 物理削除** |
| 対象 | env 変更のみ | **code 変更** |
| 影響範囲 | flag による behavior 切替 | legacy file / component / dispatch path 削除 |
| rollback | env 変数戻すだけ | code revert 必要 |
| 完了 SHA | PR #95 `62dff94b` | (未着手) |
| 完了 date | 2026-05-10 | (未着手) |

### §2.2 L4-m 実行内容

`docs/coalter-l4l-execution-runbook.md` §9.2 (CEO 別審議で実施):

- legacy CoAlterCard component 物理削除 (e.g., `components/coalter/CoAlterCard.tsx`)
- legacy auto-insert dispatch path 削除
- `COALTER_LEGACY_CARD_AUTO_INSERT` env flag 削除
- 関連 legacy types 削除
- 関連 tests cleanup

---

## §3 L4-m 着手判定基準

### §3.1 L4-l Execution Runbook §9.1 一次資料

**正本**: `docs/coalter-l4l-execution-runbook.md:489-498`

L4-m 別審議に進める **すべて満たす** 条件:

| Gate | 条件 | 現状 (2026-05-15) |
|---|---|---|
| 1 | L4-l flip 後 **1 rev (推奨 2 週間以上)** 観測 | ⚠ **5 日経過のみ** (2026-05-10 → 05-15) |
| 2 | flip 後の挙動が **完全に安定** (CEO 業判定) | ⚠ 観測継続中、評価未 |
| 3 | ペア観測安定 (**≥ 50 ペア / 14 day**) | ⚠ 観測継続中、count 未 |
| 4 | CEO 別審議 trigger 発動 | ⚠ 未発動 |

→ **L4-m 着手 timing 未到達**。最短でも 2026-05-24 (L4-l + 14 day) 以降が着手判定可能 timing。

### §3.2 L4-m を急がない論理的理由 (一次資料)

`docs/coalter-l4l-execution-runbook.md:509-514`:

> legacy CoAlterCard は flag OFF で既に dead code (production 影響ゼロ)
> CEO 業判定で「flip 後の挙動が完全に安定」と判断後でないと L4-m 着手しない

→ legacy は **flag OFF で既に死んでいる**、code 削除 (L4-m) は安全寄り判断で **後回し**。production 影響ゼロのため急ぐ理由なし。

---

## §4 PR #95 / PR #122 / PR #123 との関係

### §4.1 PR #95 (L4-l 完了)

- 2026-05-10 merged、3 旗 ON + UpperLayerMount integration
- L4-m の **入口** (legacy auto-insert OFF にする env 変更を含む)

### §4.2 PR #122 (normal/daily/travel audit、2026-05-15 merged)

- §2.4 で「Stage 4 L4-l = 完了 (PR #95)」、L4-m = ⚠ 未確認 と記録
- §6 6-State で L4-m を「🟡 着手未達」と分類

### §4.3 PR #123 (Gap 4 design、2026-05-15 merged)

- Gap 4 = production-side context flag detection 未実装
- L4-m とは **直交**: L4-m = legacy code 削除、Gap 4 = production variant 発火
- 両者並行可能 (L4-m 待機中も Gap 4 design 進行可能)

---

## §5 legacy CoAlterCard 残存 code 実体

### §5.1 一次資料 (実コード grep)

**正本**: `app/components/coalter/CoAlterCard.tsx` 等

- legacy `CoAlterCard` component **残存** (但 auto-insert は flag OFF で発火しない)
- `coalter-preview` route 経由で **明示 mount は可能** (Preview / dev 用)
- production user route では auto-insert OFF のため legacy 経路は dead code

### §5.2 legacy が残っている理由 (一次資料)

`docs/coalter-legacy-cardplacement-retirement-plan.md`:
- **Stage 4 本実装**: CEO 承認で `ChatClient.tsx` に上部レイヤー導入。同時に legacy CoAlterCard の自動挿入を**明示 handoff 経由のみ**に置換
- **legacy 退役完了時期**: Stage 4 で別判断
- **L4-m 完了で legacy code 物理削除 + flag 削除**

→ legacy 残存は **Stage 4 L4-l flip 直後の safety net**、L4-m で物理削除予定。

---

## §6 退役条件 (CEO 判断材料)

### §6.1 L4-m 着手 trigger (3 件全満たし必要)

1. **時間条件**: L4-l flip 後 **2 週間以上** (= 2026-05-24 以降)
2. **挙動安定**: CEO 業判定で flip 後の挙動完全安定を確認
3. **ペア観測**: ≥ 50 ペア / 14 day 観測安定

### §6.2 L4-m 着手 trigger 発動後の手順

`docs/coalter-l4l-execution-runbook.md` §9.4:
- L4-m execution runbook (本書とは別) を CEO 別審議で起草
- 物理削除手順 + rollback 手順を最小単位で正本化

### §6.3 L4-m を**急がない**戦略的選択肢

- L4-l flip が安定していれば、L4-m を **遅延させる** 選択肢あり
- 急がない理由:
  - legacy は flag OFF で既に dead code
  - production 影響ゼロ
  - L4-m を遅延しても CoAlter 全体完了に **致命的影響なし**

→ **本 audit の判断**: L4-m は **「優先度低の整理 phase」**、急がない。Gap 4 / Travel / Daily Dispatch / Activity 等の greenfield design に CoAlter 全体リソースを集中する方が合理的。

---

## §7 Gap 4 (PR #123) との関係

### §7.1 直交 (両者独立)

| 軸 | L4-m | Gap 4 |
|---|---|---|
| 対象 | legacy code 物理削除 | production-side context flag detection |
| 影響 layer | code base cleanup | runtime UI variant 発火 |
| 完了条件 | code 削除 + flag 削除 + cleanup | detector impl + LIVE rollout |
| user-facing 影響 | なし (dead code 削除) | あり (Pattern variant 発火増加) |

→ L4-m と Gap 4 は **完全に直交**、両者並行可能、相互ブロックなし。

### §7.2 Gap 4 完成後の L4-m への影響

Gap 4 完成 (D7 LIVE phase) で Pattern variant が実 user に届くようになると:
- legacy CoAlterCard と新 UpperLayer の **対比** が user 視点で明確化
- legacy 完全削除の **判断材料が増える** (UpperLayer が機能していれば legacy 不要が明白)
- L4-m 着手 trigger 条件 2 (挙動安定) の評価がより accurate に

→ Gap 4 完成 **後** の L4-m 着手が **より自信を持てる**、ただし prereq ではない (Gap 4 なしでも L4-m 着手可能)。

---

## §8 production reachability との関係

### §8.1 production reachability の現状 (PR #123 §1.2 継承)

- ✅ Layout code 完了 + production deploy 済
- ✅ 3 旗 ON、ChatClient で UpperLayerMount integrated
- ⚠ **Gap 4 production-side context flag detection 未実装** → Pattern variant 発火薄
- → Layer 5 reach: **「Layer mount するが Pattern 発火薄」状態**

### §8.2 L4-m が production reachability に与える影響

- L4-m = legacy code 削除 = **code base cleanup のみ**
- production reachability (Pattern 発火率 / user 機能完了) は **L4-m と無関係**
- L4-m 後も reachability は不変 (Gap 4 解消が reachability の本質的 unblock)

→ **L4-m を急ぐ理由は reachability にない**。Gap 4 を優先すべき。

---

## §9 実装に入る前の checklist (本 audit 結論)

### §9.1 L4-m 着手前 checklist

| # | 項目 | 現状 |
|---|---|---|
| 1 | L4-l flip 後 2 週間以上経過 | ❌ 5 日経過のみ (2026-05-15 時点) |
| 2 | flip 後挙動完全安定 (CEO 業判定) | ⚠ 評価未 |
| 3 | ペア観測 ≥ 50 ペア / 14 day | ⚠ count 未 |
| 4 | CEO 別審議 trigger 発動 | ⚠ 未発動 |
| 5 | L4-m execution runbook 起草 | ❌ 未起草 (trigger 発動後に起草) |

→ **5 項目全未満たし**、L4-m 着手 timing 未到達。

### §9.2 推奨: L4-m を遅延させる戦略

- L4-l flip 後 1-2 ヶ月 (2026-06〜07) まで遅延
- その間に Gap 4 D2-D7 / Travel T1-T7 / Daily Dispatch DD1-DD6 / Activity AD1-AD6 等 greenfield に集中
- L4-m 着手は CoAlter 全体完了 cleanup phase に統合

→ **本 audit の推奨判断**: L4-m は **Phase 3 後** に着手 (greenfield 完了後の cleanup)、急がない。

---

## §10 まだやらない (本 audit scope 外)

- ❌ L4-m 着手 (CEO 別審議が prereq、本 audit は判断材料提供のみ)
- ❌ legacy CoAlterCard 物理削除 / flag 削除
- ❌ env / production / migration touch
- ❌ Gap 4 / Travel / Daily Dispatch / Activity との rollout 統合 (各 design phase で別判断)
- ❌ Step E 開始 / bug1 cleanup / Stargazer pivot
- ❌ 本 audit doc の merge (CEO 判断)

---

## §11 CEO 判断請求 (本 audit 結論)

1. **L4-m 着手 timing 判断** — 2026-05-24 (L4-l + 14 day) 以降の着手判定 vs 遅延 (Phase 3 後)
2. **L4-m を急がない戦略承認** — legacy は dead code、production 影響ゼロのため急ぐ理由なし、greenfield (Gap 4 / Travel / Daily Dispatch / Activity) に集中する方針承認
3. **L4-m vs Gap 4 / Travel / Daily Dispatch / Activity の優先順承認** — L4-m を **最後の cleanup phase** に position、greenfield design / impl に CoAlter 全体リソース集中
4. **L4-m execution runbook 起草 timing 判断** — 着手 trigger 発動後 (= ペア観測完了後) に起草、それまで起草しない

---

## §12 Layout / UpperLayer / Gap 4 / production reachability の残り (棚卸し)

本 audit 結論を整合 4 領域の状態整理:

| 領域 | 状態 | 次の action |
|---|---|---|
| **Layout (Stage 4 L4-l)** | ✅ 完了 (PR #95) | L4-m 着手前 monitoring 継続 |
| **UpperLayer (UpperLayerMount + ChatClient integration)** | ✅ 完了 (PR #95) | Gap 4 完成後に Pattern 発火増加 |
| **Gap 4 (production-side context detection)** | 設計完了 (PR #123)、impl 未 (D2-D7) | D2 impl 着手承認待ち (CEO 戦略判断) |
| **production reachability** | ⚠ Gap 4 未実装で variant 発火薄 | Gap 4 D7 LIVE phase で本質的解消 |
| **L4-m (legacy retirement)** | 🟡 着手未達 (5 項目 prereq 全未満たし) | 遅延推奨、Phase 3 後 cleanup |

→ **Layout / UpperLayer 完了** + **Gap 4 設計完了** + **L4-m 遅延推奨** = Stage 4 関連は **「現状で停止可、resources は別領域 (Travel / Daily Dispatch / Activity) に集中可能」** が本 audit の結論。
