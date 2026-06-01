# 予定追加リデザイン Phase A — A-5 smoke closeout

- **対象**: `/plan` 予定追加 2カラム・タイムライン体験（compose）。設計書: `docs/alter-plan-add-anchor-timeline-redesign-proposal.md`。
- **状態**: **A-5 = functional smoke PASS**（CEO 実機確認 2026-06-01）。
  - ⚠️ **「UI 完成」「理想画像に到達」ではない。** UI fidelity は理想画像と距離があり、次フェーズ（UI polish）対象。
- **flag**: `PLAN_COMPOSE_TIMELINE_ENABLED` 既定 **false** 維持。本番有効化は CEO 承認案件（本 closeout では行わない）。
- **branch**: `claude/nifty-turing-128e67`。

---

## 1. functional smoke で PASS した点（CEO 実機 2026-06-01）

| # | 確認 | 結果 |
|---|---|---|
| 1 | flag ON で新しい 2カラム予定作成シートが開く | ✅ |
| 2 | 予定作成（なにを / どこで） | ✅ |
| 3 | 左タイムラインへ配置（ドラッグ / 吸着） | ✅ |
| 4 | 完了で保存 → `/plan` に反映 | ✅（log: `anchors_length: 2` で通常予定保存） |
| 5 | 日跨ぎ予定は保存除外され、タイムラインにも保存にも乗らない | ✅ |

→ **機能としては成立**（素材作成 → 配置 → 保存 → 既存タブ反映）。

---

## 2. 明示確認項目（CEO 指摘・固定済み）

**「日跨ぎのみ配置して完了」= API 保存を走らせず、警告 notice だけ。**

- 実装: `lib/plan/compose/composeToAnchorInput.ts` の `planComposeSave(drafts, dateISO)` を pure 化。
  - inputs が空（配置なし / 日跨ぎ等で全除外）→ `kind: "nothing_to_save"` → container は **`createAnchorBundle` を呼ばない**（警告 notice のみ）。
  - inputs あり → `kind: "save"`（有効分のみ保存、wrap は `excluded`）。
- 固定テスト: `tests/unit/plan/compose/composeToAnchorInput.test.ts`「planComposeSave — 保存判断」
  - 日跨ぎのみ → `nothing_to_save`（API 非呼び出しを保証）
  - 配置なし / unplaced のみ → `nothing_to_save`
  - 有効 placed あり → `save`／有効＋日跨ぎ混在 → `save`（有効分のみ・wrap excluded）
- **回帰防止チェック項目（A-5 smoke にも残す）**: 日跨ぎのみ配置 → 完了 → ネットワークに POST が出ないこと（実機/Network タブ）。

---

## 3. 未達（明記）— UI fidelity は理想画像に未到達

functional pass であって UI 完成ではない。理想画像（CEO 提示 3 枚）との差分は次フェーズで詰める。

**次フェーズ = UI fidelity polish（Phase B / Alter 補完ではない）**。CEO 指示の方向:

1. 左タイムラインをもっとコンパクトにし、1 日を見渡せるようにする
2. 右フォームと左タイムラインの余白・比率を理想画像に近づける
3. ボトムシート全体をスマホ内に収める
4. 予定カードの見た目をもっと浮遊感のあるカードにする
5. ドラッグ中のカードとゴースト枠を理想画像に近づける
6. 完了ボタンの位置とサイズを整理する
7. **Phase A では Alter 補完カードはまだ出さない**

---

## 4. Phase A 全体の状態

| Sub-phase | 内容 | 状態 |
|---|---|---|
| A-1 | pure 層（timeline-geometry / composeDraft / time resolver） | ✅ 実装・test |
| A-2 | 見た目の骨格（presentational 4 コンポーネント） | ✅ 実装・render test |
| A-3 | 配置体験（container + drag + ghost + 削除/戻す） | ✅ 実装・test |
| A-4a | 保存境界 converter（pure） | ✅ 実装・test |
| A-4b | flag + page.tsx + PlanClient 最小分岐 + 保存 | ✅ 実装・test（flag OFF 不変） |
| A-5 | 実機 smoke | ✅ **functional PASS**（UI fidelity 未達） |

- 検証総計: compose+geometry unit/render **97 PASS**（A-5 hardening +4 含む）／既存 PLAN_FLAGS・PlanClient 参照 **143 PASS**（非回帰）／tsc baseline **1112 不変**。
- **Alter 補完（Phase B）は未着手・据え置き**（CEO 指示で次は UI polish）。
- **本番 flag 有効化は未実施**（既定 false。CEO 承認案件）。

---

## 5. 次の stop

- 本 closeout を commit して停止。
- **次フェーズ = UI fidelity polish**（§3 の 7 方向）。Phase B（Alter 補完）・migration・本番有効化には進まない。
- 着手は CEO GO 後。
