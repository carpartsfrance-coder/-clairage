import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  LIBELLE_PAR_CHEMIN,
  TYPE_PAR_CHEMIN,
  listPackMakes,
} from '@/lib/queries/packs'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'
import { EmptyState } from '@/components/ui/Surface'
import { MakeSearch } from '@/components/packs/MakeSearch'
import { BrandGrid } from '@/components/layout/BrandGrid'

type PageProps = { params: Promise<{ type: string }> }

/**
 * Marques disponibles pour un type de véhicule.
 *
 * Premier niveau du parcours marque → modèle → génération. Les marques sont
 * celles qui ont au moins un modèle actif : une marque sans modèle ouvrirait
 * sur une page vide.
 *
 * Le type est un segment d'URL (`auto`, `moto`) traduit en type de base. Tout
 * autre segment est une 404 — il n'y a pas de type « par défaut » qui ferait
 * passer une faute de frappe pour une catégorie.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params
  const libelle = LIBELLE_PAR_CHEMIN[type]
  if (!libelle) return { title: 'Packs par véhicule' }

  return {
    title: libelle.long,
    description: `Les éclairages documentés pour votre véhicule, marque par marque.`,
    alternates: { canonical: `/packs/${type}` },
  }
}

export default async function PacksTypePage({ params }: PageProps) {
  const { type } = await params
  const vehicleType = TYPE_PAR_CHEMIN[type]
  const libelle = LIBELLE_PAR_CHEMIN[type]
  if (!vehicleType || !libelle) notFound()

  const makes = await listPackMakes(vehicleType)

  return (
    <div className="container-page pb-10 fiche:pb-14">
      <Breadcrumb
        items={[
          { label: 'Accueil', href: '/' },
          { label: libelle.long },
        ]}
      />

      <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
        {libelle.long}
      </h1>
      <p className="mt-2 max-w-[580px] text-[11px] leading-[1.8] text-[#7b8074]">
        Choisissez votre marque, puis votre modèle et sa période de fabrication. Les éclairages
        affichés sont ceux documentés pour ce véhicule.
      </p>

      {makes === null ? (
        /*
          Lecture en échec. Ce cas doit se distinguer du catalogue vide : dire
          « aucune marque n'est référencée » quand on n'a simplement pas pu
          lire, c'est affirmer une absence qu'on n'a pas constatée — et
          renvoyer un client dont le véhicule est au catalogue.
        */
        <EmptyState
          className="mt-6"
          title="La liste des marques est momentanément indisponible."
          description="Nous n'avons pas pu lire le référentiel véhicule. Cela ne veut pas dire que votre véhicule est absent du catalogue : réessayez dans un instant, ou parcourez le catalogue en attendant."
          action={{ label: 'Voir le catalogue', href: '/c' }}
        />
      ) : makes.length === 0 ? (
        /*
          Aucune marque de ce type au catalogue. On le dit plutôt que de
          laisser une page vide, et on propose les deux autres chemins qui,
          eux, mènent quelque part.
        */
        <EmptyState
          className="mt-6"
          title={`Aucune marque ${libelle.court.toLowerCase()} n'est encore référencée.`}
          description="Les véhicules sont ajoutés au fur et à mesure que leurs compatibilités sont relevées. En attendant, vous pouvez partir du culot de votre ampoule ou parcourir le catalogue."
          action={{ label: 'Voir le catalogue', href: '/c' }}
        />
      ) : (
        <>
          {/* La recherche n'apparaît que si la liste le justifie. */}
          <MakeSearch
            makes={makes.map((make) => ({
              slug: make.slug,
              name: make.name,
              href: `/packs/${type}/${make.slug}`,
              hint: make.modelCount > 1 ? `${make.modelCount} modèles` : '1 modèle',
            }))}
            label="Rechercher une marque"
          />

          {/*
            Même grille que le menu, en plus large : le client qui arrive ici
            depuis « Voir les 47 marques » retrouve les pastilles qu'il vient
            de quitter, à la même taille.
          */}
          <BrandGrid
            className="mt-5 grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8"
            tone="page"
            entries={makes.map((make) => ({
              label: make.name,
              href: `/packs/${type}/${make.slug}`,
              hint: make.modelCount > 1 ? `${make.modelCount} modèles` : '1 modèle',
              logo: make.logo,
            }))}
          />
        </>
      )}
    </div>
  )
}
