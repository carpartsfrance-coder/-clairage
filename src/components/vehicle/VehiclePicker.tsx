'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/cn'
import { BrandMark } from '@/components/packs/BrandMark'
import { IconCar, IconChevronRight, IconMotorcycle, IconSearch } from '@/components/ui/icons'
import { LienVehiculeAbsent } from './LienVehiculeAbsent'

/**
 * Choix du véhicule en trois écrans : la marque, le modèle, l'année.
 *
 * Remplace, dans la fenêtre « Choisir mon véhicule » et sur /vehicule, les
 * trois listes déroulantes côte à côte (remarque de l'exploitant, 10 novembre
 * 2026) : leurs textes étaient coupés (« Choisissez une mar »), une liste de
 * 47 marques se parcourt mal dans un menu déroulant, et le bouton rouge pâle
 * restait inactif sans dire pourquoi.
 *
 * Ici chaque écran montre tout ce qu'il y a à choisir, en grand :
 * - les marques les plus courantes en tuiles avec leur logo, puis toutes les
 *   autres de A à Z, et une recherche ;
 * - les modèles en lignes, avec leurs années de production ;
 * - les années en pastilles : toucher l'année suffit, pas de bouton à
 *   chercher.
 * Le fil en haut (« Dacia › Duster 2 › 2019 ») montre où l'on en est et
 * permet de revenir à une étape d'un toucher.
 *
 * L'équipement d'origine n'est pas demandé ici : le serveur renvoie vers
 * l'écran d'équipement quand une année en compte plusieurs (comme avant).
 */

type VehicleType = 'CAR' | 'MOTORCYCLE'
type Marque = { id: string; name: string; logo?: string | null }
type Modele = { id: string; name: string }
type Etape = 'marque' | 'modele' | 'annee'

export type VehiclePickerInitial = { type: VehicleType; makeId: string; modelId: string; year: number }

/** Les marques les plus vendues en France, montrées en premier quand elles sont au catalogue. */
const COURANTES: Record<VehicleType, string[]> = {
  CAR: [
    'Renault', 'Peugeot', 'Citroën', 'Volkswagen', 'Dacia', 'Toyota',
    'BMW', 'Audi', 'Mercedes-Benz', 'Ford', 'Opel', 'Fiat',
  ],
  MOTORCYCLE: ['Yamaha', 'Honda', 'Kawasaki', 'Suzuki', 'BMW', 'KTM', 'Triumph', 'Ducati'],
}

const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** « Duster 2 (2018–2024) » → { nom: « Duster 2 », annees: « 2018–2024 » }. */
function decouper(nom: string) {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(nom)
  return m ? { nom: m[1], annees: m[2] } : { nom, annees: null }
}

export function VehiclePicker({
  initial = null,
  onDone,
  className,
}: {
  initial?: VehiclePickerInitial | null
  onDone?: () => void
  className?: string
}) {
  const router = useRouter()
  const [type, setType] = useState<VehicleType>(initial?.type ?? 'CAR')
  const [etape, setEtape] = useState<Etape>('marque')
  const [marques, setMarques] = useState<Marque[] | null>(null)
  const [modeles, setModeles] = useState<Modele[] | null>(null)
  const [annees, setAnnees] = useState<number[] | null>(null)
  const [marque, setMarque] = useState<Marque | null>(null)
  const [modele, setModele] = useState<Modele | null>(null)
  const [recherche, setRecherche] = useState('')
  const [envoi, setEnvoi] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [motoDisponible, setMotoDisponible] = useState(true)
  const champ = useRef<HTMLInputElement>(null)
  const corps = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/vehicules/marques?type=MOTORCYCLE')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: Marque[] } | null) => d && setMotoDisponible((d.items ?? []).length > 0))
      .catch(() => {})
  }, [])

  // Marques du type choisi.
  useEffect(() => {
    let annule = false
    setMarques(null)
    fetch(`/api/vehicules/marques?type=${type}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { items: Marque[] }) => !annule && setMarques(d.items ?? []))
      .catch(() => !annule && setMarques([]))
    return () => {
      annule = true
    }
  }, [type])

  // Repartir sur le véhicule déjà retenu : on retrouve sa marque, on ouvre ses modèles.
  const repris = useRef(false)
  useEffect(() => {
    if (repris.current || !initial || !marques || type !== initial.type) return
    const m = marques.find((x) => x.id === initial.makeId)
    repris.current = true
    if (m) setMarque(m)
  }, [initial, marques, type])

  // Modèles de la marque choisie.
  useEffect(() => {
    if (!marque) return
    let annule = false
    setModeles(null)
    fetch(`/api/vehicules/modeles?makeId=${encodeURIComponent(marque.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { items: Modele[] }) => !annule && setModeles(d.items ?? []))
      .catch(() => !annule && setModeles([]))
    return () => {
      annule = true
    }
  }, [marque])

  // Années du modèle choisi.
  useEffect(() => {
    if (!modele) return
    let annule = false
    setAnnees(null)
    fetch(`/api/vehicules/annees?modelId=${encodeURIComponent(modele.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { items: number[] }) => !annule && setAnnees(d.items ?? []))
      .catch(() => !annule && setAnnees([]))
    return () => {
      annule = true
    }
  }, [modele])

  // À chaque écran : recherche vidée, défilement en haut, curseur dans la recherche.
  useEffect(() => {
    setRecherche('')
    corps.current?.scrollTo({ top: 0 })
    if (etape !== 'annee' && window.matchMedia('(pointer: fine)').matches) champ.current?.focus()
  }, [etape, type])

  function choisirMarque(m: Marque) {
    setMarque(m)
    setModele(null)
    setAnnees(null)
    setEtape('modele')
  }

  function choisirModele(m: Modele) {
    setModele(m)
    setEtape('annee')
  }

  async function choisirAnnee(annee: number) {
    if (!modele || envoi) return
    setEnvoi(annee)
    setErreur(null)
    try {
      const reponse = await fetch('/api/vehicule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelId: modele.id, year: annee }),
      })
      const data = (await reponse.json()) as { redirect?: string; error?: string }
      if (!reponse.ok) throw new Error(data.error ?? 'Sélection impossible')
      onDone?.()
      router.push(data.redirect ?? '/vehicule/resultats')
      router.refresh()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Sélection impossible pour le moment.')
      setEnvoi(null)
    }
  }

  const filtre = sansAccent(recherche)
  const marquesFiltrees = useMemo(
    () => (marques ?? []).filter((m) => !filtre || sansAccent(m.name).includes(filtre)),
    [marques, filtre],
  )
  const courantes = useMemo(() => {
    if (filtre || !marques) return []
    const ordre = COURANTES[type].map(sansAccent)
    const rang = (m: Marque) => ordre.indexOf(sansAccent(m.name))
    return marques.filter((m) => rang(m) >= 0).sort((a, b) => rang(a) - rang(b))
  }, [marques, filtre, type])
  const modelesFiltres = useMemo(
    () => (modeles ?? []).filter((m) => !filtre || sansAccent(m.name).includes(filtre)),
    [modeles, filtre],
  )

  const Moto = type === 'MOTORCYCLE'
  const nomModele = modele ? decouper(modele.name).nom : null

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {/* ---- Fil de l'étape : type, marque, modèle, année ---- */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-line px-5 pb-4 sm:px-6">
        {motoDisponible || Moto ? (
          <div role="radiogroup" aria-label="Type de véhicule" className="mr-2 inline-flex rounded-full bg-surface-muted p-1">
            {(
              [
                { v: 'CAR' as const, label: 'Auto', Icon: IconCar },
                { v: 'MOTORCYCLE' as const, label: 'Moto', Icon: IconMotorcycle },
              ]
            ).map(({ v, label, Icon }) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={type === v}
                onClick={() => {
                  if (type === v) return
                  setType(v)
                  setMarque(null)
                  setModele(null)
                  setEtape('marque')
                }}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                  type === v ? 'bg-white text-ink shadow-soft' : 'text-muted-strong hover:text-ink',
                )}
              >
                <Icon className="size-[18px]" />
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <nav aria-label="Étapes" className="flex min-w-0 flex-wrap items-center gap-1 text-[14px]">
          <EtapeFil actif={etape === 'marque'} fait={Boolean(marque)} onClick={() => setEtape('marque')}>
            {marque ? marque.name : 'Marque'}
          </EtapeFil>
          <IconChevronRight aria-hidden="true" className="size-4 text-[#b5b5b5]" />
          <EtapeFil
            actif={etape === 'modele'}
            fait={Boolean(modele)}
            disabled={!marque}
            onClick={() => marque && setEtape('modele')}
          >
            {nomModele ?? 'Modèle'}
          </EtapeFil>
          <IconChevronRight aria-hidden="true" className="size-4 text-[#b5b5b5]" />
          <EtapeFil actif={etape === 'annee'} fait={false} disabled={!modele} onClick={() => modele && setEtape('annee')}>
            {envoi ? String(envoi) : 'Année'}
          </EtapeFil>
        </nav>
      </div>

      {/* ---- Recherche (marques et modèles) ---- */}
      {etape !== 'annee' ? (
        <div className="px-5 pt-4 sm:px-6">
          <label className="relative block">
            <span className="sr-only">{etape === 'marque' ? 'Rechercher une marque' : 'Rechercher un modèle'}</span>
            <IconSearch aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted" />
            <input
              ref={champ}
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (etape === 'marque' && marquesFiltrees.length === 1) choisirMarque(marquesFiltrees[0])
                if (etape === 'modele' && modelesFiltres.length === 1) choisirModele(modelesFiltres[0])
              }}
              placeholder={
                etape === 'marque'
                  ? Moto ? 'Rechercher une marque : Yamaha, Honda…' : 'Rechercher une marque : Renault, Peugeot…'
                  : `Rechercher un modèle ${marque?.name ?? ''}`.trim()
              }
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-[#d4d4d4] bg-white pr-3 pl-11 text-[16px] text-ink placeholder:text-[#8a8d91] focus:border-ink focus:outline-none"
            />
          </label>
        </div>
      ) : null}

      {/* ---- Contenu de l'étape ---- */}
      <div ref={corps} className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5 sm:px-6" aria-live="polite">
        {etape === 'marque' ? (
          marques === null ? (
            <Chargement />
          ) : marquesFiltrees.length === 0 ? (
            <Vide texte={`Aucune marque ne correspond à « ${recherche} ».`} />
          ) : (
            <>
              {courantes.length > 0 ? (
                <>
                  <h3 className="mb-2.5 text-[13px] font-semibold text-muted-strong">Les plus courantes</h3>
                  <ul className="grid auto-rows-fr grid-cols-3 gap-2 sm:grid-cols-4">
                    {courantes.map((m) => (
                      <li key={m.id} className="h-full">
                        <button
                          type="button"
                          onClick={() => choisirMarque(m)}
                          className={cn(
                            'flex h-full w-full flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors hover:border-ink',
                            marque?.id === m.id ? 'border-ink bg-surface-muted' : 'border-line',
                          )}
                        >
                          <BrandMark name={m.name} logo={m.logo ? { url: m.logo, alt: '' } : null} size="md" className="border-0" />
                          <span className="text-[13px] leading-tight font-semibold text-ink">{m.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <h3 className="mt-6 mb-1 text-[13px] font-semibold text-muted-strong">Toutes les marques</h3>
                </>
              ) : null}
              <ul className="grid sm:grid-cols-2 sm:gap-x-6">
                {marquesFiltrees.map((m) => (
                  <li key={m.id}>
                    <Ligne onClick={() => choisirMarque(m)} actif={marque?.id === m.id}>
                      <BrandMark name={m.name} logo={m.logo ? { url: m.logo, alt: '' } : null} size="sm" />
                      <span className="flex-1 text-[15px] font-semibold">{m.name}</span>
                    </Ligne>
                  </li>
                ))}
              </ul>
            </>
          )
        ) : etape === 'modele' ? (
          modeles === null ? (
            <Chargement />
          ) : modelesFiltres.length === 0 ? (
            <Vide texte={recherche ? `Aucun modèle ${marque?.name} ne correspond à « ${recherche} ».` : 'Aucun modèle pour cette marque.'} />
          ) : (
            <ul>
              {modelesFiltres.map((m) => {
                const { nom, annees: periode } = decouper(m.name)
                return (
                  <li key={m.id}>
                    <Ligne onClick={() => choisirModele(m)} actif={modele?.id === m.id}>
                      <span className="flex-1 text-[15px] font-semibold">{nom}</span>
                      {periode ? <span className="text-[14px] text-muted-strong tabular-nums">{periode}</span> : null}
                    </Ligne>
                  </li>
                )
              })}
            </ul>
          )
        ) : (
          <>
            <p className="m-0 mb-4 text-[15px] text-ink">
              Année de mise en circulation de votre {marque?.name} {nomModele} :
            </p>
            {annees === null ? (
              <Chargement />
            ) : annees.length === 0 ? (
              <Vide texte="Aucune année disponible pour ce modèle." />
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {[...annees].sort((a, b) => b - a).map((a) => (
                  <li key={a}>
                    <button
                      type="button"
                      disabled={envoi !== null}
                      onClick={() => choisirAnnee(a)}
                      className={cn(
                        'h-12 w-full rounded-xl border text-[16px] font-semibold tabular-nums transition-colors disabled:cursor-wait',
                        envoi === a
                          ? 'border-ink bg-ink text-white'
                          : 'border-line text-ink hover:border-ink',
                        initial && modele?.id === initial.modelId && initial.year === a && envoi === null && 'border-ink',
                      )}
                    >
                      {envoi === a ? '…' : a}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[13px] text-muted-strong">
              L’année figure sur la carte grise, case B (date de première immatriculation).
            </p>
            {erreur ? <p role="alert" className="mt-3 text-[14px] font-semibold text-danger">{erreur}</p> : null}
          </>
        )}
      </div>

      <div className="border-t border-line px-5 py-3 sm:px-6">
        <LienVehiculeAbsent className="text-[13px]" />
      </div>
    </div>
  )
}

function EtapeFil({
  actif,
  fait,
  disabled,
  onClick,
  children,
}: {
  actif: boolean
  fait: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={actif ? 'step' : undefined}
      onClick={onClick}
      className={cn(
        'max-w-[11rem] truncate rounded-md px-1.5 py-1 font-semibold transition-colors',
        actif ? 'text-ink underline decoration-brand decoration-2 underline-offset-[6px]' : fait ? 'text-ink hover:text-brand' : 'text-[#9a9da1]',
        disabled && 'cursor-default',
      )}
    >
      {children}
    </button>
  )
}

function Ligne({ onClick, actif, children }: { onClick: () => void; actif?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[52px] w-full items-center gap-3 border-b border-line text-left text-ink transition-colors hover:text-brand',
        actif && 'text-brand',
      )}
    >
      {children}
      <IconChevronRight aria-hidden="true" className="size-4 shrink-0 text-[#b5b5b5]" />
    </button>
  )
}

function Chargement() {
  return <p className="py-6 text-center text-[14px] text-muted-strong">Chargement…</p>
}

function Vide({ texte }: { texte: string }) {
  return <p className="py-6 text-center text-[14px] text-muted-strong">{texte}</p>
}
