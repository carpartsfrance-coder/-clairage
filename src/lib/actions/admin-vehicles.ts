'use server'

import { revalidatePath } from 'next/cache'
import type { VehicleType } from '@prisma/client'
import { prisma } from '../db'
import { audit, requireStaff, type StaffUser } from '../admin/guard'
import { CHEMIN_PAR_TYPE } from '../queries/packs'
import {
  deletionBlockedReason,
  isValidSlug,
  parseFitment,
  parsePeriod,
  resolveSlug,
  slugify,
  vehiclePackPath,
  type VehicleLevel,
} from '../admin/vehicles'

/**
 * Écriture du référentiel véhicule depuis le back-office.
 *
 * Jusqu'ici, marques, modèles, générations, configurations et compatibilités
 * ne se créaient que par `prisma/seed.ts` ou par import CSV : une boutique sans
 * accès à la ligne de commande ne pouvait pas enregistrer un véhicule. Ces
 * actions comblent ce trou.
 *
 * Quatre règles, non négociables ici :
 *
 * 1. **Chaque action revérifie `vehicles.edit`.** Une action de serveur est un
 *    point d'entrée public : la page qui affiche le bouton ne protège rien.
 * 2. **Le statut par défaut d'une compatibilité est `UNKNOWN`**, et
 *    `CONFIRMED` exige une source et une date saisies à la main. Le code
 *    n'écrit jamais de `verifiedAt` à la place de l'administrateur — voir
 *    `lib/admin/vehicles.ts`, où la règle est isolée et testée.
 * 3. **Rien de destructif sur ce qui porte des compatibilités.** La
 *    désactivation retire du site sans rien perdre ; la suppression n'est
 *    offerte que sur une ligne vide, et le refus dit pourquoi.
 * 4. **Tout est journalisé** dans `AuditLog`, avec l'état avant et après quand
 *    il est connu.
 *
 * Une action par niveau plutôt qu'une par bouton : les écrans en comptent une
 * vingtaine, et autant de retours séparés rendrait l'interface illisible. Le
 * champ caché `intent` dit laquelle, et chaque intention a sa fonction.
 */

export type VehicleAdminState = { error?: string; notice?: string }

/* -------------------------------------------------------------------------- */
/* Outillage commun                                                           */
/* -------------------------------------------------------------------------- */

function champ(formData: FormData, nom: string): string {
  const valeur = formData.get(nom)
  return typeof valeur === 'string' ? valeur.trim() : ''
}

function erreur(contexte: string, cause: unknown): VehicleAdminState {
  console.error(`[admin] véhicules — ${contexte}`, cause)
  return { error: "L'enregistrement a échoué. Rien n'a été modifié." }
}

/**
 * Invalide ce que le site public sert sur ce véhicule.
 *
 * Le menu est rendu dans le gabarit : sans `revalidatePath('/', 'layout')`,
 * une marque nouvellement créée n'apparaîtrait nulle part tant qu'un autre
 * changement ne l'aurait pas forcé. Les pages de packs sont invalidées du plus
 * général au plus précis, parce qu'une génération ajoutée change aussi la
 * liste des modèles et celle des marques.
 *
 * La fiche produit n'est pas listée : elle lit le véhicule choisi dans le
 * cookie, donc elle est rendue à chaque requête et n'a rien à invalider.
 */
function revalidateVehicle(scope: {
  type: VehicleType
  makeSlug?: string | null
  modelSlug?: string | null
  generationSlug?: string | null
}): void {
  revalidatePath('/admin/vehicules')
  revalidatePath('/', 'layout')

  // `BOTH` n'est listé par aucun des deux parcours ; on invalide les deux
  // quand même, pour le cas où le type vient de changer dans un sens ou l'autre.
  const chemins =
    scope.type === 'BOTH' ? ['auto', 'moto'] : [CHEMIN_PAR_TYPE[scope.type as 'CAR' | 'MOTORCYCLE']]

  for (const chemin of chemins) {
    revalidatePath(`/packs/${chemin}`)
    if (!scope.makeSlug) continue
    revalidatePath(vehiclePackPath(chemin, scope.makeSlug))
    if (!scope.modelSlug) continue
    revalidatePath(vehiclePackPath(chemin, scope.makeSlug, scope.modelSlug))
    if (!scope.generationSlug) continue
    revalidatePath(
      vehiclePackPath(chemin, scope.makeSlug, scope.modelSlug, scope.generationSlug),
    )
  }
}

/** Contexte d'une génération : ce qu'il faut pour invalider et pour afficher. */
async function contexteGeneration(generationId: string) {
  return prisma.vehicleGeneration.findUnique({
    where: { id: generationId },
    select: {
      id: true,
      slug: true,
      name: true,
      model: { select: { slug: true, make: { select: { slug: true, type: true } } } },
    },
  })
}

/**
 * Type de véhicule.
 *
 * `BOTH` est accepté en modification mais jamais proposé à la création : aucun
 * des deux parcours publics ne liste une marque « voiture et moto »
 * (`listPackMakes` filtre sur un type précis), elle serait donc invisible.
 * L'écran le dit sur les marques qui le portent déjà, au lieu de le corriger
 * dans leur dos.
 */
const TYPES_CONNUS: VehicleType[] = ['CAR', 'MOTORCYCLE', 'BOTH']

function lireType(formData: FormData, autoriseBoth = true): VehicleType | null {
  const brut = champ(formData, 'type').toUpperCase()
  if (!(TYPES_CONNUS as string[]).includes(brut)) return null
  if (brut === 'BOTH' && !autoriseBoth) return null
  return brut as VehicleType
}

/**
 * Logo choisi pour une marque.
 *
 * Le champ vaut l'identifiant d'un média déjà déposé dans `/admin/medias` :
 * cet écran choisit, il ne téléverse pas. Un champ vide retire le logo, ce qui
 * n'est pas une perte — l'affichage public retombe sur le monogramme de la
 * marque.
 *
 * L'existence du média est vérifiée avant l'écriture, pour que le refus
 * explique le problème au lieu de laisser remonter une violation de clé
 * étrangère.
 */
async function lireLogo(
  formData: FormData,
): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const id = champ(formData, 'logoMediaId')
  if (!id) return { ok: true, value: null }

  const media = await prisma.media.findUnique({ where: { id }, select: { id: true } })
  if (!media) {
    return { ok: false, error: 'Le visuel choisi est introuvable : il a pu être supprimé.' }
  }
  return { ok: true, value: id }
}

/* ========================================================================== */
/* Les deux points d'entrée                                                   */
/* ========================================================================== */

/*
  Un point d'entrée par écran, et non un par bouton.

  `useActionState` garde un état par action : avec quinze actions, l'écran
  afficherait quinze retours dont quatorze périmés, et l'administrateur ne
  saurait plus lequel répond à son dernier geste. Chaque formulaire porte donc
  deux champs cachés — `level` (ce qu'on touche) et `intent` (ce qu'on en
  fait) — et l'écran n'a qu'un message à montrer, celui de son geste.

  Le droit est vérifié ici, une fois, avant tout aiguillage : aucune des
  fonctions appelées ensuite n'est exportée, donc aucune n'est atteignable
  sans passer par ce contrôle.
*/

/** Marques, modèles, générations. */
export async function manageVehicle(
  _state: VehicleAdminState,
  formData: FormData,
): Promise<VehicleAdminState> {
  const staff = await requireStaff('vehicles.edit')

  switch (champ(formData, 'level')) {
    case 'make':
      return manageMake(staff, formData)
    case 'model':
      return manageModel(staff, formData)
    case 'generation':
      return manageGeneration(staff, formData)
    default:
      return { error: 'Demande invalide.' }
  }
}

/** Configurations, compatibilités et accessoires exigés. */
export async function manageCompatibility(
  _state: VehicleAdminState,
  formData: FormData,
): Promise<VehicleAdminState> {
  const staff = await requireStaff('vehicles.edit')

  switch (champ(formData, 'level')) {
    case 'configuration':
      return manageConfiguration(staff, formData)
    case 'fitment':
      return manageFitment(staff, formData)
    default:
      return { error: 'Demande invalide.' }
  }
}

/* ========================================================================== */
/* Marques                                                                    */
/* ========================================================================== */

async function manageMake(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const intent = champ(formData, 'intent')

  switch (intent) {
    case 'create':
      return créerMarque(staff, formData)
    case 'update':
      return modifierMarque(staff, formData)
    case 'toggle':
      return basculerMarque(staff, formData)
    case 'slug':
      return changerAdresse(staff, formData, 'make')
    case 'delete':
      return supprimerMarque(staff, formData)
    default:
      return { error: 'Demande invalide.' }
  }
}

async function créerMarque(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const name = champ(formData, 'name')
  if (!name) return { error: 'Le nom de la marque est obligatoire.' }

  const type = lireType(formData, false)
  if (!type) return { error: 'Choisissez un type de véhicule : voiture ou moto.' }

  const slug = resolveSlug({ name, slug: champ(formData, 'slug') })
  if (!slug.ok) return { error: slug.error }

  try {
    const existante = await prisma.vehicleMake.findUnique({ where: { slug: slug.value } })
    if (existante) {
      return {
        error: `L'adresse « ${slug.value} » est déjà prise par « ${existante.name} ». Choisissez-en une autre.`,
      }
    }

    const logo = await lireLogo(formData)
    if (!logo.ok) return { error: logo.error }

    const make = await prisma.vehicleMake.create({
      data: { name, slug: slug.value, type, position: 0, logoMediaId: logo.value },
    })
    await audit(staff, 'vehicle.make.create', 'VehicleMake', make.id, null, {
      name,
      slug: slug.value,
      type,
      logoMediaId: logo.value,
    })
    revalidateVehicle({ type, makeSlug: slug.value })

    return {
      notice: `Marque « ${name} » créée. Elle n'apparaîtra dans le menu qu'une fois dotée d'un modèle actif.`,
    }
  } catch (cause) {
    return erreur('création de marque', cause)
  }
}

async function modifierMarque(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const id = champ(formData, 'makeId')
  const name = champ(formData, 'name')
  if (!id || !name) return { error: 'Demande invalide.' }

  const type = lireType(formData)
  if (!type) return { error: 'Choisissez un type de véhicule : voiture ou moto.' }

  const positionBrute = champ(formData, 'position')
  const position = positionBrute === '' ? 0 : Number(positionBrute)
  if (!Number.isInteger(position) || position < 0) {
    return { error: 'La position doit être un nombre entier positif.' }
  }

  try {
    const avant = await prisma.vehicleMake.findUnique({ where: { id } })
    if (!avant) return { error: 'Marque introuvable.' }

    const logo = await lireLogo(formData)
    if (!logo.ok) return { error: logo.error }

    await prisma.vehicleMake.update({
      where: { id },
      data: { name, type, position, logoMediaId: logo.value },
    })
    await audit(
      staff,
      'vehicle.make.update',
      'VehicleMake',
      id,
      {
        name: avant.name,
        type: avant.type,
        position: avant.position,
        logoMediaId: avant.logoMediaId,
      },
      { name, type, position, logoMediaId: logo.value },
    )
    // Le type a pu changer : on invalide l'ancien parcours comme le nouveau.
    revalidateVehicle({ type: avant.type, makeSlug: avant.slug })
    revalidateVehicle({ type, makeSlug: avant.slug })

    const logoRetire = avant.logoMediaId !== null && logo.value === null
    return {
      notice:
        `« ${name} » est enregistrée. Son adresse publique reste « ${avant.slug} » : renommer ne déplace pas les liens déjà partagés.` +
        (logoRetire ? ' Son logo est détaché : le menu affichera son monogramme.' : ''),
    }
  } catch (cause) {
    return erreur('modification de marque', cause)
  }
}

async function basculerMarque(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const id = champ(formData, 'makeId')
  const active = champ(formData, 'active') === 'true'
  if (!id) return { error: 'Demande invalide.' }

  try {
    const make = await prisma.vehicleMake.update({ where: { id }, data: { active } })
    await audit(staff, 'vehicle.make.toggle', 'VehicleMake', id, { active: !active }, { active })
    revalidateVehicle({ type: make.type, makeSlug: make.slug })

    return {
      notice: active
        ? `« ${make.name} » est réactivée.`
        : `« ${make.name} » est désactivée : elle sort du menu et du parcours véhicule. Ses modèles et ses compatibilités sont conservés.`,
    }
  } catch (cause) {
    return erreur('activation de marque', cause)
  }
}

async function supprimerMarque(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const id = champ(formData, 'makeId')
  if (!id) return { error: 'Demande invalide.' }

  try {
    const make = await prisma.vehicleMake.findUnique({
      where: { id },
      include: { _count: { select: { models: true } } },
    })
    if (!make) return { error: 'Marque introuvable.' }

    const fitments = await prisma.fitment.count({
      where: { configuration: { generation: { model: { makeId: id } } } },
    })
    const refus = deletionBlockedReason('make', { children: make._count.models, fitments })
    if (refus) return { error: refus }

    await prisma.vehicleMake.delete({ where: { id } })
    await audit(staff, 'vehicle.make.delete', 'VehicleMake', id, { name: make.name, slug: make.slug }, null)
    revalidateVehicle({ type: make.type, makeSlug: make.slug })

    return { notice: `Marque « ${make.name} » supprimée. Elle ne portait aucun modèle.` }
  } catch (cause) {
    return erreur('suppression de marque', cause)
  }
}

/* ========================================================================== */
/* Modèles                                                                    */
/* ========================================================================== */

async function manageModel(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const intent = champ(formData, 'intent')

  switch (intent) {
    case 'create':
      return créerModèle(staff, formData)
    case 'update':
      return modifierModèle(staff, formData)
    case 'toggle':
      return basculerModèle(staff, formData)
    case 'slug':
      return changerAdresse(staff, formData, 'model')
    case 'delete':
      return supprimerModèle(staff, formData)
    default:
      return { error: 'Demande invalide.' }
  }
}

async function créerModèle(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const makeId = champ(formData, 'makeId')
  const name = champ(formData, 'name')
  if (!makeId || !name) return { error: 'Le nom du modèle est obligatoire.' }

  const slug = resolveSlug({ name, slug: champ(formData, 'slug') })
  if (!slug.ok) return { error: slug.error }

  try {
    const make = await prisma.vehicleMake.findUnique({ where: { id: makeId } })
    if (!make) return { error: 'Marque introuvable.' }

    const existant = await prisma.vehicleModel.findUnique({
      where: { makeId_slug: { makeId, slug: slug.value } },
    })
    if (existant) {
      return { error: `« ${make.name} » a déjà un modèle à l'adresse « ${slug.value} ».` }
    }

    const model = await prisma.vehicleModel.create({ data: { makeId, name, slug: slug.value } })
    await audit(staff, 'vehicle.model.create', 'VehicleModel', model.id, null, {
      make: make.name,
      name,
      slug: slug.value,
    })
    revalidateVehicle({ type: make.type, makeSlug: make.slug, modelSlug: slug.value })

    return {
      notice: `Modèle « ${name} » créé. Ajoutez-lui une génération : sans génération, il n'apparaît pas dans le parcours véhicule.`,
    }
  } catch (cause) {
    return erreur('création de modèle', cause)
  }
}

async function modifierModèle(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const id = champ(formData, 'modelId')
  const name = champ(formData, 'name')
  if (!id || !name) return { error: 'Demande invalide.' }

  try {
    const avant = await prisma.vehicleModel.findUnique({
      where: { id },
      include: { make: { select: { slug: true, type: true } } },
    })
    if (!avant) return { error: 'Modèle introuvable.' }

    await prisma.vehicleModel.update({ where: { id }, data: { name } })
    await audit(staff, 'vehicle.model.update', 'VehicleModel', id, { name: avant.name }, { name })
    revalidateVehicle({
      type: avant.make.type,
      makeSlug: avant.make.slug,
      modelSlug: avant.slug,
    })

    return { notice: `« ${name} » est enregistré. Son adresse reste « ${avant.slug} ».` }
  } catch (cause) {
    return erreur('modification de modèle', cause)
  }
}

async function basculerModèle(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const id = champ(formData, 'modelId')
  const active = champ(formData, 'active') === 'true'
  if (!id) return { error: 'Demande invalide.' }

  try {
    const model = await prisma.vehicleModel.update({
      where: { id },
      data: { active },
      include: { make: { select: { slug: true, type: true } } },
    })
    await audit(staff, 'vehicle.model.toggle', 'VehicleModel', id, { active: !active }, { active })
    revalidateVehicle({ type: model.make.type, makeSlug: model.make.slug, modelSlug: model.slug })

    return {
      notice: active
        ? `« ${model.name} » est réactivé.`
        : `« ${model.name} » est désactivé : il sort du parcours véhicule. Ses générations et ses compatibilités sont conservées.`,
    }
  } catch (cause) {
    return erreur('activation de modèle', cause)
  }
}

async function supprimerModèle(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const id = champ(formData, 'modelId')
  if (!id) return { error: 'Demande invalide.' }

  try {
    const model = await prisma.vehicleModel.findUnique({
      where: { id },
      include: {
        make: { select: { slug: true, type: true } },
        _count: { select: { generations: true } },
      },
    })
    if (!model) return { error: 'Modèle introuvable.' }

    const fitments = await prisma.fitment.count({
      where: { configuration: { generation: { modelId: id } } },
    })
    const refus = deletionBlockedReason('model', {
      children: model._count.generations,
      fitments,
    })
    if (refus) return { error: refus }

    await prisma.vehicleModel.delete({ where: { id } })
    await audit(staff, 'vehicle.model.delete', 'VehicleModel', id, { name: model.name }, null)
    revalidateVehicle({ type: model.make.type, makeSlug: model.make.slug, modelSlug: model.slug })

    return { notice: `Modèle « ${model.name} » supprimé. Il ne portait aucune génération.` }
  } catch (cause) {
    return erreur('suppression de modèle', cause)
  }
}

/* ========================================================================== */
/* Générations                                                                */
/* ========================================================================== */

async function manageGeneration(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const intent = champ(formData, 'intent')

  switch (intent) {
    case 'create':
      return créerGénération(staff, formData)
    case 'update':
      return modifierGénération(staff, formData)
    case 'toggle':
      return basculerGénération(staff, formData)
    case 'slug':
      return changerAdresse(staff, formData, 'generation')
    case 'delete':
      return supprimerGénération(staff, formData)
    default:
      return { error: 'Demande invalide.' }
  }
}

async function créerGénération(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const modelId = champ(formData, 'modelId')
  const name = champ(formData, 'name')
  if (!modelId || !name) return { error: 'Le nom de la génération est obligatoire.' }

  const période = parsePeriod(champ(formData, 'yearFrom'), champ(formData, 'yearTo'))
  if (!période.ok) return { error: période.error }

  const slug = resolveSlug({ name, slug: champ(formData, 'slug') })
  if (!slug.ok) return { error: slug.error }

  try {
    const model = await prisma.vehicleModel.findUnique({
      where: { id: modelId },
      include: { make: { select: { slug: true, type: true, name: true } } },
    })
    if (!model) return { error: 'Modèle introuvable.' }

    const existante = await prisma.vehicleGeneration.findUnique({
      where: { modelId_slug: { modelId, slug: slug.value } },
    })
    if (existante) {
      return { error: `« ${model.name} » a déjà une génération à l'adresse « ${slug.value} ».` }
    }

    const generation = await prisma.vehicleGeneration.create({
      data: {
        modelId,
        name,
        slug: slug.value,
        phase: champ(formData, 'phase') || null,
        yearFrom: période.value.yearFrom,
        yearTo: période.value.yearTo,
      },
    })
    await audit(staff, 'vehicle.generation.create', 'VehicleGeneration', generation.id, null, {
      model: model.name,
      name,
      slug: slug.value,
      yearFrom: période.value.yearFrom,
      yearTo: période.value.yearTo,
    })
    revalidateVehicle({
      type: model.make.type,
      makeSlug: model.make.slug,
      modelSlug: model.slug,
      generationSlug: slug.value,
    })

    return {
      notice: `Génération « ${name} » créée. Donnez-lui une configuration : sans équipement d'origine, aucune compatibilité ne peut s'y rattacher.`,
    }
  } catch (cause) {
    return erreur('création de génération', cause)
  }
}

async function modifierGénération(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'generationId')
  const name = champ(formData, 'name')
  if (!id || !name) return { error: 'Demande invalide.' }

  const période = parsePeriod(champ(formData, 'yearFrom'), champ(formData, 'yearTo'))
  if (!période.ok) return { error: période.error }

  try {
    const avant = await prisma.vehicleGeneration.findUnique({
      where: { id },
      include: { model: { include: { make: { select: { slug: true, type: true } } } } },
    })
    if (!avant) return { error: 'Génération introuvable.' }

    const phase = champ(formData, 'phase') || null
    await prisma.vehicleGeneration.update({
      where: { id },
      data: { name, phase, yearFrom: période.value.yearFrom, yearTo: période.value.yearTo },
    })
    await audit(
      staff,
      'vehicle.generation.update',
      'VehicleGeneration',
      id,
      { name: avant.name, phase: avant.phase, yearFrom: avant.yearFrom, yearTo: avant.yearTo },
      { name, phase, ...période.value },
    )
    revalidateVehicle({
      type: avant.model.make.type,
      makeSlug: avant.model.make.slug,
      modelSlug: avant.model.slug,
      generationSlug: avant.slug,
    })

    return { notice: `« ${name} » est enregistrée. Son adresse reste « ${avant.slug} ».` }
  } catch (cause) {
    return erreur('modification de génération', cause)
  }
}

async function basculerGénération(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'generationId')
  const active = champ(formData, 'active') === 'true'
  if (!id) return { error: 'Demande invalide.' }

  try {
    const generation = await prisma.vehicleGeneration.update({
      where: { id },
      data: { active },
      include: { model: { include: { make: { select: { slug: true, type: true } } } } },
    })
    await audit(
      staff,
      'vehicle.generation.toggle',
      'VehicleGeneration',
      id,
      { active: !active },
      { active },
    )
    revalidateVehicle({
      type: generation.model.make.type,
      makeSlug: generation.model.make.slug,
      modelSlug: generation.model.slug,
      generationSlug: generation.slug,
    })

    return {
      notice: active
        ? `« ${generation.name} » est réactivée.`
        : `« ${generation.name} » est désactivée : sa page publique ne répond plus. Ses compatibilités sont conservées.`,
    }
  } catch (cause) {
    return erreur('activation de génération', cause)
  }
}

async function supprimerGénération(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'generationId')
  if (!id) return { error: 'Demande invalide.' }

  try {
    const generation = await prisma.vehicleGeneration.findUnique({
      where: { id },
      include: {
        model: { include: { make: { select: { slug: true, type: true } } } },
        _count: { select: { configurations: true } },
      },
    })
    if (!generation) return { error: 'Génération introuvable.' }

    const fitments = await prisma.fitment.count({
      where: { configuration: { generationId: id } },
    })
    const refus = deletionBlockedReason('generation', {
      children: generation._count.configurations,
      fitments,
    })
    if (refus) return { error: refus }

    await prisma.vehicleGeneration.delete({ where: { id } })
    await audit(
      staff,
      'vehicle.generation.delete',
      'VehicleGeneration',
      id,
      { name: generation.name },
      null,
    )
    revalidateVehicle({
      type: generation.model.make.type,
      makeSlug: generation.model.make.slug,
      modelSlug: generation.model.slug,
      generationSlug: generation.slug,
    })

    return {
      notice: `Génération « ${generation.name} » supprimée. Elle ne portait aucune configuration.`,
    }
  } catch (cause) {
    return erreur('suppression de génération', cause)
  }
}

/* ========================================================================== */
/* Adresses publiques                                                         */
/* ========================================================================== */

/**
 * Change le slug d'une marque, d'un modèle ou d'une génération.
 *
 * Une opération à part, et jamais un effet de bord d'un renommage : le slug
 * est dans les URL `/packs/...` que les clients ont pu enregistrer et que les
 * moteurs ont indexées. Le formulaire exige une confirmation explicite, et
 * cette action la revérifie — la case cochée à l'écran ne protège rien.
 *
 * Aucune redirection n'est posée : le projet n'a pas de table de redirections,
 * et en inventer une ici donnerait l'illusion que les anciens liens survivent.
 * L'écran dit donc ce qui va se passer, sans l'adoucir.
 */
async function changerAdresse(
  staff: StaffUser,
  formData: FormData,
  level: VehicleLevel,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'entityId')
  const demandé = champ(formData, 'slug')
  if (!id || !demandé) return { error: "Saisissez la nouvelle adresse." }

  if (champ(formData, 'confirm') !== 'oui') {
    return {
      error:
        'Cochez la confirmation : changer une adresse rend les anciens liens introuvables, sans redirection.',
    }
  }

  const slug = slugify(demandé)
  if (!isValidSlug(slug)) {
    return { error: "L'adresse n'accepte que des minuscules, des chiffres et des traits d'union." }
  }

  try {
    if (level === 'make') {
      const avant = await prisma.vehicleMake.findUnique({ where: { id } })
      if (!avant) return { error: 'Marque introuvable.' }
      if (avant.slug === slug) return { notice: "L'adresse est déjà celle-là." }

      if (await prisma.vehicleMake.findUnique({ where: { slug } })) {
        return { error: `L'adresse « ${slug} » est déjà prise.` }
      }

      await prisma.vehicleMake.update({ where: { id }, data: { slug } })
      await audit(staff, 'vehicle.make.slug', 'VehicleMake', id, { slug: avant.slug }, { slug })
      revalidateVehicle({ type: avant.type, makeSlug: avant.slug })
      revalidateVehicle({ type: avant.type, makeSlug: slug })

      return {
        notice: `Adresse changée : « ${avant.slug} » devient « ${slug} ». Les liens vers l'ancienne adresse, et vers tous ses modèles, ne répondent plus.`,
      }
    }

    if (level === 'model') {
      const avant = await prisma.vehicleModel.findUnique({
        where: { id },
        include: { make: { select: { slug: true, type: true } } },
      })
      if (!avant) return { error: 'Modèle introuvable.' }
      if (avant.slug === slug) return { notice: "L'adresse est déjà celle-là." }

      const pris = await prisma.vehicleModel.findUnique({
        where: { makeId_slug: { makeId: avant.makeId, slug } },
      })
      if (pris) return { error: `L'adresse « ${slug} » est déjà prise dans cette marque.` }

      await prisma.vehicleModel.update({ where: { id }, data: { slug } })
      await audit(staff, 'vehicle.model.slug', 'VehicleModel', id, { slug: avant.slug }, { slug })
      revalidateVehicle({ type: avant.make.type, makeSlug: avant.make.slug, modelSlug: avant.slug })
      revalidateVehicle({ type: avant.make.type, makeSlug: avant.make.slug, modelSlug: slug })

      return {
        notice: `Adresse changée : « ${avant.slug} » devient « ${slug} ». Les liens vers l'ancienne adresse ne répondent plus.`,
      }
    }

    const avant = await prisma.vehicleGeneration.findUnique({
      where: { id },
      include: { model: { include: { make: { select: { slug: true, type: true } } } } },
    })
    if (!avant) return { error: 'Génération introuvable.' }
    if (avant.slug === slug) return { notice: "L'adresse est déjà celle-là." }

    const pris = await prisma.vehicleGeneration.findUnique({
      where: { modelId_slug: { modelId: avant.modelId, slug } },
    })
    if (pris) return { error: `L'adresse « ${slug} » est déjà prise dans ce modèle.` }

    await prisma.vehicleGeneration.update({ where: { id }, data: { slug } })
    await audit(
      staff,
      'vehicle.generation.slug',
      'VehicleGeneration',
      id,
      { slug: avant.slug },
      { slug },
    )
    for (const valeur of [avant.slug, slug]) {
      revalidateVehicle({
        type: avant.model.make.type,
        makeSlug: avant.model.make.slug,
        modelSlug: avant.model.slug,
        generationSlug: valeur,
      })
    }

    return {
      notice: `Adresse changée : « ${avant.slug} » devient « ${slug} ». Les liens vers l'ancienne adresse ne répondent plus.`,
    }
  } catch (cause) {
    return erreur("changement d'adresse", cause)
  }
}

/* ========================================================================== */
/* Configurations                                                             */
/* ========================================================================== */

async function manageConfiguration(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const intent = champ(formData, 'intent')

  switch (intent) {
    case 'create':
      return créerConfiguration(staff, formData)
    case 'toggle':
      return basculerConfiguration(staff, formData)
    case 'delete':
      return supprimerConfiguration(staff, formData)
    default:
      return { error: 'Demande invalide.' }
  }
}

/**
 * Rattache un équipement d'origine à une génération.
 *
 * La finition est saisie en clair plutôt que choisie dans une liste : elle
 * n'existe que si elle change l'équipement lumineux, et la créer d'avance pour
 * ensuite la choisir ferait deux écrans là où un champ suffit. Elle est
 * retrouvée par son adresse si elle existe déjà, créée sinon.
 */
async function créerConfiguration(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const generationId = champ(formData, 'generationId')
  const equipmentId = champ(formData, 'equipmentId')
  if (!generationId || !equipmentId) {
    return { error: "Choisissez l'équipement d'origine." }
  }

  const headlampRef = champ(formData, 'headlampRef') || null
  const label = champ(formData, 'label') || null
  const trimName = champ(formData, 'trimName')

  try {
    const generation = await contexteGeneration(generationId)
    if (!generation) return { error: 'Génération introuvable.' }

    const equipment = await prisma.lightingEquipment.findUnique({ where: { id: equipmentId } })
    if (!equipment) return { error: "Équipement d'origine introuvable." }

    let trimId: string | null = null
    if (trimName) {
      const trimSlug = resolveSlug({ name: trimName })
      if (!trimSlug.ok) return { error: trimSlug.error }

      const trim = await prisma.vehicleTrim.upsert({
        where: { generationId_slug: { generationId, slug: trimSlug.value } },
        update: { name: trimName },
        create: { generationId, slug: trimSlug.value, name: trimName },
      })
      trimId = trim.id
    }

    const doublon = await prisma.vehicleConfiguration.findFirst({
      where: { generationId, equipmentId, trimId, headlampRef },
    })
    if (doublon) {
      return {
        error: `Cette configuration existe déjà pour « ${generation.name} ». Complétez-la plutôt que d'en créer une seconde.`,
      }
    }

    const configuration = await prisma.vehicleConfiguration.create({
      data: { generationId, equipmentId, trimId, headlampRef, label },
    })
    await audit(
      staff,
      'vehicle.configuration.create',
      'VehicleConfiguration',
      configuration.id,
      null,
      { generation: generation.name, equipment: equipment.code, trimName: trimName || null, headlampRef },
    )
    revalidateVehicle({
      type: generation.model.make.type,
      makeSlug: generation.model.make.slug,
      modelSlug: generation.model.slug,
      generationSlug: generation.slug,
    })
    revalidatePath(`/admin/vehicules/${generationId}`)

    return {
      notice: `Configuration « ${equipment.label} » ajoutée. Rattachez-lui des compatibilités : seule, elle n'affiche encore aucune pièce.`,
    }
  } catch (cause) {
    return erreur('création de configuration', cause)
  }
}

async function basculerConfiguration(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'configurationId')
  const active = champ(formData, 'active') === 'true'
  if (!id) return { error: 'Demande invalide.' }

  try {
    const configuration = await prisma.vehicleConfiguration.update({
      where: { id },
      data: { active },
      include: { equipment: true, generation: true },
    })
    await audit(
      staff,
      'vehicle.configuration.toggle',
      'VehicleConfiguration',
      id,
      { active: !active },
      { active },
    )

    const generation = await contexteGeneration(configuration.generationId)
    if (generation) {
      revalidateVehicle({
        type: generation.model.make.type,
        makeSlug: generation.model.make.slug,
        modelSlug: generation.model.slug,
        generationSlug: generation.slug,
      })
    }
    revalidatePath(`/admin/vehicules/${configuration.generationId}`)

    return {
      notice: active
        ? `Configuration « ${configuration.equipment.label} » réactivée.`
        : `Configuration « ${configuration.equipment.label} » désactivée : ses compatibilités ne sont plus présentées, et restent enregistrées.`,
    }
  } catch (cause) {
    return erreur('activation de configuration', cause)
  }
}

async function supprimerConfiguration(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'configurationId')
  if (!id) return { error: 'Demande invalide.' }

  try {
    const configuration = await prisma.vehicleConfiguration.findUnique({
      where: { id },
      include: {
        equipment: true,
        _count: { select: { fitments: true, savedVehicles: true, carts: true, orders: true } },
      },
    })
    if (!configuration) return { error: 'Configuration introuvable.' }

    if (configuration._count.fitments > 0) {
      const s = configuration._count.fitments > 1 ? 's' : ''
      return {
        error: `Cette configuration porte ${configuration._count.fitments} compatibilité${s} : la supprimer les effacerait. Désactivez-la.`,
      }
    }
    // Un véhicule enregistré, un panier ou une commande pointent dessus :
    // la supprimer romprait le lien d'une commande avec le véhicule concerné.
    const rattachements =
      configuration._count.savedVehicles + configuration._count.carts + configuration._count.orders
    if (rattachements > 0) {
      return {
        error: `Cette configuration est rattachée à ${rattachements} véhicule enregistré, panier ou commande. Désactivez-la plutôt que de la supprimer.`,
      }
    }

    await prisma.vehicleConfiguration.delete({ where: { id } })
    await audit(
      staff,
      'vehicle.configuration.delete',
      'VehicleConfiguration',
      id,
      { equipment: configuration.equipment.code },
      null,
    )

    const generation = await contexteGeneration(configuration.generationId)
    if (generation) {
      revalidateVehicle({
        type: generation.model.make.type,
        makeSlug: generation.model.make.slug,
        modelSlug: generation.model.slug,
        generationSlug: generation.slug,
      })
    }
    revalidatePath(`/admin/vehicules/${configuration.generationId}`)

    return { notice: `Configuration « ${configuration.equipment.label} » supprimée.` }
  } catch (cause) {
    return erreur('suppression de configuration', cause)
  }
}

/* ========================================================================== */
/* Compatibilités                                                             */
/* ========================================================================== */

async function manageFitment(staff: StaffUser, formData: FormData): Promise<VehicleAdminState> {
  const intent = champ(formData, 'intent')

  switch (intent) {
    case 'create':
      return créerCompatibilité(staff, formData)
    case 'update':
      return modifierCompatibilité(staff, formData)
    case 'delete':
      return supprimerCompatibilité(staff, formData)
    case 'accessory.add':
      return ajouterAccessoire(staff, formData)
    case 'accessory.remove':
      return retirerAccessoire(staff, formData)
    default:
      return { error: 'Demande invalide.' }
  }
}

/** Champs communs à la création et à la modification, validés au même endroit. */
function lireCompatibilité(formData: FormData) {
  return parseFitment({
    status: champ(formData, 'status'),
    quantity: champ(formData, 'quantity'),
    restrictions: champ(formData, 'restrictions'),
    roadApproval: champ(formData, 'roadApproval'),
    approvalMarket: champ(formData, 'approvalMarket'),
    approvalNote: champ(formData, 'approvalNote'),
    source: champ(formData, 'source'),
    verifiedAt: champ(formData, 'verifiedAt'),
  })
}

/** Invalide la page publique de la génération qui porte cette configuration. */
async function revalidateDepuisConfiguration(configurationId: string): Promise<void> {
  const configuration = await prisma.vehicleConfiguration.findUnique({
    where: { id: configurationId },
    select: { generationId: true },
  })
  if (!configuration) return

  const generation = await contexteGeneration(configuration.generationId)
  if (generation) {
    revalidateVehicle({
      type: generation.model.make.type,
      makeSlug: generation.model.make.slug,
      modelSlug: generation.model.slug,
      generationSlug: generation.slug,
    })
  }
  revalidatePath(`/admin/vehicules/${configuration.generationId}`)
}

async function créerCompatibilité(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const configurationId = champ(formData, 'configurationId')
  const positionId = champ(formData, 'positionId')
  const variantId = champ(formData, 'variantId')
  if (!configurationId || !positionId || !variantId) {
    return { error: 'Choisissez un emplacement et une référence.' }
  }

  const valeurs = lireCompatibilité(formData)
  if (!valeurs.ok) return { error: valeurs.error }

  try {
    const [configuration, position, variant] = await Promise.all([
      prisma.vehicleConfiguration.findUnique({ where: { id: configurationId } }),
      prisma.lightPosition.findUnique({ where: { id: positionId } }),
      prisma.productVariant.findUnique({
        where: { id: variantId },
        include: { product: { select: { name: true } } },
      }),
    ])
    if (!configuration) return { error: 'Configuration introuvable.' }
    if (!position) return { error: 'Emplacement introuvable.' }
    if (!variant) return { error: 'Référence introuvable.' }

    const doublon = await prisma.fitment.findUnique({
      where: {
        configurationId_positionId_variantId: { configurationId, positionId, variantId },
      },
    })
    if (doublon) {
      return {
        error: `« ${variant.product.name} — ${variant.name} » est déjà documentée sur « ${position.label} » pour cette configuration. Modifiez la ligne existante.`,
      }
    }

    const fitment = await prisma.fitment.create({
      data: {
        configurationId,
        positionId,
        variantId,
        ...valeurs.value,
        // Qui a saisi la vérification, et seulement s'il y en a une : sans
        // date, personne n'a vérifié, et nommer quelqu'un serait faux.
        verifiedBy: valeurs.value.verifiedAt ? staff.id : null,
      },
    })
    await audit(staff, 'vehicle.fitment.create', 'Fitment', fitment.id, null, {
      position: position.code,
      sku: variant.sku,
      ...valeurs.value,
      verifiedAt: valeurs.value.verifiedAt?.toISOString() ?? null,
    })
    await revalidateDepuisConfiguration(configurationId)

    return {
      notice:
        valeurs.value.status === 'CONFIRMED'
          ? `Compatibilité confirmée enregistrée pour « ${variant.product.name} — ${variant.name} ».`
          : `Compatibilité enregistrée en « ${valeurs.value.status === 'INCOMPATIBLE' ? 'incompatible' : 'à vérifier'} » pour « ${variant.product.name} — ${variant.name} ».`,
    }
  } catch (cause) {
    return erreur('création de compatibilité', cause)
  }
}

async function modifierCompatibilité(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'fitmentId')
  if (!id) return { error: 'Demande invalide.' }

  const valeurs = lireCompatibilité(formData)
  if (!valeurs.ok) return { error: valeurs.error }

  try {
    const avant = await prisma.fitment.findUnique({
      where: { id },
      include: { variant: { include: { product: { select: { name: true } } } } },
    })
    if (!avant) return { error: 'Compatibilité introuvable.' }

    await prisma.fitment.update({
      where: { id },
      data: { ...valeurs.value, verifiedBy: valeurs.value.verifiedAt ? staff.id : null },
    })
    await audit(
      staff,
      'vehicle.fitment.update',
      'Fitment',
      id,
      {
        status: avant.status,
        quantity: avant.quantity,
        roadApproval: avant.roadApproval,
        source: avant.source,
        verifiedAt: avant.verifiedAt?.toISOString() ?? null,
      },
      { ...valeurs.value, verifiedAt: valeurs.value.verifiedAt?.toISOString() ?? null },
    )
    await revalidateDepuisConfiguration(avant.configurationId)

    return {
      notice: `« ${avant.variant.product.name} — ${avant.variant.name} » est enregistrée.`,
    }
  } catch (cause) {
    return erreur('modification de compatibilité', cause)
  }
}

/**
 * Retire une ligne de compatibilité.
 *
 * Supprimer est ici sans danger, et c'est la seule suppression franche de ce
 * fichier : en l'absence de ligne, la lecture retombe sur `UNKNOWN`
 * (`lib/fitment.ts`), c'est-à-dire sur « on ne sait pas ». On ne perd donc pas
 * une confirmation au profit d'une affirmation contraire, seulement une
 * documentation que l'on cesse d'avancer.
 */
async function supprimerCompatibilité(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'fitmentId')
  if (!id) return { error: 'Demande invalide.' }

  try {
    const fitment = await prisma.fitment.findUnique({
      where: { id },
      include: {
        position: true,
        variant: { include: { product: { select: { name: true } } } },
      },
    })
    if (!fitment) return { error: 'Compatibilité introuvable.' }

    await prisma.fitment.delete({ where: { id } })
    await audit(
      staff,
      'vehicle.fitment.delete',
      'Fitment',
      id,
      { sku: fitment.variant.sku, position: fitment.position.code, status: fitment.status },
      null,
    )
    await revalidateDepuisConfiguration(fitment.configurationId)

    return {
      notice: `Compatibilité retirée pour « ${fitment.variant.product.name} — ${fitment.variant.name} ». Faute de ligne, cette pièce redevient « à vérifier » sur ce véhicule.`,
    }
  } catch (cause) {
    return erreur('suppression de compatibilité', cause)
  }
}

/* -------------------------------------------------------------------------- */
/* Accessoires exigés                                                         */
/* -------------------------------------------------------------------------- */

async function ajouterAccessoire(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const fitmentId = champ(formData, 'fitmentId')
  const variantId = champ(formData, 'variantId')
  if (!fitmentId || !variantId) return { error: "Choisissez la référence de l'accessoire." }

  const quantitéBrute = champ(formData, 'quantity')
  const quantity = quantitéBrute === '' ? 1 : Number(quantitéBrute)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return { error: 'La quantité doit être un nombre entier compris entre 1 et 99.' }
  }

  try {
    const fitment = await prisma.fitment.findUnique({ where: { id: fitmentId } })
    if (!fitment) return { error: 'Compatibilité introuvable.' }

    if (fitment.variantId === variantId) {
      return { error: "Une référence ne peut pas s'exiger elle-même comme accessoire." }
    }

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { name: true } } },
    })
    if (!variant) return { error: 'Référence introuvable.' }

    const data = {
      quantity,
      required: champ(formData, 'required') !== 'false',
      note: champ(formData, 'note') || null,
    }
    const accessoire = await prisma.fitmentAccessory.upsert({
      where: { fitmentId_variantId: { fitmentId, variantId } },
      update: data,
      create: { fitmentId, variantId, ...data },
    })
    await audit(staff, 'vehicle.fitment.accessory.add', 'FitmentAccessory', accessoire.id, null, {
      fitmentId,
      sku: variant.sku,
      ...data,
    })
    await revalidateDepuisConfiguration(fitment.configurationId)

    return {
      notice: data.required
        ? `« ${variant.product.name} — ${variant.name} » est désormais indispensable à ce montage ; le panier le signalera s'il manque.`
        : `« ${variant.product.name} — ${variant.name} » est proposé en complément facultatif.`,
    }
  } catch (cause) {
    return erreur('ajout d’accessoire', cause)
  }
}

async function retirerAccessoire(
  staff: StaffUser,
  formData: FormData,
): Promise<VehicleAdminState> {
  const id = champ(formData, 'accessoryId')
  if (!id) return { error: 'Demande invalide.' }

  try {
    const accessoire = await prisma.fitmentAccessory.findUnique({
      where: { id },
      include: {
        fitment: { select: { configurationId: true } },
        variant: { include: { product: { select: { name: true } } } },
      },
    })
    if (!accessoire) return { error: 'Accessoire introuvable.' }

    await prisma.fitmentAccessory.delete({ where: { id } })
    await audit(
      staff,
      'vehicle.fitment.accessory.remove',
      'FitmentAccessory',
      id,
      { sku: accessoire.variant.sku, required: accessoire.required },
      null,
    )
    await revalidateDepuisConfiguration(accessoire.fitment.configurationId)

    return {
      notice: `« ${accessoire.variant.product.name} — ${accessoire.variant.name} » n'est plus exigé par ce montage.`,
    }
  } catch (cause) {
    return erreur('retrait d’accessoire', cause)
  }
}
