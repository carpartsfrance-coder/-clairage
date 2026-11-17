import { describe, expect, it } from 'vitest'
import { titreDuChoix } from '@/components/product/BuyBox'

describe('titreDuChoix', () => {
  it('parle de couleur quand les options sont des teintes', () => {
    expect(
      titreDuChoix([
        { name: 'Blanc neutre 4 000 K', packaging: 'UNIT' },
        { name: 'Blanc pur 5000K', packaging: 'UNIT' },
        { name: 'Blanc froid 6 500 K', packaging: 'UNIT' },
      ]),
    ).toBe('Choisissez votre couleur de lumière')
  })

  it('parle de conditionnement quand ils diffèrent', () => {
    expect(
      titreDuChoix([
        { name: 'La paire', packaging: 'PAIR' },
        { name: 'Le kit complet', packaging: 'KIT' },
      ]),
    ).toBe('Choisissez votre conditionnement')
  })

  it('garde « kit » pour des kits', () => {
    expect(
      titreDuChoix([
        { name: 'Kit Slim', packaging: 'KIT' },
        { name: 'Kit Canbus', packaging: 'KIT' },
      ]),
    ).toBe('Choisissez votre kit')
  })
})
