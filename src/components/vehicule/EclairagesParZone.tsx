'use client'

import { presentationDeCarte } from '@/lib/carte-titre'
import { useMemo, useState } from 'react'
import Image from '@/components/ui/Image'
import Link from 'next/link'
import { FitmentBadge } from '@/components/ui/Badge'
import { IconArrowRight, IconChevronDown } from '@/components/ui/icons'
import { formatPrice } from '@/lib/identity'
import { cn } from '@/lib/cn'
import {
  TRIS,
  type CarteEclairage,
  type Tri,
  type Zone,
  cartesTriees,
  nomDeLaZone,
  zoneDeLEmplacement,
  zonesPresentes,
} from '@/lib/packs-vue'

/**
 * Les éclairages d'un véhicule : barre d'outils et grille de vignettes.
 *
 * Le dessin est celui de la maquette fournie par l'exploitant. Ce qui le
 * distingue de ce qu'il remplaçait :
 *
 * **La vignette est titrée par l'emplacement, pas par le produit.** Sur la
 * page d'une Audi A2, « Pack LED antibrouillards pour Audi A2 » dit trois
 * fois la même chose. La ligne dessous nomme ce que l'emplacement éclaire —
 * « Éclairage antibrouillard » — pour celui qui ne connaît pas le nom de la
 * lumière qu'il vient changer.
 *
 * **La zone est une pastille sur la photo**, et le filtre porte son décompte.
 * Trois entrées, pas huit : « avant / arrière / habitacle » se répond d'un
 * regard sur sa voiture, alors que filtrer par emplacement n'aurait rien
 * donné — il y en a un par vignette, le filtre aurait rendu une vignette.
 *
 * **La pastille de compatibilité ne s'affiche que si elle alerte.** Sur les
 * 10 295 compatibilités du catalogue, 10 293 sont confirmées : répéter
 * « Confirmé » partout n'apprend rien et noie les deux qui comptent.
 *
 * **Les mentions rares ne prennent de place que remplies.** Cinq
 * compatibilités sur 10 295 portent une réserve de montage, cinq une date de
 * vérification, une seule un deuxième conditionnement. La maquette ne leur
 * prévoit pas de case, et c'est justifié : leur en réserver une donnait dix
 * mille vignettes à trous pour en servir cinq. Elles restent, et s'affichent
 * sur la seule vignette qui les porte.
 */
export function EclairagesParZone({ cartes }: { cartes: CarteEclairage[] }) {
  const [zone, setZone] = useState<Zone>('tout')
  const [tri, setTri] = useState<Tri>('conseilles')

  const zones = useMemo(
    () => zonesPresentes(cartes.flatMap((c) => c.emplacements.map((e) => e.code))),
    [cartes],
  )

  /** Le décompte de chaque filtre, calculé une fois pour toutes les pastilles. */
  const decomptes = useMemo(() => {
    const total = new Map<Zone, number>([['tout', cartes.length]])
    for (const carte of cartes) {
      const vues = new Set(carte.emplacements.map((e) => zoneDeLEmplacement(e.code)))
      for (const vue of vues) total.set(vue, (total.get(vue) ?? 0) + 1)
    }
    return total
  }, [cartes])

  const visibles = useMemo(() => {
    const retenues =
      zone === 'tout'
        ? cartes
        : cartes.filter((c) => c.emplacements.some((e) => zoneDeLEmplacement(e.code) === zone))
    return cartesTriees(retenues, tri)
  }, [cartes, zone, tri])

  return (
    <>
      <div className="my-[15px] flex items-center justify-between gap-3 max-[650px]:flex-wrap max-[650px]:items-start max-[650px]:gap-2">
        <div
          className="flex flex-wrap gap-[7px] max-[470px]:grid max-[470px]:w-full max-[470px]:grid-cols-4 max-[470px]:gap-[5px]"
          role="group"
          aria-label="Filtrer par emplacement"
        >
          {zones.map((entree) => {
            const actif = zone === entree.cle
            return (
              <button
                key={entree.cle}
                type="button"
                onClick={() => setZone(entree.cle)}
                aria-pressed={actif}
                aria-label={entree.label}
                className={cn(
                  'inline-flex min-h-10 items-center justify-center gap-[7px] rounded-[7px] border px-[11px] text-[12px] font-bold whitespace-nowrap transition-colors max-[470px]:px-1',
                  actif
                    ? 'border-[#23252a] bg-[#23252a] text-white'
                    : 'border-line bg-white text-slate-ink hover:border-muted-strong',
                )}
              >
                <span className="max-[470px]:hidden">{entree.label}</span>
                <span className="hidden max-[470px]:inline" aria-hidden>
                  {entree.court}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'inline-grid h-[17px] min-w-[17px] place-items-center rounded-[4px] px-[3px] text-[10px] font-bold max-[470px]:hidden',
                    actif ? 'bg-white/20 text-inherit' : 'bg-surface-paper text-muted-strong',
                  )}
                >
                  {decomptes.get(entree.cle) ?? 0}
                </span>
              </button>
            )
          })}
        </div>

        <label
          className="inline-flex items-center gap-2 text-[12px] whitespace-nowrap text-muted-strong max-[470px]:ml-auto"
          htmlFor="tri-eclairages"
        >
          Trier par
          <span className="relative inline-flex items-center">
            <select
              id="tri-eclairages"
              value={tri}
              onChange={(event) => setTri(event.target.value as Tri)}
              className="min-h-10 appearance-none rounded-[7px] border border-line bg-white py-0 pr-[31px] pl-[11px] text-[12px] font-bold text-slate-ink"
            >
              {TRIS.map((entree) => (
                <option key={entree.cle} value={entree.cle}>
                  {entree.label}
                </option>
              ))}
            </select>
            <IconChevronDown
              className="pointer-events-none absolute right-[9px] size-3.5 text-slate-ink"
              aria-hidden
            />
          </span>
        </label>
      </div>

      <ul className="grid grid-cols-2 gap-[11px] min-[651px]:grid-cols-3 min-[860px]:grid-cols-4 min-[860px]:gap-[15px]">
        {visibles.map((carte, index) => {
          const zonePrincipale = zoneDeLEmplacement(carte.emplacements[0].code)
          const presentation = presentationDeCarte(carte.nom, carte.conditionnement)
          const incompatible = carte.status === 'INCOMPATIBLE'
          return (
            <li key={carte.slug}>
              <article
                className={cn(
                  'group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-soft transition-shadow hover:border-line-strong hover:shadow-pop',
                  incompatible && 'opacity-75',
                )}
              >
                {/*
                  La photo occupe toute la largeur, sans marge, sur un fond
                  sombre : c'est ce qui donne à la grille son unité, le
                  catalogue mêlant des produits détourés sur blanc et des
                  photos de feux allumés sur fond noir.
                */}
                <div className="relative block aspect-[1.64] overflow-hidden bg-[#282b2f]">
                  {carte.image ? (
                    <Image
                      src={carte.image.url}
                      alt=""
                      fill
                      sizes="(min-width: 860px) 340px, (min-width: 651px) 33vw, 50vw"
                      /* Les premières cartes se chargent tout de suite : on les
                         voyait vides (fond noir) le temps du défilement. */
                      loading={index < 4 ? 'eager' : 'lazy'}
                      fetchPriority={index < 4 ? 'high' : 'auto'}
                      className="object-cover object-[center_54%]"
                    />
                  ) : null}
                  <span className="absolute top-2.5 left-2.5 rounded-[4px] bg-[#18191b] px-[7px] py-1 text-[11px] leading-[1.05] font-bold tracking-[0.09em] text-white uppercase max-[470px]:top-[7px] max-[470px]:left-[7px]">
                    {nomDeLaZone(zonePrincipale)}
                  </span>
                  {carte.status !== 'CONFIRMED' ? (
                    <FitmentBadge
                      status={carte.status}
                      short
                      className="absolute right-2.5 bottom-2.5 bg-white/95"
                    />
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col p-2.5 min-[651px]:p-[13px]">
                  {/* L'emplacement en étiquette, ce qu'est le produit en titre. */}
                  <p className="text-[11px] font-bold tracking-[0.04em] text-brand uppercase">
                    {carte.emplacements.map((e) => e.label).join(' · ')}
                  </p>
                  <h3 className="mt-1 text-[14px] leading-[1.22] font-extrabold tracking-[-0.023em] min-[651px]:text-[15px]">
                    {presentation.titre ?? carte.emplacements.map((e) => e.label).join(' · ')}
                  </h3>
                  {presentation.phrase ? (
                    <p className="mt-[5px] text-[12px] leading-[1.4] text-muted-strong">
                      {presentation.phrase}
                    </p>
                  ) : null}

                  {carte.quantite ? (
                    <p className="mt-1 text-[11px] text-muted-strong">
                      {carte.quantite} nécessaires pour cet emplacement
                    </p>
                  ) : null}

                  {/* La réserve appartient à SON conditionnement : « adaptateurs
                      non inclus » ne vaut pas pour le kit qui les contient. */}
                  {carte.reserve ? (
                    <p className="mt-2 rounded-[5px] bg-warn-soft px-2 py-1.5 text-[11px] leading-snug text-warn">
                      {carte.reserve}
                    </p>
                  ) : null}

                  {carte.autres.length > 0 ? (
                    <p className="mt-2 text-[11px] text-muted-strong">
                      {carte.autres.map((autre) => (
                        <span key={autre.nom} className="block">
                          {autre.nom}{' '}
                          <span className="font-bold text-slate-ink">
                            {formatPrice(autre.prixCents)}
                          </span>
                        </span>
                      ))}
                    </p>
                  ) : null}

                  {carte.verifie ? (
                    <p className="mt-2 text-[11px] text-muted">{carte.verifie}</p>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between gap-1.5 pt-3.5 max-[470px]:flex-col max-[470px]:items-stretch max-[470px]:pt-2">
                    <strong className="text-[19px] font-extrabold tracking-[-0.036em] whitespace-nowrap">
                      {formatPrice(carte.prixCents)}
                    </strong>
                    {/*
                      `after:inset-0` étend le lien à toute la vignette : on
                      clique la carte, pas seulement son bouton, et le lecteur
                      d'écran n'annonce pourtant qu'un seul lien.
                    */}
                    <Link
                      href={`/p/${carte.slug}`}
                      className="inline-flex min-h-[38px] items-center justify-center gap-[5px] rounded-lg border border-line bg-white px-[9px] text-[11px] font-bold whitespace-nowrap text-slate-ink transition-colors after:absolute after:inset-0 after:content-[''] hover:border-brand hover:bg-surface-paper hover:text-brand"
                    >
                      {incompatible ? 'Voir pourquoi' : 'Voir le pack'}
                      <IconArrowRight className="size-3.5 shrink-0" />
                    </Link>
                  </div>
                </div>
              </article>
            </li>
          )
        })}
      </ul>
    </>
  )
}
