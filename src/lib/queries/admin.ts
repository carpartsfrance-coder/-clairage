import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { RESULTATS_MAX, normaliserTerme, termeSuffisant } from '../admin/produit-liens'

/**
 * Lectures du back-office.
 *
 * Ces fonctions ne portent pas de contrôle d'accès : il est fait en amont par
 * `requireStaff`, à l'entrée de chaque page et de chaque action. Les mélanger
 * ici donnerait l'illusion d'une double protection sans en être une — une
 * fonction de lecture ne sait pas si l'appelant a le droit d'appeler.
 */

const PER_PAGE = 30

/* -------------------------------------------------------------------------- */
/* Commandes                                                                  */
/* -------------------------------------------------------------------------- */

export type OrderFilters = {
  q?: string
  status?: string
  payment?: string
  fulfillment?: string
  from?: string
  to?: string
  page?: number
}

export async function listOrders(filters: OrderFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const where: Prisma.OrderWhereInput = {}

  if (filters.q) {
    const q = filters.q.trim()
    // Recherche par référence, e-mail, ou référence d'article commandé.
    where.OR = [
      { reference: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { lines: { some: { sku: { contains: q, mode: 'insensitive' } } } },
      { lines: { some: { productName: { contains: q, mode: 'insensitive' } } } },
    ]
  }
  if (filters.status) where.status = filters.status as Prisma.OrderWhereInput['status']
  if (filters.payment) where.paymentStatus = filters.payment as Prisma.OrderWhereInput['paymentStatus']
  if (filters.fulfillment) {
    where.fulfillmentStatus = filters.fulfillment as Prisma.OrderWhereInput['fulfillmentStatus']
  }
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59`) } : {}),
    }
  }

  try {
    const [total, items] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
        include: {
          lines: { where: { parentLineId: null }, select: { quantity: true } },
          user: { select: { id: true, email: true } },
        },
      }),
    ])

    return {
      items: items.map((order) => ({
        id: order.id,
        reference: order.reference,
        createdAt: order.createdAt,
        placedAt: order.placedAt,
        email: order.email,
        hasAccount: order.userId !== null,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        totalCents: order.totalCents,
        itemCount: order.lines.reduce((n, line) => n + line.quantity, 0),
      })),
      total,
      page,
      perPage: PER_PAGE,
      pageCount: Math.max(1, Math.ceil(total / PER_PAGE)),
    }
  } catch (error) {
    console.error('[admin] liste des commandes indisponible', error)
    return { items: [], total: 0, page, perPage: PER_PAGE, pageCount: 1 }
  }
}

export async function getAdminOrder(orderId: string) {
  try {
    return await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        lines: { orderBy: { id: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
        shipments: { orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { issuedAt: 'desc' } },
        // Ici on garde TOUT, y compris les notes internes : c'est le dossier
        // complet. L'espace client, lui, filtre sur actorKind.
        events: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        configuration: {
          include: {
            equipment: true,
            generation: { include: { model: { include: { make: true } } } },
          },
        },
      },
    })
  } catch (error) {
    console.error('[admin] commande indisponible', error)
    return null
  }
}

/** File de préparation : payées, non expédiées, les plus anciennes d'abord. */
export async function listToPrepare() {
  try {
    return await prisma.order.findMany({
      where: {
        paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
        fulfillmentStatus: { in: ['UNFULFILLED', 'PARTIALLY_FULFILLED'] },
        status: { not: 'CANCELLED' },
      },
      orderBy: { placedAt: 'asc' },
      include: {
        lines: {
          where: { parentLineId: null },
          orderBy: { id: 'asc' },
          include: {
            variant: {
              include: {
                components: {
                  orderBy: { position: 'asc' },
                  include: { component: { include: { product: { select: { name: true } } } } },
                },
              },
            },
          },
        },
      },
    })
  } catch (error) {
    console.error('[admin] file de préparation indisponible', error)
    return []
  }
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

export async function listCustomers(q?: string, page = 1) {
  const where: Prisma.UserWhereInput = { staffRole: null }
  if (q) {
    const term = q.trim()
    where.OR = [
      { email: { contains: term, mode: 'insensitive' } },
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
    ]
  }

  try {
    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
        include: { _count: { select: { orders: true, tickets: true } } },
      }),
    ])
    return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PER_PAGE)) }
  } catch (error) {
    console.error('[admin] liste des clients indisponible', error)
    return { items: [], total: 0, page, pageCount: 1 }
  }
}

export async function getAdminCustomer(userId: string) {
  try {
    return await prisma.user.findFirst({
      where: { id: userId, staffRole: null },
      include: {
        addresses: { orderBy: { createdAt: 'desc' } },
        orders: { orderBy: { createdAt: 'desc' }, take: 20 },
        tickets: { orderBy: { createdAt: 'desc' }, take: 20 },
        notes: { orderBy: { createdAt: 'desc' } },
        savedVehicles: {
          include: {
            configuration: {
              include: {
                equipment: true,
                generation: { include: { model: { include: { make: true } } } },
              },
            },
          },
        },
      },
    })
  } catch (error) {
    console.error('[admin] fiche client indisponible', error)
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

export type CatalogFilters = { q?: string; status?: string; stock?: string; page?: number }

export async function listAdminProducts(filters: CatalogFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const where: Prisma.ProductWhereInput = {}

  if (filters.q) {
    const q = filters.q.trim()
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
      { bulbBase: { contains: q, mode: 'insensitive' } },
      { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
    ]
  }
  if (filters.status) where.status = filters.status as Prisma.ProductWhereInput['status']

  try {
    /**
     * Le filtre de stock porte sur une valeur dérivée (`stockOnHand -
     * stockReserved`, kits exclus). L'appliquer après pagination donnerait un
     * total qui ne correspond pas à ce qu'on affiche — et le tableau de bord,
     * lui, compte sur tout le catalogue. On restreint donc d'abord l'ensemble
     * des identifiants concernés, puis on pagine dessus.
     */
    if (filters.stock === 'faible' || filters.stock === 'rupture') {
      const candidates = await prisma.product.findMany({
        where,
        select: {
          id: true,
          variants: {
            where: { components: { none: {} } },
            select: { stockOnHand: true, stockReserved: true, lowStockThreshold: true },
          },
        },
      })

      const matching = candidates
        .filter((product) => {
          const bearing = product.variants
          if (bearing.length === 0) return false
          const lowest = Math.min(
            ...bearing.map((v) => Math.max(0, v.stockOnHand - v.stockReserved)),
          )
          const threshold = Math.max(...bearing.map((v) => v.lowStockThreshold), 0)
          return filters.stock === 'rupture' ? lowest === 0 : lowest > 0 && lowest <= threshold
        })
        .map((product) => product.id)

      where.id = { in: matching }
    }

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
        include: {
          variants: {
            orderBy: { position: 'asc' },
            include: { components: { select: { id: true } } },
          },
          categories: { include: { category: { select: { name: true } } }, take: 1 },
          _count: { select: { media: true } },
        },
      }),
    ])

    const items = rows.map((product) => {
      // Un kit n'a pas de stock propre : on ne somme que les variantes qui en
      // portent un, sinon le total afficherait du vent.
      const stockBearing = product.variants.filter((v) => v.components.length === 0)
      const sellable = stockBearing.reduce(
        (sum, v) => sum + Math.max(0, v.stockOnHand - v.stockReserved),
        0,
      )
      const lowest = stockBearing.reduce(
        (min, v) => Math.min(min, Math.max(0, v.stockOnHand - v.stockReserved)),
        Number.POSITIVE_INFINITY,
      )
      const threshold = Math.max(...stockBearing.map((v) => v.lowStockThreshold), 0)
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        status: product.status,
        kind: product.kind,
        isDemo: product.isDemo,
        categoryName: product.categories[0]?.category.name ?? null,
        variantCount: product.variants.length,
        mediaCount: product._count.media,
        priceFromCents: Math.min(...product.variants.map((v) => v.priceCents)),
        sellable,
        lowest: Number.isFinite(lowest) ? lowest : 0,
        threshold,
        updatedAt: product.updatedAt,
      }
    })

    return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PER_PAGE)) }
  } catch (error) {
    console.error('[admin] catalogue indisponible', error)
    return { items: [], total: 0, page, pageCount: 1 }
  }
}

export async function getAdminProduct(productId: string) {
  try {
    return await prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: {
          orderBy: { position: 'asc' },
          include: {
            vatRate: true,
            /*
              Ce qui rattache la variante au reste de la boutique. L'écran ne
              propose la suppression que sur un conditionnement libre : une
              ligne de commande passerait à `null` (perdant la référence
              vendue) et les compatibilités seraient effacées en cascade, les
              deux sans un mot. Panier et kit, eux, sont en `Restrict` : la
              base refuserait, mais avec une erreur de contrainte qui
              n'apprend rien.
            */
            _count: { select: { orderLines: true, cartLines: true, partOfKits: true } },
            components: {
              orderBy: { position: 'asc' },
              include: { component: { include: { product: { select: { name: true } } } } },
            },
            fitments: {
              /*
                Un ordre explicite : sans lui, la liste se réordonne au gré du
                moteur entre deux affichages, et l'écran devient illisible dès
                qu'une référence équipe une trentaine de véhicules.
              */
              orderBy: [
                { configuration: { generation: { name: 'asc' } } },
                { position: { position: 'asc' } },
              ],
              include: {
                position: true,
                /*
                  Les accessoires de montage sont comptés, pas chargés :
                  l'écran n'a besoin que de dire ce qu'un retrait emporterait
                  en cascade.
                */
                _count: { select: { accessories: true } },
                configuration: {
                  include: {
                    equipment: true,
                    generation: { include: { model: { include: { make: true } } } },
                  },
                },
              },
            },
          },
        },
        categories: { include: { category: true } },
        media: {
          orderBy: { position: 'asc' },
          include: {
            /*
              Les rattachements du fichier sont comptés partout : l'écran ne
              propose de supprimer un fichier en même temps qu'on le retire de
              la fiche que s'il ne sert nulle part ailleurs. Un logo de marque
              ou une photo de génération effacé par mégarde laisserait un carré
              vide dans un menu, sans erreur ni trace.
            */
            media: {
              include: {
                _count: {
                  select: {
                    products: true,
                    categoryHeroes: true,
                    vehicleMakeLogos: true,
                    equipmentIllustrations: true,
                    vehicleGenerationPhotos: true,
                  },
                },
              },
            },
          },
        },
        specs: { orderBy: { position: 'asc' } },
        faqItems: { orderBy: { position: 'asc' } },
        /*
          Les guides rattachés, avec leur date de publication : la fiche
          publique ne montre que les guides publiés (`getProduct` les filtre),
          et l'écran doit donc pouvoir dire qu'un rattachement ne se voit pas
          encore.
        */
        guides: {
          include: { guide: { select: { id: true, slug: true, title: true, publishedAt: true } } },
        },
        /*
          Les compléments facultatifs, dans l'ordre où la fiche les propose.
          Seul `OPTIONAL_ADDON` est lu par la fiche publique : les deux autres
          types du schéma ne sont affichés nulle part, et l'écran ne les offre
          donc pas. La cible porte son statut et son nombre de références
          actives, les deux conditions qui décident si le complément se voit.
        */
        relatedFrom: {
          where: { type: 'OPTIONAL_ADDON' },
          orderBy: { position: 'asc' },
          include: {
            target: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                _count: { select: { variants: { where: { active: true } } } },
              },
            },
          },
        },
      },
    })
  } catch (error) {
    console.error('[admin] fiche produit indisponible', error)
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Liens d'une fiche produit                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mots d'un terme de recherche.
 *
 * Chercher « peugeot 208 » dans un seul champ ne trouve rien : la marque est
 * d'un côté, la génération de l'autre. Chaque mot doit donc se retrouver
 * quelque part, et tous doivent se retrouver — un terme qui ne fait
 * qu'allonger la liste n'aide personne.
 */
function mots(terme: string): string[] {
  return normaliserTerme(terme).split(' ').filter(Boolean)
}

/**
 * Produits rattachables comme compléments.
 *
 * Pourquoi une recherche plutôt qu'une liste : le catalogue compte près de dix
 * mille produits. Les charger tous dans une liste déroulante alourdirait
 * chaque affichage de la fiche, pour une liste où l'on ne trouve rien.
 *
 * Les brouillons sont proposés : un complément se prépare souvent avant sa
 * publication, et l'écran dit alors qu'il ne se voit pas encore. Les archivés
 * sont écartés : la boutique ne les sert plus.
 */
export async function chercherComplements(
  terme: string,
  options: { produitId: string; exclureIds: readonly string[] },
) {
  if (!termeSuffisant(terme)) return []

  try {
    return await prisma.product.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        id: { notIn: [options.produitId, ...options.exclureIds] },
        AND: mots(terme).map((mot) => ({
          OR: [
            { name: { contains: mot, mode: 'insensitive' as const } },
            { slug: { contains: mot, mode: 'insensitive' as const } },
            { bulbBase: { contains: mot, mode: 'insensitive' as const } },
            { variants: { some: { sku: { contains: mot, mode: 'insensitive' as const } } } },
          ],
        })),
      },
      orderBy: { name: 'asc' },
      take: RESULTATS_MAX,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        _count: { select: { variants: { where: { active: true } } } },
      },
    })
  } catch (error) {
    console.error('[admin] recherche de compléments impossible', error)
    return []
  }
}

/**
 * Références incluables dans un kit.
 *
 * Les kits sont comptés, pas écartés : un kit n'est pas incluable dans un kit
 * — son stock est calculé, donc son stock physique vaut zéro et le parent
 * passerait en rupture — mais le dire sur la ligne vaut mieux que de faire
 * disparaître la référence que l'exploitant cherche.
 *
 * Les références désactivées sont écartées : elles ne se vendent plus, mais
 * surtout leur stock n'est plus tenu, et c'est lui qui ferait le stock du kit.
 */
export async function chercherVariantes(
  terme: string,
  options: { varianteId?: string; exclureIds: readonly string[] },
) {
  if (!termeSuffisant(terme)) return []

  /*
    `varianteId` est la référence qui cherche — un kit ne se contient pas
    lui-même. L'écran Véhicules n'a pas de « soi » à exclure : il part d'un
    véhicule, pas d'une référence.
  */
  const exclus = [...(options.varianteId ? [options.varianteId] : []), ...options.exclureIds]

  try {
    return await prisma.productVariant.findMany({
      where: {
        active: true,
        id: { notIn: exclus },
        product: { status: { not: 'ARCHIVED' } },
        AND: mots(terme).map((mot) => ({
          OR: [
            { sku: { contains: mot, mode: 'insensitive' as const } },
            { name: { contains: mot, mode: 'insensitive' as const } },
            { product: { name: { contains: mot, mode: 'insensitive' as const } } },
          ],
        })),
      },
      orderBy: [{ product: { name: 'asc' } }, { position: 'asc' }],
      take: RESULTATS_MAX,
      select: {
        id: true,
        sku: true,
        name: true,
        stockOnHand: true,
        stockReserved: true,
        product: { select: { name: true, status: true } },
        _count: { select: { components: true } },
      },
    })
  } catch (error) {
    console.error('[admin] recherche de références impossible', error)
    return []
  }
}

/**
 * Configurations véhicule, cherchées par marque, modèle, génération,
 * équipement ou référence de bloc optique.
 *
 * Les configurations désactivées sont proposées, avec leur état : le parcours
 * public les ignore, mais documenter une compatibilité avant de rouvrir une
 * configuration est un travail légitime. L'écran le signale sur la ligne.
 */
export async function chercherConfigurations(terme: string) {
  if (!termeSuffisant(terme)) return []

  try {
    return await prisma.vehicleConfiguration.findMany({
      where: {
        AND: mots(terme).map((mot) => ({
          OR: [
            { headlampRef: { contains: mot, mode: 'insensitive' as const } },
            { label: { contains: mot, mode: 'insensitive' as const } },
            { equipment: { label: { contains: mot, mode: 'insensitive' as const } } },
            { generation: { name: { contains: mot, mode: 'insensitive' as const } } },
            { generation: { model: { name: { contains: mot, mode: 'insensitive' as const } } } },
            {
              generation: {
                model: { make: { name: { contains: mot, mode: 'insensitive' as const } } },
              },
            },
          ],
        })),
      },
      orderBy: [{ generation: { name: 'asc' } }, { headlampRef: 'asc' }],
      take: RESULTATS_MAX,
      select: {
        id: true,
        headlampRef: true,
        label: true,
        active: true,
        equipment: { select: { label: true } },
        generation: {
          select: {
            name: true,
            yearFrom: true,
            yearTo: true,
            model: { select: { name: true, make: { select: { name: true } } } },
          },
        },
      },
    })
  } catch (error) {
    console.error('[admin] recherche de configurations impossible', error)
    return []
  }
}

/* -------------------------------------------------------------------------- */
/* Véhicules et compatibilités                                                */
/* -------------------------------------------------------------------------- */

/**
 * Référentiel véhicule complet, pour l'écran d'administration.
 *
 * Les compatibilités sont comptées à chaque étage, et pas seulement les
 * configurations : c'est ce décompte qui décide si une marque, un modèle ou
 * une génération peut être supprimée ou seulement désactivée. Le faire ici,
 * en une requête, évite que l'écran pose la question ligne par ligne.
 */
export async function listVehicleMakes() {
  try {
    return await prisma.vehicleMake.findMany({
      orderBy: [{ type: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      include: {
        // Le logo tel que le site public l'affichera : l'écran en montre
        // l'aperçu, monogramme de repli compris.
        logo: { select: { id: true, url: true, alt: true } },
        _count: { select: { models: true } },
        models: {
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { generations: true } },
            generations: {
              orderBy: { yearFrom: 'desc' },
              include: {
                _count: { select: { configurations: true } },
                configurations: {
                  select: { active: true, _count: { select: { fitments: true } } },
                },
              },
            },
          },
        },
      },
    })
  } catch (error) {
    console.error('[admin] véhicules indisponibles', error)
    return []
  }
}

/**
 * Une génération avec ses configurations et leurs compatibilités.
 *
 * Tout l'écran de saisie tient dans cette lecture : la génération et son
 * contexte (pour afficher l'adresse publique exacte), les configurations avec
 * leur équipement d'origine et leur finition, puis chaque compatibilité avec
 * son emplacement, sa référence et ses accessoires exigés.
 */
export async function getAdminGeneration(generationId: string) {
  try {
    return await prisma.vehicleGeneration.findUnique({
      where: { id: generationId },
      include: {
        model: { include: { make: true } },
        configurations: {
          orderBy: [{ equipment: { position: 'asc' } }],
          include: {
            equipment: true,
            trim: true,
            _count: { select: { savedVehicles: true, carts: true, orders: true } },
            fitments: {
              orderBy: [{ position: { position: 'asc' } }],
              include: {
                position: true,
                variant: {
                  include: { product: { select: { name: true, slug: true, status: true } } },
                },
                accessories: {
                  orderBy: { required: 'desc' },
                  include: { variant: { include: { product: { select: { name: true } } } } },
                },
              },
            },
          },
        },
      },
    })
  } catch (error) {
    console.error('[admin] génération indisponible', error)
    return null
  }
}

/**
 * Médias sélectionnables comme logo de marque.
 *
 * Aucun téléversement ici : les médias se déposent dans `/admin/medias`, et
 * cet écran ne fait que choisir parmi ceux qui existent. Les deux écrans
 * resteraient à maintenir pour un seul geste.
 */
export async function listMediaOptions() {
  try {
    return await prisma.media.findMany({
      where: { mimeType: { startsWith: 'image/' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, alt: true, caption: true, storageKey: true },
    })
  } catch (error) {
    console.error('[admin] médias indisponibles', error)
    return []
  }
}

/**
 * Images rattachables à une fiche produit : celles qui n'y sont pas déjà.
 *
 * Plafonnée, et volontairement : l'écran propose de **reprendre** un visuel
 * déjà téléversé — un schéma de brochage, un comparatif de teintes — pas de
 * parcourir toute la médiathèque. Au-delà de quelques dizaines de vignettes,
 * une grille devient moins rapide que le dépôt d'un fichier, et la médiathèque
 * a son écran avec recherche et pagination.
 *
 * Les PDF sont écartés : une galerie n'affiche que des images.
 */
export async function listAttachableMedia(productId: string, limit = 48) {
  try {
    return await prisma.media.findMany({
      where: {
        mimeType: { startsWith: 'image/' },
        products: { none: { productId } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, url: true, alt: true, caption: true, nature: true, storageKey: true },
    })
  } catch (error) {
    console.error('[admin] médias rattachables indisponibles', error)
    return []
  }
}

/** Équipements d'origine disponibles, pour les listes déroulantes. */
export async function listLightingEquipments() {
  try {
    return await prisma.lightingEquipment.findMany({ orderBy: { position: 'asc' } })
  } catch (error) {
    console.error('[admin] équipements indisponibles', error)
    return []
  }
}

/** Emplacements lumineux disponibles, pour les listes déroulantes. */
export async function listLightPositions() {
  try {
    return await prisma.lightPosition.findMany({ orderBy: { position: 'asc' } })
  } catch (error) {
    console.error('[admin] emplacements indisponibles', error)
    return []
  }
}

/**
 * Existe-t-il seulement une référence à rattacher ?
 *
 * Cette fonction remplace une liste de toutes les références sélectionnables :
 * le catalogue en compte 9 905, et les charger pour remplir une liste
 * déroulante pesait sur chaque affichage de l'écran Véhicules — pour une liste
 * dans laquelle, de toute façon, on ne trouve rien. Les références se
 * cherchent maintenant (`chercherVariantes`), et il ne reste à savoir qu'une
 * chose : si le catalogue est vide, l'écran le dit au lieu d'ouvrir une
 * recherche qui ne rendra jamais rien.
 */
export async function existeDesReferences(): Promise<boolean> {
  try {
    const une = await prisma.productVariant.findFirst({
      where: { active: true, product: { status: { not: 'ARCHIVED' } } },
      select: { id: true },
    })
    return une !== null
  } catch (error) {
    console.error('[admin] références indisponibles', error)
    // Dans le doute on n'annonce pas un catalogue vide : le message serait faux
    // et détournerait du vrai problème, qui est la base injoignable.
    return true
  }
}

/* -------------------------------------------------------------------------- */
/* SAV                                                                        */
/* -------------------------------------------------------------------------- */

export async function listTickets(status?: string) {
  try {
    return await prisma.supportTicket.findMany({
      where: status
        ? { status: status as Prisma.SupportTicketWhereInput['status'] }
        : { status: { notIn: ['CLOSED', 'REJECTED'] } },
      orderBy: { createdAt: 'asc' },
      include: {
        order: { select: { id: true, reference: true, totalCents: true } },
        _count: { select: { messages: true } },
      },
    })
  } catch (error) {
    console.error('[admin] demandes SAV indisponibles', error)
    return []
  }
}

export async function getAdminTicket(ticketId: string) {
  try {
    return await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        order: { include: { lines: { where: { parentLineId: null } } } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    })
  } catch (error) {
    console.error('[admin] dossier SAV indisponible', error)
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Promotions et paramètres                                                   */
/* -------------------------------------------------------------------------- */

export async function listPromotions() {
  try {
    return await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } })
  } catch (error) {
    console.error('[admin] promotions indisponibles', error)
    return []
  }
}

export async function listSettings() {
  try {
    return await prisma.setting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] })
  } catch (error) {
    console.error('[admin] paramètres indisponibles', error)
    return []
  }
}

export async function listStaff() {
  try {
    return await prisma.user.findMany({
      where: { staffRole: { not: null } },
      orderBy: { email: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        staffRole: true,
        active: true,
        lastLoginAt: true,
      },
    })
  } catch (error) {
    console.error('[admin] équipe indisponible', error)
    return []
  }
}

/** Journal des actions d'administration, le plus récent d'abord. */
export async function listAuditLog(limit = 50) {
  try {
    return await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { email: true, firstName: true, lastName: true } } },
    })
  } catch (error) {
    console.error('[admin] journal indisponible', error)
    return []
  }
}

/* -------------------------------------------------------------------------- */
/* Médias                                                                     */
/* -------------------------------------------------------------------------- */

export type MediaFilters = { q?: string; nature?: string; page?: number }

/**
 * Médiathèque.
 *
 * Le nombre de rattachements est compté et renvoyé, pas seulement pour
 * l'affichage : c'est lui qui décide si la suppression est proposée. Un média
 * encore utilisé par une fiche ne doit pas pouvoir partir d'un clic.
 */
export async function listMedia(filters: MediaFilters) {
  const where: Prisma.MediaWhereInput = {}

  if (filters.q) {
    where.OR = [
      { alt: { contains: filters.q, mode: 'insensitive' } },
      { caption: { contains: filters.q, mode: 'insensitive' } },
      { storageKey: { contains: filters.q, mode: 'insensitive' } },
    ]
  }
  if (filters.nature) {
    where.nature = filters.nature as Prisma.MediaWhereInput['nature']
  }

  const page = Math.max(1, filters.page ?? 1)

  const [total, rows, byNature] = await Promise.all([
    prisma.media.count({ where }),
    prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { _count: { select: { products: true, categoryHeroes: true } } },
    }),
    prisma.media.groupBy({ by: ['nature'], _count: { _all: true } }),
  ])

  return {
    items: rows.map((media) => ({
      id: media.id,
      url: media.url,
      storageKey: media.storageKey,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      alt: media.alt,
      caption: media.caption,
      nature: media.nature,
      isDemo: media.isDemo,
      createdAt: media.createdAt,
      uses: media._count.products + media._count.categoryHeroes,
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PER_PAGE)),
    counts: Object.fromEntries(byNature.map((row) => [row.nature, row._count._all])) as Record<
      string,
      number
    >,
    /** Combien de visuels n'ont pas de texte alternatif, tous filtres confondus. */
    missingAlt: await prisma.media.count({ where: { OR: [{ alt: null }, { alt: '' }] } }),
  }
}

/**
 * Rubriques proposées au choix, avec leur chemin complet.
 *
 * Le chemin n'est pas décoratif : une liste à plat de noms rendrait « Phares
 * LED » et « Phares LED » — sous deux parents différents — indiscernables, et
 * un produit rangé dans la mauvaise n'apparaît pas où on le cherche.
 */
export async function listCategoryOptions() {
  const categories = await prisma.category.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, parent: { select: { name: true } } },
  })
  return categories.map((categorie) => ({
    id: categorie.id,
    name: categorie.name,
    path: categorie.parent ? `${categorie.parent.name} › ${categorie.name}` : categorie.name,
  }))
}

/**
 * Taux de TVA disponibles, le taux par défaut en tête.
 *
 * La liste peut être vide : rien dans l'application ne crée un taux, ils
 * viennent de `prisma/seed.ts`. L'écran doit le dire plutôt que d'afficher une
 * liste déroulante vide, puisque sans taux aucune variante ne s'enregistre et
 * aucune fiche ne se publie.
 */
export async function listVatRates() {
  return await prisma.vatRate.findMany({
    orderBy: [{ isDefault: 'desc' }, { rateBp: 'desc' }],
    select: { id: true, label: true, rateBp: true, isDefault: true },
  })
}

/**
 * Guides de montage proposés au rattachement, les publiés en tête.
 *
 * Comme les taux de TVA, les guides ne se créent nulle part dans
 * l'application : ils viennent du jeu de données. La liste peut donc être
 * vide, et l'écran doit le dire au lieu d'ouvrir une liste déroulante sans
 * aucun choix.
 *
 * Les non publiés sont proposés quand même — on prépare souvent le
 * rattachement avant la mise en ligne du guide — mais ils sont signalés comme
 * tels, parce que la fiche ne les affichera pas.
 */
export async function listGuideOptions() {
  return await prisma.guide.findMany({
    orderBy: [{ publishedAt: 'desc' }, { title: 'asc' }],
    select: { id: true, title: true, slug: true, publishedAt: true, difficulty: true },
  })
}
