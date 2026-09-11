import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {},
  // Librerías de correo (leer el buzón y enviar): se usan tal cual en el
  // servidor, sin empaquetarlas
  serverExternalPackages: ['imapflow', 'mailparser', 'nodemailer'],
  async redirects() {
    return [
      {
        source: '/dashboard/blacklist',
        destination: '/dashboard/contactos',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ]
  }
}

export default nextConfig
