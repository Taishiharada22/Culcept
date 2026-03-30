// Aneurasync Service Worker
const CACHE_NAME = 'aneurasync-v2';
const OFFLINE_URL = '/offline';

// キャッシュするアセット
const PRECACHE_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon.svg',
];

// インストール時にアセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// フェッチ戦略: Network First with Cache Fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 同一オリジンのみ処理
  if (url.origin !== location.origin) return;

  // APIリクエスト: キャッシュ可能なエンドポイントはStale-While-Revalidate
  if (url.pathname.startsWith('/api/')) {
    const CACHEABLE_APIS = {
      '/api/stargazer/profile': 300,                    // 5分
      '/api/stargazer/prophecy': 3600,                  // 1時間
      '/api/stargazer/inner-weather': 3600,             // 1時間
      '/api/aneurasync/home-identity-progress': 300,    // 5分
      '/api/stargazer/blind-spot': 3600,                // 1時間
      '/api/eye-profile': 86400,                        // 24時間
      '/api/widget': 300,                               // 5分
    };
    const cacheTTL = CACHEABLE_APIS[url.pathname];
    if (cacheTTL && request.method === 'GET') {
      event.respondWith(
        caches.match(request).then((cached) => {
          // Stale-While-Revalidate: キャッシュを即座に返しつつ、バックグラウンドで更新
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          });
          return cached || fetchPromise;
        })
      );
      return;
    }
    // キャッシュ不可のAPIはNetwork Only
    return;
  }

  // 静的アセット（画像、CSS、JS）はCache First
  if (
    request.destination === 'image' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    url.pathname.startsWith('/cards/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // バックグラウンドで更新
          fetch(request).then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, response);
              });
            }
          });
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // HTMLページはNetwork First
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 成功したらキャッシュを更新
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // オフライン時はキャッシュかオフラインページ
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }
});

// プッシュ通知受信
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};

  const title = data.title || 'Aneurasync';
  const options = {
    body: data.body || '新しいお知らせがあります',
    icon: '/icons/icon.svg',
    tag: data.tag || 'default',
    data: {
      url: data.url || '/',
    },
    actions: data.actions || [],
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知クリック
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 既に開いているタブがあればフォーカス
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しいタブで開く
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-actions' || event.tag === 'sync-observations') {
    event.waitUntil(syncPendingObservations());
  }
});

// オフライン時の観測データを同期
async function syncPendingObservations() {
  console.log('[SW] Syncing pending observations');
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('pending_answers', 'readonly');
    const store = tx.objectStore('pending_answers');
    const index = store.index('syncStatus');
    const request = index.getAll('pending');

    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const pending = request.result || [];
        console.log('[SW] Found', pending.length, 'pending observations');

        for (const answer of pending) {
          try {
            const response = await fetch('/api/stargazer/observations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                questionId: answer.questionId,
                axisId: answer.axisId,
                selectedOptionId: answer.selectedOptionId,
                score: answer.score,
                answeredAt: answer.answeredAt,
                responseTimeMs: answer.responseTimeMs,
                offlineSync: true,
              }),
            });

            if (response.ok) {
              // 同期成功: ステータス更新
              const updateTx = db.transaction('pending_answers', 'readwrite');
              const updateStore = updateTx.objectStore('pending_answers');
              answer.syncStatus = 'synced';
              updateStore.put(answer);
            }
          } catch (err) {
            console.warn('[SW] Failed to sync observation:', err);
          }
        }
        db.close();
        resolve();
      };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (err) {
    console.warn('[SW] syncPendingObservations error:', err);
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('aneurasync_offline_v1', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('pending_answers')) {
        const store = db.createObjectStore('pending_answers', { keyPath: 'id' });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
