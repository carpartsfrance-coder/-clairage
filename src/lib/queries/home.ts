import 'server-only'
import { prisma } from '@/lib/db'
import { lectureCatalogue } from '@/lib/cache-catalogue'
import { demoHomeBlocks } from '../../../prisma/demo-data'
import { ARGS_COUVERTURE, couverture } from '../media-couverture'
import { couvertureType } from '../images-types'

/**
 * Lectures de la page d'accueil.
 *
 * Chaque accès est tolérant à la panne : si PostgreSQL ne répond pas, la
 * section concernée reçoit une liste vide et s'efface, au lieu de faire tomber
 * la page entière. Rien n'est inventé pour compenser.
 *
 * Rien ici ne dépend du visiteur : chaque lecture passe par le cache partagé
 * du catalogue (lib/cache-catalogue.ts) et l'accueil n'interroge plus la base
 * qu'une fois toutes les cinq minutes. Les fonctions `lire…` lèvent en cas
 * d'échec, pour que la panne ne soit jamais mise en cache ; les fonctions
 * exportées rattrapent l'erreur et rendent le repli.
 */

export type HomeUniverse = {
  slug: string
  name: string
  description: string | null
  image: { url: string; alt: string } | null
}

export type HomeProduct = {
  slug: string
  name: string
  tagline: string | null
  /** Prix du conditionnement le moins cher, en centimes. */
  fromPriceCents: number
  /** Prix du kit complet, s'il existe et coûte plus que l'entrée de gamme. */
  kitPriceCents: number | null
  /** Vrai si le produit propose un kit complet en plus des ampoules seules. */
  hasKit: boolean
  categorySlug: string | null
  categoryName: string | null
  image: { url: string; alt: string } | null
}

export type HomeFaqItem = { question: string; answer: string }

/** Contenus éditoriaux : la table prend le pas sur les valeurs par défaut. */
export async function getHomeBlocks(): Promise<typeof demoHomeBlocks> {
  try {
    return await blocsEnCache()
  } catch (error) {
    console.error('[accueil] blocs éditoriaux indisponibles', error)
    return demoHomeBlocks
  }
}

const blocsEnCache = lectureCatalogue('accueil-blocs-v1', async () => {
  const rows = await prisma.homeBlock.findMany({ where: { enabled: true } })
  const fromDb = Object.fromEntries(rows.map((row) => [row.key, row.payload]))
  return { ...demoHomeBlocks, ...fromDb } as typeof demoHomeBlocks
})

/**
 * Les univers de l'accueil : seulement ceux qui mènent à des produits.
 *
 * Une tuile d'univers est un grand visuel cliquable, au milieu de l'accueil :
 * c'est une promesse. Elle ne doit pas ouvrir sur une rubrique vide. La
 * sélection reste éditoriale — ce sont les catégories racines auxquelles un
 * visuel a été rattaché en back-office — mais une rubrique sans produit en
 * ligne est retirée de l'affichage, pas de la configuration : elle revient
 * d'elle-même dès qu'un de ses produits repasse en ligne.
 *
 * Le comptage remonte l'arbre au lieu de s'arrêter aux produits rattachés
 * directement à la racine, et c'est indispensable ici : « Plaque & recul » n'a
 * aucun produit en propre et 451 dans ses sous-rubriques. Compter en direct
 * l'aurait fait disparaître de l'accueil alors que c'est la rubrique la mieux
 * fournie du catalogue. La remontée ne suppose aucune profondeur — elle suit
 * les `parentId` tant qu'il y en a.
 *
 * `limit` s'applique **après** le filtre : sinon six rubriques choisies dont
 * quatre sont vides n'en laisseraient que deux à l'écran.
 */
export async function getUniverses(limit = 6): Promise<HomeUniverse[]> {
  try {
    return await universEnCache(limit)
  } catch (error) {
    console.error('[accueil] univers indisponibles', error)
    return []
  }
}

const universEnCache = lectureCatalogue('accueil-univers-v1', lireUnivers)

async function lireUnivers(limit: number): Promise<HomeUniverse[]> {
  const [categories, racinesFournies] = await Promise.all([
    prisma.category.findMany({
      where: { published: true, parentId: null },
      orderBy: { position: 'asc' },
      include: { heroMedia: true },
    }),
    racinesAvecProduits(),
  ])

  const retenues = categories.filter((category) => racinesFournies.has(category.id)).slice(0, limit)

  /*
    Visuel de repli : la couverture d'un produit de la rubrique.

    Le visuel d'univers se rattache en base (`heroMediaId`), mais aucun écran
    ne le règle encore : en production, aucune rubrique n'en avait, et
    l'accueil affichait « Les univers seront affichés ici » à la place des
    tuiles. La couverture d'un produit de la famille — le feu allumé sur le
    véhicule — dit la même chose qu'un visuel de rubrique, et c'est une vraie
    image du catalogue. Un visuel rattaché en base reste prioritaire.
  */
  const visuels = await Promise.all(
    retenues.map((category) =>
      category.heroMedia
        ? null
        : prisma.product.findFirst({
            where: {
              status: 'PUBLISHED',
              media: { some: { role: { in: ['RESULT', 'PRODUCT'] } } },
              categories: {
                some: { category: { OR: [{ id: category.id }, { parentId: category.id }] } },
              },
            },
            orderBy: { createdAt: 'asc' },
            select: { name: true, media: { ...ARGS_COUVERTURE, include: { media: true } } },
          }),
    ),
  )

  return retenues.map((category, index) => {
    const repli = couverture(visuels[index]?.media ?? [])?.media
    return {
      slug: category.slug,
      name: category.name,
      description: category.description,
      image: category.heroMedia
        ? { url: category.heroMedia.url, alt: category.heroMedia.alt ?? category.name }
        : repli
          ? { url: repli.url, alt: repli.alt ?? category.name }
          : null,
    }
  })
}

/**
 * Les familles du catalogue qui ont des produits en ligne, dans l'ordre du
 * back-office : raccourcis de la vitrine d'accueil et source de son repli.
 *
 * La liste était écrite en dur (« Phares LED », « Intérieur », « Plaque &
 * recul », « Xénon ») : deux des quatre raccourcis ouvraient une rubrique
 * vide en production. Elle suit désormais le catalogue.
 */
export async function getRubriquesVitrine(): Promise<Array<{ slug: string; label: string }>> {
  try {
    return await rubriquesEnCache()
  } catch (error) {
    console.error('[accueil] rubriques indisponibles', error)
    return []
  }
}

const rubriquesEnCache = lectureCatalogue('accueil-rubriques-v1', async () => {
  const [categories, racinesFournies] = await Promise.all([
    prisma.category.findMany({
      where: { published: true, parentId: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true },
    }),
    racinesAvecProduits(),
  ])
  return categories
    .filter((category) => racinesFournies.has(category.id))
    .map((category) => ({ slug: category.slug, label: category.name }))
})

/**
 * Les catégories racines qui mènent à au moins un produit en ligne,
 * sous-rubriques comprises.
 *
 * Deux lectures seulement : l'arbre des catégories et les rattachements des
 * produits publiés. On marque les catégories qui en portent, puis on remonte
 * les `parentId` jusqu'à la racine. Aucune profondeur n'est supposée.
 */
async function racinesAvecProduits(): Promise<Set<string>> {
  const [categories, rattachements] = await Promise.all([
    prisma.category.findMany({ select: { id: true, parentId: true } }),
    /*
      Dédoublonné en SQL : `distinct` de Prisma se fait en mémoire, après avoir
      rapatrié un enregistrement par produit — plus de dix mille lignes pour en
      garder une vingtaine.
    */
    prisma.$queryRaw<Array<{ categoryId: string }>>`
      SELECT DISTINCT pc."categoryId"
      FROM "ProductCategory" pc
      JOIN "Product" p ON p.id = pc."productId"
      WHERE p.status = 'PUBLISHED'
    `,
  ])

  const parentDe = new Map(categories.map((category) => [category.id, category.parentId]))
  const racines = new Set<string>()

  for (const { categoryId } of rattachements) {
    let courant: string | null | undefined = categoryId
    // Garde-fou : une boucle dans les parents ferait tourner sans fin.
    for (let pas = 0; courant && pas <= categories.length; pas += 1) {
      const parent: string | null | undefined = parentDe.get(courant)
      if (!parent) {
        racines.add(courant)
        break
      }
      courant = parent
    }
  }

  return racines
}

/** Ce que la requête doit charger pour composer une carte de vitrine. */
const CARTE_VITRINE = {
  variants: { where: { active: true }, orderBy: { priceCents: 'asc' } },
  media: { ...ARGS_COUVERTURE, include: { media: true } },
  categories: { include: { category: true }, take: 1 },
} as const

/**
 * Produits de la vitrine d'accueil. Le prix affiché est celui du
 * conditionnement le moins cher — « à partir de » — pour ne pas annoncer un
 * total qui ne correspond à aucun panier possible.
 *
 * **Deux sources, dans cet ordre.** D'abord les produits cochés en
 * back-office : c'est le choix de l'exploitant, et il prime. Le reste de la
 * rangée se complète avec un produit par rubrique.
 *
 * Ce repli existe parce que `featured` ne se pose qu'à la main : tout
 * environnement neuf — et la production l'a été pendant des jours — affichait
 * « Aucun produit publié pour le moment » avec des milliers de références au
 * catalogue. Une boutique qui ne montre rien sur sa page d'accueil paraît
 * vide, et elle ne l'est pas.
 *
 * **Le repli ne classe rien.** Une référence par famille, la première
 * référencée de chacune : c'est un échantillon de l'offre, pas un palmarès.
 * Rien ici ne dit qu'un produit se vend mieux qu'un autre, et le jour où
 * quelqu'un coche quatre produits, son choix reprend la main.
 */
export async function getFeaturedProducts(limit = 4): Promise<HomeProduct[]> {
  try {
    return await vitrineEnCache(limit)
  } catch (error) {
    console.error('[accueil] produits mis en avant indisponibles', error)
    return []
  }
}

const vitrineEnCache = lectureCatalogue('accueil-vitrine-v1', lireVitrine)

async function lireVitrine(limit: number): Promise<HomeProduct[]> {
  const choisis = await prisma.product.findMany({
    // Mise en avant éditoriale uniquement : un produit n'arrive ici que parce
    // qu'il a été coché en back-office, jamais parce qu'il se vendrait bien.
    where: { status: 'PUBLISHED', featured: true, variants: { some: { active: true } } },
    orderBy: [{ kind: 'desc' }, { createdAt: 'asc' }],
    take: limit,
    include: CARTE_VITRINE,
  })

  /*
    Le choix du back-office passe devant, et le repli complète la rangée.
    Avant, un seul produit coché suffisait à couper le repli : la vitrine de
    production n'affichait plus qu'une carte sur quatre.
  */
  const complement =
    choisis.length < limit
      ? (await echantillonParRubrique(limit)).filter(
          (produit) => !choisis.some((choisi) => choisi.id === produit.id),
        )
      : []
  const products = [...choisis, ...complement].slice(0, limit)

  return products
    .filter((product) => product.variants.length > 0)
    .map((product) => {
      const cheapest = product.variants[0]
      const cover = couverture(product.media)?.media ?? couvertureType(product)
      const category = product.categories[0]?.category
      return {
        slug: product.slug,
        name: product.name,
        tagline: product.tagline,
        fromPriceCents: cheapest.priceCents,
        hasKit: product.variants.some((variant) => variant.packaging === 'KIT'),
        // Même règle que sur les listes : la pastille « kit » ne doit pas
        // surmonter le prix d'un autre conditionnement.
        kitPriceCents: (() => {
          const kits = product.variants
            .filter((variant) => variant.packaging === 'KIT')
            .map((variant) => variant.priceCents)
          if (kits.length === 0) return null
          const moinsCher = Math.min(...kits)
          return moinsCher > cheapest.priceCents ? moinsCher : null
        })(),
        categorySlug: category?.slug ?? null,
        categoryName: category?.name ?? null,
        image: cover ? { url: cover.url, alt: cover.alt ?? product.name } : null,
      }
    })
}

/**
 * Un produit par rubrique de la vitrine, dans l'ordre des rubriques.
 *
 * Les requêtes partent ensemble plutôt qu'en file : quatre lectures d'une
 * ligne chacune, sur un index, et la page d'accueil n'attend qu'un aller-
 * retour. Une rubrique sans produit publié ne rend rien et ne bloque pas les
 * autres — la vitrine se remplit avec ce qui existe.
 *
 * Le tri est `createdAt` croissant : la première référence de la famille.
 * C'est un ordre stable et vérifiable, qui n'affirme rien sur les ventes.
 */
async function echantillonParRubrique(limit: number) {
  const rubriques = await rubriquesEnCache()
  const parRubrique = await Promise.all(
    rubriques.map((rubrique) =>
      prisma.product.findFirst({
        where: {
          status: 'PUBLISHED',
          variants: { some: { active: true } },
          /*
            La rubrique OU l'une de ses sous-familles. Les produits ne sont pas
            toujours rattachés à la racine : « Plaque & recul » n'en portait
            aucun en propre, ses références vivant dans « Feux de recul ». La
            vitrine n'affichait donc que trois cartes sur quatre en production.
            La taxonomie a deux niveaux, un seul saut de parent suffit.
          */
          categories: {
            some: {
              category: {
                published: true,
                OR: [{ slug: rubrique.slug }, { parent: { slug: rubrique.slug } }],
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        include: CARTE_VITRINE,
      }),
    ),
  )

  /*
    Dédoublonnage : un produit rattaché à deux rubriques de la vitrine
    remonterait deux fois, et la grille afficherait la même carte côte à côte.
  */
  const vus = new Set<string>()
  const retenus: NonNullable<(typeof parRubrique)[number]>[] = []

  for (const produit of parRubrique) {
    if (!produit || vus.has(produit.id)) continue
    vus.add(produit.id)
    retenus.push(produit)
    if (retenus.length === limit) break
  }

  return retenus
}

export async function getHomeFaq(limit = 4): Promise<HomeFaqItem[]> {
  try {
    return await faqEnCache(limit)
  } catch (error) {
    console.error('[accueil] FAQ indisponible', error)
    return []
  }
}

const faqEnCache = lectureCatalogue('accueil-faq-v1', (limit: number) =>
  prisma.faqItem.findMany({
    where: { published: true, scope: 'general' },
    orderBy: { position: 'asc' },
    take: limit,
    select: { question: true, answer: true },
  }),
)
