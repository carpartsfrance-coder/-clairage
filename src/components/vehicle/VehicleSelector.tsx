'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Surface'
import { IconArrowRight, IconCar, IconMotorcycle } from '@/components/ui/icons'

/**
 * Sélecteur de véhicule : marque → modèle → année.
 *
 * L'équipement lumineux d'origine n'est PAS demandé ici. Il est demandé juste
 * avant le choix du kit, parce que c'est lui — et non le culot — qui décide de
 * la compatibilité. Quand une année correspond à plusieurs équipements, le
 * serveur renvoie l'étape d'équipement au lieu de choisir à la place du client.
 *
 * `layout` :
 *   - `inline`  : une seule ligne, pour un bloc large.
 *   - `stacked` : modale et page dédiée, champs empilés avec libellés visibles.
 *   - `card`    : colonne étroite du bandeau d'ouverture.
 *
 * `card` existe parce que `stacked` ne convenait pas : il repasse en trois
 * colonnes dès 640 px de FENÊTRE, or la carte du bandeau n'en fait que 400 sur
 * grand écran. Les trois champs s'y seraient écrasés au moment précis où la
 * place abonde ailleurs. Une disposition qui dépend de la largeur de la
 * fenêtre ne peut pas servir dans une colonne de largeur fixe.
 */

type Option = { id: string; name: string }
type VehicleType = 'CAR' | 'MOTORCYCLE'

/** Sélection déjà enregistrée, pour rouvrir le formulaire là où on l'a laissé. */
export type VehicleSelectorInitial = {
  type: VehicleType
  makeId: string
  modelId: string
  year: number
}

export function VehicleSelector({
  layout = 'inline',
  currentConfigurationId = null,
  initial = null,
  onDone,
  className,
}: {
  layout?: 'inline' | 'stacked' | 'card'
  currentConfigurationId?: string | null
  /**
   * Véhicule déjà retenu. Le formulaire s'ouvre dessus au lieu de repartir de
   * zéro : il était vide alors que l'en-tête affichait le véhicule, et il
   * fallait tout re-saisir pour changer une seule chose.
   */
  initial?: VehicleSelectorInitial | null
  onDone?: () => void
  className?: string
}) {
  const router = useRouter()
  const baseId = useId()
  const [type, setType] = useState<VehicleType>(initial?.type ?? 'CAR')
  const [makes, setMakes] = useState<Option[]>([])
  const [models, setModels] = useState<Option[]>([])
  const [years, setYears] = useState<number[]>([])
  const [makeId, setMakeId] = useState(initial?.makeId ?? '')
  const [modelId, setModelId] = useState(initial?.modelId ?? '')
  const [year, setYear] = useState(initial ? String(initial.year) : '')

  /*
    L'effet ci-dessous vide les champs quand on bascule voiture ↔ moto. Au
    premier rendu, il effaçait la sélection reprise avant même qu'elle
    s'affiche.

    On compare donc au type précédent au lieu de sauter « le premier
    passage » : en développement, React joue les effets deux fois, un
    garde-fou à usage unique est consommé par le premier appel et le second
    vide quand même. Ici, tant que le type n'a pas changé, il n'y a rien à
    vider — que l'effet soit rejoué ou non.
  */
  const typePrecedent = useRef(type)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Chargements en cascade ------------------------------------------------
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    if (typePrecedent.current !== type) {
      setMakeId('')
      setModelId('')
      setYear('')
      setModels([])
      setYears([])
    }
    typePrecedent.current = type
    fetch(`/api/vehicules/marques?type=${type}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('indisponible'))))
      .then((data: { items: Option[] }) => {
        if (!cancelled) setMakes(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setMakes([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [type])

  useEffect(() => {
    if (!makeId) {
      setModels([])
      return
    }
    let cancelled = false
    fetch(`/api/vehicules/modeles?makeId=${encodeURIComponent(makeId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('indisponible'))))
      .then((data: { items: Option[] }) => {
        if (!cancelled) setModels(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
    return () => {
      cancelled = true
    }
  }, [makeId])

  useEffect(() => {
    if (!modelId) {
      setYears([])
      return
    }
    let cancelled = false
    fetch(`/api/vehicules/annees?modelId=${encodeURIComponent(modelId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('indisponible'))))
      .then((data: { items: number[] }) => {
        if (!cancelled) setYears(data.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setYears([])
      })
    return () => {
      cancelled = true
    }
  }, [modelId])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!modelId || !year) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/vehicule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelId, year: Number(year) }),
      })
      const data = (await response.json()) as { redirect?: string; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Sélection impossible')
      onDone?.()
      router.push(data.redirect ?? '/vehicule/resultats')
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Sélection impossible pour le moment.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const catalogueEmpty = !loading && makes.length === 0
  const inline = layout === 'inline'
  const carte = layout === 'card'
  /* Les deux dispositions compactes partagent l'habillage des champs. */
  const compact = inline || carte

  /*
    Habillage des champs dans la carte d'accueil.

    Le bandeau sombre de la maquette de référence demandait des champs blanc
    cassé à filet sombre et des libellés de 7 px en capitales. La carte est
    claire, donc les champs reprennent l'habillage ordinaire du projet, en
    plus grand : 48 px de haut au lieu de 43, et des libellés de 12 px.

    Ces 7 px ne tenaient d'ailleurs plus : le plancher de lisibilité les
    remontait à 10 px, si bien que la valeur écrite ici ne décrivait plus ce
    qui s'affichait. 12 px est la taille réellement rendue, et elle est lisible
    sans secours.

    `cn` concatène sans arbitrer les conflits : les surcharges sont donc
    écrites en valeurs arbitraires, qui l'emportent sur les utilitaires
    standards de `fieldSize`.
  */
  const champCarte = compact
    ? 'h-[48px] rounded-[9px] border-line-strong px-[13px] text-[14px] text-ink'
    : undefined
  const labelCarte = compact ? 'text-[12px] font-semibold text-muted-strong' : undefined

  /*
    Ce qu'affiche un champ vide.

    En carte, les champs sont étroits : sur un téléphone de 390 px, le modèle
    dispose de 132 px de texte et l'année de 66. « Choisissez une marque » y
    était coupé à « Choisissez une », c'est-à-dire privé de ce qu'il avait à
    dire, et aucune formule expliquant l'attente ne tient dans 66 px — mesuré,
    « Modèle d'abord » en réclame 96. Rééquilibrer les colonnes déplaçait la
    troncature d'un champ à l'autre sans la supprimer.

    Chaque champ porte donc son propre nom, grisé et désactivé : c'est l'usage
    partout, cela ne ment sur rien, et la cascade se lit d'elle-même puisque
    les champs s'activent de gauche à droite. Les dispositions empilées, qui
    ont la place, gardent la phrase explicite.
  */
  const videModele = inline ? 'Modèle' : makeId ? 'Choisir un modèle' : 'Choisissez une marque'
  const videAnnee = inline ? 'Année' : modelId ? "Choisir l'année" : 'Choisissez un modèle'
  /*
    En carte, les champs occupent toute la largeur : l'invite entière y tient,
    contrairement à la disposition en ligne où « Choisissez une marque » se
    faisait couper dans une demi-rangée de téléphone.
  */
  const videMarque = loading ? 'Chargement…' : carte ? 'Choisir une marque' : 'Marque'


  return (
    <form
      onSubmit={submit}
      /* En carte, les écarts viennent des marges de chaque bloc et non d'un
         `gap` global : les deux se cumuleraient. */
      className={cn('flex flex-col', inline ? 'gap-0' : 'gap-3', className)}
    >
      {/*
        Bascule voiture / moto.

        Les deux dispositions emploient désormais la même pilule. Le bandeau
        d'accueil portait des onglets soulignés d'un filet #e76b5d, un saumon
        hérité de la maquette de référence : il ne figure plus à la charte
        depuis le passage au rouge franc, et c'était la seule couleur du site
        à ne venir d'aucun jeton. La pilule n'a besoin d'aucun accent — c'est
        le fond blanc qui désigne l'onglet actif.
      */}
      <div
        role="radiogroup"
        aria-label="Type de véhicule"
        className={cn(
          carte
            /*
              En carte, deux onglets soulignés plutôt qu'une pilule : la
              colonne est étroite et la pilule y mangeait une rangée entière
              pour deux mots. Le filet actif est le rouge de la charte — pas
              le saumon #e76b5d qui traînait ici du temps de la maquette de
              référence, et qui ne venait d'aucun jeton.
            */
            ? 'mb-5 flex w-full gap-7 border-b border-line'
            : 'inline-flex w-fit rounded-[9px] border border-line bg-surface-muted p-[3px]',
          inline && 'mb-[15px]',
        )}
      >
        {(
          [
            /*
              « Auto » et non « Voiture » : les deux mots valent, mais
              « Auto / Moto » forment une paire de même registre, et c'est le
              vocabulaire employé partout ailleurs sur le site — « Packs
              auto », « Packs moto ».
            */
            { value: 'CAR' as const, label: 'Auto', Icon: IconCar },
            { value: 'MOTORCYCLE' as const, label: 'Moto', Icon: IconMotorcycle },
          ]
        ).map(({ value, label, Icon }) => {
          const active = type === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setType(value)}
              className={cn(
                'flex min-h-11 items-center font-semibold transition-colors',
                carte
                  ? 'gap-2 border-b-2 pb-2.5 text-[15px]'
                  : 'gap-2 rounded-[7px] px-4 text-[13px]',
                carte
                  ? active
                    ? 'border-brand text-ink'
                    : 'border-transparent text-muted-strong hover:text-ink'
                  : active
                    ? 'bg-white text-slate-ink shadow-soft'
                    : 'text-muted-strong hover:text-slate-ink',
              )}
            >
              {carte ? null : <Icon className="size-[17px]" />}
              {label}
            </button>
          )
        })}
      </div>

      {catalogueEmpty ? (
        <Alert tone="warn" title="Aucun véhicule n'est encore référencé.">
          Importez les véhicules et les compatibilités depuis le back-office, ou décrivez votre
          véhicule à l&apos;équipe depuis la page contact.
        </Alert>
      ) : (
        <div
          /* .finder-section form : grid 1fr 1.2fr .75fr 1.1fr, gap 12, align end. */
          className={cn(
            inline
              /*
                Mobile : trois rangées. La marque, puis le modèle, chacun sur
                toute la largeur ; l'année et le bouton se partagent la
                dernière.

                Le modèle a besoin de cette largeur entière. Mesuré sur le
                catalogue, le plus long s'appelle « Grande Punto / Punto Evo »
                et réclame 170 px : il se faisait couper dans une demi-rangée,
                et rééquilibrer les deux colonnes ne faisait que déplacer la
                troncature sur l'année. L'année, elle, n'a jamais que quatre
                chiffres, d'où la colonne étroite à côté du bouton — ce qui
                rend cette disposition aussi haute que la précédente.

                Les quatre éléments ne passent sur une ligne qu'à partir de
                1024 px, et non 768. Mesuré à 768, le modèle n'y disposait que
                de 118 px — moins que sur un téléphone, où il occupe une
                rangée entière. La ligne unique n'a de sens que là où elle ne
                reprend pas d'une main ce qu'elle donne de l'autre.
              */
              ? 'grid grid-cols-[1fr_2fr] items-end gap-3 lg:grid-cols-[1fr_1.2fr_0.8fr_auto] [&>*:nth-child(-n+2)]:col-span-2 lg:[&>*:nth-child(-n+2)]:col-span-1'
              : carte
                /*
                  Une colonne, quelle que soit la fenêtre. C'est tout l'objet
                  de cette disposition : la carte fait 400 px sur grand écran,
                  donc la largeur de la fenêtre ne dit rien de la place
                  disponible ici.
                */
                ? 'grid gap-[14px]'
                : 'grid gap-4 sm:grid-cols-3',
          )}
        >
          <SelectField
            id={`${baseId}-make`}
            label="Marque"
            hideLabel={false}
            fieldSize="lg"
            className={champCarte}
            labelClassName={labelCarte}
            value={makeId}
            disabled={loading}
            onChange={(event) => {
              setMakeId(event.target.value)
              setModelId('')
              setYear('')
            }}
          >
            <option value="">{videMarque}</option>
            {makes.map((make) => (
              <option key={make.id} value={make.id}>
                {make.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            id={`${baseId}-model`}
            label="Modèle"
            hideLabel={false}
            fieldSize="lg"
            className={champCarte}
            labelClassName={labelCarte}
            value={modelId}
            disabled={!makeId || models.length === 0}
            onChange={(event) => {
              setModelId(event.target.value)
              setYear('')
            }}
          >
            <option value="">{videModele}</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            id={`${baseId}-year`}
            label="Année"
            hideLabel={false}
            fieldSize="lg"
            className={champCarte}
            labelClassName={labelCarte}
            value={year}
            disabled={!modelId || years.length === 0}
            onChange={(event) => setYear(event.target.value)}
          >
            <option value="">{videAnnee}</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>

          <Button
            type="submit"
            size="lg"
            disabled={!modelId || !year || submitting}
            iconRight={<IconArrowRight className="size-5" />}
            className={cn(
              inline
                /*
                  Retraits en valeurs arbitraires, et non `px-4` : `size="lg"`
                  apporte `px-7`, que `cn` ne sait pas arbitrer puisqu'il se
                  contente de concaténer. C'est alors l'ordre de la feuille
                  générée qui tranche, et il donne `px-7`. Le bouton gardait
                  56 px de retrait, dépassait de 9 px la colonne du téléphone
                  et cassait sa ligne. Une valeur arbitraire passe après
                  l'échelle standard et l'emporte — même raison que `h-[48px]`
                  face à `h-14`.
                */
                ? 'h-[48px] min-h-[48px] rounded-[9px] px-[16px] text-[14px] lg:w-auto lg:px-[24px]'
                : carte
                  ? 'mt-1 h-[48px] min-h-[48px] w-full rounded-[9px] text-[15px]'
                  : 'sm:col-span-3',
            )}
          >
            {submitting ? 'Recherche…' : currentConfigurationId ? 'Mettre à jour' : 'Voir mes éclairages'}
          </Button>
        </div>
      )}

      {error ? (
        <Alert tone="danger" live="assertive">
          {error}
        </Alert>
      ) : null}
    </form>
  )
}
