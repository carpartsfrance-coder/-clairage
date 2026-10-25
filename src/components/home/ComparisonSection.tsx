import Image from 'next/image'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight } from '@/components/ui/icons'

export type ComparisonSectionProps = {
  content: {
    eyebrow: string
    /** Les sauts de ligne sont significatifs : ils découpent le titre. */
    title: string
    subtitle: string
    ctaLabel: string
    ctaHref: string
    /**
     * Le visuel. Chemin complet depuis `public/`, ou simple nom de fichier
     * pour `public/demo/`.
     *
     * Facultatif, et c'est délibéré : les blocs d'accueil enregistrés en base
     * écrasent le bloc ENTIER, pas champ par champ. Une installation dont le
     * bloc date d'une autre version de ce composant peut donc arriver ici
     * sans visuel, ou avec des champs qui ne sont plus lus.
     */
    image?: string
    /** Mention obligatoire : le visuel est une simulation, pas une photo d'essai. */
    caption: string
  }
}

/** `/visuels/x.webp` reste tel quel ; `x.jpg` est cherché dans `public/demo`. */
function chemin(fichier: string) {
  return fichier.startsWith('/') ? fichier : `/demo/${fichier}`
}

/**
 * Ce que l'éclairage change ailleurs que dans les phares.
 *
 * **Le nom du composant est celui de la clé en base (`comparison`), et non de
 * son contenu.** La clé ne peut pas changer sans orpheliner les blocs déjà
 * enregistrés ; garder le fichier aligné dessus vaut mieux qu'un nom juste
 * d'un côté et faux de l'autre.
 *
 * La section a d'abord montré une voiture dont les deux phares étaient blancs
 * sous les étiquettes « Jaune » et « Blanc LED » — une différence affirmée que
 * l'image ne montrait pas. Puis un vrai comparatif halogène / LED, découpé
 * dans la photographie du bandeau d'ouverture. Mais le bandeau fait déjà cette
 * démonstration, deux écrans plus haut, en plus grand et sur la même voiture :
 * la section la répétait au lieu d'ajouter quelque chose.
 *
 * Elle montre donc l'habitacle. Autre scène, autre argument, et le bouton suit
 * — il mène aux kits d'habitacle, pas à ceux de phares.
 *
 * **Il n'y a plus d'avant / après, et c'est assumé.** Un comparatif demande
 * une paire ; la seule que nous possédions est celle du bandeau d'ouverture.
 * Assombrir une vue d'habitacle pour lui fabriquer un « avant » reviendrait à
 * inventer la différence qu'on prétend montrer.
 *
 * **Sans visuel, aucun panneau n'est affiché** et le texte prend toute la
 * largeur, plutôt qu'un cadre vide ou une image cassée.
 */
export function ComparisonSection({ content }: ComparisonSectionProps) {
  const lines = content.title.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const visuel = content.image ? chemin(content.image) : null

  return (
    <section
      aria-labelledby="comparison-heading"
      className="bg-[#1c2024] py-8 text-white lg:py-[39px]"
    >
      <div
        className={
          'container-page flex flex-col items-stretch gap-[23px] lg:items-center lg:gap-[72px] ' +
          (visuel ? 'lg:grid lg:grid-cols-[0.8fr_1.2fr]' : '')
        }
      >
        <div>
          {/*
            L'accent vient du jeton de marque éclairci. Il était en #d89b8f,
            un saumon de la maquette de référence qui n'appartenait à aucun
            jeton — comme le #e76b5d retiré du sélecteur de véhicule.
          */}
          <p className="mb-2.5 text-[10px] font-bold tracking-[1.2px] text-brand-on-dark uppercase lg:text-[11px] lg:tracking-[1.6px]">
            {content.eyebrow}
          </p>

          {/* h2 : 35 px, la seconde ligne en graisse normale et plus claire. */}
          <h2
            id="comparison-heading"
            className="mb-4 text-[30px] leading-[1.1] font-bold tracking-[-1px] text-white lg:text-[35px] lg:tracking-[-1.2px]"
          >
            {lines.map((line, index) => (
              <span
                key={`${index}-${line}`}
                className={index > 0 ? 'block font-normal text-[#e2e5e7]' : 'block'}
              >
                {line}
              </span>
            ))}
          </h2>

          <p className="mb-4 max-w-[330px] text-[13px] leading-[1.8] text-[#b0b9bc] lg:mb-[18px]">
            {content.subtitle}
          </p>

          <ButtonLink
            href={content.ctaHref}
            variant="onDark"
            className="min-h-[44px] gap-4 rounded-md border-[#667176] px-[17px] text-[13px] text-[#f0f2f1]"
            iconRight={<IconArrowRight className="size-4" />}
          >
            {content.ctaLabel}
          </ButtonLink>

          <small className="mt-[13px] block max-w-[44ch] text-[11px] leading-[1.7] text-[#8d9aa1] lg:mt-3.5">
            {content.caption}
          </small>
        </div>

        {visuel ? (
          <div className="relative h-[235px] overflow-hidden rounded-[10px] bg-[#25282b] lg:h-[290px]">
            <Image
              src={visuel}
              /*
                Porteuse de sens : c'est ce que la section démontre, pas un
                décor. Le texte à gauche parle de style ; l'image dit où.
              */
              alt="Plafonnier LED blanc allumé dans un habitacle, de nuit."
              fill
              sizes="(min-width: 1024px) 730px, 100vw"
              /*
                Ancrée en haut. Le plafonnier est dans le premier dixième de
                l'image : un cadrage centré le coupe, et la section perd le
                seul élément qu'elle a à montrer.
              */
              className="object-cover object-top"
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
