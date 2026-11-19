'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * La carte des clics d'une page : la page elle-même, dans un cadre à la
 * taille d'un écran type, et par-dessus chaque clic à l'endroit où il a eu
 * lieu. En rouge, les clics sur ce qui ne réagit pas et les clics répétés.
 * À gauche, jusqu'où les visiteurs sont descendus.
 *
 * **On fait défiler la page elle-même**, avec la molette ou le doigt : le
 * cadre accepte le défilement mais refuse les clics (sinon on quitterait la
 * carte au premier lien touché), et le calque suit.
 *
 * **Une approximation, assumée.** Les clics viennent d'écrans de largeurs
 * voisines (de 360 à 430 px pour un téléphone) ; ils sont ramenés à la
 * largeur du cadre — proportionnellement sur téléphone et tablette, où tout
 * s'étire, et autour du centre sur ordinateur, où le contenu a une largeur
 * maximale. Un clic tombe donc au bon endroit à quelques pixels près, et la
 * page affichée est celle d'aujourd'hui.
 */

export type PointCarte = { x: number; y: number; w: number; gene: boolean }
export type TrancheProfondeur = { tranche: number; visites: number }

const HAUTEUR_MAX = 720

export function CarteClics({
  path,
  largeur,
  hauteur,
  centre,
  points,
  profondeur,
}: {
  path: string
  /** Largeur du cadre, en pixels d'écran. */
  largeur: number
  /** Hauteur de la fenêtre type. */
  hauteur: number
  /** Ordinateur : les clics sont replacés autour du centre, pas étirés. */
  centre: boolean
  points: PointCarte[]
  profondeur: TrancheProfondeur[]
}) {
  const boite = useRef<HTMLDivElement>(null)
  const cadre = useRef<HTMLIFrameElement>(null)
  const toile = useRef<HTMLCanvasElement>(null)
  const [dispo, setDispo] = useState(0)
  const [haut, setHaut] = useState(0)
  const [docHauteur, setDocHauteur] = useState(0)
  const [afficherClics, setAfficherClics] = useState(true)

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
  const base = profondeur.find((p) => p.tranche === 0)?.visites ?? 0

  /** Ramène un clic à la largeur du cadre. */
  const xCadre = useCallback(
    (p: PointCarte) => (centre ? p.x + (largeur - p.w) / 2 : (p.x * largeur) / Math.max(1, p.w)),
    [centre, largeur],
  )

  const dessiner = useCallback(() => {
    const c = toile.current
    if (!c || echelle <= 0) return
    const dpr = window.devicePixelRatio || 1
    const W = largeur * echelle
    const H = hauteur * echelle
    if (c.width !== Math.round(W * dpr)) c.width = Math.round(W * dpr)
    if (c.height !== Math.round(H * dpr)) c.height = Math.round(H * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    /* Profondeur de défilement : une ligne tous les 10 % de la page. */
    if (docHauteur > 0 && base > 0) {
      ctx.font = '600 11px system-ui, sans-serif'
      for (const t of profondeur) {
        if (t.tranche === 0) continue
        // `scroll` mesure le BAS de la fenêtre : 50 % veut dire que la moitié
        // de la page est passée à l'écran.
        const yDoc = (t.tranche / 100) * docHauteur
        const y = (yDoc - haut) * echelle
        if (y < 0 || y > H) continue
        const part = t.visites / base
        ctx.strokeStyle = `rgba(17, 24, 32, ${0.25 + 0.5 * (1 - part)})`
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
        ctx.setLineDash([])
        const texte = `${Math.round(part * 100)} % ont vu jusqu’ici`
        const l = ctx.measureText(texte).width + 10
        ctx.fillStyle = 'rgba(17, 24, 32, 0.85)'
        ctx.fillRect(4, y - 17, l, 16)
        ctx.fillStyle = '#fff'
        ctx.fillText(texte, 9, y - 5)
      }
    }

    /* Les clics. */
    if (afficherClics) {
      const rayon = Math.max(6, 14 * echelle)
      for (const p of points) {
        const x = xCadre(p) * echelle
        const y = (p.y - haut) * echelle
        if (y < -rayon || y > H + rayon || x < -rayon || x > W + rayon) continue
        const g = ctx.createRadialGradient(x, y, 0, x, y, rayon)
        const couleur = p.gene ? '220, 38, 38' : '230, 57, 70'
        g.addColorStop(0, `rgba(${couleur}, ${p.gene ? 0.75 : 0.45})`)
        g.addColorStop(1, `rgba(${couleur}, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, rayon, 0, Math.PI * 2)
        ctx.fill()
        if (p.gene) {
          ctx.strokeStyle = 'rgba(153, 27, 27, 0.9)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(x, y, rayon * 0.55, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
  }, [echelle, largeur, hauteur, points, haut, docHauteur, base, profondeur, afficherClics, xCadre])

  useEffect(() => {
    dessiner()
  }, [dessiner])

  /** Le cadre est prêt : on suit son défilement, et on neutralise ses liens. */
  const surChargement = useCallback(() => {
    const fenetre = cadre.current?.contentWindow
    const doc = cadre.current?.contentDocument
    if (!fenetre || !doc) return
    const bloquer = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    doc.addEventListener('click', bloquer, true)
    doc.addEventListener('submit', bloquer, true)
    const suivre = () => {
      setHaut(fenetre.scrollY)
      setDocHauteur(doc.documentElement.scrollHeight)
    }
    fenetre.addEventListener('scroll', suivre, { passive: true })
    // La page continue de grandir le temps que les images arrivent.
    const obs = new ResizeObserver(suivre)
    obs.observe(doc.documentElement)
    suivre()
  }, [])

  return (
    <div ref={boite} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-strong">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={afficherClics} onChange={(e) => setAfficherClics(e.target.checked)} className="accent-brand" />
          Afficher les clics
        </label>
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-full bg-brand/60" /> clic</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border-2 border-[#991b1b] bg-danger/70" /> clic sans effet ou répété</span>
        <span>Faites défiler la page dans le cadre ; les liens n’y sont pas actifs.</span>
      </div>
      {echelle > 0 ? (
        <div
          className="relative overflow-hidden rounded-lg border border-line-strong bg-white"
          style={{ width: largeur * echelle, height: hauteur * echelle }}
        >
          <iframe
            ref={cadre}
            src={path}
            title={`Carte des clics de ${path}`}
            onLoad={surChargement}
            className="absolute left-0 top-0 border-0 bg-white"
            style={{ width: largeur, height: hauteur, transform: `scale(${echelle})`, transformOrigin: '0 0' }}
          />
          <canvas
            ref={toile}
            aria-hidden
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: largeur * echelle, height: hauteur * echelle }}
          />
        </div>
      ) : null}
    </div>
  )
}
