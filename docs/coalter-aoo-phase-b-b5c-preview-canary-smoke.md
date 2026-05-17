# CoAlter AOO Phase B B-5c — Preview Canary Smoke Plan

**ステータス**: docs-only / **smoke 未実施** (CEO env 投入 + 実機検証待ち)
**作成日**: 2026-05-18
**目的**: B-5a/B-5b で main にマージ済みの Mirror Channel を、**branch-scoped Preview env でのみ ON** にし、CEO が実機で挙動を確認する。
**前提**:
- B-5a merged (PR #177、main HEAD `5203d713`、shadow mode foundation)
- B-5b merged (PR #179、main HEAD `8064d22c`、visible surface + sleep + 7-layer verification)
- env MIRROR / DIAGNOSTIC: production / preview / development の全 scope で **0 件**
- code 変更は本 PR に**含まれない** (docs-only)

**結論先出し**: env を **CEO 手動で branch-scoped Preview のみに投入** → 1 session smoke → checklist 評価 → **env 削除** → decision-log 記録 → Phase C 判断。

---

## §0 Executive Summary

### 0.1 何を smoke するか (5 目的)

| # | 目的 | B-5a/B-5b 由来 | 観測経路 |
|---|---|---|---|
| 1 | Mirror Channel が flag ON Preview で**壊さず mount** する | B-1 hidden shell + B-5a hook + B-5b visible surface | Preview URL 開いて console error / UI 崩れの有無 |
| 2 | shadow mode の **decideMirror が実 runtime で走る** | B-5a engine wiring | `window.__coalterMirrorDiagnostic.getSnapshot()` で entry 確認 |
| 3 | visible Mirror が**たまにだけ出る**（default STAY_SILENT） | B-5b 4-gate orchestration | Preview 上で実会話 / DOM 観察 |
| 4 | visible 出力が出ても **State Mirror のみ / hedged grammar / 退場可** | B-5b template + verification + retreat affordance | DOM 文言・閉じる/黙ってもらう button 動作 |
| 5 | **PII leak 0 / raw text 0 / remote 通信 0** | B-5a/B-5b PII firewall + No-Effect Contract | DevTools Network / diagnostic redacted snapshot |

### 0.2 何を smoke しないか (B-5c 範囲外)

- **Production env** 不可侵 (絶対投入禁止)
- **all Preview env** 不可侵 (branch-scoped Preview のみ)
- **chat layer touch** なし (B-5b で禁止、本 PR でも維持)
- **linguistic stop detector runtime 接続** なし (B-5b は pure function のみ、§8 参照)
- **Difference / Tempo / Fairness / Repair Mirror** なし (Phase C 以降)
- **B-6 Phase B 完了宣言** はしない (本 smoke 結果で**判断**、別 PR)

### 0.3 本 PR で実装するもの (code 変更 0、docs のみ)

- 本 file: `docs/coalter-aoo-phase-b-b5c-preview-canary-smoke.md` (smoke plan + checklist + rollback + cleanup + 記録 template)

**code 変更が必要と判明したら、smoke 開始前に停止して CEO 確認**。

---

## §1 不可侵境界 (CEO 補正、B-5c 全期間)

| 領域 | 状態 | 違反時の対応 |
|---|---|---|
| Production env | 触らない | 即 env 削除 + decision-log 緊急記録 |
| 全 Preview env (branch 非指定) | 触らない | 即 env 削除 + decision-log 緊急記録 |
| Database / Supabase | 触らない | smoke 中止 |
| API route | 触らない | smoke 中止 |
| Sentry / remote telemetry | 触らない | smoke 中止 |
| localStorage / sessionStorage / cookie / IndexedDB | 触らない (B-5a/B-5b 構造的に 0) | smoke 中止 |
| LLM call | 触らない (B-5b 構造的に 0) | smoke 中止 |
| raw text 保存 | 0 | rollback §9.1 |
| raw message id / user id / pair id 保存 | 0 | rollback §9.1 |
| Question / Proposal auto-fire | 0 | rollback §9.6 |
| chat layer / presence layer / observer layer | 0 diff (main で確認済み) | rollback §9.10 |
| code 変更 (B-5c PR で) | 0 | smoke 中止して CEO 判断 |
| package.json 変更 | 0 | smoke 中止 |
| Alter Morning 混入 | 0 | smoke 中止 |

---

## §2 Pre-flight Audit (CEO env 投入前確認、必須 5 項目)

CEO が env 投入する**直前**に、下記 5 項目を**順次**確認。1 つでも fail なら env 投入しない。

### 2.1 main HEAD が B-5b merge を含むこと

```bash
git fetch origin && git log --oneline origin/main~5..origin/main | grep "B-5b"
# 期待: "feat(coalter): Mirror Channel B-5b visible surface [B-5b, no canary env] (#179)" が出る
```

### 2.2 working tree clean (CEO の手元)

```bash
git status
# 期待: "nothing to commit, working tree clean"
```

### 2.3 env MIRROR / DIAGNOSTIC が全 scope 0 件

```bash
for SCOPE in production preview development; do
  COUNT=$(vercel env ls $SCOPE 2>&1 | grep -iE "MIRROR|DIAGNOSTIC" | wc -l | tr -d ' ')
  echo "$SCOPE: $COUNT"
done
# 期待: 全 scope "0"
```

**0 件でない場合** → 既存 env を削除してから本 smoke を開始する (§10.1 cleanup command を実施)。

### 2.4 対象 branch を CEO が決めて push 済み

CEO は B-5c smoke 用の **専用 branch を 1 本** 用意する (推奨: `chore/coalter-mirror-b5c-canary` 等の短命 branch、本 PR の branch とは別)。

```bash
# 例: 専用 canary branch を main から作る
git checkout main && git pull
git checkout -b chore/coalter-mirror-b5c-canary  # 例
git push -u origin chore/coalter-mirror-b5c-canary
```

> **重要**: 本 PR の branch (`docs/coalter-mirror-b5c-preview-canary-smoke`) は smoke 用ではない。docs 専用 PR と smoke 用 canary branch は**必ず分ける** (本 PR を merge する前でも canary branch は独立に作れる)。

### 2.5 Preview deploy 完了確認

`chore/coalter-mirror-b5c-canary` (canary branch) を push したあと、Vercel Dashboard で Preview deploy が **Ready** になることを確認:

```bash
vercel ls --scope <team> | head -5
# あるいは Vercel Dashboard で対象 branch の Preview URL を確認
```

> **Preview Ready 後でないと env 投入しても効かない**。Ready 確認まで env 投入を待つ。

---

## §3 Env 投入手順 (CEO 手動、Vercel CLI 推奨)

### 3.1 投入する env (2 件)

| env | 値 | scope | 必須 |
|---|---|---|---|
| `NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED` | `true` | **branch-scoped Preview のみ** (例 `chore/coalter-mirror-b5c-canary`) | ✅ 必須 |
| `NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE` | `true` | 同上 | ⭕ 推奨 (window.__coalterMirrorDiagnostic で observability) |

> **「branch-scoped Preview のみ」=「Production にも、`Preview (all)` にも入れない」**。Vercel UI でいう **「Preview Branch」を `chore/coalter-mirror-b5c-canary` に指定**。

### 3.2 Vercel CLI 推奨手順 (branch-scoped)

```bash
# Production 不可侵を最初に再確認
vercel env ls production | grep -iE "MIRROR|DIAGNOSTIC" || echo "production: OK (0 件)"

# 投入 1: mirrorChannelEnabled (branch-scoped Preview のみ)
echo "true" | vercel env add NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-b5c-canary

# 投入 2: mirrorDiagnosticExposeEnabled (同 branch)
echo "true" | vercel env add NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-b5c-canary
```

> CLI version によってサブコマンドの shape が異なる可能性あり。Vercel UI から GUI 投入 (Settings → Environment Variables → Add → Environment: Preview → Branch: 対象 branch) でも可。**どちらの経路でも 「Production」「Preview (all)」 を選ばないこと**。

### 3.3 投入後の scope 二重確認 (必須)

```bash
# (1) production / preview / development の全 scope に MIRROR / DIAGNOSTIC が出るか
for SCOPE in production preview development; do
  echo "--- $SCOPE ---"
  vercel env ls $SCOPE | grep -iE "MIRROR|DIAGNOSTIC" || echo "(none)"
done

# 期待:
#   production: (none)
#   preview: NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED ... chore/coalter-mirror-b5c-canary
#            NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE ... chore/coalter-mirror-b5c-canary
#   development: (none)
```

> **Production に出ていたら即削除 → §9.1 rollback**。
> **Preview に branch 名なしで出ていたら all Preview に流出 → §9.2 rollback**。

### 3.4 Vercel re-deploy

env 投入後、Vercel Dashboard で対象 branch の **Redeploy** を実施 (build 時に env が読まれるため、既存 deploy は古い env のまま)。

```bash
# CLI で redeploy する場合
vercel redeploy <deployment-url-of-canary-branch>
```

Redeploy 後の Preview build が **Ready** になるまで待つ。

---

## §4 Preview deploy 確認 (smoke 開始前)

### 4.1 build log を確認

Vercel Dashboard で対象 deployment のログを開き:

- ✅ `npm run build` が success
- ✅ Console に B-5a/B-5b 関連の compile error なし
- ✅ deployment status が **Ready**

### 4.2 Preview URL に access して sanity check

```bash
# Preview URL を取得 (Vercel Dashboard or CLI)
PREVIEW_URL="https://<your-canary-branch>.vercel.app"
curl -I "$PREVIEW_URL" | head -3
# 期待: HTTP/2 200 (or 3xx redirect)
```

DevTools console を開いて:

- ✅ console error 0
- ✅ Network パネルで MIRROR 関連の **outbound fetch なし** (No-Effect Contract)

---

## §5 Smoke 観測項目 (3 phase / 計 19 checklist)

CEO が Preview URL で 1 session smoke 実施。**順序通り**に、checklist 形式で確認。各項目は **pass / fail / N/A** で記録。

### Phase 1 — Sanity (env 投入直後、≈ 2 分)

| # | 項目 | 期待 | 観測経路 |
|---|---|---|---|
| 1.1 | console error 0 | `[]` / no red errors | DevTools Console |
| 1.2 | UI 崩れなし | 既存 chat / presence UI が flag OFF と同じ見た目 | 目視 |
| 1.3 | presence layer 動作影響なし | 既存の presence card / observer が壊れていない | 目視 |
| 1.4 | Network panel に MIRROR 関連 outbound 0 | fetch / axios / API call が増えない | DevTools Network |
| 1.5 | DOM に MirrorSurface (B-1 hidden shell) が mount される | `<div data-testid="mirror-surface-shell" hidden ...>` 存在 | DevTools Elements |

> Phase 1 で 1 つでも fail → 即 §9 rollback。

### Phase 2 — 通常会話 default 挙動 (≈ 10–20 分)

実際に会話を行い、**Mirror が default で出ないこと**を確認:

| # | 項目 | 期待 | 観測経路 |
|---|---|---|---|
| 2.1 | default で MirrorVisibleSurface が出ない | ほとんどの場合 visible 0 (STAY_SILENT 多) | 目視 |
| 2.2 | 出てもごく稀 (session 内 0–1 回) | session cap 1 のため最大 1 回 | 目視 + frequencyCap |
| 2.3 | 出る場合は State Mirror only | 5 template の hedged 文 (`気がしました` `印象でした` `感覚があります` `感じが、ありました`) | DOM text |
| 2.4 | text 長 ≤ 60 (実際は ≤ 40) | 短文、複数行に膨張しない | DOM text |
| 2.5 | Question / Proposal / Suggestion に**見えない** | 「?」「みては」「するといい」等が text にない / button が「閉じる」「黙ってもらう」のみ | DOM text + button |
| 2.6 | 命令形 / 共感演技なし | 「してください」「わかります」等が text にない | DOM text |
| 2.7 | 「閉じる」が効く (visible 解除) | click で visible 消える | 目視 |

### Phase 3 — Edge case (≈ 5 分、Mirror が出たら)

| # | 項目 | 期待 | 観測経路 |
|---|---|---|---|
| 3.1 | 「黙ってもらう」が効く (sleep ON + visible 解除) | click で visible 消えて、以降出ない | 目視 |
| 3.2 | sleep ON 状態で再 mount しても visible 出ない | page reload (= 再 mount) しても visible 出ない (※ ただし sleep は session-local なので reload で reset、page reload 後の再 sleep 動作のみ確認) | 目視 |
| 3.3 | SleepUIToggle button (画面左下) で sleep ON/OFF 可能 | label が 「観察を控えてもらう」 ⇄ 「観察を再開する」 で切り替わる | 目視 |
| 3.4 | session cap 1 効く: 1 回出たら同 session で 2 度目は出ない | 同 session 中、複数会話 turn でも visible 出力は 1 回まで | 目視 + frequencyCap |
| 3.5 | duplicate template 出ない | 仮に cap が緩んでも、同 templateId は連続して出ない (B-5b verification 7 層目) | 目視 |
| 3.6 | linguistic stop は runtime 接続なし (合格) | 「黙ってて」と発話しても自動 sleep にはならない (§8 参照) | 目視 |
| 3.7 | dismiss は明示 click のみ (outside click / timeout 自動消失なし) | visible mirror をクリックせずに会話続けても自動消失しない | 目視 |

> 各項目は smoke 中に行 1 回でも観測されれば **pass**、観測されなかった項目は **N/A** (cap / sleep など条件発火する項目は cap 到達できなかった場合 N/A)。

---

## §6 Diagnostic 確認 (DevTools Console、`__coalterMirrorDiagnostic`)

`NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE=true` が投入されていれば、Preview deploy 上で `window.__coalterMirrorDiagnostic` が install される (15 分 expire、selfDestroy 可)。

### 6.1 literal commands (DevTools Console)

```javascript
// (1) install 確認
typeof window.__coalterMirrorDiagnostic
// 期待: "object" (install 済)
//       "undefined" → flag OFF / 15 分 expire / production build (この場合 §9 rollback)

// (2) snapshot 取得 (redacted entries の array)
window.__coalterMirrorDiagnostic?.getSnapshot()
// 期待 (例):
//   [
//     {
//       decision: "STAY_SILENT",
//       reason: "observe_gate_unknown_modeContext",
//       ervScore: undefined,
//       modeContextStatus: "unknown",
//       mode: null,
//       alignmentBucket: "unknown",
//       uncertaintyBucket: "unknown",
//       silenceBudgetBucket: "unknown",
//       patternCategoryBucket: "unknown_category",
//       timestamp: 1735900000000
//     },
//     ...
//   ]

// (3) install 残時間 (ms、15 分 = 900000ms)
window.__coalterMirrorDiagnostic?.getRemainingMs()
// 期待: 0 ~ 900000 の整数

// (4) install 時刻
window.__coalterMirrorDiagnostic?.getInstalledAt()
// 期待: Date.now() に近い値

// (5) 強制破棄 (smoke 中断したいとき)
window.__coalterMirrorDiagnostic?.selfDestroy()
// その後 typeof === "undefined" になる
```

### 6.2 PII redaction 確認 (必須)

`getSnapshot()` の各 entry に下記の field が **絶対に存在しない**ことを確認:

| 禁止 field | 何が漏れる候補 |
|---|---|
| `rawText` / `text` / `message` | 会話本文 (PII) |
| `userId` / `user_id` / `uid` | ユーザー識別子 |
| `messageId` / `message_id` / `msgId` | message 識別子 |
| `pairId` / `pair_id` | pair 識別子 (Phase A の sha256 redacted も不可) |
| `sessionId` / `session_id` | session 識別子 |
| `email` / `phone` / `address` | PII 直接 |
| `embedding` / `vector` | embedding (再構成可能) |

```javascript
// 簡易 redaction 確認 (1 行)
const s = window.__coalterMirrorDiagnostic?.getSnapshot() ?? [];
JSON.stringify(s).match(/(rawText|userId|messageId|pairId|sessionId|email|phone|embedding)/i)
// 期待: null (一致なし)
// もし非 null なら **即 §9.1 rollback**
```

期待される entry shape は **10 field のみ** (decision / reason / ervScore / modeContextStatus / mode / alignmentBucket / uncertaintyBucket / silenceBudgetBucket / patternCategoryBucket / timestamp)。

### 6.3 entry 数 (sanity)

```javascript
window.__coalterMirrorDiagnostic?.getSnapshot()?.length
// 期待: 0 ~ 100 の整数 (FIFO max 100、shadow mode は mount 1 回 = 1 entry)
// 0 → 一度も decideMirror が走っていない (component が mount されていない可能性)
```

---

## §7 PII / Safety 確認 (Phase 1–3 横断)

### 7.1 DevTools Network panel 監視

- smoke 全期間で **Mirror 関連の outbound fetch 0**
- `/api/coalter/mirror/*` 等の endpoint が**呼ばれない** (B-5b は API route 触らない設計)
- Sentry / Datadog 等の external telemetry に Mirror 関連 event **0**

### 7.2 DOM text 監視

visible Mirror が出たら DOM text を copy して下記 regex で確認:

```javascript
const text = document.querySelector('[data-testid="mirror-visible-text"]')?.textContent ?? '';
// PII pattern が含まれないか
/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|https?:\/\/|[0-9]{4,}|[A-Za-z0-9_-]{12,}/.test(text)
// 期待: false (PII pattern 一致なし)
// true なら → §9.1 rollback
```

### 7.3 console を **全 PII regex scan**

```javascript
// console に出ている全 log を scan (DevTools Console を全部 copy して text editor で)
// /rawText|userId|messageId|pairId|sessionId|email|phone/i
// 期待: 一致なし
```

---

## §8 Linguistic Stop Detector の扱い (B-5c では runtime 接続なし)

### 8.1 B-5b で実装されたもの

- `lib/coalter/mirror/linguisticStopDetector.ts`: pure function (substring 検出のみ)
- 3 category × 計 14 patterns (silence_request / not_needed_now / explicit_suppression)
- **unit test 完備** (false positive 防止含む)

### 8.2 B-5c では runtime 接続しない

理由: chat layer に touch しない CEO 制約 (B-5b 不可侵境界) と整合。chat layer 側に「safe な input pipe」が無い現状で、無理に subscribe すると raw text の保存リスク / 経路混入リスクが生じる。

### 8.3 したがって smoke で確認しないこと

- 「黙ってて」と発話して自動 sleep にならない → **これは合格** (runtime 接続なし)
- 「今は不要」と発話して自動 sleep にならない → **これも合格**

### 8.4 代わりに確認すること

- `SleepUIToggle` button (画面左下「観察を控えてもらう」) で sleep ON にできる (Phase 3 §5 #3.3)
- `MirrorVisibleSurface` の「黙ってもらう」 button で sleep ON にできる (Phase 3 §5 #3.1)

### 8.5 接続は別 PR で

B-5c 完了後、chat layer 側に safe な message subscription pipe を CEO が別 PR で設計判断する。本 detector はそれまで pure function として待機。

---

## §9 Rollback 条件 (即時、9 trigger)

下記のいずれかが観測されたら、**即 env 2 件を削除** (§10.1 command) し、decision-log に緊急記録する。

| # | trigger | 何を意味するか | CEO action |
|---|---|---|---|
| 9.1 | PII leak 1 件以上 (diagnostic / DOM / console 含む) | PII firewall 失敗 | env 削除 + 設計レビュー + B-5b 修正 PR |
| 9.2 | Production env / 全 Preview env に出てしまった | env scope 流出 | 即 env 削除 + 経路 audit + 二段階確認手順を docs に追加 |
| 9.3 | Question / Proposal / Suggestion に**見える** UI | UI 構造的失敗 | env 削除 + MirrorVisibleSurface 修正 PR |
| 9.4 | text に命令形 / 提案形 / 共感演技 / 疑問符が出る | postSpeakVerification 機能不全 | env 削除 + verification or template 修正 PR |
| 9.5 | console error が出る | unhandled exception | env 削除 + bug fix PR |
| 9.6 | UI が邪魔 / 邪魔 / 視覚的に圧 | design 調整必要 | env 削除 + UI 修正 PR |
| 9.7 | session cap が効かない (2 回以上 visible) | frequencyCap 機能不全 | env 削除 + cap 修正 PR |
| 9.8 | sleep が効かない (sleep ON 後も visible 出る) | sleepStore 機能不全 | env 削除 + sleep gate 修正 PR |
| 9.9 | presence / chat UI を壊す | 不可侵境界違反 | env 削除 + 即 revert PR (緊急) |
| 9.10 | false positive が連発 (5 回以上の不適切発話) | template / threshold 過剰 | env 削除 + template / threshold 再 calibration |
| 9.11 | Mirror 関連の outbound fetch / DB / Sentry event が出る | No-Effect Contract 違反 | env 削除 + 即経路 audit |

> **kill switch (1 行 command、§10.1 と同じ)**:
> ```bash
> vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-b5c-canary --yes && vercel env rm NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-b5c-canary --yes
> ```

---

## §10 Smoke 後 cleanup (必須、smoke 終了直後)

### 10.1 env 2 件削除 (literal command)

```bash
# (1) 削除
vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-b5c-canary --yes
vercel env rm NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-b5c-canary --yes
```

### 10.2 削除確認 (literal command、2 重)

```bash
# (2) 全 scope で 0 件であることを再確認
for SCOPE in production preview development; do
  COUNT=$(vercel env ls $SCOPE 2>&1 | grep -iE "MIRROR|DIAGNOSTIC" | wc -l | tr -d ' ')
  echo "$SCOPE: $COUNT"
done
# 期待: 全 scope "0"
```

### 10.3 canary branch の取り扱い

- canary branch (`chore/coalter-mirror-b5c-canary`) は smoke 専用、code 変更なし → main へ merge しない
- smoke 後は **branch 削除** 推奨 (env 削除と同 timing):

```bash
git push origin --delete chore/coalter-mirror-b5c-canary
git branch -D chore/coalter-mirror-b5c-canary  # local
```

### 10.4 削除締切 (env 流出リスク管理)

- **smoke 終了から 1 時間以内**に env 削除 (時間経過は流出リスクを増やす)
- 1 時間超えたら CEO に再報告

---

## §11 Smoke 結果記録 template (decision-log.md にコピー)

smoke 終了後、下記 Markdown を **そのまま** `docs/decision-log.md` の最上部に追記する。

```markdown
### YYYY-MM-DD CoAlter AOO Phase B B-5c Preview Canary Smoke 結果
- **部門**: Build / Product
- **smoke 実施日時**: YYYY-MM-DD HH:MM JST
- **対象 branch**: chore/coalter-mirror-b5c-canary
- **Preview URL**: https://<your-canary-branch>.vercel.app
- **env 投入**:
  - NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED=true → branch-scoped Preview (canary) のみ
  - NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE=true → 同上
- **env 削除確認**: ✅ 全 scope (production / preview / development) で MIRROR / DIAGNOSTIC 0 件

#### Phase 1 Sanity (5 項目)
- [ ] 1.1 console error 0
- [ ] 1.2 UI 崩れなし
- [ ] 1.3 presence layer 影響なし
- [ ] 1.4 Network outbound 0
- [ ] 1.5 MirrorSurface hidden shell mount

#### Phase 2 通常会話 (7 項目)
- [ ] 2.1 default で MirrorVisibleSurface 出ない
- [ ] 2.2 出ても session 0–1 回
- [ ] 2.3 State Mirror only (5 hedged template)
- [ ] 2.4 text ≤ 60 chars (実際 ≤ 40)
- [ ] 2.5 Question/Proposal/Suggestion に見えない
- [ ] 2.6 命令形/共感演技なし
- [ ] 2.7 「閉じる」が効く

#### Phase 3 Edge case (7 項目)
- [ ] 3.1 「黙ってもらう」が効く
- [ ] 3.2 sleep ON 状態の挙動 (page reload で reset を含む)
- [ ] 3.3 SleepUIToggle で sleep ON/OFF
- [ ] 3.4 session cap 1 効く
- [ ] 3.5 duplicate template 出ない
- [ ] 3.6 linguistic stop runtime 接続なし (合格)
- [ ] 3.7 dismiss は明示 click のみ

#### Diagnostic (DevTools console)
- [ ] window.__coalterMirrorDiagnostic install 確認
- [ ] getSnapshot() で redacted entries 確認
- [ ] PII pattern 一致なし (rawText / userId / messageId / pairId / sessionId / email / phone / embedding)
- [ ] entry 数 0–100 (FIFO)

#### PII / Safety
- [ ] Network outbound 0 (Mirror 関連)
- [ ] DOM text に PII pattern 一致なし
- [ ] console に PII pattern 一致なし

#### 観測サマリ
- diagnostic entry 数: __
- MIRROR_CANDIDATE 数: __
- visible 表示数: __
- sleep 動作: 確認 / 未到達
- cap 動作: 確認 / 未到達
- console error: __ 件
- PII leak: 0 / __ 件
- UI 違和感: なし / 軽微 / 重大

#### 次判断 (1 つ選択)
- [ ] **pass** → B-5 完了 (B-6 起票)、Phase C 設計に進む
- [ ] **partial** → 修正 PR (B-5d 起票) → 再 smoke (B-5e?)
- [ ] **fail** → rollback、B-5 全体設計レビュー

- **承認**: CEO
- **ステータス**: 実行済
```

---

## §12 次 Phase 判断基準 (3 段階)

### 12.1 pass (B-5 完了、Phase C に進む)

下記**全て**満たした場合:

- Phase 1 (Sanity) **全 5 項目 pass**
- Phase 2 (通常会話) **全 7 項目 pass**
- Phase 3 (Edge case) **少なくとも 5 項目 pass** (#3.2 / #3.4 / #3.5 は条件発火で N/A 可)
- Diagnostic 確認 **全項目 pass + PII 一致 0**
- PII / Safety 確認 **全項目 0**
- Rollback trigger §9 **0 件**

→ **次 step**:
- B-6 起票 (Phase B 完了 docs PR、別 PR)
- Phase C 設計に着手 (Difference / Tempo / Fairness / Repair Mirror)

### 12.2 partial (修正 PR → 再 smoke)

下記**いずれか**が発生したが PII leak / 構造的失敗ではない場合:

- template が固い / すぐ duplicate → template 追加 PR (B-5d?)
- UI 若干違和感 (動かないわけではない) → styling 微調整 PR
- session cap は機能するが 1 回も発火しなかった → gate threshold 調整検討
- sleep / cap / verification の挙動に**軽微**な差異

→ **次 step**:
- env 削除完了
- 修正 PR (B-5d) を CEO 起票判断 → merge 後に B-5e として再 smoke

### 12.3 fail (rollback + 全体設計レビュー)

下記**いずれか**:

- PII leak 1 件以上
- env 流出 (Production / 全 Preview)
- Question / Proposal / Suggestion に見える
- UI 崩壊 / 既存機能を壊す
- false positive 5 回以上
- console error 連発

→ **次 step**:
- env 即削除 (§10.1)
- 緊急 decision-log 記録
- B-5 (a/b/c) 全体設計レビュー
- 必要なら B-5 revert PR

---

## §13 不可侵境界 (再掲、CEO 補正)

- **Production env**: 触らない (§3 / §9.2 / §10)
- **all Preview env (branch 非指定)**: 触らない (§3 / §9.2 / §10)
- **DB / Supabase / API route**: 触らない (本 PR は docs only)
- **Sentry / remote telemetry**: 触らない
- **localStorage / sessionStorage / cookie / IndexedDB**: 触らない
- **LLM call**: 触らない
- **raw text 保存**: 0
- **raw id (message / user / pair / session) 保存**: 0
- **Question / Proposal auto-fire**: 0
- **code 変更**: 本 PR では 0 (もし code 変更が smoke で必要と判明したら停止して CEO 確認)
- **linguistic stop detector runtime 接続**: 0 (B-5c 範囲外、§8)
- **package.json 変更**: 0
- **Alter Morning 混入**: 0
- **chat layer (`app/components/chat/*`, `components/chat/*`, `app/api/*`)**: 0 diff (main 確認済み)
- **presence layer (`lib/coalter/presence/*`)**: 0 diff (main 確認済み)
- **observer layer (`lib/coalter/observer/*`)**: 0 diff (main 確認済み)
- **`MirrorSurface.tsx` (B-1 hidden shell)**: 0 diff (main 確認済み)
- **`ChatClient.tsx`**: 0 diff (main 確認済み)

---

## §14 References

- 設計: `docs/coalter-aoo-phase-b-mirror-channel-design.md` (PR #164)
- 実装計画: `docs/coalter-aoo-phase-b-implementation-plan.md` (PR #165) §2.5
- B-5a 実装: PR #177 (shadow mode foundation)
- B-5b 実装: PR #179 (visible surface + sleep + 7-layer verification)
- Phase A 前例: `docs/coalter-aoo-a2e-state-observation-preflight.md` (Option 2 = canary-only debug global expose 採用、本 B-5c も同パターン)
- Phase A 完了: `docs/coalter-aoo-phase-a-completion.md`

---

## Appendix A — Pre-flight Audit checklist (印刷可能、1 ページ)

```
□ §2.1 main HEAD に B-5b merge (#179) 含む
□ §2.2 working tree clean
□ §2.3 env MIRROR / DIAGNOSTIC 全 scope 0 件
□ §2.4 canary branch (chore/coalter-mirror-b5c-canary) push 済み
□ §2.5 Vercel preview deploy Ready
```

## Appendix B — Env 投入 / 削除 1 行 commands (印刷可能)

```bash
# 投入 (CEO 手動、branch-scoped Preview のみ)
echo "true" | vercel env add NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-b5c-canary
echo "true" | vercel env add NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-b5c-canary

# 削除 (smoke 後 必須、kill switch にもなる)
vercel env rm NEXT_PUBLIC_COALTER_MIRROR_CHANNEL_ENABLED preview chore/coalter-mirror-b5c-canary --yes
vercel env rm NEXT_PUBLIC_COALTER_MIRROR_DIAGNOSTIC_EXPOSE preview chore/coalter-mirror-b5c-canary --yes

# scope 確認 (投入前 / 投入後 / 削除後)
for SCOPE in production preview development; do
  echo "--- $SCOPE ---"
  vercel env ls $SCOPE | grep -iE "MIRROR|DIAGNOSTIC" || echo "(none)"
done
```
