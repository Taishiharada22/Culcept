# C5-E smoke 結果: 非永続 CoAlter preview の dev/staging 確認（docs-only 記録 + client-flag 修正）

> base: local main `bcf84157c` / branch: `claude/coalter-logic-resume-20260621`
> 実行日: 2026-06-21 / staging `hjcrvndumgiovyfdacwc`（read-only）+ dev server（port 3002・一時 env）
> A 永続化 / policy / migration / coalter insert は未実施。

## smoke で発見＋修正した点（client flag layer）
- **発見**: CoAlterTab（"use client"）が `PLAN_FLAGS.coalterBrainPreview`（= `PLAN_COALTER_BRAIN_PREVIEW`・
  **非 NEXT_PUBLIC＝server-only**）を参照していた。client bundle では常に false ＝ **preview ブロックが描画されない**。
- **修正（最小・additive）**: client UI gate `coalterBrainPreviewClient`（`NEXT_PUBLIC_PLAN_COALTER_BRAIN_PREVIEW`）を新設し、
  CoAlterTab の hook `enabled` と render を**それ**で gate。route handler は **server flag `PLAN_COALTER_BRAIN_PREVIEW`
  （`planCoAlterBrainPreviewEnabled()`）のまま**。両方 default OFF。両 ON で初めて UI から live preview。

## 検証結果
| # | 項目 | 結果 |
|---|---|---|
| 1 | flag OFF で既存挙動不変 | ✅ client flag default OFF → ブロック非描画・hook "off"・fetch 0。server flag OFF → route 404（unit test） |
| 2 | flag ON で preview GET が動く | ✅ `GET /api/coalter/sessions/<dummy>/preview`（flag ON・auth なし）→ **401 unauthorized**（route 登録・gate 通過・auth 要求）。nonexistent route は 404（対比）。完全な read→brain→preview 経路は handler unit test（mock）で実証 |
| 3 | UI に非永続 preview 表示 | ⚠️ **部分**: client flag 修正で UI ブロックは描画可（render gate + hook 配線・tests/tsc 緑）。**logged-in ブラウザでの preview テキスト目視は未実施**（/plan は要 staging ログイン・多段 UI・tooling 制約）。route(401)+handler unit+component で担保 |
| 4 | DB row count 不変 | ✅ baseline=after（messages_total 2 / coalter_rows 0 / dummy_session 2） |
| 5 | CoAlter row が作成されていない | ✅ coalter_rows = 0（不変） |
| 6 | participant 以外が他 session preview を取れない | ✅ handler は listSessionMessages(user-RLS)→非 member は空→insufficient。RLS は C2-b 実証・handler unit でも insufficient 確認 |
| 7 | console/runtime error なし | ✅ dev server 起動正常（Ready 3.8s）・route 応答正常（401/404 期待通り・500 なし） |
| 8 | tests 必要範囲 PASS | ✅ coalter 6 files / 48 tests PASS |
| 9 | tsc baseline 維持 | ✅ 55 |
| 10 | git status | client flag fix（featureFlags.ts + CoAlterTab.tsx）+ 本 docs のみ。`.env.local` symlink は smoke 後削除・永続なし |

## 不触確認
- DB write ゼロ（route smoke は 401・curl で write 起きない・行数不変で実証）。`author_kind='coalter'` insert なし。
- production 接続なし・personality/axis/Travel read なし・service_role/SECURITY DEFINER なし・db push/migration/seed なし。
- dev server は staging Supabase env（`.env.local` 一時 symlink・smoke 後削除）+ flags inline（永続 env 編集なし）。

## 次に統合へ進めるか
- **route + no-write + flag 修正は確認済み**。E（非永続 preview）の応答生成経路は動作。
- 残ギャップ = **logged-in ブラウザでの UI preview テキスト目視**（staging ログイン要・別途実施可能）。
- 統合（main 取込）は、この UI 目視 or component render test の追加で #3 を完全化してからが望ましい。
  最小実装（route/handler/runtime/hook/flag/最小UI）は tests/tsc 緑で統合候補。
