import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { EmptyState } from '@/components/ui/Surface'

/**
 * Ce que montre le parcours véhicule quand le référentiel n'a pas pu être lu.
 *
 * Les trois derniers niveaux du parcours répondaient `notFound()` dès que la
 * lecture échouait : le client lisait que sa marque, son modèle ou sa
 * génération n'était pas référencé, ce que personne n'avait constaté. Une
 * panne de lecture n'est pas une absence, et cette page se borne à dire qu'on
 * n'a pas pu lire.
 *
 * Le fil d'Ariane s'arrête au type de véhicule : c'est le dernier niveau dont
 * on connaisse encore le nom. Les segments suivants ne sont que des morceaux
 * d'URL, et les afficher comme des noms de véhicule présenterait la saisie du
 * client comme une donnée du référentiel.
 *
 * Même état qu'un catalogue momentanément illisible côté marques
 * (`app/packs/[type]/page.tsx`), et volontairement la même formulation : c'est
 * la phrase qui empêche le client de conclure à une absence.
 */
export function PackReadFailure({
  type,
  libelle,
}: {
  /** Segment d'URL du type (`auto`, `moto`) : il reste un retour possible. */
  type: string
  libelle: { court: string; long: string }
}) {
  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: libelle.long, href: `/packs/${type}` },
          { label: 'Momentanément indisponible' },
        ]}
      />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        {libelle.long}
      </h1>

      <EmptyState
        className="mt-6"
        title="Les informations de ce véhicule sont momentanément indisponibles."
        description="Nous n'avons pas pu lire le référentiel véhicule. Cela ne veut pas dire que votre véhicule est absent du catalogue : réessayez dans un instant, revenez à la liste des marques, ou parcourez le catalogue en attendant."
        action={{ label: 'Voir le catalogue', href: '/c' }}
      />
    </div>
  )
}
