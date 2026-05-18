# Alter Plan W1-X2 — Anchor Edit UI Mini Design

**作成日**: 2026-05-18
**Status**: 採択（W1-X2 実装の起点）
**関連**: `docs/alter-plan-w1x1-mini-design.md` / `docs/alter-plan-w1x3-cell-add-mini-design.md`
**実装範囲**: 同一 PR (`feat/alter-plan-w1x2-edit-anchor`) で着地

---

## 1. 目的

W1-X1 で「教える」、W1-X3 で「レンズから教える」が揃った。
W1-X2 は **既存 anchor の「教え直す」** を最小経路で提供する。

「削除→再登録」を回避し、長期使用に耐える編集機能を beta user 渡し前に整える。

---

## 2. URL 設計（GPT 補正反映）

**最重要**: 既存と URL semantic を破壊しないよう、PATCH は **別 namespace** に分離。

```
/api/plan/anchors
  - GET: source + anchors 一覧
  - POST: source + anchors 作成 (bundle)
/api/plan/anchors/[sourceId]
  - DELETE: source 単位で「忘れさせる」
/api/plan/anchor-items/[anchorId]      ← W1-X2 新規
  - PATCH: anchor 単体を「教え直す」
```

同じ `[id]` でも前者は sourceId、後者は anchorId。**URL path で物理分離**することで「id の意味が method で変わる」混乱を排除。

---

## 3. やる / やらない

### やる
- `PATCH /api/plan/anchor-items/[anchorId]` 新規 endpoint
- Repository に `updateAnchor(userId, anchorId, patch)` method 追加（memory + Supabase）
- `anchor-update-validation.ts` pure 関数（existing + sanitized patch → full candidate → 既存 validator）
- `domainToFormState(anchor)` 変換 helper（既存 anchor → AnchorFormState）
- `parseWeekdaysFromRRule(rrule)` helper（RRULE → Weekday[] 逆引き）
- `AnchorFormFields` component extract（Add / Edit の form 共通化）
- `EditAnchorModal` 新規（kindMutable=false、context subtitle に「現在: ...」）
- `SourceListModal` の各 source に anchor 行 + 「教え直す」button
- fetch wrapper `updateAnchor(anchorId, patch)`

### やらない（範囲外）
- **kind 変更** (one_off ↔ recurring) — 別 wave
- **source 自体の編集** (sourceType / capturedAt / rawRetention)
- **anchorKind / id / userId / sourceId の patch** — sanitization で物理削除
- **bulk 編集 / undo history**
- Home / nav / 横スワイプ / W1-6 / W1-8 / Maps / migration / 外部 API

---

## 4. 不変原則

| # | 原則 | 機械的保証 |
|---|------|----------|
| 1 | URL semantic 維持 | PATCH は別 namespace `/anchor-items/` |
| 2 | id / userId / sourceId / anchorKind 改竄禁止 | PATCH route の最初で物理 delete（sanitization layer） |
| 3 | kind 不変 | merged.anchorKind = existing.anchorKind で強制上書き |
| 4 | RLS 二重防御 | DB の UPDATE policy `auth.uid() = user_id` + 明示 `.eq('user_id', userId)` |
| 5 | user 不一致 / not found 同一視 | 情報漏洩防止（既存 deleteSource と同パターン） |
| 6 | validation SoT 一本化 | `validateCreateExternalAnchorInput` を最終 gate に再利用 |
| 7 | EditAnchorModal close 時 reset | useEffect で isOpen transition（CEO 補正 4 継承） |

---

## 5. データフロー

```
[EditAnchorModal form (controlled)]
   ↓ submit (現在の form 状態すべて)
[buildAnchorInputFromForm() で input 形へ]
   ↓
[updateAnchor(anchorId, input)] ← fetch wrapper
   ↓ PATCH /api/plan/anchor-items/[anchorId]
[API route]
   ↓ auth.getUser() → userId
   ↓ body から id/userId/sourceId/anchorKind を sanitize 削除
[repository.updateAnchor(userId, anchorId, sanitizedPatch)]
   ↓ existing を fetch（user_id 確認）
   ↓ not found / mismatch → { ok:false, kind:'not_found' }
   ↓ merged = { ...existingAsInput, ...patch, anchorKind: existing.anchorKind }
   ↓ validateCreateExternalAnchorInput(merged)
   ↓ valid → UPDATE
[3 tab に refetch] ← PlanClient で onSuccess
```

---

## 6. 文言（Aneurasync 世界観）

| 用語 | NG | OK |
|------|----|----|
| Edit | 編集 | **教え直す** |
| Modal title | 編集 | **Alter に教え直す** |
| Submit | 保存 | **教え直す** |
| Cancel | キャンセル | **やめる**（既存と統一） |
| Source 単位削除 | 削除 | **忘れさせる**（既存と統一） |

---

## 7. ファイル構成

```
docs/alter-plan-w1x2-edit-anchor-mini-design.md

# C1: API + repository + validation
lib/plan/external-anchor-repository.ts                  # interface 拡張
lib/plan/external-anchor-repository-memory.ts           # memory impl
lib/plan/external-anchor-repository-supabase.ts         # Supabase impl
lib/plan/anchor-update-validation.ts                    # 新規 validateAnchorUpdate
lib/plan/weekday-template.ts                            # parseWeekdaysFromRRule 追加
lib/plan/anchor-fetch.ts                                # updateAnchor wrapper
app/api/plan/anchor-items/[anchorId]/route.ts           # 新規 PATCH route
tests/unit/plan/anchorUpdateValidation.test.ts          # 新規
tests/unit/plan/externalAnchorRepository.test.ts        # 既存 contract 拡張
tests/unit/plan/externalAnchorSupabaseRepository.test.ts  # Supabase 拡張
tests/unit/plan/anchorItemsApi.test.ts                  # 新規
tests/unit/plan/anchorFetchUpdate.test.ts               # 新規

# C2: UI
lib/plan/domain-to-form-state.ts                        # 新規 domain → form converter
app/(culcept)/plan/components/AnchorFormFields.tsx      # 新規 extract
app/(culcept)/plan/components/AddAnchorModal.tsx        # refactor: AnchorFormFields 利用
app/(culcept)/plan/components/EditAnchorModal.tsx       # 新規
app/(culcept)/plan/components/SourceListModal.tsx       # 拡張: 各 anchor「教え直す」
app/(culcept)/plan/PlanClient.tsx                       # edit modal state + handler
tests/unit/plan/domainToFormState.test.ts               # 新規

# C3: integration
tests/unit/plan/anchorEditFlow.test.ts                  # 新規 integration
```

---

## 8. 受容判定（DoD）

- ✅ PATCH /api/plan/anchor-items/[anchorId] が動作
- ✅ Repository updateAnchor が memory / Supabase 両方で同 contract
- ✅ EditAnchorModal が既存 anchor の値で開く
- ✅ kind 切替 disabled、注釈表示
- ✅ context subtitle に「現在: ...」表示
- ✅ Close 時 state reset
- ✅ SourceListModal の各 anchor に「教え直す」button
- ✅ Patch sanitization layer が id/userId/sourceId/anchorKind を削除
- ✅ user 不一致 / not found は同一視（404）
- ✅ 無認証 PATCH → 401
- ✅ invalid patch → 422
- ✅ AddAnchorModal の既存挙動が regression なし（既存 tests green）
- ✅ `npx tsc --noEmit` 0 errors / `npx vitest run tests/unit/plan/` 全 PASS / `npm run build` PASS

---

**結論**: W1-X2 で「教える」「教え直す」「忘れさせる」の 3 動詞が揃う。beta user 渡し前の完成度に到達。
