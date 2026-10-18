'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { login, register, type AuthState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Surface'
import { TextField } from '@/components/ui/Field'

/* --------------------------------------------------------------------------
   Formulaires d'accès au compte
   --------------------------------------------------------------------------
   Ces deux formulaires sont des composants client pour une seule raison :
   `useActionState`, qui affiche le retour de l'action. Rien n'est décidé ici —
   validation, limitation de fréquence, création de session et rédaction des
   messages appartiennent à `lib/actions/auth`.

   Les messages renvoyés sont affichés TELS QUELS. Ils sont écrits côté serveur
   pour ne jamais révéler si une adresse e-mail a un compte : y ajouter une
   nuance (« adresse inconnue », « compte déjà créé ») suffirait à annuler cette
   précaution et permettrait de dresser la liste des clients.
   -------------------------------------------------------------------------- */

/** Lien sous un formulaire : hauteur de 44 px, comme les boutons. */
const footLink =
  'inline-flex min-h-11 items-center text-sm font-semibold text-slate-ink underline ' +
  'decoration-line-strong underline-offset-4 hover:text-brand hover:decoration-brand'

export function LoginForm({
  next,
  justeReinitialise = false,
}: {
  /** Chemin interne vers lequel revenir après connexion. */
  next?: string
  /** Vrai au retour d'une réinitialisation de mot de passe réussie. */
  justeReinitialise?: boolean
}) {
  const [state, formAction, pending] = useActionState(login, {} as AuthState)

  return (
    <div className="flex flex-col gap-5">
      {justeReinitialise ? (
        <Alert tone="ok">
          Votre mot de passe a été modifié. Connectez-vous avec le nouveau.
        </Alert>
      ) : null}

      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <Alert tone="danger" live="assertive">
            {state.error}
          </Alert>
        ) : null}

        {/*
          Chemin de retour transmis au serveur plutôt que conservé côté client :
          `login` n'accepte qu'un chemin interne, un lien absolu est ignoré.
        */}
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <TextField
          id="connexion-email"
          name="email"
          label="Adresse e-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />

        <TextField
          id="connexion-mot-de-passe"
          name="password"
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          required
        />

        <Button type="submit" size="lg" block disabled={pending}>
          {pending ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      <div className="flex flex-col items-start gap-1 border-t border-line pt-3">
        <Link href="/mot-de-passe-oublie" className={footLink}>
          Mot de passe oublié ?
        </Link>
        <Link href="/inscription" className={footLink}>
          Créer un compte
        </Link>
      </div>
    </div>
  )
}

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, {} as AuthState)

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state.error ? (
          <Alert tone="danger" live="assertive">
            {state.error}
          </Alert>
        ) : null}

        {/*
          Message neutre rédigé côté serveur. On l'affiche sans rien ajouter,
          et surtout sans distinguer d'un mot ou d'une couleur le cas d'une
          adresse libre de celui d'une adresse déjà prise.
        */}
        {state.notice ? <Alert tone="info">{state.notice}</Alert> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="inscription-prenom"
            name="firstName"
            label="Prénom"
            hint="Facultatif"
            autoComplete="given-name"
            error={state.fieldErrors?.firstName}
          />
          <TextField
            id="inscription-nom"
            name="lastName"
            label="Nom"
            hint="Facultatif"
            autoComplete="family-name"
            error={state.fieldErrors?.lastName}
          />
        </div>

        <TextField
          id="inscription-email"
          name="email"
          label="Adresse e-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          error={state.fieldErrors?.email}
        />

        <TextField
          id="inscription-mot-de-passe"
          name="password"
          label="Mot de passe"
          type="password"
          autoComplete="new-password"
          required
          hint="12 caractères minimum. Préférez une phrase facile à retenir."
          error={state.fieldErrors?.password}
        />

        <Button type="submit" size="lg" block disabled={pending}>
          {pending ? 'Création…' : 'Créer mon compte'}
        </Button>
      </form>

      <div className="flex flex-col items-start border-t border-line pt-3">
        <Link href="/connexion" className={footLink}>
          J&apos;ai déjà un compte
        </Link>
      </div>
    </div>
  )
}
