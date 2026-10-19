import 'server-only'
import { prisma } from '../db'

/**
 * Arborescence de navigation, construite depuis le catalogue.
 *
 * Les sept rubriques sont fixées ici — c'est la colonne vertébrale décidée
 * pour la boutique, pas une donnée. **Leur contenu, lui, vient entièrement de
 * la base** : catégories publiées, culots réellement vendus, marques de
 * véhicules actives. Le menu ne peut donc pas promettre ce que le catalogue
 * n'a pas.
 *
 * Deux règles en découlent, et elles expliquent l'essentiel du code :
 *
 * 1. **Une entrée qui ne mène à aucun produit n'est pas affichée.** Le menu
 *    précédent déclarait des sous-entrées écrites à la main — « Feux de
 *    croisement », « Plafonniers », « Adaptateurs »… — qui pointaient sur des
 *    catégories inexistantes : les sept liens du menu mobile répondaient 404.
 * 2. **Une rubrique vide disparaît aussi.** L'ossature des sept rubriques
 *    reste en place et accueillera les familles le jour où elles existeront ;
 *    tant qu'elles n'ont pas de produit, les annoncer serait inventer un
 *    catalogue.
 *
 * Ce qui n'est donc PAS ici : aucune référence, aucun culot, aucune marque
 * écrits en dur. Ajouter une famille se fait en publiant une catégorie, pas en
 * modifiant ce fichier.
 */

export type NavLink = {
  label: string
  href: string
  /** Nombre de produits publiés derrière le lien. Jamais zéro : on l'aurait retiré. */
  count: number
  /** Précision affichée sous le libellé dans les panneaux. */
  hint?: string
}

export type NavColumn = {
  title: string
  links: NavLink[]
  /** Lien de repli quand la colonne est tronquée, ou vers la page de niveau. */
  more?: { label: string; href: string }
}

export type NavSection = {
  key: string
  label: string
  href: string
  /** Mis en avant dans la barre, comme « Packs par véhicule » auparavant. */
  highlight?: boolean
  description?: string
  columns: NavColumn[]
}

/** Nombre de liens affichés par colonne avant de renvoyer vers la page complète. */
const MAX_PAR_COLONNE = 8

/* -------------------------------------------------------------------------- */

/** Culots lus depuis les produits publiés, avec leur nombre de références. */
async function lireCulots(): Promise<Map<string, number>> {
  const rows = await prisma.product.groupBy({
    by: ['bulbBase'],
    where: { status: 'PUBLISHED', bulbBase: { not: null } },
    _count: { _all: true },
  })
  return new Map(
    rows
      .filter((row): row is typeof row & { bulbBase: string } => row.bulbBase !== null)
      .map((row) => [row.bulbBase, row._count._all]),
  )
}

/** Catégories publiées, avec le nombre de produits publiés rattachés. */
async function lireCategories() {
  const categories = await prisma.category.findMany({
    where: { published: true },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { products: { where: { product: { status: 'PUBLISHED' } } } } },
    },
  })
  return categories.map((category) => ({
    slug: category.slug,
    name: category.shortName ?? category.name,
    family: category.family,
    description: category.description,
    parentId: category.parentId,
    count: category._count.products,
  }))
}

type CategorieNav = Awaited<ReturnType<typeof lireCategories>>[number]

/** Marques actives d'un type de véhicule, avec le nombre de modèles. */
async function lireMarques(type: 'CAR' | 'MOTORCYCLE') {
  const makes = await prisma.vehicleMake.findMany({
    where: { type, active: true, models: { some: { active: true } } },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { models: { where: { active: true } } } } },
  })
  return makes.map((make) => ({ slug: make.slug, name: make.name, models: make._count.models }))
}

/* -------------------------------------------------------------------------- */

/**
 * Colonne « par marque » d'une rubrique de packs.
 *
 * `count` porte le nombre de modèles, pas de produits : à ce niveau c'est ce
 * que le lien ouvre. Une marque sans modèle actif n'est pas remontée par la
 * requête.
 */
function colonneMarques(
  marques: Array<{ slug: string; name: string; models: number }>,
  typePath: string,
): NavColumn[] {
  if (marques.length === 0) return []

  return [
    {
      title: 'Par marque',
      links: marques.slice(0, MAX_PAR_COLONNE).map((marque) => ({
        label: marque.name,
        href: `/packs/${typePath}/${marque.slug}`,
        count: marque.models,
        hint: marque.models > 1 ? `${marque.models} modèles` : '1 modèle',
      })),
      more:
        marques.length > MAX_PAR_COLONNE
          ? { label: 'Voir toutes les marques', href: `/packs/${typePath}` }
          : { label: 'Voir toutes les marques', href: `/packs/${typePath}` },
    },
  ]
}

/** Colonne de catégories, filtrée sur les familles demandées. */
function colonneCategories(
  categories: CategorieNav[],
  familles: string[],
  titre: string,
): NavColumn[] {
  const links = categories
    .filter((category) => familles.includes(category.family) && category.count > 0)
    .map((category) => ({
      label: category.name,
      href: `/c/${category.slug}`,
      count: category.count,
    }))

  return links.length > 0 ? [{ title: titre, links }] : []
}

/** Colonne de culots, restreinte à une liste de codes quand c'est pertinent. */
function colonneCulots(
  culots: Map<string, number>,
  titre: string,
  garder?: (code: string) => boolean,
): NavColumn[] {
  const links = [...culots.entries()]
    .filter(([code]) => (garder ? garder(code) : true))
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([code, count]) => ({
      label: code,
      href: `/culot/${code.toLowerCase()}`,
      count,
    }))

  return links.length > 0 ? [{ title: titre, links }] : []
}

/*
  Culots de signalisation et d'habitacle, par opposition aux culots de phare.

  La distinction sert la rubrique « LED au détail », qui vend à l'unité ou à la
  paire. Elle repose sur la forme du culot, pas sur une liste de références :
  un culot inconnu du catalogue n'a donc rien à faire ici, et un nouveau culot
  de signalisation y entrera sans modification.
*/
const CULOTS_DETAIL = /^(T\d|W\d|C\d|P\d{1,2}W|PY\d{1,2}W|BA\d|R\d{1,2}W|H\d{1,2}W)/i
const estCulotDetail = (code: string) => CULOTS_DETAIL.test(code)

/* -------------------------------------------------------------------------- */

/**
 * Les sept rubriques, dans l'ordre arrêté pour la boutique.
 *
 * Chacune est assemblée puis conservée seulement si elle a du contenu. Les
 * rubriques sans produit disparaissent du menu sans disparaître du code :
 * l'ossature attend son catalogue.
 */
export async function getNavigation(): Promise<NavSection[]> {
  try {
    const [categories, culots, marquesAuto, marquesMoto] = await Promise.all([
      lireCategories(),
      lireCulots(),
      lireMarques('CAR'),
      lireMarques('MOTORCYCLE'),
    ])

    const sections: NavSection[] = [
      {
        key: 'packs-auto',
        label: 'Packs Auto & Utilitaires',
        href: '/packs/auto',
        highlight: true,
        description: 'Les éclairages qui correspondent à votre voiture.',
        columns: colonneMarques(marquesAuto, 'auto'),
      },
      {
        key: 'packs-moto',
        label: 'Packs Moto & Scooter',
        href: '/packs/moto',
        description: 'Les éclairages qui correspondent à votre deux-roues.',
        columns: colonneMarques(marquesMoto, 'moto'),
      },
      {
        key: 'ampoules-kits',
        label: 'Ampoules & Kits LED',
        href: '/c/phares-led',
        description: 'Par culot, quand vous savez déjà ce que vous cherchez.',
        columns: [
          ...colonneCulots(culots, 'Par culot', (code) => !estCulotDetail(code)),
          ...colonneCategories(categories, ['HEADLIGHT'], 'Par emplacement'),
        ],
      },
      {
        key: 'led-detail',
        label: 'LED au détail',
        href: '/c/interieur',
        description: "À l'unité, à la paire ou en lot.",
        columns: [
          ...colonneCategories(
            categories,
            ['INTERIOR', 'PLATE', 'REVERSE', 'SIDELIGHT', 'TURN_SIGNAL'],
            'Par usage',
          ),
          ...colonneCulots(culots, 'Par culot', estCulotDetail),
        ],
      },
      {
        key: 'xenon-halogene',
        label: 'Xénon & Halogène',
        href: '/c/xenon',
        description: "Remplacement d'origine et technologies à décharge.",
        columns: colonneCategories(categories, ['XENON'], 'Technologies'),
      },
      {
        key: 'eclairage-additionnel',
        label: 'Éclairage additionnel',
        href: '/c',
        description: 'Barres LED et phares additionnels.',
        // Aucune famille dédiée dans le catalogue : la rubrique reste vide et
        // n'est donc pas affichée. Elle s'alimentera d'elle-même le jour où
        // une catégorie de cette famille sera publiée.
        columns: [],
      },
      {
        key: 'accessoires',
        label: 'Accessoires',
        href: '/c/accessoires',
        description: 'Adaptateurs, décodeurs, supports et caches.',
        columns: colonneCategories(categories, ['ACCESSORY'], 'Accessoires'),
      },
    ]

    /*
      Une rubrique est conservée si elle a au moins une colonne, OU si sa
      propre page mène à des produits. « Moto » sans marque enregistrée n'a
      rien à proposer : l'afficher enverrait le client sur une page vide.
    */
    const categoriesParSlug = new Map(categories.map((category) => [category.slug, category]))
    return sections.filter((section) => {
      if (section.columns.length > 0) return true
      const slug = section.href.startsWith('/c/') ? section.href.slice(3) : null
      return slug ? (categoriesParSlug.get(slug)?.count ?? 0) > 0 : false
    })
  } catch (error) {
    /*
      Base injoignable : on rend une barre vide plutôt qu'une arborescence
      figée. Un menu écrit en dur survivrait à la panne en pointant vers des
      pages qui, elles, ne répondraient pas.
    */
    console.error('[navigation] arborescence indisponible', error)
    return []
  }
}
