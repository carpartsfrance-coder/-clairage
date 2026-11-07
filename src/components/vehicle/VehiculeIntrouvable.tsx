import { ButtonLink } from '@/components/ui/Button'
import { IconArrowRight } from '@/components/ui/icons'
import { LienVehiculeAbsent } from './LienVehiculeAbsent'

/**
 * Le corps de la 404 du parcours véhicule, partagé par ses deux entrées.
 *
 * Deux arborescences mènent au même véhicule — `/packs/…` par la marque et le
 * modèle, `/vehicule/…` par le sélecteur — et chacune a besoin de son
 * `not-found.tsx`, puisque Next.js remonte au plus proche. Le texte, lui, doit
 * être le même : deux rédactions de la même situation finiraient par ne plus
 * dire la même chose, et c'est précisément ici qu'il ne faut pas se tromper.
 *
 * Ce qu'il dit, et pourquoi il ne dit pas « cette page n'existe pas » : la
 * plupart des visiteurs qui arrivent ici ont un véhicule **bien présent au
 * référentiel**, mais dont aucun éclairage n'est en ligne. Leur annoncer une
 * page inexistante leur ferait conclure que leur voiture n'est pas couverte,
 * ce qui est faux. On dit donc ce qui est vrai, et on donne une sortie.
 */
export function VehiculeIntrouvable() {
  return (
    <div className="container-page py-20">
      <p className="eyebrow text-brand">Erreur 404</p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
        Aucun éclairage proposé pour ce véhicule.
      </h1>
      <p className="mt-3 max-w-xl text-lg text-muted-strong">
        Cette page ne mène à aucun produit : soit le véhicule n&apos;est pas au catalogue, soit
        aucun de ses éclairages n&apos;est en ligne pour le moment. Le lien est peut-être aussi
        plus ancien que le catalogue.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/vehicule" iconRight={<IconArrowRight className="size-5" />}>
          Choisir mon véhicule
        </ButtonLink>
        <ButtonLink href="/packs/auto" variant="secondary">
          Voir les marques couvertes
        </ButtonLink>
      </div>

      <LienVehiculeAbsent className="mt-8 text-[13px]" />
    </div>
  )
}
