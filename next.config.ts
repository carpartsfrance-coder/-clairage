import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Les imports de catalogue passent par une action de serveur, dont le
      // corps est plafonné à 1 Mo par défaut. L'action refuse elle-même
      // au-delà de 5 Mo, avec un message ; la marge au-dessus sert à ce que ce
      // refus soit atteint plutôt que la requête coupée sans explication.
      bodySizeLimit: '6mb',
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
