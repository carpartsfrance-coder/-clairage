import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, proxy } from '../src/proxy'

/**
 * Convention « proxy » (l'ancien « middleware », renommé par Next 16).
 *
 * Ce que ces tests protègent : la mise en page racine décide d'afficher ou non
 * l'en-tête et le pied de page de la boutique **uniquement** d'après l'en-tête
 * `x-pathname`, que ce fichier pose. Si l'export était renommé, le fichier
 * déplacé, ou le filtre de chemins resserré par mégarde, l'en-tête
 * disparaîtrait sans erreur — et le back-office se retrouverait coiffé de la
 * navigation de la boutique, avec une vingtaine de liens parasites au clavier.
 *
 * Le seul import de `../src/proxy` est déjà une garde : il échoue si le fichier
 * change de nom ou si la fonction n'est plus exportée sous ce nom.
 */

function requete(url: string): NextRequest {
  return new NextRequest(new Request(url))
}

/**
 * Récupère l'en-tête de requête que le proxy a ajouté.
 *
 * Next ne renvoie pas l'en-tête tel quel : il le transporte dans la réponse
 * sous le préfixe `x-middleware-request-`, et liste les noms surchargés dans
 * `x-middleware-override-headers`. Le préfixe a gardé le mot « middleware »
 * après le renommage en « proxy » — c'est un détail interne de Next, pas un
 * reste de l'ancienne convention.
 */
function enTeteAjoute(response: Response, nom: string): string | null {
  const surcharges = (response.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .map((valeur) => valeur.trim())
  if (!surcharges.includes(nom)) return null
  return response.headers.get(`x-middleware-request-${nom}`)
}

/** Reproduit la sélection de chemins déclarée dans `config.matcher`. */
function matche(pathname: string): boolean {
  const motifs = Array.isArray(config.matcher) ? config.matcher : [config.matcher]
  return motifs.some((motif) => new RegExp(`^${motif}$`).test(pathname))
}

describe('proxy', () => {
  it('pose le chemin demandé dans x-pathname', async () => {
    const response = proxy(requete('http://localhost:3400/admin/parametres'))
    expect(enTeteAjoute(response, 'x-pathname')).toBe('/admin/parametres')
  })

  it('transmet le chemin sans la chaîne de requête', async () => {
    const response = proxy(requete('http://localhost:3400/recherche?q=led&page=2'))

    // La mise en page compare un préfixe : une chaîne de requête collée au
    // chemin ferait échouer la comparaison.
    expect(enTeteAjoute(response, 'x-pathname')).toBe('/recherche')
  })

  it('laisse passer la requête au lieu de la détourner', () => {
    const response = proxy(requete('http://localhost:3400/'))
    // Ni redirection ni réécriture : ce proxy n'est là que pour un en-tête.
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('s’applique aux pages de la boutique ET du back-office', () => {
    for (const chemin of ['/', '/admin', '/admin/parametres', '/p/kit-led-h7', '/commande']) {
      expect(matche(chemin), chemin).toBe(true)
    }
  })

  it('ne s’applique pas aux fichiers statiques', () => {
    // Inutile, et cela ferait tourner le proxy sur chaque image.
    for (const chemin of ['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/demo/x.jpg']) {
      expect(matche(chemin), chemin).toBe(false)
    }
  })
})
