/* Firebase Cloud Messaging service worker — handles BACKGROUND web push
   (app closed / backgrounded). Uses the compat SDK via importScripts, which is
   independent of the app's modular bundle. The config below is the same public
   web config as src/firebase.js. Served at the site root; registered with a
   dedicated scope ('/firebase-push/') by src/utils/push.js so it never clobbers
   the PWA's own /sw.js. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBH6VE_mROLAkdWXZ1A7TXEdBSijV5bf9Y',
  authDomain: 'churchopshub.com',
  projectId: 'church-inventory-9615c',
  storageBucket: 'church-inventory-9615c.firebasestorage.app',
  messagingSenderId: '178475375356',
  appId: '1:178475375356:web:617a1674049e6508429579',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'ChurchOpsHub', {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
  });
});

// Focus an existing tab (or open one) when a push notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('https://churchopshub.com');
    }),
  );
});
