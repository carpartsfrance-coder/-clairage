'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '../db'
import { audit, requireStaff } from '../admin/guard'
import type { Saisie } from '../admin/catalogue'
import { isSens, ordreApresDeplacement } from '../admin/produit-contenu'
import {
  avertissementComposition,
  noteComplementInvisible,
  parseComposant,
  raisonCompatibiliteRefusee,
  raisonComplementRefuse,
  raisonCompositionImpossible,
  libelleVehicule,
} from '../admin/produit-liens'
import { parseFitment } from '../admin/vehicles'
import { revalidateDepuisConfiguration } from '../admin/revalidation-vehicules'

/**
 * Écriture des liens d'une fiche produit : compléments, composition d'un kit,
 * compatibilités véhicule.
 *
 * Ce qui manquait, et que ces actions comblent :
 *
 * - **Les compléments facultatifs** venaient du jeu de données. Le bloc
 *   « Complétez votre commande » de la fiche publique ne pouvait donc pas
 *   exister pour un produit créé au back-office.
 * - **La composition d'un kit** était affichée en lecture dans le bloc des
 *   conditionnements. Un kit se créait, mais vide — et un kit vide est
 *   déclaré en rupture par la boutique.
 * - **Les compatibilités** ne s'écrivaient que depuis l'écran Véhicules. Pour
 *   une nouvelle référence qui équipe quarante véhicules, il fallait ouvrir
 *   quarante écrans de génération.
 *
 * Cinq règles tiennent ce fichier :
 *
 * 1. **Chaque action revérifie `catalog.edit`.** Une action de serveur est un
 *    point d'entrée public : masquer un formulaire ne protège rien.
 * 2. **Tout est journalisé**, avec l'avant et l'après. Les compatibilités le
 *    sont sous les mêmes noms que depuis l'écran Véhicules
 *    (`vehicle.fitment.*`) : le journal doit montrer toutes les écritures
 *    d'une table, pas celles d'un écran.
 * 3. **La composition décide d'un stock, pas d'un affichage.** Les refus de
 *    `parseComposant` — pas d'auto-référence, pas de kit dans un kit, pas de
 *    doublon — protègent `availabilityForKit`, qui calcule ce qu'on promet de
 *    pouvoir expédier.
 * 4. **Une compatibilité écrite d'ici invalide les mêmes pages que depuis
 *    l'écran Véhicules.** La règle est partagée
 *    (`admin/revalidation-vehicules`) : deux copies auraient fini par
 *    diverger, et une page de packs périmée ne lève aucune erreur.
 * 5. **Un clic sans effet n'est pas une erreur.** Déplacer la première ligne
 *    vers le haut n'écrit rien et ne dit rien.
 *
 * Les règles qui se décident sans la base vivent dans
 * `lib/admin/produit-liens.ts` ; celles des compatibilités dans
 * `lib/admin/vehicles.ts`, inchangées et partagées.
 */

export type LinksState = {
  error?: string
  notice?: string
  /**
   * La saisie refusée, renvoyée telle quelle : React 19 réinitialise le
   * formulaire dès que l'action se termine.
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

function coche(formData: FormData, nom: string): boolean {
  return formData.get(nom) !== null
}

function erreur(contexte: string, cause: unknown, saisie?: Saisie): LinksState {
  console.error(`[admin] liens produit — ${contexte}`, cause)
  return { error: "L'enregistrement a échoué. Rien n'a été modifié.", saisie }
}

function saisieRenvoyee(formData: FormData): Saisie {
  const saisie: Saisie = {}
  for (const [cle, valeur] of formData.entries()) {
    if (typeof valeur === 'string' && !cle.startsWith('$')) saisie[cle] = valeur
  }
  return saisie
}

/** Invalide ce que le site public sert à propos de ce produit. */
function rafraichir(produit: { id: string; slug: string }): void {
  revalidatePath(`/admin/catalogue/${produit.id}`)
  revalidatePath('/admin/catalogue')
  revalidatePath(`/p/${produit.slug}`)
  revalidatePath('/')
}

async function produitDe(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, status: true, name: true },
  })
}

/* -------------------------------------------------------------------------- */
/* Compléments facultatifs                                                    */
/* -------------------------------------------------------------------------- */

async function complementsDe(productId: string) {
  return prisma.productRelation.findMany({
    where: { sourceId: productId, type: 'OPTIONAL_ADDON' },
    orderBy: { position: 'asc' },
    select: { id: true, targetId: true, target: { select: { name: true } } },
  })
}

/**
 * Rattache un produit comme complément facultatif.
 *
 * Le complément est proposé à la fin de la liste : les premiers sont ceux que
 * le client lit, et un ajout ne doit pas s'imposer devant un choix déjà fait.
 *
 * Le retour dit, le cas échéant, pourquoi le complément ne se voit pas encore
 * — brouillon, archivé, ou sans référence active. Sans cette phrase, le
 * rattachement paraîtrait sans effet et serait refait deux fois.
 */
export async function attachProductAddon(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const productId = champ(formData, 'productId')
  const cibleId = champ(formData, 'cibleId')

  try {
    const produit = await produitDe(productId)
    if (!produit) return { error: 'Produit introuvable.', saisie }

    const existants = await complementsDe(productId)
    const refus = raisonComplementRefuse({
      produitId: productId,
      cibleId,
      dejaLies: existants.map((lien) => lien.targetId),
      nombreActuel: existants.length,
    })
    if (refus) return { error: refus, saisie }

    const cible = await prisma.product.findUnique({
      where: { id: cibleId },
      select: {
        name: true,
        status: true,
        _count: { select: { variants: { where: { active: true } } } },
      },
    })
    if (!cible) return { error: 'Produit introuvable : il a pu être supprimé.', saisie }

    const relation = await prisma.productRelation.create({
      data: {
        sourceId: productId,
        targetId: cibleId,
        type: 'OPTIONAL_ADDON',
        position: existants.length,
      },
    })
    await audit(staff, 'product.addon.attach', 'ProductRelation', relation.id, null, {
      sourceId: productId,
      targetId: cibleId,
      name: cible.name,
    })
    rafraichir(produit)

    const invisible = noteComplementInvisible({
      statut: cible.status,
      referencesActives: cible._count.variants,
    })
    return {
      notice: invisible
        ? `« ${cible.name} » rattaché. ${invisible}`
        : `« ${cible.name} » rattaché : la fiche le propose désormais sous le bloc d'achat.`,
    }
  } catch (cause) {
    return erreur('rattachement de complément', cause, saisie)
  }
}

/**
 * Détache un complément.
 *
 * Seul le lien est supprimé : le produit complément garde sa fiche, son stock
 * et ses commandes. C'est la même règle que pour les guides, et elle mérite
 * d'être dite parce que le bouton est à côté du nom d'un produit.
 */
export async function detachProductAddon(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const relationId = champ(formData, 'relationId')

  try {
    const avant = await prisma.productRelation.findUnique({
      where: { id: relationId },
      select: {
        sourceId: true,
        targetId: true,
        target: { select: { name: true } },
        source: { select: { id: true, slug: true } },
      },
    })
    if (!avant) return { error: 'Complément introuvable.' }

    const restants = (await complementsDe(avant.sourceId)).filter((lien) => lien.id !== relationId)
    await prisma.$transaction([
      prisma.productRelation.delete({ where: { id: relationId } }),
      ...restants.map((lien, index) =>
        prisma.productRelation.update({ where: { id: lien.id }, data: { position: index } }),
      ),
    ])
    await audit(
      staff,
      'product.addon.detach',
      'ProductRelation',
      relationId,
      { sourceId: avant.sourceId, targetId: avant.targetId, name: avant.target.name },
      null,
    )
    rafraichir(avant.source)

    return { notice: `« ${avant.target.name} » n'est plus proposé en complément.` }
  } catch (cause) {
    return erreur('retrait de complément', cause)
  }
}

export async function moveProductAddon(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const relationId = champ(formData, 'relationId')
  const sens = champ(formData, 'sens')
  if (!isSens(sens)) return { error: 'Déplacement inconnu.' }

  try {
    const avant = await prisma.productRelation.findUnique({
      where: { id: relationId },
      select: { sourceId: true, source: { select: { id: true, slug: true } } },
    })
    if (!avant) return { error: 'Complément introuvable.' }

    const existants = await complementsDe(avant.sourceId)
    const ordre = ordreApresDeplacement(
      existants.map((lien) => lien.id),
      relationId,
      sens,
    )
    // Le complément est déjà au bout : rien à écrire, et rien à reprocher.
    if (!ordre) return {}

    await prisma.$transaction(
      ordre.map((id, index) =>
        prisma.productRelation.update({ where: { id }, data: { position: index } }),
      ),
    )
    await audit(staff, 'product.addon.reorder', 'Product', avant.sourceId, null, {
      relationId,
      sens,
    })
    rafraichir(avant.source)

    return { notice: 'Ordre enregistré.' }
  } catch (cause) {
    return erreur('ordre des compléments', cause)
  }
}

/* -------------------------------------------------------------------------- */
/* Composition d'un kit                                                       */
/* -------------------------------------------------------------------------- */

async function composantsDe(kitId: string) {
  return prisma.kitComponent.findMany({
    where: { kitId },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      componentId: true,
      quantity: true,
      required: true,
      component: { select: { sku: true, name: true, product: { select: { name: true } } } },
    },
  })
}

/**
 * La variante visée, avec le produit auquel elle appartient et le nombre de
 * kits qui l'incluent — ce dernier décide si elle peut recevoir une
 * composition.
 */
async function varianteDe(variantId: string) {
  return prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      sku: true,
      name: true,
      product: { select: { id: true, slug: true } },
      _count: { select: { partOfKits: true } },
    },
  })
}

/**
 * Ajoute un composant à un conditionnement.
 *
 * Ce n'est pas une ligne de description : dès qu'une variante a un composant,
 * la boutique la traite comme un kit. Son stock n'est plus celui qu'on a saisi
 * sur elle, mais le plus petit nombre de kits que ses composants obligatoires
 * permettent de monter ; la réservation au panier décrémente les composants et
 * non le kit ; la préparation de commande liste les pièces à prendre en rayon.
 *
 * D'où les refus de `parseComposant`, et d'où l'avertissement renvoyé quand
 * aucun composant n'est marqué indispensable : la boutique déclare alors le
 * kit en rupture, et rien à l'écran ne l'expliquerait.
 */
export async function addKitComponent(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const kitId = champ(formData, 'kitId')
  const composantId = champ(formData, 'composantId')

  try {
    const kit = await varianteDe(kitId)
    if (!kit) return { error: 'Conditionnement introuvable.', saisie }

    /*
      Le refus du kit dans un kit, pris par l'autre bout : une référence qui
      entre dans d'autres kits ne peut pas devenir un kit elle-même.
    */
    const impossible = raisonCompositionImpossible({ dansDesKits: kit._count.partOfKits })
    if (impossible) return { error: impossible, saisie }

    const existants = await composantsDe(kitId)
    const composant = composantId
      ? await prisma.productVariant.findUnique({
          where: { id: composantId },
          select: {
            sku: true,
            name: true,
            product: { select: { name: true } },
            _count: { select: { components: true } },
          },
        })
      : null

    const valeurs = parseComposant(
      { quantity: champ(formData, 'quantity'), required: coche(formData, 'required') },
      {
        varianteId: kitId,
        composantId,
        dejaComposants: existants.map((ligne) => ({
          composantId: ligne.componentId,
          libelle: `${ligne.component.product.name} · ${ligne.component.name}`,
        })),
        composantEstKit: (composant?._count.components ?? 0) > 0,
      },
    )
    if (!valeurs.ok) return { error: valeurs.error, saisie }
    if (!composant) return { error: 'Référence introuvable : elle a pu être supprimée.', saisie }

    const ligne = await prisma.kitComponent.create({
      data: {
        kitId,
        componentId: composantId,
        quantity: valeurs.value.quantity,
        required: valeurs.value.required,
        position: existants.length,
      },
    })
    await audit(staff, 'product.kit.add', 'KitComponent', ligne.id, null, {
      kitSku: kit.sku,
      componentSku: composant.sku,
      ...valeurs.value,
    })
    rafraichir(kit.product)

    const libelle = `${composant.product.name} · ${composant.name}`
    const avertissement = avertissementComposition([
      ...existants,
      { required: valeurs.value.required },
    ])
    return {
      notice: avertissement
        ? `« ${libelle} » ajouté. ${avertissement}`
        : `« ${libelle} » ajouté à la composition.`,
    }
  } catch (cause) {
    return erreur('ajout de composant', cause, saisie)
  }
}

/**
 * Modifie la quantité d'un composant, ou son caractère indispensable.
 *
 * Changer la quantité change le stock annoncé du kit : dix composants requis
 * par deux ne font plus que cinq kits. Le retour le dit, parce que le chiffre
 * affiché sur la fiche n'est écrit nulle part dans ce formulaire.
 */
export async function updateKitComponent(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const ligneId = champ(formData, 'ligneId')

  try {
    const avant = await prisma.kitComponent.findUnique({
      where: { id: ligneId },
      select: {
        kitId: true,
        componentId: true,
        quantity: true,
        required: true,
        component: { select: { sku: true, name: true, product: { select: { name: true } } } },
        kit: { select: { sku: true, product: { select: { id: true, slug: true } } } },
      },
    })
    if (!avant) return { error: 'Composant introuvable.', saisie }

    /*
      La ligne modifiée est retirée du contexte : sans cela, elle serait son
      propre doublon et l'enregistrement serait refusé.
    */
    const autres = (await composantsDe(avant.kitId)).filter((ligne) => ligne.id !== ligneId)
    const valeurs = parseComposant(
      { quantity: champ(formData, 'quantity'), required: coche(formData, 'required') },
      {
        varianteId: avant.kitId,
        composantId: avant.componentId,
        dejaComposants: autres.map((ligne) => ({
          composantId: ligne.componentId,
          libelle: `${ligne.component.product.name} · ${ligne.component.name}`,
        })),
        /*
          Pas de nouvelle vérification ici : un composant déjà en place ne peut
          pas être devenu un kit entre-temps, puisqu'une référence incluse dans
          un kit n'accepte pas de composition. C'est la garde symétrique de
          `raisonCompositionImpossible`.
        */
        composantEstKit: false,
      },
    )
    if (!valeurs.ok) return { error: valeurs.error, saisie }

    await prisma.kitComponent.update({
      where: { id: ligneId },
      data: { quantity: valeurs.value.quantity, required: valeurs.value.required },
    })
    await audit(
      staff,
      'product.kit.update',
      'KitComponent',
      ligneId,
      { quantity: avant.quantity, required: avant.required },
      valeurs.value,
    )
    rafraichir(avant.kit.product)

    const avertissement = avertissementComposition([
      ...autres,
      { required: valeurs.value.required },
    ])
    const libelle = `${avant.component.product.name} · ${avant.component.name}`
    return {
      notice: avertissement
        ? `« ${libelle} » enregistré. ${avertissement}`
        : `« ${libelle} » : ${valeurs.value.quantity} par kit, ${valeurs.value.required ? 'indispensable' : 'facultatif'}.`,
    }
  } catch (cause) {
    return erreur('modification de composant', cause, saisie)
  }
}

export async function removeKitComponent(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const ligneId = champ(formData, 'ligneId')

  try {
    const avant = await prisma.kitComponent.findUnique({
      where: { id: ligneId },
      select: {
        kitId: true,
        quantity: true,
        required: true,
        component: { select: { sku: true, name: true, product: { select: { name: true } } } },
        kit: { select: { product: { select: { id: true, slug: true } } } },
      },
    })
    if (!avant) return { error: 'Composant introuvable.' }

    const restants = (await composantsDe(avant.kitId)).filter((ligne) => ligne.id !== ligneId)
    await prisma.$transaction([
      prisma.kitComponent.delete({ where: { id: ligneId } }),
      ...restants.map((ligne, index) =>
        prisma.kitComponent.update({ where: { id: ligne.id }, data: { position: index } }),
      ),
    ])
    await audit(
      staff,
      'product.kit.remove',
      'KitComponent',
      ligneId,
      {
        componentSku: avant.component.sku,
        quantity: avant.quantity,
        required: avant.required,
      },
      null,
    )
    rafraichir(avant.kit.product)

    const libelle = `${avant.component.product.name} · ${avant.component.name}`
    const avertissement = avertissementComposition(restants)
    return {
      notice: avertissement
        ? `« ${libelle} » retiré. ${avertissement}`
        : restants.length === 0
          ? `« ${libelle} » retiré. Ce conditionnement n'a plus de composition : son propre stock redevient celui qui est annoncé.`
          : `« ${libelle} » retiré de la composition.`,
    }
  } catch (cause) {
    return erreur('retrait de composant', cause)
  }
}

export async function moveKitComponent(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const ligneId = champ(formData, 'ligneId')
  const sens = champ(formData, 'sens')
  if (!isSens(sens)) return { error: 'Déplacement inconnu.' }

  try {
    const avant = await prisma.kitComponent.findUnique({
      where: { id: ligneId },
      select: { kitId: true, kit: { select: { product: { select: { id: true, slug: true } } } } },
    })
    if (!avant) return { error: 'Composant introuvable.' }

    const existants = await composantsDe(avant.kitId)
    const ordre = ordreApresDeplacement(
      existants.map((ligne) => ligne.id),
      ligneId,
      sens,
    )
    if (!ordre) return {}

    await prisma.$transaction(
      ordre.map((id, index) =>
        prisma.kitComponent.update({ where: { id }, data: { position: index } }),
      ),
    )
    await audit(staff, 'product.kit.reorder', 'ProductVariant', avant.kitId, null, {
      ligneId,
      sens,
    })
    rafraichir(avant.kit.product)

    return { notice: 'Ordre enregistré.' }
  } catch (cause) {
    return erreur('ordre de la composition', cause)
  }
}

/* -------------------------------------------------------------------------- */
/* Compatibilités véhicule                                                    */
/* -------------------------------------------------------------------------- */

/** Les champs d'une compatibilité, validés par la règle commune aux deux écrans. */
function lireCompatibilite(formData: FormData) {
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

/**
 * Documente une compatibilité depuis la fiche produit.
 *
 * Même table et mêmes règles que depuis l'écran Véhicules : `parseFitment`
 * impose qu'un statut « confirmé » porte sa source et sa date, et rien ici
 * n'écrit de date à la place de l'exploitant. Seul le point d'entrée change —
 * on part d'une référence et on cherche un véhicule, au lieu de partir d'une
 * génération et de chercher une référence.
 */
export async function createProductFitment(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const variantId = champ(formData, 'variantId')
  const configurationId = champ(formData, 'configurationId')
  const positionId = champ(formData, 'positionId')

  try {
    const variante = await varianteDe(variantId)
    if (!variante) return { error: 'Conditionnement introuvable.', saisie }

    const existantes = await prisma.fitment.findMany({
      where: { variantId },
      select: {
        configurationId: true,
        positionId: true,
        variantId: true,
        position: { select: { label: true } },
        configuration: {
          select: {
            generation: {
              select: {
                name: true,
                model: { select: { name: true, make: { select: { name: true } } } },
              },
            },
          },
        },
      },
    })
    const refus = raisonCompatibiliteRefusee({
      configurationId,
      positionId,
      variantId,
      existantes: existantes.map((ligne) => ({
        configurationId: ligne.configurationId,
        positionId: ligne.positionId,
        variantId: ligne.variantId,
        libelle: `${libelleVehicule({
          marque: ligne.configuration.generation.model.make.name,
          modele: ligne.configuration.generation.model.name,
          generation: ligne.configuration.generation.name,
        })} · ${ligne.position.label}`,
      })),
    })
    if (refus) return { error: refus, saisie }

    const valeurs = lireCompatibilite(formData)
    if (!valeurs.ok) return { error: valeurs.error, saisie }

    const [configuration, emplacement] = await Promise.all([
      prisma.vehicleConfiguration.findUnique({
        where: { id: configurationId },
        select: {
          active: true,
          generation: {
            select: {
              name: true,
              model: { select: { name: true, make: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.lightPosition.findUnique({
        where: { id: positionId },
        select: { code: true, label: true },
      }),
    ])
    if (!configuration) return { error: 'Configuration véhicule introuvable.', saisie }
    if (!emplacement) return { error: 'Emplacement introuvable.', saisie }

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
      sku: variante.sku,
      position: emplacement.code,
      ...valeurs.value,
      verifiedAt: valeurs.value.verifiedAt?.toISOString() ?? null,
    })
    await revalidateDepuisConfiguration(configurationId)
    rafraichir(variante.product)

    const vehicule = libelleVehicule({
      marque: configuration.generation.model.make.name,
      modele: configuration.generation.model.name,
      generation: configuration.generation.name,
    })
    const etat =
      valeurs.value.status === 'CONFIRMED'
        ? 'confirmée'
        : valeurs.value.status === 'INCOMPATIBLE'
          ? 'incompatible'
          : 'à vérifier'
    return {
      notice: configuration.active
        ? `${vehicule} · ${emplacement.label} : compatibilité enregistrée en « ${etat} ».`
        : `${vehicule} · ${emplacement.label} : compatibilité enregistrée en « ${etat} ». Cette configuration est désactivée, le parcours véhicule ne la propose pas.`,
    }
  } catch (cause) {
    return erreur('création de compatibilité', cause, saisie)
  }
}

/**
 * Modifie une compatibilité depuis la fiche produit.
 *
 * Le véhicule et l'emplacement ne sont pas modifiables : les changer ferait
 * une autre ligne, et la contrainte d'unicité porte précisément sur ce
 * triplet. Pour déplacer une compatibilité, on la retire et on la documente à
 * sa place — ce qui laisse deux traces dans le journal au lieu d'une
 * modification qui aurait l'air d'une correction de détail.
 */
export async function updateProductFitment(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const saisie = saisieRenvoyee(formData)
  const fitmentId = champ(formData, 'fitmentId')

  try {
    const avant = await prisma.fitment.findUnique({
      where: { id: fitmentId },
      select: {
        configurationId: true,
        status: true,
        quantity: true,
        restrictions: true,
        roadApproval: true,
        approvalMarket: true,
        approvalNote: true,
        source: true,
        verifiedAt: true,
        verifiedBy: true,
        position: { select: { label: true } },
        variant: { select: { sku: true, product: { select: { id: true, slug: true } } } },
      },
    })
    if (!avant) return { error: 'Compatibilité introuvable.', saisie }

    const valeurs = lireCompatibilite(formData)
    if (!valeurs.ok) return { error: valeurs.error, saisie }

    await prisma.fitment.update({
      where: { id: fitmentId },
      data: {
        ...valeurs.value,
        /*
          Le signataire suit la date : une vérification effacée ne laisse pas
          le nom de celui qui l'avait faite, et une date nouvelle ou déplacée
          porte celui qui vient de la saisir. Garder l'ancien nom sur une date
          changée attribuerait à quelqu'un un travail qu'il n'a pas fait.
        */
        verifiedBy: !valeurs.value.verifiedAt
          ? null
          : valeurs.value.verifiedAt.getTime() === avant.verifiedAt?.getTime()
            ? avant.verifiedBy
            : staff.id,
      },
    })
    await audit(
      staff,
      'vehicle.fitment.update',
      'Fitment',
      fitmentId,
      {
        status: avant.status,
        quantity: avant.quantity,
        restrictions: avant.restrictions,
        roadApproval: avant.roadApproval,
        approvalMarket: avant.approvalMarket,
        approvalNote: avant.approvalNote,
        source: avant.source,
        verifiedAt: avant.verifiedAt?.toISOString() ?? null,
      },
      { ...valeurs.value, verifiedAt: valeurs.value.verifiedAt?.toISOString() ?? null },
    )
    await revalidateDepuisConfiguration(avant.configurationId)
    rafraichir(avant.variant.product)

    return { notice: `${avant.position.label} · ${avant.variant.sku} : compatibilité enregistrée.` }
  } catch (cause) {
    return erreur('modification de compatibilité', cause, saisie)
  }
}

/**
 * Retire une compatibilité.
 *
 * Supprimer n'est pas la même chose que passer en « incompatible » : la ligne
 * supprimée emporte la source et la date de vérification, et l'absence de
 * ligne vaut « à vérifier » côté lecture — jamais « incompatible ». L'écran le
 * dit à côté du bouton.
 */
export async function removeProductFitment(
  _precedent: LinksState,
  formData: FormData,
): Promise<LinksState> {
  const staff = await requireStaff('catalog.edit')
  const fitmentId = champ(formData, 'fitmentId')

  try {
    const avant = await prisma.fitment.findUnique({
      where: { id: fitmentId },
      select: {
        configurationId: true,
        status: true,
        quantity: true,
        source: true,
        verifiedAt: true,
        position: { select: { label: true } },
        variant: { select: { sku: true, product: { select: { id: true, slug: true } } } },
        configuration: {
          select: {
            generation: {
              select: {
                name: true,
                model: { select: { name: true, make: { select: { name: true } } } },
              },
            },
          },
        },
        _count: { select: { accessories: true } },
      },
    })
    if (!avant) return { error: 'Compatibilité introuvable.' }

    await prisma.fitment.delete({ where: { id: fitmentId } })
    await audit(
      staff,
      'vehicle.fitment.delete',
      'Fitment',
      fitmentId,
      {
        sku: avant.variant.sku,
        status: avant.status,
        quantity: avant.quantity,
        source: avant.source,
        verifiedAt: avant.verifiedAt?.toISOString() ?? null,
        accessoires: avant._count.accessories,
      },
      null,
    )
    await revalidateDepuisConfiguration(avant.configurationId)
    rafraichir(avant.variant.product)

    const vehicule = libelleVehicule({
      marque: avant.configuration.generation.model.make.name,
      modele: avant.configuration.generation.model.name,
      generation: avant.configuration.generation.name,
    })
    return {
      notice:
        avant._count.accessories > 0
          ? `${vehicule} · ${avant.position.label} : compatibilité retirée, avec les ${avant._count.accessories} accessoires de montage qu'elle portait.`
          : `${vehicule} · ${avant.position.label} : compatibilité retirée. Le véhicule redevient « à vérifier » pour cette référence.`,
    }
  } catch (cause) {
    return erreur('retrait de compatibilité', cause)
  }
}
