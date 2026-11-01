import { ROLE_ORDER, type MediaRoleValue } from '../media-role'

/**
 * Ordre des visuels d'une fiche produit.
 *
 * Deux choses décident de la place d'un visuel sur la boutique, et il faut les
 * deux : le **rôle**, qui forme les groupes de la galerie dans l'ordre
 * `ROLE_ORDER`, et la **position**, qui classe à l'intérieur d'un groupe. La
 * galerie publique applique exactement cette règle
 * (`src/lib/queries/product.ts`), et le listing du catalogue prend le premier
 * visuel de rôle « Produit » comme vignette.
 *
 * D'où un module à part, et pur : le back-office doit montrer la même
 * séquence que le client verra, et un déplacement doit se vérifier sans base.
 * Tant que l'écran d'administration triait autrement que la galerie,
 * « monter » une image ne voulait rien dire de précis.
 *
 * Un déplacement reste **à l'intérieur du rôle**. Faire sortir une image de son
 * groupe en la montant d'un cran changerait ce que la fiche affirme — un rendu
 * deviendrait un packshot —, et personne ne demande cela en cliquant sur une
 * flèche. Changer de groupe est une autre commande, explicite : le rôle.
 */

export type ElementOrdonne = { id: string; role: string; position: number }

export type Deplacement = 'avant' | 'apres' | 'premier'

/** Rang du rôle dans la galerie ; les rôles inconnus passent en fin. */
function rangRole(role: string): number {
  const rang = ROLE_ORDER.indexOf(role as MediaRoleValue)
  return rang === -1 ? ROLE_ORDER.length : rang
}

/**
 * Les visuels dans l'ordre où la boutique les montrera.
 *
 * Le tri est stable sur la position : deux visuels de même rôle gardent leur
 * ordre relatif, y compris quand leurs positions sont égales — ce qui arrive
 * avec des données importées qui laissent tout à 0.
 */
export function ordreAffichage<T extends ElementOrdonne>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const parRole = rangRole(a.role) - rangRole(b.role)
    if (parRole !== 0) return parRole
    return a.position - b.position
  })
}

/**
 * Nouvel ordre après déplacement, ou `null` si rien ne bouge.
 *
 * `null` n'est pas une erreur : c'est le cas du premier visuel qu'on monte
 * encore. L'appelant n'écrit alors rien plutôt que de réenregistrer la même
 * séquence.
 *
 * `items` est attendu dans l'ordre d'affichage ; le retour est la liste des
 * identifiants, dans le nouvel ordre, prête à être écrite en positions
 * successives.
 */
export function deplacer(
  items: ElementOrdonne[],
  id: string,
  deplacement: Deplacement,
): string[] | null {
  const ordonnes = ordreAffichage(items)
  const index = ordonnes.findIndex((item) => item.id === id)
  if (index === -1) return null

  const element = ordonnes[index]
  const memeRole = (autre: ElementOrdonne) => autre.role === element.role

  if (deplacement === 'premier') {
    const premier = ordonnes.findIndex(memeRole)
    if (premier === index) return null
    const reste = ordonnes.filter((item) => item.id !== id)
    reste.splice(premier, 0, element)
    return reste.map((item) => item.id)
  }

  // Le voisin du même rôle, et non le voisin immédiat : entre deux groupes, il
  // n'y a pas de voisin à échanger.
  let voisin = -1
  if (deplacement === 'avant') {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (memeRole(ordonnes[i])) {
        voisin = i
        break
      }
    }
  } else {
    for (let i = index + 1; i < ordonnes.length; i += 1) {
      if (memeRole(ordonnes[i])) {
        voisin = i
        break
      }
    }
  }
  if (voisin === -1) return null

  const permute = [...ordonnes]
  permute[index] = ordonnes[voisin]
  permute[voisin] = element
  return permute.map((item) => item.id)
}
