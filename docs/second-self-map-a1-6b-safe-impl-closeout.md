# A1-6b — GPS 自動捕捉 安全版 実装 closeout + dev smoke 観点

> 2026-06-08 / Build Unit / branch `feat/a1-6b-gps-capture`。★main 着地は **CEO smoke PASS 後**。flag **default OFF**。

---

## 実装した（branch・未 main 着地）
1. **pure 判定コア** `lib/plan/mobility/gpsAutoCaptureCore.ts`（安全クリティカルな判定を全て pure 化）:
   - `shouldSampleGps(gate)` = flag ON ∧ opt-in granted ∧ permission granted のみ true。
   - `evaluateCaptureCandidate` / `pickCaptureCandidate`（複数 leg→直近到着 1 つ）/ `buildCaptureEvent`（source="gps"・derived only）。
   - `DAY_REHEARSAL_GPS_CAPTURE_ENABLED = false`（専用 flag・default OFF）。
2. **薄い browser shell** `lib/plan/mobility/useGpsAutoCapture.ts`（hook）: getCurrentPosition の粗い interval(3分) + foreground 判定 + **in-memory buffer(ref)** + 判定は core に委譲。DI 可能（getCurrentPosition/isVisible/now）。
3. **確認 prompt** `components/plan/map/GpsArrivalPrompt.tsx`: 控えめ inline banner（非 modal）「この区間、到着したようです。記録しますか？［記録］［ちがう］」。
4. **MapTab 配線**: permission(subscribe)/opt-in(getEffectiveOptInState) gate + captureLegs(CaptureLegContext[]) + useGpsAutoCapture + prompt render。

## ★安全境界（CEO scope・全て充足）
- **foreground-only**: isVisible() false なら skip・`getCurrentPosition` のみ（**watchPosition 不使用**）・粗い interval・**background なし**。
- **opt-in / permission gate**: opt-in granted ∧ permission granted のみ sampling。denied/prompt/unsupported/unavailable・not_asked/snoozed/declined → no-op。**permission error は fail-open no-op（throw しない）**。
- **in-memory raw buffer**: raw 座標は ref buffer のみ（最大 200・unmount で消える）・**localStorage/DB に書かない**。store は derived MovementEvent のみ。
- **detector 統合**: A1-2 detector（geofence150m + dwell3min + accuracy gate≤1000m）。**confidence medium 以上 かつ arrival 検出時のみ** candidate。low/null/到着なしは黙って破棄。
- **confirmation UI**: **自動保存しない**・confirm で derived 保存・dismiss/ちがう で破棄（再 prompt しない）・**manual log が正本・GPS は候補**・非 modal。
- **sensitive / readOnly blackout**: sensitive leg は sampling 対象外（evaluate が blocked_sensitive）/ readOnly(過去) leg は prompt しない（blocked_readonly）。privacy class を MapTab で確認。
- **feature flag**: `DAY_REHEARSAL_GPS_CAPTURE_ENABLED` **default OFF**・OFF で subscribe もせず sampling もしない（完全不変）・ON は dev smoke 用のみ・main activation は smoke PASS 後 CEO 別判断。

## ★estimate（honest 限定）
auto-capture の estimateMin は **best-effort**（user が開いた leg は legDur cache から取得・未 fetch leg は estimate なし）。external API 追加禁止ゆえ route 再 fetch しない。estimate 無しの auto event は actualDuration/mode/odKey を記録（A1-4 ratio には estimate が要るため、estimate 無しは ratio 未寄与＝honest・manual log や A1-7 で補完）。

## テスト / tsc / lint（CEO test 項目を全て pure で検証）
- **gpsAutoCaptureCore: 18 tests PASS** — permission denied/prompt/unsupported→no-op・opt-in off→no-op・flag OFF→no-op・sensitive→no-op・readOnly→no-op・already/dismissed→no-op・**low accuracy→no_detection**・**no arrival→no_arrival**・**low confidence→no prompt**・**medium/high→candidate**・pick latest arrival・buildCaptureEvent(source=gps/meta/**raw 座標なし**)。
- confirm→save / dismiss→no save / raw coords が store に入らない / flag OFF 不変 は core(buildCaptureEvent) + 既存 store test(recordMovementEvent) + shouldSampleGps で担保。
- mobility 全体 **355 PASS**。tsc footprint **0**（baseline 55）。eslint **clean**。dev server boot OK（build break なし）。

## 非実装（停止ゲート）
- **main 着地**（CEO smoke PASS 後）。**flag activation**（A1-7 / 別判断）。**A1-7 readiness/shadow/activation**（design only・別 doc）。
- hook の getCurrentPosition/interval/visibility 実挙動は実機 smoke 領域（pure core で判定は検証済）。

## ★dev smoke 観点（CEO 確認用・PASS 後 main 着地）
事前: 一時的に `DAY_REHEARSAL_GPS_CAPTURE_ENABLED=true` に（dev のみ）+ 位置情報 opt-in/permission 許可。
1. /plan 地図表示中・**opt-in 許可 + permission granted** で getCurrentPosition が粗い interval で動く（DevTools Sensors で位置を leg の出発→到着に動かす）。
2. leg の to-geofence に入り dwell すると **「到着したようです。記録しますか？」prompt**（非 modal・bottom）。
3. **［記録］→ 実績が保存**（leg を開くと「実績：N分」・source gps）。**［ちがう］→ 保存されず再 prompt されない**。
4. **sensitive leg / 過去(readOnly) leg では prompt が出ない**。
5. **permission denied / opt-in off → sampling せず prompt も出ない**（console error なし）。
6. **flag OFF（既定）に戻すと一切の GPS 活動なし・地図/カレンダー既存挙動不変**。
7. background（タブ非可視）では sampling しない（foreground-only）。

## 次フェーズ（design only・別 doc）
`…-a1-7-pace-activation-calibration-mini-design.md`（readiness ゲート / shadow validation / 段階 activation / calibration 凍結）。**実装に進まない**。
