import { describe, expect, it } from 'vitest'
import { redirectionVersDomainePublic } from '../src/lib/domaine'

const PUBLIQUE = 'https://ledvroom.com'
const url = (chemin: string) => new URL(`http://localhost:10000${chemin}`)

describe('un seul domaine public', () => {
  it('renvoie l’adresse Render vers ledvroom.com, chemin et paramètres compris', () => {
    expect(redirectionVersDomainePublic('lumera-web.onrender.com', url('/p/pack?x=1'), PUBLIQUE)).toBe(
      'https://ledvroom.com/p/pack?x=1',
    )
    expect(redirectionVersDomainePublic('lumera-web.onrender.com:443', url('/'), PUBLIQUE)).toBe(
      'https://ledvroom.com/',
    )
  })

  it('laisse passer le domaine public, le contrôle de santé et le développement', () => {
    expect(redirectionVersDomainePublic('ledvroom.com', url('/'), PUBLIQUE)).toBeNull()
    expect(redirectionVersDomainePublic('lumera-web.onrender.com', url('/api/health'), PUBLIQUE)).toBeNull()
    expect(redirectionVersDomainePublic('localhost:3400', url('/'), 'http://localhost:3400')).toBeNull()
    expect(redirectionVersDomainePublic('lumera-web.onrender.com', url('/'), 'http://localhost:3400')).toBeNull()
    expect(redirectionVersDomainePublic(null, url('/'), PUBLIQUE)).toBeNull()
  })
})
