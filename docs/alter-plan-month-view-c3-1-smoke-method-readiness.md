# SR C3-1: smoke method preflight readiness（docs-only）

> 区分: **preflight / method readiness（docs-only）**。**flag ON しない・build smoke 実行しない・production / deploy / push / PR / merge なし**。
> 目的: C3-1（staging-like build smoke）を実行する前に、「dev fixture が production build で使えるか」を確定し、C3-1 の正しい方式を決める。
> 前提: C-1 local dev smoke PASS（decision-log 2026-06-07）。C-3 enablement plan（`alter-plan-month-view-enablement-plan-c3.md`）。

---

## 0. 起点となった懸念（CEO 指摘・検証済）

C-1 で使った `/plan/dev-source-marker-smoke` は **`NODE_ENV !== "production"` で gate** されている。
`next build && next start` は **NODE_ENV=production** で動くため、dev fixture route は **`notFound()`** になる。
→ **C-1 で使えた fixture が C3-1（production-like）でも使えるとは限らない**。これを確認せず実行すると route/gate で詰まる。

### read-only 検証結果（事実）
| # | 確認 | 結果 |
|---|---|---|
| 1 | 月 flag の効き方 | `calendarMonthGridEnabled = process.env.NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED === "true"`（**NEXT_PUBLIC = build-time inline・client bundle 焼込・global**） |
| 2 | dev fixture は build で使えるか | gate = `flag==="true" && nodeEnv!=="production"`。`next build`/`start` は NODE_ENV=production → **gate false → `notFound()`**。**production build では fixture 不可視** |
| 3 | それは正しいか | **正しい**。dev fixture は production で notFound であるべき（本番で dev route が見えるのは誤り）。dev-a4-smoke と同方針 |
| 4 | 月 view code は flag で消えるか | CalendarTab は flag を **runtime 参照**（`{showViewToggle && ...}`）。**月 view code（CalendarViewToggle / MonthGridView）は flag に関わらず常に bundle**・tree-shake されない |
| 5 | flag-ON build と flag-OFF build の差 | **inlined boolean のみ**（`true` vs `false`）。compile される code は同一。**flag 固有の build path は無い** |

→ **重要帰結**: 「flag-ON で build が通るか」は実質「production build が通るか」とほぼ同義（flag は runtime boolean）。production-like の **visual** を dev fixture で見ることは不可（notFound）。

---

## 1. dev fixture route は production build で使うべきか / 使えないか

- **使えない**（production build で `notFound()`）。**かつ、それが正しい**（dev fixture は本番不可視であるべき）。
- 従って **C3-1 を「production build 上で fixture を開いて visual 確認」する方式は成立しない**。

## 2. C3-1 で何を検証すべきか

- **production build が成功するか（build health）** + **flag ON が build を壊さないか（NEXT_PUBLIC inline の sanity）**。
- visual は **C-1 で済**（dev mode）。dev と production の render は同一 React component / CSS のため **dev visual は production visual を代表**（minify 等は見た目を変えない）。production-mode の追加 visual は dev fixture では不可（notFound）であり、必須でもない。

## 3. C3-1 の選択肢整理 + 推奨

| 案 | 内容 | 評価 |
|---|---|---|
| **A. build verification only（推奨）** | `NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true` で `next build` が通るか確認。visual はしない | **推奨**。flag は build-time が本質。flag-ON build 成功 = enablement の前提が一段固まる。低リスク・自動検証 |
| B. dev fixture visual smoke | C-1 で実施済（toggle / month / 月送り / mobile / marker） | **完了済**。再実施不要 |
| C. authenticated /plan で staging-like smoke | 実ログイン + 実データ前提。DB write なし。ただし取込 marker は実 import データ依存 | **任意・後段**。本番有効化後の観測に寄せる。事前必須でない |
| D. production-like fixture を別設計 | dev route の production-notFound 方針と衝突 | **やらない**（今は実装しない） |

### 推奨 = A（build verification only）
- 理由: ① visual は C-1 で PASS 済 ② NEXT_PUBLIC flag の本質的リスクは build-time 反映 ③ `next build` with flag true が通れば production enablement の前提が固まる ④ dev fixture は production notFound でよい（本番で見えないのが正しい）。
- **honest nuance**: 月 view code は常に bundle されるため、flag-ON build ≈ 通常 build + inlined boolean。よって A の主価値は「**production build が健全か**」の確認であり、flag 固有の新規 compile path を検証するものではない。それでも enablement 前 gate として有効。

## 4. build verification のコマンド案（**実行は C3-1 本体・別 GO**）

```
# flag ON で production build が通るか（deploy / start しない・build のみ）
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true npm run build
# （npm run build = NODE_OPTIONS=--max-old-space-size=4096 next build --webpack）
```

- **実行前 preflight 注意**:
  - **untracked `dev-month-grid/*` は app/ 配下 → `next build` の compile 対象に含まれる**。build 健全性を flag だけに帰属させるため、build verification 前に dev-month-grid を退避/削除確認すると切り分けが明確（throwaway なので影響軽微だが要認識）。
  - build は重い（OOM 注意・heap 4096 指定済）。実行は C3-1 本体で。
  - **build のみ。`next start` / deploy はしない**（本 readiness 範囲外）。
- 判定: build **exit 0 + ルート生成エラーなし** なら PASS。fixture route は production で notFound だが build 自体は成功（dynamic route 扱い・gate→notFound は実行時挙動）。

## 5. visual smoke を追加でやる必要があるか

- **不要**。C-1 dev smoke で toggle / month / 月送り / mobile / marker を確認済。dev≈production の render 一致。dev fixture は production で notFound（visual 不可・かつ不要）。
- 本番の実 visual を見たい場合は **C（authenticated /plan + 実データ）= 有効化後の観測**で代替。事前 gate に含めない。

## 6. C3-2 / C3-3 に進む条件

```
- C3-1 build verification PASS（flag ON で next build exit 0）
- tsc baseline 1112 維持
- relevant tests green（month / calendarView / toggle / monthGrid render contract + gate）
- flag default / week default 確認（DEFAULT_CALENDAR_VIEW_MODE="week"）
- MonthGridView は save と無関係・DB write 不要・PLAN_SHIFT_IMPORT_SAVE と無関係
→ 揃えば C3-2（production env flag ON readiness）。C3-3（本番 flag ON）は CEO 承認必須
```

## 7. rollback 方針

```
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=false → 再 build / redeploy
→ week default に戻る（toggle 消滅）・MonthGridView 非表示・既存 week/day view 維持
（NEXT_PUBLIC は build-time のため rollback も rebuild/redeploy が必要。即時 OFF が要るなら server-driven flag の別設計）
```

## 8. 禁止事項（本 readiness 中も厳守）

```
NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED を .env.local に恒久追加しない
production flag ON しない / build smoke 実行しない / deploy しない
push / PR / merge しない
DB write / 保存再実行 / VLM 再実行 / PLAN_SHIFT_IMPORT_SAVE=true しない
proxy.ts 変更 / auth 例外追加しない
productization branch に直接追加しない
```

---

## 結論
- **dev fixture は production build で notFound（仕様通り・正しい）** → C3-1 を「production build 上で fixture visual」でやる方式は成立しない。
- **C3-1 の推奨方式 = A（build verification only）**: `NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED=true npm run build` の成功確認。visual は C-1 で済・追加不要。
- **honest nuance**: flag は runtime boolean で月 code は常に bundle ＝ flag-ON build ≈ 通常 build。A の主価値は production build 健全性の確認。
- **本書は docs-only。build smoke 実行・flag ON・本番接触なし。** 次は CEO が **C3-1（build verification・別 GO）着手の可否**を判断。
