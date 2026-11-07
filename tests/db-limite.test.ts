import { describe, expect, it, vi } from 'vitest'

vi.mock('@prisma/client', () => ({ PrismaClient: class {} }))
const { avecLimiteDeConnexions } = await import('../src/lib/db')

/**
 * Le pool de connexions est borné : sans limite, une machine de build à 47
 * cœurs ouvrait près d'une centaine de connexions par processus et la base
 * Render coupait tout (build du 7 novembre 2026).
 */
describe('limite de connexions', () => {
  it('ajoute connection_limit quand l’adresse n’en a pas', () => {
    const url = avecLimiteDeConnexions('postgresql://u:p@hote:5432/base?schema=public')
    expect(new URL(url!).searchParams.get('connection_limit')).toBe('10')
    expect(new URL(url!).searchParams.get('schema')).toBe('public')
  })

  it('garde une limite écrite dans DATABASE_URL', () => {
    const url = avecLimiteDeConnexions('postgresql://u:p@hote:5432/base?connection_limit=3')
    expect(new URL(url!).searchParams.get('connection_limit')).toBe('3')
  })

  it('laisse passer une adresse absente ou illisible', () => {
    expect(avecLimiteDeConnexions(undefined)).toBeUndefined()
    expect(avecLimiteDeConnexions('pas une adresse')).toBe('pas une adresse')
  })
})
