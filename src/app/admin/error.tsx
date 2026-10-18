'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'

/**
 * Écran d'erreur du back-office.
 *
 * Il existe parce que certaines lectures d'administration **laissent** leur
 * erreur remonter, délibérément : un historique d'imports qui échoue doit
 * afficher une panne, pas « Aucun import ». Encore faut-il que la panne soit
 * lisible et qu'une sortie existe, sinon le choix se paie d'un écran blanc.
 *
 * Le message technique n'est pas affiché : il peut contenir un fragment de
 * requête ou une URL de connexion. Le `digest` suffit à retrouver la trace
 * côté serveur, où elle est complète.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin] erreur de rendu', error)
  }, [error])

  return (
    <div className="container-page py-10">
      <Alert tone="danger" title="Cette page n’a pas pu être affichée" live="assertive">
        <p>
          Une lecture a échoué. Rien n’a été écrit : les écrans d’administration qui affichent une
          liste ne modifient pas de données.
        </p>
        <p className="mt-2">
          Si l’erreur persiste, vérifiez que la base est joignable —{' '}
          <code className="rounded-sm bg-white/60 px-1">/api/health</code> répond{' '}
          <code className="rounded-sm bg-white/60 px-1">database: up</code> quand c’est le cas.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs">
            Référence de la trace serveur : <code>{error.digest}</code>
          </p>
        ) : null}
      </Alert>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" size="sm" onClick={() => reset()}>
          Réessayer
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => window.location.assign('/admin')}>
          Retour au tableau de bord
        </Button>
      </div>
    </div>
  )
}
