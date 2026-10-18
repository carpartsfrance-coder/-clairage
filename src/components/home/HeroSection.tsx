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
      <Image
        src={`/demo/${image}`}
        alt=""
        fill
        priority
        sizes="100vw"
        /* .home-hero-photo : object-fit cover, centré sur grand écran ;
           la référence décale à 58 % puis 68 % en descendant en largeur. */
        className="object-cover object-[68%_center] sm:object-[58%_center] lg:object-center"
      />

      {/*
        .hero-shade — le voile de la référence, à l'identique.
        Horizontal sur grand écran ; vertical puis horizontal en dessous de
        800 px, où le texte passe au-dessus de la photo.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b131be3_0%,#0b131b96_30%,#0b131b20_57%,#0b131b14_80%,#0b131b84),linear-gradient(90deg,#0c141bc2,#0c141b00_85%)] lg:bg-[linear-gradient(90deg,#11171bec_0%,#11171bb3_29%,#11171b0d_63%,transparent)]" />

      {/* .home-hero-inner : min-height 435px (530 sous 800px), flex entre. */}
      <div className="container-page relative flex min-h-[530px] items-start justify-between lg:min-h-[clamp(22rem,calc(100svh-23rem),435px)] lg:items-center">
        {/* .home-hero-copy : padding 40px 0 38px, max-width 510px (320 en mobile). */}
        <div className="z-[1] max-w-[320px] py-[33px] pb-[36px] lg:max-w-[510px] lg:pt-10 lg:pb-[38px]">
          {/* .home-hero .eyebrow : 9px / 2px d'interlettrage, couleur #e6b0a7. */}
          <p className="mb-[14px] text-[7px] font-bold tracking-[1.4px] text-[#e6b0a7] uppercase lg:mb-[19px] lg:text-[9px] lg:tracking-[2px]">
            {eyebrow}
          </p>

          {/* h1 : 55px / 800 / -2.3px, interligne 1.04. */}
          <h1
            id="hero-titre"
            className="m-0 mb-[22px] text-[32px] leading-[1.04] font-extrabold tracking-[-1.2px] text-white sm:text-[42px] sm:tracking-[-1.8px] lg:text-[55px] lg:tracking-[-2.3px]"
          >
            {titleLines.map((line, index) => (
              <span key={line} className="block">
                {index === titleLines.length - 1 ? <span>{line}</span> : line}
              </span>
            ))}
          </h1>

          {/* p : 13px, #cdd1d3, interligne 1.7, max-width 360px. */}
          <p className="m-0 mb-5 max-w-[235px] text-[12px] leading-[1.65] text-[#d4dade] lg:mb-[23px] lg:max-w-[360px] lg:text-[13px] lg:leading-[1.7] lg:text-[#cdd1d3]">
            {subtitle.split(/\r?\n/).map((ligne, index) => (
              <span key={ligne} className={index === 0 ? undefined : 'block'}>
                {ligne}
              </span>
            ))}
          </p>

          {/* .primary, variante hero : min-height 45px, 12px, padding 12/18, gap 22. */}
          <Link
            href={ctaHref}
            className="inline-flex min-h-[43px] items-center justify-center gap-[15px] rounded-[7px] bg-brand px-[15px] py-[11px] text-[11px] font-bold text-white transition-colors hover:bg-brand-dark lg:min-h-[45px] lg:gap-[22px] lg:px-[18px] lg:py-3 lg:text-[12px]"
          >
            {ctaLabel}
            <IconArrowRight className="size-[17px] shrink-0" />
          </Link>

          {/* .hero-promises : 9px, #b7bfc3, gap 23px, puces vertes 12px. */}
          {bullets.length > 0 ? (
            <div className="mt-[17px] flex gap-[17px] text-[8px] text-[#b7bfc3] lg:mt-[23px] lg:gap-[23px] lg:text-[9px]">
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
        .hero-lamp-tag — ancrée en bas à droite, hors du flux.
        La référence y met la température de couleur et, en dessous, la mention
        d'illustration. Celle-ci reste : le visuel est un rendu, pas une photo
        du produit livré.
      */}
      <div className="absolute right-[22px] bottom-[34px] z-[1] flex items-center gap-[7px] text-[7px] tracking-[1px] text-[#e3e6e7] lg:right-8 lg:bottom-6 lg:text-[8px]">
        <span className="size-[5px] shrink-0 rounded-full bg-white" />
        BLANC PUR · 6 000 K
        <small className="absolute top-[18px] right-0 text-[6px] tracking-normal whitespace-nowrap text-[#8e9aa2] lg:text-[7px]">
          {imageCaption}
        </small>
      </div>
    </section>
  )
}
