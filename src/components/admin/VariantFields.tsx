'use client'

import { useState } from 'react'
import { SelectField, TextField } from '@/components/ui/Field'
import { formatPrice } from '@/lib/identity'
import {
  PACKAGING_LABELS,
  PACKAGING_NOTES,
  PACKAGINGS,
  caseSaisie,
  texteSaisi,
  type Saisie,
} from '@/lib/admin/catalogue'

/**
 * Les champs d'un conditionnement, partagés par les trois formulaires qui en
 * écrivent un : la création d'une fiche, l'ajout d'un conditionnement et la
 * modification.
 *
 * Un seul jeu de champs, parce qu'un prix saisi à la création et un prix
 * corrigé plus tard doivent accepter exactement la même chose. Deux
 * formulaires jumeaux finiraient par diverger — l'un tolérant la virgule,
 * l'autre non — et l'écart ne se verrait qu'au moment où un prix est refusé
 * sans raison lisible.
 *
 * **Les montants sont des champs texte, pas `type="number"`.** Un champ
 * numérique refuse la virgule selon le navigateur et la langue du système :
 * l'administrateur tape « 19,90 », le champ reste vide, et le formulaire part
 * sans prix. `inputMode="decimal"` donne le bon clavier sur mobile sans
 * imposer le point.
 */

export type TauxTva = { id: string; label: string; rateBp: number; isDefault: boolean }

export type ValeursVariante = {
  sku: string
  variantName: string
  packaging: string
  prix: string
  prixBarre: string
  vatRateId: string
  seuil: string
  poids: string
  stock: string
  backorder: boolean
  active: boolean
}

/** Montant en centimes tel qu'on le réaffiche dans un champ : « 19,90 », « 80 ». */
export function centsEnSaisie(cents: number | null): string {
  if (cents === null) return ''
  return formatPrice(cents, { withCurrency: false })
}

/**
 * Les valeurs à afficher : celles de la base, ou celles que l'on vient de
 * saisir si elles ont été refusées.
 *
 * React 19 réinitialise le formulaire dès que l'action se termine, et le fait
 * après avoir posé les nouvelles valeurs par défaut : réafficher la saisie en
 * `defaultValue` suffit donc à la retrouver. Sans ce passage, un prix refusé
 * pour une virgule de trop emporterait les onze autres champs.
 */
export function valeursAffichees(defauts: ValeursVariante, saisie?: Saisie): ValeursVariante {
  if (!saisie) return defauts
  return {
    sku: texteSaisi(saisie, 'sku', defauts.sku),
    variantName: texteSaisi(saisie, 'variantName', defauts.variantName),
    packaging: texteSaisi(saisie, 'packaging', defauts.packaging),
    prix: texteSaisi(saisie, 'prix', defauts.prix),
    prixBarre: texteSaisi(saisie, 'prixBarre', defauts.prixBarre),
    vatRateId: texteSaisi(saisie, 'vatRateId', defauts.vatRateId),
    seuil: texteSaisi(saisie, 'seuil', defauts.seuil),
    poids: texteSaisi(saisie, 'poids', defauts.poids),
    stock: texteSaisi(saisie, 'stock', defauts.stock),
    backorder: caseSaisie(saisie, 'backorder', defauts.backorder),
    active: caseSaisie(saisie, 'active', defauts.active),
  }
}

export const VARIANTE_VIDE: ValeursVariante = {
  sku: '',
  variantName: '',
  packaging: 'UNIT',
  prix: '',
  prixBarre: '',
  vatRateId: '',
  seuil: '0',
  poids: '',
  stock: '0',
  backorder: false,
  active: true,
}

export function ChampsVariante({
  cle,
  tauxTva,
  valeurs,
  avecStock,
  avecActive,
  stockFige,
}: {
  /** Suffixe des identifiants : plusieurs de ces formulaires coexistent sur la fiche. */
  cle: string
  tauxTva: TauxTva[]
  valeurs: ValeursVariante
  /** Le stock se saisit à la création ; ensuite il a son propre formulaire, avec motif. */
  avecStock: boolean
  /** « Proposé à la vente » n'a pas de sens à la création : une variante naît active. */
  avecActive: boolean
  /** Raison pour laquelle le stock ne se saisit pas ici (kit). */
  stockFige?: string
}) {
  /*
    L'état ne sert qu'à la note affichée sous la liste : le champ lui-même est
    non contrôlé, et c'est voulu. Un `<select>` contrôlé ne survit pas à la
    réinitialisation que React 19 déclenche après une action — contrairement à
    un `<input>`, pour lequel React réaligne la valeur par défaut. Le champ
    repartirait sur son premier choix pendant que le reste du formulaire
    garderait la saisie refusée.

    Il est resynchronisé quand les valeurs changent, pour que la note suive ce
    que le champ réaffiche.
  */
  const [packaging, setPackaging] = useState(valeurs.packaging)
  const [packagingRecu, setPackagingRecu] = useState(valeurs.packaging)
  if (packagingRecu !== valeurs.packaging) {
    setPackagingRecu(valeurs.packaging)
    setPackaging(valeurs.packaging)
  }

  // Le taux par défaut est présélectionné : c'est le cas courant, et une liste
  // laissée sur « Choisir » fait refuser l'enregistrement pour un champ que
  // personne n'a eu de raison d'ouvrir.
  const tauxInitial =
    valeurs.vatRateId || tauxTva.find((taux) => taux.isDefault)?.id || tauxTva[0]?.id || ''

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          id={`sku-${cle}`}
          name="sku"
          label="Référence"
          hint="Identifiant de la pièce. Les imports de stock la cherchent."
          defaultValue={valeurs.sku}
          placeholder="LUM-H7-LED"
          maxLength={64}
          className="font-mono"
          required
        />
        <TextField
          id={`variantName-${cle}`}
          name="variantName"
          label="Nom du conditionnement"
          hint="Ce que le client lit avant d’ajouter au panier."
          defaultValue={valeurs.variantName}
          placeholder="La paire"
          maxLength={160}
          required
        />
      </div>

      {/*
        `key` sur la valeur affichée : React ne pose l'option par défaut d'un
        `<select>` qu'au montage. Sans remontage, la réinitialisation qui suit
        l'action le ramènerait à son premier choix au lieu de la saisie
        refusée.
      */}
      <SelectField
        key={`packaging-${valeurs.packaging}`}
        id={`packaging-${cle}`}
        name="packaging"
        label="Conditionnement"
        hint={PACKAGING_NOTES[packaging as keyof typeof PACKAGING_NOTES] ?? ''}
        wrapperClassName="mt-4 max-w-md"
        defaultValue={valeurs.packaging}
        onChange={(event) => setPackaging(event.target.value)}
      >
        {PACKAGINGS.map((valeur) => (
          <option key={valeur} value={valeur}>
            {PACKAGING_LABELS[valeur]}
          </option>
        ))}
      </SelectField>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TextField
          id={`prix-${cle}`}
          name="prix"
          label="Prix de vente TTC"
          hint="En euros, virgule acceptée : 19,90."
          inputMode="decimal"
          defaultValue={valeurs.prix}
          placeholder="19,90"
          required
        />
        <TextField
          id={`prixBarre-${cle}`}
          name="prixBarre"
          label="Prix barré (facultatif)"
          hint="Doit dépasser le prix de vente, sinon la remise affichée est nulle."
          inputMode="decimal"
          defaultValue={valeurs.prixBarre}
          placeholder=""
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SelectField
          key={`vatRateId-${tauxInitial}`}
          id={`vatRateId-${cle}`}
          name="vatRateId"
          label="Taux de TVA"
          hint="Sans lui, le HT de la fiche et de la facture est faux."
          defaultValue={tauxInitial}
          required
          disabled={tauxTva.length === 0}
        >
          {tauxTva.length === 0 ? (
            <option value="">Aucun taux enregistré</option>
          ) : (
            tauxTva.map((taux) => (
              <option key={taux.id} value={taux.id}>
                {taux.label}
                {taux.isDefault ? ' — par défaut' : ''}
              </option>
            ))
          )}
        </SelectField>
        <TextField
          id={`seuil-${cle}`}
          name="seuil"
          label="Seuil d’alerte"
          hint="À ce niveau ou en dessous, la fiche annonce « Plus que N en stock »."
          inputMode="numeric"
          defaultValue={valeurs.seuil}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {avecStock ? (
          <TextField
            id={`stock-${cle}`}
            name="stock"
            label="Stock détenu"
            hint={
              stockFige ??
              'Les pièces en votre possession. Un mouvement d’inventaire est enregistré.'
            }
            inputMode="numeric"
            defaultValue={valeurs.stock}
            disabled={Boolean(stockFige)}
          />
        ) : null}
        <TextField
          id={`poids-${cle}`}
          name="poids"
          label="Poids en grammes (facultatif)"
          hint="Donnée d’inventaire : rien ne s’en sert encore sur le site."
          inputMode="numeric"
          defaultValue={valeurs.poids}
          placeholder="180"
        />
      </div>

      <fieldset className="mt-4">
        <legend className="sr-only">Disponibilité</legend>
        <label className="flex min-h-9 items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="backorder"
            defaultChecked={valeurs.backorder}
            className="mt-0.5 size-4 shrink-0"
          />
          <span className="min-w-0">
            Vendre à découvert
            <span className="mt-0.5 block text-xs text-muted-strong">
              À zéro stock, la fiche affiche « Sur commande » et reste achetable, au lieu
              d’« Indisponible ».
            </span>
          </span>
        </label>

        {avecActive ? (
          <label className="mt-3 flex min-h-9 items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={valeurs.active}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0">
              Proposé à la vente
              <span className="mt-0.5 block text-xs text-muted-strong">
                Décoché, ce conditionnement disparaît de la fiche sans rien perdre : ni son
                stock, ni ses compatibilités, ni son historique.
              </span>
            </span>
          </label>
        ) : (
          /*
            Une variante naît proposée à la vente : on ne crée pas un
            conditionnement pour le cacher aussitôt. L'action lit ce champ, donc
            il est envoyé, mais il n'y a rien à décider ici.
          */
          <input type="hidden" name="active" value="on" />
        )}
      </fieldset>
    </>
  )
}
