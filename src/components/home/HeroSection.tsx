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
        La photo, en fond à toutes les largeurs.

        Le cadrage est décalé vers la voiture sous 1024 px : elle occupe le
        centre-droit de l'image, et le cadrage centré de la référence la
        poussait hors champ sur un écran étroit.
      */}
      <Image
        src={`/demo/${image}`}
        alt=""
        fill
        priority
        sizes="100vw"
        /* .home-hero-photo : object-fit cover, centré sur grand écran ;
           la référence décale à 58 % puis 68 % en descendant en largeur. */
        className="object-cover object-[64%_62%] sm:object-[58%_center] lg:object-center"
      />

      {/*
        .hero-shade — le voile.

        Sur téléphone il est franc et couvre tout le cadre. Ce n'est pas un
        renoncement : la photo est un ciel urbain ÉCLAIRÉ, mesuré entre 78 et
        101 de luminosité sur sa bande haute. Il n'existe aucune zone sombre où
        poser du texte, donc tout voile assez fort pour rendre le titre lisible
        assombrit forcément ce qu'il laisse voir. La photo devient une
        ambiance derrière le message plutôt qu'un sujet montré — c'est le parti
        des vendeurs de pièces, et il est cohérent avec un visiteur qui vient
        chercher, pas contempler.

        Au-dessus de 1024 px, le dégradé horizontal de la référence reprend : la
        largeur y suffit à séparer le texte du sujet.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#0b131bf2_0%,#0b131bd9_55%,#0b131bb8_100%)] sm:bg-[linear-gradient(180deg,#0b131be3_0%,#0b131b96_30%,#0b131b20_57%,#0b131b14_80%,#0b131b84)] lg:bg-[linear-gradient(90deg,#11171bec_0%,#11171bb3_29%,#11171b0d_63%,transparent)]" />

      {/*
        .home-hero-inner : min-height 435px (530 sous 800px), flex entre.

        Sur téléphone la bande tombe à 300 px. Elle en faisait 530, puis 652
        après un premier remaniement : le sélecteur de véhicule, qui est le
        vrai point d'entrée d'un site de pièces, se trouvait repoussé hors de
        l'écran. Une page d'accueil qui retient le visiteur devant une photo
        avant de lui demander sa voiture travaille contre elle-même.
      */}
      <div className="container-page relative flex min-h-[300px] items-center justify-between sm:min-h-[430px] sm:items-start lg:min-h-[clamp(22rem,calc(100svh-23rem),435px)] lg:items-center">
        {/* .home-hero-copy : padding 40px 0 38px, max-width 510px (320 en mobile). */}
        <div className="z-[1] w-full py-6 sm:max-w-[320px] sm:py-[33px] sm:pb-[36px] lg:max-w-[510px] lg:pt-10 lg:pb-[38px]">
          {/* .home-hero .eyebrow : 9px / 2px d'interlettrage, couleur #e6b0a7. */}
          <p className="mb-2.5 text-[7px] font-bold tracking-[1.4px] text-[#e6b0a7] uppercase lg:mb-[19px] lg:text-[9px] lg:tracking-[2px]">
            {eyebrow}
          </p>

          {/* h1 : 55px / 800 / -2.3px, interligne 1.04. */}
          <h1
            id="hero-titre"
            className="m-0 mb-3 text-[30px] leading-[1.08] font-extrabold tracking-[-1.1px] text-white sm:mb-[22px] sm:text-[42px] sm:tracking-[-1.8px] lg:text-[55px] lg:tracking-[-2.3px]"
          >
            {titleLines.map((line, index) => (
              <span key={line} className="block">
                {index === titleLines.length - 1 ? <span>{line}</span> : line}
              </span>
            ))}
          </h1>

          {/*
            Sur téléphone, seule la promesse principale est gardée — la
            dernière ligne, celle qui dit ce qu'on vend. Les deux premières
            énumèrent des rubriques que le menu porte déjà.
          */}
          <p className="m-0 mb-4 text-[12px] leading-[1.6] text-[#d4dade] sm:mb-5 sm:max-w-[235px] lg:mb-[23px] lg:max-w-[360px] lg:text-[13px] lg:leading-[1.7] lg:text-[#cdd1d3]">
            {subtitle.split(/\r?\n/).map((ligne, index, lignes) => (
              <span
                key={ligne}
                className={[
                  index === 0 ? '' : 'block',
                  index < lignes.length - 2 ? 'hidden sm:block' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {ligne}
              </span>
            ))}
          </p>

          {/*
            L'appel à l'action occupe toute la largeur du téléphone. Il n'en
            prenait que la moitié, ce qui en faisait la cible la plus petite
            de l'écran alors que c'est la plus importante. Au-delà de 640 px
            il reprend sa taille : un bouton de 800 px de large ne se lit plus
            comme un bouton.
          */}
          <Link
            href={ctaHref}
            className="flex min-h-[48px] w-full items-center justify-center gap-[15px] rounded-[7px] bg-brand px-[15px] py-[11px] text-[13px] font-bold text-white transition-colors hover:bg-brand-dark sm:inline-flex sm:w-auto sm:text-[11px] lg:min-h-[45px] lg:gap-[22px] lg:px-[18px] lg:py-3 lg:text-[12px]"
          >
            {ctaLabel}
            <IconArrowRight className="size-[17px] shrink-0" />
          </Link>

          {/*
            .hero-promises — masquées sur téléphone : la bande de réassurance
            qui suit immédiatement dit la même chose en plus complet
            (« Des kits adaptés au montage », « Un accompagnement avant et
            après »). Les répéter coûtait de la hauteur sans rien apprendre.
          */}
          {bullets.length > 0 ? (
            <div className="mt-[17px] hidden gap-[17px] text-[8px] text-[#b7bfc3] sm:flex lg:mt-[23px] lg:gap-[23px] lg:text-[9px]">
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

          {/*
            La mention d'illustration, sur téléphone.

            Elle ne peut pas disparaître avec la pastille décorative : dire
            qu'un visuel est un rendu et non une photo du produit livré est une
            mention d'honnêteté, et la masquer sur l'appareil le plus utilisé
            reviendrait à ne l'afficher que là où personne ne regarde.
          */}
          <p className="mt-3 text-[6px] text-[#8e9aa2] sm:hidden">{imageCaption}</p>
        </div>
      </div>

      {/*
        .hero-lamp-tag — ancrée en bas à droite, hors du flux.
        La température de couleur et, en dessous, la mention d'illustration.
        Masquée sur téléphone, où la bande de 300 px ne laisse pas la place de
        la poser sans qu'elle ne chevauche le bouton. La mention d'illustration,
        elle, est reprise dans le bloc de texte ci-dessus : elle doit paraître
        partout.
      */}
      <div className="absolute right-[22px] bottom-[34px] z-[1] hidden items-center gap-[7px] text-[7px] tracking-[1px] text-[#e3e6e7] sm:flex lg:right-8 lg:bottom-6 lg:text-[8px]">
        <span className="size-[5px] shrink-0 rounded-full bg-white" />
        BLANC PUR · 6 000 K
        <small className="absolute top-[18px] right-0 text-[6px] tracking-normal whitespace-nowrap text-[#8e9aa2] lg:text-[7px]">
          {imageCaption}
        </small>
      </div>
    </section>
  )
}
