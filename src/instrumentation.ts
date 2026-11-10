/**
 * Démarrage du serveur : programme l'effacement des données périmées.
 *
 * Pourquoi ici et pas dans le cron `lumera-jobs` de render.yaml : ce cron est
 * un service Render de plus, à créer et à payer, et rien ne garantit qu'il
 * tourne. Le serveur web, lui, tourne toujours (offre payante, sans mise en
 * veille). L'effacement y est léger — quelques requêtes indexées toutes les
 * six heures — et idempotent si deux instances le lancent ensemble.
 *
 * Seulement en production et dans le runtime Node. `PURGE_DONNEES=off`
 * l'arrête sans redéployer de code.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production') return

  /*
    Allègement des photos déjà stockées trop lourdes (lib/storage/
    alleger-existants.ts), trois minutes après le démarrage, une à la fois.
    `ALLEGER_MEDIAS=off` l'arrête sans redéployer de code.
  */
  if (process.env.ALLEGER_MEDIAS !== 'off') {
    setTimeout(() => {
      void (async () => {
        try {
          const [{ prisma }, { allegerMediasLourds }] = await Promise.all([
            import('./lib/db'),
            import('./lib/storage/alleger-existants'),
          ])
          const bilan = await allegerMediasLourds(prisma)
          if (bilan.allegees + bilan.ignorees > 0) console.log('[médias] allègement terminé', bilan)
        } catch (error) {
          console.error('[médias] allègement interrompu', error)
        }
        // Puis le filigrane des rendus (lib/storage/filigraner-existants.ts),
        // repris toutes les demi-heures pour les rendus ajoutés depuis.
        const { planifierFiligrane } = await import('./lib/storage/filigraner-existants')
        planifierFiligrane()
        setInterval(planifierFiligrane, 30 * 60 * 1000).unref()
      })()
    }, 3 * 60 * 1000).unref()
  }

  if (process.env.PURGE_DONNEES === 'off') return

  const SIX_HEURES = 6 * 60 * 60 * 1000
  const DIX_MINUTES = 10 * 60 * 1000

  const lancer = async () => {
    try {
      const [{ prisma }, { purgerDonnees }] = await Promise.all([
        import('./lib/db'),
        import('./lib/purge-donnees'),
      ])
      const bilan = await purgerDonnees(prisma)
      const total = Object.values(bilan).reduce((somme, n) => somme + n, 0)
      if (total > 0) console.log('[purge] données périmées effacées', bilan)
    } catch (error) {
      console.error('[purge] échec, nouvel essai au prochain passage', error)
    }
  }

  // Pas au démarrage même : la base sert d'abord le site qui redémarre.
  setTimeout(() => {
    void lancer()
    setInterval(() => void lancer(), SIX_HEURES).unref()
  }, DIX_MINUTES).unref()
}
