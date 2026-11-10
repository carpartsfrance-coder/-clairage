import Link from 'next/link'
import { getPackGeneration } from '@/lib/queries/packs'
import { formatPrice, promesseRetour } from '@/lib/identity'

/**
 * « Comment ça se passe » : la section qui suit les produits de l'accueil.
 *
 * Elle était faite de trois cartes à icône encadrée, numérotées 01 / 02 / 03,
 * avec un texte gris de 10 px : un gabarit vu partout, qui ne montrait rien de
 * la boutique (remarque de l'exploitant, 10 novembre 2026).
 *
 * Elle montre désormais ce qui distingue LEDVROOM, avec de vraies données :
 * l'éclairage d'un véhicule réel, emplacement par emplacement, tel que la page
 * du véhicule le présente. À côté, les trois moments où le client est aidé —
 * avant l'achat, au montage, après — qui sont bien une suite dans le temps.
 *
 * Le véhicule d'exemple est le Dacia Duster de 2010–2017, le plus vendu. Si sa
 * page ne répond pas, la section garde son texte et perd seulement l'exemple.
 */

const EXEMPLE = { marque: 'dacia', modele: 'duster', generation: 'duster' } as const
const LIGNES_MAX = 6

export type MethodSectionProps = {
  /** Gardé pour la compatibilité avec les blocs de l'accueil ; le texte est désormais fixe. */
  content?: unknown
}

async function exemple() {
  try {
    const lecture = await getPackGeneration('CAR', EXEMPLE.marque, EXEMPLE.modele, EXEMPLE.generation)
    if (lecture.state !== 'found') return null
    const v = lecture.data
    const lignes = v.groups
      .map((groupe) => {
        const compatibles = groupe.products.filter((p) => p.status === 'CONFIRMED')
        if (compatibles.length === 0) return null
        return {
          code: groupe.code,
          label: groupe.label,
          prix: Math.min(...compatibles.map((p) => p.fromPriceCents)),
        }
      })
      .filter((l): l is NonNullable<typeof l> => l !== null)
    if (lignes.length < 3) return null
    return {
      nom: `${v.makeName} ${v.modelName}`,
      annees: v.years,
      lignes: lignes.slice(0, LIGNES_MAX),
      total: lignes.length,
      href: `/packs/auto/${EXEMPLE.marque}/${EXEMPLE.modele}/${EXEMPLE.generation}`,
    }
  } catch {
    return null
  }
}

export async function MethodSection(_props: MethodSectionProps) {
  const vehicule = await exemple()
  const retour = promesseRetour()

  const moments = [
    {
      quand: 'Avant l’achat',
      texte: 'Vous indiquez votre véhicule. Le site ne vous montre que ce qui se monte dessus.',
      lien: { label: 'Choisir mon véhicule', href: '#choisir-mon-vehicule' },
    },
    {
      quand: 'Au montage',
      texte: 'Les gestes à connaître pour chaque emplacement : plaque, veilleuses, phares, recul.',
      lien: { label: 'Lire les conseils de montage', href: '/guides' },
    },
    {
      quand: 'Après',
      texte: `Une question, un souci ? Une personne de l’équipe vous répond.${
        retour ? ` ${retour}.` : ''
      }`,
      lien: { label: 'Écrire à l’équipe', href: '/contact' },
    },
  ]

  return (
    <section aria-labelledby="method-title" className="border-t border-[#e6e6e6] bg-white">
      <div className="container-page grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16 lg:py-20">
        <div>
          <h2
            id="method-title"
            className="max-w-[15ch] text-[30px] leading-[1.08] font-bold tracking-[-1px] text-slate-ink lg:text-[42px] lg:tracking-[-1.6px]"
          >
            On ne vous vend pas une ampoule au hasard.
          </h2>
          <p className="mt-5 max-w-[46ch] text-[16px] leading-[1.6] text-[#4b4e52] lg:text-[17px]">
            Chaque pack est composé pour un véhicule précis, emplacement par emplacement. Vous
            savez avant de commander ce qui se monte sur le vôtre.
          </p>

          <dl className="mt-9 border-t border-[#e2e2e2]">
            {moments.map((moment) => (
              <div
                key={moment.quand}
                className="grid gap-1.5 border-b border-[#e2e2e2] py-5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-6"
              >
                <dt className="text-[15px] font-bold text-slate-ink">{moment.quand}</dt>
                <dd className="m-0">
                  <p className="m-0 max-w-[48ch] text-[15px] leading-[1.55] text-[#4b4e52]">
                    {moment.texte}
                  </p>
                  <Link
                    href={moment.lien.href}
                    className="mt-2 inline-flex min-h-9 items-center text-[14px] font-semibold text-slate-ink underline decoration-[#c9c9c9] underline-offset-4 hover:decoration-brand"
                  >
                    {moment.lien.label}
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {vehicule ? (
          <figure className="m-0">
            <div className="overflow-hidden rounded-2xl bg-ink text-white">
              <div className="flex items-baseline justify-between gap-4 border-b border-ink-line px-6 pt-6 pb-5 lg:px-8 lg:pt-7">
                <div>
                  <p className="m-0 text-[13px] text-[#a9adb1]">Exemple</p>
                  <p className="m-0 mt-1 text-[22px] font-bold tracking-[-0.5px] lg:text-[26px]">
                    {vehicule.nom}
                  </p>
                </div>
                <p className="m-0 shrink-0 text-[14px] text-[#a9adb1] tabular-nums">{vehicule.annees}</p>
              </div>

              <ul className="m-0 list-none px-6 py-2 lg:px-8">
                {vehicule.lignes.map((ligne) => (
                  <li
                    key={ligne.code}
                    className="flex items-center justify-between gap-4 border-b border-ink-line/70 py-3.5 last:border-b-0"
                  >
                    <span className="text-[15px] font-semibold">{ligne.label}</span>
                    <span className="flex items-center gap-4 text-[14px]">
                      <span className="hidden items-center gap-1.5 text-[#8fd6a8] sm:flex">
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-[#4cc27a]" />
                        Compatible
                      </span>
                      <span className="w-[5.5rem] text-right text-[#d6d9dc] tabular-nums">
                        dès {formatPrice(ligne.prix)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="bg-ink-soft px-6 py-4 lg:px-8">
                <Link
                  href={vehicule.href}
                  className="inline-flex min-h-9 items-center text-[14px] font-semibold text-white underline decoration-[#6b7176] underline-offset-4 hover:decoration-white"
                >
                  Voir les {vehicule.total} emplacements du {vehicule.nom}
                </Link>
              </div>
            </div>
            <figcaption className="mt-3 text-[13px] text-[#6b6d70]">
              La même vérification est faite pour chaque véhicule du catalogue.
            </figcaption>
          </figure>
        ) : null}
      </div>
    </section>
  )
}
