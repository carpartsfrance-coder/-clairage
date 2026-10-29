import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
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
    ]
  },
}

export default nextConfig
