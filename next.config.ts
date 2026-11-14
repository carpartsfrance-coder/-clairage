import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
    Pré-rendu partiel (« Cache Components ») : essayé le 14 novembre 2026,
    retiré le même jour. À ne pas rallumer sans avoir lu ce qui suit.

    **Ce qu'on cherchait.** Aucune page du site n'est mise en cache : la mise
    en page racine et l'en-tête lisent les cookies véhicule et panier, et un
    seul de ces appels rend toute la page dynamique. Chacune des 31 000 fiches
    est donc rendue de zéro à chaque passage de Googlebot. C'est ce qui a fait
    monter la mémoire jusqu'au plafond de l'instance le 14 novembre à 02h30 :
    deux minutes de 502, 68 produits refusés par Merchant Center. Le plafond,
    lui, a été relevé à 2 Go (voir render.yaml) : c'est la protection qui tient
    aujourd'hui.

    **Pourquoi c'est retiré.** Le pré-rendu partiel envoie d'abord une coquille
    pré-calculée, puis complète. Or « démarrer le flux envoie les en-têtes et
    fige le code HTTP » (documentation de Next, convention `loading`) : la
    réponse part en 200 avant que la page ait interrogé la base. Les pages
    publiques décident après cette interrogation, et trois réponses y ont
    perdu leur statut — mesuré sur le commit d'avant, puis sur celui d'après :

      /p/<adresse renommée>   308 vers la nouvelle adresse  ->  200
      /p/<fiche inconnue>     404                           ->  200
      /compte, /admin         307 vers la connexion         ->  200

    Les redirections avaient toujours lieu, mais exécutées par le navigateur.
    Google ne les traite pas comme des redirections permanentes. Le 8 novembre
    2026, 690 adresses de fiches et 55 pages de génération ont été renommées
    (migration 20261108200000) : leur 308 doit tenir, c'est tout ce qui relie
    l'ancienne adresse indexée à la nouvelle.

    Ce n'est pas réparable en déplaçant une frontière `<Suspense>` : essayé,
    sans effet. Ni par une règle de réécriture dans le proxy, car 97 fiches
    publiées portent encore le suffixe « -photo-manquante » et seraient
    cassées par une règle qui le retire aveuglément.

    **Par quel bout reprendre.** Mettre la *coquille* en cache est
    incompatible avec les vrais codes HTTP. Mettre les *requêtes* en cache ne
    l'est pas : un `use cache` sur `getProduct`, `getNavigation` et les autres
    supprime le travail de base de données qui fait monter la mémoire, tout en
    laissant la page se rendre à la requête — donc les 308 et les 404 tiennent.
    C'est cette voie qu'il faut prendre. Si la coquille devait malgré tout
    être pré-rendue un jour, il faudrait d'abord servir les 745 adresses
    renommées avant tout rendu (table `redirects()` ou contrôle dans le
    proxy, comme la documentation de Next le recommande pour les 404).

    Rallumer `cacheComponents` oblige aussi à reposer `export const instant =
    false` sur les pages non encore reprises : sans le drapeau, cet export
    fait échouer la construction, et sans l'export les pages qui lisent les
    cookies la font échouer aussi.
  */
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
