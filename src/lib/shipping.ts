import 'server-only'
import { cache } from 'react'
import { prisma } from './db'
import { lectureCatalogue } from './cache-catalogue'
import {
  buildDeliveryTeaser,
  type DeliveryTeaser,
  type ShippingOffer,
} from './delivery-teaser'

/**
 * Livraison — accès base.
 *
 * Tarifs et délais viennent de `ShippingMethod`, jamais d'une constante dans un
 * gabarit : une promesse de livraison écrite en dur sur une fiche produit est
 * une promesse que personne ne peut tenir ni corriger.
 *
 * Quand aucune méthode n'est configurée, on renvoie une liste vide et
 * l'interface n'affiche rien — plutôt qu'un « expédié sous 24 h » inventé.
 *
 * Le calcul de l'accroche vit dans `delivery-teaser.ts`, qui est pur : le bloc
 * d'achat le rejoue côté client à chaque changement de conditionnement.
 */

export type { DeliveryTeaser, ShippingOffer }

const COUNTRY = 'FR'

/**
 * Méthodes applicables à un pays, triées par position puis par prix.
 *
 * Partagée dans une même requête (`cache` de React) : une fiche produit la lit
 * pour ses métadonnées et pour sa page. Elle reste lue en direct d'une requête
 * à l'autre — le panier et le paiement facturent ce qu'elle rend.
 */
export const getShippingOffers = cache(lireOffres)

async function lireOffres(country = COUNTRY): Promise<ShippingOffer[]> {
  try {
    const methods = await prisma.shippingMethod.findMany({
      where: { active: true, zone: { countries: { has: country } } },
      orderBy: [{ position: 'asc' }, { priceCents: 'asc' }],
    })

    return methods.map((method) => ({
      code: method.code,
      label: method.label,
      carrier: method.carrier,
      priceCents: method.priceCents,
      freeFromCents: method.freeFromCents,
      minDays: method.minDays,
      maxDays: method.maxDays,
    }))
  } catch (error) {
    console.error('[livraison] méthodes indisponibles', error)
    return []
  }
}

/**
 * Les pays ouverts à la commande et leurs offres, en une seule lecture.
 *
 * Un pays est ouvert s'il appartient à une zone qui a au moins un mode actif
 * (page « Livraison » du back-office). Le tunnel de commande s'en sert pour
 * proposer les pays et, pour chacun, ses modes et ses prix. La commande, elle,
 * relit le prix du mode retenu au moment de valider (`lib/orders.ts`).
 */
export async function getOffresParPays(): Promise<Record<string, ShippingOffer[]>> {
  try {
    const zones = await prisma.shippingZone.findMany({
      include: {
        methods: {
          where: { active: true },
          orderBy: [{ position: 'asc' }, { priceCents: 'asc' }],
        },
      },
    })
    const parPays: Record<string, ShippingOffer[]> = {}
    for (const zone of zones) {
      if (zone.methods.length === 0) continue
      const offres = zone.methods.map((method) => ({
        code: method.code,
        label: method.label,
        carrier: method.carrier,
        priceCents: method.priceCents,
        freeFromCents: method.freeFromCents,
        minDays: method.minDays,
        maxDays: method.maxDays,
      }))
      for (const pays of zone.countries) parPays[pays] = [...(parPays[pays] ?? []), ...offres]
    }
    return parPays
  } catch (error) {
    console.error('[livraison] pays de livraison indisponibles', error)
    return {}
  }
}

/** Zones qui ont au moins un mode actif, avec leurs pays et leurs offres. */
export type ZoneDeLivraison = { label: string; countries: string[]; offres: ShippingOffer[] }

export async function getZonesDeLivraison(): Promise<ZoneDeLivraison[]> {
  try {
    const zones = await prisma.shippingZone.findMany({
      orderBy: [{ position: 'asc' }, { label: 'asc' }],
      include: {
        methods: {
          where: { active: true },
          orderBy: [{ position: 'asc' }, { priceCents: 'asc' }],
        },
      },
    })
    return zones
      .filter((zone) => zone.methods.length > 0 && zone.countries.length > 0)
      .map((zone) => ({
        label: zone.label,
        countries: zone.countries,
        offres: zone.methods.map((method) => ({
          code: method.code,
          label: method.label,
          carrier: method.carrier,
          priceCents: method.priceCents,
          freeFromCents: method.freeFromCents,
          minDays: method.minDays,
          maxDays: method.maxDays,
        })),
      }))
  } catch (error) {
    console.error('[livraison] zones indisponibles', error)
    return []
  }
}

/**
 * Seuil de la livraison offerte en France, pour le bandeau du site, le pied de
 * page et les CGV : le plus bas des seuils des modes actifs. Null quand aucun
 * mode n'est offert à partir d'un montant — et la mention disparaît.
 *
 * Il était écrit en dur (`commercialTerms`) : changer le seuil dans la page
 * « Livraison » aurait laissé le bandeau annoncer l'ancien. Il passe par le
 * cache partagé du catalogue, parce que l'en-tête est rendu sur chaque page ;
 * les actions de la page « Livraison » le relancent aussitôt.
 */
export async function getSeuilLivraisonOfferte(): Promise<number | null> {
  try {
    return await seuilEnCache()
  } catch (error) {
    console.error('[livraison] seuil de livraison offerte indisponible', error)
    return null
  }
}

const seuilEnCache = lectureCatalogue('livraison-seuil-v1', async () => {
  const seuils = await prisma.shippingMethod.findMany({
    where: { active: true, freeFromCents: { not: null }, zone: { countries: { has: COUNTRY } } },
    select: { freeFromCents: true },
  })
  const valeurs = seuils.map((s) => s.freeFromCents).filter((v): v is number => v !== null)
  return valeurs.length > 0 ? Math.min(...valeurs) : null
})

/** Accroche de livraison pour un sous-total donné. */
export async function getDeliveryTeaser(
  subtotalCents: number,
  country = COUNTRY,
): Promise<DeliveryTeaser | null> {
  return buildDeliveryTeaser(await getShippingOffers(country), subtotalCents)
}
