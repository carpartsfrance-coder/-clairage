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
