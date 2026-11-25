import { readFileSync } from 'node:fs'
import { openDb } from './db.mjs'
import { makeServer } from './server.mjs'

const env = process.env
const port = Number(env.HAVEN_PORT || 8787)
const host = env.HAVEN_BIND || '127.0.0.1'
const lan = env.HAVEN_DEV_LAN === '1'
const media = new URL(env.LIVEKIT_URL || 'ws://192.168.0.4:7880')
const local = /^(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/
if (!(media.protocol === 'wss:' || (lan && media.protocol === 'ws:' && local.test(media.hostname))) || media.username || media.password || media.search || media.hash) {
  throw new Error('LIVEKIT_URL exige WSS ou WebSocket em LAN privada com HAVEN_DEV_LAN=1.')
}
if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) throw new Error('Configure as credenciais LiveKit em .env.')
const api = new URL(env.LIVEKIT_API_URL || media.href.replace(/^ws/,'http'))
const loopback = ['127.0.0.1','localhost'].includes(api.hostname)
if (!(api.protocol === 'https:' || (api.protocol === 'http:' && (loopback || (lan && local.test(api.hostname))))) || api.username || api.password || api.search || api.hash) {
  throw new Error('LIVEKIT_API_URL exige HTTPS ou HTTP privado com HAVEN_DEV_LAN=1.')
}
if (!lan && (env.LIVEKIT_API_KEY === 'devkey' || env.LIVEKIT_API_SECRET.length < 32)) throw new Error('Configure credenciais LiveKit de produção.')
const tls = env.HAVEN_TLS_KEY && env.HAVEN_TLS_CERT ? {
  key: readFileSync(env.HAVEN_TLS_KEY), cert: readFileSync(env.HAVEN_TLS_CERT),
} : undefined
if (host !== '127.0.0.1' && !tls && !(lan && local.test(host))) throw new Error('Bind externo exige TLS ou IP privado explícito em modo LAN.')
const db = openDb(env.HAVEN_DB || 'data/haven.sqlite')
const trustProxy = host === '127.0.0.1' && env.HAVEN_TRUST_LOCAL_PROXY === '1' ? 'loopback' : false
const app = makeServer(db, { media: media.href, api:api.href, key: env.LIVEKIT_API_KEY, secret: env.LIVEKIT_API_SECRET, tls, trustProxy })
await app.listen({ port, host })
console.log('HAVEN disponível em ' + app.addresses().map(address => address.port).join(', '))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await app.close()
  db.close()
})
