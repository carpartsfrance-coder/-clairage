import type { ReactNode } from 'react'
import { Breadcrumb } from '@/components/catalogue/Breadcrumb'

/**
 * Coquille des pages légales.
 *
 * Un seul gabarit pour les mentions légales, les CGV, la confidentialité et
 * les cookies : ces pages se lisent rarement et se vérifient souvent, d'où
 * une typographie sobre, des sections numérotées et des ancres stables pour
 * qu'on puisse renvoyer à un article précis.
 *
 * La mesure de ligne est bornée à 68 caractères : au-delà, l'œil perd la
 * ligne suivante, et ces textes sont déjà assez ingrats à parcourir.
 */

export function PageLegale({
  titre,
  chapeau,
  miseAJour,
  children,
}: {
  titre: string
  chapeau?: string
  /** Date de dernière mise à jour, au format « 24 octobre 2026 ». */
  miseAJour: string
  children: ReactNode
}) {
  return (
    <div className="container-page pb-12 fiche:pb-16">
      <Breadcrumb items={[{ label: 'Accueil', href: '/' }, { label: titre }]} />

      <header className="max-w-[68ch]">
        <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.9px] fiche:text-[29px] fiche:tracking-[-1px]">
          {titre}
        </h1>
        {chapeau ? (
          <p className="mt-3 text-[13px] leading-[1.75] text-[#5f6657]">{chapeau}</p>
        ) : null}
        <p className="mt-3 text-[11px] text-muted-strong">Dernière mise à jour : {miseAJour}</p>
      </header>

      <div className="mt-8 max-w-[68ch]">{children}</div>
    </div>
  )
}

/** Une section numérotée, avec une ancre stable pour y renvoyer. */
export function Article({
  numero,
  titre,
  id,
  children,
}: {
  numero?: number
  titre: string
  id: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-6 first:border-0 first:pt-0">
      <h2 className="text-[15px] font-bold fiche:text-[16px]">
        {numero ? <span className="text-muted-strong">{numero}. </span> : null}
        {titre}
      </h2>
      <div className="mt-2.5 flex flex-col gap-3 pb-6 text-[13px] leading-[1.75] text-[#4a5043]">
        {children}
      </div>
    </section>
  )
}

/**
 * Mention obligatoire qui n'est pas encore renseignée.
 *
 * Elle s'affiche en clair plutôt que de disparaître. Une page de mentions
 * légales d'où un champ obligatoire est simplement absent se lit comme
 * complète ; le lecteur ne peut pas savoir qu'il manque quelque chose, et
 * l'éditeur non plus. Le trou se voit donc, et il se voit en rouge.
 */
export function AComplete({ quoi }: { quoi: string }) {
  return (
    <mark className="rounded-xs bg-[#fdeaea] px-1.5 py-0.5 text-[12px] font-semibold text-[#a3292c]">
      {quoi} — à renseigner
    </mark>
  )
}

/**
 * Bandeau affiché tant qu'une mention obligatoire manque.
 *
 * Il ne cherche pas à rassurer : il dit que la page n'est pas opposable en
 * l'état. C'est préférable à une page qui paraît complète et ne l'est pas.
 */
export function AvertissementIncomplet({ manquants }: { manquants: string[] }) {
  if (manquants.length === 0) return null

  return (
    <aside className="mb-8 rounded-lg border border-[#e9c4c4] bg-[#fdf4f4] p-4">
      <p className="text-[13px] font-bold text-[#a3292c]">Ces mentions sont incomplètes.</p>
      <p className="mt-1.5 text-[12px] leading-[1.7] text-[#6b4a4a]">
        {`${
          manquants.length === 1
            ? 'Une information obligatoire manque'
            : `${manquants.length} informations obligatoires manquent`
        } : ${manquants.join(', ')}.`}{' '}
        {manquants.length === 1 ? 'Elle est exigée' : 'Elles sont exigées'} pour vendre en ligne en
        France. La boutique ne doit pas ouvrir commercialement avant que ce soit renseigné.
      </p>
    </aside>
  )
}
