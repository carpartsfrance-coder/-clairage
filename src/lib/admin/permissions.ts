import type { StaffRole } from '@prisma/client'

/**
 * Droits du back-office.
 *
 * Une seule table, lisible d'un coup d'œil : c'est le point où l'on vérifie
 * qu'un préparateur ne peut pas rembourser et qu'un consultant ne peut rien
 * écrire. Éparpiller ces règles dans les pages les rendrait invérifiables.
 *
 * Le principe est le moindre privilège : chaque rôle reçoit ce que son métier
 * exige, rien de plus. `ADMIN` est le seul à tout pouvoir, et c'est voulu — les
 * actions irréversibles (rembourser, changer les paramètres, gérer l'équipe)
 * doivent rester rares et tracées.
 */

export const PERMISSIONS = [
  'dashboard.view',

  'orders.view',
  /** Changer un statut, préparer, expédier, ajouter un suivi. */
  'orders.fulfil',
  /** Rembourser, total ou partiel. Action irréversible côté argent. */
  'orders.refund',
  /** Annuler une commande et remettre le stock à disposition. */
  'orders.cancel',
  'orders.export',

  'customers.view',
  /** Écrire une note interne, invisible du client. */
  'customers.note',

  'catalog.view',
  'catalog.edit',
  /** Publier ou archiver : ce qui décide de ce que voient les clients. */
  'catalog.publish',

  'vehicles.view',
  'vehicles.edit',

  'sav.view',
  'sav.handle',

  'promotions.view',
  'promotions.edit',

  'settings.view',
  'settings.edit',

  /** Créer ou modifier un compte de l'équipe. */
  'staff.manage',

  'imports.run',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/** Tout ce qu'un consultant peut faire : lire, et rien d'autre. */
const READ_ONLY_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'orders.view',
  'customers.view',
  'catalog.view',
  'vehicles.view',
  'sav.view',
  'promotions.view',
  'settings.view',
]

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  ADMIN: PERMISSIONS,

  CATALOG_MANAGER: [
    'dashboard.view',
    'catalog.view',
    'catalog.edit',
    'catalog.publish',
    'vehicles.view',
    'vehicles.edit',
    'promotions.view',
    'promotions.edit',
    'imports.run',
    // Lecture des commandes seulement : utile pour comprendre une vente, mais
    // la préparation et l'argent ne le concernent pas.
    'orders.view',
  ],

  FULFILLMENT: [
    'dashboard.view',
    'orders.view',
    'orders.fulfil',
    'orders.export',
    'customers.view',
    'catalog.view',
    'vehicles.view',
    // Volontairement sans 'orders.refund' ni 'orders.cancel' : préparer une
    // commande et rendre de l'argent sont deux métiers différents.
  ],

  SUPPORT: [
    'dashboard.view',
    'orders.view',
    'customers.view',
    'customers.note',
    'catalog.view',
    'vehicles.view',
    'sav.view',
    'sav.handle',
    // Le SAV décide d'un retour, mais c'est un administrateur qui rembourse.
  ],

  READ_ONLY: READ_ONLY_PERMISSIONS,
}

export function can(role: StaffRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** Vrai si le rôle possède au moins un des droits demandés. */
export function canAny(role: StaffRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission))
}

export function permissionsOf(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: 'Administration',
  CATALOG_MANAGER: 'Catalogue',
  FULFILLMENT: 'Préparation',
  SUPPORT: 'Service après-vente',
  READ_ONLY: 'Consultation',
}

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  ADMIN: 'Tout, y compris les remboursements, les paramètres et les comptes de l’équipe.',
  CATALOG_MANAGER:
    'Produits, catégories, véhicules, compatibilités, promotions et imports. Lecture des commandes.',
  FULFILLMENT:
    'Commandes, préparation, expéditions et suivi. Ni remboursement, ni annulation.',
  SUPPORT: 'Demandes SAV, retours, clients et notes internes. Pas de remboursement.',
  READ_ONLY: 'Consultation seule. Aucune écriture, nulle part.',
}
