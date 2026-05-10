/**
 * GeolocationPermissionState — frontend permission state contract (PR B-2d-a)
 *
 * CEO/GPT 2026-05-02 PR B-2d-a 規律:
 *   permissionState は origin を決める主役ではない。
 *   currentLat/Lng も baseline home も解決できず、最終的に origin が unknown に
 *   なる時の **理由説明** として使う。
 *
 * 優先順位 (CEO 補正規律):
 *   1. currentLat/Lng がある
 *      → permissionState 不問で current location 採用
 *   2. currentLat/Lng なし、userHomeLat/Lng あり
 *      → registered_home 採用、AnchorUnknownReason 不要
 *   3. current/baseline 両方なし
 *      → permissionState から AnchorUnknownReason を決定
 *
 * scope (PR B-2d-a):
 *   - 型定義 + frontend helper (本 file)
 *   - useAlterChat への注入は Commit 2
 *   - backend route での受け取りは Commit 3
 *   - legacyAdapter での reason 決定は Commit 4
 *   - test は Commit 5
 *   - getCurrentPosition の新規呼び出しは追加しない (既存 mount 時自動取得は維持)
 *   - opt-in UI / 履歴保存 / DB persistence は別 PR (B-2d-b / B-2f)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GeolocationPermissionState — 5 値 (CEO/GPT 2026-05-02 規律)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// browser Permissions API (`navigator.permissions.query`) の 3 値 + 我々の error
// state 2 値 = 計 5 値。
//
//   - "granted":     user 既に許可、currentLat/Lng が来る前提
//   - "denied":      user 明示拒否
//   - "prompt":      まだ user に聞いていない
//   - "unsupported": navigator.permissions API 非対応 (古いブラウザ等)
//   - "unavailable": query 自体が失敗 (例外 throw、ネットワーク等)
//
// 設計原則 (CEO/GPT 補強):
//   raw 5 値は LegacyAdapterInput / debug log で **必ず保持** する。
//   AnchorUnknownReason への変換時は集約してよい (prompt/unsupported/unavailable
//   → unrequested) が、raw 値を失うと後で「なぜ位置情報が使えなかったのか」 を
//   trace できなくなる。

export type GeolocationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "unavailable";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// getGeolocationPermissionState — frontend helper (browser only)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// `navigator.permissions.query({ name: "geolocation" })` で permission state を取得。
// 環境差を吸収して 5 値で返す。
//
// 不変条件:
//   - SSR / Node 環境では "unsupported" を返す (= navigator 不在)
//   - navigator.permissions が undefined → "unsupported"
//   - query が throw → "unavailable"
//   - 結果が "granted" / "denied" / "prompt" のいずれかなら、そのまま返す
//   - 結果が想定外の値 → "unavailable" (defensive)
//
// 副作用なし (純粋に query するだけ)。getCurrentPosition は呼ばない (CEO 規律)。

export async function getGeolocationPermissionState(): Promise<GeolocationPermissionState> {
  // SSR / Node 環境
  if (typeof navigator === "undefined") return "unsupported";
  // 古いブラウザで Permissions API 非対応
  if (!navigator.permissions || typeof navigator.permissions.query !== "function") {
    return "unsupported";
  }
  try {
    const result = await navigator.permissions.query({
      name: "geolocation",
    } as PermissionDescriptor);
    const state = result.state;
    if (state === "granted" || state === "denied" || state === "prompt") {
      return state;
    }
    // 想定外の値 (defensive)
    return "unavailable";
  } catch {
    // query が throw (ネットワーク / 権限 / その他)
    return "unavailable";
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// subscribeGeolocationPermissionState — change 監視 helper (PR B-2d-d)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// CEO/GPT 2026-05-02 PR B-2d-d 規律:
//   permissionState の変化を **3 経路** で監視:
//     1. 初回 query (= subscribe 時に 1 回必ず callback を呼ぶ)
//     2. Permissions API "change" event (= 同 session 中の変化)
//     3. visibilitychange (= タブ復帰時に再 query、change event 非対応 fallback)
//
// なぜ 3 経路必要か (GPT 指摘の核):
//   ユーザーがブラウザ設定で permission を granted に戻したあと、Aneurasync を
//   閉じている間に変化が起きると、次に開いたとき change event は発火しない
//   (permission は既に granted で、その session 中に変化していない)。
//   → 初回 query で確定した値を必ず callback に渡すことで漏れを防ぐ。
//
//   visibilitychange fallback は、change event 非対応 browser (古い iOS Safari 等)
//   や、Aneurasync を別 tab で開いたまま browser 設定を変えた場合の defensive。
//
// 使い方:
//   const unsubscribe = subscribeGeolocationPermissionState((state) => {
//     setPermissionState(state); // React state 更新
//   });
//   return unsubscribe; // cleanup
//
// 不変条件:
//   - subscribe 直後に 1 回必ず callback が呼ばれる (初回値確定)
//   - SSR / Permissions API 非対応では callback("unsupported") を 1 回呼ぶだけ
//   - unsubscribe 後は callback を呼ばない (cancellation guard)
//   - 値が同じでも callback は呼ばれる可能性がある (caller 側で同値判定すること)

/**
 * permissionState の継続監視。subscribe + cleanup pattern。
 *
 * @param callback permission state が確定 / 変化したときに呼ばれる
 * @returns unsubscribe 関数。caller が cleanup で必ず呼ぶ責任を持つ
 */
export function subscribeGeolocationPermissionState(
  callback: (state: GeolocationPermissionState) => void,
): () => void {
  let cancelled = false;

  // SSR / Node 環境では "unsupported" を 1 回呼ぶだけ
  if (typeof navigator === "undefined") {
    callback("unsupported");
    return () => {
      cancelled = true;
    };
  }

  // 古いブラウザで Permissions API 非対応
  if (
    !navigator.permissions ||
    typeof navigator.permissions.query !== "function"
  ) {
    callback("unsupported");
    return () => {
      cancelled = true;
    };
  }

  // PermissionStatus への参照を保持 (cleanup で removeEventListener に必要)
  let permissionStatus: PermissionStatus | null = null;
  const handleChange = () => {
    if (cancelled || !permissionStatus) return;
    const state = permissionStatus.state;
    if (state === "granted" || state === "denied" || state === "prompt") {
      callback(state);
    } else {
      callback("unavailable");
    }
  };

  // visibilitychange fallback: タブが visible になったときに再 query
  //   (change event 非対応 browser や、別 tab で permission を変えた場合の defensive)
  const handleVisibilityChange = () => {
    if (cancelled) return;
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    void (async () => {
      // permissionStatus が古ければ再 query して event listener を貼り直す
      try {
        const fresh = await navigator.permissions.query({
          name: "geolocation",
        } as PermissionDescriptor);
        if (cancelled) return;
        // 古い listener を remove
        if (permissionStatus) {
          permissionStatus.removeEventListener("change", handleChange);
        }
        permissionStatus = fresh;
        permissionStatus.addEventListener("change", handleChange);
        // 現在の値を callback (= recovery check の trigger)
        const state = fresh.state;
        if (state === "granted" || state === "denied" || state === "prompt") {
          callback(state);
        } else {
          callback("unavailable");
        }
      } catch {
        if (cancelled) return;
        callback("unavailable");
      }
    })();
  };

  // 初回 query + change event listener 登録
  void (async () => {
    try {
      const result = await navigator.permissions.query({
        name: "geolocation",
      } as PermissionDescriptor);
      if (cancelled) return;
      permissionStatus = result;
      permissionStatus.addEventListener("change", handleChange);
      // 初回値を callback (= 必ず 1 回呼ばれる、CEO/GPT 規律)
      const initialState = result.state;
      if (
        initialState === "granted" ||
        initialState === "denied" ||
        initialState === "prompt"
      ) {
        callback(initialState);
      } else {
        callback("unavailable");
      }
    } catch {
      if (cancelled) return;
      callback("unavailable");
    }
  })();

  // visibilitychange listener 登録
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  // unsubscribe: 全 listener を remove + cancellation flag
  return () => {
    cancelled = true;
    if (permissionStatus) {
      permissionStatus.removeEventListener("change", handleChange);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
  };
}
