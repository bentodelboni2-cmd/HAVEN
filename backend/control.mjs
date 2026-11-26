import { backup } from 'node:sqlite'
import { mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os'
import { randomUUID } from 'node:crypto'
import { TrackSource } from 'livekit-server-sdk'
import { clock, digest, issueInvite, runTx } from './db.mjs'

export const backupName = /^haven-\d{8}T\d{6}Z-[a-f0-9]{8}\.sqlite$/

export async function makeBackup(db, directory) {
  await mkdir(directory,{recursive:true,mode:0o700})
  const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')
  const name = 'haven-'+stamp+'-'+randomUUID().slice(0,8)+'.sqlite'
  const path = join(directory,name)
  const temp=path+'.tmp'
  try {
    await backup(db,temp)
    await rename(temp,path)
  } finally { await rm(temp,{force:true}) }
  return name
}

async function traffic() {
  try {
    const lines = (await readFile('/proc/net/dev','utf8')).split('\n').slice(2)
    const counters={received:0,sent:0}
    for (const line of lines) {
      const [name, values]=line.split(':')
      if (!values || name.trim()==='lo') continue
      const fields=values.trim().split(/\s+/).map(Number)
      counters.received+=fields[0]||0
      counters.sent+=fields[8]||0
    }
    return counters
  } catch { return null }
}

export function registerControl({db,GET,POST,roomService,backupDir,fail,dropSessions}) {
  const isAdmin = id=>Boolean(db.prepare('SELECT 1 FROM server_admins WHERE user=?').get(id))
  const guard = fn => (request,user) => {
    if (!isAdmin(user.id)) throw fail(403,'Administração restrita.')
    return fn(request,user)
  }
  function event(user, action, detail='') {
    db.prepare('INSERT INTO admin_events(actor,action,detail,at) VALUES(?,?,?,?)').run(user.id,action,detail,clock())
    db.exec('DELETE FROM admin_events WHERE id NOT IN (SELECT id FROM admin_events ORDER BY id DESC LIMIT 200)')
  }

  GET('/admin/overview',guard(async ()=>{
    const now=clock()
    const users=db.prepare(`SELECT u.id,u.handle,u.name,u.seen,
      EXISTS(SELECT 1 FROM server_admins WHERE user=u.id) AS admin,
      EXISTS(SELECT 1 FROM disabled_users WHERE user=u.id) AS disabled
      FROM users u ORDER BY u.handle LIMIT 200`).all()
    const invites=db.prepare('SELECT hash AS id, expires, uses FROM invites WHERE space IS NULL AND expires>? AND uses>0 ORDER BY expires DESC LIMIT 200').all(now)
    const entries=db.prepare('SELECT e.action,e.detail,e.at,u.handle FROM admin_events e JOIN users u ON u.id=e.actor ORDER BY e.id DESC LIMIT 30').all()
    const folders=backupDir?[backupDir,join(backupDir,'automaticos')]:[]
    const backups=(await Promise.all(folders.map(async(folder,index)=>{
      const files=await readdir(folder).catch(error=>{if(error.code!=='ENOENT')throw error;return []})
      return Promise.all(files.filter(name=>backupName.test(name)).sort().reverse().slice(0,30).map(async name=>{
        const info=await stat(join(folder,name)).catch(error=>{if(error.code!=='ENOENT')throw error})
        return info&&{name,bytes:info.size,at:info.mtimeMs,automatic:index===1}
      }))
    }))).flat().filter(Boolean).sort((a,b)=>b.at-a.at).slice(0,30)
    const operations=backupDir ? await readFile(join(dirname(backupDir),'ops','status.json'),'utf8')
      .then(body=>JSON.parse(body)).catch(()=>null) : null
    let media={available:false,rooms:[]}
    try {
      const active=(await roomService.listRooms()).filter(room=>room.numParticipants>0).slice(0,15)
      media={available:true,rooms:await Promise.all(active.map(async room=>{
        const participants=await roomService.listParticipants(room.name).catch(()=>null)
        return {id:room.name,participants:room.numParticipants,transmissions:participants?.filter(person=>person.tracks.some(track=>track.source===TrackSource.SCREEN_SHARE&&!track.muted)).length??null}
      }))}
    } catch { /* Status returned as unavailable. */ }
    const supervisor=operations && Date.now()-operations.at<45000 ? Object.entries(operations.services||{}).filter(([name])=>['contas','livekit'].includes(name))
      .map(([name,value])=>({name,restarts:Number(value.restarts)||0,lastFailure:Number(value.lastFailure)||null})) : []
    return {users,invites,entries,backups,backupEnabled:Boolean(backupDir),media,supervisor,
      host:{cores:cpus().length,load:process.platform==='linux'?loadavg()[0]:null,rss:process.memoryUsage().rss,
        usedMemory:totalmem()-freemem(),totalMemory:totalmem(),uptime:uptime(),traffic:await traffic()}}
  }))

  POST('/admin/invites',guard(({body},user)=>runTx(db,()=>{
    const {count,uses}=body||{}
    if (!Number.isInteger(count)||count<1||count>20||!Number.isInteger(uses)||uses<1||uses>20) throw fail(400,'Use números de 1 a 20.')
    const codes=Array.from({length:count},()=>issueInvite(db,{uses}))
    event(user,'Convites gerados',count+' × '+uses)
    return {codes}
  })))
  POST('/admin/invites/revoke',guard(({body},user)=>{
    if(typeof body?.id!=='string'||!/^[0-9a-f]{64}$/.test(body.id))throw fail(400,'Convite inválido.')
    return runTx(db,()=>{
      const result=db.prepare('UPDATE invites SET uses=0 WHERE hash=? AND space IS NULL AND uses>0').run(body.id)
      if(result.changes)event(user,'Convite revogado',body.id.slice(0,8))
      return {ok:true}
    })
  }))
  POST('/admin/users',guard(async ({body},user)=>{
    const {id,action}=body||{}
    if(typeof id!=='string'||!['disable','enable','grant','revoke'].includes(action)||id===user.id)throw fail(400,'Ação indisponível para essa conta.')
    const target=db.prepare('SELECT handle FROM users WHERE id=?').get(id)
    if(!target)throw fail(404,'Conta indisponível.')
    let sessions=[]
    let calls=[]
    runTx(db,()=>{
      if(action==='disable'){
        sessions=db.prepare('SELECT hash FROM sessions WHERE user=?').all(id).map(row=>row.hash)
        calls=db.prepare("SELECT call FROM call_members WHERE user=? AND state='joined'").all(id)
        db.prepare('INSERT OR IGNORE INTO disabled_users VALUES(?)').run(id)
        db.prepare('DELETE FROM sessions WHERE user=?').run(id)
        db.prepare("UPDATE call_members SET state='left' WHERE user=? AND state IN ('invited','joined')").run(id)
        db.prepare("UPDATE call_members SET state='left' WHERE state='invited' AND call IN (SELECT id FROM calls WHERE creator=?)").run(id)
        db.prepare('UPDATE users SET seen=0 WHERE id=?').run(id)
      } else if(action==='enable')db.prepare('DELETE FROM disabled_users WHERE user=?').run(id)
      else if(action==='grant')db.prepare('INSERT OR IGNORE INTO server_admins VALUES(?)').run(id)
      else db.prepare('DELETE FROM server_admins WHERE user=?').run(id)
      event(user,{disable:'Conta suspensa',enable:'Conta reativada',grant:'Administração concedida',revoke:'Administração revogada'}[action],target.handle)
    })
    dropSessions(sessions)
    for(const call of calls)void roomService.removeParticipant(call.call,id).catch(()=>{})
    return {ok:true}
  }))
  let backingUp=false
  POST('/admin/backups',guard(async (_,user)=>{
    if(!backupDir)throw fail(503,'Pasta de backup indisponível.')
    if(backingUp)throw fail(409,'Já existe um backup em andamento.')
    backingUp=true
    try {
      const name=await makeBackup(db,backupDir)
      event(user,'Backup criado',name)
      return {name}
    } catch {
      event(user,'Falha no backup')
      throw fail(503,'Não foi possível criar o backup.')
    } finally {backingUp=false}
  }))
}
