# Tier1-B-C — Href UI Render Design（docs-only）

> 設計フェーズ（phase-by-phase）。**コード変更なし**。実装は CEO 承認後・本 phase のみ。
> Maps 生成（Tier1-C）/ DB・RLS / M2 runtime / CoAlter runtime / 外部遷移 production release は HOLD。
> 上位文脈: Tier1-B A+B（`SafeTravelLinkHrefModel`・`buildSafeTravelLinkHrefModel`）の上。**既に作られた eligible な href model を、UI に user-visible external link として描く**境界。
> 既存: Tier1-A inert `SafeTravelLinkIntent` → Tier1-B A+B href-capable model（`rendered:false`・生成/fetch なし）。
> 原則: ①前提を疑う ②grounding ③シンプル→論理 ④外科的 ⑤ゴール逆算。

---

## 1. まず前提を疑う（①）— これが次か？
| 候補 | 評価 |
|---|---|
| **Tier1-B-C href UI render**（本書） | **推奨・次（設計のみ）**。A+B で「href にしてよい」純粋判定は固まった。残るは「その model を**遷移 UI として出す**」最後の 1 手。**新規 URL を生成も fetch もしない**（model の `handoffUrl` をそのまま描くだけ）ので、製品の hand-off 出口に最短・最小リスクで到達 |
| Tier1-C Maps URL generation | **後**。URL を**生成**する＝外部 API/encode path が開く別カテゴリ。render より危険。href を出せる土台（B-C）を先に固める方が論理的 |
| SQL/RLS persistence | 後。表示経路が未完で永続化する意味がない。display-safe 経路確定後 |
| M2 production merge wiring | 後（CEO: production action へ merge しない） |
| E production deny release | **最後** |

**推奨: Tier1-B-C 次・docs-only。** 根拠（①⑤）: A+B は「eligible inert → href model」までで、**画面には何も出ていない**（`rendered:false`）。ゴール（予約直前まで→外部 hand-off）への残差は「model → 遷移 link UI」だけ。これは**生成も fetch もしない**最小・最安全の差分で、Tier1-C（URL 生成）より先に固めるのが筋（③④）。推奨実装は **A+B（pure 表示 component + panel 配線・dev/gate 下）**。

### ★ 設計の核（①③）— 「描画」と「生成」を最後まで分離
Tier1-B-C は **`handoffUrl` を `<a href>` に流すだけ**で、URL を作らない・触らない・取りに行かない。link affordance は **CoAlter cue とは別 section**（cue ガイダンスの中に遷移ボタンを混ぜない＝助言と外部遷移の責務分離）。

---

## 2. 現在の href model 状態（②grounding）
`SafeTravelLinkHrefModel`（`lib/shared/travel/safe-link-href-types.ts`）:
- `kind: "external_handoff"`
- `handoffUrl: string` … = `SafeTravelLinkIntent.externalReference.value`（**unchanged**・生成/fetch/tracking なし）
- `label: string` … 中立 copy（予約語なし＝caller 責務）
- `external: true` … visibly external
- `authoritative: false` … 非権威（予約/確定でない）
- `rendered: false` … **まだ UI 描画していない**
- **no generated URL / no private data / no booking・action fields**（executionAuthority/booking/calendar/livePrice/availability/cancellation/generatedUrl/private/userId/M2 を持たない）

**A+B が保証**: eligible な inert 参照のみが model 化される（invalid_url / ineligible_* → `null`）。`handoffUrl` は供給済 URL の素通し。URL 生成も fetch もしない。
**C が新たに開くもの**: model → **実際の `<a href>`（user-visible external navigation）**。これは「クリックで外部サイトへ遷移できる」状態を画面に出す初めての段階。

---

## 3. UI render problem（③）
- `<a href>` を描く＝**実際の external navigation** を生む（クリックで外部へ出られる）。
- copy 次第で **trust/action を含意**し得る（「予約する」等は禁止）。
- external link は **app 内部 action（下書きを見る 等）と視覚的に区別**されねばならない。
- external link は **booking/schedule/confirmation に見えてはならない**。
- link は **CoAlter cue section（「確認しておきたいこと」）の中に出してはならない**（助言と遷移の混線禁止）。
- link は **生成 Maps 検索 / official 検証済み** を含意してはならない（manual 供給 URL を出すだけ）。

---

## 4. 許可 render input（④）
- **`SafeTravelLinkHrefModel` のみ**を入力に取る。
- `rendered:false` の model を入力として受け入れる（描画前 model が正常入力）。
- `authoritative:false` であること。
- `external:true` であること。
- **raw `SafeTravelLinkIntent` を直接渡さない**（必ず `buildSafeTravelLinkHrefModel` 経由で変換した model のみ）。
- invalid / ineligible intent は入力にしない（B helper が既に `null` で弾く）。
- 生成 Maps URL を入力にしない。
- raw diagnostics を入力にしない。
- private state を入力にしない。

## 5. render output（⑤）
- visible な **external link または button-like link**。
- `href={model.handoffUrl}`（unchanged）。
- 新規 tab で開くなら `target="_blank"` ＋ **`rel="noopener noreferrer"`**（safe external-link 属性）。
- copy は **中立**（model.label を出す。caller が予約語を入れていないことが前提）。
- 必要なら disclaimer copy:
  - 「これは予約ではありません」
  - 「外部サイトで確認してください」
- **action authority なし**（クリック＝遷移であって、予約/確定/実行ではない）。
- eligible model が無ければ **何も描かない**（または中立 unavailable）。

## 6. 禁止 UI（③）
booking button / calendar button / execute button / 「この場所にする」/「予約する」/「空きあり」/「最安」/「確定」/「スケジュールに追加」/「今すぐ行く」/「この案で決定」/ CoAlter input・send affordance / read receipt・realtime UI — **すべて禁止**。

## 7. TravelLivePanel 内の location（②grounding）
現状 `TravelLiveReadyView`（`app/(culcept)/plan/TravelLivePanel.tsx`）の ready 描画順:
答え → 理由 → あなた向け → 気をつける点 → 追加確認 → readiness → **CoAlter cues（`travel-live-cues`「確認しておきたいこと」）** → disclaimer。

- link section は **CoAlter cues と別 section**（`travel-live-cues` の**内側に置かない**）。
- 配置は **travel result / 外部確認エリア付近**（cue section の**後・disclaimer 付近**の独立ブロック想定。`data-testid="travel-live-external-links"` 等）。
- **「確認しておきたいこと」の中に入れない**。
- section title は **external hand-off を示す**:
  - 「外部で確認」/「外部サイトで確認」/「地図で確認」
- eligible model が無ければ **何も描かない**（または中立 unavailable）。
- **raw URL の素の表示はしない**（明示承認まで。label を出す。`handoffUrl` は `href` 属性に入るのみ）。

## 8. copy ルール（②）
**許可**: 「外部で確認する」「地図で見る」「外部サイトで確認してください」「手動で確認してください」「これは予約ではありません」。
**禁止**: 「予約する」「空きあり」「最安」「確定」「この場所にする」「スケジュールに追加」「今すぐ行く」「この案で決定」。

## 9. privacy（②）
href text は **private rationale を露出しない**。href は **private red_line/preference を含めない**・**raw userId を含めない**・**M2/Stargazer data を含めない**・**participant/relationship state を encode しない**。**client-only privacy filtering 禁止**。表示は **shared-safe link model からのみ**。

## 10. external safety（③）
- **render 時に fetch しない**・**prefetch しない**・**link preview を作らない**。
- **URL を mutate しない**・**tracking param を付けない**。
- **自動で開かない**（`window.open`/auto-navigate 禁止）。
- **ユーザーが明示的にクリック**して初めて遷移。
- link は **hand-off であって confirmation ではない**。

## 11. Tier1-C との関係（②）
- Tier1-C Maps 生成は **HOLD**。
- Tier1-B-C は **供給済 `handoffUrl` を render するだけ**。
- Maps 検索 URL 生成なし・**`encodeURIComponent` 生成 path なし**・Google Maps / Places API なし。

## 12. production live gate との関係（②）
- TravelLivePanel に実装する場合も **既存 server-only travel live gate（`isPlanTravelLiveAllowed`）の下**のまま（panel が出る条件＝link が出る条件）。
- preview flag は **dev preview 文脈以外で production link UI を有効化しない**。
- **production deny release は HOLD**・**gate ルール変更なし**。

## 13. 実装オプション + 推奨（⑤・CEO 承認で着手）
| 案 | 内容 | 評価 |
|---|---|---|
| **A. pure React 表示 component** | `SafeTravelLinkHrefModel[]` を受け、external link を描く（eligible のみ・null 安全） | 推奨バンドル前提 |
| **B. TravelLivePanel read-only external link section** | ready view に cue と**別 section** で A を配置（既存 gate の下） | ◎ 推奨 keystone |
| C. dev preview only | dev route のみ | 後（B で gate 下に出せれば不要） |
| D. UI render を HOLD し Tier1-C へ | — | 代替（だが render 出口が未完のまま生成を開くのは順序が逆） |

**推奨実装スライス: A + B（pure 表示 component + panel の独立 link section・既存 gate 下）。**
```
// スケッチ（未実装）
// A: pure 表示 component（fetch/生成/mutate なし・cue と混ぜない）
function TravelExternalLinks({ links }: { links: SafeTravelLinkHrefModel[] }) {
  if (links.length === 0) return null;            // eligible 無し → 何も描かない
  return (
    <div data-testid="travel-live-external-links">
      <p>外部で確認</p>                            // ★ cue section と別・external hand-off を明示
      <ul>{links.map((m, i) => (
        <li key={i}>
          <a href={m.handoffUrl} target="_blank" rel="noopener noreferrer">{m.label}</a>
        </li>))}</ul>
      <p>これは予約ではありません。外部サイトで確認してください。</p>
    </div>
  );
}
// B: TravelLiveReadyView の cues の「後・disclaimer 付近」に独立配置（cue の内側に入れない）
//   - 入力 model は server 側で buildSafeTravelLinkHrefModel 経由（client は intent を変換しない）
//   - 既存 visible gate の下でのみ描画
```
- **Tier1-C（Maps 生成）/ 外部 URL 生成 / production deny release は HOLD。**

## 14. 将来 test（実装時）
- eligible href model → external link を render。
- link の `href` === `handoffUrl`。
- `target="_blank"` の時 `rel="noopener noreferrer"` を持つ（safe external 属性）。
- null / ineligible model → link を render しない（何も出さない or 中立）。
- link section は **CoAlter cue section（`travel-live-cues`）と別**。
- raw diagnostics を render しない。
- private text を render しない。
- 禁止 copy を render しない。
- booking/calendar/action button を render しない。
- useCoAlter なし・`/talk` なし。
- **URL 生成なし**（`encodeURIComponent`/`new URL(`/maps 生成なし）。
- fetch/API/DB/Supabase import なし・Google Maps/Places API import なし・web search なし。
- prefetch/link-preview なし・自動遷移なし。
- tsc baseline 不変（55）・既存 travel tests green。

---

## 15. Stop
- 本書（Tier1-B-C Href UI Render Design）で**停止**。
- Tier1-B-C UI render 実装は **CEO 承認まで行わない**（外部遷移 UI・Maps 生成・production release は HOLD）。

---

## 出力サマリ
- **前提（①⑤）**: 次は **Tier1-B-C（href UI render・docs-only）** を推奨。A+B で「href にしてよい」判定は固まり、ゴール残差は「model → 遷移 link UI」のみ。これは**生成も fetch もしない**最小差分で、Tier1-C（URL 生成）より先に固めるのが順序として正しい。
- **input/output**: 入力は `SafeTravelLinkHrefModel` のみ（`rendered:false`/`authoritative:false`/`external:true`・helper 経由・ineligible 無し）。出力は `href={handoffUrl}` の visible external link（`target=_blank` 時 `rel="noopener noreferrer"`・中立 label ＋「これは予約ではありません/外部サイトで確認」disclaimer）。
- **boundary**: CoAlter cue section と**別 section**・section title は「外部で確認/地図で確認」・eligible 無し → 何も描かない・raw URL 素表示なし。fetch/prefetch/preview/mutate/tracking/自動遷移なし、明示クリックのみ。booking/calendar/action/予約語/CoAlter input・send/realtime なし。
- **gate**: 既存 server-only travel live gate の下のまま・preview flag は dev preview 文脈外で production link を有効化しない・production deny release は HOLD・gate ルール不変。
- **推奨実装スライス**: **A（pure `TravelExternalLinks` 表示 component）+ B（TravelLivePanel の独立 link section・既存 gate 下）**。**C（dev preview 専用）/ D（HOLD して Tier1-C へ）/ Tier1-C（Maps 生成）/ 外部 URL 生成 / production deny は HOLD。**
- 本フェーズは **docs-only** — コード/型/テスト不変・tsc 55・push なし・production 非接触。
