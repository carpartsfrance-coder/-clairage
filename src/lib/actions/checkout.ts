'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { CART_COOKIE, VEHICLE_COOKIE } from '../session'
import { placeOrder } from '../orders'
import { getCurrentUser } from '../auth/session'
import { siteConfig } from '../identity'

/**
 * Soumission du tunnel de commande.
 *
 * Le formulaire ne transmet ni prix, ni total, ni frais de port : uniquement
 * des coordonnées, des adresses et un code de mode de livraison. Tout le reste
 * est relu en base par `placeOrder`.
 */

const addressSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(80),
  lastName: z.string().trim().min(1, 'Nom requis').max(80),
  company: z.string().trim().max(120).optional().nullable(),
  line1: z.string().trim().min(1, 'Adresse requise').max(160),
  line2: z.string().trim().max(160).optional().nullable(),
  postalCode: z.string().trim().min(4, 'Code postal requis').max(12),
  city: z.string().trim().min(1, 'Ville requise').max(80),
  country: z.string().trim().length(2).default('FR'),
  phone: z.string().trim().max(32).optional().nullable(),
})

const orderSchema = z.object({
  email: z.string().trim().email('Adresse e-mail invalide'),
  phone: z.string().trim().max(32).optional().nullable(),
  shipping: addressSchema,
  billingSameAsShipping: z.boolean(),
  billing: addressSchema.optional(),
  shippingMethodCode: z.string().trim().min(1, 'Choisissez un mode de livraison'),
  acceptTerms: z.literal(true, { message: 'Les conditions de vente doivent être acceptées' }),
  acceptNewsletter: z.boolean().default(false),
})

export type CheckoutState = {
  error?: string
  /** Erreurs par champ, pour les afficher à côté du champ concerné. */
  fieldErrors?: Record<string, string>
}

function address(formData: FormData, prefix: string) {
  const value = (name: string) => {
    const raw = formData.get(`${prefix}.${name}`)
    return typeof raw === 'string' ? raw : ''
  }
  return {
    firstName: value('firstName'),
    lastName: value('lastName'),
    company: value('company') || null,
    line1: value('line1'),
    line2: value('line2') || null,
    postalCode: value('postalCode'),
    city: value('city'),
    country: value('country') || 'FR',
    phone: value('phone') || null,
  }
}

export async function submitOrder(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const store = await cookies()
  const cartToken = store.get(CART_COOKIE)?.value
  if (!cartToken) return { error: 'Votre panier est vide.' }

  const billingSame = formData.get('billingSameAsShipping') === 'on'
  const shipping = address(formData, 'shipping')

  const parsed = orderSchema.safeParse({
    email: formData.get('email'),
    phone: formData.get('phone') || null,
    shipping,
    billingSameAsShipping: billingSame,
    billing: billingSame ? undefined : address(formData, 'billing'),
    shippingMethodCode: formData.get('shippingMethodCode'),
    acceptTerms: formData.get('acceptTerms') === 'on',
    acceptNewsletter: formData.get('acceptNewsletter') === 'on',
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.')] = issue.message
    }
    return { error: 'Certaines informations sont incomplètes.', fieldErrors }
  }

  const data = parsed.data

  // L'origine vient de l'en-tête de la requête : les URL de retour du
  // prestataire doivent pointer sur le domaine réellement servi, pas sur une
  // constante qui divergerait entre préproduction et production.
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http'
  const origin = host ? `${protocol}://${host}` : siteConfig.url

  // Une commande passée en étant connecté appartient au compte : elle doit
  // apparaître dans l'espace client sans rattachement manuel.
  const user = await getCurrentUser()

  const result = await placeOrder({
    cartToken,
    userId: user?.id ?? null,
    email: data.email,
    phone: data.phone ?? null,
    shippingAddress: data.shipping,
    billingAddress: data.billingSameAsShipping ? data.shipping : data.billing!,
    shippingMethodCode: data.shippingMethodCode,
    consents: {
      cgv: data.acceptTerms,
      newsletter: data.acceptNewsletter,
    },
    configurationId: store.get(VEHICLE_COOKIE)?.value ?? null,
    origin,
  })

  if (!result.ok) return { error: result.error }

  // `redirect` lève : il doit rester hors de tout try/catch de cette fonction.
  redirect(result.redirectUrl)
}
