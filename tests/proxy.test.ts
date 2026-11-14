import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, proxy } from '../src/proxy'

/**
 * Convention « proxy » (l'ancien « middleware », renommé par Next 16).
 *
 * Ce fichier posait un en-tête `x-pathname`, que la mise en page racine lisait
 * pour savoir si elle devait coiffer la page de l'en-tête et du pied de page de
 * la boutique. Cette lecture rendait **toutes** les pages du site dynamiques :
 * aucune ne pouvait être mise en cache. La distinction passe désormais par le
 * groupe de routes `(boutique)`, qui répond à la même question sans rien lire
 * de la requête.
 *
 * Ces tests protègent donc deux choses : que le proxy laisse passer les
 * requêtes sans les détourner, et qu'il **ne réintroduise pas** le couplage
 * qu'on vient de retirer.
 *
 * Le seul import de `../src/proxy` est déjà une garde : il échoue si le fichier
 * change de nom ou si la fonction n'est plus exportée sous ce nom.
 */

function requete(url: string): NextRequest {
  return new NextRequest(new Request(url))
}

/**
 * Récupère l'en-tête de requête que le proxy a ajouté, s'il y en a un.
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
  it('ne pose plus x-pathname', () => {
    /*
      Garde-fou : remettre cet en-tête n'est anodin qu'en apparence. Dès qu'une
      mise en page le lit, elle lit la requête — et tout ce qu'elle enveloppe
      cesse d'être mis en cache.
    */
    for (const chemin of ['/admin/parametres', '/recherche?q=led&page=2', '/p/kit-led-h7']) {
      const response = proxy(requete(`http://localhost:3400${chemin}`))
      expect(enTeteAjoute(response, 'x-pathname'), chemin).toBeNull()
    }
  })

  it('laisse passer la requête au lieu de la détourner', () => {
    const response = proxy(requete('http://localhost:3400/'))
    // Ni redirection ni réécriture tant que l'hôte est déjà le bon.
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
