'use client'

import { formatPrice } from '@/lib/identity'
import { availabilityLabel, isPurchasable } from '@/lib/stock'
import { cn } from '@/lib/cn'
import { useProductConfiguration } from './ProductConfiguration'

/**
 * Titre de la fiche produit — `.product-title-block` de la maquette V2.
 *
 * Valeurs reprises au pixel : surtitre 9 px rouge à 1,7 px d'interlettrage,
 * titre 39 px / 750 avec sa seconde ligne en 33 px / 500, accroche 13 px, puis
 * la ligne de caractéristiques courtes séparées par un filet.
 *
 * **Deux ajouts de la V2, et ils répondent au même besoin : décider vite.**
 *
 * 1. La ligne de caractéristiques dit en trois mots ce que la fiche met trois
 *    écrans à établir — la teinte, le conditionnement, et si le montage est
 *    fourni. Elle suit le conditionnement choisi : annoncer « Accessoires
 *    inclus » quand le client a basculé sur les ampoules seules serait faux au
 *    moment précis où cela coûte un retour.
 * 2. Sur téléphone, le prix et la disponibilité remontent sous le titre. Le
 *    bloc d'achat arrive après la galerie, soit un écran et demi plus bas : la
 *    première question du client restait sans réponse pendant tout ce temps.
 *    Sur grand écran, le bloc d'achat est à droite, immédiatement lisible — ce
 *    rappel n'a donc pas lieu d'être et disparaît.
 *
 * Le libellé de disponibilité reste celui du catalogue (`availabilityLabel`) :
 * la maquette écrit « Disponible », la boutique distingue « En stock », « Plus
 * que 3 en stock » et « Sur commande ». Ces nuances sont une décision déjà
 * prise, et la maquette ne les connaît pas.
 */
export function ProductTitle({
  eyebrow,
  name,
  secondLine,
  tagline,
}: {
  /** Rubrique et emplacement d'éclairage, séparés par un point médian. */
  eyebrow: string[]
  name: string
  /** Seconde ligne du titre, en graisse normale. Vide si rien ne la justifie. */
  secondLine: string | null
  tagline: string | null
}) {
  const configuration = useProductConfiguration()
  const selected = configuration?.selected ?? null

  const conditionnement = selected ? PACKAGING_LABELS[selected.packaging] : null

  /*
    « Accessoires inclus » n'est vrai que si ce conditionnement fournit
    réellement un composant indispensable. Un conditionnement qui en exige sans
    les fournir affiche l'inverse — c'est l'information qui évite un colis
    inutilisable, et la maquette la porte déjà sous ce libellé.
  */
  const accessoires = selected
    ? selected.components.some((composant) => composant.required)
      ? 'Accessoires inclus'
      : selected.missingAccessories.length > 0
        ? 'Accessoires à prévoir'
        : null
    : null

  const puces = [
    secondLine ? { cle: 'teinte', texte: secondLine, pastille: true } : null,
    conditionnement ? { cle: 'conditionnement', texte: conditionnement, pastille: false } : null,
    accessoires ? { cle: 'accessoires', texte: accessoires, pastille: false } : null,
  ].filter((puce): puce is { cle: string; texte: string; pastille: boolean } => puce !== null)

  return (
    <div className="order-1">
      {eyebrow.length > 0 ? (
        <p className="mb-2 text-[8px] leading-[1.4] font-bold tracking-[1.25px] text-brand uppercase fiche:mb-[11px] fiche:text-[9px] fiche:tracking-[1.7px]">
          {eyebrow.map((partie, index) => (
            <span key={partie}>
              {index > 0 ? (
                <span aria-hidden="true" className="mx-[6px] text-[#c3c7bc]">
                  ·
                </span>
              ) : null}
              {partie}
            </span>
          ))}
        </p>
      ) : null}

      {/*
        Le titre se coupe en deux lignes de graisses différentes : le produit,
        puis ce qu'il équipe. Les deux parties restent dans le même `h1` — c'est
        un seul titre, et le découper en donnerait deux aux lecteurs d'écran.
      */}
      <h1 className="text-[31px] leading-[1.12] font-[750] tracking-[-1.1px] max-[370px]:text-[29px] fiche:text-[35px] fiche:tracking-[-1.45px] min-[1101px]:text-[39px] min-[1101px]:tracking-[-1.65px] min-[1450px]:text-[42px]">
        {name}
      </h1>

      {tagline ? (
        <p className="mt-[10px] max-w-[335px] text-[12px] leading-[1.65] text-[#70766b] fiche:mt-[14px] fiche:max-w-none fiche:text-[13px] min-[1450px]:text-[14px] min-[1450px]:text-[#65705e]">
          {tagline}
        </p>
      ) : null}

      {puces.length > 0 ? (
        <p className="mt-[11px] flex items-center text-[9px] text-[#5c6455] fiche:mt-[14px] min-[1101px]:text-[10px] min-[1450px]:text-[11px] min-[1450px]:text-[#66745a]">
          {puces.map((puce, index) => (
            <span
              key={puce.cle}
              className={cn(
                'px-[9px] fiche:px-[10px] min-[1101px]:px-[13px]',
                index === 0 && 'flex items-center gap-[6px] pl-0',
                index < puces.length - 1
                  ? 'border-r border-line'
                  : 'border-0 pr-0',
              )}
            >
              {puce.pastille ? (
                <i
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full border border-[#c9d0c2] bg-white"
                />
              ) : null}
              {puce.texte}
            </span>
          ))}
        </p>
      ) : null}

      {/*
        Prix et disponibilité sur téléphone seulement — voir l'en-tête de ce
        fichier. `max-fiche:` est le miroir exact du `(max-width:800px)` de la
        maquette.
      */}
      {selected ? (
        <div className="mt-[15px] flex items-center justify-between gap-5 fiche:hidden">
          <strong className="text-[27px] leading-[1.1] tracking-[-0.9px]">
            {formatPrice(selected.priceCents)}
          </strong>
          <span
            className={cn(
              'inline-flex items-center gap-[6px] text-[10px] font-semibold whitespace-nowrap',
              isPurchasable(selected.availability) ? 'text-ok' : 'text-muted-strong',
            )}
          >
            <i
              aria-hidden="true"
              className={cn(
                'size-[5px] rounded-full',
                isPurchasable(selected.availability) ? 'bg-ok' : 'bg-muted',
              )}
            />
            {availabilityLabel(selected.availability)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

const PACKAGING_LABELS: Record<string, string> = {
  UNIT: 'À l’unité',
  PAIR: 'La paire',
  PACK: 'Le pack',
  KIT: 'Le kit',
}
