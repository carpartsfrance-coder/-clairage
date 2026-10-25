'use client'

import Image from 'next/image'
import Link from 'next/link'
import { formatPrice } from '@/lib/identity'
import { IconHeadset, IconChevronRight } from '@/components/ui/icons'
import { useProductConfiguration } from './ProductConfiguration'

/**
 * Ce que réunit le conditionnement choisi — `#contenu` / `.kit-layout`.
 *
 * Valeurs reprises de `styles.css` : visuel de 280 px à gauche (.85fr) avec
 * son bandeau d'étiquette, liste numérotée à droite (1.15fr), 49 px d'écart,
 * lignes de 17 px séparées par un filet, puis la ligne d'accompagnement.
 *
 * **Deux choses que la référence ne pouvait pas faire, et que celle-ci doit.**
 *
 * 1. La liste suit le conditionnement *réellement sélectionné* dans le bloc
 *    d'achat. Décrire « le kit » pendant que le client a retenu les ampoules
 *    seules, c'est la contradiction que cette fiche s'interdit.
 * 2. Les prix affichés sont ceux des composants vendus seuls. Leur somme ne
 *    fait pas le prix du kit — ici 103,50 € contre 99,90 €. La ligne de
 *    synthèse dit les deux chiffres plutôt que de laisser croire à une
 *    addition qui tomberait juste.
 */
export function KitContents({
  image,
  imageAlt,
}: {
  image: string | null
  imageAlt: string
}) {
  const configuration = useProductConfiguration()
  const selected = configuration?.selected
  if (!selected) return null

  const composants = selected.components

  /*
    Conditionnement sans composition : la référence n'a pas ce cas, et laisser
    la section vide donnerait un titre sans contenu. On dit ce que le
    conditionnement est, et où lire ce qu'il exige en plus.
  */
  if (composants.length === 0) {
    return (
      <p className="max-w-[580px] text-[11px] leading-[1.8] text-[#7a7a7a]">
        <strong className="text-slate-ink">{selected.name}</strong> — ce conditionnement ne
        contient que le produit lui-même, sans accessoire de montage. Ce que votre véhicule exige
        en plus est indiqué dans le bloc d&apos;achat et à l&apos;étape Installation.
      </p>
    )
  }

  const sommeSeparee = composants.reduce((total, composant) => total + composant.priceCents, 0)
  const economie = sommeSeparee - selected.priceCents

  return (
    /* .kit-layout : visuel à gauche, composition à droite. */
    <div className="flex flex-col gap-[11px] fiche:grid fiche:grid-cols-[0.85fr_1.15fr] fiche:items-center fiche:gap-[49px]">
      {image ? (
        /* .kit-visual : 280 px, fond papier, étiquette en bas. */
        <div className="relative h-[250px] overflow-hidden rounded-[9px] bg-surface-paper fiche:h-[280px]">
          <Image
            src={image}
            alt={imageAlt}
            fill
            sizes="(min-width: 801px) 40vw, 100vw"
            className="object-cover mix-blend-multiply"
          />
          <span className="absolute right-[18px] bottom-3.5 left-[18px] flex justify-between border-t border-[#ddd] pt-2.5 text-[8px] tracking-[1px] uppercase">
            {selected.name}
            <strong className="text-[10px] tracking-normal normal-case">
              {formatPrice(selected.priceCents)} TTC
            </strong>
          </span>
        </div>
      ) : null}

      <div>
        <ul>
          {composants.map((composant, index) => (
            /* .kit-item : numéro, intitulé, prix du composant vendu seul. */
            <li
              key={composant.sku}
              className="flex items-center gap-3 border-b border-line py-[15px] fiche:gap-4 fiche:py-[17px]"
            >
              <span
                aria-hidden="true"
                className="mt-[3px] self-start text-[11px] tracking-[1px] text-[#a0a0a0]"
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <div className="min-w-0 flex-1">
                <strong className="text-[12px]">
                  {composant.quantity > 1 ? `${composant.quantity} × ` : ''}
                  <Link
                    href={`/p/${composant.productSlug}`}
                    className="underline-offset-[3px] hover:underline"
                  >
                    {composant.productName}
                  </Link>
                </strong>
                <p className="my-[3px] text-[10px] text-[#828282]">
                  {composant.variantName}
                  {!composant.required ? ' · facultatif' : null}
                </p>
              </div>

              <span className="shrink-0 text-[11px] font-bold whitespace-nowrap">
                {formatPrice(composant.priceCents)}
              </span>
            </li>
          ))}
        </ul>

        {/*
          Le chiffre que la référence n'affiche pas, et qui change la lecture :
          ce que coûtent les mêmes pièces achetées séparément.
        */}
        <p className="flex items-baseline justify-between gap-4 border-b border-line py-[15px] text-[10px] text-[#828282] fiche:py-[17px]">
          <span>
            Les mêmes pièces achetées séparément
            {economie > 0 ? ` — soit ${formatPrice(economie)} de plus` : null}
          </span>
          <span className="shrink-0 font-bold whitespace-nowrap text-slate-ink">
            {formatPrice(sommeSeparee)}
          </span>
        </p>

        {/* .included-help : l'accompagnement, qui vient avec. */}
        <Link
          href="/guides"
          className="flex items-center gap-2.5 py-4 text-[#40664b] hover:underline"
        >
          <IconHeadset className="size-5 shrink-0" />
          <span className="flex-1">
            <strong className="block text-[10px]">
              Et vous n&apos;êtes pas seul pour le montage.
            </strong>
            <small className="mt-0.5 block text-[9px] text-[#828282]">
              Guides de montage et assistance avant comme après l&apos;achat.
            </small>
          </span>
          <IconChevronRight className="size-4 shrink-0" />
        </Link>
      </div>
    </div>
  )
}
