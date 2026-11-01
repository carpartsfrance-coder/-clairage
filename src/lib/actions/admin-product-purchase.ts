'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import {
  MOTIFS_STOCK_LABELS,
  parseProduit,
  parseQuantite,
  parseStock,
  parseVariante,
  raisonDerniereVariante,
  raisonStockNonEditable,
  raisonSuppressionBloquee,
  type Saisie,
  type VarianteSaisie,
} from '../admin/catalogue'

/**
 * Écriture du bloc achat depuis le back-office : créer une fiche, et tenir ses
 * conditionnements.
 *
 * Avant ces actions, **aucun écran de l'application ne créait un produit**. Le
 * seul chemin passait par un import CSV, qui ne sait pas attribuer de taux de
 * TVA — or la publication le refuse. Une fiche née dans le back-office restait
 * donc au brouillon pour toujours, et le catalogue en ligne ne venait que de
 * `prisma/seed.ts` et de deux scripts lancés à la main.
 *
 * Cinq règles, et les trois premières sont celles qui protègent de l'argent :
 *
 * 1. **Chaque action revérifie `catalog.edit`.** Une action de serveur est un
 *    point d'entrée public : masquer le bouton ne protège rien.
 * 2. **Une fiche naît avec sa première variante, dans la même transaction.**
 *    Un produit sans variante n'a rien à vendre, et une variante créée à part
 *    pourrait échouer en laissant une fiche vide derrière elle. Les deux
 *    s'écrivent ensemble ou pas du tout.
 * 3. **Le taux de TVA est exigé à l'écriture, pas seulement à la
 *    publication.** Sans lui, `vatRate?.rateBp ?? 0` facture une commande à
 *    0 % de TVA.
 * 4. **Rien ne naît en ligne.** Le statut reste `DRAFT` : la mise en vente est
 *    une décision, prise sur la fiche, avec le droit `catalog.publish`.
 * 5. **Le stock ne bouge jamais sans mouvement.** Chaque écriture de stock
 *    laisse une ligne dans `StockMovement`, avec son motif et son auteur :
 *    sans elle, un inventaire faux est inexplicable.
 *
 * Les règles de saisie — montants, référence, quantités, refus de suppression
 * — vivent dans `lib/admin/catalogue.ts`, où elles se testent sans base.
 */

export type PurchaseState = {
  error?: string
  notice?: string
  /**
   * La saisie refusée, renvoyée telle quelle.
   *
   * React 19 réinitialise le formulaire dès que l'action se termine : sans ce
   * renvoi, un prix refusé pour une virgule de trop effacerait aussi la
   * référence, le seuil et le stock qu'on venait de saisir.
   */
  saisie?: Saisie
}

/* -------------------------------------------------------------------------- */
/* Outillage commun                                                           */
/* -------------------------------------------------------------------------- */

function champ(formData: FormData, nom: string): string {
  const valeur = formData.get(nom)
  return typeof valeur === 'string' ? valeur.trim() : ''
}

/** Une case décochée n'est pas envoyée : son absence vaut « non ». */
function coche(formData: FormData, nom: string): boolean {
  return formData.get(nom) !== null
}

function erreur(contexte: string, cause: unknown, saisie?: Saisie): PurchaseState {
  console.error(`[admin] catalogue — ${contexte}`, cause)
  return { error: "L'enregistrement a échoué. Rien n'a été modifié.", saisie }
}

/**
 * Tout ce qui a été envoyé, pour le réafficher si l'on refuse.
 *
 * Les champs internes de React (`$ACTION_*`) sont écartés : ils ne sont pas
 * de la saisie, et les renvoyer au formulaire n'aurait aucun sens. Les cases
 * absentes sont notées à faux, sinon le formulaire les retrouverait cochées.
 */
function saisieRenvoyee(formData: FormData): Saisie {
  const saisie: Saisie = {}
  for (const [cle, valeur] of formData.entries()) {
    if (typeof valeur === 'string' && !cle.startsWith('$')) saisie[cle] = valeur
  }
  for (const interrupteur of ['backorder', 'active']) {
    if (!(interrupteur in saisie)) saisie[interrupteur] = false
  }
  return saisie
}

/** La saisie d'une variante, telle que les trois formulaires l'envoient. */
function saisieVariante(formData: FormData, prefixe = ''): VarianteSaisie {
  return {
    sku: champ(formData, `${prefixe}sku`),
    name: champ(formData, `${prefixe}variantName`),
    packaging: champ(formData, `${prefixe}packaging`),
    prix: champ(formData, `${prefixe}prix`),
    prixBarre: champ(formData, `${prefixe}prixBarre`),
    vatRateId: champ(formData, `${prefixe}vatRateId`),
    seuil: champ(formData, `${prefixe}seuil`),
    poids: champ(formData, `${prefixe}poids`),
    backorder: coche(formData, `${prefixe}backorder`),
    active: coche(formData, `${prefixe}active`),
  }
}

/**
 * Invalide ce que le site public sert sur ce produit.
 *
 * Les listes de catégorie ne sont pas invalidées : elles lisent le véhicule
 * choisi dans le cookie (`getSelectedVehicle`), donc elles sont rendues à
 * chaque requête. L'accueil, lui, est mis en cache et affiche le prix des
 * produits mis en avant : sans cette ligne, un prix corrigé y resterait faux.
 */
function rafraichir(produit: { id: string; slug: string }): void {
  revalidatePath(`/admin/catalogue/${produit.id}`)
  revalidatePath('/admin/catalogue')
  revalidatePath(`/p/${produit.slug}`)
  revalidatePath('/')
}

/** Le produit porteur d'une variante, et ce qu'il faut pour décider. */
async function contexteVariante(variantId: string) {
  return prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      sku: true,
      name: true,
      packaging: true,
      priceCents: true,
      compareAtCents: true,
      vatRateId: true,
      stockOnHand: true,
      lowStockThreshold: true,
      weightGrams: true,
      backorder: true,
      active: true,
      product: { select: { id: true, slug: true, status: true } },
      _count: {
        select: {
          components: true,
          orderLines: true,
          cartLines: true,
          partOfKits: true,
          fitments: true,
        },
      },
    },
  })
}

/**
 * Vérifie que le taux de TVA choisi existe.
 *
 * Un identifiant invalide ferait échouer l'écriture sur une contrainte de clé
 * étrangère, et l'écran afficherait « l'enregistrement a échoué » sans dire
 * quoi corriger.
 */
async function tauxExiste(vatRateId: string): Promise<boolean> {
  const taux = await prisma.vatRate.findUnique({ where: { id: vatRateId }, select: { id: true } })
  return taux !== null
}

/* -------------------------------------------------------------------------- */
/* Créer une fiche                                                            */
/* -------------------------------------------------------------------------- */

const VEHICLE_TYPES = ['CAR', 'MOTORCYCLE', 'BOTH'] as const

/**
 * Crée un produit et sa première variante.
 *
 * Le formulaire ne demande que ce que le relevé des manques interdit de
 * publier : nom, adresse, rubrique, type de véhicule, puis référence,
 * conditionnement, prix, taux de TVA et stock. Accroche, référencement,
 * rédactionnel et visuels s'ajoutent ensuite sur la fiche — c'est elle qui est
 * faite pour ça, et un formulaire de création de trente champs est un
 * formulaire devant lequel on renonce.
 *
 * Succès : on part sur la fiche créée. C'est là qu'on continue (visuels,
 * accroche, caractéristiques), et c'est la preuve que la création a abouti.
 */
export async function createProduct(
  _state: PurchaseState,
  formData: FormData,
): Promise<PurchaseState> {
  const staff = await requireStaff('catalog.edit')

  // Renvoyée avec chaque refus : React 19 réinitialise le formulaire dès que
  // l'action se termine, et une saisie perdue pour une virgule est une saisie
  // à refaire en entier.
  const saisie = saisieRenvoyee(formData)

  const produit = parseProduit({
    name: champ(formData, 'name'),
    slug: champ(formData, 'slug'),
    brand: champ(formData, 'brand'),
    categoryId: champ(formData, 'categoryId'),
  })
  if (!produit.ok) return { error: produit.error, saisie }

  const typeDemande = champ(formData, 'vehicleType')
  const vehicleType = (VEHICLE_TYPES as readonly string[]).includes(typeDemande)
    ? (typeDemande as (typeof VEHICLE_TYPES)[number])
    : null
  if (!vehicleType) {
    return { error: 'Choisissez un type de véhicule : il décide des listes où le produit apparaît.', saisie }
  }

  const variante = parseVariante({ ...saisieVariante(formData), active: true })
  if (!variante.ok) return { error: variante.error, saisie }

  const stock = parseQuantite(champ(formData, 'stock'), 'Le stock détenu', { defaut: 0 })
  if (!stock.ok) return { error: stock.error, saisie }

  let productId: string
  try {
    const adressePrise = await prisma.product.findUnique({
      where: { slug: produit.value.slug },
      select: { name: true },
    })
    if (adressePrise) {
      return {
        error: `L'adresse « ${produit.value.slug} » est déjà prise par « ${adressePrise.name} ». Choisissez-en une autre.`,
        saisie,
      }
    }

    const referencePrise = await prisma.productVariant.findUnique({
      where: { sku: variante.value.sku },
      select: { product: { select: { name: true } } },
    })
    if (referencePrise) {
      return {
        error: `La référence ${variante.value.sku} existe déjà, sur « ${referencePrise.product.name} ». Une référence ne désigne qu'une pièce.`,
        saisie,
      }
    }

    const rubrique = await prisma.category.findUnique({
      where: { id: produit.value.categoryId },
      select: { id: true },
    })
    if (!rubrique) return { error: 'La rubrique choisie est introuvable : elle a pu être supprimée.', saisie }

    if (!(await tauxExiste(variante.value.vatRateId))) {
      return { error: 'Le taux de TVA choisi est introuvable.', saisie }
    }

    /*
      Produit, rubrique, variante et mouvement de stock dans une seule
      transaction : une fiche créée dont la variante échoue serait un produit
      sans rien à vendre, invisible dans le relevé tant que personne ne
      l'ouvre.
    */
    const cree = await prisma.$transaction(async (tx) => {
      const nouveau = await tx.product.create({
        data: {
          name: produit.value.name,
          slug: produit.value.slug,
          brand: produit.value.brand,
          vehicleType,
          // Jamais publié à la création : la mise en vente est une décision,
          // et elle demande un autre droit.
          status: 'DRAFT',
        },
      })

      await tx.productCategory.create({
        data: { productId: nouveau.id, categoryId: produit.value.categoryId, position: 0 },
      })

      const variantCreee = await tx.productVariant.create({
        data: { productId: nouveau.id, position: 0, stockOnHand: stock.value, ...variante.value },
      })

      if (stock.value > 0) {
        await tx.stockMovement.create({
          data: {
            variantId: variantCreee.id,
            delta: stock.value,
            reason: 'inventaire',
            actorId: staff.id,
          },
        })
      }

      return nouveau
    })

    productId = cree.id
    await audit(staff, 'product.create', 'Product', cree.id, null, {
      ...produit.value,
      vehicleType,
      variante: { ...variante.value, stockOnHand: stock.value },
    })
    revalidatePath('/admin/catalogue')
  } catch (cause) {
    return erreur('création de produit', cause, saisie)
  }

  // `redirect` lève : hors du `try`, sinon le `catch` l'avalerait et la
  // création réussie s'afficherait comme un échec.
  redirect(`/admin/catalogue/${productId}`)
}

/* -------------------------------------------------------------------------- */
/* Conditionnements                                                           */
/* -------------------------------------------------------------------------- */

export async function createVariant(
  _state: PurchaseState,
  formData: FormData,
): Promise<PurchaseState> {
  const staff = await requireStaff('catalog.edit')

  // Renvoyée avec chaque refus : React 19 réinitialise le formulaire dès que
  // l'action se termine, et une saisie perdue pour une virgule est une saisie
  // à refaire en entier.
  const saisie = saisieRenvoyee(formData)

  const productId = champ(formData, 'productId')
  if (!productId) return { error: 'Demande invalide.', saisie }

  const variante = parseVariante(saisieVariante(formData))
  if (!variante.ok) return { error: variante.error, saisie }

  const stock = parseQuantite(champ(formData, 'stock'), 'Le stock détenu', { defaut: 0 })
  if (!stock.ok) return { error: stock.error, saisie }

  try {
    const produit = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true, variants: { select: { position: true } } },
    })
    if (!produit) return { error: 'Produit introuvable.', saisie }

    const referencePrise = await prisma.productVariant.findUnique({
      where: { sku: variante.value.sku },
      select: { product: { select: { name: true } } },
    })
    if (referencePrise) {
      return {
        error: `La référence ${variante.value.sku} existe déjà, sur « ${referencePrise.product.name} ». Une référence ne désigne qu'une pièce.`,
        saisie,
      }
    }

    if (!(await tauxExiste(variante.value.vatRateId))) {
      return { error: 'Le taux de TVA choisi est introuvable.', saisie }
    }

    const position = produit.variants.reduce((max, v) => Math.max(max, v.position), -1) + 1

    const creee = await prisma.$transaction(async (tx) => {
      const variantCreee = await tx.productVariant.create({
        data: { productId, position, stockOnHand: stock.value, ...variante.value },
      })
      if (stock.value > 0) {
        await tx.stockMovement.create({
          data: {
            variantId: variantCreee.id,
            delta: stock.value,
            reason: 'inventaire',
            actorId: staff.id,
          },
        })
      }
      return variantCreee
    })

    await audit(staff, 'product.variant.create', 'ProductVariant', creee.id, null, {
      productId,
      ...variante.value,
      stockOnHand: stock.value,
    })
    rafraichir(produit)

    return { notice: `Conditionnement ${variante.value.sku} ajouté.` }
  } catch (cause) {
    return erreur('création de conditionnement', cause, saisie)
  }
}

/**
 * Modifie un conditionnement — tout sauf son stock.
 *
 * Le stock a son propre formulaire parce qu'il a sa propre trace : l'écrire
 * exige un motif, et produit un mouvement. Le mêler au prix et au seuil ferait
 * d'un simple changement de tarif un mouvement d'inventaire.
 */
export async function updateVariant(
  _state: PurchaseState,
  formData: FormData,
): Promise<PurchaseState> {
  const staff = await requireStaff('catalog.edit')

  // Renvoyée avec chaque refus : React 19 réinitialise le formulaire dès que
  // l'action se termine, et une saisie perdue pour une virgule est une saisie
  // à refaire en entier.
  const saisie = saisieRenvoyee(formData)

  const variantId = champ(formData, 'variantId')
  if (!variantId) return { error: 'Demande invalide.', saisie }

  const variante = parseVariante(saisieVariante(formData))
  if (!variante.ok) return { error: variante.error, saisie }

  try {
    const avant = await contexteVariante(variantId)
    if (!avant) return { error: 'Conditionnement introuvable.', saisie }

    if (variante.value.sku !== avant.sku) {
      const referencePrise = await prisma.productVariant.findUnique({
        where: { sku: variante.value.sku },
        select: { product: { select: { name: true } } },
      })
      if (referencePrise) {
        return {
          error: `La référence ${variante.value.sku} existe déjà, sur « ${referencePrise.product.name} ».`,
          saisie,
        }
      }
    }

    if (variante.value.vatRateId !== avant.vatRateId && !(await tauxExiste(variante.value.vatRateId))) {
      return { error: 'Le taux de TVA choisi est introuvable.', saisie }
    }

    // Retirer de la vente le dernier conditionnement actif d'une fiche en
    // ligne la laisserait affichée sans rien à acheter.
    if (avant.active && !variante.value.active) {
      const autresActives = await prisma.productVariant.count({
        where: { productId: avant.product.id, active: true, id: { not: variantId } },
      })
      const refus = raisonDerniereVariante({
        statutProduit: avant.product.status,
        autresActives,
      })
      if (refus) return { error: refus, saisie }
    }

    await prisma.productVariant.update({ where: { id: variantId }, data: variante.value })

    await audit(
      staff,
      'product.variant.update',
      'ProductVariant',
      variantId,
      {
        sku: avant.sku,
        name: avant.name,
        packaging: avant.packaging,
        priceCents: avant.priceCents,
        compareAtCents: avant.compareAtCents,
        vatRateId: avant.vatRateId,
        lowStockThreshold: avant.lowStockThreshold,
        weightGrams: avant.weightGrams,
        backorder: avant.backorder,
        active: avant.active,
      },
      variante.value,
    )
    rafraichir(avant.product)

    return { notice: `Conditionnement ${variante.value.sku} enregistré.` }
  } catch (cause) {
    return erreur('modification de conditionnement', cause, saisie)
  }
}

/**
 * Écrit le stock détenu, et le mouvement qui l'explique.
 *
 * On saisit le stock constaté, jamais l'écart : compter douze pièces en rayon
 * est un geste sûr, calculer de tête qu'il faut en ajouter trois ne l'est pas.
 * L'écart est déduit et conservé, avec son motif et son auteur.
 */
export async function setVariantStock(
  _state: PurchaseState,
  formData: FormData,
): Promise<PurchaseState> {
  const staff = await requireStaff('catalog.edit')

  // Renvoyée avec chaque refus : React 19 réinitialise le formulaire dès que
  // l'action se termine, et une saisie perdue pour une virgule est une saisie
  // à refaire en entier.
  const saisie = saisieRenvoyee(formData)

  const variantId = champ(formData, 'variantId')
  if (!variantId) return { error: 'Demande invalide.', saisie }

  try {
    const avant = await contexteVariante(variantId)
    if (!avant) return { error: 'Conditionnement introuvable.', saisie }

    const refusKit = raisonStockNonEditable({ composants: avant._count.components })
    if (refusKit) return { error: refusKit, saisie }

    const stock = parseStock(
      { stock: champ(formData, 'stock'), motif: champ(formData, 'motif') },
      avant.stockOnHand,
    )
    if (!stock.ok) return { error: stock.error, saisie }

    /*
      La variante et le mouvement s'écrivent ensemble : un stock changé sans
      mouvement est un inventaire inexplicable, et un mouvement sans stock
      changé est un historique qui ment.
    */
    await prisma.$transaction([
      prisma.productVariant.update({
        where: { id: variantId },
        data: { stockOnHand: stock.value.stockOnHand },
      }),
      prisma.stockMovement.create({
        data: {
          variantId,
          delta: stock.value.delta,
          reason: stock.value.motif,
          actorId: staff.id,
        },
      }),
    ])

    await audit(
      staff,
      'product.variant.stock',
      'ProductVariant',
      variantId,
      { stockOnHand: avant.stockOnHand },
      { stockOnHand: stock.value.stockOnHand, delta: stock.value.delta, motif: stock.value.motif },
    )
    rafraichir(avant.product)

    const signe = stock.value.delta > 0 ? '+' : ''
    return {
      notice: `Stock de ${avant.sku} : ${avant.stockOnHand} → ${stock.value.stockOnHand} (${signe}${stock.value.delta}, ${MOTIFS_STOCK_LABELS[stock.value.motif].toLowerCase()}).`,
    }
  } catch (cause) {
    return erreur('écriture de stock', cause, saisie)
  }
}

/**
 * Supprime un conditionnement, quand rien ne s'y rattache.
 *
 * Le refus est explicite et dit laquelle des raisons s'applique — commande
 * passée, panier en cours, kit, compatibilité. Deux de ces cas feraient de
 * toute façon échouer la base (`Restrict`), mais une erreur de contrainte
 * s'affiche « l'enregistrement a échoué » et n'apprend rien ; les deux autres
 * passeraient en effaçant du travail en silence.
 */
export async function removeVariant(
  _state: PurchaseState,
  formData: FormData,
): Promise<PurchaseState> {
  const staff = await requireStaff('catalog.edit')

  const variantId = champ(formData, 'variantId')
  if (!variantId) return { error: 'Demande invalide.' }

  try {
    const variante = await contexteVariante(variantId)
    if (!variante) return { error: 'Conditionnement introuvable.' }

    const refus = raisonSuppressionBloquee({
      commandes: variante._count.orderLines,
      paniers: variante._count.cartLines,
      kits: variante._count.partOfKits,
      compatibilites: variante._count.fitments,
    })
    if (refus) return { error: refus }

    if (variante.active) {
      const autresActives = await prisma.productVariant.count({
        where: { productId: variante.product.id, active: true, id: { not: variantId } },
      })
      const refusDernier = raisonDerniereVariante({
        statutProduit: variante.product.status,
        autresActives,
      })
      if (refusDernier) return { error: refusDernier }
    }

    await prisma.productVariant.delete({ where: { id: variantId } })

    await audit(
      staff,
      'product.variant.delete',
      'ProductVariant',
      variantId,
      { sku: variante.sku, name: variante.name, priceCents: variante.priceCents },
      null,
    )
    rafraichir(variante.product)

    return { notice: `Conditionnement ${variante.sku} supprimé.` }
  } catch (cause) {
    return erreur('suppression de conditionnement', cause)
  }
}
