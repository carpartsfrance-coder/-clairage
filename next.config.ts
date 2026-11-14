import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
    Pré-rendu partiel (« Cache Components »).

    **Pourquoi.** Jusqu'ici, aucune page du site n'était mise en cache : la
    mise en page racine lit un en-tête (`headers()`) et le header lit les
    cookies véhicule et panier. Dans l'ancien modèle, un seul de ces appels
    rend TOUTE la page dynamique. Résultat : chacune des 31 000 fiches était
    rendue de zéro à chaque passage de Googlebot — une vingtaine de requêtes
    SQL par visite, des centaines de visites par heure. La mémoire montait
    jusqu'au plafond de l'instance, qui se faisait tuer (14 novembre 2026,
    02h30 : deux minutes de 502, 68 produits refusés par Merchant Center).

    **Ce que ça change.** Une page est désormais découpée : ce qui ne dépend
    pas du visiteur est pré-rendu une fois et resservi tel quel, ce qui en
    dépend (panier, véhicule retenu) est entouré d'un `<Suspense>` et se
    calcule à chaque requête. Googlebot est classé robot « DOM » par Next
    (`shared/lib/router/utils/is-bot.js`), il reçoit donc la version
    pré-rendue comme un visiteur ordinaire.

    **État de la migration.** Ce réglage est global : il s'applique aux 65
    pages d'un coup. Pour ne pas tout changer en même temps, chaque page porte
    pour l'instant `export const instant = false`, qui la dispense de la
    vérification. Les pages sont reprises une par une ; retirer cette ligne
    d'une page, c'est la faire entrer dans le nouveau modèle. Tant qu'elle y
    est, la page se comporte exactement comme avant.

    `partialPrefetching` doit être posé explicitement, sinon Next avertit à
    chaque démarrage.
  */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    /*
      Construction sur Render : sans limite, Next lance un processus de
      pré-rendu par cœur de la machine de build — 47 le 7 novembre 2026. Chacun
      ouvre son pool de connexions à la base, la petite base PostgreSQL sature
      et coupe les connexions (« Server has closed the connection », P1017) :
      le plan du site, qui doit lire la base, échouait et le build avec lui.
      Deux processus, deux pages à la fois chacun, et deux nouvelles
      tentatives par page avant d'abandonner (le plan du site, lui, n'est plus
      pré-rendu : voir src/app/sitemap.ts).
    */
    cpus: 2,
    staticGenerationMaxConcurrency: 2,
    staticGenerationRetryCount: 2,
    serverActions: {
      // Deux actions reçoivent des fichiers : l'import de catalogue (5 Mo au
      // maximum) et le téléversement d'un média (8 Mo). Le plafond par défaut
      // d'une action de serveur est de 1 Mo, et il coupe la requête sans
      // explication. On passe donc au-dessus des deux limites applicatives,
      // pour que ce soit le refus explicite — avec son message — qui soit
      // atteint, et jamais la coupure silencieuse.
      bodySizeLimit: '10mb',
    },
  },
  images: {
    /*
      Les qualités autorisées. Next 16 exige cette liste : l'optimiseur est une
      API publique, et sans allocation explicite n'importe qui pourrait lui
      faire produire cent variantes d'un même fichier. Une valeur absente de la
      liste vaut 400.

      75 est la valeur par défaut, celle de tout le catalogue — des photos de
      produits où l'œil ne verra pas la différence. 90 est réservée aux visuels
      de marque qui portent du texte gravé : le bandeau d'accueil compare deux
      phares, légendes incrustées dans l'image, et un fichier déjà compressé
      qui repasse à 75 perd la moitié de ses octets (134 ko → 63 ko) — assez
      pour que les petits caractères bavent et que les dégradés sombres se
      cassent en bandes.
    */
    qualities: [75, 90],
    /*
      Images plus rapides (remarque de l'exploitant, 10 novembre 2026).

      - Trente jours de cache navigateur au lieu de quatre heures : une photo
        déjà vue ne se redemande plus à chaque visite. Les adresses des médias
        portent une empreinte du contenu, une photo changée change d'adresse.
      - Moins de largeurs générées (5 + 4 au lieu de 8 + 8) : la même version
        sert à plus d'écrans, le cache de l'optimiseur — vidé à chaque mise en
        ligne — se remplit plus vite, et il y a moins de conversions à froid.
    */
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [640, 828, 1080, 1440, 1920],
    imageSizes: [64, 128, 256, 384],
    // Les medias durables sont servis depuis un stockage objet S3-compatible.
    // Le domaine est fourni par MEDIA_PUBLIC_HOST (voir .env.example).
    remotePatterns: process.env.MEDIA_PUBLIC_HOST
      ? [{ protocol: 'https', hostname: process.env.MEDIA_PUBLIC_HOST }]
      : [],
    /*
      Les logos de marque sont des SVG : 44 des 45 fichiers importés par
      `npm run import:brand-logos` en sont. Sans ce drapeau, l'optimiseur
      d'images refuse le type `image/svg+xml` et la pastille de marque reste
      vide dans le menu.

      Un SVG est du XML, et peut donc porter du script. Trois choses le
      neutralisent ici, et aucune ne doit sauter sans y repenser :

      1. La CSP ci-dessous est celle que Next documente pour ce drapeau. Elle
         interdit tout script et met la ressource en bac à sable.
      2. Les médias ne sont pas servis par le site mais par le domaine du
         stockage objet (`MEDIA_PUBLIC_HOST`) : un script qui s'y exécuterait
         ne serait pas dans l'origine de la boutique.
      3. Le dépôt vérifie le contenu, pas l'extension (`inspectUpload`), et
         seul le back-office ou un script de l'exploitant dépose un fichier.
    */
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; frame-src 'none'; sandbox;",
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      /*
        Photos produit lisibles depuis chatgpt.com : l'outil de l'exploitant
        part de la photo LEDVROOM existante pour créer la même photo dans une
        autre finition (claire / fumée…). Lecture seule, images publiques.
      */
      /*
        Les images du dossier public : sept jours de cache (au lieu de « à
        revalider à chaque fois »), une journée de plus servie pendant la
        revalidation.
      */
      ...['/produits-ampoules/:path*', '/images-types/:path*', '/photos-options/:path*', '/marque/:path*', '/visuels/:path*'].map(
        (source) => ({
          source,
          headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
        }),
      ),
      ...['/produits-ampoules/:path*', '/images-types/:path*'].map((source) => ({
        source,
        headers: [{ key: 'Access-Control-Allow-Origin', value: 'https://chatgpt.com' }],
      })),
    ]
  },
}

export default nextConfig
