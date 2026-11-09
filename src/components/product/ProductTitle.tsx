'use client'

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
 * 2. (Refonte LEDVROOM) Le rappel du prix sous le titre, sur téléphone, est
 *    retiré : la barre d'achat fixe le montre déjà en bas de l'écran, et le
 *    même prix apparaissait trois fois sur un téléphone.
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
  vehiculeMobile = null,
}: {
  /** Rubrique et emplacement d'éclairage, séparés par un point médian. */
  eyebrow: string[]
  name: string
  /** Seconde ligne du titre, en graisse normale. Vide si rien ne la justifie. */
  secondLine: string | null
  tagline: string | null
  /**
   * Sur téléphone, le véhicule rejoint le surtitre (« Kits complets · Audi A1
   * (2010–2018) ») et l'accroche automatique, qui le redisait, est masquée.
   */
  vehiculeMobile?: string | null
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
      {eyebrow.length > 0 || vehiculeMobile ? (
        <p className="mb-2 text-[11px] leading-[1.4] font-bold tracking-[1.2px] text-brand uppercase fiche:mb-2.5 fiche:text-[12px] fiche:tracking-[1.4px]">
          {eyebrow.map((partie, index) => (
            <span key={partie}>
              {index > 0 ? (
                <span aria-hidden="true" className="mx-[6px] text-[#c2c2c2]">
                  ·
                </span>
              ) : null}
              {partie}
            </span>
          ))}
          {vehiculeMobile ? (
            <span className="fiche:hidden">
              {eyebrow.length > 0 ? (
                <span aria-hidden="true" className="mx-[6px] text-[#c2c2c2]">
                  ·
                </span>
              ) : null}
              {vehiculeMobile}
            </span>
          ) : null}
        </p>
      ) : null}

      {/*
        Le titre se coupe en deux lignes de graisses différentes : le produit,
        puis ce qu'il équipe. Les deux parties restent dans le même `h1` — c'est
        un seul titre, et le découper en donnerait deux aux lecteurs d'écran.
      */}
      <h1 className="text-[28px] leading-[1.12] font-[750] tracking-[-0.8px] max-[370px]:text-[26px] fiche:text-[34px] fiche:tracking-[-1.1px] min-[1101px]:text-[38px] min-[1101px]:tracking-[-1.3px]">
        {name}
      </h1>

      {tagline ? (
        <p
          className={cn(
            'mt-2 text-[14px] leading-[1.6] text-[#5f6266] fiche:mt-2.5 fiche:text-[15px]',
            vehiculeMobile && 'max-fiche:hidden',
          )}
        >
          {tagline}
        </p>
      ) : null}

      {/*
        Un mot seul (« Le kit ») ne dit rien de plus que le titre : la ligne ne
        s'affiche qu'à partir de deux caractéristiques, ou pour la teinte seule.
        Les marges sont posées côté par côté : un `pl-0` sur la première puce
        serait écrasé par le `fiche:px-…` du point de rupture, d'où le décalage.
      */}
      {puces.length > 1 || puces[0]?.cle === 'teinte' ? (
        <p className="mt-3 flex flex-wrap items-center gap-y-1 text-[12px] text-[#55585b] fiche:mt-3.5 fiche:text-[13px]">
          {puces.map((puce, index) => (
            <span
              key={puce.cle}
              className={cn(
                index > 0 && 'pl-[9px] fiche:pl-[10px] min-[1101px]:pl-[13px]',
                index < puces.length - 1 &&
                  'border-r border-line pr-[9px] fiche:pr-[10px] min-[1101px]:pr-[13px]',
                puce.pastille && 'flex items-center gap-[6px]',
              )}
            >
              {puce.pastille ? (
                <i
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full border border-[#c9c9c9] bg-white"
                />
              ) : null}
              {puce.texte}
            </span>
          ))}
        </p>
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
