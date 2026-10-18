'use client'

import { useActionState } from 'react'
import { saveAddress, type AccountState } from '@/lib/actions/account'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { SelectField, TextField } from '@/components/ui/Field'

/* --------------------------------------------------------------------------
   Formulaire d'adresse
   --------------------------------------------------------------------------
   Composant client pour une seule raison : `useActionState`, qui porte le
   message renvoyé par l'action.

   Le même formulaire sert à créer et à modifier. En modification, l'identifiant
   part dans un champ caché ; c'est `saveAddress` qui vérifie que l'adresse
   appartient bien à l'utilisateur de la session (le `userId` est dans le
   `where`), donc un identifiant trafiqué ici ne donne accès à rien.
   -------------------------------------------------------------------------- */

/**
 * Les champs attendus d'une adresse. Volontairement structurel plutôt que lié
 * au type Prisma : la page peut passer la ligne telle quelle.
 */
export type AddressFormValues = {
  id: string
  label: string | null
  firstName: string
  lastName: string
  company: string | null
  line1: string
  line2: string | null
  postalCode: string
  city: string
  country: string
  phone: string | null
  isDefaultShipping: boolean
}

export function AddressForm({
  address,
  onDoneLabel,
}: {
  address: AddressFormValues | null
  /** Libellé du bouton de validation. */
  onDoneLabel?: string
}) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(saveAddress, {})

  // Plusieurs formulaires cohabitent sur la page des adresses : les `id` sont
  // préfixés pour que chaque libellé reste relié à son propre champ.
  const scope = address ? address.id : 'nouvelle'
  const id = (name: string) => `adresse-${scope}-${name}`

  const submitLabel =
    onDoneLabel ?? (address ? 'Enregistrer les modifications' : 'Ajouter cette adresse')

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {address ? <input type="hidden" name="id" value={address.id} /> : null}

      {state.error ? (
        <Alert tone="danger" live="assertive">
          {state.error}
        </Alert>
      ) : null}

      {state.notice ? (
        <Alert tone="ok" live="polite">
          {state.notice}
        </Alert>
      ) : null}

      <TextField
        id={id('label')}
        name="label"
        label="Libellé"
        hint="Facultatif — « Domicile », « Bureau », « Atelier »"
        defaultValue={address?.label ?? ''}
        maxLength={60}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          id={id('firstName')}
          name="firstName"
          label="Prénom"
          required
          autoComplete="given-name"
          defaultValue={address?.firstName ?? ''}
          maxLength={80}
        />
        <TextField
          id={id('lastName')}
          name="lastName"
          label="Nom"
          required
          autoComplete="family-name"
          defaultValue={address?.lastName ?? ''}
          maxLength={80}
        />
      </div>

      <TextField
        id={id('company')}
        name="company"
        label="Société"
        hint="Facultatif"
        autoComplete="organization"
        defaultValue={address?.company ?? ''}
        maxLength={120}
      />

      <TextField
        id={id('line1')}
        name="line1"
        label="Adresse"
        required
        autoComplete="address-line1"
        defaultValue={address?.line1 ?? ''}
        maxLength={160}
      />

      <TextField
        id={id('line2')}
        name="line2"
        label="Complément d'adresse"
        hint="Facultatif — bâtiment, étage, code d'accès"
        autoComplete="address-line2"
        defaultValue={address?.line2 ?? ''}
        maxLength={160}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
        <TextField
          id={id('postalCode')}
          name="postalCode"
          label="Code postal"
          required
          inputMode="numeric"
          autoComplete="postal-code"
          defaultValue={address?.postalCode ?? ''}
          maxLength={12}
        />
        <TextField
          id={id('city')}
          name="city"
          label="Ville"
          required
          autoComplete="address-level2"
          defaultValue={address?.city ?? ''}
          maxLength={80}
        />
      </div>

      {/*
        Une seule option : la France est la seule zone de livraison configurée.
        Le champ reste un select pour que l'ajout d'une zone côté admin n'oblige
        pas à retoucher le formulaire, et pour que le pays envoyé soit explicite.
      */}
      <SelectField
        id={id('country')}
        name="country"
        label="Pays"
        defaultValue={address?.country ?? 'FR'}
        hint="Seule zone de livraison configurée à ce jour."
        autoComplete="country"
        wrapperClassName="sm:max-w-xs"
      >
        <option value="FR">France</option>
      </SelectField>

      <TextField
        id={id('phone')}
        name="phone"
        type="tel"
        label="Téléphone"
        hint="Facultatif — pour être joint en cas de problème sur la livraison"
        autoComplete="tel"
        defaultValue={address?.phone ?? ''}
        maxLength={32}
      />

      <label
        htmlFor={id('isDefaultShipping')}
        className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.95rem]"
      >
        <input
          id={id('isDefaultShipping')}
          name="isDefaultShipping"
          type="checkbox"
          defaultChecked={address?.isDefaultShipping ?? false}
          className="size-5 shrink-0 accent-brand"
        />
        <span>Utiliser comme adresse par défaut</span>
      </label>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
