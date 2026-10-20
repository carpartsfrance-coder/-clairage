import { Fragment, type ReactNode } from 'react'

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
function emphases(ligne: string, cle: string): ReactNode[] {
  return ligne.split(/(\*\*[^*]+\*\*)/g).map((morceau, index) =>
    morceau.startsWith('**') && morceau.endsWith('**') && morceau.length > 4 ? (
      <strong key={`${cle}-${index}`} className="font-bold text-slate-ink">
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

export function Prose({ children, className }: { children: string; className?: string }) {
  const blocs = children.split(/\n{2,}/).filter((bloc) => bloc.trim().length > 0)

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
              className="my-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line pt-4 fiche:grid-cols-[auto_1fr]"
            >
              {retenues.map(([terme, valeur], i) => (
                <Fragment key={`${index}-${i}`}>
                  <dt className="text-[10px] font-bold tracking-[0.3px] text-[#7a7b77] uppercase">
                    {terme}
                  </dt>
                  <dd className="mb-2 text-[12px] leading-[1.7] text-slate-ink fiche:mb-0">
                    {emphases(valeur, `${index}-${i}`)}
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
              className="mt-7 mb-2.5 text-[15px] leading-[1.3] font-bold tracking-[-0.3px] fiche:text-[17px]"
            >
              {bloc.slice(3).trim()}
            </h3>
          )
        }

        return (
          <p key={index} className="mb-3.5 text-[12px] leading-[1.85] text-[#4c4f49] fiche:text-[13px]">
            {lignes.map((ligne, i) => (
              <Fragment key={`${index}-${i}`}>
                {i > 0 ? <br /> : null}
                {emphases(ligne, `${index}-${i}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
