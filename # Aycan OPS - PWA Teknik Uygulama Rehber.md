# Aycan OPS - PWA Teknik Uygulama Rehberi
## Backend & Frontend Gereksinimleri

Bu doküman, Aycan Operasyon Yönetim Sistemi'nin tüm platformlarda PWA olarak düzgün çalışması için yapılması gereken teknik değişiklikleri içerir.

---

## 1. Manifest Dosyası

`public/manifest.webmanifest` veya `public/manifest.json` dosyasını oluşturun/güncelleyin:

```json
{
  "name": "Aycan Operasyon Yönetim Sistemi",
  "short_name": "Aycan",
  "description": "Personel taşımacılığı operasyonlarını dijital ortamda yönetin",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "icons": [
    {
      "src": "/icons/icon-72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/maskable-icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/desktop-1.png",
      "sizes": "1920x1080",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Kontrol Paneli"
    },
    {
      "src": "/screenshots/mobile-1.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Mobil Görünüm"
    }
  ],
  "categories": ["business", "productivity"],
  "lang": "tr",
  "dir": "ltr",
  "prefer_related_applications": false,
  "related_applications": [],
  "shortcuts": [
    {
      "name": "Giriş Kontrol",
      "short_name": "Kontrol",
      "description": "Sabah araç kontrollerini başlat",
      "url": "/giris-kontrol",
      "icons": [{ "src": "/icons/shortcut-kontrol.png", "sizes": "192x192" }]
    },
    {
      "name": "Seferler",
      "short_name": "Seferler",
      "description": "Günlük seferleri görüntüle",
      "url": "/seferler",
      "icons": [{ "src": "/icons/shortcut-sefer.png", "sizes": "192x192" }]
    },
    {
      "name": "Araçlar",
      "short_name": "Araçlar",
      "description": "Filo yönetimi",
      "url": "/araclar",
      "icons": [{ "src": "/icons/shortcut-arac.png", "sizes": "192x192" }]
    }
  ],
  "handle_links": "preferred",
  "launch_handler": {
    "client_mode": "navigate-existing"
  }
}
```

---

## 2. Service Worker

`public/sw.js` dosyasını oluşturun:

```javascript
const CACHE_NAME = 'aycan-ops-v1';
const OFFLINE_URL = '/offline';

// Önbelleğe alınacak statik dosyalar
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Service Worker kurulumu
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Önbellek oluşturuluyor');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Service Worker aktivasyonu
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Eski önbellek siliniyor:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch isteklerini yakala
self.addEventListener('fetch', (event) => {
  // API isteklerini önbelleğe alma
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // GET isteklerini önbelleğe al
          if (event.request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Çevrimdışı - önbellekten dön
          return caches.match(event.request);
        })
    );
    return;
  }

  // Navigasyon istekleri
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Statik dosyalar - Cache First stratejisi
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Sadece başarılı yanıtları önbelleğe al
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      });
    })
  );
});

// Push bildirimleri
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
    },
    actions: data.actions || [],
    tag: data.tag || 'default',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Bildirime tıklama
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Açık pencere varsa ona odaklan
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Yoksa yeni pencere aç
      return clients.openWindow(urlToOpen);
    })
  );
});

// Arka plan senkronizasyonu
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // Çevrimdışı yapılan işlemleri sunucuya gönder
  const pendingRequests = await getPendingRequests();
  for (const request of pendingRequests) {
    try {
      await fetch(request.url, request.options);
      await removePendingRequest(request.id);
    } catch (error) {
      console.error('[SW] Senkronizasyon hatası:', error);
    }
  }
}

// IndexedDB yardımcı fonksiyonları (opsiyonel)
function getPendingRequests() {
  // IndexedDB'den bekleyen istekleri al
  return Promise.resolve([]);
}

function removePendingRequest(id) {
  // IndexedDB'den isteği sil
  return Promise.resolve();
}
```

---

## 3. Next.js Konfigürasyonu

### next.config.js

```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/aycanops\.agno\.digital\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24, // 24 saat
        },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 gün
        },
      },
    },
    {
      urlPattern: /\.(?:js|css)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 gün
        },
      },
    },
  ],
});

module.exports = withPWA({
  // Mevcut Next.js konfigürasyonunuz
});
```

### Paket Kurulumu

```bash
npm install next-pwa
# veya
yarn add next-pwa
# veya
pnpm add next-pwa
```

---

## 4. HTML Head Meta Etiketleri

`app/layout.tsx` veya `pages/_document.tsx` dosyasına ekleyin:

```tsx
import Head from 'next/head';

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        {/* PWA Meta Etiketleri */}
        <meta name="application-name" content="Aycan" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Aycan" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#09090b" />
        
        {/* Viewport */}
        <meta 
          name="viewport" 
          content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover, user-scalable=yes" 
        />
        
        {/* Manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />
        
        {/* Favicon & Icons */}
        <link rel="icon" href="/favicon.ico" sizes="256x256" type="image/x-icon" />
        <link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png" />
        <link rel="icon" href="/icons/icon-512.png" sizes="512x512" type="image/png" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180" />
        <link rel="apple-touch-icon" href="/icons/icon-152.png" sizes="152x152" />
        <link rel="apple-touch-icon" href="/icons/icon-144.png" sizes="144x144" />
        <link rel="apple-touch-icon" href="/icons/icon-120.png" sizes="120x120" />
        
        {/* Apple Splash Screens */}
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-splash-2048-2732.png"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-splash-1170-2532.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-splash-1125-2436.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
        />
        
        {/* Microsoft Tiles */}
        <meta name="msapplication-TileColor" content="#09090b" />
        <meta name="msapplication-TileImage" content="/icons/icon-144.png" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## 5. Service Worker Kaydı

`app/components/PWARegister.tsx` veya `components/PWARegister.tsx`:

```tsx
'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker kayıtlı:', registration.scope);
          
          // Güncelleme kontrolü
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Yeni versiyon mevcut
                  if (confirm('Yeni güncelleme mevcut. Sayfayı yenilemek ister misiniz?')) {
                    window.location.reload();
                  }
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('Service Worker kayıt hatası:', error);
        });
    }
  }, []);

  return null;
}
```

`app/layout.tsx` içinde kullanın:

```tsx
import PWARegister from '@/components/PWARegister';

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
```

---

## 6. Çevrimdışı Sayfası

`app/offline/page.tsx`:

```tsx
export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">📡</div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Çevrimdışı
        </h1>
        <p className="text-zinc-400 mb-6">
          İnternet bağlantınız yok gibi görünüyor.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-white text-zinc-950 px-6 py-3 rounded-lg font-semibold hover:bg-zinc-200 transition-colors"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  );
}
```

---

## 7. Push Bildirimleri (Opsiyonel)

### Frontend - Bildirim İzni İsteme

```tsx
'use client';

import { useState, useEffect } from 'react';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Bu tarayıcı bildirimleri desteklemiyor');
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      await subscribeToPush();
    }
  };

  const subscribeToPush = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });

      setSubscription(sub);

      // Sunucuya gönder
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
    } catch (error) {
      console.error('Push abonelik hatası:', error);
    }
  };

  return { permission, subscription, requestPermission };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

### Backend - Push Bildirim Gönderme

```typescript
// api/push/send/route.ts
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:destek@aycan.com.tr',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  const { subscription, title, body, url } = await request.json();

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title,
        body,
        url,
        tag: 'aycan-notification',
      })
    );

    return Response.json({ success: true });
  } catch (error) {
    console.error('Push gönderim hatası:', error);
    return Response.json({ success: false, error }, { status: 500 });
  }
}
```

### VAPID Anahtarları Oluşturma

```bash
npx web-push generate-vapid-keys
```

`.env` dosyasına ekleyin:
```env
VAPID_PUBLIC_KEY=BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxE
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxE
```

---

## 8. Gerekli İkonlar

`public/icons/` klasöründe aşağıdaki boyutlarda PNG ikonlar oluşturun:

| Dosya Adı | Boyut | Kullanım |
|-----------|-------|----------|
| icon-72.png | 72x72 | Android eski |
| icon-96.png | 96x96 | Android |
| icon-120.png | 120x120 | iOS |
| icon-128.png | 128x128 | Chrome Web Store |
| icon-144.png | 144x144 | iOS, Windows Tile |
| icon-152.png | 152x152 | iOS iPad |
| icon-180.png | 180x180 | iOS (apple-touch-icon) |
| icon-192.png | 192x192 | Android, PWA |
| icon-384.png | 384x384 | Android |
| icon-512.png | 512x512 | PWA Splash |
| maskable-icon-512.png | 512x512 | Android Maskable |
| apple-touch-icon.png | 180x180 | iOS |
| badge-72.png | 72x72 | Bildirim badge |
| favicon.ico | 256x256 | Tarayıcı sekmesi |

### Maskable İkon

Maskable ikon için içeriğin merkez %80'lik "safe zone" içinde olması gerekir. [Maskable.app](https://maskable.app/) ile kontrol edebilirsiniz.

---

## 9. Splash Screen'ler (iOS)

`public/splash/` klasöründe iOS cihazlar için splash screen'ler:

| Dosya Adı | Boyut | Cihaz |
|-----------|-------|-------|
| apple-splash-2048-2732.png | 2048x2732 | iPad Pro 12.9" |
| apple-splash-1668-2388.png | 1668x2388 | iPad Pro 11" |
| apple-splash-1536-2048.png | 1536x2048 | iPad |
| apple-splash-1284-2778.png | 1284x2778 | iPhone 14 Pro Max |
| apple-splash-1170-2532.png | 1170x2532 | iPhone 14/13/12 |
| apple-splash-1125-2436.png | 1125x2436 | iPhone X/XS/11 Pro |
| apple-splash-750-1334.png | 750x1334 | iPhone 8/SE |

---

## 10. browserconfig.xml (Windows)

`public/browserconfig.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square70x70logo src="/icons/icon-72.png"/>
      <square150x150logo src="/icons/icon-144.png"/>
      <square310x310logo src="/icons/icon-384.png"/>
      <TileColor>#09090b</TileColor>
    </tile>
  </msapplication>
</browserconfig>
```

---

## 11. Kontrol Listesi

Deployment öncesi kontrol edin:

- [ ] `manifest.webmanifest` dosyası mevcut ve erişilebilir
- [ ] Service Worker (`sw.js`) çalışıyor
- [ ] Tüm ikon boyutları mevcut
- [ ] HTTPS aktif (PWA için zorunlu)
- [ ] `theme-color` meta etiketi tanımlı
- [ ] `apple-touch-icon` tanımlı
- [ ] Çevrimdışı sayfası çalışıyor
- [ ] Lighthouse PWA skoru 90+

### Lighthouse ile Test

```bash
npx lighthouse https://aycanops.agno.digital --only-categories=pwa
```

---

## 12. Hata Ayıklama

### Chrome DevTools

1. DevTools aç (F12)
2. Application sekmesine git
3. Sol menüden kontrol et:
   - **Manifest** - manifest.json doğru yükleniyor mu?
   - **Service Workers** - SW kayıtlı ve aktif mi?
   - **Cache Storage** - Dosyalar önbelleğe alınmış mı?

### iOS Safari

1. Mac'te Safari aç
2. Develop menüsünden iPhone'u seç
3. Web Inspector ile debug et

---

*Bu doküman Aycan OPS PWA implementasyonu için hazırlanmıştır.*