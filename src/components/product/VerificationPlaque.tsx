'use client'

import { useActionState, useState } from 'react'
import { requestPlateCheck, type PlateCheckState } from '@/lib/actions/support'
import { formatPlate } from '@/lib/support'
import { Alert } from '@/components/ui/Surface'
import { MentionDonnees } from '@/components/legal/MentionDonnees'
import { cn } from '@/lib/cn'

/**
 * « Un doute ? Faites vérifier par un expert » — le client laisse sa plaque
 * d'immatriculation et une adresse, l'équipe identifie le véhicule et lui
 * répond si ce produit lui convient.
 *
 * C'est la voie la plus courte pour celui qui hésite : il n'a ni modèle ni
 * année à choisir dans un sélecteur, la plaque suffit. Rien n'est commandé ni
 * bloqué en attendant, et la demande tombe dans la même file que les autres
 * demandes d'aide.
 */
export function VerificationPlaque({
  productSlug,
  className,
}: {
  productSlug: string
  className?: string
}) {
  const [state, formAction, pending] = useActionState<PlateCheckState, FormData>(
    requestPlateCheck,
    {},
  )
  const [plate, setPlate] = useState('')
  // Contrôlé : après un envoi refusé, React vide les champs libres du formulaire.
  const [email, setEmail] = useState('')

  if (state.reference) {
    return (
      <Alert tone="ok" live="polite" title="Demande envoyée à un expert." className={className}>
        <p>
          Nous identifions votre véhicule à partir de la plaque et vous répondons par e-mail.
          Référence de la demande :{' '}
          <strong className="text-slate-ink">{state.reference}</strong>.
        </p>
      </Alert>
    )
  }

  /*
    Fond noir, plaque et bouton sur une ligne : propositions A et B, retenues
    le 22 novembre 2026. L'adresse e-mail n'est demandée qu'une fois la
    plaque commencée — le bloc reste court tant que le client ne s'en sert
    pas, et le bouton ne part jamais sans adresse (`required`).
  */
  const plaqueCommencee = plate.trim().length > 0 || Boolean(state.error)

  return (
    <form
      action={formAction}
      aria-labelledby="verification-plaque-titre"
      className={cn('on-dark rounded-xl bg-[#111214] p-4 text-white', className)}
    >
      <input type="hidden" name="productSlug" value={productSlug} />

      <p id="verification-plaque-titre" className="text-[15px] font-bold">
        Un doute ? Faites vérifier avec votre plaque
      </p>
      <p className="mt-1 text-[13px] leading-[1.5] text-[#c9ccd1]">
        Un expert vérifie que ce produit convient à votre véhicule et vous répond par e-mail.
      </p>

      {state.error ? (
        <Alert tone="danger" live="assertive" className="mt-3">
          {state.error}
        </Alert>
      ) : null}

      <div className="mt-3 flex gap-2">
        <div className="flex h-[46px] min-w-0 flex-1 overflow-hidden rounded-[7px] bg-white">
          <span
            aria-hidden="true"
            className="flex w-[30px] shrink-0 flex-col items-center justify-center bg-[#2653c6] text-[11px] font-extrabold text-white"
          >
            <span className="text-[7px] leading-none opacity-90">★</span>F
          </span>
          <input
            name="plate"
            aria-label="Plaque d'immatriculation"
            value={plate}
            onChange={(event) =>
              setPlate(event.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 12))
            }
            onBlur={() => setPlate((valeur) => formatPlate(valeur))}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="AB-123-CD"
            className="min-w-0 flex-1 bg-transparent px-2.5 text-[15px] font-bold tracking-[0.06em] text-[#0f1626] uppercase placeholder:font-semibold placeholder:text-muted"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-[46px] shrink-0 rounded-[7px] border border-white/40 px-4 text-[14px] font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
        >
          {pending ? 'Envoi…' : 'Vérifier'}
        </button>
      </div>

      {plaqueCommencee ? (
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="Votre adresse e-mail, pour la réponse"
          required
          autoComplete="email"
          maxLength={160}
          placeholder="Votre e-mail, pour la réponse"
          className="mt-2 h-[46px] w-full rounded-[7px] bg-white px-3 text-[14px] text-[#323232] placeholder:text-muted"
        />
      ) : null}

      <MentionDonnees
        usage="Votre plaque et votre adresse e-mail ne servent qu’à vous répondre."
        className="mt-2.5"
        sombre
      />
    </form>
  )
}
