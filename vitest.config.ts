import { defineConfig } from 'vitest/config'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://${process.env.USER ?? 'postgres'}@localhost:5432/lumera_test?schema=public`

export default defineConfig({
  test: {
    environment: 'node',
    // Les tests touchent une vraie base : en parallèle, ils se marcheraient
    // dessus (chaque fichier la remet à zéro). Ils durent moins d'une seconde.
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    // DATABASE_URL est écrasé AVANT le chargement des modules : le client
    // Prisma partagé de src/lib/db.ts vise donc la base de test, et jamais
    // celle de développement. Sans cela, un test de commande écrirait dans les
    // données réelles.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
      /*
        Les variables de paiement sont NEUTRALISÉES.

        Vitest charge le `.env` du poste : sans ces lignes, une clé Mollie ou
        Stripe laissée en développement changerait le pilote choisi pendant les
        tests, et la suite ne dirait plus la même chose d'une machine à l'autre.
        Le cas s'est produit : des tests d'expiration passaient au vert ici et au
        rouge ailleurs, pour cette seule raison.

        Les tests qui ont besoin d'un prestataire le posent eux-mêmes, et le
        retirent après.
      */
      MOLLIE_API_KEY: '',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      PAYMENT_PROVIDER: '',
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
      // `server-only` lève à l'import hors composant serveur : c'est son rôle,
      // mais sous Vitest il n'y a pas de frontière à protéger et il empêcherait
      // simplement de tester les modules serveur.
      'server-only': new URL('./tests/stubs/server-only.ts', import.meta.url).pathname,
    },
  },
})
