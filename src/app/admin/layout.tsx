import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/AdminNav'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { requireStaff, staffName } from '@/lib/admin/guard'
import { ROLE_LABELS } from '@/lib/admin/permissions'
import { logout } from '@/lib/actions/auth'

/**
 * Mise en page du back-office.
 *
 * Le socle minimal est `dashboard.view` : tout membre de l'équipe l'a, et
 * c'est ce qui permet à `requireStaff` de renvoyer vers /admin?refus=… une
 * personne qui tente une section hors de son périmètre, au lieu de la jeter
 * hors du back-office.
 *
 * Pleine largeur volontairement : c'est un outil de travail, pas une page de
 * vente, et `container-page` plafonnerait les tableaux à 1360 px.
 */

export const metadata: Metadata = {
  title: {
    default: 'Administration',
    template: '%s · Administration',
  },
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff('dashboard.view')

  return (
    <div className="bg-white">
      {/*
        La mise en page racine ne pose ni <main> ni lien d'évitement sur le
        back-office : c'est ici qu'ils sont rendus, sinon la zone de travail
        n'est plus un repère de navigation et le clavier traverse la
        navigation complète à chaque page.
      */}
      <a href="#contenu-admin" className="skip-link">
        Aller au contenu
      </a>

      {/* ---------------- Bandeau d'administration ---------------- */}
      <div className="on-dark bg-ink text-white">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <p className="flex items-center gap-2 text-sm">
            <span className="font-wordmark text-base font-extrabold tracking-wide">LUMERA</span>
            <span aria-hidden className="text-white/40">
              ·
            </span>
            <span className="text-white/80">Administration</span>
          </p>

          <div className="flex items-center gap-3">
            <Badge tone="neutral">{ROLE_LABELS[staff.role]}</Badge>
            <form action={logout}>
              <Button type="submit" variant="onDark" size="sm">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* ---------------- Navigation + contenu ---------------- */}
      <div className="px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          <AdminNav role={staff.role} name={staffName(staff)} />
          <main id="contenu-admin" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
