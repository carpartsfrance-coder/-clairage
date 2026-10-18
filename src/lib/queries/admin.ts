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

    let items = rows.map((product) => {
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

    // Les filtres de stock portent sur une valeur dérivée : ils s'appliquent
    // après lecture, sur la page courante, et la page le dit à l'écran.
    if (filters.stock === 'rupture') items = items.filter((p) => p.lowest === 0)
    if (filters.stock === 'faible') {
      items = items.filter((p) => p.lowest > 0 && p.lowest <= p.threshold)
    }

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

export async function listVehicleMakes() {
  try {
    return await prisma.vehicleMake.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { models: true } },
        models: {
          orderBy: { name: 'asc' },
          include: {
            generations: {
              orderBy: { yearFrom: 'desc' },
              include: { _count: { select: { configurations: true } } },
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

/** Compatibilités d'une configuration, pour l'écran de saisie. */
export async function listFitments(configurationId: string) {
  try {
    return await prisma.fitment.findMany({
      where: { configurationId },
      orderBy: [{ position: { position: 'asc' } }],
      include: {
        position: true,
        variant: { include: { product: { select: { name: true, slug: true } } } },
        accessories: {
          include: { variant: { include: { product: { select: { name: true } } } } },
        },
      },
    })
  } catch (error) {
    console.error('[admin] compatibilités indisponibles', error)
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
