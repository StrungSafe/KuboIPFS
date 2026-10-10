import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.KUBO_API_URL

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 4173,
      // When KUBO_API_URL is set, /api/v0 is forwarded to the Kubo node so the
      // browser never makes a cross-origin request (no CORS config needed on Kubo).
      proxy: target
        ? {
            '/api/v0': {
              target,
              changeOrigin: true,
              ws: false,
              configure: (proxy) => {
                // Kubo rejects RPC calls whose Origin/Referer is not allow-listed,
                // and browser user agents that arrive without an Origin. Present the
                // proxied call as a plain non-browser client.
                proxy.on('proxyReq', (proxyReq) => {
                  proxyReq.removeHeader('origin')
                  proxyReq.removeHeader('referer')
                  proxyReq.setHeader('user-agent', 'kubo-rpc-explorer-dev-proxy')
                })
              },
            },
          }
        : undefined,
    },
    build: {
      // kubo-rpc-client pulls in multiformats, libp2p crypto and IPLD codecs.
      chunkSizeWarningLimit: 800,
    },
    define: {
      __KUBO_PROXY_TARGET__: JSON.stringify(target ?? ''),
    },
  }
})
