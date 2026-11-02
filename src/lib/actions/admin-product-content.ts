'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import { adresseProduit, type Saisie } from '../admin/catalogue'
import {
  isSens,
  ordreApresDeplacement,
  parseFaq,
  parseIdentite,
  parseRedactionnel,
  parseSpec,
  raisonAdresseFigee,
  raisonGuideNonRattachable,
} from '../admin/produit-contenu'

/**
 * Écriture du contenu d'une fiche produit : ce qu'elle raconte au client.
 *
 * Le bloc achat avait ses actions ; le contenu n'en avait aucune. La fiche
 * d'administration affichait le nom, la marque, le culot, la teinte, le niveau
 * de montage et les caractéristiques **en lecture**, et les questions
 * fréquentes comme les guides de montage n'y apparaissaient même pas. Changer
 * un culot demandait une requête à la main, sur la base de production.
 *
 * Six règles tiennent ce fichier :
 *
 * 1. **Chaque action revérifie `catalog.edit`.** Une action de serveur est un
 *    point d'entrée public : masquer un formulaire ne protège rien.
 * 2. **Chaque écriture est journalisée** avec l'avant et l'après. Un contenu
 *    de fiche est ce que la boutique affirme ; savoir qui a changé une
 *    homologation ou une teinte six mois plus tôt est le minimum.
 * 3. **L'adresse publique a son propre formulaire, et il est fermé sur une
 *    fiche en ligne.** Rien ici ne pose de redirection : déplacer `/p/<slug>`
 *    casse tous les liens partagés. La garde est dans
 *    `raisonAdresseFigee`, et elle est rejouée ici — pas seulement à l'écran.
 * 4. **Le culot invalide le gabarit, pas seulement la fiche.** Le menu liste
 *    les culots avec leur comptage : sans `revalidatePath('/', 'layout')`, un
 *    culot corrigé laisserait le menu mentir jusqu'à la prochaine
 *    régénération.
 * 5. **Les positions sont renumérotées à chaque changement.** Un trou dans la
 *    suite des positions ferait dépendre l'ordre affiché de l'ordre d'insertion
 *    en base, c'est-à-dire de rien.
 * 6. **Un clic sans effet n'est pas une erreur.** Déplacer la première ligne
 *    vers le haut n'écrit rien et ne dit rien.
 *
 * Les règles de saisie vivent dans `lib/admin/produit-contenu.ts`, où elles se
 * testent sans base.
 */

export type ContentState = {
  error?: string
  notice?: string
  /**
   * La saisie refusée, renvoyée telle quelle.
   *
   * React 19 réinitialise le formulaire dès que l'action se termine : sans ce
   * renvoi, un culot refusé pour un espace emporterait le nom, la marque et la
   * teinte qu'on venait de corriger.
   */
  saisie?: Saisie
}

/* -------------------------------------------------------------------------- */
/* Outillage commun                                                           */
/* -------------------------------------------------------------------------- */

/* Mêmes aides que dans les autres fichiers d'actions, et délibérément
   locales : un module partagé ne pourrait pas vivre à côté d'un `'use
   server'`, qui n'exporte que des fonctions asynchrones. */

function champ(formData: FormData, nom: string): string {
  const valeur = formData.get(nom)
  return typeof valeur === 'string' ? valeur.trim() : ''
}

/** Le texte long garde ses retours à la ligne et ses espaces de début de ligne. */
function texteLong(formData: FormData, nom: string): string {
  const valeur = formData.get(nom)
  return typeof valeur === 'string' ? valeur : ''
}

function erreur(contexte: string, cause: unknown, saisie?: Saisie): ContentState {
  console.error(`[admin] contenu produit — ${contexte}`, cause)
  return { error: "L'enregistrement a échoué. Rien n'a été modifié.", saisie }
}

function saisieRenvoyee(formData: FormData): Saisie {
  const saisie: Saisie = {}
  for (const [cle, valeur] of formData.entries()) {
    if (typeof valeur === 'string' && !cle.startsWith('$')) saisie[cle] = valeur
  }
  return saisie
}

/**
 * Invalide ce que le site public sert à propos de ce produit.
 *
 * Les listes de rubrique lisent le véhicule retenu dans le cookie : elles sont
 * rendues à chaque requête et n'ont rien à invalider. L'accueil, lui, est mis
 * en cache et montre le nom, le culot et la teinte des produits mis en avant.
 *
 * `menu` invalide la racine en tant que gabarit, ce qui emporte tout ce qui est
 * en dessous : le menu y liste les culots avec leur comptage, et la page
 * `/culot/<base>` existe pour chaque culot rencontré.
 */
function rafraichir(produit: { id: string; slug: string }, options?: { menu?: boolean }): void {
  revalidatePath(`/admin/catalogue/${produit.id}`)
  revalidatePath('/admin/catalogue')
  revalidatePath(`/p/${produit.slug}`)
  revalidatePath('/')
  if (options?.menu) revalidatePath('/', 'layout')
}

async function produitDe(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, status: true, name: true },
  })
}

/* -------------------------------------------------------------------------- */
/* Identité                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Nom, marque, culot, teinte, niveau de montage, type de véhicule.
 *
 * Ces six champs vont ensemble parce qu'ils décrivent le produit lui-même, et
 * que quatre d'entre eux décident d'où il apparaît : le culot alimente le menu
 * et la recherche par culot, la teinte une facette, le type de véhicule les
 * parcours auto et moto, le niveau de montage la section « Montage ».
 */
export async function updateProductIdentity(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)

  const productId = champ(formData, 'productId')
  const identite = parseIdentite({
    name: champ(formData, 'name'),
    brand: champ(formData, 'brand'),
    bulbBase: champ(formData, 'bulbBase'),
    temperature: champ(formData, 'temperature'),
    difficulty: champ(formData, 'difficulty'),
    vehicleType: champ(formData, 'vehicleType'),
  })
  if (!identite.ok) return { error: identite.error, saisie }

  try {
    const avant = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        bulbBase: true,
        colorTemperature: true,
        difficulty: true,
        vehicleType: true,
      },
    })
    if (!avant) return { error: 'Produit introuvable.', saisie }

    await prisma.product.update({ where: { id: productId }, data: identite.value })
    await audit(
      staff,
      'product.identity',
      'Product',
      productId,
      {
        name: avant.name,
        brand: avant.brand,
        bulbBase: avant.bulbBase,
        colorTemperature: avant.colorTemperature,
        difficulty: avant.difficulty,
        vehicleType: avant.vehicleType,
      },
      identite.value,
    )

    /*
      Le menu n'est invalidé que si le culot ou le type de véhicule a changé.
      Invalider le gabarit à chaque correction de nom reconstruirait tout le
      site pour une coquille.
    */
    const menu =
      avant.bulbBase !== identite.value.bulbBase || avant.vehicleType !== identite.value.vehicleType
    rafraichir(avant, { menu })

    return { notice: 'Fiche enregistrée.' }
  } catch (cause) {
    return erreur('identité', cause, saisie)
  }
}

/* -------------------------------------------------------------------------- */
/* Adresse publique                                                           */
/* -------------------------------------------------------------------------- */

/**
 * L'adresse `/p/<slug>`, et la seule raison pour laquelle elle a son propre
 * formulaire : la changer n'est pas une correction, c'est une rupture de lien.
 *
 * Le refus sur une fiche en ligne est rejoué ici. L'écran ne montre pas le
 * champ dans ce cas, mais une action de serveur se laisse appeler directement.
 */
export async function updateProductAddress(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)

  const productId = champ(formData, 'productId')

  try {
    const avant = await produitDe(productId)
    if (!avant) return { error: 'Produit introuvable.', saisie }

    const figee = raisonAdresseFigee({ statut: avant.status })
    if (figee) return { error: figee, saisie }

    const adresse = adresseProduit({ name: avant.name, slug: champ(formData, 'slug') })
    if (!adresse.ok) return { error: adresse.error, saisie }
    if (adresse.value === avant.slug) return { notice: "L'adresse est déjà celle-là." }

    const prise = await prisma.product.findUnique({
      where: { slug: adresse.value },
      select: { name: true },
    })
    if (prise) {
      return {
        error: `L'adresse « ${adresse.value} » est déjà prise par « ${prise.name} ». Choisissez-en une autre.`,
        saisie,
      }
    }

    await prisma.product.update({ where: { id: productId }, data: { slug: adresse.value } })
    await audit(
      staff,
      'product.address',
      'Product',
      productId,
      { slug: avant.slug },
      { slug: adresse.value },
    )

    // L'ancienne adresse est invalidée elle aussi : sans ça, la page servie
    // depuis le cache continuerait de répondre sur un chemin qui n'existe plus.
    revalidatePath(`/p/${avant.slug}`)
    rafraichir({ id: productId, slug: adresse.value })

    return { notice: `Adresse enregistrée : /p/${adresse.value}` }
  } catch (cause) {
    return erreur('adresse', cause, saisie)
  }
}

/* -------------------------------------------------------------------------- */
/* Rédactionnel                                                               */
/* -------------------------------------------------------------------------- */

/**
 * La description courte et le rédactionnel long.
 *
 * Ils ont leur propre formulaire parce qu'on y revient autrement : on corrige
 * un culot en dix secondes, on écrit un rédactionnel en vingt minutes. Les
 * mélanger ferait perdre le texte en cours à chaque enregistrement d'un champ
 * voisin.
 */
export async function updateProductCopy(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)

  const productId = champ(formData, 'productId')
  const textes = parseRedactionnel({
    description: texteLong(formData, 'description'),
    body: texteLong(formData, 'body'),
  })
  if (!textes.ok) return { error: textes.error, saisie }

  try {
    const avant = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true, description: true, body: true },
    })
    if (!avant) return { error: 'Produit introuvable.', saisie }

    await prisma.product.update({ where: { id: productId }, data: textes.value })
    await audit(
      staff,
      'product.copy',
      'Product',
      productId,
      { description: avant.description, body: avant.body },
      textes.value,
    )
    rafraichir(avant)

    return { notice: 'Textes enregistrés.' }
  } catch (cause) {
    return erreur('rédactionnel', cause, saisie)
  }
}

/* -------------------------------------------------------------------------- */
/* Caractéristiques                                                           */
/* -------------------------------------------------------------------------- */

async function specsDe(productId: string) {
  return prisma.productSpec.findMany({
    where: { productId },
    orderBy: { position: 'asc' },
    select: { id: true, label: true, value: true },
  })
}

export async function createProductSpec(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const productId = champ(formData, 'productId')

  try {
    const produit = await produitDe(productId)
    if (!produit) return { error: 'Produit introuvable.', saisie }

    const existantes = await specsDe(productId)
    const ligne = parseSpec(
      { label: champ(formData, 'label'), value: champ(formData, 'value') },
      { existantes },
    )
    if (!ligne.ok) return { error: ligne.error, saisie }

    const creee = await prisma.productSpec.create({
      data: { productId, ...ligne.value, position: existantes.length },
    })
    await audit(staff, 'product.spec.create', 'ProductSpec', creee.id, null, {
      productId,
      ...ligne.value,
    })
    rafraichir(produit)

    return { notice: `« ${ligne.value.label} » ajoutée.` }
  } catch (cause) {
    return erreur('ajout de caractéristique', cause, saisie)
  }
}

export async function updateProductSpec(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const specId = champ(formData, 'specId')

  try {
    const avant = await prisma.productSpec.findUnique({
      where: { id: specId },
      select: {
        id: true,
        label: true,
        value: true,
        product: { select: { id: true, slug: true } },
      },
    })
    if (!avant) return { error: 'Caractéristique introuvable.', saisie }

    const existantes = await specsDe(avant.product.id)
    const ligne = parseSpec(
      { label: champ(formData, 'label'), value: champ(formData, 'value') },
      { existantes, id: specId },
    )
    if (!ligne.ok) return { error: ligne.error, saisie }

    await prisma.productSpec.update({ where: { id: specId }, data: ligne.value })
    await audit(
      staff,
      'product.spec.update',
      'ProductSpec',
      specId,
      { label: avant.label, value: avant.value },
      ligne.value,
    )
    rafraichir(avant.product)

    return { notice: `« ${ligne.value.label} » enregistrée.` }
  } catch (cause) {
    return erreur('modification de caractéristique', cause, saisie)
  }
}

export async function removeProductSpec(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const specId = champ(formData, 'specId')

  try {
    const avant = await prisma.productSpec.findUnique({
      where: { id: specId },
      select: {
        label: true,
        value: true,
        product: { select: { id: true, slug: true } },
      },
    })
    if (!avant) return { error: 'Caractéristique introuvable.' }

    /*
      Suppression puis renumérotation dans la même transaction : une position
      laissée à trou ferait dépendre l'ordre affiché de l'ordre d'insertion.
    */
    const restantes = (await specsDe(avant.product.id)).filter((ligne) => ligne.id !== specId)
    await prisma.$transaction([
      prisma.productSpec.delete({ where: { id: specId } }),
      ...restantes.map((ligne, index) =>
        prisma.productSpec.update({ where: { id: ligne.id }, data: { position: index } }),
      ),
    ])
    await audit(
      staff,
      'product.spec.delete',
      'ProductSpec',
      specId,
      { label: avant.label, value: avant.value },
      null,
    )
    rafraichir(avant.product)

    return { notice: `« ${avant.label} » retirée.` }
  } catch (cause) {
    return erreur('retrait de caractéristique', cause)
  }
}

export async function moveProductSpec(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const specId = champ(formData, 'specId')
  const sens = champ(formData, 'sens')
  if (!isSens(sens)) return { error: 'Déplacement inconnu.' }

  try {
    const avant = await prisma.productSpec.findUnique({
      where: { id: specId },
      select: { product: { select: { id: true, slug: true } } },
    })
    if (!avant) return { error: 'Caractéristique introuvable.' }

    const existantes = await specsDe(avant.product.id)
    const ordre = ordreApresDeplacement(
      existantes.map((ligne) => ligne.id),
      specId,
      sens,
    )
    // La ligne est déjà au bout : rien à écrire, et rien à reprocher.
    if (!ordre) return {}

    await prisma.$transaction(
      ordre.map((id, index) =>
        prisma.productSpec.update({ where: { id }, data: { position: index } }),
      ),
    )
    await audit(staff, 'product.spec.reorder', 'Product', avant.product.id, null, { specId, sens })
    rafraichir(avant.product)

    return { notice: 'Ordre enregistré.' }
  } catch (cause) {
    return erreur('ordre des caractéristiques', cause)
  }
}

/* -------------------------------------------------------------------------- */
/* Questions fréquentes                                                       */
/* -------------------------------------------------------------------------- */

async function faqDe(productId: string) {
  return prisma.productFaq.findMany({
    where: { productId },
    orderBy: { position: 'asc' },
    select: { id: true, question: true, answer: true },
  })
}

export async function createProductFaq(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const productId = champ(formData, 'productId')

  try {
    const produit = await produitDe(productId)
    if (!produit) return { error: 'Produit introuvable.', saisie }

    const existantes = await faqDe(productId)
    const ligne = parseFaq(
      { question: champ(formData, 'question'), answer: texteLong(formData, 'answer') },
      { existantes },
    )
    if (!ligne.ok) return { error: ligne.error, saisie }

    const creee = await prisma.productFaq.create({
      data: { productId, ...ligne.value, position: existantes.length },
    })
    await audit(staff, 'product.faq.create', 'ProductFaq', creee.id, null, {
      productId,
      ...ligne.value,
    })
    rafraichir(produit)

    return { notice: 'Question ajoutée.' }
  } catch (cause) {
    return erreur('ajout de question', cause, saisie)
  }
}

export async function updateProductFaq(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const faqId = champ(formData, 'faqId')

  try {
    const avant = await prisma.productFaq.findUnique({
      where: { id: faqId },
      select: {
        question: true,
        answer: true,
        product: { select: { id: true, slug: true } },
      },
    })
    if (!avant) return { error: 'Question introuvable.', saisie }

    const existantes = await faqDe(avant.product.id)
    const ligne = parseFaq(
      { question: champ(formData, 'question'), answer: texteLong(formData, 'answer') },
      { existantes, id: faqId },
    )
    if (!ligne.ok) return { error: ligne.error, saisie }

    await prisma.productFaq.update({ where: { id: faqId }, data: ligne.value })
    await audit(
      staff,
      'product.faq.update',
      'ProductFaq',
      faqId,
      { question: avant.question, answer: avant.answer },
      ligne.value,
    )
    rafraichir(avant.product)

    return { notice: 'Question enregistrée.' }
  } catch (cause) {
    return erreur('modification de question', cause, saisie)
  }
}

export async function removeProductFaq(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const faqId = champ(formData, 'faqId')

  try {
    const avant = await prisma.productFaq.findUnique({
      where: { id: faqId },
      select: {
        question: true,
        answer: true,
        product: { select: { id: true, slug: true } },
      },
    })
    if (!avant) return { error: 'Question introuvable.' }

    const restantes = (await faqDe(avant.product.id)).filter((ligne) => ligne.id !== faqId)
    await prisma.$transaction([
      prisma.productFaq.delete({ where: { id: faqId } }),
      ...restantes.map((ligne, index) =>
        prisma.productFaq.update({ where: { id: ligne.id }, data: { position: index } }),
      ),
    ])
    await audit(
      staff,
      'product.faq.delete',
      'ProductFaq',
      faqId,
      { question: avant.question, answer: avant.answer },
      null,
    )
    rafraichir(avant.product)

    return { notice: 'Question retirée.' }
  } catch (cause) {
    return erreur('retrait de question', cause)
  }
}

export async function moveProductFaq(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const faqId = champ(formData, 'faqId')
  const sens = champ(formData, 'sens')
  if (!isSens(sens)) return { error: 'Déplacement inconnu.' }

  try {
    const avant = await prisma.productFaq.findUnique({
      where: { id: faqId },
      select: { product: { select: { id: true, slug: true } } },
    })
    if (!avant) return { error: 'Question introuvable.' }

    const existantes = await faqDe(avant.product.id)
    const ordre = ordreApresDeplacement(
      existantes.map((ligne) => ligne.id),
      faqId,
      sens,
    )
    if (!ordre) return {}

    await prisma.$transaction(
      ordre.map((id, index) =>
        prisma.productFaq.update({ where: { id }, data: { position: index } }),
      ),
    )
    await audit(staff, 'product.faq.reorder', 'Product', avant.product.id, null, { faqId, sens })
    rafraichir(avant.product)

    return { notice: 'Ordre enregistré.' }
  } catch (cause) {
    return erreur('ordre des questions', cause)
  }
}

/* -------------------------------------------------------------------------- */
/* Guides de montage                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Rattache un guide existant à la fiche.
 *
 * Les guides ne se **créent** pas ici : ils ont leur propre contenu, leur
 * propre adresse et leur propre rédaction, et aucun écran de l'application ne
 * les crée encore — ils viennent du jeu de données. Ce formulaire ne fait donc
 * que désigner lequel accompagne ce produit.
 */
export async function attachProductGuide(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const productId = champ(formData, 'productId')
  const guideId = champ(formData, 'guideId')

  try {
    const produit = await produitDe(productId)
    if (!produit) return { error: 'Produit introuvable.', saisie }

    const dejaRattaches = await prisma.productGuide.findMany({
      where: { productId },
      select: { guideId: true },
    })
    const refus = raisonGuideNonRattachable({
      guideId,
      dejaRattaches: dejaRattaches.map((lien) => lien.guideId),
    })
    if (refus) return { error: refus, saisie }

    const guide = await prisma.guide.findUnique({
      where: { id: guideId },
      select: { title: true, publishedAt: true },
    })
    if (!guide) return { error: 'Guide introuvable : il a pu être supprimé.', saisie }

    await prisma.productGuide.create({ data: { productId, guideId } })
    await audit(staff, 'product.guide.attach', 'Product', productId, null, {
      guideId,
      title: guide.title,
    })
    rafraichir(produit)

    return {
      notice:
        guide.publishedAt === null
          ? `« ${guide.title} » rattaché. Ce guide n'est pas publié : la fiche ne l'affichera pas encore.`
          : `« ${guide.title} » rattaché.`,
    }
  } catch (cause) {
    return erreur('rattachement de guide', cause, saisie)
  }
}

export async function detachProductGuide(
  _precedent: ContentState,
  formData: FormData,
): Promise<ContentState> {
  const staff = await requireStaff('catalog.edit')
  const productId = champ(formData, 'productId')
  const guideId = champ(formData, 'guideId')

  try {
    const produit = await produitDe(productId)
    if (!produit) return { error: 'Produit introuvable.' }

    const lien = await prisma.productGuide.findUnique({
      where: { productId_guideId: { productId, guideId } },
      select: { guide: { select: { title: true } } },
    })
    if (!lien) return { error: "Ce guide n'est pas rattaché à la fiche." }

    /*
      Seul le rattachement est supprimé. Le guide lui-même reste : il est écrit
      une fois et sert à plusieurs produits, et rien ici ne doit pouvoir
      effacer un contenu rédigé.
    */
    await prisma.productGuide.delete({ where: { productId_guideId: { productId, guideId } } })
    await audit(
      staff,
      'product.guide.detach',
      'Product',
      productId,
      { guideId, title: lien.guide.title },
      null,
    )
    rafraichir(produit)

    return { notice: `« ${lien.guide.title} » détaché.` }
  } catch (cause) {
    return erreur('détachement de guide', cause)
  }
}
