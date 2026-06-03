# シフトコード辞書 設計書（ユーザー略号のタグ/カテゴリー明示化）

- **対象**: シフト表の略号（`H`/`N`/`BD` 等）を、**ユーザーから収集し、役割をタグ/カテゴリーで明示化**する辞書システムの設計。
- **背景**: CEO 指摘「ユーザーのシフト表を分析する上でコード表記があるなら、ユーザーから情報を集める必要がある。何がどういう役割を持つかをタグ・カテゴリーで明示化したほうがいい」（2026-05-30）。
- **状態**: 設計提案 v1（実装前ゲート）。**CEO 確認後に P0-2 golden 構築 + 将来の収集 UI 実装へ**。
- **branch**: `feat/plan-pdf-image-import`。docs-only。
- **根拠**: CEO 訂正（公休=H のみ / 休み≠公休 / BD=休み）+ GPT 3分割提案 + 私の層分離精緻化。CEO 方針 ①〜⑧。

---

## §0. 中心思想 — 「意味」と「集計ルール」と「表示」を分ける

シフト表の略号は**会社ごとに任意**。固定の語彙では捉えきれない。だから:

1. **生記号（raw_code）** = 表に書いてある文字そのまま（層1）
2. **意味（semantic）** = その記号が何か（層2・不変・ユーザー収集）
3. **projection（表示）** = カレンダーへどう出すか（層3・可変・上書き可）

そして **CEO の最重要訂正**:

> **「休み(is_off)」と「公休(counts_as_public_holiday)」は別**。
> 休み系コード（H/HREQ/BD/AL）はすべて休みだが、**公休に数えるのは H のみ**。

→ これを**2つの直交ブール**で表現する。型名に「公休性」を埋め込まない（GPT の核心的指摘）。

---

## §1. コード辞書エントリの schema（per ユーザー / per テンプレート）

```typescript
type ShiftCodeEntry = {
  // ── 層1: 生記号（表記そのまま）──
  rawCode: string;              // "N" / "E-18" / "HREQ"
  displayLabel: string;         // "夜勤" / "希望休"（人間可読）

  // ── 層2: 意味（不変・ユーザー収集・checksum 関連）──
  category: "work" | "off" | "off_request" | "note" | "undetermined";
  semanticType: string;         // "night_shift" / "holiday" / "blank_day" ...
  roleTags: string[];           // ["work","overnight"] 細分（controlled vocab）
  isOff: boolean;               // 休みか（H/HREQ/BD/AL = true）
  countsAsPublicHoliday: boolean; // 公休カウント対象か（★ H のみ true）
  startTime: string | null;     // "18:00"（work のみ、legend から）
  endTime: string | null;       // "06:45"
  endsNextDay: boolean;         // 日跨ぎ（N = true）

  // ── 層3: projection（可変 UI・ユーザー上書き可）──
  projectMode: "timed_event" | "day_indicator" | "candidate" | "none";
};
```

### §1.1 層の責務（GPT 混同の修正点 ★）

| フィールド | 層 | 性質 | 理由 |
|---|---|---|---|
| `isOff` / `countsAsPublicHoliday` / `endsNextDay` / 時刻 | **層2** | **不変・truth** | 「H は公休」「N は日跨ぎ」は会社の事実。UI で変わらない。checksum の根拠 |
| `projectMode` | **層3** | **可変・policy** | 「休みを枠で出すか表示だけか」は UI 判断。ユーザー上書き可 |

→ **GPT は `counts_as_public_holiday`（監査ルール）と `project_to_calendar`（UI）を同じ level 3 に混ぜた**。本設計では**監査ルールを層2 に残し、層3 は表示のみ**。これで公休 checksum が表示設定に汚染されない（§-1 の汚染防止を維持）。

---

## §2. 原田大志 シフト表（SPRIX 連続デスクシフト表）の辞書 — 8 コード

**凡例から確定 + CEO 意味確定**。AL は本テンプレに非在だが語彙保持。

| rawCode | label | category | semanticType | isOff | 公休 | start | end | 翌日 | projectMode |
|---|---|---|---|:--:|:--:|---|---|:--:|---|
| `H` | 休（公休） | off | `holiday` | ✓ | **✓** | – | – | – | **day_indicator** |
| `HREQ` | 希望休 | off_request | `holiday_request` | ✓ | ✗ | – | – | – | candidate |
| `BD` | 休み（blank day） | off | `blank_day` | ✓ | ✗ | – | – | – | **day_indicator** |
| `E` | 早番 | work | `early_work` | ✗ | ✗ | 06:00 | 14:00 | ✗ | timed_event |
| `E-18` | 早番ロング | work | `early_long` | ✗ | ✗ | 06:00 | 18:00 | ✗ | timed_event |
| `N` | 夜勤 | work | `night_shift` | ✗ | ✗ | 18:00 | 06:45 | **✓** | timed_event |
| `L` | 遅番 | work | `late_work` | ✗ | ✗ | 14:00 | 22:45 | ✗ | timed_event |
| `G` | 日勤 | work | `day_work` | ✗ | ✗ | 09:00 | 17:45 | ✗ | timed_event |
| `(AL)` | 有給 | off | `paid_leave` | ✓ | ✗ | – | – | – | day_indicator |

**CEO UX 訂正の反映**: off 系（H/BD/AL）= `day_indicator`（/plan に**時間枠を作らず**「休み」表示）。HREQ = `candidate`。work 系 = `timed_event`（従来どおりタイムライン反映、ユーザー編集可）。

---

## §3. 公休 checksum（CEO + GPT: 二次監査情報として）

**公休数は truth を決める主情報ではなく、読み取り結果を監査する checksum**（GPT）。

- checksum 式: `count(cells where code.countsAsPublicHoliday == true)` = 月の公休数
- = **H セルの個数 = その月の公休数**（H のみ true なので）
- **訂正値**（画像表示はGPT推論ズレ・無効）: 3月=9 / 4月=8 / 5月=9 / 6月=8 / **7月=8**
- 不一致なら**どこか1セルの読み違い**を疑う

→ HREQ・BD は休みだが checksum に**入れない**（CEO 訂正）。

---

## §4. ユーザーからのルール収集設計（CEO 要件の核）

新しいシフト表をアップロードした際、未知コードを**ユーザーに最小限で尋ねて辞書化**:

1. **コード検出**: 凡例 OCR + セル走査で distinct コードを抽出
2. **凡例から自動 pre-fill**: 「G = 9:00–17:45」形式があれば category=work + 時刻を自動補完（質問を減らす）
3. **不足分のみユーザーに質問**（GPT 4 問を精緻化）:
   - **Q1 種類は?** 勤務 / 休み / 希望休 / 注記 / 未確定 → `category` + `isOff` を決定
   - **Q2 公休に数える?** yes/no → `countsAsPublicHoliday`（**休み系のみ質問**）
   - **Q3 時間は?** 開始 / 終了 / 翌日終了 → 時刻 + `endsNextDay`（**勤務系のみ・凡例から pre-fill**）
   - **Q4 表示は?** 時間付き予定 / 休み表示のみ / 候補 / 出さない → `projectMode`（category default で pre-fill）
4. **辞書を保存** → 同テンプレなら**毎月再利用**（テンプレは安定）

**私の追加（独自）**: ②の凡例 pre-fill + category default で**「全コードを毎回聞く」摩擦を半減**。さらに ③の公休 checksum で**収集した辞書を即検算**（「H=公休と回答 → 表は H が8個・公休8と整合 ✓」）。

### §4.1 タグ/カテゴリーが UI を可能にする

`category`（粗い閉集合）→ 選択肢ボタン。`roleTags`（細分）→ 補助タグ。`isOff`/`countsAsPublicHoliday`/`projectMode` → トグル。**役割が型として明示化されているから、収集 UI が構造化できる**（CEO 要件そのもの）。

---

## §5. /plan への projection 仕様（CEO UX 指示の実装方針）

projection module（層3）の出力仕様。**実装は import→/plan 配線時**（本書は仕様固定のみ）:

| semanticType / projectMode | /plan での扱い |
|---|---|
| work（timed_event） | **タイムラインに時間付きイベント**生成（既存 import 経路）。ユーザー変更・削除・追加可 |
| off：H/BD/AL（day_indicator） | **時間枠を作らない**。その日の**ヘッダ等に「休み」バッジ/ラベル**（休みと分かる日レベル表示） |
| HREQ（candidate） | 候補表示（控えめ）。v1 では非表示の選択肢も |

→ **CEO 指示「休みは枠でなく表示」を projectMode=day_indicator が担う**。truth（golden）は BD=blank_day=isOff を記録するだけで、表示方法は projection が決める。

---

## §6. CEO 判断仰ぐ点

1. **2軸分離（isOff / countsAsPublicHoliday）** に同意か ← CEO 訂正の核
2. **8 コード辞書（§2）** の意味・時刻・projectMode で正しいか（特に BD=day_indicator / N=日跨ぎ）
3. **公休 checksum = H 個数 = 訂正値（3=9,4=8,5=9,6=8,7=8）** で良いか
4. **収集設計（§4 の Q1-Q4 + 凡例 pre-fill）** の方向で良いか
5. この辞書確定後に **P0-2 golden 構築（原田行・5ヶ月）着手**で良いか

---

## §7. 今回の stop

- 本書 = **辞書設計 + 収集設計 + projection 仕様**。実装には入らない。
- annotation-rules（`alter-plan-pdf-image-import-annotation-rules.md`）を本書と整合に訂正済み。
- 次: CEO 確認 → P0-2 golden（原田行 5ヶ月、本書 §2 辞書で意味解決）→ P0-3 harness。
- push/PR は GitHub 復旧後。
