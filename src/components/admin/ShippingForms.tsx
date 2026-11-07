'use client'

import { useActionState, useState } from 'react'
import {
  enregistrerMode,
  enregistrerZone,
  type LivraisonAdminState,
} from '@/lib/actions/admin-livraison'
import { centimesEnEuros, PAYS_EUROPE } from '@/lib/livraison-pays'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'

/**
 * Formulaires de la page « Livraison » du back-office.
 *
 * Composants client pour `useActionState` uniquement : le message de retour
 * (enregistré, ou pourquoi c'est refusé) s'affiche sous le formulaire qui l'a
 * provoqué. Tous les contrôles sont refaits côté serveur.
 */

const VIDE: LivraisonAdminState = {}

function Retour({ state }: { state: LivraisonAdminState }) {
  if (state.error) {
    return (
      <Alert tone="danger" live="assertive">
        {state.error}
      </Alert>
    )
  }
  if (state.notice) {
    return (
      <Alert tone="ok" live="polite">
        {state.notice}
      </Alert>
    )
  }
  return null
}

/* -------------------------------------------------------------------------- */

export function ZoneForm({
  zone,
  paysPrisAilleurs,
}: {
  zone?: { id: string; label: string; countries: string[] }
  /** Pays déjà rattachés à une autre zone : affichés, mais pas cochables. */
  paysPrisAilleurs: Record<string, string>
}) {
  const [state, formAction, pending] = useActionState(enregistrerZone, VIDE)
  const [coches, setCoches] = useState<Set<string>>(new Set(zone?.countries ?? []))

  const basculer = (code: string) =>
    setCoches((avant) => {
      const apres = new Set(avant)
      if (apres.has(code)) apres.delete(code)
      else apres.add(code)
      return apres
    })

  const groupes = [
    { titre: 'Union européenne', pays: PAYS_EUROPE.filter((p) => p.ue) },
    {
      titre: 'Hors Union européenne — envoi soumis à la douane',
      pays: PAYS_EUROPE.filter((p) => !p.ue),
    },
  ]

  const toutCocherUE = () =>
    setCoches((avant) => {
      const apres = new Set(avant)
      for (const p of groupes[0].pays) if (!paysPrisAilleurs[p.code]) apres.add(p.code)
      return apres
    })

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {zone ? <input type="hidden" name="zoneId" value={zone.id} /> : null}
      <TextField
        id={`zone-label-${zone?.id ?? 'nouvelle'}`}
        name="label"
        label="Nom de la zone"
        defaultValue={zone?.label ?? ''}
        placeholder="Europe"
        required
        fieldSize="sm"
        wrapperClassName="max-w-sm"
      />

      {groupes.map((groupe, i) => (
        <fieldset key={groupe.titre} className="border-0 p-0">
          <legend className="flex items-center gap-3 text-[11px] font-bold">
            {groupe.titre}
            {i === 0 ? (
              <button
                type="button"
                onClick={toutCocherUE}
                className="text-[11px] font-normal underline underline-offset-2"
              >
                tout cocher
              </button>
            ) : null}
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {groupe.pays.map((p) => {
              const ailleurs = paysPrisAilleurs[p.code]
              return (
                <label
                  key={p.code}
                  className={`flex items-center gap-2 text-[12px] ${ailleurs ? 'text-muted' : ''}`}
                  title={ailleurs ? `Déjà dans la zone « ${ailleurs} »` : undefined}
                >
                  <input
                    type="checkbox"
                    name="countries"
                    value={p.code}
                    checked={coches.has(p.code)}
                    disabled={Boolean(ailleurs)}
                    onChange={() => basculer(p.code)}
                    className="size-4 shrink-0 accent-brand"
                  />
                  <span>
                    {p.nom}
                    {ailleurs ? <span className="text-[10px]"> · {ailleurs}</span> : null}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Enregistrement…' : zone ? 'Enregistrer la zone' : 'Créer la zone'}
        </Button>
        <span className="text-[11px] text-muted">{coches.size} pays cochés</span>
      </div>
      <Retour state={state} />
    </form>
  )
}

/* -------------------------------------------------------------------------- */

export type ModeEditable = {
  id: string
  label: string
  carrier: string | null
  priceCents: number
  freeFromCents: number | null
  minDays: number | null
  maxDays: number | null
  position: number
  active: boolean
}

export function MethodForm({ zoneId, mode }: { zoneId: string; mode?: ModeEditable }) {
  const [state, formAction, pending] = useActionState(enregistrerMode, VIDE)
  const id = (champ: string) => `mode-${mode?.id ?? `nouveau-${zoneId}`}-${champ}`

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="zoneId" value={zoneId} />
      {mode ? <input type="hidden" name="methodId" value={mode.id} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          id={id('label')}
          name="label"
          label="Nom affiché au client"
          defaultValue={mode?.label ?? ''}
          placeholder="Livraison à domicile"
          required
          fieldSize="sm"
        />
        <TextField
          id={id('carrier')}
          name="carrier"
          label="Transporteur"
          defaultValue={mode?.carrier ?? ''}
          placeholder="Colissimo"
          fieldSize="sm"
        />
        <TextField
          id={id('price')}
          name="price"
          label="Prix TTC (€)"
          defaultValue={mode ? centimesEnEuros(mode.priceCents) : ''}
          placeholder="5,90"
          inputMode="decimal"
          required
          fieldSize="sm"
        />
        <TextField
          id={id('freeFrom')}
          name="freeFrom"
          label="Offerte dès (€ d'achat)"
          defaultValue={mode ? centimesEnEuros(mode.freeFromCents) : ''}
          placeholder="80"
          hint="Vide : jamais offerte."
          inputMode="decimal"
          fieldSize="sm"
        />
        <TextField
          id={id('minDays')}
          name="minDays"
          label="Délai minimum (jours ouvrés)"
          defaultValue={mode?.minDays ?? ''}
          inputMode="numeric"
          fieldSize="sm"
        />
        <TextField
          id={id('maxDays')}
          name="maxDays"
          label="Délai maximum (jours ouvrés)"
          defaultValue={mode?.maxDays ?? ''}
          inputMode="numeric"
          fieldSize="sm"
        />
        <TextField
          id={id('position')}
          name="position"
          label="Ordre d'affichage"
          defaultValue={mode?.position ?? 0}
          inputMode="numeric"
          fieldSize="sm"
        />
        <label className="flex items-center gap-2 self-end pb-2 text-[12px] font-bold">
          <input
            type="checkbox"
            name="active"
            defaultChecked={mode?.active ?? true}
            className="size-4 shrink-0 accent-brand"
          />
          Proposé à la commande
        </label>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Enregistrement…' : mode ? 'Enregistrer ce mode' : 'Ajouter ce mode'}
        </Button>
      </div>
      <Retour state={state} />
    </form>
  )
}
