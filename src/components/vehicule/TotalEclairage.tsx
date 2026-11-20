'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addPacksToCart } from '@/lib/actions/cart'
import { annoncerAjoutPanier } from '@/lib/annonce-ajout-panier'
import { formatPrice } from '@/lib/identity'
import { IconCheck, IconPack, IconPlus } from '@/components/ui/icons'

/**
 * Ce que coûte l'éclairage complet du véhicule, et le bouton qui l'achète.
 *
 * La page alignait les prix sans jamais les additionner, alors que c'est la
 * question de qui équipe sa voiture. Le total est celui des prix affichés
 * juste en dessous, incompatibles exclus : un client qui additionne les
 * vignettes doit retomber dessus, sans quoi il doutera du reste de la page.
 *
 * **Le bouton achète exactement ce que la somme additionne** — les mêmes
 * conditionnements conseillés, dédoublonnés comme eux. Une bande qui annonce
 * 128,20 € et met autre chose au panier serait pire que pas de bande du tout.
 */
export function TotalEclairage({
  titre,
  produits,
  emplacements,
  totalCents,
  variantIds,
  lignes = [],
}: {
  titre: string
  produits: number
  /**
   * Gardé pour l'appel, plus affiché : « 8 emplacements » à côté de
   * « Ajouter les 9 packs » se contredisait en apparence. Le détail le
   * remplace.
   */
  emplacements?: number
  totalCents: number
  /** Les conditionnements conseillés, ceux-là mêmes qui composent le total. */
  variantIds: string[]
  /** Ce que contient la sélection, ligne à ligne (`totalDesCartes`). */
  lignes?: Array<{
    slug: string
    nom: string
    emplacement: string
    prixCents: number
    ajoutable: boolean
  }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null)

  function ajouter() {
    setRetour(null)
    startTransition(async () => {
      const resultat = await addPacksToCart({ variantIds })
      if (resultat.ok) {
        // La confirmation à l'écran, avec le chemin vers le panier (voir lib/annonce-ajout-panier).
        annoncerAjoutPanier({
          titre: `${variantIds.length} packs pour votre ${titre}`,
          livraison: resultat.livraison,
          note: resultat.message,
        })
        setRetour({
          ok: true,
          texte: [resultat.message ?? `${variantIds.length} packs ajoutés au panier.`, resultat.livraison]
            .filter(Boolean)
            .join(' '),
        })
        // Rafraîchit le compteur du header, rendu côté serveur.
        router.refresh()
      } else {
        setRetour({ ok: false, texte: resultat.error })
      }
    })
  }

  return (
    <section
      aria-labelledby="total-eclairage"
      className="mt-[23px] flex items-center justify-between gap-4 rounded-[11px] border border-line bg-white px-[19px] py-[17px] max-[650px]:flex-wrap max-[650px]:gap-3"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-[42px] shrink-0 place-items-center rounded-lg bg-surface-paper">
          <IconPack className="size-[23px] text-slate-ink" />
        </span>
        <div className="min-w-0">
          <h3 id="total-eclairage" className="text-[16px] leading-[1.2] font-extrabold">
            Tout l&apos;éclairage de votre {titre}
          </h3>
          <p className="mt-1 text-[12px] text-muted-strong">
            {/* « Le plus simple à monter » n'était pas démontré : la règle
                retient la solution la moins chère (relecture ChatGPT). */}
            {`Une solution par éclairage, sans doublon · ${produits} packs`}
          </p>
          {lignes.length > 0 ? (
            <details className="group mt-1.5">
              <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-[12px] font-semibold text-slate-ink underline underline-offset-2 [&::-webkit-details-marker]:hidden">
                Voir le détail de la sélection
                <span aria-hidden="true" className="transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <ul className="mt-1.5 flex flex-col gap-1 text-[12px] leading-[1.5] text-muted-strong">
                {lignes.map((ligne) => (
                  <li key={ligne.slug} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-ink">{ligne.emplacement}</span> ·{' '}
                      {ligne.nom}
                      {ligne.ajoutable ? null : (
                        <span className="text-danger"> — indisponible, non compris dans le total</span>
                      )}
                    </span>
                    <span className="shrink-0 whitespace-nowrap">{formatPrice(ligne.prixCents)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {retour ? (
            <p
              role="status"
              className={`mt-1.5 text-[12px] font-bold ${retour.ok ? 'text-ok' : 'text-danger'}`}
            >
              {retour.texte}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3 max-[650px]:ml-auto max-[650px]:w-full max-[650px]:justify-between">
        <strong className="text-[23px] font-extrabold tracking-[-0.036em] whitespace-nowrap">
          {formatPrice(totalCents)}
        </strong>
        <button
          type="button"
          onClick={ajouter}
          disabled={pending || variantIds.length === 0}
          className="inline-flex min-h-[43px] items-center justify-center gap-2.5 rounded-lg border border-line bg-white px-[15px] text-[12px] font-bold whitespace-nowrap text-slate-ink transition-colors hover:bg-surface-paper disabled:opacity-60"
        >
          {pending ? (
            'Ajout en cours…'
          ) : retour?.ok ? (
            <>
              <IconCheck className="size-4 shrink-0" />
              Ajouté au panier
            </>
          ) : (
            <>
              {/* Le nombre de ce que le bouton ajoute vraiment, pas de ce que
                  la bande additionne : une carte en rupture n'y entre pas. */}
              {variantIds.length === 1 ? 'Ajouter le pack' : `Ajouter les ${variantIds.length} packs`}
              <IconPlus className="size-4 shrink-0" />
            </>
          )}
        </button>
      </div>
    </section>
  )
}
