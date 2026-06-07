# A1-0 — GPS audit + actual pace capture mini-design（★前回 A1 audit を訂正）

> 2026-06-08 / Build Unit / CEO「GPS は Culcept 側に実装済（culcept-staging には無い）・既存を確認してから進めよ」。
> ★**訂正**: `…-a1-personal-pace-audit.md` の「actual signal なし／measured pace 不可」は**誤り**（`navigator.geolocation` を grep せず completedAt のみ見た監査ミス）。GPS は実装済で **actual pace capture は実現可能**。

---

## 1. ★GPS audit（GPT の 7 確認項目・実コード）
| # | 確認 | 結果（file 根拠） |
|---|---|---|
| 1 | GPS を /plan から使えるか | ✅ **使える**。`MapTab.tsx:975-981` が `navigator.geolocation.getCurrentPosition`（現在地ボタン）。`pos.coords.latitude/longitude` 取得済。 |
| 2 | permission / currentPosition / watchPosition の実装場所 | ✅ 体系あり。`lib/alter-morning/journey/locationOptIn.ts`（opt-in record・localStorage `aneurasync.location-opt-in.v1`・grant/decline/snooze）/ `currentLocationGating.ts`（accuracy≤1000m・age≤30min の gate・`evaluateCurrentLocation`）/ `permissionState.ts`（`subscribeGeolocationPermissionState`）/ `LocationOptInBanner.tsx`（UI）。watchPosition は journey 系に存在（MapTab は one-shot getCurrentPosition）。 |
| 3 | raw GPS を保存しているか | ✅ **保存していない**（grep: coords/lat/lng の setItem なし）。localStorage は opt-in **state** のみ。MapTab は座標を地図 center に使うだけで永続なし。→ **「raw GPS 永続禁止」は既に満たされている**。 |
| 4 | location ↔ Event/DayGraph/PlanItem 紐付け | ✅ **可能**。anchor は coords を持つ（`usePlanBaseline().baselineCoords` / `legCoordsByKey` / `GmapsLatLng` / `isValidLatLng`）。→ geofence（現在地 vs anchor 座標の距離）が計算可。 |
| 5 | departure / arrival / completedAt を安全に定義できるか | ✅ **定義可**（geofence + dwell + gating）。ただし MapTab は one-shot getCurrentPosition（foreground）ゆえ **sample は疎**（app を開いた時だけ）→ 検出は opportunistic・confidence は low になりやすい → **GPS 推定 + user 確認**が必須（GPT 方針と一致）。 |
| 6 | sensitive leg で blackout できるか | ✅ **可能**（`MovementPrivacyClass` / `sensitiveCategory` / `sensitiveProximity` 既存）。sensitive leg は capture しない。 |
| 7 | manual correction を入れられるか | ⚠️ 既存なし・**設計可**（GPS 推定 →「到着したようです・記録しますか？/違う」）。 |

→ **結論: actual pace capture は実現可能**。ただし foreground 疎 sample ゆえ **推定 + 確認**が誠実。background 常時 GPS は禁止（GPT）。

## 2. 設計方針（GPT 採用・honest）
- per-leg の **観測**として `{ actualDepartureAt, actualArrivalAt, completedAt, actualDurationMin, confidence(high/medium/low), source(gps/manual/inferred) }`。
- **初期 = GPS 推定 + user confirmation**（自動 GPS だけを真実にしない・誤観測防止）。
- ★**raw GPS の永続保存は禁止**（derived metric のみ保存）。
- local-first / foreground・app open 中心 / background GPS なし / DB なし / sensitive leg は記録しない / opt-in 未許可なら capture しない。

## 3. mini-design（A1-1〜A1-6・段階）
| 段 | 内容 | 安全境界 |
|---|---|---|
| **A1-1** | movement event schema（per-leg・上記フィールド・MobilityReason 同様 versioned localStorage 型） | pure 型 |
| **A1-2** | **departure / arrival detector（pure layer）**: position sample 列 + anchor coords(from/to) + config(geofence 半径/dwell) → MovementEvent 推定 or null（疎/不足は低 confidence or null・捏造なし） | ✅ pure（自律可） |
| **A1-3** | **local capture store（pure/localStorage）**: derived MovementEvent を per-day/per-leg 保存（raw GPS なし・sensitive blackout・opt-in gated・caps・後方互換） | ✅ pure（自律可） |
| **A1-4** | actualDurationMin → personal pace ratio（vs estimate）。`mobilityReasonInsight` 同様の readiness gate（sparse は not_enough） | pure（次） |
| **A1-5** | Day Rehearsal への反映設計（soft hint・estimate を hard 上書きしない） | 設計（次） |
| **A1-6** | UI: sample 取得配線（getCurrentPosition・opt-in gated）+ 到着確認/手動訂正 UI | ⛔ UI/sampling gate |

## 4. このバッチで進める範囲（CEO「safe なら pure detector + local store まで」）
- ✅ **A1-1 schema + A1-2 detector(pure) + A1-3 local store(pure) + tests + closeout**。
- ⛔ **停止ゲート**: A1-6 の **getCurrentPosition 配線（実 GPS sampling）+ 確認 UI**（live GPS + UI = smoke/CEO 判断）。A1-4/A1-5 は次バッチ。

## 5. 禁止遵守
raw GPS 永続なし / 距離→時間捏造なし / mode 固定化なし / Google・external API 追加なし（既存 routes/places は触らない）/ DB なし / production・Vercel・GitHub・push・PR なし / background GPS なし / Reality・notification なし / UI 実装なし / tsc cleanup なし。

## 6. ★教訓
「既存にあるはず」を grep で確認せず「無い」と断じた（GPS 見落とし）。以後、**capability 判断前に必ず実コード grep**（CEO 指示「確認を挟む」）。前回 audit doc は本書で訂正。
