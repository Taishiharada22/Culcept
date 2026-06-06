# SR C3-3: month view dogfood ON judgment（docs-only・実行しない）

> 区分: **judgment / 判断材料（docs-only）**。**flag ON しない・deploy しない・vercel env 変更しない・push / PR / merge しない**。
> 前提: C-1 dev smoke PASS / C3-1 build verification PASS（`flag=true npm run build` exit 0）/ C3-2 readiness `83bb0e3c`。
> 目的: 内部 dogfood（開発段階・CEO 本人のみ閲覧）として月 view を ON にできる状態か、**実行せず**判断材料を作る。

---

## 0. deploy feasibility（read-only 調査結果）

| 項目 | 事実 |
|---|---|
| deploy 経路 | **Vercel**（`vercel.json` 存在・GitHub push 連動）。`package.json` build=`next build --webpack` / start=`next start` |
| vercel.json | `ignoreCommand` で **.md のみの diff は build を skip**（docs-only commit は deploy を起動しない）。crons 定義あり |
| CI | `.github/workflows/`: `ci.yml` / `staging-smoke.yml` / `expire-orders.yml` |
| remote | `origin = github.com:Taishiharada22/Culcept.git`（設定はあるが **GitHub 未復旧 + push/remote 禁止**） |
| 本 branch | `feat/plan-shift-month-grid-reflection`・**local-only（未 push）**・productization branch（PR 待ち freeze）に stack |
| build 成果 | `.next` 生成済（C3-1 build PASS） |

→ flag は **Vercel の env var**（`NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED`）として project 設定 + redeploy で反映する方式。

## 1. C3-3 で実際に ON にする flag

```
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true
```

- これ 1 個のみ（`PLAN_FLAGS.calendarMonthGridEnabled` を駆動）。NEXT_PUBLIC = build-time inline。

## 2. 影響

- **全ユーザーに `週 | 月` toggle 表示**。**default は week**。**月 view は opt-in**（「月」tap 時のみ MonthGridView）。
- 既存 week / day view は不変。dogfood 段階は CEO 本人のみ閲覧のため、実質「CEO 自分の /plan に月 toggle が出る」状態。

## 3. 現在 ON できるか

**今は実行不可（保留）。**

理由（いずれも現状の制約）:
- 本 branch は **local-only（未 push）** → Vercel は GitHub の branch を deploy するため、push しないと Vercel に渡らない。
- **GitHub 未復旧 + push / PR / merge / remote 操作 禁止** → branch を Vercel へ送る経路がない。
- **Vercel env 変更 禁止**（本タスクの NG）→ flag を Vercel project に設定できない。
- 本 branch は **freeze 中の productization branch に stack**（PR 待ち）。

→ **コードは build 検証済で ready だが、enablement（Vercel env + deploy）の経路が現状塞がっている**。dogfood ON は GitHub/remote 復旧 + CEO GO 後。

（補足: ローカル dev での dogfood なら `.env.local` に flag を足せば CEO のローカル /plan で即出るが、**本タスクは `.env.local` 編集を禁止**しているため実施しない。必要なら別途 CEO 指示で。）

## 4. 実行可能になった時の手順（GitHub/remote 復旧 + CEO GO 後）

```
1. branch を deploy 対象へ反映（push / PR / merge — CEO 承認 + GitHub 復旧後）
2. Vercel production build env に NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true を設定
3. rebuild / redeploy（Vercel・.md 以外の変更があれば自動 build / または手動 redeploy）
4. smoke 確認: /plan で 週|月 toggle 出現・default=week・月 view 描画・崩れなし
5. observe / rollback window（§5 監視・異常時 rollback）
```

## 5. rollback

```
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=false → rebuild / redeploy
→ week default へ戻る（toggle 消滅）・MonthGridView 非表示・既存 week/day view 維持
```

- NEXT_PUBLIC は build-time のため rollback も rebuild/redeploy 必須。即時 OFF が要件なら server-driven flag の別設計。

## 6. 絶対に触らないもの

```
PLAN_SHIFT_IMPORT_SAVE（取込保存 flag）— 別系統・触らない
DB（write 不要・月 view は read-only presentational）
VLM / save path — 月 view と無関係
```

---

## 結論
- **deploy 経路 = Vercel（GitHub push 連動）**。月 view は build 検証済・enablement は env 1 個 + redeploy。
- **dogfood ON は今は実行不可（保留）**: local-only branch + GitHub 未復旧 + push/remote/vercel-env 禁止で、Vercel への反映経路が現状ない。
- **ON 可能条件**: GitHub/remote 復旧 + CEO GO → branch 反映 → Vercel env flag=true → redeploy → smoke → observe。
- **本書は docs-only・実行なし。** 次は CEO が、GitHub/remote 復旧後に **C3-3 実施（Vercel env flag ON + redeploy）** を行うか、または local `.env.local` dogfood を別指示するかを判断。
