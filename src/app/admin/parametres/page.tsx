import type { Metadata } from 'next'
import { requireStaff } from '@/lib/admin/guard'
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/admin/permissions'
import { listAuditLog, listSettings, listStaff } from '@/lib/queries/admin'
import { Badge } from '@/components/ui/Badge'
import { Alert, Card, EmptyState } from '@/components/ui/Surface'

/**
 * Paramètres, équipe et journal des actions.
 *
 * Trois lectures, trois portées différentes. La liste des comptes n'est rendue
 * qu'à qui a le droit de les gérer : un préparateur n'a pas à savoir qui est
 * administrateur ni quand il s'est connecté. La donnée n'est d'ailleurs pas
 * seulement masquée — elle n'est pas lue.
 */

export const metadata: Metadata = {
  title: 'Paramètres',
  robots: { index: false, follow: false },
}

/* -------------------------------------------------------------------------- */
/* Libellés                                                                   */
/* -------------------------------------------------------------------------- */

/* Groupes connus. Un groupe ajouté en base s'affiche sous sa clé brute plutôt
   que de disparaître. */
const groupCopy: Record<string, string> = {
  general: 'Général',
  billing: 'Facturation',
  payments: 'Paiement',
  email: 'E-mail',
}

const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/** Valeur Json rendue telle qu'elle est stockée : c'est un écran technique. */
function valueText(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '—'
  } catch {
    return '—'
  }
}

type StaffRow = Awaited<ReturnType<typeof listStaff>>[number]

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const h2Class = 'text-sm font-bold'
const thClass = 'px-3 py-2 text-left text-xs font-semibold text-muted-strong'
const tdClass = 'px-3 py-2 align-top'

export default async function AdminSettingsPage() {
  const staff = await requireStaff('settings.view')

  const canManageStaff = can(staff.role, 'staff.manage')

  const settings = await listSettings()
  // Lecture conditionnée au droit : masquer une section déjà chargée laisserait
  // la donnée partir dans la réponse du serveur.
  const team: StaffRow[] = canManageStaff ? await listStaff() : []
  const auditLog = await listAuditLog(50)

  // Regroupement par `group`, dans l'ordre déjà rendu par la requête.
  const groups = new Map<string, typeof settings>()
  for (const setting of settings) {
    const bucket = groups.get(setting.group)
    if (bucket) bucket.push(setting)
    else groups.set(setting.group, [setting])
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-extrabold">Paramètres</h1>

      <Alert tone="info">
        La modification des paramètres depuis le back-office n&apos;est pas encore disponible : une
        valeur déjà enregistrée se change en base. Le script d&apos;amorçage ne crée que les
        réglages manquants — il ne réécrit jamais une valeur existante.
      </Alert>

      {/* ---------------------------------------------------------------------
          Réglages
          --------------------------------------------------------------------- */}
      <section aria-labelledby="parametres-reglages">
        <h2 id="parametres-reglages" className={h2Class}>
          Réglages
        </h2>

        {settings.length === 0 ? (
          <EmptyState className="mt-2" title="Aucun réglage enregistré." />
        ) : (
          <Card className="mt-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <caption className="sr-only">Réglages de la boutique, par groupe</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-soft">
                    <th scope="col" className={thClass}>
                      Clé
                    </th>
                    <th scope="col" className={thClass}>
                      Libellé
                    </th>
                    <th scope="col" className={thClass}>
                      Valeur
                    </th>
                  </tr>
                </thead>
                {[...groups.entries()].map(([group, rows]) => (
                  <tbody key={group}>
                    <tr className="border-b border-line bg-surface-muted">
                      <th
                        scope="rowgroup"
                        colSpan={3}
                        className="px-3 py-1.5 text-left text-xs font-bold"
                      >
                        {groupCopy[group] ?? group}
                      </th>
                    </tr>
                    {rows.map((setting) => (
                      <tr key={setting.key} className="border-b border-line">
                        <td className={`${tdClass} font-mono text-xs`}>{setting.key}</td>
                        <td className={tdClass}>{setting.label}</td>
                        <td className={`${tdClass} font-mono text-xs break-all`}>
                          {valueText(setting.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ---------------------------------------------------------------------
          Équipe — réservée à qui gère les comptes
          --------------------------------------------------------------------- */}
      {canManageStaff ? (
        <section aria-labelledby="parametres-equipe">
          <h2 id="parametres-equipe" className={h2Class}>
            Équipe
          </h2>

          <p className="mt-1 text-sm text-muted-strong">
            Les comptes se créent en ligne de commande :{' '}
            <span className="font-mono">npm run admin:create</span>.
          </p>

          {team.length === 0 ? (
            <EmptyState className="mt-2" title="Aucun compte dans l’équipe." />
          ) : (
            <Card className="mt-2">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[64rem] text-sm">
                  <caption className="sr-only">Comptes de l&apos;équipe</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface-soft">
                      <th scope="col" className={thClass}>
                        Adresse e-mail
                      </th>
                      <th scope="col" className={thClass}>
                        Nom
                      </th>
                      <th scope="col" className={thClass}>
                        Rôle
                      </th>
                      <th scope="col" className={thClass}>
                        Actif
                      </th>
                      <th scope="col" className={thClass}>
                        Dernière connexion
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((member) => {
                      const name = [member.firstName, member.lastName]
                        .filter(Boolean)
                        .join(' ')
                        .trim()
                      return (
                        <tr key={member.id} className="border-b border-line last:border-b-0">
                          <th scope="row" className={`${tdClass} text-left font-semibold`}>
                            {member.email}
                          </th>
                          <td className={tdClass}>
                            {name || <span className="text-muted">—</span>}
                          </td>
                          <td className={tdClass}>
                            {member.staffRole ? (
                              <>
                                <span className="font-medium">
                                  {ROLE_LABELS[member.staffRole]}
                                </span>
                                <span className="mt-0.5 block max-w-[26rem] text-xs text-muted">
                                  {ROLE_DESCRIPTIONS[member.staffRole]}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className={tdClass}>
                            {member.active ? (
                              <Badge tone="ok">Actif</Badge>
                            ) : (
                              <Badge tone="danger">Désactivé</Badge>
                            )}
                          </td>
                          <td className={`${tdClass} whitespace-nowrap text-muted-strong`}>
                            {member.lastLoginAt ? (
                              <time dateTime={member.lastLoginAt.toISOString()}>
                                {dateTimeFormatter.format(member.lastLoginAt)}
                              </time>
                            ) : (
                              <span className="text-muted">jamais</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>
      ) : null}

      {/* ---------------------------------------------------------------------
          Journal des actions
          La garde d'entrée exige déjà `settings.view` : répéter le test ici ne
          protégerait rien et laisserait croire à une seconde barrière.
          --------------------------------------------------------------------- */}
      <section aria-labelledby="parametres-journal">
        <h2 id="parametres-journal" className={h2Class}>
          Journal des actions
        </h2>

        <p className="mt-1 text-sm text-muted-strong">
          Les 50 dernières entrées, la plus récente d&apos;abord.
        </p>

        {auditLog.length === 0 ? (
          <EmptyState className="mt-2" title="Aucune action enregistrée." />
        ) : (
          <Card className="mt-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-sm">
                <caption className="sr-only">Journal des actions d&apos;administration</caption>
                <thead>
                  <tr className="border-b border-line bg-surface-soft">
                    <th scope="col" className={thClass}>
                      Date
                    </th>
                    <th scope="col" className={thClass}>
                      Acteur
                    </th>
                    <th scope="col" className={thClass}>
                      Action
                    </th>
                    <th scope="col" className={thClass}>
                      Entité
                    </th>
                    <th scope="col" className={thClass}>
                      Identifiant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <tr key={entry.id} className="border-b border-line last:border-b-0">
                      <th
                        scope="row"
                        className={`${tdClass} text-left font-normal whitespace-nowrap text-muted-strong`}
                      >
                        <time dateTime={entry.createdAt.toISOString()}>
                          {dateTimeFormatter.format(entry.createdAt)}
                        </time>
                      </th>
                      <td className={`${tdClass} break-words`}>
                        {entry.actor?.email ?? <span className="text-muted">système</span>}
                      </td>
                      <td className={`${tdClass} font-mono text-xs`}>{entry.action}</td>
                      <td className={tdClass}>{entry.entity}</td>
                      <td className={`${tdClass} font-mono text-xs break-all`}>
                        {entry.entityId ?? <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  )
}
