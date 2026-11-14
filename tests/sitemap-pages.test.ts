import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { STATIC_PAGES } from '../src/lib/sitemap-pages'

/**
 * Une page déclarée dans le plan de site doit être ouverte à Google.
 *
 * Le plan déclarait sept pages en `noindex` (guides, confidentialité,
 * cookies…) : Google le signale dans Search Console comme « URL envoyée
 * marquée noindex », et cela brouille la lecture du plan entier.
 */
describe('pages fixes du plan de site', () => {
  for (const { path: chemin } of STATIC_PAGES) {
    it(`${chemin} existe et n'est pas fermée à l'indexation`, () => {
      /*
        Les pages publiques vivent dans le groupe de routes `(boutique)`, qui
        n'apparaît dans aucune URL. On cherche donc aux deux endroits : ce test
        garde « la page déclarée existe », pas « elle est rangée ici ».
      */
      const candidats = [
        path.join(__dirname, '..', 'src', 'app', '(boutique)', chemin === '/' ? '' : chemin, 'page.tsx'),
        path.join(__dirname, '..', 'src', 'app', chemin === '/' ? '' : chemin, 'page.tsx'),
      ]
      const fichier = candidats.find((candidat) => existsSync(candidat))
      expect(fichier, `aucune page trouvée pour ${chemin}`).toBeDefined()
      expect(readFileSync(fichier as string, 'utf8')).not.toMatch(/index:\s*false/)
    })
  }
})
