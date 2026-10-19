import 'server-only'
import { prisma } from './db'

/**
 * Résolution des compatibilités.
 *
 * La règle qui gouverne tout ce fichier : **l'absence de ligne `Fitment` vaut
 * `UNKNOWN`, jamais « compatible »**. Un catalogue incomplet est la situation
 * normale, pas l'exception ; le code ne doit jamais combler un trou par un
 * optimisme par défaut.
 *
 * Deuxième règle : la compatibilité de montage et l'homologation routière sont
 * deux informations distinctes. Elles voyagent ensemble ici, mais ne se
 * déduisent jamais l'une de l'autre, ni du culot.
 */

export type FitmentStatus = 'CONFIRMED' | 'UNKNOWN' | 'INCOMPATIBLE'
export type RoadApproval = 'APPROVED' | 'NOT_APPROVED' | 'UNKNOWN'

export type RequiredAccessory = {
  variantId: string
  sku: string
  productSlug: string
  productName: string
  variantName: string
  quantity: number
  /** Indispensable au montage, par opposition à un complément facultatif. */
  required: boolean
  priceCents: number
  note: string | null
}

export type FitmentResult = {
  variantId: string
  status: FitmentStatus
  /** Emplacement concerné, quand la ligne en désigne un. */
  positionCode: string | null
  positionLabel: string | null
  /** Quantité de cette variante nécessaire pour équiper l'emplacement. */
  quantity: number
  restrictions: string | null
  roadApproval: RoadApproval
  approvalMarket: string
  approvalNote: string | null
  source: string | null
  verifiedAt: Date | null
  accessories: RequiredAccessory[]
}

/** Ce que renvoie la résolution quand rien n'est connu. */
export function unknownFitment(variantId: string): FitmentResult {
  return {
    variantId,
    status: 'UNKNOWN',
    positionCode: null,
    positionLabel: null,
    quantity: 1,
    restrictions: null,
    roadApproval: 'UNKNOWN',
    approvalMarket: 'FR',
    approvalNote: null,
    source: null,
    verifiedAt: null,
    accessories: [],
  }
}

/**
 * Compatibilité de plusieurs variantes pour une configuration de véhicule.
 *
 * Renvoie une entrée pour CHAQUE variante demandée, y compris celles qui n'ont
 * aucune ligne en base : elles reviennent en `UNKNOWN`. L'appelant n'a donc
 * jamais à distinguer « pas de résultat » de « pas compatible ».
 *
 * Quand une variante porte plusieurs lignes (plusieurs emplacements sur le même
 * véhicule), on retient la plus défavorable : une incompatibilité sur un
 * emplacement ne doit pas être masquée par une confirmation sur un autre.
 */
export async function resolveFitments(
  configurationId: string | null,
  variantIds: string[],
): Promise<Map<string, FitmentResult>> {
  const result = new Map<string, FitmentResult>()
  for (const id of variantIds) result.set(id, unknownFitment(id))

  if (!configurationId || variantIds.length === 0) return result

  try {
    const rows = await prisma.fitment.findMany({
      where: { configurationId, variantId: { in: variantIds } },
      include: {
        position: true,
        accessories: {
          include: {
            variant: { include: { product: { select: { slug: true, name: true } } } },
          },
          orderBy: { required: 'desc' },
        },
      },
    })

    // INCOMPATIBLE prime sur UNKNOWN, qui prime sur CONFIRMED : on garde
    // toujours l'information la plus restrictive pour une même variante.
    const severity: Record<FitmentStatus, number> = {
      INCOMPATIBLE: 3,
      UNKNOWN: 2,
      CONFIRMED: 1,
    }

    // `seen` distingue « valeur par défaut » de « ligne réelle déjà retenue ».
    // Sans lui, une vraie ligne UNKNOWN serait indiscernable du UNKNOWN initial
    // et se ferait écraser par une ligne CONFIRMED d'un autre emplacement.
    const seen = new Set<string>()

    for (const row of rows) {
      const current = result.get(row.variantId)
      if (
        seen.has(row.variantId) &&
        current &&
        severity[current.status] >= severity[row.status]
      ) {
        continue
      }
      seen.add(row.variantId)

      result.set(row.variantId, {
        variantId: row.variantId,
        status: row.status,
        positionCode: row.position.code,
        positionLabel: row.position.label,
        quantity: row.quantity,
        restrictions: row.restrictions,
        roadApproval: row.roadApproval,
        approvalMarket: row.approvalMarket,
        approvalNote: row.approvalNote,
        source: row.source,
        verifiedAt: row.verifiedAt,
        accessories: row.accessories.map((accessory) => ({
          variantId: accessory.variantId,
          sku: accessory.variant.sku,
          productSlug: accessory.variant.product.slug,
          productName: accessory.variant.product.name,
          variantName: accessory.variant.name,
          quantity: accessory.quantity,
          required: accessory.required,
          priceCents: accessory.variant.priceCents,
          note: accessory.note,
        })),
      })
    }
  } catch (error) {
    console.error('[fitment] résolution impossible', error)
    // En cas de panne, tout revient en UNKNOWN : on ne confirme rien qu'on
    // n'a pas pu lire.
  }

  return result
}

/** Compatibilité d'une seule variante. */
export async function resolveFitment(
  configurationId: string | null,
  variantId: string,
): Promise<FitmentResult> {
  const map = await resolveFitments(configurationId, [variantId])
  return map.get(variantId) ?? unknownFitment(variantId)
}

/**
 * Compatibilité d'un produit, toutes variantes confondues, pour le classement
 * d'une liste. On prend la meilleure de ses variantes : si l'une des
 * déclinaisons convient, le produit a sa place dans les résultats — c'est la
 * fiche qui détaillera laquelle.
 */
export function bestStatus(statuses: FitmentStatus[]): FitmentStatus {
  if (statuses.includes('CONFIRMED')) return 'CONFIRMED'
  if (statuses.includes('UNKNOWN')) return 'UNKNOWN'
  return statuses.length > 0 ? 'INCOMPATIBLE' : 'UNKNOWN'
}

/** Ordre d'affichage : confirmé, puis à vérifier, puis incompatible. */
export const fitmentSortWeight: Record<FitmentStatus, number> = {
  CONFIRMED: 0,
  UNKNOWN: 1,
  INCOMPATIBLE: 2,
}

/**
 * Conséquences d'un changement de véhicule sur ce qui est déjà au panier.
 *
 * On ne retire rien : on signale. Supprimer un article sans le dire serait pire
 * que d'afficher un conflit — le client doit pouvoir trancher lui-même.
 */
export type CartConflict = {
  variantId: string
  productName: string
  variantName: string
  /** Un conflit n'est jamais « confirmé » : les deux seuls cas sont ceux-ci. */
  status: Exclude<FitmentStatus, 'CONFIRMED'>
  reason: string
}

export async function findCartConflicts(
  configurationId: string | null,
  lines: Array<{ variantId: string; productName: string; variantName: string }>,
): Promise<CartConflict[]> {
  if (!configurationId || lines.length === 0) return []

  const fitments = await resolveFitments(
    configurationId,
    lines.map((line) => line.variantId),
  )

  return lines
    .map((line) => {
      const fitment = fitments.get(line.variantId)
      if (!fitment || fitment.status === 'CONFIRMED') return null
      return {
        variantId: line.variantId,
        productName: line.productName,
        variantName: line.variantName,
        status: fitment.status,
        reason:
          fitment.status === 'INCOMPATIBLE'
            ? (fitment.restrictions ??
              "Cet article ne convient pas à l'équipement d'origine du véhicule sélectionné.")
            : "La compatibilité de cet article avec le véhicule sélectionné n'est pas établie.",
      }
    })
    .filter((conflict): conflict is CartConflict => conflict !== null)
}

/**
 * Accessoire exigé par un montage du panier, et absent du panier.
 *
 * La maquette de référence signale ce cas d'une seule façon : « vous avez
 * choisi les ampoules seules, les adaptateurs et décodeurs ne sont pas
 * inclus ». C'est la bonne alerte, mais elle y est codée en dur pour un
 * produit. Ici elle est calculée, pour n'importe quelle ligne du panier.
 */
export type MissingCartAccessory = {
  variantId: string
  productSlug: string
  productName: string
  variantName: string
  /** Quantité manquante, après déduction de ce qui est déjà au panier. */
  quantity: number
  priceCents: number
  note: string | null
  /**
   * L'article du panier qui rend cet accessoire nécessaire, conditionnement
   * compris : deux conditionnements du même produit n'exigent pas la même
   * chose, et nommer le produit seul laisserait croire que le kit complet est
   * en cause alors qu'il fournit déjà ses accessoires.
   */
  requiredForName: string
}

/**
 * Accessoires indispensables qu'aucune ligne du panier ne fournit.
 *
 * Deux sources seulement peuvent couvrir un accessoire, et l'ordre compte :
 *
 *  1. **le kit de la ligne qui l'exige**. Les composants d'un kit servent au
 *     montage de CE kit : ils ne sont pas des pièces de rechange disponibles
 *     pour une autre ligne. Deux kits complets au panier ne dispensent donc
 *     pas d'acheter les adaptateurs d'une paire d'ampoules nues ajoutée à
 *     côté — leurs adaptateurs sont déjà employés.
 *  2. **une ligne du panier qui EST cet accessoire**, vendu seul. Celle-là
 *     forme une réserve commune, répartie sur tout ce qui en réclame.
 *
 * Sans véhicule sélectionné, la fonction ne renvoie rien : aucun montage
 * n'est connu, donc aucun accessoire ne peut être déclaré nécessaire. Une
 * donnée manquante ne vaut pas obligation.
 */
export type MissingAccessoryLine = {
  variantId: string
  productName: string
  variantName: string
  quantity: number
  /** SKU des composants fournis par cette ligne, pour un kit. */
  componentSkus: Array<{ sku: string; quantity: number }>
}

export async function findMissingCartAccessories(
  configurationId: string | null,
  lines: MissingAccessoryLine[],
): Promise<MissingCartAccessory[]> {
  if (!configurationId || lines.length === 0) return []

  const fitments = await resolveFitments(
    configurationId,
    lines.map((line) => line.variantId),
  )

  return deduceMissingAccessories(lines, fitments)
}

/**
 * La déduction elle-même, séparée de la lecture en base pour être vérifiable.
 *
 * `accessoiresParVariante` donne, pour chaque ligne, ce que son montage exige.
 */
export function deduceMissingAccessories(
  lines: MissingAccessoryLine[],
  accessoiresParVariante: Map<string, Pick<FitmentResult, 'accessories'>>,
): MissingCartAccessory[] {
  const fitments = accessoiresParVariante

  // Réserve commune : les lignes du panier qui sont elles-mêmes l'accessoire.
  const reserve = new Map<string, number>()
  for (const line of lines) {
    reserve.set(line.variantId, (reserve.get(line.variantId) ?? 0) + line.quantity)
  }

  const manquants = new Map<string, MissingCartAccessory>()

  for (const line of lines) {
    const fitment = fitments.get(line.variantId)
    if (!fitment) continue

    // Ce que le kit de CETTE ligne apporte, pour cette ligne seulement.
    const fourniParSonKit = new Map<string, number>()
    for (const composant of line.componentSkus) {
      fourniParSonKit.set(
        composant.sku,
        (fourniParSonKit.get(composant.sku) ?? 0) + composant.quantity * line.quantity,
      )
    }

    for (const accessoire of fitment.accessories) {
      if (!accessoire.required) continue
      // Une ligne n'a pas à s'exiger elle-même.
      if (accessoire.variantId === line.variantId) continue

      const reste =
        accessoire.quantity * line.quantity - (fourniParSonKit.get(accessoire.sku) ?? 0)
      if (reste <= 0) continue

      const existant = manquants.get(accessoire.variantId)
      if (existant) {
        existant.quantity += reste
      } else {
        manquants.set(accessoire.variantId, {
          variantId: accessoire.variantId,
          productSlug: accessoire.productSlug,
          productName: accessoire.productName,
          variantName: accessoire.variantName,
          quantity: reste,
          priceCents: accessoire.priceCents,
          note: accessoire.note,
          requiredForName: `${line.productName} — ${line.variantName}`,
        })
      }
    }
  }

  // La réserve commune se déduit une fois tous les besoins additionnés.
  return [...manquants.values()]
    .map((accessoire) => ({
      ...accessoire,
      quantity: accessoire.quantity - (reserve.get(accessoire.variantId) ?? 0),
    }))
    .filter((accessoire) => accessoire.quantity > 0)
}
