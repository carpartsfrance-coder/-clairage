import type { ReactNode } from 'react'
import { IconCar, IconCheckCircle, IconMotorcycle } from '@/components/ui/icons'

/**
 * La barre « véhicule de référence », sous le bandeau d'ouverture.
 *
 * Elle répond à une question que la page pose sans y répondre : de quelle
 * voiture parle-t-on, et ce qui suit vaut-il pour elle ? Le nom à gauche, la
 * pastille verte au milieu, l'action à droite.
 *
 * **La pastille n'est pas décorative.** Elle dit combien d'éclairages sont
 * documentés, et seul ce décompte l'autorise : sans compatibilité relevée,
 * elle disparaît plutôt que d'annoncer un zéro rassurant en vert.
 */
export function BarreVehicule({
  nom,
  annees,
  nombreDePacks,
  moto = false,
  action,
}: {
  nom: string
  annees: string
  /** Nombre d'éclairages documentés. Zéro masque la pastille. */
  nombreDePacks: number
  moto?: boolean
  action?: ReactNode
}) {
  const Icone = moto ? IconMotorcycle : IconCar

  return (
    <section
      aria-label="Véhicule de référence"
      className="mt-[15px] flex items-center gap-3 rounded-[11px] border border-line bg-white p-[11px_14px] shadow-soft max-[470px]:grid max-[470px]:grid-cols-[34px_minmax(0,1fr)] max-[470px]:gap-x-2 max-[470px]:gap-y-[7px] max-[470px]:p-2.5"
    >
      <span className="grid size-[42px] shrink-0 place-items-center rounded-lg bg-surface-paper max-[470px]:row-span-2 max-[470px]:size-[34px]">
        <Icone className="size-[23px] text-slate-ink" />
      </span>

      <div className="min-w-0">
        <small className="block text-[11px] text-muted-strong">Véhicule de référence</small>
        <strong className="block text-[14px] font-extrabold fiche:text-[16px]">
          {nom}{' '}
          <span className="font-semibold whitespace-nowrap text-muted-strong before:content-['·_'] max-[470px]:block max-[470px]:text-[12px] max-[470px]:before:content-none">
            {annees}
          </span>
        </strong>
      </div>

      {nombreDePacks > 0 ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ok-soft px-[9px] py-[5px] text-[11px] font-bold whitespace-nowrap text-ok max-[470px]:col-start-2">
          <IconCheckCircle className="size-3.5 shrink-0" />
          {nombreDePacks} pack{nombreDePacks > 1 ? 's' : ''} compatible
          {nombreDePacks > 1 ? 's' : ''}
        </span>
      ) : null}

      {/*
        Sur un téléphone l'action passe sous le reste, sur toute la largeur.
        À droite, elle chevauchait la pastille « 7 packs compatibles » dès que
        son intitulé dépassait deux mots.
      */}
      {action ? (
        <div className="ml-auto shrink-0 max-[470px]:col-span-2 max-[470px]:m-0 max-[470px]:[&>*]:w-full">
          {action}
        </div>
      ) : null}
    </section>
  )
}
