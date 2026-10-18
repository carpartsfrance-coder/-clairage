'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { submitOrder, type CheckoutState } from '@/lib/actions/checkout'
import { formatPrice } from '@/lib/identity'
import { Button } from '@/components/ui/Button'
import { Alert, Card } from '@/components/ui/Surface'
import { SelectField, TextField } from '@/components/ui/Field'
import { cn } from '@/lib/cn'

/* --------------------------------------------------------------------------
   Formulaire de commande
   --------------------------------------------------------------------------
   Ce composant est client pour deux raisons, et deux seulement : l'état du
   basculement « facturation différente », et le mode de livraison retenu — dont
   dépend le total affiché dans le récapitulatif.

   Tout ce qui est affiché vient du serveur (prix des articles, prix réellement
   appliqué à chaque mode de livraison, franchise de port comprise). Le total
   calculé ici n'est qu'un affichage : `placeOrder` relit les prix en base au
   moment de valider, et c'est ce total-là qui est encaissé.

   Aucune donnée de carte bancaire n'entre dans ce formulaire : le paiement a
   lieu chez le prestataire, après la redirection.
   -------------------------------------------------------------------------- */

export type CheckoutLineView = {
  id: string
  productName: string
  variantName: string
  quantity: number
  lineTotalCents: number
}

export type CheckoutShippingOption = {
  code: string
  label: string
  carrier: string | null
  /** Prix réellement appliqué à ce sous-total (franchise de port comprise). */
  effectivePriceCents: number
  minDays: number | null
  maxDays: number | null
}

type Props = {
  /** Compte connecté, quand il y en a un. La commande lui sera rattachée. */
  account: { email: string; firstName: string | null; lastName: string | null } | null
  lines: CheckoutLineView[]
  subtotalCents: number
  /** TVA contenue dans le sous-total des articles (les prix sont TTC). */
  vatCents: number
  shippingOptions: CheckoutShippingOption[]
  /** Vrai quand aucun prestataire n'est configuré : il faut le dire au client. */
  paymentSimulated: boolean
}

/**
 * « Estimation 2 à 3 jours ouvrés ». Les deux bornes doivent être saisies,
 * sinon rien. Le mot « estimation » n'est pas décoratif : les délais viennent
 * du transporteur et ne sont pas garantis — c'est aussi la graphie retenue par
 * `delivery-teaser`, et les deux doivent dire la même chose.
 */
function delayLabel(option: CheckoutShippingOption): string | null {
  if (option.minDays === null || option.maxDays === null) return null
  return option.minDays === option.maxDays
    ? `Estimation ${option.minDays} jours ouvrés`
    : `Estimation ${option.minDays} à ${option.maxDays} jours ouvrés`
}

const legendClass = 'text-lg font-bold'
const fieldsetClass = 'border-0 p-0'

/**
 * Bloc d'adresse, utilisé pour la livraison et pour la facturation.
 * Le préfixe sert à la fois de nom de champ (`shipping.city`) et de clé
 * d'erreur renvoyée par l'action — les deux doivent rester alignés.
 */
function AddressFields({
  prefix,
  fieldErrors,
}: {
  prefix: 'shipping' | 'billing'
  fieldErrors: Record<string, string> | undefined
}) {
  const error = (name: string) => fieldErrors?.[`${prefix}.${name}`]
  const id = (name: string) => `${prefix}-${name}`
  // Les jetons `shipping` / `billing` de autocomplete évitent que le
  // navigateur remplisse les deux adresses avec la même valeur.
  const auto = (token: string) => `${prefix} ${token}`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          id={id('firstName')}
          name={`${prefix}.firstName`}
          label="Prénom"
          required
          autoComplete={auto('given-name')}
          error={error('firstName')}
        />
        <TextField
          id={id('lastName')}
          name={`${prefix}.lastName`}
          label="Nom"
          required
          autoComplete={auto('family-name')}
          error={error('lastName')}
        />
      </div>

      <TextField
        id={id('company')}
        name={`${prefix}.company`}
        label="Société"
        hint="Facultatif"
        autoComplete={auto('organization')}
        error={error('company')}
      />

      <TextField
        id={id('line1')}
        name={`${prefix}.line1`}
        label="Adresse"
        required
        autoComplete={auto('address-line1')}
        error={error('line1')}
      />

      <TextField
        id={id('line2')}
        name={`${prefix}.line2`}
        label="Complément d'adresse"
        hint="Facultatif — bâtiment, étage, code d'accès"
        autoComplete={auto('address-line2')}
        error={error('line2')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField
          id={id('postalCode')}
          name={`${prefix}.postalCode`}
          label="Code postal"
          required
          inputMode="numeric"
          autoComplete={auto('postal-code')}
          error={error('postalCode')}
        />
        <TextField
          id={id('city')}
          name={`${prefix}.city`}
          label="Ville"
          required
          autoComplete={auto('address-level2')}
          error={error('city')}
        />
      </div>

      {/*
        Une seule option : la France est la seule zone de livraison configurée.
        Le champ reste un select pour que l'ajout d'une zone côté admin n'oblige
        pas à retoucher le formulaire, et pour que le pays envoyé soit explicite.
      */}
      <SelectField
        id={id('country')}
        name={`${prefix}.country`}
        label="Pays"
        defaultValue="FR"
        hint="Seule zone de livraison configurée à ce jour."
        autoComplete={auto('country')}
        error={error('country')}
        wrapperClassName="sm:max-w-xs"
      >
        <option value="FR">France</option>
      </SelectField>
    </div>
  )
}

export function CheckoutForm({
  account,
  lines,
  subtotalCents,
  vatCents,
  shippingOptions,
  paymentSimulated,
}: Props) {
  const [state, formAction, pending] = useActionState<CheckoutState, FormData>(submitOrder, {})

  const [billingSame, setBillingSame] = useState(true)
  const [methodCode, setMethodCode] = useState(shippingOptions[0]?.code ?? '')

  const fieldErrors = state.fieldErrors
  const selected = shippingOptions.find((option) => option.code === methodCode) ?? null
  const shippingCents = selected?.effectivePriceCents ?? 0
  const totalCents = subtotalCents + shippingCents
  const noShipping = shippingOptions.length === 0

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      {/* -------------------------------------------------------------------
          Saisie
          ------------------------------------------------------------------- */}
      <section aria-labelledby="commande-informations" className="min-w-0 flex-1">
        <h2 id="commande-informations" className="sr-only">
          Vos informations
        </h2>

        <form action={formAction} className="flex flex-col gap-8">
          {/*
            Pas de titre en dur dans ce bandeau. Il a longtemps affirmé « Votre
            commande n'a pas été enregistrée », y compris quand le message juste
            en dessous disait le contraire — deux phrases contradictoires au
            même endroit. C'est l'action qui sait ce qui s'est passé : on
            affiche son message, et lui seul.
          */}
          {state.error ? (
            <Alert tone="danger" live="assertive">
              {state.error}
            </Alert>
          ) : null}

          {/* 1. Coordonnées --------------------------------------------- */}
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>Coordonnées</legend>

            {/*
              Dire à qui la commande sera rattachée. Sans cette ligne, un client
              connecté voyait un champ vide, pouvait saisir une autre adresse, et
              la commande partait sur son compte avec un contact différent — sans
              que rien ne le signale.
            */}
            {account ? (
              <p className="mt-2 text-sm text-muted-strong">
                Connecté avec <strong className="text-slate-ink">{account.email}</strong> : cette
                commande sera rattachée à ce compte et visible dans votre espace client. Vous
                pouvez indiquer une autre adresse de contact ci-dessous si la confirmation doit
                partir ailleurs.
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-4">
              <TextField
                id="email"
                name="email"
                type="email"
                label="Adresse e-mail"
                required
                autoComplete="email"
                defaultValue={account?.email ?? ''}
                hint="Sert à l'envoi de la confirmation et du suivi de commande."
                error={fieldErrors?.email}
              />
              <TextField
                id="phone"
                name="phone"
                type="tel"
                label="Téléphone"
                autoComplete="tel"
                hint="Facultatif — utilisé uniquement en cas de problème sur la livraison"
                error={fieldErrors?.phone}
              />
            </div>
          </fieldset>

          {/* 2. Adresse de livraison ------------------------------------ */}
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>Adresse de livraison</legend>
            <div className="mt-4">
              <AddressFields prefix="shipping" fieldErrors={fieldErrors} />
            </div>
          </fieldset>

          {/* 3. Facturation --------------------------------------------- */}
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>Facturation</legend>

            <label
              htmlFor="billingSameAsShipping"
              className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-[0.95rem]"
            >
              <input
                id="billingSameAsShipping"
                name="billingSameAsShipping"
                type="checkbox"
                checked={billingSame}
                onChange={(event) => setBillingSame(event.target.checked)}
                className="size-5 shrink-0 accent-brand"
              />
              <span>L&apos;adresse de facturation est identique</span>
            </label>

            {billingSame ? null : (
              <div className="mt-4">
                <AddressFields prefix="billing" fieldErrors={fieldErrors} />
              </div>
            )}
          </fieldset>

          {/* 4. Livraison ------------------------------------------------ */}
          <fieldset className={fieldsetClass}>
            <legend className={legendClass}>Livraison</legend>

            {noShipping ? (
              <Alert tone="warn" title="Aucun mode de livraison configuré" className="mt-4">
                Aucun mode de livraison n&apos;est configuré pour cette adresse. Contactez
                l&apos;équipe pour finaliser cette commande.
              </Alert>
            ) : (
              <div
                role="radiogroup"
                aria-labelledby="commande-livraison-choix"
                aria-invalid={fieldErrors?.shippingMethodCode ? true : undefined}
                aria-describedby={
                  fieldErrors?.shippingMethodCode ? 'commande-livraison-erreur' : undefined
                }
                className="mt-4 flex flex-col gap-3"
              >
                <p id="commande-livraison-choix" className="sr-only">
                  Mode de livraison
                </p>
                {shippingOptions.map((option) => {
                  const delay = delayLabel(option)
                  const active = option.code === methodCode
                  return (
                    <label
                      key={option.code}
                      className={cn(
                        'flex min-h-14 cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors',
                        active
                          ? 'border-brand bg-brand-soft'
                          : 'border-line-strong bg-white hover:border-slate-ink',
                      )}
                    >
                      <input
                        type="radio"
                        name="shippingMethodCode"
                        value={option.code}
                        checked={active}
                        onChange={() => setMethodCode(option.code)}
                        className="mt-1 size-5 shrink-0 accent-brand"
                      />
                      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="min-w-0">
                          <span className="block font-semibold">{option.label}</span>
                          {option.carrier ? (
                            <span className="block text-sm text-muted">{option.carrier}</span>
                          ) : null}
                          {delay ? (
                            <span className="block text-sm text-muted-strong">{delay}</span>
                          ) : null}
                        </span>
                        <span className="font-semibold">
                          {option.effectivePriceCents === 0
                            ? 'Offerte'
                            : formatPrice(option.effectivePriceCents)}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            {fieldErrors?.shippingMethodCode ? (
              <p id="commande-livraison-erreur" className="mt-2 text-xs font-medium text-danger">
                {fieldErrors.shippingMethodCode}
              </p>
            ) : null}
          </fieldset>

          {/* Consentements ------------------------------------------------ */}
          <div className="flex flex-col gap-3">
            <label
              htmlFor="acceptTerms"
              className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-[0.95rem]"
            >
              <input
                id="acceptTerms"
                name="acceptTerms"
                type="checkbox"
                required
                aria-invalid={fieldErrors?.acceptTerms ? true : undefined}
                aria-describedby={fieldErrors?.acceptTerms ? 'acceptTerms-error' : undefined}
                className="mt-0.5 size-5 shrink-0 accent-brand"
              />
              <span>
                J&apos;ai lu et j&apos;accepte les{' '}
                <Link
                  href="/cgv"
                  className="font-semibold underline underline-offset-4 hover:text-brand"
                  // Le lien est dans le libellé : sans cela, le clic cocherait
                  // aussi la case au passage.
                  onClick={(event) => event.stopPropagation()}
                >
                  conditions générales de vente
                </Link>
                .
              </span>
            </label>

            {fieldErrors?.acceptTerms ? (
              <p id="acceptTerms-error" className="text-xs font-medium text-danger">
                {fieldErrors.acceptTerms}
              </p>
            ) : null}

            <label
              htmlFor="acceptNewsletter"
              className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-[0.95rem]"
            >
              <input
                id="acceptNewsletter"
                name="acceptNewsletter"
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-brand"
              />
              <span>Je souhaite recevoir les nouveautés et conseils par e-mail.</span>
            </label>
          </div>

          {paymentSimulated ? (
            <Alert tone="warn" title="Paiement simulé">
              Aucun prestataire de paiement n&apos;est configuré sur cet environnement : aucun
              montant ne sera encaissé. L&apos;étape suivante vous laisse choisir l&apos;issue du
              paiement (accepté, refusé, expiré) pour vérifier le tunnel de commande.
            </Alert>
          ) : null}

          <Button type="submit" size="lg" block disabled={pending || noShipping}>
            {pending ? 'Enregistrement…' : `Payer ${formatPrice(totalCents)}`}
          </Button>
        </form>
      </section>

      {/* -------------------------------------------------------------------
          Récapitulatif
          ------------------------------------------------------------------- */}
      <section
        aria-labelledby="commande-recapitulatif"
        className="lg:sticky lg:top-6 lg:w-96 lg:shrink-0"
      >
        <Card className="p-5">
          <h2 id="commande-recapitulatif" className="text-lg font-bold">
            Récapitulatif
          </h2>

          <ul className="mt-4 flex flex-col gap-3 border-b border-line pb-4">
            {lines.map((line) => (
              <li key={line.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{line.productName}</span>
                  <span className="block text-muted">{line.variantName}</span>
                  <span className="block text-xs text-muted">Quantité : {line.quantity}</span>
                </span>
                <span className="shrink-0 font-semibold">{formatPrice(line.lineTotalCents)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt>Sous-total TTC</dt>
              <dd className="font-semibold">{formatPrice(subtotalCents)}</dd>
            </div>

            <div className="flex items-baseline justify-between gap-4 text-muted">
              <dt>dont TVA sur les articles</dt>
              <dd>{formatPrice(vatCents)}</dd>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <dt>Livraison</dt>
              <dd className="text-right font-semibold">
                {selected
                  ? shippingCents === 0
                    ? 'Offerte'
                    : formatPrice(shippingCents)
                  : 'à choisir'}
              </dd>
            </div>

            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-4">
              <dt className="font-semibold">Total</dt>
              <dd className="text-xl font-bold">{formatPrice(totalCents)}</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-muted">
            Ce total est revalidé côté serveur au moment de payer : les prix et les frais de port
            sont relus en base, rien de ce que votre navigateur affiche n&apos;entre dans le montant
            encaissé.
          </p>
        </Card>
      </section>
    </div>
  )
}
