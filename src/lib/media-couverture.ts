import type { MediaRole } from '@prisma/client'

/**
 * Le visuel qui représente un produit partout ailleurs que sur sa fiche :
 * carte du catalogue, résultats véhicule, panier, commandes, accueil.
 *
 * **Le rendu passe devant le produit.** Un pack d'ampoules photographié seul
 * montre deux culots sur fond blanc : c'est exact, et ça ne dit rien à qui
 * cherche de la lumière pour sa voiture. Le rendu montre le feu concerné,
 * allumé, sur le véhicule — c'est ce que le client achète. Quand une fiche en
 * a un, c'est lui qu'on met en avant ; sinon, le visuel produit reprend sa
 * place.
 *
 * L'ordre ne peut pas se demander à la base : il faudrait trier sur le rôle, et
 * l'ordre d'un énuméré tient à l'ordre de sa déclaration dans le schéma. Un
 * jour où quelqu'un réordonnerait `MediaRole` pour faire propre, la couverture
 * de toutes les fiches changerait sans que rien ne le signale. On rapatrie donc
 * les quelques visuels de tête et on choisit ici, en toutes lettres.
 */

/** Les rôles qui peuvent servir de couverture, du plus parlant au moins. */
const ORDRE_ROLES: MediaRole[] = ['RESULT', 'PRODUCT']

/**
 * À passer tel quel au `include` Prisma des listes de produits.
 *
 * Pas de `as const` : Prisma attend des tableaux modifiables, et un littéral
 * figé se fait refuser à la compilation.
 */
export const ARGS_COUVERTURE = {
  where: { role: { in: ORDRE_ROLES } },
  orderBy: { position: 'asc' as const },
  /** De quoi tenir les deux rôles ; au-delà, rien ne peut plus l'emporter. */
  take: 6,
}

type Entree = { role: string; media: unknown }

/**
 * Une entrée de galerie : son rôle, et la légende de son visuel.
 *
 * `caption` est facultative — c'est la pose des rendus qui la renseigne, et
 * rien n'oblige un visuel téléversé en back-office à en porter une.
 */
type EntreeGalerie = { role: string; media?: { caption?: string | null } | null }

/**
 * La couverture parmi les visuels rapatriés, ou `undefined` s'il n'y en a
 * aucun. Les entrées sont supposées déjà triées par position.
 */
export function couverture<T extends Entree>(entrees: readonly T[]): T | undefined {
  for (const role of ORDRE_ROLES) {
    const trouve = entrees.find((entree) => entree.role === role)
    if (trouve) return trouve
  }
  return undefined
}

/**
 * Les visuels que la galerie d'une fiche montre réellement.
 *
 * **Quand une fiche porte ses propres rendus, ses visuels « produit » ne sont
 * plus affichés.** C'est l'autre face de la règle de publication : on ne publie
 * une fiche que lorsque ses trois images originales existent, et ces trois
 * images suffisent alors à la raconter. Les visuels « produit » encore
 * rattachés sont les vignettes reprises du fournisseur — 219 × 183 pixels à
 * côté de rendus en 1024 × 1024. Les laisser revenait à montrer au client une
 * photo minuscule qui n'est pas la nôtre, juste après trois images faites pour
 * sa voiture.
 *
 * Ils comptaient aussi deux fois, parce que la galerie alimente les données
 * structurées : chaque vignette du fournisseur partait vers Google Shopping au
 * même titre que le gros plan choisi pour cela.
 *
 * **Rien n'est détaché pour autant.** Les visuels restent rattachés à la fiche
 * et visibles en back-office ; ils reviennent d'eux-mêmes si ses rendus sont
 * retirés, et une fiche qui n'en a pas garde les siens — sans quoi elle
 * n'aurait plus aucune image.
 *
 * `KIT_CONTENT` et `INSTALL` ne sont pas concernés : le contenu du kit et le
 * montage disent autre chose que le rendu, et aucun des deux ne vient du
 * fournisseur.
 *
 * Le jour où une fiche recevra un vrai packshot à nous, cette règle devra se
 * reposer sur la provenance du visuel plutôt que sur son rôle — aujourd'hui
 * les deux coïncident, et rien en base ne distingue encore l'un de l'autre.
 */
export function visuelsDeLaFiche<T extends EntreeGalerie>(entrees: readonly T[]): T[] {
  const aSesRendus = entrees.some((entree) => entree.role === 'RESULT')
  const retenus = aSesRendus
    ? entrees.filter((entree) => entree.role !== 'PRODUCT')
    : [...entrees]

  /*
    Une vue, une image.

    Deux fiches portaient deux jeux complets de rendus — le gros plan, le
    comparatif et le véhicule entier en double, pour la même voiture et le même
    éclairage. C'est la pose qui les a laissés : une série de photos refaite
    dépose de nouveaux fichiers, et l'ancienne série reste rattachée plutôt que
    d'être détachée. La fiche racontait alors deux fois la même histoire, avec
    deux images différentes à chaque fois — un client y cherche forcément une
    différence qui n'existe pas.

    La légende identifie la vue, parce que c'est elle que `VUES` pose et qu'il
    n'y a rien d'autre en base pour distinguer deux séries. On garde la
    première de chaque vue, donc celle de la série en place. Un visuel sans
    légende n'est jamais écarté : on ne peut rien conclure de son absence.
  */
  const vuesVues = new Set<string>()
  return retenus.filter((entree) => {
    const legende = entree.media?.caption
    if (!legende) return true
    if (vuesVues.has(legende)) return false
    vuesVues.add(legende)
    return true
  })
}
