# SR C3-2: month view production env flag ON readiness（docs-only）

> 区分: **production enablement readiness（docs-only）**。**本番 flag を ON にしない・deploy しない・push / PR / merge なし**。
> 前提: C-1 dev smoke PASS / C3-1 build verification PASS（`NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true npm run build` exit 0・362/362 static pages・decision-log 2026-06-07）。
> 目的: 実際に本番 env flag を ON にする前の最終設計。**ON 自体は C3-3・CEO 承認必須**。

---

## 1. どの環境変数を本番に設定するか

```
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true
```

- これ 1 個のみ。`PLAN_FLAGS.calendarMonthGridEnabled` を駆動。
- **NEXT_PUBLIC = build-time inline** ＝ **本番 build 環境に設定 → redeploy** で反映。runtime 設定では効かない。
- 他 flag（`PLAN_SHIFT_IMPORT_SAVE` 等）は **触らない**。

## 2. 影響範囲

- **全ユーザーに `週 | 月` toggle 表示**。**default は week**。**月 view は opt-in**（「月」tap 時のみ MonthGridView）。
- → 既存 week / day view 体験は不変（toggle が増えるのみ）。月送り nav 既存。取込 marker は実 import データのある月にのみ出る。

## 3. per-user canary 可否

```
per-user canary 不可（NEXT_PUBLIC global build-time flag のため）
```

- NEXT_PUBLIC は build 時に client bundle 焼込・全 client 一律 ＝ 一部 user だけ ON 不可。
- 必要なら **server-driven flag の別実装**（server で user 判定 → CalendarTab へ `monthGridEnabled` prop。`canaryUserIds` 方式の横展開）。本書範囲外・別トラック。

## 4. rollback

```
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=false → 再 build / redeploy
→ week default へ戻る（toggle 消滅）・MonthGridView 非表示・既存 week/day view 維持
```

- NEXT_PUBLIC は build-time のため rollback も rebuild/redeploy 必須（即時 OFF でない）。即時性が要件なら server-driven flag。

## 5. production 前 checklist

```
- C-1 PASS（dev smoke・decision-log 済）
- C3-1 build PASS（flag ON で next build exit 0・decision-log 済）
- relevant tests green（month / calendarView / toggle / monthGrid render contract + gate）
- tsc baseline 1112 維持
- flag default / week default 確認（DEFAULT_CALENDAR_VIEW_MODE="week"）
- MonthGridView は save と無関係（presentational・read-only・DB write 不要）
- PLAN_SHIFT_IMPORT_SAVE とは別系統（取込保存 flag は触らない）
```

## 6. rollout（段階）

| stage | 内容 | GO |
|---|---|---|
| **C3-0** | local/dev smoke | **完了**（C-1） |
| **C3-1** | build verification（flag ON で next build） | **完了 PASS** |
| **C3-2**（本書） | production env flag ON readiness | **docs（完了）** |
| **C3-3** | **本番 flag ON**（build env に flag=true → redeploy） | **CEO 承認必須・別 GO** |
| **C3-4** | observe / rollback window（§4 監視 + 異常時 rollback） | **別 GO** |

---

## 結論
- 本番有効化 = **env 1 個（`NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true`）を build env に設定 → redeploy**。default=week ゆえ低リスク（週体験不変・月 opt-in・rollback は flag false + redeploy）。
- **per-user canary は本 flag では不可**（NEXT_PUBLIC global）→ 必要なら server-driven flag 別実装。
- C-1 / C3-1 PASS 済 + §5 checklist で **C3-3 の前提は揃う**。**C3-3 は CEO 承認必須・別 GO**。
- **本書は docs-only。flag ON・deploy・本番接触なし。** 次は CEO が **C3-3 実施 / per-user 段階出し設計 / 保留** を判断。
