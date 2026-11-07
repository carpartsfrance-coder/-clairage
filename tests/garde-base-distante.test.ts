import { afterEach, describe, expect, it } from 'vitest'
import { baseEnLocal, ecritureDistanteAutorisee } from '../src/lib/admin/pose-rendus'

/**
 * Le garde-fou des commandes qui écrivent en masse.
 *
 * Il tient à un seul jugement — « cette base est-elle sur la machine ? » — et
 * c'est ce jugement qui décide si une commande peut réécrire dix mille fiches.
 * Une erreur dans un sens bloque le travail ; dans l'autre, elle laisse
 * réécrire la boutique en croyant toucher le poste. D'où ces cas.
 */

const origine = process.env.DATABASE_URL

afterEach(() => {
  if (origine === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = origine
})

describe('baseEnLocal', () => {
  it('reconnaît les bases du poste', () => {
    for (const hote of ['localhost', '127.0.0.1', 'db.localhost']) {
      process.env.DATABASE_URL = `postgresql://u:p@${hote}:5432/lumera_dev?schema=public`
      expect(baseEnLocal(), hote).toBe(true)
    }
  })

  it('reconnaît une base hébergée', () => {
    process.env.DATABASE_URL =
      'postgresql://u:p@dpg-abc123-a.frankfurt-postgres.render.com/lumera_u937'
    expect(baseEnLocal()).toBe(false)
  })

  it('ne se laisse pas prendre au nom de la base', () => {
    // « lumera_dev » sur un hôte distant reste une base distante : c'est
    // exactement la confusion que le garde-fou doit empêcher.
    process.env.DATABASE_URL = 'postgresql://u:p@dpg-abc123-a.render.com/lumera_dev'
    expect(baseEnLocal()).toBe(false)
  })

  it('traite l’absence et l’illisible comme non locales', () => {
    delete process.env.DATABASE_URL
    expect(baseEnLocal()).toBe(false)
    process.env.DATABASE_URL = 'pas une URL'
    expect(baseEnLocal()).toBe(false)
  })
})

describe('ecritureDistanteAutorisee', () => {
  it('laisse passer le poste sans drapeau', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/lumera_dev'
    const dits: string[] = []
    expect(ecritureDistanteAutorisee(false, (l) => dits.push(l))).toBe(true)
    expect(dits).toEqual([])
  })

  it('refuse une base distante sans drapeau, et dit laquelle', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@dpg-abc123-a.render.com/lumera_u937'
    const dits: string[] = []
    expect(ecritureDistanteAutorisee(false, (l) => dits.push(l))).toBe(false)
    expect(dits.join('\n')).toContain('dpg-abc123-a.render.com/lumera_u937')
    expect(dits.join('\n')).toContain('--base-distante')
  })

  it('ne divulgue pas les identifiants dans son refus', () => {
    process.env.DATABASE_URL = 'postgresql://utilisateur:motdepasse@dpg-abc123-a.render.com/lumera'
    const dits: string[] = []
    ecritureDistanteAutorisee(false, (l) => dits.push(l))
    expect(dits.join('\n')).not.toContain('motdepasse')
  })

  it('laisse passer une base distante avec le drapeau', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@dpg-abc123-a.render.com/lumera_u937'
    const dits: string[] = []
    expect(ecritureDistanteAutorisee(true, (l) => dits.push(l))).toBe(true)
    expect(dits).toEqual([])
  })
})
