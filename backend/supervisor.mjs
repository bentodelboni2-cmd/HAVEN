import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { appendFileSync, mkdirSync, rmSync, renameSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { readdir, unlink } from 'node:fs/promises'
import { makeBackup } from './control.mjs'
import { openDb } from './db.mjs'

const env=process.env
const dbFile=resolve(env.HAVEN_DB||'data/haven.sqlite')
const backupDir=join(dirname(dbFile),'backups')
const operations=join(dirname(dbFile),'ops')
const livekitDir=resolve(env.HAVEN_LIVEKIT_DIR||join(homedir(),'livekit'))
const media=new URL(env.LIVEKIT_API_URL||env.LIVEKIT_URL.replace(/^ws/,'http'))
const bind=env.HAVEN_LIVEKIT_BIND||media.hostname
const lan=env.HAVEN_DEV_LAN==='1'
const nodeIp=env.HAVEN_LIVEKIT_NODE_IP||(lan?bind:'')
const livekitKeys=!lan&&env.LIVEKIT_API_KEY&&env.LIVEKIT_API_SECRET
  ? {LIVEKIT_KEYS:env.LIVEKIT_API_KEY+': '+env.LIVEKIT_API_SECRET} : {}
const maxLog=2*1024*1024
const day=86400000
mkdirSync(operations,{recursive:true,mode:0o700})
const lock=join(operations,'supervisor.pid')
function lockSupervisor() {
  try { writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600}) }
  catch(error) {
    if(error.code!=='EEXIST')throw error
    const previous=Number(readFileSync(lock,'utf8'))
    if(!Number.isInteger(previous)||previous<1)throw new Error('Arquivo de PID inválido. Verifique se o supervisor está rodando.')
    try { process.kill(previous,0) }
    catch(probe) {
      if(probe.code!=='ESRCH')throw probe
      rmSync(lock,{force:true})
      writeFileSync(lock,String(process.pid),{flag:'wx',mode:0o600})
      return
    }
    throw new Error('Já existe um supervisor do HAVEN em execução.')
  }
}
lockSupervisor()
const statusFile=join(operations,'status.json')
const services=[
  {name:'contas',binary:process.execPath,args:['backend/serve.mjs'],cwd:process.cwd(),
    check:'http://'+(env.HAVEN_BIND||'127.0.0.1')+':'+(env.HAVEN_PORT||8787)+'/health'},
  {name:'livekit',binary:env.HAVEN_LIVEKIT_BINARY||join(livekitDir,'livekit-haven'),cwd:livekitDir,check:media.href,
    env:livekitKeys,args:[...(lan?['--dev']:[]),'--config',env.HAVEN_LIVEKIT_CONFIG||'haven.yaml','--bind',bind,
      ...(nodeIp?['--node-ip',nodeIp]:[])]},
]
let stopping=false
let runningProbe=false
const state=new Map(services.map(service=>[service.name,{failures:0,restarts:0,errors:0,ok:false}]))
function report() {
  const status=Object.fromEntries([...state].map(([name,value])=>[name,{
    online:value.ok,restarts:value.restarts,lastFailure:value.lastFailure??null,pid:value.child?.pid??null,
  }]))
  writeFileSync(statusFile+'.tmp',JSON.stringify({at:Date.now(),services:status}),{mode:0o600})
  renameSync(statusFile+'.tmp',statusFile)
}
async function check(address) {
  const response=await fetch(address,{signal:AbortSignal.timeout(2500)}).catch(()=>null)
  if(response?.body)await response.body.cancel().catch(()=>{})
  return Boolean(response?.ok)
}
function log(name,message) {
  try{
    const path=join(operations,name+'.log')
    const chunk=Buffer.isBuffer(message)?message:Buffer.from(message+'\n')
    const current=statSync(path,{throwIfNoEntry:false})?.size||0
    if(current+chunk.length>maxLog && current)renameSync(path,path+'.1')
    appendFileSync(path,chunk.subarray(Math.max(0,chunk.length-maxLog)),{mode:0o600})
  }catch{ /* Logging failure cannot restart a healthy child. */ }
}
function terminate(record) {
  const child=record.child
  if(!child)return
  child.kill('SIGTERM')
  const kill=()=>{if(record.child===child)child.kill('SIGKILL')}
  clearTimeout(record.kill)
  record.kill=setTimeout(kill,5000)
}
function launch(service) {
  if(stopping)return
  const record=state.get(service.name)
  record.started=Date.now()
  record.errors=0
  const child=spawn(service.binary,service.args,{
    cwd:service.cwd,stdio:['ignore','pipe','pipe'],
    env:{...env,...service.env,GODEBUG:env.GODEBUG||'asyncpreemptoff=1',GOMAXPROCS:env.GOMAXPROCS||'2'},
  })
  record.child=child
  for(const output of [child.stdout,child.stderr])output?.on('data',data=>log(service.name,data))
  child.once('error',()=>log(service.name,'Não foi possível iniciar o processo.'))
  child.once('close',()=>{
    clearTimeout(record.kill)
    record.child=undefined
    record.ok=false
    if(stopping)return
    if(Date.now()-record.started>120000)record.failures=0
    record.restarts++
    record.lastFailure=Date.now()
    const delay=Math.min(60000,2000*2**Math.min(record.failures++,5))
    log(service.name,'Reinício em '+delay/1000+' s.')
    report()
    record.retry=setTimeout(()=>launch(service),delay)
  })
}
async function probe() {
  if(stopping||runningProbe)return
  runningProbe=true
  try {
    await Promise.all(services.map(async service=>{
      const record=state.get(service.name)
      const child=record.child
      if(!child)return
      const healthy=await check(service.check)
      if(record.child!==child||stopping)return
      record.ok=healthy
      if(record.ok)record.errors=0
      else if(Date.now()-record.started>15000 && ++record.errors===3) {
        log(service.name,'Sem resposta HTTP em três verificações.')
        terminate(record)
      }
    }))
    if(!stopping)report()
  }finally{runningProbe=false}
}
let runningBackup
async function dailyBackup() {
  if(stopping||runningBackup||!statSync(dbFile,{throwIfNoEntry:false})?.isFile())return
  runningBackup=(async()=>{
    const folder=join(backupDir,'automaticos')
    const files=(await readdir(folder).catch(error=>{if(error.code!=='ENOENT')throw error;return []}))
      .filter(name=>/^haven-\d{8}T\d{6}Z-[a-f0-9]{8}\.sqlite$/.test(name)).sort().reverse()
    if(files[0]&&Date.now()-(statSync(join(folder,files[0])).mtimeMs||0)<day)return
    const db=openDb(dbFile)
    try{await makeBackup(db,folder)}finally{db.close()}
    for(const name of files.slice(6))await unlink(join(folder,name))
    log('supervisor','Backup automático concluído.')
  })().catch(()=>log('supervisor','Falha ao criar backup automático.'))
  try {await runningBackup} finally{runningBackup=undefined}
}

if((await Promise.all(services.map(service=>check(service.check)))).some(Boolean)) {
  rmSync(lock,{force:true})
  throw new Error('Pare as instâncias executadas em outros terminais antes de iniciar o supervisor.')
}
report()
for(const service of services)launch(service)
const probing=setInterval(()=>void probe().catch(()=>log('supervisor','Falha na verificação dos serviços.')),10000)
const backups=setInterval(()=>void dailyBackup(),60000)
const firstBackup=setTimeout(()=>void dailyBackup(),12000)
console.log('HAVEN supervisionado. Logs em '+operations)
async function stop() {
  if(stopping)return
  stopping=true
  clearInterval(probing)
  clearInterval(backups)
  clearTimeout(firstBackup)
  const close=[]
  for(const record of state.values()){
    clearTimeout(record.retry)
    if(record.child) {
      close.push(new Promise(resolve=>record.child.once('close',resolve)))
      terminate(record)
    }
  }
  await Promise.all([...close,runningBackup])
  report()
  rmSync(lock,{force:true})
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void stop())
