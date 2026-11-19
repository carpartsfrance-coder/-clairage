/*
 * Alertes instantanées de l'équipe LEDVROOM.
 *
 * Ce petit programme tourne dans le navigateur de l'équipe, même onglet
 * fermé, et n'a que deux rôles : afficher la notification d'une nouvelle
 * question, et ouvrir la bonne discussion quand on la touche. Il ne met rien
 * en cache et n'intercepte aucune page : il est enregistré pour /admin/
 * seulement, et la boutique ne le voit jamais.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let alerte = {}
  try {
    alerte = event.data ? event.data.json() : {}
  } catch {
    alerte = {}
  }
  const titre = alerte.titre || 'Nouvelle question en direct'
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: alerte.texte || 'Un visiteur vous a écrit depuis la boutique.',
      // Même discussion : la nouvelle notification remplace l'ancienne, et
      // sonne quand même (`renotify`).
      tag: alerte.tag || 'discussion',
      renotify: true,
      icon: '/icon.png',
      // Pas de `badge` : Android le dessine en silhouette, et une icône en
      // couleur pleine y devient un carré blanc. Sans badge, il pose une cloche.
      data: { url: alerte.url || '/admin/discussions' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const cible = new URL(
    (event.notification.data && event.notification.data.url) || '/admin/discussions',
    self.location.origin,
  ).href
  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // La discussion est déjà ouverte : on la ramène devant.
      for (const fenetre of fenetres) {
        if (fenetre.url === cible && 'focus' in fenetre) return fenetre.focus()
      }
      // Un onglet du back-office est ouvert : on l'emmène sur la discussion.
      for (const fenetre of fenetres) {
        if (fenetre.url.includes('/admin') && 'navigate' in fenetre) {
          const ouverte = await fenetre.navigate(cible)
          return (ouverte || fenetre).focus()
        }
      }
      return self.clients.openWindow(cible)
    })(),
  )
})
