import Image from '@/components/ui/Image'
import { IconSun } from '@/components/ui/icons'

export type HeroSectionProps = {
  content: {
    eyebrow: string
    /** Le mot entre crochets est porté en rouge. */
    title: string
    subtitle: string
    badge?: string
    ctaLabel: string
    ctaHref: string
    bullets: string[]
    /** Chemin complet depuis `public/`, ou simple nom pour `public/demo/`. */
    image: string
    imageCaption: string
  }
}

/**
 * Bandeau d'ouverture.
 *
 * Deux colonnes : la promesse à gauche sur l'aplat sombre, la photo à droite
 * dans son propre cadre. Elle montre ce que le site vend — un phare halogène
 * jaune et un phare LED blanc sur la même voiture, légendés — en une image
 * plutôt qu'en un paragraphe.
 *
 * **Il n'a pas de bouton.** L'action est le sélecteur de véhicule, juste en
 * dessous : deux appels à l'action superposés se disputaient le même geste, et
 * celui qui compte sur un site de pièces est « quelle est votre voiture ».
 *
 * **La photo n'est plus un fond, et ce n'est pas une question de goût.**
 * Posée en fond pleine largeur, elle imposait trois contraintes qui se
 * contredisaient. Le texte passait dessus, donc il fallait l'assombrir d'un
 * voile en trois régimes. Elle fait trois fois sa hauteur, donc aucun cadre ne
 * la contenait sans rogner, et ses légendes gravées se retrouvaient tranchées
 * ou noyées. Et elle s'étalait sur toute la fenêtre, donc ses 2000 px
 * n'étaient jamais assez : à 1440 px sur écran double densité, il en aurait
 * fallu 2880.
 *
 * Contenue dans une colonne, les trois tombent ensemble. Le texte a son propre
 * fond, donc plus de voile et la photo garde ses noirs. Le cadre choisit sa
 * fenêtre une fois pour toutes, donc plus de légende coupée. Et elle n'occupe
 * plus que la moitié de la largeur : le fichier existant suffit enfin.
 */
export function HeroSection({ content }: HeroSectionProps) {
  const { eyebrow, title, subtitle, badge, image, imageCaption } = content

  const src = image.startsWith('/') ? image : `/demo/${image}`

  /*
    Le titre se découpe sur les crochets : « Redonnez de l'[éclat] à votre
    voiture. » donne trois fragments dont le deuxième part en rouge. Les
    retours à la ligne du contenu sont conservés.
  */
  const fragments = title.split(/\[([^\]]+)\]/)

  return (
    <section aria-labelledby="hero-titre" className="bg-ink-hero text-white">
      {/*
        Les deux colonnes se valent presque, l'image prenant la part la plus
        large. C'est elle qui porte les légendes gravées, et chaque pixel de
        colonne en plus est un pixel de photo affiché à sa taille réelle.

        En dessous de 1024 px elles s'empilent. Le texte d'abord : c'est la
        promesse, et la photo qui la montre enchaîne directement sur le
        sélecteur de véhicule.
      */}
      <div className="container-page grid items-center gap-7 py-10 sm:gap-9 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-12 lg:py-16">
        <div>
          <p className="mb-3 text-[9px] font-bold tracking-[2.4px] text-white/80 uppercase sm:mb-4 sm:text-[10px] sm:tracking-[3px]">
            {eyebrow}
          </p>

          <h1
            id="hero-titre"
            /*
              Le plus grand corps attend 1280 px, et non 1024. Entre les deux,
              la colonne de texte ne fait plus que 480 px : à 54 px,
              « Redonnez de l'éclat à votre voiture. » y passe sur trois
              lignes et le bloc déborde la photo d'autant. À 46 px il tient
              sur deux, comme partout ailleurs.
            */
            className="m-0 text-[34px] leading-[1.04] font-extrabold tracking-[-1.2px] text-white sm:text-[46px] sm:tracking-[-1.9px] xl:text-[54px] xl:tracking-[-2.2px]"
          >
            {fragments.map((fragment, index) =>
              /* Les indices impairs sont ce qui était entre crochets. */
              index % 2 === 1 ? (
                <span key={index} className="text-brand">
                  {fragment}
                </span>
              ) : (
                <span key={index} className="whitespace-pre-line">
                  {fragment}
                </span>
              ),
            )}
          </h1>

          <p className="m-0 mt-4 text-[13px] leading-[1.7] text-white/85 sm:mt-5 sm:text-[15px] lg:text-[16px]">
            {subtitle.split(/\r?\n/).map((ligne, index) => (
              <span key={ligne} className={index === 0 ? undefined : 'block'}>
                {ligne}
              </span>
            ))}
          </p>

          {badge ? (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2.5 text-[11px] font-medium text-white/90 sm:mt-6 sm:text-[12px]">
              <IconSun className="size-[15px] shrink-0 text-white" strokeWidth={1.7} />
              {badge}
            </p>
          ) : null}
        </div>

        <figure className="m-0">
          {/*
            Le cadre de la photo, et la fenêtre qu'il découpe.

            Le rapport 16/9 n'est pas décoratif : combiné à `object-right`, il
            décide exactement ce que l'on voit. Le fichier fait trois fois sa
            hauteur ; un cadre en 16/9 en montre donc 59,3 % de la largeur, et
            calé à droite cette fenêtre va de 40,7 % à 100 %.

            Mesuré sur le fichier, cela prend tout ce qui compte et ne coupe
            rien : la légende « Halogène » occupe la bande 47,3 %–55,3 %, la
            voiture 51,5 %–89,5 %, la légende « LED » 88,8 %–99,5 %. Ce qui
            tombe, entre 0 et 40,7 %, est la paroi sombre du fond — c'est-à-dire
            précisément la partie que le voile cachait autrefois derrière le
            texte.

            C'est aussi ce qui rend la photo nette. 59,3 % de 2000 px font
            1186 px de fichier pour une colonne d'environ 600 px : sur un écran
            double densité, qui en réclame 1200, il n'y a plus d'étirement. En
            fond pleine largeur, le même fichier était étiré d'un facteur 1,44.

            `sizes` doit suivre, sans quoi `next/image` continuerait de
            commander la variante calculée pour toute la largeur de la fenêtre.
          */}
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl ring-1 ring-white/10">
            <Image
              src={src}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 52vw, 100vw"
              /*
                Qualité relevée pour ce seul visuel, et allouée dans
                next.config.ts. Le fichier arrive déjà compressé ; le repasser
                à la valeur par défaut jetait la moitié de ses octets une
                seconde fois, et les légendes gravées — de petits caractères
                sur des aplats sombres — sont ce qu'une telle passe abîme en
                premier.
              */
              quality={90}
              className="object-cover object-right"
            />
          </div>

          {/*
            La mention d'illustration passe sous la photo, où elle qualifie ce
            qu'elle décrit. Dans la colonne de texte, elle flottait sous une
            pastille sans que rien ne dise à quoi elle se rapportait.

            Elle reste sur tous les écrans : dire qu'un visuel est un rendu et
            non une photo du produit livré est une mention d'honnêteté, et elle
            pèse ici plus qu'ailleurs — l'image compare deux éclairages sur une
            même voiture, ce qui est précisément l'argument de vente.
          */}
          <figcaption className="mt-3 text-[10px] text-white/45">{imageCaption}</figcaption>
        </figure>
      </div>
    </section>
  )
}
