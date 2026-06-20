# SR C-3: month view production enablement plan（readiness・docs-only）

> 区分: **enablement plan / readiness（docs-only）**。**flag ON しない・本番接触なし・deploy / push / PR / merge なし**。
> 前提: C-0 readiness（`alter-plan-month-view-enablement-readiness.md`）+ C-1 local smoke PASS（decision-log 2026-06-07）。
> 目的: 月 view を本番で有効化する前の rollout / rollback / 監視 / checklist を確定する。**有効化そのものは別 GO**。

---

## 1. 現在地

- **MonthGridView build 済**: 6×7 grid + 勤務コード chip（E/N/L/G/E-18・resolver 注入）+ 休み/希望休 chip（H/HREQ/BD）+ tint + selected/today/前後月 区別 + 月送り nav（◀ X月 YYYY ▶・clamp）。
- **imported（取込）marker 統合済**: per-cell「取込」（B-1）。
- **C-1 smoke PASS**: 実 CalendarTab 経由で `週|月` toggle / month 切替 / 週復帰 / 月送り / mobile 375px（CEO 確認）/ marker regression なし を確認（decision-log 2026-06-07）。
- **C-2 polish は現時点では不要（CEO 判定）**。
- 既存 test: render contract 6 本（monthGridView +§11 / calendarViewBody / calendarViewToggle / calendarTabMonthToggleGating / calendarViewMode / calendarMonthGrid）+ gate test、plan 全体 PASS。

→ **コードは有効化可能な完成度**。残るは「本番 env で flag を ON にする」運用判断のみ（別 GO）。

## 2. enablement 方針（本命）

```
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true にすると、
全ユーザーに「週|月」toggle が出る。
ただし default は week のまま（DEFAULT_CALENDAR_VIEW_MODE="week"）。
月 view は opt-in（ユーザーが「月」を tap したときだけ表示）。
```

- **低リスクの理由**: ① 既存 week 体験は不変（toggle が増えるだけ）② 月は明示 opt-in ③ 月送り nav 既存 ④ rollback は flag OFF で即 dormant。
- **重要な制約**:

```
per-user canary はこの NEXT_PUBLIC flag 単体では不可。
（NEXT_PUBLIC = build-time・global ＝全 client 一律。一部 user だけ ON は不可能）
```

- **per-user 段階出しが必要な場合**: **server-driven flag の別実装が必要**（例: server で user 判定 → CalendarTab へ `monthGridEnabled` を prop で渡す。`canaryUserIds` 方式の横展開）。本 plan の本命（global flag ON）とは別トラック。

## 3. rollout 案（段階）

| stage | 内容 | GO |
|---|---|---|
| **C3-0** | local/dev smoke PASS | **完了**（C-1） |
| **C3-1** | staging-like build smoke（本番同等 build で flag ON・week default 維持・toggle/month/mobile を実機確認） | **別 GO** |
| **C3-2** | production env flag ON readiness（本番 env への flag 設定手順・影響範囲・rollback 確認の最終整理） | **別 GO** |
| **C3-3** | production flag ON（`NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true` を本番 build env に設定 → redeploy） | **別 GO・CEO 承認必須** |
| **C3-4** | observe / rollback window（監視 §5・問題あれば即 rollback §4） | **別 GO** |

→ **C3-1 以降はすべて別 GO**。本書は段階の定義まで。

## 4. rollback

```
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=false
→ 再 build / redeploy
→ week default に戻る（toggle 消える）
→ MonthGridView は非表示
→ 既存 week / day view は維持（不変）
```

- NEXT_PUBLIC は build-time のため rollback も **再 build/redeploy** が必要（即時 toggle ではない）。これが per-user 不可と同根の制約。
- 緊急時に「即時 OFF」が要るなら、§2 の server-driven flag（runtime 評価）を別途設計。

## 5. 監視項目

```
- 月 view toggle のクリック率（opt-in の利用度）
- 「月 view で戻れない / 崩れる」報告
- mobile 表示崩れの報告
- imported marker 過密（フル取込月）の報告
- 月送りの混乱（過去月/未来月で迷う等）
```

## 6. production 前 checklist

```
- C-1 PASS 確認（local smoke 完了・decision-log 記録済）
- tsc（baseline 1112 維持）
- relevant tests（month/calendarView/toggle/monthGrid render contract + gate）green
- flag default / week default 確認（DEFAULT_CALENDAR_VIEW_MODE="week"・flag OFF で toggle 非表示）
- MonthGridView は production の save と無関係（presentational・read-only）
- DB write 不要（月 view は表示のみ）
- PLAN_SHIFT_IMPORT_SAVE とは無関係（別系統・取込保存 flag は触らない）
```

---

## 結論
- **本命 = global flag ON（`NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true`）で `週|月` toggle を出す**。default=week ゆえ低リスク（週体験不変・月 opt-in・rollback は flag OFF + redeploy）。
- **per-user canary は本 flag 単体では不可** ＝ 必要なら server-driven flag の別実装。
- rollout は **C3-0（完了）→ C3-1 staging smoke → C3-2 prod readiness → C3-3 flag ON → C3-4 observe**。**C3-1 以降は別 GO・C3-3 は CEO 承認必須**。
- **本書は docs-only。flag ON・本番接触なし。** 次は CEO が **C3-1（staging-like smoke）着手の可否**、または本番有効化方針（global flag ON で進めるか / per-user が要るか）を判断。
