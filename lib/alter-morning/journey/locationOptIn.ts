/**
 * LocationOptInState — frontend opt-in state contract (PR B-2d-b)
 *
 * CEO/GPT 2026-05-02 PR B-2d-b 規律:
 *   B-2d-a の permissionState contract を前提に、ユーザーが Aneurasync Alter Morning
 *   として **明示的に opt-in** したかを localStorage で管理する。
 *
 *   browser permission (Permissions API) と Alter Morning opt-in は **分離**する。
 *   browser permission が granted でも、Alter Morning として明示同意していなければ
 *   getCurrentPosition は呼ばない。
 *
 * 4 状態 (CEO/GPT 2026-05-02 確定):
 *   - "not_asked": 初期状態。banner を表示してユーザーに opt-in を聞く。
 *                  既存ユーザー (PR B-2d-a 時点) も同じ扱い。
 *   - "granted":   ユーザーが「位置情報を使う」を押し、getCurrentPosition が成功した。
 *                  次回 mount 以降、permissionState===granted のときに自動取得。
 *   - "snoozed":   ユーザーが「あとで」を押した。snoozeUntil まで banner 非表示。
 *                  snoozeUntil 経過後は automatic に "not_asked" に降格 (再表示)。
 *   - "declined":  browser PERMISSION_DENIED に遭遇 (即時または「使う」押下後)。
 *                  banner 表示なし、永久 lock (UI 経由 revoke は別 PR で対応)。
 *
 * 状態遷移 (CEO/GPT 2026-05-02 確定):
 *   [not_asked]
 *     ├─「使う」+ 成功 ──→ [granted]
 *     ├─「使う」+ PERMISSION_DENIED ──→ [declined]
 *     ├─「使う」+ timeout/unavailable ──→ [not_asked] (state 不変、inline error 表示)
 *     └─「あとで」 ──→ [snoozed] (snoozeUntil = now + 7d)
 *   [granted]
 *     ├─ 次回 mount で permissionState===granted: 自動 getCurrentPosition
 *     └─ getCurrentPosition で PERMISSION_DENIED ──→ [declined]
 *   [snoozed]
 *     ├─ now < snoozeUntil: banner 非表示
 *     └─ now ≥ snoozeUntil: [not_asked] に降格 → banner 再表示
 *   [declined]
 *     └─ banner 非表示、getCurrentPosition 呼ばない (永久)
 *
 * 自動取得条件 (CEO/GPT 2026-05-02 確定 — strict):
 *   shouldAutoFetchLocation =
 *     getEffectiveOptInState() === "granted" &&
 *     permissionState === "granted"
 *
 *   → permissionState が prompt/unsupported/unavailable のときは自動取得しない。
 *     ユーザー操作なしで browser permission ダイアログが出るリスクを避ける。
 *
 * scope (PR B-2d-b):
 *   - 4 状態 state machine + localStorage CRUD + snoozeUntil expiry (本 file)
 *   - banner UI / hook 統合 / route 受け取りなし
 *   - accuracy / capturedAt は B-2d-c で追加
 *   - watchPosition / history / DB persistence は別 PR (B-2f)
 *   - Settings 画面 toggle (revoke/再 opt-in) は別 PR
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Type definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type LocationOptInState =
  | "not_asked"
  | "granted"
  | "snoozed"
  | "declined";

/**
 * localStorage に保存される構造体。
 *
 * CEO/GPT 規律: schema versioning は STORAGE_KEY の "v1" suffix で表現する。
 * 将来 4 状態を 5 状態に拡張する等の breaking change は v2 / v3 にバンプする。
 */
export type LocationOptInRecord = {
  state: LocationOptInState;
  /** snoozed のときに必須 (ISO 8601 timestamp)。他の state では undefined */
  snoozeUntil?: string;
  /** debug 用、granted になった時刻 (ISO 8601 timestamp) */
  grantedAt?: string;
  /** debug 用、最後に更新した時刻 (ISO 8601 timestamp) */
  updatedAt: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * localStorage key. v1 = 4 状態 state machine (本 PR で導入)。
 *
 * 将来 schema 変更時は v2 にバンプし、v1 は migration logic で読み取る。
 */
export const STORAGE_KEY = "aneurasync.location-opt-in.v1";

/**
 * snoozed の有効期限 (= 7 日)。
 *
 * CEO 確定 (2026-05-02): simplicity 優先で 7 日固定。
 * snooze 回数によるエスカレーション (3 回 snooze で declined 等) は別 PR で検討。
 */
export const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Defaults
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeDefaultRecord(): LocationOptInRecord {
  return {
    state: "not_asked",
    updatedAt: new Date().toISOString(),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// localStorage CRUD (SSR-safe)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * localStorage から record を読む。
 *
 * 不変条件:
 *   - SSR / Node 環境では default record を返す (= "not_asked")
 *   - JSON parse 失敗 / schema 不正 → default record (defensive)
 *   - localStorage 例外 (quota / private mode) → default record
 *
 * 副作用なし (純粋に read のみ)。
 */
export function readLocationOptIn(): LocationOptInRecord {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return makeDefaultRecord();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return makeDefaultRecord();
    const parsed = JSON.parse(raw);
    if (!isValidRecord(parsed)) return makeDefaultRecord();
    return parsed;
  } catch {
    return makeDefaultRecord();
  }
}

/**
 * localStorage に record を書く。
 *
 * 不変条件:
 *   - SSR / Node 環境では何もしない
 *   - localStorage 例外 (quota / private mode) は黙って ignore (UX 阻害禁止)
 *   - updatedAt は本関数で自動上書き (caller は省略可)
 */
export function writeLocationOptIn(
  record: Omit<LocationOptInRecord, "updatedAt">,
): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  const fullRecord: LocationOptInRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullRecord));
  } catch {
    // quota / private mode は黙って無視
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Schema validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isValidRecord(value: unknown): value is LocationOptInRecord {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (
    obj.state !== "not_asked" &&
    obj.state !== "granted" &&
    obj.state !== "snoozed" &&
    obj.state !== "declined"
  ) {
    return false;
  }
  if (typeof obj.updatedAt !== "string") return false;
  if (obj.snoozeUntil != null && typeof obj.snoozeUntil !== "string") {
    return false;
  }
  if (obj.grantedAt != null && typeof obj.grantedAt !== "string") {
    return false;
  }
  // snoozed のときは snoozeUntil 必須
  if (obj.state === "snoozed" && typeof obj.snoozeUntil !== "string") {
    return false;
  }
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Effective state (snooze expiry を考慮した「今の」状態)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「今の」effective state を返す。snoozed の場合 expiry を判定する。
 *
 * 不変条件:
 *   - state="snoozed" かつ now ≥ snoozeUntil → "not_asked" を返す (降格)
 *   - state="snoozed" かつ now < snoozeUntil → "snoozed" を返す
 *   - state="snoozed" だが snoozeUntil が parse 不能 → "not_asked" (defensive)
 *   - その他の state はそのまま返す
 *
 * 副作用なし。降格を localStorage に persist する場合は writeLocationOptIn を別途呼ぶ。
 *
 * @param record localStorage から読んだ record
 * @param nowMs 現在時刻 (ms epoch)。テスト時 inject 用。省略時は Date.now()。
 */
export function getEffectiveOptInState(
  record: LocationOptInRecord,
  nowMs: number = Date.now(),
): LocationOptInState {
  if (record.state !== "snoozed") return record.state;
  if (record.snoozeUntil == null) return "not_asked"; // defensive
  const snoozeUntilMs = Date.parse(record.snoozeUntil);
  if (!Number.isFinite(snoozeUntilMs)) return "not_asked"; // defensive
  if (nowMs >= snoozeUntilMs) return "not_asked";
  return "snoozed";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mutation helpers (caller が状態遷移を表明的に呼べるようにする)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 「位置情報を使う」+ getCurrentPosition 成功 → granted に遷移。
 *
 * 副作用: localStorage write。
 */
export function markGranted(nowMs: number = Date.now()): void {
  const grantedAt = new Date(nowMs).toISOString();
  writeLocationOptIn({ state: "granted", grantedAt });
}

/**
 * browser PERMISSION_DENIED → declined に遷移。
 *
 * 副作用: localStorage write。
 */
export function markDeclined(): void {
  writeLocationOptIn({ state: "declined" });
}

/**
 * 「あとで」押下 → snoozed に遷移、snoozeUntil = now + 7d。
 *
 * 副作用: localStorage write。
 */
export function markSnoozed(nowMs: number = Date.now()): void {
  const snoozeUntil = new Date(nowMs + SNOOZE_DURATION_MS).toISOString();
  writeLocationOptIn({ state: "snoozed", snoozeUntil });
}

/**
 * declined recovery 用: state を "not_asked" にリセットする。
 *
 * CEO/GPT 2026-05-02 PR B-2d-d で導入:
 *   ユーザーがブラウザ側で permission を granted/prompt に戻したとき、
 *   Aneurasync 側 localStorage の declined を解除する経路。
 *
 * 重要 (CEO/GPT 規律):
 *   - state を "not_asked" に **戻すだけ**
 *   - 自動で granted にしない (= ユーザーは再 opt-in が必要)
 *   - 自動で getCurrentPosition を呼ばない (= banner 再表示で明示的 opt-in を求める)
 *   - snoozeUntil / grantedAt は **クリア** (= 過去状態のリーク防止)
 *
 * 副作用: localStorage write (writeLocationOptIn 経由で updatedAt 自動上書き)。
 *   snoozeUntil / grantedAt は record に含めないので、書き込み後は両方 undefined。
 *
 * 使い場面:
 *   useAlterChat の recovery useEffect が以下の条件で呼ぶ:
 *     effectiveOptInState === "declined" &&
 *     (permissionState === "granted" || permissionState === "prompt")
 */
export function markNotAsked(): void {
  writeLocationOptIn({ state: "not_asked" });
}

/**
 * デバッグ / テスト用 reset。
 *
 * 副作用: localStorage 削除 (= 次回 readLocationOptIn() で default record を返す)。
 */
export function resetLocationOptIn(): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
