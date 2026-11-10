'use client'

import { useActionState, useState } from 'react'
import { enregistrerPromotion, type PromoState } from '@/lib/actions/admin-promotions'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'

export type PromotionInitiale = {
  id: string
  code: string
  label: string
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING'
  /** Déjà converti pour la saisie : « 10 » pour 10 %, « 15,00 » pour 15 €. */
  value: string
  minOrder: string
  maxRedemptions: string
  maxPerCustomer: string
  startsAt: string
  endsAt: string
  freeShipping: boolean
  active: boolean
}

const VIDE: PromoState = {}

export function PromotionForm({ initiale }: { initiale?: PromotionInitiale }) {
  const [state, action, pending] = useActionState(enregistrerPromotion, VIDE)
  const [type, setType] = useState(initiale?.type ?? 'PERCENT')
  const p = initiale?.id ?? 'nouveau'

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error ? <Alert tone="danger" live="assertive">{state.error}</Alert> : null}
      {state.notice ? <Alert tone="ok" live="polite">{state.notice}</Alert> : null}
      {initiale ? <input type="hidden" name="id" value={initiale.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <TextField id={`${p}-code`} name="code" label="Code" required fieldSize="sm" defaultValue={initiale?.code}
          placeholder="BIENVENUE10" hint="Ce que le client tape. Lettres et chiffres." className="font-mono uppercase" />
        <TextField id={`${p}-label`} name="label" label="Nom" required fieldSize="sm" defaultValue={initiale?.label}
          placeholder="10 % de bienvenue" wrapperClassName="sm:col-span-2" hint="Affiché au client dans son panier." />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField id={`${p}-type`} name="type" label="Type de remise" fieldSize="sm" value={type}
          onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="PERCENT">Pourcentage</option>
          <option value="FIXED">Montant fixe en €</option>
          <option value="FREE_SHIPPING">Livraison offerte seulement</option>
        </SelectField>
        {type !== 'FREE_SHIPPING' ? (
          <TextField id={`${p}-value`} name="value" label={type === 'PERCENT' ? 'Remise (%)' : 'Remise (€)'} required
            inputMode="decimal" fieldSize="sm" defaultValue={initiale?.value} placeholder={type === 'PERCENT' ? '10' : '15'} />
        ) : null}
        <TextField id={`${p}-min`} name="minOrder" label="Minimum d’achat (€)" inputMode="decimal" fieldSize="sm"
          defaultValue={initiale?.minOrder} hint="Vide = aucun minimum." />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <TextField id={`${p}-debut`} name="startsAt" label="Valable à partir du" type="date" fieldSize="sm" defaultValue={initiale?.startsAt} />
        <TextField id={`${p}-fin`} name="endsAt" label="Jusqu’au (inclus)" type="date" fieldSize="sm" defaultValue={initiale?.endsAt} />
        <TextField id={`${p}-max`} name="maxRedemptions" label="Utilisations max." inputMode="numeric" fieldSize="sm"
          defaultValue={initiale?.maxRedemptions} hint="Vide = illimité." />
        <TextField id={`${p}-parclient`} name="maxPerCustomer" label="Par client max." inputMode="numeric" fieldSize="sm"
          defaultValue={initiale?.maxPerCustomer} hint="Ex. 1 pour un code de bienvenue." />
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        {type !== 'FREE_SHIPPING' ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="freeShipping" defaultChecked={initiale?.freeShipping} /> Offre aussi la livraison
          </label>
        ) : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={initiale?.active ?? true} /> Actif
        </label>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Enregistrement…' : initiale ? 'Enregistrer' : 'Créer le code'}
        </Button>
      </div>
    </form>
  )
}
