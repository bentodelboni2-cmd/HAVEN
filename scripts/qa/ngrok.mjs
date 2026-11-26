import {app,assert,children,clients,connection,db,randomUUID} from './harness.mjs'

const endpoint=new URL(process.argv.find(value=>value.startsWith('https://'))).origin
try {
  const client=await connection(1)
  await client.visible('Entrar no HAVEN')
  const request=(path,options={})=>client.evalJs(`fetch(${JSON.stringify(endpoint+path)},${JSON.stringify(options)}).then(async response=>({status:response.status,body:await response.json()}))`)
  assert.deepEqual(await request('/health'),{status:200,body:{ok:true}})
  const auth=await request('/state',{headers:{Authorization:'Bearer '+ 'A'.repeat(43)}})
  assert.equal(auth.status,401)
  const user='qa_'+randomUUID().slice(0,8)
  const login=await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:user,password:randomUUID()})})
  assert.equal(login.status,401)
  assert.ok(typeof login.body.error==='string')
  console.log('PASS: HTTPS, GET protegido e POST de login com CORS no Electron empacotado.')
} finally {
  for(const client of clients)client.ws.close()
  for(const child of children)child.kill()
  await app.close()
  db.close()
}
