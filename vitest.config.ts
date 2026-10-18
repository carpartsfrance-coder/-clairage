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
    env: { DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test' },
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
