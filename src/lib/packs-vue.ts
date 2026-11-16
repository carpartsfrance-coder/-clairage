import { natureDuProduit } from './types-produit'
import { presentationDeCarte } from './carte-titre'
import type { FitmentStatus } from './fitment'
import type { PackPositionGroup, PackProduct } from './queries/packs'
import { nomUtileDuConditionnement } from './nom-conditionnement'
import { estEffetXenon } from './effet-xenon'
import { cleDEmplacement, unParEmplacement } from './un-par-emplacement'

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

/* -------------------------------------------------------------------------- */

/**
 * Une carte d'éclairage, telle que les deux pages véhicule la dessinent.
 *
 * Il y en a deux : la page d'une génération (`/packs/...`), qui montre ce qui
 * est **documenté** pour le modèle, et la page des résultats
 * (`/vehicule/resultats`), qui montre ce qui est **confirmé** pour la
 * configuration retenue. Elles répondent à deux questions différentes, mais
 * elles montrent les mêmes pièces au même client : les dessiner autrement ne
 * lui apprenait rien et donnait deux sites.
 *
 * Ce modèle est donc volontairement pauvre — ce qu'une vignette peut porter,
 * et rien de plus. Les champs facultatifs ne sont pas des ornements : ils sont
 * vides presque partout, et c'est ce qui permet de les afficher dès qu'ils
 * sont remplis, au lieu de réserver sur chaque carte la place d'une
 * information que cinq fiches sur dix mille possèdent.
 */
export type CarteEclairage = {
  /** Le slug du produit : clé de liste, et destination du clic. */
  slug: string
  /**
   * La variante conseillée — celle dont le prix s'affiche.
   *
   * C'est elle qu'on met au panier quand le client ajoute d'un coup tout
   * l'éclairage de son véhicule : la bande de total ne doit pas pouvoir
   * acheter autre chose que ce que les cartes annoncent.
   */
  variantId: string | null
  /** Les emplacements que ce produit équipe, tous nommés. */
  emplacements: Array<{ code: string; label: string }>
  image: { url: string; alt: string } | null
  status: FitmentStatus
  /** Le prix montré : celui du conditionnement conseillé. */
  prixCents: number
  /** Le conditionnement, seulement quand son nom apprend quelque chose. */
  conditionnement: string | null
  /** Nom du produit : la carte en tire son titre (`presentationDeCarte`). */
  nom: string
  /** Les autres conditionnements documentés, s'il y en a. */
  autres: Array<{ nom: string; prixCents: number }>
  /**
   * Réserve de montage propre à ce produit — « adaptateurs nécessaires, non
   * inclus ». Elle appartient à SON conditionnement : mise en commun, elle se
   * lirait comme valant aussi pour le kit complet, qui les contient.
   */
  reserve: string | null
  /** Provenance de la vérification, déjà rédigée. */
  verifie: string | null
  /**
   * Nombre d'exemplaires nécessaires à l'emplacement, quand il en faut plus
   * d'un. `null` le reste du temps : « 1 nécessaire » n'apprend rien.
   */
  quantite: number | null
}

/** Les cartes d'une génération, dans l'ordre des emplacements. */
export function cartesDesPacks(groupes: PackPositionGroup[]): CarteEclairage[] {
  return produitsSitues(groupes).map(({ produit, emplacements }) => ({
    slug: produit.productSlug,
    nom: produit.productName,
    variantId: produit.recommended?.id ?? null,
    emplacements,
    image: produit.image,
    status: produit.status,
    prixCents: produit.recommended?.priceCents ?? produit.fromPriceCents,
    // Une carte d'ampoules halogènes le dit : sous le titre « Éclairage LED »
    // de la page véhicule, rien d'autre ne la distinguerait d'un pack LED.
    conditionnement:
      nomDuConditionnement(produit) ??
      (estEffetXenon(produit.productName)
        ? 'Ampoules halogènes effet xénon'
        : natureDuProduit(produit.productName)),
    autres: [],
    reserve: null,
    verifie: null,
    quantite: null,
  }))
}

export type TotalVehicule = {
  produits: number
  emplacements: number
  totalCents: number
  /**
   * Les conditionnements qui composent la somme.
   *
   * Le bouton « ajouter tous les packs » n'achète que ceux-là : une bande qui
   * annonce un total et met autre chose au panier serait pire que pas de
   * bande du tout. Une carte sans conditionnement conseillé — un produit en
   * rupture, par exemple — compte dans le total affiché mais n'a rien à
   * mettre au panier, et le bouton ne l'invente pas.
   */
  variantIds: string[]
  /**
   * Le détail de la sélection, dans l'ordre de la page.
   *
   * La bande annonçait « 8 emplacements » puis « Ajouter les 9 packs » sans
   * dire lesquels (audit du 16 novembre 2026) : un emplacement peut compter
   * deux packs distincts — feux de jour et veilleuses, répétiteurs et
   * clignotants. Le client voit maintenant ce qu'il ajoute, ligne à ligne.
   */
  lignes: Array<{
    slug: string
    nom: string
    emplacement: string
    prixCents: number
    /** Faux quand la carte n'a pas de conditionnement à mettre au panier. */
    ajoutable: boolean
  }>
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
  return totalDesCartes(cartesDesPacks(groupes))
}

/**
 * Le même total, à partir des cartes — donc des prix réellement affichés.
 *
 * Les deux pages véhicule l'appellent : c'est la seule façon de garantir que
 * le chiffre annoncé en tête soit celui qu'on obtient en additionnant les
 * vignettes du dessous.
 */
export function totalDesCartes(cartes: CarteEclairage[]): TotalVehicule {
  // Un produit par emplacement : les alternatives (effet xénon, kit xénon,
  // kit LED pour le même croisement) ne s'achètent pas ensemble.
  const retenues = unParEmplacement(
    cartes.filter((carte) => carte.status !== 'INCOMPATIBLE'),
    (carte) => cleDEmplacement(carte.emplacements[0]?.label ?? carte.slug, carte.nom),
    (carte) => carte.prixCents,
  )
  return {
    produits: retenues.length,
    emplacements: new Set(retenues.flatMap((carte) => carte.emplacements.map((e) => e.label))).size,
    totalCents: retenues.reduce((somme, carte) => somme + carte.prixCents, 0),
    variantIds: retenues
      .map((carte) => carte.variantId)
      .filter((id): id is string => id !== null),
    lignes: retenues.map((carte) => ({
      slug: carte.slug,
      // Le titre que porte la carte (« Ampoules effet xénon »), pas le nom
      // complet de la fiche : le détail doit se lire comme les vignettes.
      nom: presentationDeCarte(carte.nom, carte.conditionnement).titre ?? carte.nom,
      emplacement: carte.emplacements.map((e) => e.label).join(', '),
      prixCents: carte.prixCents,
      // Une carte sans conditionnement conseillé (rupture…) compte dans le
      // total affiché, mais le bouton ne peut pas l'ajouter : le détail le dit.
      ajoutable: carte.variantId !== null,
    })),
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
  { cle: 'tout', label: 'Tous les packs', court: 'Tous' },
  { cle: 'avant', label: 'Avant', court: 'Avant' },
  { cle: 'arriere', label: 'Arrière', court: 'Arrière' },
  { cle: 'interieur', label: 'Habitacle', court: 'Habitacle' },
] as const

export type Zone = (typeof ZONES)[number]['cle']

const ZONE_PAR_EMPLACEMENT: Record<string, Exclude<Zone, 'tout'>> = {
  LOW_BEAM: 'avant',
  HIGH_BEAM: 'avant',
  FOG: 'avant',
  SIDELIGHT: 'avant',
  TURN_FRONT: 'avant',
  AUX: 'avant',
  TURN_RELAY: 'avant',
  STOP: 'arriere',
  DASH: 'interieur',
  FOG_REAR: 'arriere',
  TURN_REAR: 'arriere',
  PLATE: 'arriere',
  REVERSE: 'arriere',
  INTERIOR_DOME: 'interieur',
}

/** La zone d'un emplacement, « avant » à défaut — c'est là que tout se voit. */
export function zoneDeLEmplacement(code: string): Exclude<Zone, 'tout'> {
  return ZONE_PAR_EMPLACEMENT[code] ?? 'avant'
}

const NOM_ZONE: Record<Exclude<Zone, 'tout'>, string> = {
  avant: 'Avant',
  arriere: 'Arrière',
  interieur: 'Habitacle',
}

/** « Avant », tel que la pastille de la vignette l'écrit. */
export function nomDeLaZone(zone: Exclude<Zone, 'tout'>): string {
  return NOM_ZONE[zone]
}

/**
 * Ce que l'emplacement éclaire, en une ligne sous son nom.
 *
 * « Feux de croisement » nomme la pièce ; « Éclairage principal à l'avant »
 * dit à quoi elle sert. Les deux ensemble répondent à la question du client,
 * qui ne connaît pas toujours le nom de la lumière qu'il veut changer.
 *
 * Rien pour un emplacement inconnu : mieux vaut une ligne en moins qu'une
 * description inventée pour un emplacement que le catalogue vient d'ajouter.
 */
const SOUS_TITRE_PAR_EMPLACEMENT: Record<string, string> = {
  LOW_BEAM: 'Éclairage principal à l’avant',
  HIGH_BEAM: 'Éclairage longue portée',
  FOG: 'Éclairage antibrouillard',
  INTERIOR_DOME: 'Éclairage intérieur',
  PLATE: 'Éclairage de la plaque arrière',
  REVERSE: 'Éclairage en marche arrière',
  SIDELIGHT: 'Feux de position avant',
  TURN_FRONT: 'Signalisation à l’avant',
  AUX: 'En plus des phares d’origine',
  STOP: 'Feu arrière et feu stop',
  DASH: 'Compteur et tableau de bord',
  TURN_RELAY: 'Cadence normale avec des clignotants LED',
  FOG_REAR: 'Feu de brouillard à l’arrière',
  TURN_REAR: 'Signalisation à l’arrière',
}

const NOM_PAR_EMPLACEMENT: Record<string, string> = {
  LOW_BEAM: 'Feux de croisement',
  HIGH_BEAM: 'Feux de route',
  FOG: 'Antibrouillards',
  INTERIOR_DOME: 'Éclairage intérieur',
  PLATE: 'Éclairage de plaque',
  REVERSE: 'Feux de recul',
  SIDELIGHT: 'Veilleuses',
  TURN_FRONT: 'Clignotants avant',
}

/** Le libellé d'un emplacement, jamais son code technique (« TURN_FRONT »). */
export function nomDeLEmplacement(code: string, label: string): string {
  return label && label !== code ? label : (NOM_PAR_EMPLACEMENT[code] ?? label)
}

export function sousTitreDeLEmplacement(code: string): string | null {
  return SOUS_TITRE_PAR_EMPLACEMENT[code] ?? null
}

/* -------------------------------------------------------------------------- */

/** Les trois tris offerts par la barre d'outils. */
export const TRIS = [
  { cle: 'conseilles', label: 'Recommandés' },
  { cle: 'prix-croissant', label: 'Prix croissant' },
  { cle: 'prix-decroissant', label: 'Prix décroissant' },
] as const

export type Tri = (typeof TRIS)[number]['cle']

/** L'ordre des zones : on fait le tour de la voiture, pas du catalogue. */
const ORDRE_ZONE: Record<Exclude<Zone, 'tout'>, number> = { avant: 0, arriere: 1, interieur: 2 }

/**
 * Les cartes triées.
 *
 * « Recommandés » regroupe par zone — tout l'avant, puis l'arrière, puis
 * l'habitacle — et garde dans chaque zone l'ordre du référentiel, qui suit le
 * schéma d'éclairage d'une voiture. Le catalogue, lui, range le plafonnier en
 * quatrième position, entre les antibrouillards et la plaque : la grille
 * passait donc de l'avant à l'habitacle puis revenait à l'arrière. Grouper
 * suit le regard de celui qui fait le tour de sa voiture, et les trois
 * pastilles de zone retrouvent un sens, puisqu'elles ne s'entremêlent plus.
 *
 * Le tri ne modifie jamais le tableau reçu : la grille redessinerait mal si
 * React retrouvait la même référence.
 */
export function cartesTriees(cartes: CarteEclairage[], tri: Tri): CarteEclairage[] {
  if (tri === 'conseilles') {
    // D'abord les cartes qui montrent le véhicule du client (rendu réel de SA
    // voiture), puis les autres ; dans chaque groupe, par zone. `sort` est
    // stable : à rang égal, l'ordre d'arrivée est conservé.
    const vehicule = (c: CarteEclairage) => (c.image && /\/rendus\//.test(c.image.url) ? 0 : 1)
    return [...cartes].sort(
      (a, b) =>
        vehicule(a) - vehicule(b) ||
        ORDRE_ZONE[zoneDeLEmplacement(a.emplacements[0].code)] -
          ORDRE_ZONE[zoneDeLEmplacement(b.emplacements[0].code)],
    )
  }
  const sens = tri === 'prix-croissant' ? 1 : -1
  return [...cartes].sort((a, b) => sens * (a.prixCents - b.prixCents))
}

/** Les zones réellement représentées, dans l'ordre, « Tout » en tête. */
export function zonesPresentes(codes: string[]): typeof ZONES[number][] {
  const vues = new Set(codes.map(zoneDeLEmplacement))
  return ZONES.filter((zone) => zone.cle === 'tout' || vues.has(zone.cle as Exclude<Zone, 'tout'>))
}

/**
 * La phrase sous le titre de la page d'un véhicule, tirée de ce qui y est
 * vraiment proposé.
 *
 * Elle disait partout « Trouvez le bon pack, des phares au plafonnier. »,
 * y compris sur la Renault 4 E-Tech, qui n'a qu'un pack d'éclairage de plaque
 * (audit du 16 novembre 2026). Elle nomme maintenant les emplacements
 * couverts, dans l'ordre de la page, et n'en promet aucun autre.
 */
export function phraseDesEmplacements(groupes: PackPositionGroup[]): string {
  const libelles = [
    ...new Set(
      groupes
        .filter((groupe) => groupe.products.length > 0)
        .map((groupe) => nomDeLEmplacement(groupe.code, groupe.label).trim())
        .filter(Boolean),
    ),
  ]
  if (libelles.length === 0) return 'Aucun éclairage n’est encore documenté pour cette génération.'

  const bas = (libelle: string) => libelle.charAt(0).toLowerCase() + libelle.slice(1)
  const [premier, deuxieme, troisieme] = libelles
  // Un emplacement peut offrir plusieurs solutions : la phrase ne dit jamais
  // « un pack par emplacement » (relecture ChatGPT du 17 novembre 2026).
  const produits = new Set(groupes.flatMap((groupe) => groupe.products.map((p) => p.productSlug))).size

  if (libelles.length === 1) {
    return `${premier} : ${produits > 1 ? 'les packs composés' : 'le pack composé'} pour ce véhicule.`
  }
  if (libelles.length === 2) return `${premier} et ${bas(deuxieme)} : les packs composés pour ce véhicule.`
  return `Les éclairages proposés pour ce véhicule : ${bas(premier)}, ${bas(deuxieme)}, ${bas(troisieme)}${
    libelles.length > 3 ? '…' : '.'
  }`
}

/** « Voir le pack » ou « Voir les 13 packs » — jamais « Voir les 1 pack ». */
export function libelleVoirLesPacks(total: number): string {
  return total === 1 ? 'Voir le pack' : `Voir les ${total} packs`
}

/**
 * Ce que la liste des générations dit de chacune : combien de packs attendent
 * le client, et s'il aura un équipement d'origine à préciser.
 *
 * Elle disait « 1 équipement d'origine documenté » — vrai, mais sans rapport
 * avec l'achat : la Clio 4 menait ensuite à 13 packs (audit du 16 novembre
 * 2026). Le nombre d'équipements n'est gardé que lorsqu'il y en a plusieurs :
 * c'est alors une étape de plus, et il vaut mieux l'annoncer.
 */
export function resumeDeGeneration(generation: {
  packCount: number
  configurationCount: number
  hasFitments: boolean
}): string {
  if (!generation.hasFitments || generation.packCount === 0) return 'Compatibilités non encore relevées'
  const packs =
    generation.packCount === 1 ? '1 pack disponible' : `${generation.packCount} packs disponibles`
  return generation.configurationCount > 1
    ? `${packs} · ${generation.configurationCount} équipements d'origine`
    : packs
}

/**
 * Le titre du bandeau d'une page véhicule, fidèle à ce qu'elle propose.
 *
 * Il disait « Éclairage LED » partout, y compris au-dessus d'ampoules
 * halogènes effet xénon et de kits xénon HID (audit du 16 novembre 2026).
 * Les cartes le précisent déjà ; le titre le dit maintenant aussi, sans
 * perdre « LED », qui est ce que le client cherche : « Éclairage LED et
 * xénon » dès qu'une carte n'est pas en LED, « Éclairage xénon » s'il n'y a
 * que cela, « Éclairage LED » sinon.
 */
export function titreDesTechnologies(cartes: Array<{ nom: string }>): string {
  const xenon = (nom: string) => estEffetXenon(nom) || /x[ée]non/i.test(nom)
  const avecXenon = cartes.some((carte) => xenon(carte.nom))
  const avecLed = cartes.some((carte) => !xenon(carte.nom))
  if (avecXenon && avecLed) return 'Éclairage LED et xénon'
  if (avecXenon) return 'Éclairage xénon'
  return 'Éclairage LED'
}

/** Des cartes qui se remplacent l'une l'autre, pour un même éclairage. */
export type GroupeDAlternatives = {
  cle: string
  /** « Feux de croisement » : ce que toutes les cartes du groupe éclairent. */
  emplacement: string
  cartes: CarteEclairage[]
}

/**
 * Les cartes regroupées par éclairage, dans l'ordre où elles arrivent.
 *
 * Sur une page véhicule, trois solutions pour les feux de croisement — effet
 * xénon, kit LED, kit xénon HID — s'alignaient comme trois produits à
 * acheter (audit du 16 novembre 2026). Elles sont maintenant réunies sous
 * leur éclairage, qui dit qu'il en faut une seule. La règle des alternatives
 * est celle du total « Tout l'éclairage » (`cleDEmplacement`) : la page et
 * la somme ne peuvent pas se contredire.
 *
 * Un groupe d'une seule carte reste une carte : c'est le cas de 98 % des
 * emplacements du catalogue, et il n'y a là rien à comparer.
 */
export function regrouperLesAlternatives(cartes: CarteEclairage[]): GroupeDAlternatives[] {
  const groupes = new Map<string, GroupeDAlternatives>()
  for (const carte of cartes) {
    const emplacement = carte.emplacements[0]?.label ?? carte.slug
    const cle = cleDEmplacement(emplacement, carte.nom)
    const groupe = groupes.get(cle) ?? { cle, emplacement, cartes: [] }
    groupe.cartes.push(carte)
    groupes.set(cle, groupe)
  }
  return [...groupes.values()]
}

/**
 * « 13 packs pour 9 éclairages » : le décompte sous « Choisissez votre
 * éclairage ».
 *
 * Il ne disait que « 13 packs », que le client pouvait lire comme treize
 * achats nécessaires. Le nombre d'éclairages — groupes d'alternatives, même
 * règle que la grille — dit combien de choses il y a vraiment à choisir.
 */
export function decompteDesPacks(cartes: CarteEclairage[]): string {
  const packs = cartes.length
  const eclairages = regrouperLesAlternatives(cartes).length
  const libellePacks = packs === 1 ? '1 pack' : `${packs} packs`
  if (eclairages === packs) return libellePacks
  return `${libellePacks} pour ${eclairages} éclairage${eclairages > 1 ? 's' : ''}`
}

/**
 * Les groupes d'alternatives dans l'ordre d'un tri.
 *
 * « Recommandés » garde l'ordre d'arrivée. Les tris par prix classent les
 * groupes selon leur solution la moins chère — un groupe n'est jamais coupé
 * en deux par un tri, sans quoi les solutions d'un même éclairage se
 * retrouveraient à nouveau éparpillées (relecture du 17 novembre 2026).
 */
export function groupesTries(cartes: CarteEclairage[], tri: Tri): GroupeDAlternatives[] {
  const groupes = regrouperLesAlternatives(cartes)
  if (tri === 'conseilles') return groupes
  const sens = tri === 'prix-croissant' ? 1 : -1
  const minimum = (groupe: GroupeDAlternatives) =>
    Math.min(...groupe.cartes.map((carte) => carte.prixCents))
  return groupes
    .map((groupe) => ({
      ...groupe,
      cartes: [...groupe.cartes].sort((a, b) => sens * (a.prixCents - b.prixCents)),
    }))
    .sort((a, b) => sens * (minimum(a) - minimum(b)))
}
