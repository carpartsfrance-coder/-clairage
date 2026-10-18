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
    // Les medias durables sont servis depuis un stockage objet S3-compatible.
    // Le domaine est fourni par MEDIA_PUBLIC_HOST (voir .env.example).
    remotePatterns: process.env.MEDIA_PUBLIC_HOST
      ? [{ protocol: 'https', hostname: process.env.MEDIA_PUBLIC_HOST }]
      : [],
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
