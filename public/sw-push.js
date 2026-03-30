/**
 * Push Notification Service Worker
 * ブラウザプッシュ通知の受信とクリック処理
 * Rendezvous エンゲージメント通知対応
 */

// ── 通知タイプ別のデフォルト設定 ──
const NOTIFICATION_DEFAULTS = {
  // B: 毎日のお題
  daily_topic: {
    icon: "/icons/icon.svg",
    tag: "rendezvous-topic",
    url: "/rendezvous/topic?category=general",
    vibrate: [100, 50, 100],
  },
  // A: 匿名セッション予告
  session_reminder: {
    icon: "/icons/icon.svg",
    tag: "rendezvous-session",
    url: "/rendezvous/live",
    vibrate: [200, 100, 200],
  },
  // A: セッションマッチ成立
  session_matched: {
    icon: "/icons/icon.svg",
    tag: "rendezvous-session-match",
    url: "/rendezvous/live",
    vibrate: [100, 50, 100, 50, 200],
  },
  // D: ライブゲーム開始
  game_starting: {
    icon: "/icons/icon.svg",
    tag: "rendezvous-game",
    url: "/rendezvous/live",
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
  },
  // G: 星座形成
  constellation_formed: {
    icon: "/icons/icon.svg",
    tag: "rendezvous-constellation",
    url: "/rendezvous/live",
    vibrate: [100, 50, 100],
  },
  // E: 予言的中
  prophecy_fulfilled: {
    icon: "/icons/icon.svg",
    tag: "rendezvous-prophecy",
    url: "/rendezvous",
    vibrate: [100, 100, 100, 100, 300],
  },
  // F: 深化ミッション
  deepening_mission: {
    icon: "/icons/icon.svg",
    tag: "rendezvous-deepening",
    url: "/rendezvous/stories",
    vibrate: [100, 50, 100],
  },
  // B: 相互いいね成立
  topic_mutual_like: {
    icon: "/icons/icon.svg",
    tag: "rendezvous-mutual",
    url: "/rendezvous",
    vibrate: [100, 50, 100, 50, 200],
  },
  // デフォルト
  default: {
    icon: "/icons/icon.svg",
    tag: "rendezvous",
    url: "/rendezvous",
    vibrate: [100, 50, 100],
  },
};

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, icon, data, tag, type } = payload;

    // 通知タイプに応じたデフォルト設定を取得
    const defaults = NOTIFICATION_DEFAULTS[type] || NOTIFICATION_DEFAULTS.default;

    const options = {
      body: body || "",
      icon: icon || defaults.icon,
      tag: tag || defaults.tag,
      data: {
        ...defaults,
        ...(data || {}),
        url: (data && data.url) || defaults.url,
        type: type || "default",
      },
      vibrate: defaults.vibrate,
      requireInteraction: defaults.requireInteraction || false,
      actions: [
        { action: "open", title: "開く" },
        { action: "dismiss", title: "閉じる" },
      ],
    };

    event.waitUntil(
      self.registration.showNotification(title || "Aneurasync", options),
    );
  } catch {
    // Fallback for text payload
    event.waitUntil(
      self.registration.showNotification("Aneurasync", {
        body: event.data.text(),
        icon: "/icons/icon.svg",
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/rendezvous";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing tab if open
        for (const client of clientList) {
          if (client.url.includes("/rendezvous") && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
