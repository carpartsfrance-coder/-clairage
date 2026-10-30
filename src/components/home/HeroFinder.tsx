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
  const initial = vehicle
    ? {
        type: vehicle.type,
        makeId: vehicle.selection.makeId,
        modelId: vehicle.selection.modelId,
        year: vehicle.selection.year,
      }
    : null

  const bases = hero.bases ?? []

  return (
    <section aria-labelledby="hero-titre" className="bg-surface-soft">
      <div className="container-page grid gap-4 py-4 lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-5 lg:py-6">
        {/* ---------------------------------------------------- le bandeau */}
        <div className="relative order-first overflow-hidden rounded-xl bg-ink-hero text-white lg:order-last">
          {/*
            La photo. En flux sur téléphone, où elle prend une bande sous le
            texte ; calée à droite au-delà, où elle occupe sa moitié du
            panneau. Un `fill` ne se positionne que par rapport à l'ancêtre
            positionné le plus proche : c'est ce qui permet au même élément
            d'être tantôt dans le flux, tantôt absolu.
          */}
          <div className="relative h-[190px] sm:absolute sm:inset-y-0 sm:right-0 sm:h-auto sm:w-[50%]">
            <Image
              src={chemin(hero.image)}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 560px, 100vw"
              className="object-cover object-center sm:object-left"
            />
            {/*
              Le raccord entre la photo et l'aplat. Vers le haut sur
              téléphone, où la photo est sous le texte ; vers la gauche
              au-delà, où elle est à côté. Sans lui, la photo se termine par
              une arête nette au milieu du panneau.
            */}
            <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_55%,var(--color-ink-hero)_100%)] sm:bg-[linear-gradient(90deg,var(--color-ink-hero)_0%,transparent_42%)]" />
          </div>

          <div className="relative z-[1] px-6 py-8 sm:w-[56%] sm:px-8 sm:py-11 lg:py-14">
            <p className="m-0 text-[11px] font-bold tracking-[2.2px] text-brand-on-dark uppercase">
              {hero.eyebrow}
            </p>

            <h1
              id="hero-titre"
              className="m-0 mt-3 text-[34px] leading-[1.02] font-extrabold tracking-[-1.4px] text-white sm:text-[44px] sm:tracking-[-2px] xl:text-[56px] xl:tracking-[-2.6px]"
            >
              <span className="whitespace-pre-line">{hero.title}</span>
            </h1>

            <p className="m-0 mt-4 text-[14px] leading-[1.65] text-white/85 sm:text-[16px]">
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
                className="mt-6 min-h-[48px] gap-3 rounded-md border-white/40 px-6 text-[15px]"
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
              <p className="m-0 mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold tracking-[1px] text-white/55">
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
          className="scroll-mt-28 rounded-xl border border-line bg-white p-5 sm:p-6 lg:order-first"
        >
          <p className="m-0 flex items-center gap-2 text-[11px] font-bold tracking-[1.6px] text-muted-strong uppercase">
            <IconCar className="size-[18px] shrink-0" />
            {finder.eyebrow}
          </p>

          <h2 className="mt-3 mb-5 text-[24px] leading-[1.15] font-bold tracking-[-0.8px] text-ink">
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
                Le formulaire reste rangé : le client qui revient n'a pas à le
                traverser pour atteindre ses éclairages. `<details>` plutôt
                qu'un état React — ouverture, fermeture et clavier sont
                assurés par le navigateur.
              */}
              <details className="group mt-3">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[13px] text-muted-strong underline underline-offset-[3px] hover:text-ink [&::-webkit-details-marker]:hidden">
                  Changer de véhicule
                  <span aria-hidden="true" className="ml-2 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="mt-4 border-t border-line pt-5">
                  <VehicleSelector layout="card" initial={initial} />
                </div>
              </details>
            </>
          ) : (
            <VehicleSelector layout="card" initial={null} />
          )}

          <p className="m-0 mt-4 text-center">
            <Link
              href="/recherche"
              className="inline-flex min-h-11 items-center text-[13px] text-muted-strong underline underline-offset-[3px] hover:text-ink"
            >
              {finder.shortcutLabel}
            </Link>
          </p>
        </aside>
      </div>
    </section>
  )
}
