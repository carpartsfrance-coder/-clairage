import 'server-only'
import { prisma } from '../db'

/**
 * Lectures de l'espace client.
 *
 * Chaque fonction prend l'identifiant de l'utilisateur et le pose dans le
 * `where`. Le filtre est donc dans la requête, pas dans la page : aucune vue ne
 * peut oublier de l'appliquer, et une erreur de gabarit ne peut pas exposer la
 * commande d'un autre.
 *
 * Note sur les commandes invité : elles ne sont PAS rattachées automatiquement
 * par correspondance d'adresse e-mail. Tant que les adresses ne sont pas
 * vérifiées, s'inscrire avec l'adresse d'un autre suffirait à lire ses
 * commandes. Le rattachement se fait explicitement, en fournissant la référence
 * — voir `attachGuestOrder`.
 */

export type AccountOrderSummary = {
  id: string
  reference: string
  placedAt: Date | null
  createdAt: Date
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  totalCents: number
  itemCount: number
  /** Première vignette, pour repérer la commande d'un coup d'œil. */
  image: { url: string; alt: string } | null
}

export async function getMyOrders(userId: string): Promise<AccountOrderSummary[]> {
  try {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        lines: {
          where: { parentLineId: null },
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    media: {
                      where: { role: 'PRODUCT' },
                      orderBy: { position: 'asc' },
                      take: 1,
                      include: { media: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    return orders.map((order) => {
      const cover = order.lines[0]?.variant?.product.media[0]?.media
      return {
        id: order.id,
        reference: order.reference,
        placedAt: order.placedAt,
        createdAt: order.createdAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        totalCents: order.totalCents,
        itemCount: order.lines.reduce((n, line) => n + line.quantity, 0),
        image: cover
          ? { url: cover.url, alt: cover.alt ?? order.lines[0]?.productName ?? '' }
          : null,
      }
    })
  } catch (error) {
    console.error('[compte] commandes indisponibles', error)
    return []
  }
}

/** Détail d'une commande — renvoie null si elle n'appartient pas au client. */
export async function getMyOrder(userId: string, orderId: string) {
  try {
    return await prisma.order.findFirst({
      // `userId` est dans le where, pas vérifié après coup : une commande qui
      // n'est pas la sienne n'est jamais chargée.
      where: { id: orderId, userId },
      include: {
        lines: { orderBy: { id: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        shipments: { orderBy: { createdAt: 'desc' } },
        documents: { orderBy: { issuedAt: 'desc' } },
        events: { where: { actorKind: { not: 'staff' } }, orderBy: { createdAt: 'asc' } },
      },
    })
  } catch (error) {
    console.error('[compte] commande indisponible', error)
    return null
  }
}

export async function getMyAddresses(userId: string) {
  try {
    return await prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefaultShipping: 'desc' }, { createdAt: 'desc' }],
    })
  } catch (error) {
    console.error('[compte] adresses indisponibles', error)
    return []
  }
}

export type SavedVehicleView = {
  id: string
  configurationId: string
  nickname: string | null
  plate: string | null
  isPrimary: boolean
  label: string
  equipmentLabel: string
  type: 'CAR' | 'MOTORCYCLE'
}

export async function getMySavedVehicles(userId: string): Promise<SavedVehicleView[]> {
  try {
    const rows = await prisma.savedVehicle.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      include: {
        configuration: {
          include: {
            equipment: true,
            trim: true,
            generation: { include: { model: { include: { make: true } } } },
          },
        },
      },
    })

    return rows.map((row) => {
      const { generation } = row.configuration
      const years = generation.yearTo
        ? `${generation.yearFrom}–${generation.yearTo}`
        : `depuis ${generation.yearFrom}`
      return {
        id: row.id,
        configurationId: row.configurationId,
        nickname: row.nickname,
        plate: row.plate,
        isPrimary: row.isPrimary,
        label: `${generation.model.make.name} ${generation.name} · ${years}`,
        equipmentLabel: row.configuration.equipment.label,
        type: generation.model.make.type === 'MOTORCYCLE' ? 'MOTORCYCLE' : 'CAR',
      }
    })
  } catch (error) {
    console.error('[compte] véhicules indisponibles', error)
    return []
  }
}

/** Compteurs du tableau de bord du compte. */
export async function getAccountOverview(userId: string) {
  try {
    const [orders, addresses, vehicles, openTickets] = await Promise.all([
      prisma.order.count({ where: { userId } }),
      prisma.address.count({ where: { userId } }),
      prisma.savedVehicle.count({ where: { userId } }),
      prisma.supportTicket.count({
        where: { userId, status: { notIn: ['CLOSED', 'REJECTED'] } },
      }),
    ])
    return { orders, addresses, vehicles, openTickets }
  } catch (error) {
    console.error('[compte] synthèse indisponible', error)
    return { orders: 0, addresses: 0, vehicles: 0, openTickets: 0 }
  }
}
