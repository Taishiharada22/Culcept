# SR shift import — production enablement readiness（docs-only・設計書）

> 区分: **readiness（docs-only・本番化の設計書）**。**本番有効化そのものは一切しない**。
> OK: production enablement の段階・手順・gate 整理。NG: migration apply / production flag ON / DB write / push / PR / deploy。
> 前提（inventory `361873af`）: 8 帯 local 着地・**全 flag default OFF**・**branch に新規 migration なし**・proxy.ts 非変更・save action は production-deny + staging-allowlist guard 済。

---

## 1. 本番化の段階（P0→P5・段階厳守）

| Phase | 内容 | gate / 完了条件 | DB/本番接触 |
|---|---|---|---|
| **P0** | merge readiness / branch cleanliness | B1（`.temp` 復元）+ B2（dev route 方針）解消 → tsc 1112 / 全 test PASS → CEO merge 承認 | なし |
| **P1** | production schema readiness | production の **schema probe（read-only）**で `sr_shift_import_*` migration の適用状態を確認 → 未適用なら apply 計画（**CEO + DB gate**） | read-only probe のみ |
| **P2** | production flag dry-run | production で **save なし**の flag 構成（entry/live のみ）を 1 つずつ ON → 取込→確認画面→A4 warning まで（**保存 disabled 維持**） | DB write なし |
| **P3** | limited canary | userId allowlist 等で**少人数**に entry/live を開放（保存はまだ disabled） | DB write なし |
| **P4** | save-enabled canary | guard を staging→production allow に**段階解放** + `PLAN_SHIFT_IMPORT_SAVE` ON を**canary 範囲のみ** → 実保存を少数で観測 | **限定 DB write**（別 gate） |
| **P5** | broader rollout | canary 観測 OK → allowlist 拡大 → 全体 | DB write |

→ **各 Phase 間に CEO 判断 + probe**。飛ばさない。今回の readiness は **P0 の設計まで**を確定し、P1 以降は各 Phase 着手時に別 readiness/別 GO。

## 2. production migration apply の扱い

- 対象 migration（**main 既存・branch で追加なし**）: `20260530100000_sr_shift_import_source_type_and_day_indicators.sql`（source_type + plan_day_indicators）/ `20260531100000_sr_shift_import_rpc.sql`（保存 RPC）。
- **staging = 検証済**（S-save-1B link/probe + save smoke PASS）。**production = 未適用 / 未確認**。
- **production apply は CEO + DB gate**（Claude は実行しない）。手順（P1 で別 GO）:
  1. **apply 前**: production schema probe（read-only）で当該 migration の適用有無・既存 table 形状を確認。
  2. apply（CEO/DB op）。
  3. **apply 後**: read-only probe で table/RPC/CHECK 制約の存在を確認（書き込みなし）。
- **本 readiness では apply しない。**

## 3. production-deny / staging-allowlist guard の段階解放

現状（`importShiftRoster.ts` → `runShiftImportSave`）= **多重防御**:
- (a) flag `isShiftImportSaveEnabled`（`PLAN_SHIFT_IMPORT_SAVE`・server-only・default OFF）。
- (b) **S-save-0 接続先 URL guard**: `connectionUrl`（SUPABASE_URL）を `STAGING_PROJECT_REF`（allowlist）/ `PRODUCTION_PROJECT_REF`（deny）と照合。**production を指す/staging 不一致/未設定 → guard NG → disabled**（auth/projection/RPC 未到達）。flag だけに頼らず env 誤設定でも遮断。

段階解放（**P4 で・実装は別 GO**）:
- **いつ**: P1（schema apply 済）+ P2/P3（save なし canary）通過後。
- **条件**: production schema 確認済 ∧ rollback 手順確定 ∧ canary allowlist 確定 ∧ CEO 承認。
- **どうやって**: guard を「production deny 固定」→「**canary 限定で production allow**」へ。最小実装案（**今は書かない**）: production ref を allow するのは `PLAN_SHIFT_IMPORT_SAVE_CANARY` 等の**第2の明示 flag** + userId allowlist が揃ったときのみ、という**二重 opt-in**。flag 1 個では本番保存が開かない設計を維持。
- **本 readiness では guard を変更しない。**

## 4. flag rollout（4 flag を分離）

| flag | scope | rollout 方針 |
|---|---|---|
| `NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED` | client（入口） | **P2/P3** で先行（entry 可視化）。保存とは独立 |
| `PLAN_SHIFT_DRAFT_LIVE_ENABLED` | server（live VLM） | **P2/P3**（live draft flow）。コスト/品質観測しながら |
| `PLAN_SHIFT_IMPORT_SAVE` | server（保存） | **P4 で最後**・canary 限定。guard 解放（§3）と同時 |
| `PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW` | server（dev smoke route） | **production では常に OFF / notFound のまま**（gate に NODE_ENV≠production 既込み）。**rollout 対象外**・本番で開けない |

- 原則: **entry/live を先、save を最後**。flag は 1 個ずつ ON し各段で probe。

## 5. dev route 方針（main に載せるか / 剥がすか・判断材料）

| route | gate | production | auth | smoke/回帰価値 | main 残置リスク |
|---|---|---|---|---|---|
| `dev-shift-draft` | `PLAN_SHIFT_DRAFT_HOST` + staging supabase + production deny + **auth** | notFound | あり | live draft host（手動検証） | 低（多重 gate・auth） |
| `dev-shift-fixture` | flag gate | notFound | あり | fixture 検証 | 低 |
| `dev-a4-smoke` | `PLAN_SHIFT_A4_VISUAL_SMOKE_PREVIEW` + NODE_ENV≠production | notFound | あり（proxy.ts） | A4 回帰 smoke の土台 | 低（gated・production notFound・auth） |

- いずれも **production で notFound**（gated）+ **auth 配下**。本番不可視。
- **選択肢**: (i) gated のまま main に残す（回帰価値・低リスク）/ (ii) **release 前に剥がす**（main を最小に保つ）。
- **推奨**: P0 で CEO 判断。デフォルトは **(i) 残置**（全 gated・production notFound・回帰価値あり）。剥がす場合は P5 直前に別 commit で削除。
- **本 readiness では削除しない。**

## 6. merge 前 cleanup（B1）

`supabase/.temp/*`（8 tracked CLI cache・S-save staging link で変更）を HEAD へ復元:
- **禁止 `git checkout --` / `git restore .` は使わない**（State Safety Hook ブロック）。
- 復元: `git show HEAD:supabase/.temp/<file> > supabase/.temp/<file>` を 8 ファイル個別に。
- **stage しない**（これらは ephemeral・コミット対象外）。
- 復元後 `git status` が（dev-month-grid untracked を除き）clean になることを確認。
- **本 readiness では復元作業はしない**（P0 着手時に別 step）。

## 7. production smoke（保存なし先行）

production で確認するなら **最初は save なし**で段階確認（P2/P3）:
1. **entry visible**（入口 flag ON → 取込ボタン出現）。
2. **live draft flow**（live flag ON → VLM 抽出 → draft）。
3. **review**（確認画面・原画像照合・校正）。
4. **A4 warning**（空欄×content の source_mismatch が出るか）。
5. **save disabled**（保存 CTA dormant・DB write ゼロ）。
- → ここまで OK で初めて **save canary（P4・別 gate）**。

## 8. rollback（必須）

| 事象 | rollback |
|---|---|
| 異常検知 | **flag 即 OFF**（entry/live/save 全て env から外す → dormant） |
| 保存暴発の懸念 | **save guard を production-deny 固定へ戻す**（§3 の二重 opt-in を外す） |
| 環境誤設定 | **production env rollback**（接続先 URL を正へ・guard が deny に戻る） |
| test write 混入 | **DB cleanup**（canary で書いた行を特定し削除・CEO + DB op） |
| 全般 | monitoring + **decision-log に事象/対応/原因を記録** |

- 原則: **flag OFF だけで即 dormant に戻せる**設計（guard + flag の二重防御がそのまま rollback 経路）。

## 9. 監視・証跡

- **decision-log**: 各 Phase の probe 結果・smoke 結果・flag 変更・rollback を記録。
- **SQL probe（read-only）**: 適用 migration / table 形状 / CHECK 制約。
- **counts**: source counts（import_shift_roster source）/ external_anchors / plan_day_indicators の前後差分（canary で意図通りか）。
- **non-storage 確認**: raw 画像 / base64 / canvas data を **DB にも payload にも保存していない**ことを確認（座標/コードメタのみ）。
- **error 分類**: guard NG / auth / RPC error / validation / cost cap を分類。

## 10. まだ禁止（本 readiness 中も厳守）

```
production migration apply / production flag ON / DB write / PLAN_SHIFT_IMPORT_SAVE=true /
VLM 再実行 / 保存再実行 / push / PR / deploy / proxy.ts 変更 / auth 例外追加 /
raw 画像・base64・VLM raw response commit
```

---

## 結論
- 本番化は **P0（merge cleanliness）→ P1（schema）→ P2/P3（save なし canary）→ P4（save canary・別 gate）→ P5（rollout）** の段階厳守。
- **save は最後**・**guard + flag の二重 opt-in**・**A4 smoke flag は本番 OFF 固定**・**rollback は flag OFF で即 dormant**。
- **本書は設計書（docs-only）。実行は各 Phase で CEO + 別 GO**。次は CEO が **P0 着手（B1 復元 + B2 dev route 判断 + merge 承認）** の可否を判断。
