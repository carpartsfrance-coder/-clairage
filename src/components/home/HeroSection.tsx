import Image from 'next/image'
import Link from 'next/link'
import { IconArrowRight, IconCheck } from '@/components/ui/icons'

export type HeroSectionProps = {
  content: {
    eyebrow: string
    title: string
    subtitle: string
    ctaLabel: string
    ctaHref: string
    bullets: string[]
    image: string
    imageCaption: string
  }
}

/**
 * Bandeau d'ouverture — repris du code réel de la maquette v3
 * (`reference-site/index.html` + `home.css`, section `.home-hero`).
 *
 * Les valeurs sont celles de la référence, pas des approximations :
 * fond #111820, voile en dégradé à 90°, bloc de texte en 435 px de haut,
 * titre à 55 px/-2.3 px d'interlettrage, et l'étiquette « blanc pur » ancrée
 * en bas à droite. Les correspondances figurent en commentaire au fil du code.
 *
 * Ce qui n'en vient PAS, et qui reste : la hauteur s'adapte toujours à la
 * fenêtre en dessous de la valeur de référence. Un bandeau fixe de 435 px
 * repousse le sélecteur de véhicule hors du premier écran sur un portable de
 * 768 px de haut, ce que l'audit précédent demandait justement de corriger.
 * La référence sert de plafond, pas de plancher.
 */
export function HeroSection({ content }: HeroSectionProps) {
  const { eyebrow, title, subtitle, ctaLabel, ctaHref, bullets, image, imageCaption } = content

  // La référence coupe le titre et le texte à la main (<br>). On reprend ces
  // coupes : elles font partie de la composition, et le titre est écrit pour
  // tenir en deux lignes.
  const titleLines = title.split(/\s*\n\s*|(?<=jaune)\s+/).filter(Boolean)

  return (
    <section
      aria-labelledby="hero-titre"
      className="relative overflow-hidden bg-[#111820] text-white"
    >
      {/*
        .home-hero-copy : padding 40px 0 38px, max-width 510px.

        Sur grand écran, ce bloc se pose SUR la photo, comme la référence.
        Sous 1024 px il passe au-dessus d'elle, dans le flux : le texte
        retrouve un fond uni, et la voiture cesse d'être à moitié cachée
        derrière lui. Il vient donc en premier dans le document, ce qui met
        aussi le titre et l'appel à l'action en haut d'écran sans défilement.
      */}
      <div className="container-page relative z-[1] lg:flex lg:min-h-[clamp(22rem,calc(100svh-23rem),435px)] lg:items-center lg:justify-between">
        <div className="py-7 lg:max-w-[510px] lg:py-0 lg:pt-10 lg:pb-[38px]">
          {/* .home-hero .eyebrow : 9px / 2px d'interlettrage, couleur #e6b0a7. */}
          <p className="mb-[14px] text-[7px] font-bold tracking-[1.4px] text-[#e6b0a7] uppercase lg:mb-[19px] lg:text-[9px] lg:tracking-[2px]">
            {eyebrow}
          </p>

          {/* h1 : 55px / 800 / -2.3px, interligne 1.04. */}
          <h1
            id="hero-titre"
            className="m-0 mb-[18px] text-[34px] leading-[1.06] font-extrabold tracking-[-1.3px] text-white sm:text-[42px] sm:tracking-[-1.8px] lg:mb-[22px] lg:text-[55px] lg:tracking-[-2.3px]"
          >
            {titleLines.map((line, index) => (
              <span key={line} className="block">
                {index === titleLines.length - 1 ? <span>{line}</span> : line}
              </span>
            ))}
          </h1>

          {/*
            La largeur n'est plus bridée à 235 px : rien ne se trouve à côté
            sur mobile, et une colonne étroite au milieu du vide hachait le
            texte en lignes de trois mots.
          */}
          <p className="m-0 mb-6 text-[12px] leading-[1.65] text-[#d4dade] lg:mb-[23px] lg:max-w-[360px] lg:text-[13px] lg:leading-[1.7] lg:text-[#cdd1d3]">
            {subtitle.split(/\r?\n/).map((ligne, index) => (
              <span key={ligne} className={index === 0 ? undefined : 'block'}>
                {ligne}
              </span>
            ))}
          </p>

          {/*
            L'appel à l'action occupe toute la largeur du téléphone. Il n'en
            prenait que la moitié, ce qui en faisait la cible la plus petite
            de l'écran alors que c'est la plus importante. Au-delà de 640 px
            il redevient à sa taille : un bouton de 800 px de large ne se lit
            plus comme un bouton.
          */}
          <Link
            href={ctaHref}
            className="flex min-h-[48px] w-full items-center justify-center gap-[15px] rounded-[7px] bg-brand px-[15px] py-[11px] text-[13px] font-bold text-white transition-colors hover:bg-brand-dark sm:inline-flex sm:w-auto lg:min-h-[45px] lg:gap-[22px] lg:px-[18px] lg:py-3 lg:text-[12px]"
          >
            {ctaLabel}
            <IconArrowRight className="size-[17px] shrink-0" />
          </Link>

          {/* .hero-promises : 9px, #b7bfc3, gap 23px, puces vertes 12px. */}
          {bullets.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-x-[18px] gap-y-2 text-[8px] text-[#b7bfc3] lg:mt-[23px] lg:gap-[23px] lg:text-[9px]">
              {bullets.map((bullet) => (
                <span key={bullet} className="flex items-center gap-[7px]">
                  <IconCheck
                    className="size-[10px] shrink-0 text-[#b8c6b9] lg:size-3"
                    strokeWidth={2}
                  />
                  {bullet}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/*
        La photo.

        Sous 1024 px, elle est dans le flux avec un rapport 5/4 : la voiture
        tient entière dans le cadre au lieu d'être rognée par la hauteur que
        le texte imposait. Au-dessus, elle redevient le fond de toute la
        section — `fill` se cale sur ce conteneur, positionné dans les deux
        cas, donc rien ne change côté grand écran.
      */}
      <div className="relative aspect-[5/4] w-full sm:aspect-[16/9] lg:absolute lg:inset-0 lg:aspect-auto">
        <Image
          src={`/demo/${image}`}
          alt=""
          fill
          priority
          sizes="100vw"
          /* .home-hero-photo : object-fit cover, centré sur grand écran ;
             la référence décale à 58 % puis 68 % en descendant en largeur. */
          className="object-cover object-[62%_center] sm:object-[58%_center] lg:object-center"
        />

        {/*
          .hero-shade — le voile de la référence.

          Sous 1024 px il n'a plus à rendre un texte lisible, puisque le texte
          n'est plus dessus : il se réduit à un fondu bas, juste assez pour
          asseoir la légende et raccorder la photo au fond sombre.
        */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b131b55_0%,transparent_22%,transparent_62%,#0b131bcc_100%)] lg:bg-[linear-gradient(90deg,#11171bec_0%,#11171bb3_29%,#11171b0d_63%,transparent)]" />

        {/*
          .hero-lamp-tag — la température de couleur et, en dessous, la
          mention d'illustration. Celle-ci reste : le visuel est un rendu, pas
          une photo du produit livré. Elle est maintenant ancrée à la photo
          qu'elle décrit, et non au bas de la section — sur mobile elle en
          était séparée par un grand vide.
        */}
        <div className="absolute right-[18px] bottom-[26px] z-[1] flex items-center gap-[7px] text-[7px] tracking-[1px] text-[#e3e6e7] lg:right-8 lg:bottom-6 lg:text-[8px]">
          <span className="size-[5px] shrink-0 rounded-full bg-white" />
          BLANC PUR · 6 000 K
          <small className="absolute top-[14px] right-0 text-[6px] tracking-normal whitespace-nowrap text-[#8e9aa2] lg:top-[18px] lg:text-[7px]">
            {imageCaption}
          </small>
        </div>
      </div>
    </section>
  )
}
