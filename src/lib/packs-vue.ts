import type { PackPositionGroup, PackProduct } from './queries/packs'
import { nomUtileDuConditionnement } from './nom-conditionnement'

/**
 * Mise en forme de la page « éclairages d'un véhicule ».
 *
 * La page groupait les produits par emplacement, une section par emplacement.
 * Le relevé du catalogue dit pourquoi c'était trop : sur 10 178 couples
 * (génération, emplacement), **10 068 ne portent qu'un seul produit** — 98,9 %.
 * Une section entière, titre et compteur compris, pour une carte : le titre
 * coûtait plus de hauteur que ce qu'il annonçait, et sept emplacements
 * tenaient sur trois écrans et demi de téléphone.
 *
 * L'emplacement n'est pas perdu pour autant : il passe sur la carte. Ce qu'il
 * dit — « ça, c'est pour vos feux de croisement » — se lit aussi bien à côté du
 * produit qu'au-dessus d'une liste d'un seul élément.
 */

/** Un produit, avec les emplacements où il est documenté. */
export type ProduitSitue = {
  produit: PackProduct
  /** Un produit peut servir à deux endroits : on les nomme tous. */
  emplacements: Array<{ code: string; label: string }>
}

/**
 * Les produits d'une génération, une seule fois chacun, dans l'ordre des
 * emplacements.
 *
 * Un produit documenté sur deux emplacements apparaissait dans les deux
 * sections ; en grille unique il ferait doublon. On le garde une fois, à sa
 * première place, et sa carte nomme les deux.
 */
export function produitsSitues(groupes: PackPositionGroup[]): ProduitSitue[] {
  const parSlug = new Map<string, ProduitSitue>()
  for (const groupe of groupes) {
    for (const produit of groupe.products) {
      const vu = parSlug.get(produit.productSlug)
      if (vu) {
        if (!vu.emplacements.some((e) => e.label === groupe.label)) {
          vu.emplacements.push({ code: groupe.code, label: groupe.label })
        }
        continue
      }
      parSlug.set(produit.productSlug, {
        produit,
        emplacements: [{ code: groupe.code, label: groupe.label }],
      })
    }
  }
  return [...parSlug.values()]
}

export type TotalVehicule = {
  produits: number
  emplacements: number
  totalCents: number
}

/**
 * Ce que coûte l'éclairage complet du véhicule.
 *
 * La page ne le disait nulle part : elle alignait cinq prix sans jamais les
 * additionner, alors que c'est la question de qui équipe sa voiture.
 *
 * **Les incompatibles ne comptent pas.** Annoncer un total qui inclut un
 * produit dont la fiche dit « incompatible » serait vendre ce qu'on vient de
 * déconseiller. Le prix retenu est celui qu'affiche la carte : le
 * conditionnement conseillé, ou le prix d'entrée à défaut — jamais un troisième
 * prix, qui ferait douter des deux autres.
 */
export function totalVehicule(groupes: PackPositionGroup[]): TotalVehicule {
  const retenus = produitsSitues(groupes).filter(
    (situe) => situe.produit.status !== 'INCOMPATIBLE',
  )
  return {
    produits: retenus.length,
    emplacements: new Set(retenus.flatMap((situe) => situe.emplacements.map((e) => e.label))).size,
    totalCents: retenus.reduce(
      (somme, situe) =>
        somme + (situe.produit.recommended?.priceCents ?? situe.produit.fromPriceCents),
      0,
    ),
  }
}

/** Le nom du conditionnement conseillé, quand il n'est pas celui du produit. */
export function nomDuConditionnement(
  produit: Pick<PackProduct, 'productName' | 'recommended'>,
): string | null {
  return nomUtileDuConditionnement(produit.recommended?.name, produit.productName)
}

/* -------------------------------------------------------------------------- */

/**
 * Zones de la voiture, pour filtrer la liste.
 *
 * Trois, pas huit : « avant / arrière / intérieur » est la question que se pose
 * celui qui vient changer une ampoule, et elle se répond d'un regard sur sa
 * voiture. Filtrer par emplacement n'aurait servi à rien — il y en a un par
 * carte, le filtre aurait rendu une carte.
 *
 * La répartition suit l'endroit d'où la lumière se voit, pas la famille de
 * pièce : des veilleuses sont à l'avant, une plaque à l'arrière, même quand le
 * schéma les range ailleurs.
 */
export const ZONES = [
  { cle: 'tout', label: 'Tout' },
  { cle: 'avant', label: 'Avant' },
  { cle: 'arriere', label: 'Arrière' },
  { cle: 'interieur', label: 'Intérieur' },
] as const

export type Zone = (typeof ZONES)[number]['cle']

const ZONE_PAR_EMPLACEMENT: Record<string, Exclude<Zone, 'tout'>> = {
  LOW_BEAM: 'avant',
  HIGH_BEAM: 'avant',
  FOG: 'avant',
  SIDELIGHT: 'avant',
  TURN_FRONT: 'avant',
  PLATE: 'arriere',
  REVERSE: 'arriere',
  INTERIOR_DOME: 'interieur',
}

/** La zone d'un emplacement, « avant » à défaut — c'est là que tout se voit. */
export function zoneDeLEmplacement(code: string): Exclude<Zone, 'tout'> {
  return ZONE_PAR_EMPLACEMENT[code] ?? 'avant'
}

const LIBELLE_ZONE: Record<Exclude<Zone, 'tout'>, string> = {
  avant: 'Éclairage avant',
  arriere: 'Éclairage arrière',
  interieur: 'Éclairage intérieur',
}

/** « Éclairage avant », sous le nom de l'emplacement. */
export function libelleDeLaZone(zone: Exclude<Zone, 'tout'>): string {
  return LIBELLE_ZONE[zone]
}

/** Les zones réellement représentées, dans l'ordre, « Tout » en tête. */
export function zonesPresentes(codes: string[]): typeof ZONES[number][] {
  const vues = new Set(codes.map(zoneDeLEmplacement))
  return ZONES.filter((zone) => zone.cle === 'tout' || vues.has(zone.cle as Exclude<Zone, 'tout'>))
}
