'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { FitmentBadge } from '@/components/ui/Badge'
import { IconHeadset } from '@/components/ui/icons'
import { formatPrice } from '@/lib/identity'
import { cn } from '@/lib/cn'
import {
  type CarteEclairage,
  type Zone,
  libelleDeLaZone,
  zoneDeLEmplacement,
  zonesPresentes,
} from '@/lib/packs-vue'

/**
 * Les éclairages d'un véhicule, en cartes, filtrables par zone.
 *
 * La grille des deux pages véhicule : celle d'une génération, qui montre ce
 * qui est documenté pour le modèle, et celle des résultats, qui montre ce qui
 * est confirmé pour la configuration retenue. Deux questions, les mêmes
 * pièces, le même client : une seule vignette.
 *
 * **La carte est titrée par l'emplacement, pas par le produit.** Sur la page
 * d'une Audi A2, « Pack LED antibrouillards pour Audi A2 » dit trois fois la
 * même chose : le titre de la page donne déjà la voiture, et la question du
 * visiteur n'est pas « quel produit ? » mais « quelle lumière je change ? ».
 * Le nom du produit reste celui de la fiche, à un clic.
 *
 * **Le filtre a trois entrées, pas huit.** « Avant / arrière / intérieur » se
 * répond d'un regard sur sa voiture ; filtrer par emplacement n'aurait servi à
 * rien, puisqu'il y en a un par carte — le filtre aurait rendu une carte.
 *
 * **La pastille de compatibilité ne s'affiche que si elle alerte.** Sur les
 * 10 295 compatibilités du catalogue, 10 293 sont confirmées : répéter
 * « Confirmé » sur chaque carte n'apprend rien, et noie les deux qui comptent.
 * Dès qu'un éclairage est « à vérifier » ou incompatible, il se détache au
 * milieu des autres au lieu de se fondre dans une rangée de pastilles vertes.
 *
 * **Les mentions rares ne tiennent pas de place quand elles manquent.** Cinq
 * compatibilités sur 10 295 portent une réserve de montage, cinq une date de
 * vérification, une seule un deuxième conditionnement. Leur réserver un bloc
 * bordé sur chaque carte — ce que faisait la page des résultats — donnait dix
 * mille cartes à trous pour en servir cinq.
 */
export function EclairagesParZone({ cartes }: { cartes: CarteEclairage[] }) {
  const [zone, setZone] = useState<Zone>('tout')

  const zones = useMemo(
    () => zonesPresentes(cartes.flatMap((c) => c.emplacements.map((e) => e.code))),
    [cartes],
  )

  const visibles = useMemo(
    () =>
      zone === 'tout'
        ? cartes
        : cartes.filter((c) => c.emplacements.some((e) => zoneDeLEmplacement(e.code) === zone)),
    [cartes, zone],
  )

  return (
    <>
      {zones.length > 2 ? (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrer par zone">
          {zones.map((entree) => (
            <button
              key={entree.cle}
              type="button"
              onClick={() => setZone(entree.cle)}
              aria-pressed={zone === entree.cle}
              className={cn(
                'h-9 rounded-full border px-4 text-[12px] font-semibold transition-colors',
                zone === entree.cle
                  ? 'border-slate-ink bg-slate-ink text-white'
                  : 'border-line-strong bg-white text-slate-ink hover:border-slate-ink',
              )}
            >
              {entree.label}
            </button>
          ))}
        </div>
      ) : null}

      {/*
        Le nombre de colonnes est dicté par les images, pas par le goût.

        Les 1 148 visuels du catalogue mesurent 219 × 183 px. Sur trois
        colonnes, la carte faisait 420 px : l'image y était soit étirée du
        double, soit posée au milieu d'un grand vide. À cinq colonnes la tuile
        fait environ 258 px, l'image la remplit à sa taille — nette, et sans
        marge perdue. C'est aussi la densité des catalogues qui en vivent :
        on voit la gamme entière du véhicule sans faire défiler.
      */}
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {visibles.map((carte) => {
          const zonePrincipale = zoneDeLEmplacement(carte.emplacements[0].code)
          const incompatible = carte.status === 'INCOMPATIBLE'
          return (
            <li key={carte.slug}>
              <Link
                href={`/p/${carte.slug}`}
                className={cn(
                  'group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:shadow-soft',
                  incompatible && 'opacity-75',
                )}
              >
                {/*
                  La vignette est contenue, sur fond blanc, et jamais agrandie.

                  Elle était en plein cadre, rognée : sur un écran large, la
                  carte faisait 420 px et l'image était tirée jusque-là. Or les
                  1 148 visuels du catalogue mesurent 219 × 183 px et les 1 110
                  photos de véhicule 220 × 147 px — c'était donc un
                  agrandissement de deux à trois fois, avant même l'écran à
                  haute densité. Flou, pixelisé, et rogné par-dessus.

                  Le cadre est donc plus bas que la hauteur native : l'image y
                  entre entière et légèrement réduite, jamais étirée. Le fond
                  blanc fait le reste du travail d'unité, que le catalogue ne
                  fait pas lui-même — la moitié des visuels sont des produits
                  détourés sur blanc, l'autre des photos de feux allumés sur
                  fond noir. Côte à côte et rognées, elles donnaient un
                  patchwork ; contenues sur le même fond, elles s'alignent.
                */}
                <span className="relative block aspect-[6/5] overflow-hidden rounded-t-xl border-b border-line bg-white p-2">
                  {carte.image ? (
                    <Image
                      src={carte.image.url}
                      alt=""
                      width={219}
                      height={183}
                      sizes="(min-width: 1280px) 240px, (min-width: 640px) 25vw, 50vw"
                      className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  ) : null}
                  {carte.status !== 'CONFIRMED' ? (
                    <FitmentBadge
                      status={carte.status}
                      short
                      className="absolute top-2.5 left-2.5 bg-white/95"
                    />
                  ) : null}
                </span>

                <span className="flex flex-1 flex-col p-3.5 fiche:p-4">
                  <span className="text-[13px] leading-tight font-bold fiche:text-[15px]">
                    {carte.emplacements.map((e) => e.label).join(' · ')}
                  </span>
                  <span className="mt-1 text-[10px] text-muted-strong fiche:text-[11px]">
                    Kit LED • {libelleDeLaZone(zonePrincipale)}
                    {carte.quantite ? ` • ${carte.quantite} nécessaires` : null}
                  </span>

                  {/* Le conditionnement ne se nomme que lorsqu'il distingue
                      deux offres : partout ailleurs, il répète le titre. */}
                  {carte.conditionnement ? (
                    <span className="mt-1.5 text-[11px] font-semibold text-slate-ink">
                      {carte.conditionnement}
                    </span>
                  ) : null}

                  {/*
                    `mt-auto` colle le prix au bas de la carte : sans lui, un
                    intitulé qui passe sur deux lignes décale son bouton et la
                    rangée part en escalier.
                  */}
                  <span className="mt-auto flex flex-col items-start gap-2 pt-3 fiche:flex-row fiche:items-center fiche:justify-between fiche:gap-3 fiche:pt-4">
                    <strong className="text-[17px] tracking-[-0.5px] fiche:text-[19px]">
                      {formatPrice(carte.prixCents)}
                    </strong>
                    <span
                      className={cn(
                        'inline-flex h-9 w-full items-center justify-center rounded-sm px-3 text-[12px] font-semibold transition-colors fiche:h-10 fiche:w-auto fiche:px-4 fiche:text-[13px]',
                        incompatible
                          ? 'border border-line-strong bg-white text-slate-ink group-hover:border-slate-ink'
                          : 'bg-brand text-white group-hover:bg-brand-dark',
                      )}
                    >
                      {incompatible ? 'Voir pourquoi' : 'Voir le kit'}
                    </span>
                  </span>

                  {carte.autres.length > 0 ? (
                    <span className="mt-2 block text-[10px] text-muted-strong fiche:text-[11px]">
                      {carte.autres.map((autre) => (
                        <span key={autre.nom} className="block">
                          {autre.nom}{' '}
                          <span className="font-semibold text-slate-ink">
                            {formatPrice(autre.prixCents)}
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : null}

                  {/* La réserve appartient à SON conditionnement : « adaptateurs
                      non inclus » ne vaut pas pour le kit qui les contient. */}
                  {carte.reserve ? (
                    <span className="mt-2 block rounded-[5px] bg-warn-soft px-2 py-1.5 text-[10px] leading-snug text-[#8d5420] fiche:text-[11px]">
                      {carte.reserve}
                    </span>
                  ) : null}

                  {carte.verifie ? (
                    <span className="mt-2 block text-[10px] text-[#9a9a9a]">{carte.verifie}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          )
        })}

        {/*
          Le conseiller : une bande qui ferme la grille, et non une tuile.

          En tuile, elle comblait « la dernière place » — une règle qui
          supposait trois colonnes. Il y en a maintenant deux à cinq selon
          l'écran, et elle se retrouvait seule sur une rangée, à moitié vide.
          En bande sur toute la largeur, elle est juste à tous les formats.
        */}
        <li className="col-span-full">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-line bg-surface-paper px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <IconHeadset className="size-6 shrink-0 text-[#696969]" strokeWidth={1.5} />
              <div className="min-w-0">
                <p className="text-[14px] font-bold">Besoin d&apos;un conseil ?</p>
                <p className="text-[11px] text-muted-strong">
                  Nous vous aidons à choisir l&apos;éclairage qui convient à votre véhicule.
                </p>
              </div>
            </div>
            <Link
              href="/contact"
              className="inline-flex h-10 shrink-0 items-center rounded-sm border border-line-strong bg-white px-4 text-[12px] font-semibold text-slate-ink transition-colors hover:border-slate-ink"
            >
              Contacter un conseiller
            </Link>
          </div>
        </li>
      </ul>
    </>
  )
}
