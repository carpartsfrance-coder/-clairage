'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType } from 'react'
import type { StaffRole } from '@prisma/client'
import { cn } from '@/lib/cn'
import { can, ROLE_LABELS, type Permission } from '@/lib/admin/permissions'
import {
  IconCar,
  IconCart,
  IconGear,
  IconHeadset,
  IconPencil,
  IconSliders,
  IconTruck,
  IconUser,
  IconWrench,
} from '@/components/ui/icons'

/**
 * Navigation du back-office.
 *
 * Composant client, et uniquement pour cela : `usePathname` est le seul état
 * dont cette navigation a besoin. Un layout serveur ne connaît pas le chemin
 * demandé, et faire remonter la mise en évidence dans chaque page obligerait
 * à répéter la même information à neuf endroits.
 *
 * Une entrée n'est rendue que si le rôle en possède le droit. Masquer ne
 * protège rien — les pages et les actions revérifient avec `requireStaff` —
 * mais proposer une porte qui se refermera est une mauvaise interface.
 */

type Entry = {
  href: string
  label: string
  permission: Permission
  Icon: ComponentType<{ className?: string }>
}

const ENTRIES: Entry[] = [
  { href: '/admin', label: 'Tableau de bord', permission: 'dashboard.view', Icon: IconSliders },
  { href: '/admin/commandes', label: 'Commandes', permission: 'orders.view', Icon: IconCart },
  { href: '/admin/preparation', label: 'Préparation', permission: 'orders.fulfil', Icon: IconTruck },
  { href: '/admin/catalogue', label: 'Catalogue', permission: 'catalog.view', Icon: IconWrench },
  { href: '/admin/vehicules', label: 'Véhicules', permission: 'vehicles.view', Icon: IconCar },
  { href: '/admin/clients', label: 'Clients', permission: 'customers.view', Icon: IconUser },
  { href: '/admin/sav', label: 'SAV', permission: 'sav.view', Icon: IconHeadset },
  { href: '/admin/promotions', label: 'Promotions', permission: 'promotions.view', Icon: IconPencil },
  { href: '/admin/parametres', label: 'Paramètres', permission: 'settings.view', Icon: IconGear },
]

/**
 * Le tableau de bord est à la racine : il ne doit s'allumer que sur une
 * correspondance exacte, sinon il resterait actif sur toutes les sous-pages.
 */
function isActive(href: string, current: string): boolean {
  if (href === '/admin') return current === '/admin'
  return current === href || current.startsWith(`${href}/`)
}

export function AdminNav({
  role,
  name,
  current,
}: {
  role: StaffRole
  name: string
  /** Permet de forcer le chemin courant ; sinon il est lu de l'URL. */
  current?: string
}) {
  const pathname = usePathname()
  const here = current || pathname || ''
  const entries = ENTRIES.filter((entry) => can(role, entry.permission))

  return (
    <nav aria-label="Sections de l’administration" className="shrink-0 lg:w-60">
      <ul className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
        {entries.map(({ href, label, Icon }) => {
          const active = isActive(href, here)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-sm px-2.5 text-sm transition-colors',
                  active
                    ? 'bg-surface-muted font-semibold text-slate-ink'
                    : 'text-muted-strong hover:bg-surface-soft hover:text-slate-ink',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Qui est connecté, et avec quel périmètre. */}
      <div className="mt-4 border-t border-line pt-3 text-xs">
        <p className="truncate font-semibold text-slate-ink">{name}</p>
        <p className="text-muted">{ROLE_LABELS[role]}</p>
        <Link
          href="/"
          className="mt-2 inline-flex h-9 items-center text-xs font-semibold text-brand underline underline-offset-4"
        >
          Voir la boutique
        </Link>
      </div>
    </nav>
  )
}
