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

## 5. false positive / false negative（誤検出・見逃し）対策
- **false positive（誤検出を真実にしない）**: 検出は **confidence(high/medium/low)** 付き。medium 以上 かつ arrival 検出時のみ **確認 prompt**（low/null は黙って捨てる）。通過（destination 経由のみ）対策= dwell 確認（3min 滞留・未確認は confidence 低下）。精度フィルタ= `evaluateCurrentLocation`(accuracy≤1000m・age≤30min) を通った sample のみ buffer へ。短 leg は A1-4 が除外（geofence バイアス）。★誤検出の最終防波堤は **user 確認**（自動記録しない）。
- **false negative（見逃し）の扱い — 正直に「捕れないことがある」前提**: foreground 疎 sample では両端 bracket が取れず **多くの leg は検出されない**（出発のみ/到着のみ/null）。これは **bug でなく仕様**。対策= (a) 見逃した leg は **A1-6a 手動ログ**で user が後から記録できる（GPS と手動は同 pipeline）。(b) 片端のみ検出は所要 null で confidence=low→prompt せず（捏造しない）。(c) 見逃しは pace 蓄積を**遅らせるだけ**で誤った学習はしない（observed>inferred）。★「全部自動で捕る」を約束しない（過剰主張回避）。

## 6. confirmation UI / manual correction（確認・訂正）
- **confirmation UI**: 検出（medium+・未記録 leg）→ 当該 leg に控えめ prompt:「この区間、到着していそうです。実際の所要を記録しますか？」［記録］［ちがう］。［記録］→ `buildMovementEventFromDetection(detected, now, {mode,odKey,estimateMin})`(source="gps") → `recordMovementEvent`（gate: opt-in∧非sensitive）。［ちがう］→ 記録しない。★modal 連打にしない（1 leg 1 回・dismiss 可・A1-6a と同 inline トーン）。
- **manual correction（手動訂正）**: ★既に **A1-6a 手動ログ**が訂正経路。(a) GPS 推定値が違う→user が「実際に N 分」を上書き（同 legKey で setMovementEvent 上書き・source="manual" に置換）。(b) 誤記録→「取消」(deleteMovementEvent・可逆)。(c) GPS が捕れなかった leg→手動で記録。＝**GPS は下書き、user が正本**（誤観測を user が常に正せる）。

## 7. sensitive blackout（機微）
- ★sensitive leg は **sampling 対象から除外・prompt も出さない・記録もしない**（store gate + UI 二重）。`MovementPrivacyClass`/anchor.sensitiveCategory で判定。
- 自宅周辺等の常時除外は CEO/UX 判断（将来）。

## 8. raw GPS 非保存（最重要・既に担保）
- buffer は **in-memory のみ**（React state・unmount/refresh で消える）。localStorage/DB に座標を書かない。
- store は derived（時刻+所要+confidence+source+meta）のみ（型で担保・A1-3 parse は既知 field のみ）。

## 8.5 fail-safe / opt-in / kill switch（安全装置）
- **opt-in（同意先行）**: `getEffectiveOptInState()==="granted"` かつ OS permission granted のときだけ sampling。未許可・拒否・snooze は **sampling しない**（A1-6a 手動ログのみで degrade）。同意は user がいつでも撤回可（既存 journey opt-in の revoke）。
- **kill switch（即停止）**: A1-6b 用 flag（例 `PLAN_GPS_AUTO_CAPTURE_ENABLED`・**default OFF**）。OFF で sampling/detect/prompt を全て停止＝**手動ログのみに即 degrade**（A1-6a は GPS flag に依存しない）。env で即無効化可。
- **fail-safe（失敗時は安全側）**: permission denied / position error / timeout / 精度不良 / SSR は全て **黙って no-op**（throw せず・手動ログは生きる）。検出不能は null（捏造しない）。記録は user 確認後のみ（自動書き込みなし）。sensitive は二重 gate。
- **段階的有効化**: flag は本人(dogfood)→小数 canary→広域 の順。各段で誤検出率・電池・歩留まりを観測し、悪化時は flag OFF で即時撤退。

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
