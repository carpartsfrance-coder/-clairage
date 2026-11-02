import { isValidSlug, slugify, type ParseResult } from './vehicles'

/**
 * Règles d'écriture du bloc achat d'une fiche produit.
 *
 * Ce qui fait vendre une fiche — référence, conditionnement, prix, taux de
 * TVA, stock — ne s'écrivait nulle part dans l'application : ni écran, ni
 * import complet. Le catalogue en ligne venait entièrement de `prisma/seed.ts`
 * et de deux scripts lancés à la main, et l'import CSV, qui crée bien un
 * produit, n'attribue aucun taux de TVA — or la publication le refuse. Une
 * fiche créée depuis le back-office était donc condamnée au brouillon.
 *
 * Tout ce qui se décide sans la base vit ici, et c'est délibéré : ce sont ces
 * règles qui empêchent d'inscrire un prix de 0 €, un prix barré inférieur au
 * prix, ou un stock sur un kit. Dans une action de serveur, elles ne seraient
 * vérifiables qu'en les exécutant contre une vraie base.
 *
 * Quatre décisions structurent ce fichier :
 *
 * 1. **Un prix est un montant, pas un nombre à virgule flottante.** La saisie
 *    est convertie en centimes entiers et refusée au-delà de deux décimales.
 *    Arrondir en silence « 19,999 » à 20,00 € changerait le prix de vente sans
 *    le dire.
 * 2. **Le taux de TVA est exigé, toujours.** Sans lui, `vatRate?.rateBp ?? 0`
 *    facture une commande à 0 % de TVA. Le refus de publication est
 *    aujourd'hui la seule chose qui empêche ce cas d'atteindre la caisse : le
 *    demander à la source ferme le trou au lieu de le surveiller.
 * 3. **Le stock d'un kit ne s'écrit pas.** Il se calcule depuis les composants
 *    (`lib/stock.ts`). Lui en écrire un créerait deux vérités, et c'est la
 *    fausse qui s'afficherait.
 * 4. **L'adresse publique se fabrique à la création puis ne bouge plus toute
 *    seule.** Renommer un produit ne doit pas déplacer `/p/<slug>` : les liens
 *    déjà partagés et les résultats de recherche pointent dessus.
 *
 * `slugify` et `isValidSlug` sont empruntés aux règles véhicule plutôt que
 * réécrits : une seconde implémentation de la même règle finirait par
 * diverger, et le site n'a qu'une façon de fabriquer une adresse.
 */

export type { ParseResult }
export { slugify }

/* -------------------------------------------------------------------------- */
/* Conditionnement                                                            */
/* -------------------------------------------------------------------------- */

export const PACKAGINGS = ['UNIT', 'PAIR', 'PACK', 'KIT'] as const
export type PackagingValue = (typeof PACKAGINGS)[number]

export const PACKAGING_LABELS: Record<PackagingValue, string> = {
  UNIT: "À l'unité",
  PAIR: 'La paire',
  PACK: 'Pack',
  KIT: 'Kit complet',
}

/**
 * Ce que le conditionnement annonce au client.
 *
 * Ce n'est pas une étiquette de rangement : c'est ce qu'il croit recevoir pour
 * le prix affiché. Une ampoule vendue seule sous « la paire » est un litige.
 */
export const PACKAGING_NOTES: Record<PackagingValue, string> = {
  UNIT: 'Une pièce pour le prix affiché.',
  PAIR: 'Deux pièces pour le prix affiché — le client attend les deux côtés.',
  PACK: 'Plusieurs pièces identiques. Le nombre se dit dans le nom.',
  KIT: 'Ensemble de pièces différentes. Sa composition se décrit à part, et son stock se calcule depuis ses composants.',
}

export function isPackaging(valeur: string): valeur is PackagingValue {
  return (PACKAGINGS as readonly string[]).includes(valeur)
}

/* -------------------------------------------------------------------------- */
/* Référence (SKU)                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Majuscules, chiffres et traits d'union, sans bord.
 *
 * Les traits d'union consécutifs sont tolérés : le catalogue en contient déjà
 * (`LUM-PK-HEAD-HARLEY-DAVIDSON-FAT-BOB--D5D8`), et refuser une référence
 * qu'on peut lire à l'écran serait incompréhensible.
 */
export const SKU_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/

/**
 * Référence normalisée : espaces retirés, minuscules relevées.
 *
 * La casse n'est pas un choix de l'administrateur : `lum-h7` et `LUM-H7`
 * désignent la même pièce, mais la contrainte d'unicité de la base les
 * distinguerait, et deux fiches porteraient le même produit.
 */
export function normaliserSku(valeur: string): string {
  return valeur.trim().toUpperCase().replace(/\s+/g, '-')
}

export function parseSku(valeur: string): ParseResult<string> {
  const sku = normaliserSku(valeur)
  if (sku.length === 0) {
    return { ok: false, error: 'La référence est obligatoire : les imports de stock la cherchent.' }
  }
  if (sku.length > 64) {
    return { ok: false, error: 'La référence dépasse 64 caractères.' }
  }
  if (!SKU_PATTERN.test(sku)) {
    return {
      ok: false,
      error: `« ${sku} » n'est pas une référence valable : lettres, chiffres et traits d'union, sans commencer ni finir par un trait d'union.`,
    }
  }
  return { ok: true, value: sku }
}

/* -------------------------------------------------------------------------- */
/* Montants                                                                   */
/* -------------------------------------------------------------------------- */

/** Un milliard de centimes : 10 M€. Au-delà, c'est une faute de frappe. */
const PRIX_MAX_CENTS = 1_000_000_000

/**
 * Saisie d'un montant en centimes entiers.
 *
 * On accepte ce qu'un administrateur français tape vraiment : la virgule, les
 * espaces de milliers (y compris l'espace insécable que colle un tableur) et
 * le symbole monétaire. On refuse la troisième décimale au lieu de l'arrondir :
 * « 19,999 » devenu 20,00 € serait un prix de vente changé en silence.
 */
function parseMontantCents(valeur: string): ParseResult<number> {
  const nettoye = valeur
    .replace(/[\s  ]/g, '')
    .replace(/€/g, '')
    .replace(',', '.')
    .trim()

  if (nettoye.length === 0) return { ok: false, error: 'Montant absent.' }
  if (!/^\d+(?:\.\d{1,2})?$/.test(nettoye)) {
    return {
      ok: false,
      error: `« ${valeur.trim()} » n'est pas un montant : chiffres et deux décimales au plus, par exemple 19,90.`,
    }
  }

  // Le passage par une chaîne de centimes évite l'arrondi binaire : 19.90 × 100
  // vaut 1989.9999999999998 en flottant.
  const [entiers, decimales = ''] = nettoye.split('.')
  const cents = Number(entiers) * 100 + Number(decimales.padEnd(2, '0'))

  if (cents >= PRIX_MAX_CENTS) {
    return { ok: false, error: 'Montant trop élevé : vérifiez la saisie.' }
  }
  return { ok: true, value: cents }
}

/** Prix de vente TTC. Strictement positif : un prix à 0 € serait vendu gratuitement. */
export function parsePrixCents(valeur: string): ParseResult<number> {
  const montant = parseMontantCents(valeur)
  if (!montant.ok) {
    return valeur.trim().length === 0
      ? { ok: false, error: 'Le prix est obligatoire.' }
      : montant
  }
  if (montant.value === 0) {
    return { ok: false, error: 'Un prix à 0 € serait vendu gratuitement.' }
  }
  return montant
}

/**
 * Prix barré, facultatif.
 *
 * Il doit être strictement supérieur au prix de vente. Égal, il affiche une
 * remise de 0 % ; inférieur, il annonce une réduction qui est une
 * augmentation. Les deux trompent le client, et la seconde est passible de
 * sanction.
 */
export function parsePrixBarreCents(
  valeur: string,
  prixCents: number,
): ParseResult<number | null> {
  if (valeur.trim().length === 0) return { ok: true, value: null }

  const montant = parseMontantCents(valeur)
  if (!montant.ok) return montant
  if (montant.value <= prixCents) {
    return {
      ok: false,
      error: 'Le prix barré doit dépasser le prix de vente, sinon la remise affichée est nulle ou négative.',
    }
  }
  return { ok: true, value: montant.value }
}

/* -------------------------------------------------------------------------- */
/* Quantités                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Entier positif ou nul.
 *
 * `champ` sert à écrire le refus : « Le stock détenu doit être un nombre
 * entier » se comprend, « valeur invalide » demande de deviner lequel des
 * quatre champs du formulaire est en cause.
 */
export function parseQuantite(
  valeur: string,
  champ: string,
  { defaut, max = 1_000_000 }: { defaut?: number; max?: number } = {},
): ParseResult<number> {
  const nettoye = valeur.replace(/[\s  ]/g, '').trim()
  if (nettoye.length === 0) {
    if (defaut === undefined) return { ok: false, error: `${champ} est obligatoire.` }
    return { ok: true, value: defaut }
  }
  if (!/^\d+$/.test(nettoye)) {
    return { ok: false, error: `${champ} doit être un nombre entier, sans décimale ni signe.` }
  }
  const nombre = Number(nettoye)
  if (nombre > max) {
    return { ok: false, error: `${champ} dépasse ${max.toLocaleString('fr-FR')} : vérifiez la saisie.` }
  }
  return { ok: true, value: nombre }
}

/** Poids en grammes, facultatif. Zéro refusé : une pièce pèse quelque chose. */
export function parsePoidsGrammes(valeur: string): ParseResult<number | null> {
  if (valeur.trim().length === 0) return { ok: true, value: null }
  const quantite = parseQuantite(valeur, 'Le poids', { max: 500_000 })
  if (!quantite.ok) return quantite
  if (quantite.value === 0) {
    return { ok: false, error: 'Un poids de 0 g ne veut rien dire : laissez le champ vide.' }
  }
  return { ok: true, value: quantite.value }
}

/* -------------------------------------------------------------------------- */
/* Variante                                                                   */
/* -------------------------------------------------------------------------- */

export type VarianteSaisie = {
  sku: string
  name: string
  packaging: string
  prix: string
  prixBarre: string
  vatRateId: string
  seuil: string
  poids: string
  backorder: boolean
  active: boolean
}

export type VarianteWriteData = {
  sku: string
  name: string
  packaging: PackagingValue
  priceCents: number
  compareAtCents: number | null
  vatRateId: string
  lowStockThreshold: number
  weightGrams: number | null
  backorder: boolean
  active: boolean
}

/**
 * Tout ce qu'il faut pour qu'une variante soit vendable, ou le premier refus.
 *
 * On s'arrête au premier manque plutôt que d'en lister cinq : l'écran n'a
 * qu'une ligne de message, et un administrateur corrige de toute façon un
 * champ à la fois. L'ordre suit celui du formulaire, pour que le refus désigne
 * le champ qu'on vient de quitter.
 */
export function parseVariante(saisie: VarianteSaisie): ParseResult<VarianteWriteData> {
  const sku = parseSku(saisie.sku)
  if (!sku.ok) return sku

  const name = saisie.name.trim()
  if (name.length === 0) {
    return { ok: false, error: 'Le nom du conditionnement est obligatoire : le client le lit avant d’ajouter au panier.' }
  }
  if (name.length > 160) return { ok: false, error: 'Le nom du conditionnement dépasse 160 caractères.' }

  if (!isPackaging(saisie.packaging)) {
    return { ok: false, error: 'Choisissez un conditionnement.' }
  }

  const prix = parsePrixCents(saisie.prix)
  if (!prix.ok) return prix

  const prixBarre = parsePrixBarreCents(saisie.prixBarre, prix.value)
  if (!prixBarre.ok) return prixBarre

  // Le taux est exigé ici, et non seulement à la publication : sans lui, une
  // commande part avec 0 % de TVA.
  const vatRateId = saisie.vatRateId.trim()
  if (vatRateId.length === 0) {
    return {
      ok: false,
      error: 'Choisissez un taux de TVA : sans lui, le HT de la fiche et de la facture est faux.',
    }
  }

  const seuil = parseQuantite(saisie.seuil, "Le seuil d'alerte", { defaut: 0, max: 100_000 })
  if (!seuil.ok) return seuil

  const poids = parsePoidsGrammes(saisie.poids)
  if (!poids.ok) return poids

  return {
    ok: true,
    value: {
      sku: sku.value,
      name,
      packaging: saisie.packaging,
      priceCents: prix.value,
      compareAtCents: prixBarre.value,
      vatRateId,
      lowStockThreshold: seuil.value,
      weightGrams: poids.value,
      backorder: saisie.backorder,
      active: saisie.active,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Stock                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Pourquoi le stock de cette variante ne s'écrit pas, ou `null` s'il s'écrit.
 *
 * Un kit n'a pas de stock propre : sa disponibilité se calcule depuis ses
 * composants. Lui écrire un nombre donnerait deux réponses à la même
 * question — celle du tableau et celle du calcul — et le client verrait la
 * mauvaise.
 */
export function raisonStockNonEditable(variante: { composants: number }): string | null {
  if (variante.composants > 0) {
    return 'Ce conditionnement est un kit : son stock se calcule depuis ses composants.'
  }
  return null
}

export const MOTIFS_STOCK = ['reception', 'inventaire', 'casse', 'retour', 'autre'] as const
export type MotifStock = (typeof MOTIFS_STOCK)[number]

export const MOTIFS_STOCK_LABELS: Record<MotifStock, string> = {
  reception: 'Réception fournisseur',
  inventaire: 'Comptage en rayon',
  casse: 'Casse ou perte',
  retour: 'Retour client remis en stock',
  autre: 'Autre',
}

export function isMotifStock(valeur: string): valeur is MotifStock {
  return (MOTIFS_STOCK as readonly string[]).includes(valeur)
}

export type StockWriteData = { stockOnHand: number; delta: number; motif: MotifStock }

/**
 * Stock constaté, et le mouvement qu'il implique.
 *
 * On saisit le stock **tel qu'il est**, pas l'écart : compter douze pièces en
 * rayon est un geste sûr, calculer de tête qu'il faut ajouter trois ne l'est
 * pas. L'écart est déduit, et c'est lui qui part dans `StockMovement` pour que
 * l'inventaire reste explicable.
 */
export function parseStock(
  saisie: { stock: string; motif: string },
  stockActuel: number,
): ParseResult<StockWriteData> {
  const stock = parseQuantite(saisie.stock, 'Le stock détenu', { max: 1_000_000 })
  if (!stock.ok) return stock

  if (!isMotifStock(saisie.motif)) {
    return { ok: false, error: 'Choisissez un motif : un mouvement de stock sans raison est illisible six mois plus tard.' }
  }

  const delta = stock.value - stockActuel
  if (delta === 0) {
    return { ok: false, error: 'Ce stock est déjà celui enregistré : rien à écrire.' }
  }

  return { ok: true, value: { stockOnHand: stock.value, delta, motif: saisie.motif } }
}

/* -------------------------------------------------------------------------- */
/* Produit                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Adresse publique d'un produit, dérivée du nom quand le champ est laissé vide.
 *
 * Le formulaire la pré-remplit, mais rien n'oblige à la garder : « Pack LED
 * Golf 7 » peut viser `/p/pack-led-golf-7` comme `/p/pack-golf-7`.
 */
export function adresseProduit(saisie: { name: string; slug: string }): ParseResult<string> {
  const demande = saisie.slug.trim()
  const slug = demande.length > 0 ? demande.toLowerCase() : slugify(saisie.name)

  if (slug.length === 0) {
    return { ok: false, error: "L'adresse ne peut pas être vide : donnez un nom, ou saisissez-la." }
  }
  if (slug.length > 120) {
    return { ok: false, error: "L'adresse dépasse 120 caractères." }
  }
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: `« ${slug} » n'est pas une adresse valable : minuscules, chiffres et traits d'union simples.`,
    }
  }
  return { ok: true, value: slug }
}

export const NOM_MAX = 200

/**
 * Nom d'un produit.
 *
 * C'est le titre de la fiche, le libellé de la vignette dans tout le
 * catalogue, et le nom repris dans le panier et sur la facture : un nom vide
 * laisserait une ligne de commande sans intitulé.
 *
 * Le renommer ne déplace pas l'adresse publique — voir `adresseProduit`.
 */
export function parseNom(valeur: string): ParseResult<string> {
  const name = valeur.trim()
  if (name.length === 0) return { ok: false, error: 'Le nom du produit est obligatoire.' }
  if (name.length > NOM_MAX) {
    return { ok: false, error: `Le nom du produit dépasse ${NOM_MAX} caractères.` }
  }
  return { ok: true, value: name }
}

export type ProduitSaisie = { name: string; slug: string; brand: string; categoryId: string }

export type ProduitWriteData = { name: string; slug: string; brand: string | null; categoryId: string }

/**
 * Ce qu'il faut pour qu'une fiche naisse sans manque bloquant.
 *
 * Le formulaire de création ne demande que ça — nom, adresse, rubrique, et la
 * première variante — parce que c'est exactement ce que le relevé des manques
 * interdit de publier (`lib/admin/completeness.ts`). Demander l'accroche, le
 * référencement et le rédactionnel au même moment produirait un formulaire de
 * trente champs devant lequel on renonce ; ils s'éditent sur la fiche, qui est
 * faite pour ça. Mais une fiche née sans rubrique ni variante vendable serait
 * un brouillon qu'on ne peut pas mettre en ligne, et c'est précisément
 * l'impasse qu'on corrige.
 */
export function parseProduit(saisie: ProduitSaisie): ParseResult<ProduitWriteData> {
  const nom = parseNom(saisie.name)
  if (!nom.ok) return nom
  const name = nom.value

  const slug = adresseProduit({ name, slug: saisie.slug })
  if (!slug.ok) return slug

  const categoryId = saisie.categoryId.trim()
  if (categoryId.length === 0) {
    return {
      ok: false,
      error: "Choisissez une rubrique : sans elle, le produit n'a pas de fil d'Ariane et n'apparaît dans aucun menu.",
    }
  }

  return {
    ok: true,
    value: { name, slug: slug.value, brand: saisie.brand.trim() || null, categoryId },
  }
}

/* -------------------------------------------------------------------------- */
/* Retrait d'un conditionnement                                               */
/* -------------------------------------------------------------------------- */

/** Ce qui rattache une variante au reste de la boutique. */
export type AttachesVariante = {
  /** Lignes de commande passées. */
  commandes: number
  /** Paniers en cours qui la contiennent. */
  paniers: number
  /** Kits dont elle est un composant. */
  kits: number
  /** Compatibilités véhicule documentées sur elle. */
  compatibilites: number
}

/**
 * Pourquoi cette variante ne se supprime pas, ou `null` si elle se supprime.
 *
 * La désactivation retire du site sans rien perdre ; la suppression efface. On
 * ne l'offre donc que sur une variante que personne n'a achetée, qu'aucun
 * panier ne tient, qu'aucun kit n'utilise et qui ne porte aucune compatibilité
 * — et le refus dit laquelle de ces quatre raisons s'applique, sinon
 * l'administrateur ne peut pas la lever.
 *
 * Deux de ces refus devancent la base, qui dirait non de toute façon
 * (`CartLine` et `KitComponent` sont en `Restrict`) : une erreur de contrainte
 * s'affiche « l'enregistrement a échoué », ce qui n'apprend rien. Les deux
 * autres devancent un dégât silencieux : les compatibilités d'une variante
 * sont en `Cascade` et disparaîtraient sans un mot, et une ligne de commande
 * passerait à `null`, détachant la vente de la référence vendue.
 */
export function raisonSuppressionBloquee(attaches: AttachesVariante): string | null {
  if (attaches.commandes > 0) {
    return `Ce conditionnement a déjà été commandé ${attaches.commandes} fois : le supprimer détacherait ces ventes de leur référence. Désactivez-le, il disparaît de la fiche sans rien effacer.`
  }
  if (attaches.paniers > 0) {
    return `Ce conditionnement est dans ${attaches.paniers} panier${attaches.paniers > 1 ? 's' : ''} en cours. Désactivez-le : il ne sera plus proposé.`
  }
  if (attaches.kits > 0) {
    return `Ce conditionnement est un composant de ${attaches.kits} kit${attaches.kits > 1 ? 's' : ''} : le supprimer viderait leur composition.`
  }
  if (attaches.compatibilites > 0) {
    return `Ce conditionnement porte ${attaches.compatibilites} compatibilité${attaches.compatibilites > 1 ? 's' : ''} véhicule, qui seraient effacées avec lui. Désactivez-le pour le retirer de la vente en gardant ce travail.`
  }
  return null
}

/**
 * Pourquoi retirer cette variante de la vente laisserait la fiche vide, ou `null`.
 *
 * Une fiche publiée sans aucune variante active s'affiche toujours, mais sans
 * rien à acheter : le client arrive sur un produit qu'il ne peut pas prendre,
 * et rien ne l'avertit. Le relevé des manques le dit déjà, mais seulement au
 * moment de publier — trop tard pour une fiche déjà en ligne.
 */
export function raisonDerniereVariante(contexte: {
  statutProduit: string
  autresActives: number
}): string | null {
  if (contexte.autresActives > 0) return null
  if (contexte.statutProduit !== 'PUBLISHED') return null
  return "C'est le seul conditionnement actif d'une fiche en ligne : la fiche n'aurait plus rien à vendre. Repassez-la en brouillon d'abord, ou ajoutez un autre conditionnement."
}

/* -------------------------------------------------------------------------- */
/* Saisie renvoyée                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Ce qui a été envoyé, tel quel, pour le réafficher après un refus.
 *
 * **React 19 réinitialise un formulaire dès que son action se termine** : sans
 * ce renvoi, un prix refusé pour une virgule de trop emporterait avec lui la
 * référence, le conditionnement, le seuil et le stock qu'on venait de saisir.
 * Un refus doit coûter une correction, pas une ressaisie complète.
 *
 * La réinitialisation a lieu après que React a posé les nouvelles valeurs par
 * défaut : réafficher la saisie en `defaultValue` suffit donc, et évite de
 * rendre contrôlé un formulaire de douze champs.
 *
 * Les clés sont celles des champs du formulaire. Une case cochée arrive à
 * « on » ; une case décochée n'arrive pas du tout, d'où la valeur `false`
 * inscrite explicitement — sans elle, le formulaire la retrouverait cochée.
 */
export type Saisie = Record<string, string | boolean>

export function texteSaisi(saisie: Saisie | undefined, cle: string, defaut: string): string {
  const valeur = saisie?.[cle]
  return typeof valeur === 'string' ? valeur : defaut
}

export function caseSaisie(saisie: Saisie | undefined, cle: string, defaut: boolean): boolean {
  const valeur = saisie?.[cle]
  if (valeur === undefined) return defaut
  return valeur !== false && valeur !== ''
}
