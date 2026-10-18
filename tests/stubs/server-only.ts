// `server-only` lève à l'import hors d'un composant serveur : c'est son rôle.
// Sous Vitest il n'y a pas de frontière client/serveur à protéger, et le garde
// empêcherait simplement de tester les modules serveur. On le neutralise ici,
// et seulement ici — l'alias ne sort pas de la configuration de test.
export {}
