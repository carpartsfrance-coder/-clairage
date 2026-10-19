import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'

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
            components: {
              orderBy: { position: 'asc' },
              include: { component: { include: { product: { select: { name: true } } } } },
            },
            fitments: {
              include: {
                position: true,
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
        media: { include: { media: true }, orderBy: { position: 'asc' } },
        specs: { orderBy: { position: 'asc' } },
      },
    })
  } catch (error) {
    console.error('[admin] fiche produit indisponible', error)
    return null
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
 * Références sélectionnables dans une compatibilité.
 *
 * Les brouillons sont inclus, avec leur statut : documenter la compatibilité
 * d'un produit avant de le publier est l'ordre normal du travail. Les
 * variantes désactivées sont écartées — les rattacher créerait une ligne que
 * le site public ignore de toute façon.
 */
export async function listVariantOptions() {
  try {
    return await prisma.productVariant.findMany({
      where: { active: true, product: { status: { not: 'ARCHIVED' } } },
      orderBy: [{ product: { name: 'asc' } }, { position: 'asc' }],
      select: {
        id: true,
        sku: true,
        name: true,
        product: { select: { name: true, status: true } },
      },
    })
  } catch (error) {
    console.error('[admin] références indisponibles', error)
    return []
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
