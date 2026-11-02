'use client'

import { useActionState, useState } from 'react'
import type { ReactNode } from 'react'
import { SelectField, TextField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { texteSaisi } from '@/lib/admin/catalogue'
import {
  BODY_MAX,
  CULOT_MAX,
  DESCRIPTION_MAX,
  DIFFICULTE_LABELS,
  DIFFICULTE_NOTES,
  DIFFICULTES,
  KELVIN_MAX,
  KELVIN_MIN,
  MARQUE_MAX,
  NOM_MAX,
  TYPES_VEHICULE,
  VEHICLE_TYPE_LABELS,
  isDifficulte,
  raisonAdresseFigee,
} from '@/lib/admin/produit-contenu'
import {
  updateProductAddress,
  updateProductCopy,
  updateProductIdentity,
} from '@/lib/actions/admin-product-content'
import { ETAT_VIDE, Retour, ZoneTexte } from './ContentFields'

/**
 * Ce que la fiche raconte : son identité, son adresse, ses textes.
 *
 * Ces champs étaient affichés en lecture dans le tableau « Informations », et
 * cette liste disait « non renseigné » sans offrir de le renseigner. Corriger
 * un culot — qui décide du menu et de la recherche par culot — demandait une
 * requête à la main.
 *
 * **Trois formulaires et non un seul**, pour la même raison que dans le bloc
 * achat : un unique « Enregistrer » obligerait à renvoyer un rédactionnel de
 * vingt minutes pour corriger une coquille dans un nom. Et l'adresse publique
 * est à part parce que ce n'est pas une correction mais une rupture de lien.
 */

/** Valeur absente : on l'écrit, on ne la devine pas. */
function Vide() {
  return <span className="text-muted">non renseigné</span>
}

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line px-3 py-2 sm:flex-row sm:gap-4">
      <dt className="text-xs font-semibold text-muted-strong sm:w-56 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  )
}

const CADRE = 'mt-3 rounded-lg border border-line p-4'

/* -------------------------------------------------------------------------- */
/* Identité                                                                   */
/* -------------------------------------------------------------------------- */

export type ValeursIdentite = {
  name: string
  brand: string
  bulbBase: string
  temperature: string
  difficulty: string
  vehicleType: string
}

export function IdentiteForm({
  productId,
  valeurs,
  mayEdit,
}: {
  productId: string
  valeurs: ValeursIdentite
  mayEdit: boolean
}) {
  const [state, action, pending] = useActionState(updateProductIdentity, ETAT_VIDE)

  const affichees: ValeursIdentite = {
    name: texteSaisi(state.saisie, 'name', valeurs.name),
    brand: texteSaisi(state.saisie, 'brand', valeurs.brand),
    bulbBase: texteSaisi(state.saisie, 'bulbBase', valeurs.bulbBase),
    temperature: texteSaisi(state.saisie, 'temperature', valeurs.temperature),
    difficulty: texteSaisi(state.saisie, 'difficulty', valeurs.difficulty),
    vehicleType: texteSaisi(state.saisie, 'vehicleType', valeurs.vehicleType),
  }

  /*
    L'état ne sert qu'à la note affichée sous la liste des niveaux : le champ
    lui-même est non contrôlé. Un `<select>` contrôlé ne survit pas à la
    réinitialisation que React 19 déclenche après une action — contrairement à
    un `<input>`, pour lequel React réaligne la valeur par défaut — et
    repartirait sur son premier choix en emportant la saisie refusée. La `key`
    dérivée de la valeur reçue est ce qui le remonte avec la bonne option.
  */
  const [niveau, setNiveau] = useState(affichees.difficulty)
  const [niveauRecu, setNiveauRecu] = useState(affichees.difficulty)
  if (niveauRecu !== affichees.difficulty) {
    setNiveauRecu(affichees.difficulty)
    setNiveau(affichees.difficulty)
  }

  if (!mayEdit) {
    return (
      <dl className="mt-3 rounded-md border border-line border-t-0 bg-white">
        <Ligne label="Nom">{valeurs.name}</Ligne>
        <Ligne label="Marque">{valeurs.brand || <Vide />}</Ligne>
        <Ligne label="Culot">{valeurs.bulbBase || <Vide />}</Ligne>
        <Ligne label="Température de couleur">
          {valeurs.temperature ? `${valeurs.temperature} K` : <Vide />}
        </Ligne>
        <Ligne label="Niveau de montage">
          {DIFFICULTE_LABELS[isDifficulte(valeurs.difficulty) ? valeurs.difficulty : 'UNKNOWN']}
        </Ligne>
        <Ligne label="Type de véhicule">
          {VEHICLE_TYPE_LABELS[valeurs.vehicleType as keyof typeof VEHICLE_TYPE_LABELS] ?? <Vide />}
        </Ligne>
      </dl>
    )
  }

  return (
    <form action={action} className={CADRE}>
      <input type="hidden" name="productId" value={productId} />

      <TextField
        id="name"
        name="name"
        label="Nom du produit"
        hint="Le titre de la fiche, et l’intitulé repris dans le panier et sur la facture."
        defaultValue={affichees.name}
        maxLength={NOM_MAX}
        required
      />

      {/* `grid-cols-1` explicite : sans lui, la colonne implicite se dimensionne
          sur son contenu et pousse la page en débordement horizontal sous
          640 px. */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          id="brand"
          name="brand"
          label="Marque"
          hint="Le fabricant de la pièce. Vide si le produit n’en porte pas."
          defaultValue={affichees.brand}
          maxLength={MARQUE_MAX}
        />
        <TextField
          id="bulbBase"
          name="bulbBase"
          label="Culot"
          hint="H7, D1S, BA15S… Repris tel quel dans le menu et dans la recherche par culot : « h7 » et « H7 » y feraient deux entrées."
          placeholder="H7"
          defaultValue={affichees.bulbBase}
          maxLength={CULOT_MAX}
          /* Les culots s'écrivent en capitales partout ailleurs sur le site :
             le champ le montre, et le serveur le garantit. */
          className="uppercase"
          autoCapitalize="characters"
        />
        <TextField
          id="temperature"
          name="temperature"
          label="Température de couleur"
          hint={`En kelvins, entre ${KELVIN_MIN} et ${KELVIN_MAX}. Vide si la teinte ne s’applique pas.`}
          placeholder="6000"
          /* Champ texte et non numérique : « 6 000 K » recopié d'une fiche
             fournisseur est accepté, là où un champ numérique se viderait
             en silence. */
          type="text"
          inputMode="numeric"
          defaultValue={affichees.temperature}
          maxLength={12}
        />
        <SelectField
          key={`vehicleType-${affichees.vehicleType}`}
          id="vehicleType"
          name="vehicleType"
          label="Type de véhicule"
          hint="Il décide des parcours où le produit apparaît : un produit « voiture » ne sort jamais dans un parcours moto."
          defaultValue={affichees.vehicleType}
          required
        >
          {TYPES_VEHICULE.map((type) => (
            <option key={type} value={type}>
              {VEHICLE_TYPE_LABELS[type]}
            </option>
          ))}
        </SelectField>
      </div>

      <SelectField
        key={`difficulty-${affichees.difficulty}`}
        id="difficulty"
        name="difficulty"
        label="Niveau de montage"
        defaultValue={affichees.difficulty}
        wrapperClassName="mt-4 md:max-w-[calc(50%-0.5rem)]"
        onChange={(event) => setNiveau(event.currentTarget.value)}
        required
      >
        {DIFFICULTES.map((valeur) => (
          <option key={valeur} value={valeur}>
            {DIFFICULTE_LABELS[valeur]}
          </option>
        ))}
      </SelectField>
      <p className="mt-1.5 text-[10px] text-muted">
        {DIFFICULTE_NOTES[isDifficulte(niveau) ? niveau : 'UNKNOWN']}
      </p>

      <Button type="submit" className="mt-4" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>

      <Retour state={state} />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Adresse publique                                                          */
/* -------------------------------------------------------------------------- */

/**
 * L'adresse `/p/<slug>`.
 *
 * Elle a son propre formulaire, et il se ferme dès que la fiche a été servie
 * au public. Rien dans l'application ne pose de redirection : l'ancienne
 * adresse ne renvoie pas vers la nouvelle, elle devient une page introuvable.
 */
export function AdresseForm({
  productId,
  slug,
  statut,
  mayEdit,
}: {
  productId: string
  slug: string
  statut: string
  mayEdit: boolean
}) {
  const [state, action, pending] = useActionState(updateProductAddress, ETAT_VIDE)
  const figee = raisonAdresseFigee({ statut })

  if (!mayEdit || figee) {
    return (
      <div className={CADRE}>
        <p className="text-[11px] font-bold">Adresse publique</p>
        <p className="mt-1 font-mono text-xs break-all">/p/{slug}</p>
        {figee ? <p className="mt-2 max-w-[70ch] text-xs text-muted-strong">{figee}</p> : null}
      </div>
    )
  }

  return (
    <form action={action} className={CADRE}>
      <input type="hidden" name="productId" value={productId} />
      <TextField
        id="slug"
        name="slug"
        label="Adresse publique"
        hint="Minuscules, chiffres et traits d’union. Tant que la fiche est un brouillon, elle n’a jamais été servie : l’adresse est encore libre. Une fois en ligne, elle ne bouge plus."
        defaultValue={texteSaisi(state.saisie, 'slug', slug)}
        maxLength={120}
        wrapperClassName="md:max-w-[36rem]"
        required
      />
      <p className="mt-1.5 font-mono text-[10px] text-muted">/p/{slug}</p>

      <Button type="submit" variant="secondary" className="mt-3" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Changer l’adresse'}
      </Button>

      <Retour state={state} />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Rédactionnel                                                               */
/* -------------------------------------------------------------------------- */

export function RedactionnelForm({
  productId,
  description,
  body,
  mayEdit,
}: {
  productId: string
  description: string
  body: string
  mayEdit: boolean
}) {
  const [state, action, pending] = useActionState(updateProductCopy, ETAT_VIDE)

  if (!mayEdit) {
    return (
      <dl className="mt-3 rounded-md border border-line border-t-0 bg-white">
        <Ligne label="Description courte">{description || <Vide />}</Ligne>
        <Ligne label="Rédactionnel">
          {body ? <span className="whitespace-pre-wrap">{body}</span> : <Vide />}
        </Ligne>
      </dl>
    )
  }

  return (
    <form action={action} className={CADRE}>
      <input type="hidden" name="productId" value={productId} />

      <ZoneTexte
        id="description"
        name="description"
        label="Description courte"
        hint="Une ou deux phrases, affichées en sous-titre du bloc de comparaison des teintes."
        rows={2}
        maxLength={DESCRIPTION_MAX}
        defaultValue={texteSaisi(state.saisie, 'description', description)}
      />

      <ZoneTexte
        id="body"
        name="body"
        label="Rédactionnel (section « La référence »)"
        hint={
          <>
            Quatre formes sont reconnues : <code>## Titre</code>, <code>**gras**</code>, une ligne{' '}
            <code>| libellé | valeur |</code>, et une ligne vide pour changer de paragraphe. Le
            reste s’affiche tel quel — une balise HTML écrite ici se voit, elle ne s’exécute pas.
          </>
        }
        rows={14}
        maxLength={BODY_MAX}
        defaultValue={texteSaisi(state.saisie, 'body', body)}
        wrapperClassName="mt-4"
        className="font-mono text-[12px]"
      />

      <Button type="submit" className="mt-4" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer les textes'}
      </Button>

      <Retour state={state} />
    </form>
  )
}
