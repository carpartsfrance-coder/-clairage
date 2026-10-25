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
 * Le comparatif halogène / blanc LED.
 *
 * **Le nom du composant est celui de la clé en base (`comparison`), et non de
 * son contenu.** La clé ne peut pas changer sans orpheliner les blocs déjà
 * enregistrés ; garder le fichier aligné dessus vaut mieux qu'un nom juste
 * d'un côté et faux de l'autre.
 *
 * Le visuel est fourni par l'éditeur et porte déjà tout ce qu'il lui faut : la
 * séparation, les deux étiquettes et la mention « Simulation illustrative ».
 * Le composant n'en rajoute aucune — il doublerait ce qui est peint dedans, et
 * deux mentions valent moins qu'une, parce qu'on finit par n'en lire aucune.
 *
 * Son seul travail est donc de ne rien abîmer : le cadre prend le rapport du
 * fichier, de sorte qu'aucune largeur ne rogne la mention ni ne décentre la
 * séparation.
 *
 * **La mention du bloc va plus loin que « illustration ».** Une comparaison de
 * faisceau laisse entendre un résultat, or celui-ci dépend de l'optique du
 * véhicule autant que de l'ampoule. La section le dit, parce qu'une déception
 * se paie au service après-vente et qu'une ligne coûte moins cher.
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
          /*
            Le cadre prend le rapport exact du fichier (1672/941), et non une
            hauteur fixe. L'image porte sa mention « Simulation illustrative »
            dans ses 7 % inférieurs : un panneau panoramique l'aurait rognée,
            et la mention aurait disparu de l'écran tout en restant dans le
            fichier. Au rapport du fichier, rien n'est recadré à aucune
            largeur — ni la mention, ni les deux étiquettes, ni la séparation
            centrale, qui resterait sinon centrée par chance plutôt que par
            construction.
          */
          <div className="relative aspect-[1672/941] overflow-hidden rounded-[10px] bg-[#25282b]">
            <Image
              src={visuel}
              /*
                Porteuse de sens : c'est le comparatif lui-même, pas un décor.
                Le texte alternatif dit ce que montre l'image ET qu'elle est
                une simulation : un lecteur d'écran ne voit pas la mention
                peinte dans le coin.
              */
              alt="Comparatif simulé, de nuit, depuis le poste de conduite : à gauche la route éclairée en halogène, à droite la même route éclairée en LED."
              fill
              sizes="(min-width: 1024px) 730px, 100vw"
              className="object-cover object-center"
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
