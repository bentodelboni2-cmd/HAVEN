import { app, assert, children, clients, connection, db, go, register } from './harness.mjs'

try {
  const a=await connection(1),b=await connection(2),c=await connection(3)
  await register(a,1)
  await register(b,2)
  await register(c,3)
  const dbUser=n=>db.prepare('SELECT id FROM users WHERE handle=?').get('validacao_'+n).id
  for(const [first,second] of [[1,2],[1,3],[2,3]]) {
    const [one,two]=[dbUser(first),dbUser(second)].sort()
    db.prepare('INSERT INTO friends VALUES(?,?,?,1)').run(one,two,one)
  }
  await a.click('Amigos')
  await a.visible('Validação 2')
  const findFriend=async (client,name,button)=>go(()=>client.evalJs(`(()=>{const row=[...document.querySelectorAll('li')].find(el=>el.querySelector('strong')?.textContent===${JSON.stringify(name)}); const control=[...(row?.querySelectorAll('button')??[])].find(el=>el.textContent.trim()===${JSON.stringify(button)}); if(!control)return false;control.click();return true})()`),'controle de '+name)
  await findFriend(a,'Validação 2','Ligar')
  await a.visible('Cancelar chamada')
  await b.click('Notificações',true)
  await b.visible('Convite de chamada')
  await a.click('Cancelar chamada')
  await b.visible('Nenhum convite de chamada.')
  await b.click('Fechar',true)
  await a.click('Chamadas')
  await a.click('Chamada em grupo')
  await a.evalJs("[...document.querySelectorAll('dialog input[type=checkbox]')].forEach(box=>box.click())")
  await a.click('Iniciar chamada')
  await a.visible('Conectado')
  for(const guest of [b,c]){
    await guest.click('Notificações',true)
    await guest.click('Aceitar')
    await guest.visible('Conectado')
  }
  await a.visible('Validação 3')
  await a.click('Ativar microfone',true)
  for(const guest of [b,c]) await go(()=>guest.evalJs("!!document.querySelector('audio')"),'trilha do anfitrião')
  await b.click('Silenciar Validação 1',true)
  assert.ok(await b.evalJs("document.querySelector('audio').muted"))
  assert.ok(!await c.evalJs("document.querySelector('audio').muted"))
  await c.evalJs(`(()=>{const el=document.querySelector('[aria-label="Volume de Validação 1"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'32');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await go(()=>c.evalJs("Math.abs(document.querySelector('audio').volume-.32)<.01"),'volume individual')
  for(const guest of [c,b,a]) await guest.click('Sair')
  await a.click('Amigos')
  await findFriend(a,'Validação 2','Remover')
  await a.evalJs("document.querySelector('dialog button[type=submit], dialog form button.accent').click()")
  await go(()=>a.evalJs("![...document.querySelectorAll('li strong')].some(el=>el.textContent==='Validação 2')"),'amizade removida')
  console.log('PASS: cancelamento sincronizado no painel aberto, chamada em grupo com três clientes, mute e volume locais, e remoção de amizade.')
} catch(error) {
  console.error(error.message)
  for (const client of clients) console.error((await client.body().catch(()=>''))?.slice(-600))
  process.exitCode=1
} finally {
  for(const client of clients) client.ws.close()
  for(const child of children) child.kill()
  await app.close()
  db.close()
}
