import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { makeServer } from '../../backend/server.mjs'
import { issueInvite, openDb } from '../../backend/db.mjs'

const repo = resolve(import.meta.dirname,'../..')
const scratch = mkdtempSync(join(tmpdir(),'haven-qa-'))
const electron = createRequire(import.meta.url)('electron')
const binary = process.argv.includes('--package') ? join(repo,'release/0.3.0/win-unpacked/HAVEN.exe') : electron
const db = openDb(join(scratch,'smoke.sqlite'))
const app = makeServer(db,{media:'ws://127.0.0.1:17980',key:'devkey',secret:'secret'})
const origin = await app.listen({host:'127.0.0.1',port:0})
const children = []
const clients = []
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms))
const logs = []
const hold = process.argv.includes('--hold')
const go = async (find, label, timeout=14000) => {
  const end = Date.now()+timeout
  let e
  do {
    try { const result=await find();if(result)return result }
    catch(error){e=error}
    await wait(220)
  } while(Date.now()<end)
  throw Error(label+(e?' / '+e.message:''))
}
async function connection(n) {
  const port=19241+n
  const profile=join(scratch,'account'+n)
  const args=[...(binary===electron?[repo]:[]),'--remote-debugging-port='+port,'--remote-debugging-address=127.0.0.1','--haven-preview='+profile,'--user-data-dir='+profile]
  const child=spawn(binary,args,{cwd:repo,windowsHide:true,stdio:['ignore','ignore','pipe']})
  children.push(child)
  child.stderr.on('data',chunk=>logs.push(String(chunk).replace(/access_token=[^&\s]+/g,'access_token=REDACTED')))
  child.on('exit',code=>logs.push('Electron saiu '+code))
  const page = await go(async () => {
    const pages=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(800)}).then(r=>r.json())
    return pages.find(p=>p.type==='page'&&p.url.startsWith('haven://'))
  },'Electron abriu a página')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done,reject)=>{ws.addEventListener('open',done,{once:true});ws.addEventListener('error',reject,{once:true})})
  let id=0
  const requests=new Map()
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data)
    if(m.id&&requests.has(m.id)){
      const [done,fail]=requests.get(m.id)
      requests.delete(m.id)
      if(m.error)fail(Error(m.error.message));else done(m.result)
    }
    if(m.method==='Runtime.exceptionThrown')logs.push('Renderer: '+m.params.exceptionDetails.exception?.description)
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')logs.push('Erro de renderer')
  })
  const send=(method,params={})=>new Promise((done,fail)=>{
    requests.set(++id,[done,fail]);ws.send(JSON.stringify({id,method,params}))
  })
  const evalJs=async expression=>{
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true})
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text)
    return r.result.value
  }
  const body=()=>evalJs('document.body.innerText')
  const visible=text=>go(async()=> (await body())?.includes(text),text)
  const click=async (text,aria=false)=>
    go(()=>evalJs(`(() => { const button=[...document.querySelectorAll('button')].find(b => ${aria?'b.getAttribute("aria-label")':'b.textContent.trim()'}===${JSON.stringify(text)} && !b.disabled && b.getClientRects().length); if(!button)return false;button.click();return true })()`),'clicar '+text)
  const fill=async (selector,value)=>go(()=>evalJs(`(() => { const field=document.querySelector(${JSON.stringify(selector)}); if(!field)return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));return true })()`),'preencher '+selector)
  const shot=async name=>{
    const r=await send('Page.captureScreenshot',{format:'png'})
    writeFileSync(join(scratch,name+'.png'),Buffer.from(r.data,'base64'))
  }
  await send('Runtime.enable')
  await send('Log.enable')
  const client={send,evalJs,body,visible,click,fill,shot,ws}
  clients.push(client)
  return client
}
const stage = label => console.log(label)
async function register(client,n) {
  await client.visible('Entrar no HAVEN')
  await client.click('Tenho um convite')
  await client.fill('[name=invite]',issueInvite(db))
  await client.click('Continuar')
  await client.click('Servidor de contas')
  await client.fill('input[type=url]',origin)
  await client.fill('[name=name]','Validação '+n)
  await client.fill('[name=handle]','validacao_'+n)
  await client.fill('[name=password]',randomUUID())
  await client.click('Criar conta')
  await client.visible('Olá, Validação '+n)
}


export { app, assert, children, clients, connection, db, electron, go, issueInvite, join, logs, origin, randomUUID, register, scratch, spawn, stage, wait, hold }
