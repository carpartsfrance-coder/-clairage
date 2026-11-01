'use client'

import { useActionState, useState } from 'react'
import { SelectField, TextField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { slugify, texteSaisi } from '@/lib/admin/catalogue'
import { createProduct, type PurchaseState } from '@/lib/actions/admin-product-purchase'
import { ChampsVariante, VARIANTE_VIDE, valeursAffichees, type TauxTva } from './VariantFields'

/**
 * Création d'une fiche produit.
 *
 * Aucun écran ne créait un produit : le seul chemin passait par un import CSV,
 * qui n'attribue pas de taux de TVA — et la publication le refuse. Une fiche
 * née dans le back-office était donc condamnée au brouillon.
 *
 * **Le formulaire demande exactement ce qui empêche de publier**, et rien de
 * plus : nom, adresse, rubrique, type de véhicule, puis la première variante
 * avec son prix et son taux de TVA (`lib/admin/completeness.ts` liste ces
 * manques comme bloquants). Accroche, référencement, caractéristiques et
 * visuels s'ajoutent ensuite sur la fiche, qui est faite pour ça. Les demander
 * ici donnerait un formulaire de trente champs devant lequel on renonce — et
 * une fiche née sans rubrique ni prix serait précisément l'impasse qu'on
 * corrige.
 */

export function ProductCreateForm({
  categories,
  tauxTva,
}: {
  categories: Array<{ id: string; path: string }>
  tauxTva: TauxTva[]
}) {
  const [state, action, pending] = useActionState<PurchaseState, FormData>(createProduct, {})

  /*
    L'adresse se pré-remplit depuis le nom, tant que personne ne l'a touchée.
    Après, elle ne bouge plus : corriger une coquille dans le nom ne doit pas
    écraser une adresse choisie à la main, et l'adresse est publique.
  */
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouche, setSlugTouche] = useState(false)

  // Ce qui a été refusé revient tel quel : React 19 réinitialise le
  // formulaire dès que l'action se termine. Le nom et l'adresse, eux, sont
  // tenus par l'état du composant et traversent la réinitialisation.
  const valeurs = valeursAffichees(VARIANTE_VIDE, state.saisie)

  const sansTaux = tauxTva.length === 0
  const sansRubrique = categories.length === 0

  return (
    <form action={action} className="mt-4 max-w-3xl">
      {sansTaux ? (
        <Alert tone="danger" className="mb-4">
          Aucun taux de TVA n’est enregistré. Sans taux, le HT affiché sur la fiche et sur la
          facture serait faux : la création est bloquée. Les taux viennent du jeu de données
          initial (<code>prisma/seed.ts</code>), aucun écran ne les crée.
        </Alert>
      ) : null}

      {sansRubrique ? (
        <Alert tone="danger" className="mb-4">
          Aucune rubrique n’existe. Un produit sans rubrique n’a pas de fil d’Ariane et
          n’apparaît dans aucun menu : créez d’abord une rubrique dans{' '}
          <a href="/admin/catalogue/categories" className="underline">
            Catégories
          </a>
          .
        </Alert>
      ) : null}

      <section aria-labelledby="creation-produit" className="rounded-lg border border-line p-4">
        <h2 id="creation-produit" className="text-sm font-bold">
          Le produit
        </h2>

        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <TextField
            id="name"
            name="name"
            label="Nom du produit"
            hint="Le titre de la fiche, et le nom repris dans les listes."
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (!slugTouche) setSlug(slugify(event.target.value))
            }}
            maxLength={200}
            required
          />
          <TextField
            id="slug"
            name="slug"
            label="Adresse publique"
            hint={slug ? `La fiche sera servie sur /p/${slug}` : 'Dérivée du nom si laissée vide.'}
            value={slug}
            onChange={(event) => {
              setSlugTouche(true)
              setSlug(event.target.value)
            }}
            maxLength={120}
            className="font-mono"
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* `key` : React ne pose l'option par défaut d'un `<select>` qu'au
              montage, et la réinitialisation qui suit l'action ramènerait la
              liste à « Choisir une rubrique ». */}
          <SelectField
            key={`categoryId-${texteSaisi(state.saisie, 'categoryId', '')}`}
            id="categoryId"
            name="categoryId"
            label="Rubrique"
            hint="Elle porte le fil d’Ariane. D’autres s’ajoutent ensuite sur la fiche."
            defaultValue={texteSaisi(state.saisie, 'categoryId', '')}
            required
            disabled={sansRubrique}
          >
            <option value="" disabled>
              Choisir une rubrique
            </option>
            {categories.map((categorie) => (
              <option key={categorie.id} value={categorie.id}>
                {categorie.path}
              </option>
            ))}
          </SelectField>
          <SelectField
            key={`vehicleType-${texteSaisi(state.saisie, 'vehicleType', 'CAR')}`}
            id="vehicleType"
            name="vehicleType"
            label="Type de véhicule"
            hint="Il décide des listes où le produit apparaît : un produit « voiture » ne sort jamais dans un parcours moto."
            defaultValue={texteSaisi(state.saisie, 'vehicleType', 'CAR')}
            required
          >
            <option value="CAR">Voiture</option>
            <option value="MOTORCYCLE">Moto</option>
            <option value="BOTH">Voiture et moto</option>
          </SelectField>
        </div>

        <TextField
          id="brand"
          name="brand"
          label="Marque (facultatif)"
          hint="Le fabricant de la pièce, affiché sur la fiche."
          defaultValue={texteSaisi(state.saisie, 'brand', '')}
          wrapperClassName="mt-4 md:max-w-[calc(50%-0.5rem)]"
          maxLength={120}
        />
      </section>

      <section
        aria-labelledby="creation-conditionnement"
        className="mt-4 rounded-lg border border-line p-4"
      >
        <h2 id="creation-conditionnement" className="text-sm font-bold">
          Le premier conditionnement
        </h2>
        <p className="mt-1 text-xs text-muted-strong">
          C’est lui qui est acheté : une fiche sans conditionnement actif n’a rien à vendre.
          D’autres s’ajoutent ensuite sur la fiche.
        </p>

        <div className="mt-3">
          <ChampsVariante
            cle="nouveau"
            tauxTva={tauxTva}
            valeurs={valeurs}
            avecStock
            avecActive={false}
          />
        </div>
      </section>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || sansTaux || sansRubrique}>
          {pending ? 'Création…' : 'Créer la fiche'}
        </Button>
        <p className="text-xs text-muted-strong">
          La fiche est créée en brouillon. Rien n’est mis en vente sans une publication
          explicite.
        </p>
      </div>

      {state.error ? (
        <Alert tone="danger" className="mt-3">
          {state.error}
        </Alert>
      ) : null}
    </form>
  )
}
