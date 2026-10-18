import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  can,
  canAny,
  permissionsOf,
  type Permission,
} from '../src/lib/admin/permissions'

/**
 * Droits du back-office.
 *
 * Ce que ces tests protègent : une table de droits se dégrade en silence. On
 * ajoute une permission, on oublie de la retirer d'un rôle, et un préparateur
 * se retrouve à pouvoir rembourser — sans que rien ne casse ni ne s'affiche.
 *
 * Les séparations testées ici ne sont pas cosmétiques :
 *   - préparer une commande et rendre de l'argent sont deux métiers distincts ;
 *   - le SAV décide d'un retour, l'administration rembourse ;
 *   - un consultant ne doit pouvoir écrire nulle part.
 */

const ROLES = ['ADMIN', 'CATALOG_MANAGER', 'FULFILLMENT', 'SUPPORT', 'READ_ONLY'] as const

/** Toute permission qui modifie quelque chose. */
const WRITE_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (permission) => !permission.endsWith('.view'),
)

describe('table des droits', () => {
  it('couvre tous les rôles, avec libellé et description', () => {
    for (const role of ROLES) {
      expect(permissionsOf(role).length).toBeGreaterThan(0)
      expect(ROLE_LABELS[role]).toBeTruthy()
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy()
    }
  })

  it('ne distribue que des permissions déclarées', () => {
    for (const role of ROLES) {
      for (const permission of permissionsOf(role)) {
        expect(PERMISSIONS).toContain(permission)
      }
    }
  })

  it('refuse tout à qui n’a pas de rôle', () => {
    for (const permission of PERMISSIONS) {
      expect(can(null, permission)).toBe(false)
      expect(can(undefined, permission)).toBe(false)
    }
  })
})

describe('ADMIN', () => {
  it('a tous les droits', () => {
    for (const permission of PERMISSIONS) {
      expect(can('ADMIN', permission)).toBe(true)
    }
  })
})

describe('READ_ONLY', () => {
  it('ne peut écrire nulle part', () => {
    for (const permission of WRITE_PERMISSIONS) {
      expect(can('READ_ONLY', permission)).toBe(false)
    }
  })

  it('peut tout de même consulter', () => {
    expect(can('READ_ONLY', 'orders.view')).toBe(true)
    expect(can('READ_ONLY', 'catalog.view')).toBe(true)
    expect(can('READ_ONLY', 'customers.view')).toBe(true)
  })
})

describe('FULFILLMENT — préparer n’est pas rembourser', () => {
  it('peut préparer et expédier', () => {
    expect(can('FULFILLMENT', 'orders.view')).toBe(true)
    expect(can('FULFILLMENT', 'orders.fulfil')).toBe(true)
  })

  it('ne peut ni rembourser ni annuler', () => {
    expect(can('FULFILLMENT', 'orders.refund')).toBe(false)
    expect(can('FULFILLMENT', 'orders.cancel')).toBe(false)
  })

  it('ne peut pas modifier le catalogue ni les paramètres', () => {
    expect(can('FULFILLMENT', 'catalog.edit')).toBe(false)
    expect(can('FULFILLMENT', 'settings.edit')).toBe(false)
    expect(can('FULFILLMENT', 'staff.manage')).toBe(false)
  })
})

describe('SUPPORT — traiter une demande n’est pas rendre l’argent', () => {
  it('peut traiter le SAV et annoter un client', () => {
    expect(can('SUPPORT', 'sav.handle')).toBe(true)
    expect(can('SUPPORT', 'customers.note')).toBe(true)
  })

  it('ne peut pas rembourser', () => {
    expect(can('SUPPORT', 'orders.refund')).toBe(false)
  })

  it('ne peut pas modifier le catalogue', () => {
    expect(can('SUPPORT', 'catalog.edit')).toBe(false)
  })
})

describe('CATALOG_MANAGER', () => {
  it('peut gérer catalogue, véhicules, promotions et imports', () => {
    expect(can('CATALOG_MANAGER', 'catalog.edit')).toBe(true)
    expect(can('CATALOG_MANAGER', 'catalog.publish')).toBe(true)
    expect(can('CATALOG_MANAGER', 'vehicles.edit')).toBe(true)
    expect(can('CATALOG_MANAGER', 'promotions.edit')).toBe(true)
    expect(can('CATALOG_MANAGER', 'imports.run')).toBe(true)
  })

  it('ne touche ni à l’argent ni à la préparation', () => {
    expect(can('CATALOG_MANAGER', 'orders.fulfil')).toBe(false)
    expect(can('CATALOG_MANAGER', 'orders.refund')).toBe(false)
    expect(can('CATALOG_MANAGER', 'orders.cancel')).toBe(false)
  })
})

describe('droits réservés à l’administration', () => {
  it.each(['orders.refund', 'orders.cancel', 'settings.edit', 'staff.manage'] as const)(
    '%s n’est donné qu’à ADMIN',
    (permission) => {
      const holders = ROLES.filter((role) => can(role, permission))
      expect(holders).toEqual(['ADMIN'])
    },
  )
})

describe('canAny', () => {
  it('suffit qu’un seul droit soit présent', () => {
    expect(canAny('FULFILLMENT', ['orders.refund', 'orders.fulfil'])).toBe(true)
    expect(canAny('FULFILLMENT', ['orders.refund', 'settings.edit'])).toBe(false)
    expect(canAny(null, ['orders.view'])).toBe(false)
  })
})
