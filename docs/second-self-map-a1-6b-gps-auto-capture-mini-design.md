# A1-6b — GPS 自動捕捉 audit + mini-design（★停止ゲート・実装しない）

> 2026-06-08 / Build Unit / CEO 指示「A1-6b は実装しない・設計まで」。実機 GPS / 確認タイミング / 電池 / UX 判断が要るため停止ゲート。
> 前提資産: A1-0 GPS audit / A1-2 detector(`movementEventDetector.ts`・geofence+dwell・derived only) / A1-3 store / A1-6a 手動ログ（同 pipeline・mode/odKey/estimateMin tag 済）。

---

## 0. 位置づけ
A1-6a（手動ログ）で pace pipeline は GPS なしで起動できる。A1-6b は **観測の自動化**（手入力を減らす）であって新 pipeline ではない。よって A1-6b は「detector(済) に sample を供給し、推定を user 確認の上 store に書く」だけ。**raw GPS は永続しない**（derived event のみ）。

## 1. permission（権限）
- 既存 `lib/alter-morning/journey/{locationOptIn, permissionState, currentLocationGating}` を再利用。
- **opt-in 必須**: `getEffectiveOptInState()==="granted"` かつ OS permission granted のときだけ sampling。未許可は **A1-6a 手動ログのみ**（degrade）。
- opt-in UI は既存 `LocationOptInBanner` を /plan 文脈で提示（新規取得は CEO/UX 判断）。

## 2. foreground-only / sampling interval（★background なし）
- ★**background GPS 禁止**（CEO）。sampling は **app foreground + /plan(Map) 可視時のみ**。
- trigger 案: (a) Map 可視化時に 1 sample、(b) 可視中は `visibilitychange`/interval で **粗く**（例 2–5 分に 1 回）、blur/unmount で停止。`getCurrentPosition`（watchPosition は使わない＝電池・background 回避）。
- ★疎 sample 前提（app を開いた時だけ）。両端 bracket は稀 → 多くは confidence=low/null → **user 確認前提**。

## 3. battery（電池）
- watchPosition 不使用 + foreground のみ + 粗い interval + 可視時のみ で電池影響を最小化。
- `enableHighAccuracy:false`（街区精度で十分・geofence 150m）。timeout/maximumAge を設定し連続測位を避ける。
- 実機で電池影響を smoke（CEO 判断）。

## 4. geofence / dwell（検出）— detector は実装済
- `detectMovement(samples, {from,to}, config)`（A1-2）: from geofence(150m) を出た時刻=出発 / to geofence に入り dwell(3min) した時刻=到着 / 所要=差（両端不在は null）。
- anchor 座標は plan の baselineCoords/legCoordsByKey（A1-0 で確認済）。sample は **in-memory buffer**（raw 座標・**永続しない**）。

## 5. false positive（誤検出）対策
- ★**GPS 推定だけを真実にしない**: 検出は **confidence(high/medium/low)** 付き。medium 以上 かつ arrival 検出時のみ **確認 prompt** を出す（low/null は黙って捨てる）。
- 通過（destination を経由しただけ）対策: dwell 確認（3min 滞留）。dwell 未確認は confidence 低下。
- 精度フィルタ: `evaluateCurrentLocation`（accuracy≤1000m・age≤30min）を通った sample のみ buffer へ。
- 短 leg は A1-4 が除外（geofence バイアス）。

## 6. confirmation UI（確認・誤観測防止）
- 検出（medium+・未記録 leg）→ 当該 leg に控えめ prompt:「この区間、到着していそうです。実際の所要を記録しますか？」［記録］［ちがう］。
- ［記録］→ `buildMovementEventFromDetection(detected, now, {mode,odKey,estimateMin})` → `recordMovementEvent`（gate: opt-in∧非sensitive）。source="gps"。
- ［ちがう］→ 記録しない（+ 任意で A1-6a 手動ログへ誘導）。
- ★modal 連打にしない（1 leg 1 回・dismiss 可・A1-6a と同じ inline トーン）。

## 7. sensitive blackout（機微）
- ★sensitive leg は **sampling 対象から除外・prompt も出さない・記録もしない**（store gate + UI 二重）。`MovementPrivacyClass`/anchor.sensitiveCategory で判定。
- 自宅周辺等の常時除外は CEO/UX 判断（将来）。

## 8. raw GPS 非保存（最重要・既に担保）
- buffer は **in-memory のみ**（React state・unmount/refresh で消える）。localStorage/DB に座標を書かない。
- store は derived（時刻+所要+confidence+source+meta）のみ（型で担保・A1-3 parse は既知 field のみ）。

## 9. ★実装前に CEO 判断が要る点（停止ゲートの中身）
1. sampling trigger（可視時 1 回 vs interval）と interval 値（電池 vs 歩留まり）。
2. 確認 prompt の出現条件・文言・頻度（UX）。
3. opt-in 取得フロー（/plan で banner を出すか）。
4. 実機 smoke: 実移動で出発/到着が検出されるか・電池・誤検出率。
→ これらは机上で確定できない。**実機 smoke + UX/仕様判断 = CEO 承認後に実装**。

## 10. 禁止遵守
background GPS なし / raw GPS 永続なし / watchPosition なし / DB・migration なし / production・push・PR なし / external API 追加なし / sensitive 記録なし / 距離→時間捏造なし。

## 11. 推奨手順（A1-6b GO 時）
1. opt-in gating + foreground sampling buffer（in-memory）の最小実装 → 実機で sample 取得を smoke。
2. detector 接続 + 確認 prompt（medium+）→ 実移動で検出/確認/記録を smoke。
3. 誤検出率・電池を観測 → interval/閾値較正 → activation 判断。
