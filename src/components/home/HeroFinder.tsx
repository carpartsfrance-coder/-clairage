import Image from 'next/image'
import Link from 'next/link'
import type { SelectedVehicle } from '@/lib/session'
import { VehicleSelector } from '@/components/vehicle/VehicleSelector'
import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight, IconCar } from '@/components/ui/icons'

export type HeroFinderProps = {
  hero: {
    eyebrow: string
    title: string
    subtitle: string
    ctaLabel: string
    ctaHref: string
    /** Chemin complet depuis `public/`, ou simple nom pour `public/demo/`. */
    image: string
    /** Mention de simulation. Omise quand le visuel est une vraie photo. */
    imageCaption?: string
    /** Culots mis en avant sous le bandeau. Vérifiés au catalogue. */
    bases?: string[]
  }
  finder: {
    eyebrow: string
    title: string
    shortcutLabel: string
    note: string
  }
  /** Véhicule déjà retenu, s'il y en a un. */
  vehicle?: SelectedVehicle | null
}

/** `/visuels/x.webp` reste tel quel ; `x.jpg` est cherché dans `public/demo`. */
function chemin(fichier: string) {
  return fichier.startsWith('/') ? fichier : `/demo/${fichier}`
}

/**
 * Bandeau d'ouverture : le sélecteur de véhicule et la promesse, côte à côte.
 *
 * **Les deux blocs qui se suivaient n'en font plus qu'un.** Le bandeau occupait
 * toute la largeur et la carte du sélecteur venait dessous : le visiteur voyait
 * donc la promesse, puis descendait pour agir. Ici les deux tiennent dans le
 * premier écran, et la colonne de gauche est l'action.
 *
 * La largeur de la carte est fixe — 400 px — et non proportionnelle. Un
 * sélecteur n'a pas besoin de plus, et chaque pixel rendu à la colonne de
 * droite est un pixel de photo affiché à sa taille réelle.
 *
 * **L'ordre change entre les deux dispositions, et c'est voulu.** Sur grand
 * écran la carte est à gauche, là où le regard commence. Empilés, c'est le
 * bandeau qui passe devant : sur téléphone, un formulaire en tête de page
 * demande d'agir avant d'avoir dit pourquoi. Le DOM suit l'ordre du téléphone,
 * les colonnes sont remises par `order` — ce qui garde aussi le `h1` près du
 * début du document.
 *
 * **Le `h1` est dans le bandeau, pas dans la carte.** Le titre de la page est
 * la promesse ; « Trouvez les LED pour votre véhicule » nomme un outil et
 * reste un `h2`.
 */
export function HeroFinder({ hero, finder, vehicle = null }: HeroFinderProps) {
  /*
    Le sélecteur de cette carte part toujours de zéro. Il n'apparaît que
    lorsqu'aucun véhicule n'est retenu : lui passer une sélection initiale
    n'aurait rien à reprendre. La page dédiée et le menu, eux, continuent de
    rouvrir le formulaire sur le véhicule en cours.
  */
  const bases = hero.bases ?? []

  return (
    <section aria-labelledby="hero-titre" className="bg-surface-soft">
      {/*
        Mesuré sur la maquette : carte de 422 px, 10 px d'écart, et des rayons
        de 6 px partout — soit `rounded-md` dans les jetons du projet, et non
        les 12 px de `rounded-xl` posés d'abord.

        Le fond garde le jeton `surface-soft` : la maquette donne #f5f7f9,
        trois niveaux de bleu d'écart avec le #f6f6f6 du jeton, soit un écart
        invisible. Ajouter un second gris presque identique coûterait plus
        cher à tenir qu'il ne rapporte à l'œil.
      */}
      <div className="container-page grid gap-[10px] py-4 lg:grid-cols-[422px_minmax(0,1fr)] lg:py-6">
        {/* ---------------------------------------------------- le bandeau */}
        <div className="relative order-first overflow-hidden rounded-md bg-ink-hero text-white sm:min-h-[480px] lg:order-last lg:min-h-[555px]">
          {/*
            La photo EST le panneau, et non sa moitié droite.

            Elle est composée pour cela : mesurée, sa moitié gauche reste
            entre 12 et 35 de luminance jusqu'aux deux tiers de la hauteur,
            soit 14:1 pour du texte blanc. La diagonale rouge et le bloc de
            béton, eux, montent à 220 dans le bas — c'est là que le voile
            devient nécessaire, pas ailleurs.

            Sur téléphone, la photo reprend une bande en flux au-dessus du
            texte. Le panneau y est trop étroit pour qu'un recadrage garde à
            la fois les ampoules et la zone sombre : le texte se retrouverait
            sur les ampoules.
          */}
          <div className="relative h-[190px] sm:absolute sm:inset-0 sm:h-auto">
            <Image
              src={chemin(hero.image)}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 1070px, 100vw"
              /*
                Calé à gauche au-delà du téléphone, et c'est mesuré : centré,
                le recadrage plaçait les ampoules entre 50 et 85 % du panneau,
                c'est-à-dire sous la colonne de texte. Calé à gauche elles
                occupent 59 à 94 % et lui laissent la place.
              */
              className="object-cover object-[70%_center] sm:object-left"
            />
          </div>

          {/*
            Le voile. Vers le haut sur téléphone, où la photo est au-dessus du
            texte ; vers la droite au-delà, où le texte est posé dessus.

            Il tient sa densité jusqu'à la moitié de la largeur, parce que
            c'est là que le bloc de béton atteint 220 : plus tôt, du blanc n'y
            passerait pas le seuil de 4,5. Au-delà de 68 % il a disparu, et
            les ampoules gardent leurs noirs.
          */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,transparent_58%,#0b0d10_100%)] sm:bg-[linear-gradient(90deg,#0b0d10f0_0%,#0b0d10e0_34%,#0b0d10b8_50%,#0b0d1052_60%,transparent_68%)]" />

          <div className="relative z-[1] px-6 py-8 sm:flex sm:min-h-[480px] sm:w-[54%] sm:flex-col sm:justify-center sm:px-10 sm:py-12 lg:min-h-[555px] lg:px-12">
            <p className="m-0 text-[11px] font-bold tracking-[2.2px] text-brand-on-dark uppercase">
              {hero.eyebrow}
            </p>

            <h1
              id="hero-titre"
              /*
                Mesuré sur la maquette : les deux lignes du titre y font 62 et
                65 px de haut de capitale pour un interligne de 72 px, ce qui
                place le corps autour de 80 px à 1536 px de large.
              */
              className="m-0 mt-3 text-[38px] leading-[0.98] font-extrabold tracking-[-1.6px] text-white sm:text-[54px] sm:tracking-[-2.4px] xl:text-[76px] xl:tracking-[-3.4px]"
            >
              <span className="whitespace-pre-line">{hero.title}</span>
            </h1>

            <p className="m-0 mt-4 text-[14px] leading-[1.65] text-white/85 sm:mt-5 sm:text-[16px]">
              {hero.subtitle.split(/\r?\n/).map((ligne, index) => (
                <span key={ligne} className={index === 0 ? undefined : 'block'}>
                  {ligne}
                </span>
              ))}
            </p>

            {hero.ctaLabel ? (
              <ButtonLink
                href={hero.ctaHref}
                variant="onDark"
                className="mt-6 w-fit min-h-[48px] gap-3 rounded-md border-white/40 px-6 text-[15px] sm:mt-7"
                iconRight={<IconArrowRight className="size-[18px]" />}
              >
                {hero.ctaLabel}
              </ButtonLink>
            ) : null}

            {/*
              Les culots mis en avant. Vérifiés au catalogue avant d'être
              écrits : H7, H4, H1 et H11 y ont chacun au moins un produit
              publié. Les annoncer sans les avoir serait une promesse de
              rayon que la recherche démentirait au premier clic.
            */}
            {bases.length > 0 ? (
              <p className="m-0 mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold tracking-[1px] text-white/55 sm:mt-9">
                {bases.map((base, index) => (
                  <span key={base} className="flex items-center gap-3">
                    {index > 0 ? (
                      <span aria-hidden="true" className="text-white/30">
                        ·
                      </span>
                    ) : null}
                    {base}
                  </span>
                ))}
              </p>
            ) : null}

            {hero.imageCaption ? (
              <p className="m-0 mt-5 text-[11px] text-white/45">{hero.imageCaption}</p>
            ) : null}
          </div>
        </div>

        {/* ----------------------------------------------------- la carte */}
        <aside
          id="choisir-mon-vehicule"
          className="scroll-mt-28 rounded-md border border-line bg-white p-6 sm:p-8 lg:order-first"
        >
          <p className="m-0 flex items-center gap-2 text-[11px] font-bold tracking-[1.6px] text-muted-strong uppercase">
            <IconCar className="size-[18px] shrink-0" />
            {finder.eyebrow}
          </p>

          <h2 className="mt-2.5 mb-5 text-[30px] leading-[1.08] font-extrabold tracking-[-1.1px] text-ink lg:text-[36px] lg:tracking-[-1.4px]">
            {finder.title}
          </h2>

          {vehicle ? (
            <>
              <p className="m-0 text-[14px] leading-[1.5] text-muted-strong">
                Véhicule retenu
                <span className="mt-1 block font-semibold text-ink">{vehicle.label}</span>
              </p>

              <ButtonLink
                href="/vehicule/resultats"
                className="mt-4 h-[48px] min-h-[48px] w-full rounded-[9px] text-[15px] hover:bg-brand! hover:ring-2 hover:ring-brand/25"
                iconRight={<IconArrowRight className="size-[18px]" />}
              >
                Voir mes éclairages
              </ButtonLink>

              {/*
                « Changer de véhicule » remet le sélecteur à zéro, il ne
                déplie pas un second formulaire.

                C'était un `<details>` : l'ouvrir ajoutait la cascade complète
                sous le bouton et faisait grandir la carte d'environ 250 px,
                donc le bandeau avec elle, et tout ce qui suit descendait d'un
                coup. Le même formulaire se trouve déjà juste au-dessus une
                fois le véhicule retiré — il était donc monté deux fois pour
                le même usage.

                Un formulaire HTML et non un appel en JavaScript : la route
                existe, `VehicleMenu` l'emploie déjà de cette façon, et le
                bouton continue de fonctionner sans script.

                Le panier n'est pas touché : la route ne vide que le cookie
                du véhicule, et la page panier signale d'elle-même les lignes
                dont la compatibilité n'est plus vérifiable.
              */}
              <form action="/api/vehicule/retirer" method="post" className="mt-3">
                <button
                  type="submit"
                  className="touch-cible inline-flex items-center text-[13px] text-muted-strong underline underline-offset-[3px] transition-colors hover:text-ink"
                >
                  Changer de véhicule
                </button>
              </form>
            </>
          ) : (
            <VehicleSelector layout="card" initial={null} />
          )}

          <p className="m-0 mt-4">
            <Link
              href="/recherche"
              className="touch-cible inline-flex items-center text-[13px] text-muted-strong underline underline-offset-[3px] hover:text-ink"
            >
              {finder.shortcutLabel}
            </Link>
          </p>
        </aside>
      </div>
    </section>
  )
}
