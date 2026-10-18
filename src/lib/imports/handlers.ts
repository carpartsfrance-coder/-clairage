import 'server-only'
import type { Prisma } from '@prisma/client'
import { parseNumber, parsePriceCents } from './csv'

/**
 * Validation et écriture, format par format.
 *
 * Deux principes :
 *
 * 1. **Valider avant d'écrire, ligne par ligne.** Une ligne fautive est
 *    rapportée avec son numéro et son motif, et les autres passent. Un import
 *    qui s'arrête à la première erreur sur un fichier de 3 000 lignes est
 *    inutilisable.
 * 2. **Jamais d'écrasement muet.** Quand une mise à jour change une valeur, le
 *    rapport dit laquelle et avec quoi. « 412 lignes mises à jour » ne permet
 *    de rien vérifier.
 */

export type WriteMode = 'create_only' | 'update_only' | 'upsert'

export type RowOutcome = {
  outcome: 'created' | 'updated' | 'skipped' | 'error' | 'duplicate'
  message?: string
  targetId?: string
}

export type ValidationResult = { errors: string[]; warnings: string[] }

type Row = Record<string, string>

const PACKAGINGS = ['UNIT', 'PAIR', 'PACK', 'KIT'] as const
const VEHICLE_TYPES = ['CAR', 'MOTORCYCLE', 'BOTH'] as const
const FITMENT_STATUSES = ['CONFIRMED', 'UNKNOWN', 'INCOMPATIBLE'] as const
const APPROVALS = ['APPROVED', 'NOT_APPROVED', 'UNKNOWN'] as const

function pick<T extends readonly string[]>(
  raw: string | undefined,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = (raw ?? '').trim().toUpperCase()
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback
}

/* -------------------------------------------------------------------------- */
/* Clés d'unicité                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Clé qui identifie une ligne, pour repérer les doublons DANS le fichier.
 * Deux lignes de même clé ne peuvent pas être toutes deux écrites : la seconde
 * écraserait la première sans que personne ne le voie.
 */
export function dedupKey(kind: string, row: Row): string | null {
  if (kind === 'PRODUCTS' || kind === 'STOCK') {
    return row.sku?.trim().toUpperCase() || null
  }
  if (kind === 'FITMENTS') {
    const parts = [row.makeSlug, row.modelSlug, row.generationSlug, row.equipmentCode, row.positionCode, row.sku]
    if (parts.some((part) => !part?.trim())) return null
    return parts.map((part) => part!.trim().toLowerCase()).join('|')
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function validateRow(kind: string, row: Row): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const require = (key: string, label: string) => {
    if (!row[key]?.trim()) errors.push(`${label} manquant.`)
  }

  if (kind === 'PRODUCTS') {
    require('slug', 'Identifiant produit')
    require('name', 'Nom du produit')
    require('sku', 'Référence')
    require('variantName', 'Nom du conditionnement')

    if (!row.priceCents?.trim()) {
      errors.push('Prix manquant.')
    } else if (parsePriceCents(row.priceCents) === null) {
      errors.push(`Prix illisible : « ${row.priceCents} ».`)
    } else if (parsePriceCents(row.priceCents)! < 0) {
      errors.push('Prix négatif.')
    }

    if (row.packaging?.trim() && !(PACKAGINGS as readonly string[]).includes(row.packaging.trim().toUpperCase())) {
      warnings.push(`Conditionnement « ${row.packaging} » inconnu : UNIT retenu.`)
    }
    if (row.vehicleType?.trim() && !(VEHICLE_TYPES as readonly string[]).includes(row.vehicleType.trim().toUpperCase())) {
      warnings.push(`Type de véhicule « ${row.vehicleType} » inconnu : CAR retenu.`)
    }
    if (row.stockOnHand?.trim() && parseNumber(row.stockOnHand) === null) {
      errors.push(`Stock illisible : « ${row.stockOnHand} ».`)
    }
    if (row.colorTemperature?.trim() && parseNumber(row.colorTemperature) === null) {
      warnings.push(`Température illisible : « ${row.colorTemperature} », ignorée.`)
    }
    if (row.slug?.trim() && !/^[a-z0-9-]+$/.test(row.slug.trim())) {
      errors.push("L'identifiant produit ne doit contenir que des minuscules, chiffres et tirets.")
    }
  }

  if (kind === 'FITMENTS') {
    require('makeSlug', 'Marque')
    require('modelSlug', 'Modèle')
    require('generationSlug', 'Génération')
    require('equipmentCode', "Équipement d'origine")
    require('positionCode', 'Emplacement')
    require('sku', 'Référence')

    const status = row.status?.trim().toUpperCase()
    if (status && !(FITMENT_STATUSES as readonly string[]).includes(status)) {
      // On avertit plutôt que de deviner : une compatibilité mal lue est pire
      // qu'une compatibilité absente.
      warnings.push(`Statut « ${row.status} » inconnu : « à vérifier » retenu.`)
    }
    if (!status) {
      warnings.push('Statut absent : « à vérifier » retenu, jamais « compatible ».')
    }

    const approval = row.roadApproval?.trim().toUpperCase()
    if (approval && !(APPROVALS as readonly string[]).includes(approval)) {
      warnings.push(`Homologation « ${row.roadApproval} » inconnue : « à confirmer » retenue.`)
    }
    if (row.quantity?.trim()) {
      const quantity = parseNumber(row.quantity)
      if (quantity === null || quantity < 1) errors.push(`Quantité invalide : « ${row.quantity} ».`)
    }
    if (row.verifiedAt?.trim() && Number.isNaN(Date.parse(row.verifiedAt.trim()))) {
      warnings.push(`Date de vérification illisible : « ${row.verifiedAt} », ignorée.`)
    }
  }

  if (kind === 'STOCK') {
    require('sku', 'Référence')
    if (!row.stockOnHand?.trim()) {
      errors.push('Stock manquant.')
    } else {
      const stock = parseNumber(row.stockOnHand)
      if (stock === null) errors.push(`Stock illisible : « ${row.stockOnHand} ».`)
      else if (stock < 0) errors.push('Stock négatif.')
    }
  }

  return { errors, warnings }
}

/* -------------------------------------------------------------------------- */
/* Écriture                                                                   */
/* -------------------------------------------------------------------------- */

/** Décrit un changement de valeur, pour que le rapport soit vérifiable. */
function describeChanges(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const changes: string[] = []
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue
    if (before[key] !== value) changes.push(`${key} : ${String(before[key] ?? '—')} → ${String(value)}`)
  }
  return changes
}

export async function applyRow(
  tx: Prisma.TransactionClient,
  kind: string,
  row: Row,
  mode: WriteMode,
): Promise<RowOutcome> {
  if (kind === 'PRODUCTS') return applyProduct(tx, row, mode)
  if (kind === 'FITMENTS') return applyFitment(tx, row, mode)
  if (kind === 'STOCK') return applyStock(tx, row, mode)
  return { outcome: 'error', message: `Format d'import inconnu : ${kind}.` }
}

async function applyProduct(
  tx: Prisma.TransactionClient,
  row: Row,
  mode: WriteMode,
): Promise<RowOutcome> {
  const slug = row.slug.trim()
  const sku = row.sku.trim()
  const priceCents = parsePriceCents(row.priceCents)!

  const category = row.categorySlug?.trim()
    ? await tx.category.findUnique({ where: { slug: row.categorySlug.trim() } })
    : null
  if (row.categorySlug?.trim() && !category) {
    return { outcome: 'error', message: `Catégorie « ${row.categorySlug} » introuvable.` }
  }

  const existingVariant = await tx.productVariant.findUnique({
    where: { sku },
    include: { product: true },
  })

  if (existingVariant && mode === 'create_only') {
    return { outcome: 'skipped', message: `La référence ${sku} existe déjà.` }
  }
  if (!existingVariant && mode === 'update_only') {
    return { outcome: 'skipped', message: `La référence ${sku} n'existe pas encore.` }
  }

  // Le produit porteur, retrouvé par son identifiant.
  let product = await tx.product.findUnique({ where: { slug } })

  const productData = {
    name: row.name.trim(),
    tagline: row.tagline?.trim() || null,
    description: row.description?.trim() || null,
    bulbBase: row.bulbBase?.trim() || null,
    colorTemperature: row.colorTemperature?.trim()
      ? Math.round(parseNumber(row.colorTemperature) ?? 0) || null
      : null,
    vehicleType: pick(row.vehicleType, VEHICLE_TYPES, 'CAR'),
  }

  if (!product) {
    product = await tx.product.create({
      data: {
        slug,
        ...productData,
        // Jamais publié par un import : la mise en vente reste une décision.
        status: 'DRAFT',
      },
    })
    if (category) {
      await tx.productCategory.create({ data: { productId: product.id, categoryId: category.id } })
    }
  } else {
    await tx.product.update({ where: { id: product.id }, data: productData })
    if (category) {
      const link = await tx.productCategory.findUnique({
        where: { productId_categoryId: { productId: product.id, categoryId: category.id } },
      })
      if (!link) {
        await tx.productCategory.create({ data: { productId: product.id, categoryId: category.id } })
      }
    }
  }

  const variantData = {
    name: row.variantName.trim(),
    packaging: pick(row.packaging, PACKAGINGS, 'UNIT'),
    priceCents,
    ...(row.stockOnHand?.trim()
      ? { stockOnHand: Math.round(parseNumber(row.stockOnHand) ?? 0) }
      : {}),
    ...(row.lowStockThreshold?.trim()
      ? { lowStockThreshold: Math.round(parseNumber(row.lowStockThreshold) ?? 0) }
      : {}),
  }

  if (existingVariant) {
    const changes = describeChanges(
      {
        name: existingVariant.name,
        packaging: existingVariant.packaging,
        priceCents: existingVariant.priceCents,
        stockOnHand: existingVariant.stockOnHand,
        lowStockThreshold: existingVariant.lowStockThreshold,
      },
      variantData,
    )
    await tx.productVariant.update({ where: { id: existingVariant.id }, data: variantData })
    return {
      outcome: 'updated',
      targetId: existingVariant.id,
      // Le détail du changement, pour que « mis à jour » soit vérifiable.
      message: changes.length > 0 ? changes.join(' · ') : 'Aucune valeur modifiée.',
    }
  }

  const created = await tx.productVariant.create({
    data: { productId: product.id, sku, ...variantData },
  })
  return { outcome: 'created', targetId: created.id, message: `Produit en brouillon.` }
}

async function applyFitment(
  tx: Prisma.TransactionClient,
  row: Row,
  mode: WriteMode,
): Promise<RowOutcome> {
  const generation = await tx.vehicleGeneration.findFirst({
    where: {
      slug: row.generationSlug.trim(),
      model: { slug: row.modelSlug.trim(), make: { slug: row.makeSlug.trim() } },
    },
  })
  if (!generation) {
    return {
      outcome: 'error',
      message: `Véhicule introuvable : ${row.makeSlug} / ${row.modelSlug} / ${row.generationSlug}.`,
    }
  }

  const equipment = await tx.lightingEquipment.findUnique({
    where: { code: row.equipmentCode.trim().toUpperCase() },
  })
  if (!equipment) {
    return { outcome: 'error', message: `Équipement « ${row.equipmentCode} » introuvable.` }
  }

  const position = await tx.lightPosition.findUnique({
    where: { code: row.positionCode.trim().toUpperCase() },
  })
  if (!position) {
    return { outcome: 'error', message: `Emplacement « ${row.positionCode} » introuvable.` }
  }

  const variant = await tx.productVariant.findUnique({ where: { sku: row.sku.trim() } })
  if (!variant) {
    return { outcome: 'error', message: `Référence « ${row.sku} » introuvable.` }
  }

  // La configuration est créée si elle manque : c'est le point de rattachement
  // des compatibilités, et un import de compatibilités la suppose.
  let configuration = await tx.vehicleConfiguration.findFirst({
    where: { generationId: generation.id, equipmentId: equipment.id, trimId: null, headlampRef: null },
  })
  if (!configuration) {
    configuration = await tx.vehicleConfiguration.create({
      data: { generationId: generation.id, equipmentId: equipment.id },
    })
  }

  const status = pick(row.status, FITMENT_STATUSES, 'UNKNOWN')
  const source = row.source?.trim() || null
  const parsedDate = row.verifiedAt?.trim() ? new Date(row.verifiedAt.trim()) : null
  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null

  const data = {
    status,
    quantity: row.quantity?.trim() ? Math.max(1, Math.round(parseNumber(row.quantity) ?? 1)) : 1,
    restrictions: row.restrictions?.trim() || null,
    roadApproval: pick(row.roadApproval, APPROVALS, 'UNKNOWN'),
    source,
    // Une date de vérification n'a de sens que sur une compatibilité confirmée.
    // La poser ailleurs laisserait croire qu'un « à vérifier » a été vérifié.
    verifiedAt: status === 'CONFIRMED' ? (validDate ?? new Date()) : null,
  }

  const existing = await tx.fitment.findUnique({
    where: {
      configurationId_positionId_variantId: {
        configurationId: configuration.id,
        positionId: position.id,
        variantId: variant.id,
      },
    },
  })

  if (existing && mode === 'create_only') {
    return { outcome: 'skipped', message: 'Cette compatibilité existe déjà.' }
  }
  if (!existing && mode === 'update_only') {
    return { outcome: 'skipped', message: "Cette compatibilité n'existe pas encore." }
  }

  if (existing) {
    const changes = describeChanges(
      {
        status: existing.status,
        quantity: existing.quantity,
        roadApproval: existing.roadApproval,
        source: existing.source,
      },
      { status: data.status, quantity: data.quantity, roadApproval: data.roadApproval, source: data.source },
    )
    await tx.fitment.update({ where: { id: existing.id }, data })
    return {
      outcome: 'updated',
      targetId: existing.id,
      message: changes.length > 0 ? changes.join(' · ') : 'Aucune valeur modifiée.',
    }
  }

  const created = await tx.fitment.create({
    data: {
      configurationId: configuration.id,
      positionId: position.id,
      variantId: variant.id,
      ...data,
    },
  })
  return { outcome: 'created', targetId: created.id }
}

async function applyStock(
  tx: Prisma.TransactionClient,
  row: Row,
  mode: WriteMode,
): Promise<RowOutcome> {
  if (mode === 'create_only') {
    return { outcome: 'skipped', message: "L'import de stocks ne crée pas de référence." }
  }

  const sku = row.sku.trim()
  const variant = await tx.productVariant.findUnique({
    where: { sku },
    include: { components: { select: { id: true } } },
  })
  if (!variant) return { outcome: 'error', message: `Référence « ${sku} » introuvable.` }

  if (variant.components.length > 0) {
    // Le stock d'un kit se calcule : lui en écrire un créerait deux vérités.
    return {
      outcome: 'skipped',
      message: `${sku} est un kit : son stock se calcule depuis ses composants.`,
    }
  }

  const stockOnHand = Math.round(parseNumber(row.stockOnHand) ?? 0)
  const data: { stockOnHand: number; lowStockThreshold?: number } = { stockOnHand }
  if (row.lowStockThreshold?.trim()) {
    data.lowStockThreshold = Math.round(parseNumber(row.lowStockThreshold) ?? 0)
  }

  const delta = stockOnHand - variant.stockOnHand
  await tx.productVariant.update({ where: { id: variant.id }, data })

  if (delta !== 0) {
    // Un mouvement de stock, pour que l'inventaire reste explicable.
    await tx.stockMovement.create({
      data: { variantId: variant.id, delta, reason: 'import', reference: sku },
    })
  }

  return {
    outcome: 'updated',
    targetId: variant.id,
    message:
      delta === 0
        ? 'Stock inchangé.'
        : `Stock ${variant.stockOnHand} → ${stockOnHand} (${delta > 0 ? '+' : ''}${delta}).`,
  }
}
