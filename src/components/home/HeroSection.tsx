import Image from 'next/image'
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
    /** Repères posés sur l'image, en pourcentage de sa largeur. */
    annotations?: Array<{ label: string; x: number }>
    imageCaption: string
  }
}

/**
 * Bandeau d'ouverture.
 *
 * Le texte occupe la gauche sur fond assombri, la voiture la droite, et deux
 * repères désignent ses phares — l'un halogène, l'autre LED. C'est la
 * démonstration que le site vend, faite en une image plutôt qu'en un
 * paragraphe.
 *
 * **Il n'a pas de bouton.** L'action est le sélecteur de véhicule, juste en
 * dessous : deux appels à l'action superposés se disputaient le même geste, et
 * celui qui compte sur un site de pièces est « quelle est votre voiture ».
 *
 * Sur téléphone, la bande reste courte et les repères disparaissent : à 390 px
 * de large, deux étiquettes posées sur des phares distants de 30 % de l'image
 * se chevauchent. Le voile y est franc, la photo passant au rang d'ambiance —
 * mesuré, son ciel urbain est éclairé et n'offre aucune zone sombre où poser
 * du texte.
 */
export function HeroSection({ content }: HeroSectionProps) {
  const { eyebrow, title, subtitle, badge, image, annotations = [], imageCaption } = content

  const src = image.startsWith('/') ? image : `/demo/${image}`

  /*
    Le titre se découpe sur les crochets : « Redonnez de l'[éclat] à votre
    voiture. » donne trois fragments dont le deuxième part en rouge. Les
    retours à la ligne du contenu sont conservés.
  */
  const fragments = title.split(/\[([^\]]+)\]/)

  return (
    <section aria-labelledby="hero-titre" className="relative overflow-hidden bg-ink-hero text-white">
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        /*
          Le cadrage. Entre 640 et 1023 px, le cadre est bien plus haut que
          l'image n'est faite pour, et `object-cover` ampute près de la moitié
          de la largeur : les deux phares n'y tiennent pas ensemble. À 62 % le
          phare halogène reste dégagé et la LED s'approche du bord droit, voire
          en sort vers 640 px. Porter la visée plus à droite pour rattraper la
          LED fait passer l'halogène derrière le titre — essayé, c'est pire.
          Cette bande montre donc la voiture sans garantir les deux phares,
          et c'est pourquoi les repères n'y sont pas affichés : ils
          désigneraient un phare hors champ. Au-delà de 1024 px le rapport du
          cadre rejoint celui de l'image, il n'y a plus de recadrage, et les
          deux phares sont là.
        */
        className="object-cover object-[72%_center] sm:object-[62%_center] lg:object-[center_center]"
      />

      {/*
        Le voile. Franc et couvrant sur téléphone, dégradé vers la droite
        au-delà : la largeur y suffit à séparer le texte du sujet, et la
        voiture peut rester nette là où personne n'écrit.

        Les paliers sont mesurés, pas choisis à l'œil. Le voile tient sa pleine
        densité jusqu'à 42 % — la ligne de titre la plus longue s'arrête vers
        52 % — puis chute vite, parce que le phare halogène est à 55,5 % de la
        largeur et la LED à 85,5 %. Un dégradé qui descendait doucement dès
        34 % noyait l'halogène tout en laissant la LED éclatante : la
        comparaison que vend cette image se trouvait exagérée par la mise en
        scène, et non par la photo. Ici les deux phares reçoivent le même
        traitement, et l'écart entre eux reste celui du cliché.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#070a0ef2_0%,#070a0edb_60%,#070a0ec4_100%)] sm:bg-[linear-gradient(90deg,#070a0ef7_0%,#070a0ee0_42%,#070a0e99_52%,#070a0e33_62%,#070a0e0a_80%,transparent_100%)]" />

      {/*
        Les repères sur les phares.

        L'abscisse est mesurée sur le fichier et reste exacte : au-delà de
        1024 px le cadre est toujours plus large que haut par rapport à
        l'image, donc `object-cover` ne rogne jamais les côtés.

        L'ordonnée, elle, n'est pas donnée — elle est fixée à l'axe médian.
        C'est le seul point qu'un recadrage centré laisse en place quelle que
        soit la hauteur du cadre ; une ordonnée en pourcentage, elle, dérivait
        dès que le cadre cessait d'avoir le rapport du fichier. Les deux
        phares sont mesurés à 49,1 % et 50,5 % de la hauteur, soit l'axe à
        1,5 % près : si la photo change, c'est cette mesure qu'il faut refaire.

        L'étiquette est posée au-dessus du trait, et non à son pied : sur le
        phare LED, du blanc sur du blanc incandescent ne se lit pas.

        `aria-hidden` : ce sont des légendes d'image, et l'image est
        décorative — le texte à gauche dit déjà ce que la photo montre.
      */}
      {annotations.length > 0 ? (
        <div aria-hidden="true" className="absolute inset-0 hidden lg:block">
          {annotations.map((repere) => (
            <span
              key={repere.label}
              className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
              style={{ left: `${repere.x}%`, top: '50%' }}
            >
              <span className="text-[10px] font-semibold tracking-[1.6px] whitespace-nowrap text-white uppercase drop-shadow-[0_1px_4px_#070a0e] drop-shadow-[0_0_10px_#070a0ecc]">
                {repere.label}
              </span>
              <span className="mt-1.5 h-10 w-px bg-gradient-to-b from-white/10 to-white/70" />
            </span>
          ))}
        </div>
      ) : null}

      {/*
        Au-delà de 1024 px, le cadre prend EXACTEMENT le rapport du fichier
        (2000/755). Sans recadrage, un pourcentage mesuré sur l'image vaut le
        même pourcentage du cadre — c'est ce qui permet aux repères de tomber
        sur les phares. Les poser en pourcentage du cadre alors que
        `object-cover` rogne les côtés les décalait, et l'étiquette « LED »
        sortait du champ.

        En dessous, le rapport ne tient plus — la hauteur vient du texte — donc
        les repères sont masqués plutôt que faux.
      */}
      <div className="container-page relative flex min-h-[320px] items-center sm:min-h-[460px] lg:aspect-[2000/755] lg:min-h-[380px]">
        <div className="z-[1] w-full py-8 sm:max-w-[460px] sm:py-12 lg:max-w-[560px]">
          <p className="mb-3 text-[9px] font-bold tracking-[2.4px] text-white/80 uppercase sm:mb-4 sm:text-[10px] sm:tracking-[3px]">
            {eyebrow}
          </p>

          <h1
            id="hero-titre"
            className="m-0 text-[34px] leading-[1.04] font-extrabold tracking-[-1.2px] text-white sm:text-[46px] sm:tracking-[-1.9px] lg:text-[58px] lg:tracking-[-2.4px]"
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

          {/*
            La mention d'illustration.

            Elle reste sur tous les écrans : dire qu'un visuel est un rendu et
            non une photo du produit livré est une mention d'honnêteté, et elle
            pèse ici plus qu'ailleurs — l'image compare deux éclairages sur une
            même voiture, ce qui est précisément l'argument de vente.
          */}
          <p className="mt-5 text-[10px] text-white/45 sm:mt-7">{imageCaption}</p>
        </div>
      </div>
    </section>
  )
}
