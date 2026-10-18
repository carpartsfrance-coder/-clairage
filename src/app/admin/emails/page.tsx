import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStaff } from '@/lib/admin/guard'
import { can } from '@/lib/admin/permissions'
import { emailIsSimulated } from '@/lib/email'
import { TEMPLATES, TEMPLATE_KEYS, renderSample, type TemplateKey } from '@/lib/email/templates'
import { EmailTestForm } from '@/components/admin/EmailTestForm'
import { Alert, Card } from '@/components/ui/Surface'
import { cn } from '@/lib/cn'

/**
 * Modèles de messages transactionnels.
 *
 * Écran de relecture : on voit ce que le client recevra, avec le jeu d'exemple
 * du modèle, avant qu'un message ne parte pour de bon. Un e-mail transactionnel
 * part une fois et ne se corrige pas.
 *
 * L'information qui commande tout l'écran est le bandeau du haut : avec le
 * pilote `log`, rien ne part et chaque message est seulement écrit dans
 * `EmailLog`. Personne ne doit croire qu'un message est parti alors qu'il a été
 * journalisé.
 *
 * La page se lit avec `settings.view`, mais l'envoi de test exige
 * `settings.edit` : relire un modèle ne sort de nulle part, envoyer sort vers
 * une adresse réelle.
 *
 * L'aperçu HTML est rendu dans une iframe `sandbox=""` : le corps d'un message
 * est du HTML, et cette page n'a aucune raison de lui laisser exécuter quoi que
 * ce soit ni d'atteindre la session du back-office.
 */

export const metadata: Metadata = {
  title: 'Modèles de messages',
  robots: { index: false, follow: false },
}

/**
 * Le modèle demandé vient de l'URL. Il est validé contre le catalogue avant
 * toute utilisation : une valeur d'URL ne sert jamais d'index telle quelle.
 */
function readTemplate(value: string | string[] | undefined): TemplateKey {
  const raw = Array.isArray(value) ? value[0] : value
  return TEMPLATE_KEYS.includes(raw as TemplateKey) ? (raw as TemplateKey) : TEMPLATE_KEYS[0]
}

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ modele?: string | string[] }>
}) {
  const staff = await requireStaff('settings.view')
  const { modele } = await searchParams

  const key = readTemplate(modele)
  const template = TEMPLATES[key]
  const sample = renderSample(key)
  const simulated = emailIsSimulated()
  // Relire un modèle est une lecture ; envoyer en est une autre affaire. Le
  // formulaire n'est proposé qu'au rôle qui a le droit, et l'action le
  // revérifie de son côté : masquer ne protège rien.
  const canSend = can(staff.role, 'settings.edit')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-extrabold">Modèles de messages</h1>
        <p className="mt-0.5 text-xs text-muted">
          {TEMPLATE_KEYS.length} modèles, rendus avec leur jeu d&apos;exemple.
        </p>
      </div>

      {/* ---------------- Ce qui se passe réellement à l'envoi ---------------- */}
      {simulated ? (
        <Alert tone="warn" title="Aucun envoi réel" live="polite">
          Le pilote d&apos;envoi est en mode journal : aucun message ne quitte le serveur. Chaque
          message est enregistré dans la table <span className="font-semibold">EmailLog</span> avec
          la mention <span className="font-semibold">« simulé »</span>, y compris les envois de test
          de cette page. Il faut les trois variables{' '}
          <span className="font-semibold">EMAIL_DRIVER</span>,{' '}
          <span className="font-semibold">EMAIL_API_KEY</span> et{' '}
          <span className="font-semibold">EMAIL_FROM</span> pour envoyer pour de vrai : un pilote
          renseigné sans clé ni expéditeur reste en mode journal.
        </Alert>
      ) : (
        <Alert tone="ok" title="Les envois partent réellement">
          Le pilote d&apos;envoi est configuré : les messages quittent le serveur et arrivent chez
          leurs destinataires. Un envoi de test depuis cette page est un vrai e-mail.
        </Alert>
      )}

      <div className="flex flex-col gap-5 xl:flex-row xl:gap-8">
        {/* ---------------- Liste des modèles ---------------- */}
        <nav aria-label="Modèles de messages" className="shrink-0 xl:w-72">
          <ul className="flex flex-col gap-1">
            {TEMPLATE_KEYS.map((entry) => {
              const current = entry === key
              const definition = TEMPLATES[entry]
              return (
                <li key={entry}>
                  <Link
                    href={`/admin/emails?modele=${encodeURIComponent(entry)}`}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'block rounded-sm px-2.5 py-2 transition-colors',
                      current
                        ? 'bg-surface-muted font-bold text-slate-ink'
                        : 'text-muted-strong hover:bg-surface-soft hover:text-slate-ink',
                    )}
                  >
                    <span className="block text-sm">{definition.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{definition.trigger}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ---------------- Modèle choisi ---------------- */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div>
            <h2 className="text-base font-bold">{template.label}</h2>
            <p className="mt-0.5 text-sm text-muted-strong">{template.trigger}</p>
          </div>

          <div className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm">
            <span className="font-semibold">Sujet :</span> {sample.subject}
          </div>

          <div>
            {/*
              Aperçu isolé : le bac à sable vide retire les scripts, les
              formulaires et l'accès au document parent.
            */}
            <iframe
              srcDoc={sample.html}
              title="Aperçu du message"
              sandbox=""
              className="h-[520px] w-full rounded-md border border-line bg-white"
            />
          </div>

          <details className="rounded-md border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold">Version texte</summary>
            <p className="mt-2 text-xs text-muted">
              Chaque message part aussi en texte brut : les filtres anti-indésirables pénalisent un
              HTML sans équivalent texte, et certains clients de messagerie n&apos;affichent que
              cette version.
            </p>
            <pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap text-muted-strong">
              {sample.text}
            </pre>
          </details>

          <details className="rounded-md border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold">
              Variables d&apos;exemple
            </summary>
            <pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap text-muted-strong">
              {JSON.stringify(TEMPLATES[key].sample, null, 2)}
            </pre>
          </details>

          <Card className="px-4 py-3">
            <h3 className="text-sm font-bold">Envoyer un test</h3>
            <p className="mt-0.5 mb-3 text-xs text-muted">
              Le message est rendu avec le jeu d&apos;exemple ci-dessus.
            </p>
            {canSend ? (
              /*
                Remonté à chaque changement de modèle : un retour d'envoi ne
                doit pas rester affiché sous un autre message que celui qu'il
                concerne.
              */
              <EmailTestForm key={key} templateKey={key} defaultTo={staff.email} />
            ) : (
              <p className="text-xs text-muted-strong">
                Votre rôle permet de relire les modèles, pas d&apos;envoyer de message : un envoi
                part vers une adresse réelle. Demandez-le à un administrateur.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
