import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [accounts,media]=process.argv.slice(2).map(value=>value.toLowerCase())
const hostname=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/
if (!hostname.test(accounts||'') || !hostname.test(media||'') || accounts===media) {
  throw new Error('Informe dois nomes DNS distintos. Exemplo: node scripts/samsung-public.mjs contas.exemplo.com voz.exemplo.com')
}
if (!existsSync('.env')) throw new Error('Execute na pasta da instalação existente que contém .env.')
const config=fileURLToPath(new URL('../deploy/livekit-samsung.yaml', import.meta.url)).replaceAll('\\','/')
if (!existsSync(config)) throw new Error('Configuração do LiveKit para o tablet não encontrada.')
const id=randomBytes(12).toString('hex')
const secret=randomBytes(32).toString('hex')
const content=[
  'HAVEN_HOST='+accounts,
  'LIVEKIT_HOST='+media,
  'HAVEN_BIND=127.0.0.1',
  'HAVEN_PORT=8787',
  'HAVEN_DEV_LAN=0',
  'HAVEN_TRUST_LOCAL_PROXY=1',
  'HAVEN_TLS_KEY=',
  'HAVEN_TLS_CERT=',
  'LIVEKIT_URL=wss://'+media,
  'LIVEKIT_API_URL=http://127.0.0.1:7880',
  'LIVEKIT_API_KEY=haven_'+id,
  'LIVEKIT_API_SECRET='+secret,
  'HAVEN_LIVEKIT_BIND=127.0.0.1',
  'HAVEN_LIVEKIT_NODE_IP=',
  'HAVEN_LIVEKIT_CONFIG='+JSON.stringify(config),
].join('\n')+'\n'
try { writeFileSync('.env.public',content,{flag:'wx',mode:0o600}) }
catch(error) {
  if(error.code==='EEXIST')throw new Error('.env.public já existe. Mantenha as credenciais geradas e confira os domínios no arquivo.')
  throw error
}
console.log('Configuração preparada em .env.public.')
