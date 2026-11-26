import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {sign} from 'node:crypto'
import {makeServer} from '../../backend/server.mjs'
import {app,assert,children,clients,connection,db,go,join,origin,register,scratch} from './harness.mjs'

let replacement
try {
  const c=await connection(1)
  await register(c,1)
  await c.click('Perfil e ajustes',true)
  assert.equal((await c.body()).includes('Administração'),false)
  db.prepare('INSERT INTO server_admins SELECT id FROM users WHERE handle=?').run('validacao_1')
  await c.evalJs("window.dispatchEvent(new Event('online'))")
  await c.click('Administração')
  await c.visible('Convites de cadastro')
  await c.fill('[name=count]','2')
  await c.click('Gerar convites')
  await go(()=>c.evalJs("Boolean(document.querySelector('[aria-label=\"Convite 2\"]')?.value)"),'lote de convites')
  await c.click('Criar backup')
  await c.visible('Backup criado no servidor.')
  await app.close()
  await c.evalJs("window.dispatchEvent(new Event('online'))")
  await c.visible('O servidor do HAVEN não respondeu.')
  replacement=makeServer(db,{media:'ws://127.0.0.1:17980',key:'devkey',secret:'secret',releases:join(scratch,'updates')})
  await replacement.listen({host:'127.0.0.1',port:Number(new URL(origin).port)})
  await go(async()=>!(await c.body()).includes('O servidor do HAVEN não respondeu.'), 'reconexão automática',19000)
  await c.click('Perfil e ajustes',true)
  assert.ok(process.env.HAVEN_SIGNING_KEY,'Configure HAVEN_SIGNING_KEY para a validação do updater empacotado.')
  const key=readFileSync(process.env.HAVEN_SIGNING_KEY)
  const folder=join(scratch,'updates')
  mkdirSync(folder,{recursive:true})
  const parts=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version.split('.')
  const nextVersion=[...parts.slice(0,2),Number(parts[2])+1].join('.')
  const filename='HAVEN-'+nextVersion+'-Setup-x64.exe'
  const payload=Buffer.from(JSON.stringify({version:nextVersion,file:filename,size:4,sha256:'0'.repeat(64)}))
  writeFileSync(join(folder,'manifest.json'),JSON.stringify({payload:payload.toString('base64url'),signature:sign(null,payload,key).toString('base64url')}))
  writeFileSync(join(folder,filename),'test')
  await c.click('Verificar atualizações')
  await c.click('Instalar HAVEN '+nextVersion)
  await c.visible('A atualização não passou na verificação de segurança.')
  console.log('PASS: painel restrito, convites em lote e backup pela UI, reconexão automática e bloqueio de instalador alterado.')
} finally {
  for(const c of clients)c.ws.close()
  for(const child of children)child.kill()
  await replacement?.close()
  await app.close()
  db.close()
}
