/**
 * « En bref » lisible en trois secondes (demande de l'exploitant, 9 novembre
 * 2026 : « le texte est difficile à lire, les clients n'ont pas envie de le
 * lire »).
 *
 * Le rédactionnel des fiches reste tel quel, replié derrière « Lire le
 * détail ». Devant, quelques points courts tirés de ce même texte : rien n'est
 * ajouté qu'il ne dise déjà.
 *
 *  - `carton` : la liste sous « Dans le carton » (ou « Contenu », « Inclus ») ;
 *  - `aSavoir` : les passages que le rédactionnel met en gras — ce sont ses
 *    consignes importantes (« Vérifiez le réglage en hauteur après le
 *    montage ») ;
 *  - `premiere` : la première phrase, en repli quand le type de produit n'a
 *    pas de phrase courte (lib/carte-titre.ts).
 */

const sansMarkdown = (t: string) =>
  t
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

const enPhrase = (t: string) => {
  const s = sansMarkdown(t).replace(/[\s;:,—-]+$/, '')
  if (!s) return s
  const p = s.charAt(0).toUpperCase() + s.slice(1)
  return /[.!?…]$/.test(p) ? p : `${p}.`
}

export function pointsCles(body: string | null | undefined): {
  premiere: string | null
  carton: string[]
  aSavoir: string[]
} {
  const texte = (body ?? '').replace(/\r/g, '')
  const blocs = texte.split(/\n{2,}/)

  // Première phrase du premier paragraphe ordinaire.
  const intro = blocs.find((b) => b.trim() && !/^\s*(#|-|\*\s|\|)/.test(b))
  const premiere = intro ? enPhrase(sansMarkdown(intro).split(/(?<=[.!?])\s/)[0] ?? '') || null : null

  // Liste sous un intertitre « Dans le carton » / « Contenu » / « Inclus ».
  const carton: string[] = []
  const lignes = texte.split('\n')
  const debut = lignes.findIndex((l) => /^#{1,4}\s*(dans le carton|contenu|ce qui est inclus|inclus)/i.test(l.trim()))
  if (debut >= 0) {
    for (const l of lignes.slice(debut + 1)) {
      if (/^#{1,4}\s/.test(l.trim())) break
      const m = l.match(/^\s*[-*•]\s+(.*)$/)
      if (m) carton.push(sansMarkdown(m[1]).replace(/[.;]$/, ''))
    }
  }

  // Passages en gras : les consignes que le rédactionnel juge importantes.
  const aSavoir = [...texte.matchAll(/\*\*(.+?)\*\*/g)]
    .map((m) => enPhrase(m[1]))
    .filter((t) => t.length >= 12 && t.length <= 140)
    .filter((t, i, tous) => tous.indexOf(t) === i)
    .slice(0, 2)

  return { premiere, carton: carton.slice(0, 6), aSavoir }
}
