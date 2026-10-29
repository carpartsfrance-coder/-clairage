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
 * **Les repères sont dans la photo**, trait de rappel compris, et non posés
 * en HTML par-dessus. Le composant n'a donc rien à mesurer ni à replacer
 * quand le cadre bouge : l'étiquette ne peut plus désigner le vide. En
 * contrepartie, ce sont des pixels — ils rétrécissent avec l'image et se
 * coupent avec elle, ce que les réglages de cadrage ci-dessous ont pour seul
 * objet de contenir.
 *
 * **Il n'a pas de bouton.** L'action est le sélecteur de véhicule, juste en
 * dessous : deux appels à l'action superposés se disputaient le même geste, et
 * celui qui compte sur un site de pièces est « quelle est votre voiture ».
 *
 * Sous 1024 px, les légendes gravées ne sont plus lisibles : la photo fait
 * trois fois sa hauteur, le cadre ne l'est jamais, et `object-cover` en montre
 * à peine la moitié. Le cadrage les repousse donc hors champ ou sous le voile
 * plutôt que de les laisser coupées en plein mot, et la photo redevient une
 * ambiance derrière le texte.
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
    <section
      aria-labelledby="hero-titre"
      /*
        Le rapport est porté par la SECTION, et c'est tout le sujet.

        Il était posé sur le conteneur intérieur, qui plafonne à 1280 px. La
        hauteur du bandeau restait donc bloquée à 427 px pendant que la photo,
        elle, s'étalait sur toute la largeur de la fenêtre : à 1920 px,
        `object-cover` jetait 33 % de la hauteur de l'image — la voiture s'en
        trouvait grossie et coupée en haut comme en bas. Mesuré sur le rendu
        avant correction : cadre 1920 × 427 pour une image affichée
        1920 × 640.

        Porté par la section, le cadre suit la fenêtre : 1920 × 640 à 1920 px,
        1280 × 427 à 1280 px, et l'image tient exactement dedans, sans aucune
        perte dans un sens ni dans l'autre.

        Le plafond de 700 px borne ce que cette règle produirait sur un très
        grand écran — 853 px de bandeau à 2560 px de fenêtre. Au-delà de
        2100 px, le recadrage vertical revient donc, mais progressivement, et
        les légendes gravées se tiennent entre 25 % et 31 % de la hauteur :
        elles sont les dernières choses qu'un rognage par le haut atteindrait.

        `xl:w-full` n'est pas décoratif. Un bloc qui porte un rapport ET une
        hauteur maximale ne renonce pas au rapport quand le plafond mord : il
        rétrécit sa LARGEUR pour le tenir. Mesuré à 2400 px de fenêtre avant
        correction, la section ne faisait plus que 2099 px et laissait 301 px
        de vide à sa droite. Une largeur explicite la rend définie, et le
        rapport ne décide plus alors que de la hauteur.
      */
      className="relative overflow-hidden bg-ink-hero text-white xl:aspect-[2000/667] xl:max-h-[700px] xl:w-full"
    >
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        /*
          Qualité relevée pour ce seul visuel, et allouée dans next.config.ts.

          Le fichier arrive déjà compressé (134 ko pour 2000 × 667) ; le
          repasser à la valeur par défaut le ramenait à 63 ko, soit la moitié
          des octets jetés une seconde fois. Sur une photo de produit cela ne
          se voit pas ; ici les légendes « Halogène » et « LED » sont gravées
          dans l'image, en petits caractères sur des aplats sombres — c'est
          exactement ce qu'une seconde passe destructrice abîme en premier.
        */
        quality={90}
        /*
          Le cadrage, et ce qu'il doit épargner.

          Mesuré sur le fichier : l'étiquette « Halogène » occupe la bande
          47,3 %–55,3 % de la largeur, l'étiquette « LED » la bande
          88,8 %–99,5 %, et la voiture s'étend de 51,5 % à 89,5 %. Entre les
          deux légendes il reste 33,5 % de largeur vierge — moins que ce
          qu'un cadre de téléphone ou de tablette laisse voir. Aucun cadrage
          sous 1024 px ne montre donc la voiture sans toucher à une légende :
          le choix est seulement de savoir laquelle, et comment.

          D'où la règle sous 1280 px : **caler sur le bord droit**. Ce qui
          tombe est alors toujours pris à gauche, dans la paroi sombre ; la
          légende LED, qui s'arrête à un demi-pour-cent du bord droit, n'est
          jamais tranchée ; et le fragment de « Halogène » que le cadre laisse
          parfois au ras du bord gauche se perd sous la partie la plus dense
          du voile. Une visée centrée, elle, coupait des deux côtés — donc
          dans la légende LED.

          Le téléphone fait exception à 80 % : calée à droite, la fenêtre
          commencerait à 59 % et amputerait la voiture de son phare halogène.
          À 80 % elle part de 48,8 % et la prend entière — mais elle ramasse
          au passage la légende « Halogène » presque complète, le long du
          bord gauche. Ce n'est pas le cadrage qui l'efface, c'est la densité
          du voile : plus de 90 % de noir sur cette bande, assez pour la
          réduire à une trace. La seule autre issue serait de cadrer entre
          les deux légendes, ce qui demande un bandeau aussi haut que large
          et coupe la voiture de son phare halogène — le sujet même de la
          comparaison.

          À partir de 1280 px le cadre prend le rapport du fichier, il n'y a
          plus de recadrage latéral, et les deux légendes sont là telles
          qu'elles ont été gravées.
        */
        className="object-cover object-[80%_center] sm:object-[100%_center] xl:object-[center_center]"
      />

      {/*
        Le voile, en trois régimes.

        Sous 1280 px, il doit effacer une légende sans éteindre la photo.
        À ces largeurs, le recadrage calé à droite ramène « Halogène » dans
        la moitié gauche du cadre — entre 29 % et 40 % à 1024 px, entre 43 %
        et 52 % à 1279 px — c'est-à-dire sous le titre. Deux textes
        superposés ne se lisent ni l'un ni l'autre, et c'est au voile de
        trancher : il tient donc plus de 90 % de noir jusqu'à 40 %, et
        75 % encore à 55 %, ce qui couvre la légende sur toute la plage.

        Passé 55 % il chute vite, et c'est tout l'intérêt : la voiture
        commence là (35 % du cadre à 1024 px, 48 % à 1279 px) et la légende
        LED se tient au-delà de 76 %, dégagée du texte. Un voile dense d'un
        bord à l'autre — essayé — effaçait la légende, mais rendait aussi la
        voiture grise et la page terne.

        À partir de 1280 px, il s'efface avant la première légende. Les
        paliers sont mesurés, pas choisis à l'œil : le voile tient sa densité
        jusqu'à 32 %, chute entre 38 % et 45 %, et a disparu à 52 % — alors
        que « Halogène » commence à 47,3 % et que le titre, cadre centré à
        1280 px et au-delà, s'arrête avant 46 %. Les valeurs d'avant, calées sur
        une photo dont les repères étaient posés en HTML par-dessus, tenaient
        encore 60 % de noir à 52 % : la légende gravée y passait au gris. Le
        texte n'y perd rien, parce que cette photo-ci est quasi noire sur
        toute sa moitié gauche, là où l'ancienne montrait des façades
        éclairées.

        Les deux phares reçoivent le même traitement : l'écart entre eux reste
        celui du cliché, et non celui de la mise en scène.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#070a0ef2_0%,#070a0edb_60%,#070a0ec4_100%)] sm:bg-[linear-gradient(90deg,#070a0ef7_0%,#070a0eed_40%,#070a0ebf_55%,#070a0e59_70%,#070a0e26_85%,#070a0e14_100%)] xl:bg-[linear-gradient(90deg,#070a0eeb_0%,#070a0edb_32%,#070a0e96_38%,#070a0e2e_45%,transparent_52%)]" />

      {/*
        Au-delà de 1280 px, le cadre prend EXACTEMENT le rapport du fichier
        (2000/667). C'est ce qui fait tenir la promesse de l'image : rien
        n'est rogné latéralement, donc les deux légendes gravées sont vues
        entières, à l'endroit où le photographe les a posées.

        Le seuil est à 1280 px et non à 1024 px, et il est mesuré lui aussi.
        En dessous, le conteneur occupe toute la largeur de la fenêtre, si
        bien que la hauteur dictée par le rapport (la largeur divisée par
        trois) descend sous les 434 px dont le texte a besoin. Il faut alors
        choisir : laisser le cadre grandir, et `object-cover` rogne les côtés
        — c'est le recadrage calé à droite, plus haut ; ou tenir le rapport,
        et le texte déborde d'un bandeau qui le coupe. À 1280 px, le
        conteneur plafonne et les deux contraintes se rejoignent : 427 px de
        cadre pour 434 px de texte, l'écart se logeant dans les 48 px de
        marge intérieure.

        `xl:min-h-0` est indispensable : la hauteur minimale de la tablette
        survivrait au changement de régime et forcerait, à 1280 px, le
        recadrage latéral que tout ce bloc cherche à éviter. `xl:h-full` prend
        le relais pour centrer le texte dans la hauteur que la section tient
        désormais.

        Ce rapport suit le fichier et doit être repris avec lui. Le laisser à
        celui de la photo précédente (2000/755) rognerait une colonne sur
        chaque bord — et la légende « LED » s'arrête à un demi-pour-cent du
        bord droit.
      */}
      <div className="container-page relative flex min-h-[320px] items-center sm:min-h-[440px] xl:h-full xl:min-h-0">
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
