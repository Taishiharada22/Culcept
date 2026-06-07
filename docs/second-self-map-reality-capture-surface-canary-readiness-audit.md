# Reality capture surface — canary readiness audit（read-only・実装/flag/env 変更なし）

> 2026-06-07 / **read-only 監査 + local canary 設計・実行しない** / main HEAD `01b2c077`（A1-6-5R）。Reality セッション所有の capture surface を read-only preview として安全前進できるか監査。
> ★本タスクでは flag ON / env 変更 / production exposure を **一切しない**。

---

## 0. 結論（先に）
- ★**read-only preview pipeline は end-to-end で配線済**（server 生成 → route 合成 → client 読込 → banner 描画）。**dormant の原因は server の surface gate のみ**（`REALITY_CAPTURE_SURFACE` 既定 off + evaluateCaptureGate の staging/canary/user 条件）。client 側は **live 配線済**（`useAlterChat` が response から読み `CaptureCandidateBanner` 描画）。
- **安全性は高い**: surface は **read-only**（`.from`/`.insert`/`.delete`/RPC なし・capture write とは別 flag）・gate は **多層 fail-closed**（kill→flag→ref→prod block→staging allowlist→canary user）・**production hard block**・fail-open（null→banner 出さない＝既存 UI 不変）。
- ★**surface flag を ON にしても write は一切走らない**（write は別 flag `realityCaptureLive`）。surface canary = **純粋な read-only 露出**。
- **local canary smoke は技術的に可能だが、env/flag 変更が必要**（staging supabase + canary user + surface flag + seed データ）→ 本タスクでは **設計のみ**（実行は別 GO）。
- **canary readiness = 高い**（pipeline 配線済・安全 gate 強固）。ただし「seed が無ければ候補も出ない」依存に注意。

## 1. flag 条件表
| flag / 条件 | env / 既定 | 役割 | 本タスク |
|---|---|---|---|
| `REALITY_CAPTURE_SURFACE`（`realityCaptureSurface`） | `REALITY_CAPTURE_SURFACE==="true"`・**既定 off** | surface read 有効化（`evaluateCaptureGate` の `liveEnabled`） | 変更しない |
| `realityCaptureKill` | kill switch・最優先 | surface/write を即停止 | — |
| NODE_ENV | production → **hard block**（staging lane） | 本番誤露出防止 | local=development（block されない） |
| supabase ref | staging(hjcr) のみ allow・prod(aljav) **deny** | DB 先の安全 | local の .env.local 先に依存（要 staging） |
| canary user | `realityCanaryUserIds`（優先）/ `canaryUserIds`（fallback）・空→**全 block** | 露出を限定ユーザーに | 要 canary 登録 |
| `productionCanaryEnabled` | 既定 false → production ref は必ず block | production canary は明示多重 opt-in | 触らない |
| `realityCaptureSurfaceClient` | client fetch bridge(A1-5-7-7・**dormant**) 用 | C案の別 fetch 経路 | B案 live path には不要 |
| `realityCaptureLive`（**別物**） | seed **WRITE** gate・既定 off | capture 書き込み（surface と独立） | ★surface ON でも write は走らない |

- ★surface（read）と write は **別 flag**。本件は surface のみ＝read-only。

## 2. surface DTO の内容（CandidateSurfaceDTO）
- `{ hasCandidate, candidateCount, status: "has_candidate"|"none", items: CandidateSurfaceItem[] }`。
- item = `{ durationMin, evidenceSource(enum label), date(YYYY-MM-DD|null), band(label|null), confidenceBand, handle? }`。
- ★**redaction 済**: raw / source_ref / UUID / prompt / response 本文 / API key を **絶対に surface しない**。enum / number / date / null のみ。「候補があります」以上の断定をしない（prose 生成しない）。

## 3. UI 露出位置・文言・非破壊性
- 場所: **MorningPlanCard 内**（home morning）の `<CaptureCandidateBanner candidate={...} />`（line 1145）。供給=`useAlterChat.morningCaptureCandidate`（response の `morningProtocol.captureCandidate` を毎 turn 再導出）。
- 文言（presenter・控えめ）: heading「候補があります」+「（候補）」/ note「空いている時間に置けそうな予定の候補です」/ items「N分 · メモから · 帯」。技術名/UUID/raw なし。
- 非破壊性: **candidate 無 / hasCandidate=false → `null`（DOM に何も足さない＝既存 UI 完全不変）**。purple の控えめ banner（additive section のみ）。**button / apply / save / checkbox なし**（pure presentational）。

## 4. apply/save/write が混ざらないことの確認
- surface server（`morning-capture-surface.server`）: ヘッダ明記「**read-only・write/RPC/createClient なし・`.from`/`.insert`/`.delete` なし**」。canonical source を column-restricted SELECT（user-RLS・service_role 禁止）に委譲。
- client: `captureCandidateClient` / presenter / banner は **pure**（fetch/DB/network なし or fail-open read のみ）。
- act-on（accept→apply→予定変更）は **別 module・no-write skeleton・未配線**（本 surface に混ざらない）。
- ∴ surface canary は **read-only 純粋露出**（予定変更/書き込みゼロ）。

## 5. local canary smoke の可否 + 最小手順（設計のみ・実行しない）
- **可否: 技術的に可能**。ただし以下が必要（**本タスクでは実行しない**・env/flag 変更禁止のため）:
  1. `.env.local` の supabase が **staging(hjcr)**（production だと PRODUCTION_PROJECT_REF で block）。
  2. `REALITY_CAPTURE_SURFACE=true`（local のみ）。
  3. canary user 登録（`REALITY_CAPTURE_CANARY_USER_IDS` に自分の user id）。
  4. **seed データの存在**（候補は captured seed 由来＝seed 無ければ hasCandidate=false で banner 出ない）。seed は別途 staging に存在 or capture write（別 flag）で生成。
- **最小手順（別 GO 時）**: local で staging を向き → 上記 flag/canary を local env に設定 → home の朝チャットを開く → `morningProtocol.captureCandidate` が返り `CaptureCandidateBanner`（控えめ「候補があります」）が出ることを確認 → flag を戻す。**read-only ゆえ予定/DB は不変**。
- ★本タスクは **設計まで**。実行は「local env/flag 変更 GO」を別途要する。

## 6. safety gate（多層 fail-closed・再掲）
1. kill 最優先 → 2. surface flag off（既定）→ 3. ref 未解決→block → 4. production ref→block → 5. staging allowlist 外→block → 6. user 空/canary 非該当→block。**いずれも fail-closed**。+ route は fail-open（null→候補付けない）。+ production hard block（nodeEnv/ref 二重）。

## 7. GO / NO-GO 判断点
- **readiness GO（高）**: pipeline 配線済（server+client+UI）・安全 gate 強固・read-only・非破壊・redacted。**「既存の read-only preview を安全に出せるか」= YES**。
- **NO-GO（本タスク内）**: flag ON / env 変更 / production exposure / 実 smoke 実行 は禁止＝しない。
- **次の GO 候補（別タスク）**: ①**local canary smoke**（local env を staging+flag+canary に設定し read-only preview を実機確認・seed 依存に注意）②それが OK なら **staging canary**（Reality セッションと flag 前進を coordinate）。
- **CEO 判断点**:
  1. local canary smoke を **次に実行する**か（local env/flag 変更の GO を出すか）。
  2. seed 依存（候補が出るには captured seed が要る）をどう用意するか（staging に seed 投入 or capture write flag を staging で短時間 ON）。
  3. surface flag 前進は **Reality セッション所有**で coordinate するか（本系は readiness 監査のみ提供）。
  4. local smoke OK 後、staging canary user を誰にするか。
