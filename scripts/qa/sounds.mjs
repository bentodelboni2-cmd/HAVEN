import {app,assert,children,clients,connection,db,go,register,wait} from './harness.mjs'

try {
  const a=await connection(1),b=await connection(2)
  await register(a,1)
  await register(b,2)
  for(const c of [a,b])await c.evalJs(`(()=>{
    window.soundQA=[]
    for(const method of ['start','stop']){
      const original=AudioBufferSourceNode.prototype[method]
      AudioBufferSourceNode.prototype[method]=function(...args){
        window.soundQA.push({method,duration:this.buffer?.duration,state:this.context.state})
        return original.apply(this,args)
      }
    }
  })()`)
  const tones=(c,duration,method='start')=>c.evalJs(`window.soundQA.filter(r=>r.method===${JSON.stringify(method)}&&Math.abs(r.duration-${duration})<.018&&r.state==='running').length`)
  await b.click('Perfil e ajustes',true)
  await b.evalJs("document.querySelector('.sound-settings summary').click()")
  assert.equal(await b.evalJs("document.querySelectorAll('.sound-setting input[type=checkbox]').length"),17)
  await b.click('Testar chamada recebida',true)
  await go(async()=>await tones(b,1.15)===1,'prévia da chamada recebida')
  const [one,two]=['validacao_1','validacao_2'].map(handle=>db.prepare('SELECT id FROM users WHERE handle=?').get(handle).id).sort()
  db.prepare('INSERT INTO friends VALUES(?,?,?,1)').run(one,two,one)
  await a.evalJs("window.dispatchEvent(new Event('online'))")
  await a.click('Amigos')
  await a.click('Ligar')
  await b.visible('está ligando')
  await go(async()=>await tones(a,.93)>=1,'tom de chamada efetuada')
  await go(async()=>await tones(b,1.15)>=2,'toque de chamada recebida')
  await b.click('Recusar')
  await go(async()=>await tones(b,1.15,'stop')>=1,'toque interrompido ao recusar')
  await go(async()=>!(await b.body()).includes('está ligando'),'convite recusado')
  const stopped=await tones(b,1.15)
  await wait(3800)
  assert.equal(await tones(b,1.15),stopped)
  await b.evalJs("document.querySelector('.sound-setting input[type=checkbox]').click()")
  await a.click('Sair')
  await a.click('Amigos')
  await a.click('Ligar')
  await b.visible('está ligando')
  await wait(3700)
  assert.equal(await tones(b,1.15),stopped)
  await a.click('Cancelar chamada')
  await go(async()=>!(await b.body()).includes('está ligando'),'cancelamento remoto')
  await b.evalJs("document.querySelector('.sound-setting input[type=checkbox]').click()")
  await a.click('Amigos')
  await a.click('Ligar')
  await b.visible('está ligando')
  const current=db.prepare("SELECT id FROM calls WHERE id IN (SELECT call FROM call_members WHERE state='invited') ORDER BY created DESC LIMIT 1").get()
  db.prepare('UPDATE calls SET created=? WHERE id=?').run(Date.now()-59000,current.id)
  await b.evalJs("window.dispatchEvent(new Event('online'))")
  await go(async()=>!(await b.body()).includes('está ligando'),'convite expira sem intervenção')
  console.log('PASS: 17 categorias, prévia, toque recebido e efetuado, recusa, cancelamento, expiração e preferência individual.')
} finally {
  for(const client of clients)client.ws.close()
  for(const child of children)child.kill()
  await app.close()
  db.close()
}
