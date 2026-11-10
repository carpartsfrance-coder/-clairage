import { Fragment, type ReactNode } from 'react'
import { IconCheck, IconInfo, IconPack, IconPin, IconWrench } from '@/components/ui/icons'

/**
 * Rendu du rédactionnel long (`Product.body`, et plus tard les guides).
 *
 * **Volontairement minuscule.** Le projet tient sur sept dépendances, et
 * ajouter un moteur markdown complet pour afficher quatre formes de texte
 * reviendrait à faire entrer une bibliothèque entière — et sa surface de
 * sécurité — pour des paragraphes et des tableaux à deux colonnes.
 *
 * Ce qui est reconnu, et rien d'autre :
 *
 *   `## Titre`        → un sous-titre de section
 *   `**gras**`        → une emphase
 *   `| a | b |`       → une ligne de caractéristique, rendue en liste de
 *                       définitions plutôt qu'en tableau : deux colonnes sur
 *                       un téléphone ne tiennent pas.
 *   ligne vide        → un paragraphe
 *
 * Tout le reste est affiché tel quel. C'est un choix : un texte qui
 * emploierait une forme non prise en charge se verra immédiatement à la
 * relecture, au lieu de disparaître silencieusement.
 *
 * **Rien n'est interprété comme du HTML.** Le texte est découpé puis rendu en
 * éléments React : une balise écrite dans le rédactionnel s'affiche comme du
 * texte, elle ne s'exécute pas.
 */

/** Découpe une ligne sur les `**…**` et rend les segments en gras. */
function emphases(ligne: string, cle: string, sombre = false): ReactNode[] {
  return ligne.split(/(\*\*[^*]+\*\*)/g).map((morceau, index) =>
    morceau.startsWith('**') && morceau.endsWith('**') && morceau.length > 4 ? (
      <strong
        key={`${cle}-${index}`}
        className={sombre ? 'font-bold text-white' : 'font-bold text-slate-ink'}
      >
        {morceau.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={`${cle}-${index}`}>{morceau}</Fragment>
    ),
  )
}

/** Une ligne de tableau markdown, hors ligne de séparation `| --- |`. */
function celluleDeTableau(ligne: string): [string, string] | null {
  const brut = ligne.trim()
  if (!brut.startsWith('|') || !brut.endsWith('|')) return null
  const cellules = brut.slice(1, -1).split('|').map((c) => c.trim())
  if (cellules.length !== 2) return null
  if (cellules.every((c) => /^-{2,}$/.test(c))) return null
  return [cellules[0], cellules[1]]
}

export function Prose({
  children,
  className,
  sombre = false,
}: {
  children: string
  className?: string
  /**
   * Texte posé sur un fond sombre (« Le pack en bref » de la fiche produit) :
   * couleurs claires et corps plus grand. Les autres pages gardent le rendu
   * clair par défaut.
   */
  sombre?: boolean
}) {
  // Un texte saisi dans un formulaire arrive en \r\n : sans ce passage, il ne
  // forme qu'un seul paragraphe.
  const blocs = children
    .replace(/\r\n?/g, '\n')
    // Un intertitre collé à son texte reste un intertitre suivi d'un paragraphe.
    .replace(/^(## .*)\n(?!\n)/gm, '$1\n\n')
    .split(/\n{2,}/)
    .filter((bloc) => bloc.trim().length > 0)

  if (sombre) return <ProseEnBref blocs={blocs} className={className} />

  return (
    <div className={className}>
      {blocs.map((bloc, index) => {
        const lignes = bloc.split('\n')

        // Un bloc entièrement fait de lignes `| … | … |` est un relevé de
        // caractéristiques.
        const paires = lignes.map(celluleDeTableau)
        const estReleve = paires.every((p) => p !== null || /^\s*\|.*\|\s*$/.test(lignes[0]))
        const retenues = paires.filter((p): p is [string, string] => p !== null)
        if (retenues.length > 0 && estReleve) {
          return (
            <dl
              key={index}
              className={`my-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-4 fiche:grid-cols-[auto_1fr] ${sombre ? 'border-[#2a2d32]' : 'border-line'}`}
            >
              {retenues.map(([terme, valeur], i) => (
                <Fragment key={`${index}-${i}`}>
                  <dt
                    className={
                      sombre
                        ? 'text-[12px] font-bold tracking-[0.3px] text-[#a9adb4] uppercase'
                        : 'text-[10px] font-bold tracking-[0.3px] text-[#7a7b77] uppercase'
                    }
                  >
                    {terme}
                  </dt>
                  <dd
                    className={
                      sombre
                        ? 'mb-2 text-[15px] leading-[1.7] text-[#e7e8ea] fiche:mb-0'
                        : 'mb-2 text-[12px] leading-[1.7] text-slate-ink fiche:mb-0'
                    }
                  >
                    {emphases(valeur, `${index}-${i}`, sombre)}
                  </dd>
                </Fragment>
              ))}
            </dl>
          )
        }

        if (bloc.startsWith('## ')) {
          return (
            <h3
              key={index}
              className={
                sombre
                  ? 'mt-7 mb-2.5 text-[18px] leading-[1.3] font-bold tracking-[-0.3px] text-white fiche:text-[20px]'
                  : 'mt-7 mb-2.5 text-[15px] leading-[1.3] font-bold tracking-[-0.3px] fiche:text-[17px]'
              }
            >
              {bloc.slice(3).trim()}
            </h3>
          )
        }

        return (
          <p
            key={index}
            className={
              sombre
                ? 'mb-4 text-[16px] leading-[1.7] text-[#c9ccd1] fiche:text-[17px]'
                : 'mb-3.5 text-[12px] leading-[1.85] text-[#4c4c4c] fiche:text-[13px]'
            }
          >
            {lignes.map((ligne, i) => (
              <Fragment key={`${index}-${i}`}>
                {i > 0 ? <br /> : null}
                {emphases(ligne, `${index}-${i}`, sombre)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

/*
  « Le pack en bref » de la fiche produit, mis en page pour être lu
  (exploitant, 9 novembre 2026 : « le texte est difficile à lire »).

  Le texte reste entier et visible — il compte pour le référencement. Seule
  la présentation change :
   - le premier paragraphe en accroche, plus grand et en blanc ;
   - chaque intertitre `##` devient une carte, avec une icône selon son sujet ;
   - les lignes `- …` deviennent une liste à coches ;
   - une largeur de ligne limitée et plus d'air entre les blocs.
*/


function iconeDeSection(titre: string) {
  if (/carton|contenu|inclus/i.test(titre)) return IconPack
  if (/avant de commander|compatib|vérif/i.test(titre)) return IconInfo
  if (/couvre|emplacement|où/i.test(titre)) return IconPin
  if (/montage|branch|install/i.test(titre)) return IconWrench
  return IconCheck
}

function blocEnBref(bloc: string, cle: string, accroche: boolean) {
  const lignes = bloc.split('\n').filter((l) => l.trim().length > 0)
  const puces = lignes.map((l) => l.match(/^\s*[-*•]\s+(.*)$/)?.[1] ?? null)
  if (puces.length > 0 && puces.every((x) => x !== null)) {
    return (
      <ul key={cle} className="my-3 flex flex-col gap-2">
        {puces.map((texte, i) => (
          <li key={`${cle}-${i}`} className="flex items-start gap-2.5 text-[16px] leading-[1.5] text-[#e7e8ea]">
            <IconCheck className="mt-[3px] size-[18px] shrink-0 text-ok" />
            <span>{emphases(texte as string, `${cle}-${i}`, true)}</span>
          </li>
        ))}
      </ul>
    )
  }
  const paires = lignes.map(celluleDeTableau).filter((x): x is [string, string] => x !== null)
  if (paires.length > 0 && lignes.every((l) => /^\s*\|.*\|\s*$/.test(l))) {
    return (
      <dl key={cle} className="my-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
        {paires.map(([terme, valeur], i) => (
          <Fragment key={`${cle}-${i}`}>
            <dt className="text-[13px] font-bold tracking-[0.3px] text-[#a9adb4] uppercase">{terme}</dt>
            <dd className="text-[15px] leading-[1.6] text-[#e7e8ea]">{emphases(valeur, `${cle}-${i}`, true)}</dd>
          </Fragment>
        ))}
      </dl>
    )
  }
  return (
    <p
      key={cle}
      className={
        accroche
          ? 'mb-5 text-[19px] leading-[1.55] font-medium text-white fiche:text-[21px]'
          : 'mb-4 text-[16px] leading-[1.75] text-[#c9ccd1] fiche:text-[17px]'
      }
    >
      {lignes.map((ligne, i) => (
        <Fragment key={`${cle}-${i}`}>
          {i > 0 ? <br /> : null}
          {emphases(ligne, `${cle}-${i}`, true)}
        </Fragment>
      ))}
    </p>
  )
}

function ProseEnBref({ blocs, className }: { blocs: string[]; className?: string }) {
  // L'introduction (avant le premier intertitre), puis une section par `##`.
  // Un intertitre suivi directement de sa liste, sans ligne vide, est séparé.
  const morceaux = blocs.flatMap((b) => {
    const m = b.match(/^##\s+(.+?)\n([\s\S]+)$/)
    return m ? [`## ${m[1]}`, m[2]] : [b]
  })
  const intro: string[] = []
  const sections: { titre: string; blocs: string[] }[] = []
  for (const b of morceaux) {
    if (b.startsWith('## ')) sections.push({ titre: b.slice(3).trim(), blocs: [] })
    else if (sections.length > 0) sections[sections.length - 1].blocs.push(b)
    else intro.push(b)
  }
  return (
    <div className={`max-w-[640px] ${className ?? ''}`}>
      {intro.map((b, i) => blocEnBref(b, `i${i}`, i === 0))}
      {sections.length > 0 ? (
        <div className="mt-7 flex flex-col gap-3">
          {sections.map(({ titre, blocs: contenu }, i) => {
            const Icone = iconeDeSection(titre)
            return (
              <section key={`s${i}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 fiche:p-6">
                <h3 className="flex items-center gap-3 text-[18px] leading-tight font-bold tracking-[-0.3px] text-white fiche:text-[19px]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15">
                    <Icone className="size-[18px] text-brand-on-dark" />
                  </span>
                  {titre}
                </h3>
                <div className="mt-3 [&>p:last-child]:mb-0 [&>p]:text-[16px]">
                  {contenu.map((b, j) => blocEnBref(b, `s${i}-${j}`, false))}
                </div>
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
