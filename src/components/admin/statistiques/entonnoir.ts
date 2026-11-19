/**
 * Les pertes d'une étape à l'autre de l'entonnoir, et celle qu'il faut
 * regarder en premier.
 *
 * **Deux pièges, constatés en production le 19 novembre 2026.**
 *
 * 1. Une étape mesurée depuis peu. « A ajouté au panier » et « A validé la
 *    commande » sont des gestes, enregistrés seulement depuis la mesure
 *    approfondie. Sur 30 jours, elles valaient 0 pendant que l'étape suivante
 *    (le panier, reconnu à la page vue) en comptait 2 : l'écran annonçait
 *    « −100 %, la plus forte perte » à l'ajout au panier, ce qui désignait le
 *    mauvais coupable. Une étape `partielle` n'a donc pas de perte, et
 *    l'étape suivante se compare à la dernière étape complète avant elle.
 *
 * 2. Un petit nombre. Passer de 2 paniers à 0 commande fait −100 %, plus que
 *    les −98 % qui séparent 126 fiches de 2 paniers ; c'est pourtant là que
 *    124 visites se sont perdues. La plus forte perte est donc celle qui perd
 *    le plus de VISITES, le pourcentage ne départageant que les égalités.
 */

export type EtapeEntonnoir = {
  /** Visites arrivées à cette étape. */
  n: number
  /** L'étape n'est mesurée que sur une partie de la période. */
  partielle: boolean
}

export type Perte = { pct: number; perdues: number }

export function pertesEntonnoir(etapes: EtapeEntonnoir[]): {
  pertes: Array<Perte | null>
  pire: number | null
} {
  const pertes = etapes.map((etape, i): Perte | null => {
    if (i === 0 || etape.partielle) return null
    let j = i - 1
    while (j >= 0 && etapes[j].partielle) j -= 1
    if (j < 0) return null
    const avant = etapes[j].n
    // Les étapes ne sont pas une suite stricte (on peut ouvrir son panier sans
    // passer par une fiche) : une étape plus fournie que la précédente n'a
    // rien perdu.
    if (avant <= 0 || etape.n >= avant) return null
    const perdues = avant - etape.n
    return { pct: Math.round((perdues / avant) * 100), perdues }
  })

  let pire: number | null = null
  pertes.forEach((p, i) => {
    if (!p) return
    const q = pire === null ? null : pertes[pire]
    if (!q || p.perdues > q.perdues || (p.perdues === q.perdues && p.pct > q.pct)) pire = i
  })
  return { pertes, pire }
}
