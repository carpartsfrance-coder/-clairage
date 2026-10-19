import 'server-only'
import { prisma } from '../db'

/**
 * Arborescence de navigation, construite depuis le catalogue.
 *
 * **Les rubriques sont des catégories racines de la base**, plus les deux
 * parcours véhicule qui, eux, ne sont pas des catégories : une marque n'est
 * pas une famille de produits. Ordre, libellés et visibilité se règlent donc
 * en back-office (Administration › Catégories), sans toucher au code.
 *
 * Chaque rubrique se déplie en deux colonnes au plus :
 *
 * - **Par famille** : ses sous-catégories publiées qui ont des produits ;
 * - **Par culot** : les culots portés par les produits de la rubrique,
 *   générés depuis `Product.bulbBase`. Les culots ne sont pas des catégories
 *   — tenir la même information à deux endroits obligerait à la corriger deux
 *   fois. Publier une ampoule H4 fait apparaître H4, sans rien déclarer.
 *
 * Deux règles de rendu, et elles expliquent l'essentiel du code :
 *
 * 1. **Une entrée qui ne mène à aucun produit n'est pas affichée.** Le menu
 *    précédent déclarait des sous-entrées écrites à la main qui pointaient
 *    sur des catégories inexistantes : sept liens répondaient 404.
 * 2. **Une rubrique vide disparaît aussi.** L'arborescence complète existe en
 *    base et se voit en back-office, avec la mention « Vide » qui explique
 *    l'absence. Mener un client vers une page sans produit serait lui faire
 *    perdre un clic pour rien.
 */

export type NavLink = {
  label: string
  href: string
  count: number
  hint?: string
  /**
   * Logo de la marque, quand un média lui a été rattaché.
   *
   * Rien n'est livré avec le projet : un logo de constructeur est une marque
   * déposée, et c'est à l'exploitant de téléverser ceux qu'il est en droit
   * d'afficher. Sans logo, le menu pose un monogramme neutre — jamais une
   * image d'emprunt.
   */
  logo?: { url: string; alt: string } | null
}

export type NavColumn = {
  title: string
  links: NavLink[]
  more?: { label: string; href: string }
}

export type NavSection = {
  key: string
  /** Surtitre affiché au-dessus du libellé. Absent pour les rubriques simples. */
  kicker?: string
  label: string
  href: string
  highlight?: boolean
  description?: string
  columns: NavColumn[]
}

/** Au-delà, la colonne renvoie vers la page de la rubrique. */
const MAX_PAR_COLONNE = 10

/* -------------------------------------------------------------------------- */

/**
 * Marques actives d'un type de véhicule, avec leur logo et leur nombre de
 * modèles.
 *
 * Le logo arrive par jointure : `VehicleMake.logo` est une relation depuis
 * que le référentiel véhicule est éditable en back-office. Elle est en
 * `SET NULL` — supprimer un média détache le logo sans emporter la marque, et
 * l'affichage retombe alors sur le monogramme.
 */
async function lireMarques(type: 'CAR' | 'MOTORCYCLE') {
  const makes = await prisma.vehicleMake.findMany({
    where: { type, active: true, models: { some: { active: true } } },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { models: { where: { active: true } } } },
      logo: { select: { url: true, alt: true } },
    },
  })

  return makes.map((make) => ({
    slug: make.slug,
    name: make.name,
    models: make._count.models,
    logo: make.logo ? { url: make.logo.url, alt: make.logo.alt ?? make.name } : null,
  }))
}

function colonneMarques(
  marques: Array<{
    slug: string
    name: string
    models: number
    logo: { url: string; alt: string } | null
  }>,
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
        logo: marque.logo,
      })),
      more: { label: 'Voir toutes les marques', href: `/packs/${typePath}` },
    },
  ]
}

/* -------------------------------------------------------------------------- */

export async function getNavigation(): Promise<NavSection[]> {
  try {
    const [categories, liens, marquesAuto, marquesMoto] = await Promise.all([
      prisma.category.findMany({
        where: { published: true },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          shortName: true,
          description: true,
          parentId: true,
        },
      }),
      /*
        Un enregistrement par couple (produit publié, catégorie). Il sert à la
        fois au comptage et au relevé des culots, en une seule lecture. Sur un
        catalogue de plusieurs milliers de références, ce regroupement
        descendra en SQL ; à cette échelle, le faire en mémoire est plus
        simple à relire.
      */
      prisma.productCategory.findMany({
        where: { product: { status: 'PUBLISHED' } },
        select: { categoryId: true, product: { select: { bulbBase: true } } },
      }),
      lireMarques('CAR'),
      lireMarques('MOTORCYCLE'),
    ])

    // Produits et culots, par catégorie directe.
    const parCategorie = new Map<string, { produits: number; culots: Map<string, number> }>()
    for (const lien of liens) {
      const entree = parCategorie.get(lien.categoryId) ?? { produits: 0, culots: new Map() }
      entree.produits += 1
      const base = lien.product.bulbBase
      if (base) entree.culots.set(base, (entree.culots.get(base) ?? 0) + 1)
      parCategorie.set(lien.categoryId, entree)
    }

    const racines = categories.filter((category) => category.parentId === null)
    const enfantsDe = (parentId: string) =>
      categories.filter((category) => category.parentId === parentId)

    /** Produits et culots d'une rubrique, ses sous-catégories comprises. */
    function cumul(categoryId: string) {
      const propre = parCategorie.get(categoryId)
      let produits = propre?.produits ?? 0
      const culots = new Map(propre?.culots ?? [])

      for (const enfant of enfantsDe(categoryId)) {
        const sousTotal = cumul(enfant.id)
        produits += sousTotal.produits
        for (const [code, nombre] of sousTotal.culots) {
          culots.set(code, (culots.get(code) ?? 0) + nombre)
        }
      }
      return { produits, culots }
    }

    const rubriquesCatalogue: NavSection[] = racines.map((racine) => {
      const total = cumul(racine.id)

      const familles = enfantsDe(racine.id)
        .map((enfant) => ({ enfant, total: cumul(enfant.id) }))
        .filter(({ total: sousTotal }) => sousTotal.produits > 0)
        .map(({ enfant, total: sousTotal }) => ({
          label: enfant.name,
          href: `/c/${enfant.slug}`,
          count: sousTotal.produits,
        }))

      const culots = [...total.culots.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'fr'))
        .slice(0, MAX_PAR_COLONNE)
        .map(([code, count]) => ({ label: code, href: `/culot/${code.toLowerCase()}`, count }))

      const columns: NavColumn[] = []
      if (familles.length > 0) columns.push({ title: 'Par famille', links: familles })
      if (culots.length > 0) columns.push({ title: 'Par culot', links: culots })

      return {
        key: racine.slug,
        kicker: racine.shortName ?? undefined,
        label: racine.name,
        href: `/c/${racine.slug}`,
        description: racine.description ?? undefined,
        columns,
        // Conservé pour le filtre ci-dessous : une rubrique peut n'avoir
        // aucune colonne et tout de même mener à des produits.
        ...{ _produits: total.produits },
      } as NavSection & { _produits: number }
    })

    /*
      Les deux parcours véhicule ouvrent la barre. Ils ne sont pas des
      catégories : ils mènent à un arbre marque → modèle → génération, et
      n'ont donc ni famille ni culot.
    */
    const parcours: NavSection[] = [
      {
        key: 'packs-auto',
        kicker: 'Packs par marque',
        label: 'Auto & utilitaire',
        href: '/packs/auto',
        highlight: true,
        description: 'Les éclairages documentés pour votre voiture.',
        columns: colonneMarques(marquesAuto, 'auto'),
      },
      {
        key: 'packs-moto',
        kicker: 'Packs par marque',
        label: 'Moto, scooter & quad',
        href: '/packs/moto',
        description: 'Les éclairages documentés pour votre deux-roues.',
        columns: colonneMarques(marquesMoto, 'moto'),
      },
    ].filter((section) => section.columns.length > 0)

    const catalogue = (rubriquesCatalogue as Array<NavSection & { _produits: number }>)
      .filter((section) => section._produits > 0)
      .map(({ _produits: _, ...section }) => section)

    return [...parcours, ...catalogue]
  } catch (error) {
    /*
      Base injoignable : barre vide plutôt qu'une arborescence figée. Un menu
      écrit en dur survivrait à la panne en pointant vers des pages qui, elles,
      ne répondraient pas.
    */
    console.error('[navigation] arborescence indisponible', error)
    return []
  }
}
