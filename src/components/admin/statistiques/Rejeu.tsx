'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Le rejeu d'une page, à partir de la trace du mode détaillé.
 *
 * **Comment.** La page est rechargée dans un cadre, à la taille exacte de la
 * fenêtre d'origine (largeur ET hauteur : une page qui utilise la hauteur de
 * l'écran se met en page comme chez le visiteur). Puis, au fil du temps
 * enregistré, le cadre défile là où la fenêtre avait défilé, et un point
 * rejoue le pointeur ; un appui fait une onde, un clic manqué ou agacé une
 * onde rouge.
 *
 * **Ce que ce n'est pas.** Une vidéo. La page rechargée est celle
 * d'aujourd'hui, avec le panier et le véhicule de la personne qui regarde ;
 * un menu ouvert, une fenêtre de zoom ou un champ rempli pendant la visite
 * n'apparaissent pas. Le pointeur et le défilement, eux, sont exacts. Pour ce
 * qu'on cherche — où l'œil est allé, où le doigt a hésité, jusqu'où on est
 * descendu — c'est ce qui compte.
 *
 * La page rechargée ne se compte pas comme une visite : la mesure ne tourne
 * jamais dans un cadre (components/mesure/file.ts).
 */

export type PointRejeu = { t: number; kind: 'move' | 'down' | 'scroll'; x: number; y: number }
export type ClicRejeu = { t: number; x: number; y: number; label: string; gene: boolean }

const HAUTEUR_MAX = 640
const VITESSES = [1, 2, 4, 8] as const

/** Le dernier élément dont `t` est inférieur ou égal à l'instant demandé. */
function dernierAvant<T extends { t: number }>(liste: T[], t: number): number {
  let bas = 0
  let haut = liste.length - 1
  let trouve = -1
  while (bas <= haut) {
    const milieu = (bas + haut) >> 1
    if (liste[milieu].t <= t) {
      trouve = milieu
      bas = milieu + 1
    } else {
      haut = milieu - 1
    }
  }
  return trouve
}

export function Rejeu({
  path,
  largeur,
  hauteur,
  points,
  clics,
}: {
  path: string
  largeur: number
  hauteur: number
  points: PointRejeu[]
  clics: ClicRejeu[]
}) {
  const cadre = useRef<HTMLIFrameElement>(null)
  const boite = useRef<HTMLDivElement>(null)
  const [dispo, setDispo] = useState(0)
  const [temps, setTemps] = useState(0)
  const [lecture, setLecture] = useState(false)
  const [vitesse, setVitesse] = useState<(typeof VITESSES)[number]>(1)
  const [charge, setCharge] = useState(false)

  const pointeur = useMemo(() => points.filter((p) => p.kind !== 'scroll').sort((a, b) => a.t - b.t), [points])
  const defilement = useMemo(() => points.filter((p) => p.kind === 'scroll').sort((a, b) => a.t - b.t), [points])
  const appuis = useMemo(() => points.filter((p) => p.kind === 'down'), [points])
  const fin = useMemo(
    () => Math.max(0, ...points.map((p) => p.t), ...clics.map((c) => c.t)) + 800,
    [points, clics],
  )
  const rechargeable = !path.includes('…')

  // Place disponible : le rejeu s'adapte à la largeur de la carte.
  useEffect(() => {
    const el = boite.current
    if (!el) return
    const mesurer = () => setDispo(el.clientWidth)
    mesurer()
    const obs = new ResizeObserver(mesurer)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const echelle = dispo > 0 ? Math.min(1, dispo / largeur, HAUTEUR_MAX / hauteur) : 0

  // L'horloge du rejeu.
  useEffect(() => {
    if (!lecture) return
    let precedent = performance.now()
    let image = 0
    const pas = (maintenant: number) => {
      const ecoule = (maintenant - precedent) * vitesse
      precedent = maintenant
      setTemps((t) => {
        const suivant = t + ecoule
        if (suivant >= fin) {
          setLecture(false)
          return fin
        }
        return suivant
      })
      image = requestAnimationFrame(pas)
    }
    image = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(image)
  }, [lecture, vitesse, fin])

  // Défilement à l'instant courant.
  const haut = useMemo(() => {
    const i = dernierAvant(defilement, temps)
    return i >= 0 ? defilement[i].y : 0
  }, [defilement, temps])

  // Le cadre suit le défilement enregistré.
  const appliquerDefilement = useCallback(() => {
    try {
      cadre.current?.contentWindow?.scrollTo({ top: haut, behavior: 'instant' as ScrollBehavior })
    } catch {
      /* page d'une autre origine : rien à faire */
    }
  }, [haut])
  useEffect(() => {
    if (charge) appliquerDefilement()
  }, [charge, appliquerDefilement])

  // Position du pointeur, interpolée entre deux points proches.
  const curseur = useMemo(() => {
    const i = dernierAvant(pointeur, temps)
    if (i < 0) return null
    const a = pointeur[i]
    const b = pointeur[i + 1]
    if (!b || b.t - a.t > 600) return { x: a.x, y: a.y }
    const k = Math.min(1, Math.max(0, (temps - a.t) / (b.t - a.t)))
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
  }, [pointeur, temps])

  const ondes = [
    ...appuis.filter((a) => temps >= a.t && temps - a.t < 700).map((a) => ({ ...a, gene: false, label: '' })),
    ...clics.filter((c) => c.gene && temps >= c.t && temps - c.t < 1200),
  ]
  const clicCourant = [...clics].reverse().find((c) => temps >= c.t && temps - c.t < 1500)

  const mm = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div ref={boite} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            if (temps >= fin) setTemps(0)
            setLecture((l) => !l)
          }}
          className="rounded-lg bg-ink px-4 py-1.5 font-semibold text-white"
        >
          {lecture ? 'Pause' : temps >= fin ? 'Revoir' : temps > 0 ? 'Reprendre' : 'Rejouer cette page'}
        </button>
        <div role="group" aria-label="Vitesse" className="flex gap-1">
          {VITESSES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVitesse(v)}
              aria-pressed={vitesse === v}
              className={`rounded px-2 py-1 text-xs font-semibold ${vitesse === v ? 'bg-surface-muted' : 'text-muted-strong'}`}
            >
              ×{v}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={fin}
          step={50}
          value={Math.round(temps)}
          onChange={(e) => {
            setLecture(false)
            setTemps(Number(e.target.value))
          }}
          aria-label="Position dans le rejeu"
          className="min-w-[10rem] flex-1 accent-brand"
        />
        <span className="tabular-nums text-xs text-muted-strong">
          {mm(temps)} / {mm(fin)}
        </span>
      </div>

      {echelle > 0 ? (
        <div
          className="relative overflow-hidden rounded-lg border border-line-strong bg-surface-muted"
          style={{ width: largeur * echelle, height: hauteur * echelle }}
        >
          {rechargeable ? (
            <iframe
              ref={cadre}
              src={path}
              title={`Rejeu de ${path}`}
              tabIndex={-1}
              aria-hidden
              onLoad={() => {
                setCharge(true)
                appliquerDefilement()
              }}
              className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
              style={{ width: largeur, height: hauteur, transform: `scale(${echelle})`, transformOrigin: '0 0' }}
            />
          ) : (
            <p className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-muted-strong">
              Page impossible à recharger : son adresse portait un identifiant (commande, facture), retiré
              par la mesure. Le pointeur se rejoue sur fond vide.
            </p>
          )}

          {/* Le pointeur */}
          {curseur ? (
            <span
              aria-hidden
              className="pointer-events-none absolute z-10 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{ left: curseur.x * echelle, top: (curseur.y - haut) * echelle }}
            />
          ) : null}

          {/* Appuis et clics manqués */}
          {ondes.map((o, i) => {
            const age = temps - o.t
            const taille = 12 + age / 18
            return (
              <span
                key={`${o.t}-${i}`}
                aria-hidden
                className={`pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${o.gene ? 'border-danger' : 'border-brand'}`}
                style={{
                  left: o.x * echelle,
                  top: (o.y - haut) * echelle,
                  width: taille,
                  height: taille,
                  opacity: Math.max(0, 1 - age / (o.gene ? 1200 : 700)),
                }}
              />
            )
          })}

          {clicCourant ? (
            <span className="pointer-events-none absolute inset-x-2 bottom-2 z-20 truncate rounded bg-ink/85 px-2 py-1 text-xs text-white">
              {clicCourant.gene ? '⚠ ' : ''}
              {clicCourant.label}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-strong">
        Fenêtre d’origine : {largeur} × {hauteur} px
        {echelle > 0 && echelle < 1 ? `, affichée à ${Math.round(echelle * 100)} %` : ''}. {pointeur.length} position
        {pointeur.length > 1 ? 's' : ''} du pointeur, {defilement.length} de défilement. La page est celle
        d’aujourd’hui : un menu ouvert ou un champ rempli pendant la visite n’apparaît pas.
      </p>
    </div>
  )
}
