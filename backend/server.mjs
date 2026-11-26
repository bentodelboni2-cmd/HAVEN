import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import { clock, digest, issueInvite, passwordHash, passwordMatches, runTx, secret } from './db.mjs'

const DAY = 86_400_000
const RING_MS = 60_000
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode })
const bad = message => { throw fail(400, message) }
const denied = () => { throw fail(403, 'Acesso indisponível.') }
const missing = () => { throw fail(404, 'Item indisponível.') }
const str = (value, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) bad('Revise os campos.')
  return value.trim()
}
const id = value => {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) bad('Identificador inválido.')
  return value
}
const credentials = b => {
  const handle = str(b.handle, 3, 24).toLowerCase()
  if (!/^[a-z0-9_]+$/.test(handle) || typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 128) bad('Use um usuário alfanumérico e senha de 10 a 128 caracteres.')
  return { handle, password: b.password }
}
const pair = (a,b) => [a,b].sort()
const person = 'u.id,u.handle,u.name,u.color,u.seen'
const limits = { image: 8 * 1024 * 1024, video: 8 * 1024 * 1024 }

function acceptMedia(data) {
  const kind = data.kind
  const types = ['image/png','image/jpeg','image/webp','video/mp4','video/webm']
  if (!types.includes(kind) || typeof data.media !== 'string' || !/^[a-zA-Z0-9+/]+={0,2}$/.test(data.media)) bad('Arquivo inválido.')
  const buffer = Buffer.from(data.media, 'base64')
  const head = buffer.subarray(0,12)
  const valid = {
    'image/png': head.subarray(0,8).toString('hex') === '89504e470d0a1a0a',
    'image/jpeg': head.subarray(0,3).toString('hex') === 'ffd8ff',
    'image/webp': head.toString('ascii',0,4) === 'RIFF' && head.toString('ascii',8,12) === 'WEBP',
    'video/mp4': head.toString('ascii',4,8) === 'ftyp',
    'video/webm': head.subarray(0,4).toString('hex') === '1a45dfa3',
  }
  if (!valid[kind] || buffer.length > limits[kind.split('/')[0]]) bad('Formato inválido ou maior que 8 MB.')
  return [kind, buffer]
}

export function makeServer(db, config) {
  const app = Fastify({ https: config.tls, trustProxy: config.trustProxy, bodyLimit: 20 * 1024, requestTimeout: 20000 })
  const get = (sql, ...args) => db.prepare(sql).get(...args)
  const all = (sql, ...args) => db.prepare(sql).all(...args)
  const run = (sql, ...args) => db.prepare(sql).run(...args)
  const rate = new Map()
  const streams = new Map()
  const roomService = new RoomServiceClient(config.api || config.media.replace(/^ws/,'http'), config.key, config.secret, { requestTimeout: 2 })
  const voiceStatus = new Map()
  function liveVoice(cid) {
    const now = clock()
    const saved = voiceStatus.get(cid)
    if (saved && saved.expires > now) return saved.result
    if (voiceStatus.size >= 32) for (const [key, value] of voiceStatus) if (value.expires <= now) voiceStatus.delete(key)
    const result = roomService.listParticipants(cid).then(participants => ({
      total: participants.length,
      screens: participants.filter(p => p.tracks.some(t => t.source === TrackSource.SCREEN_SHARE && !t.muted)).map(p => p.name).filter(Boolean),
    })).catch(() => ({ total:0, screens:[] }))
    voiceStatus.set(cid, { expires:now + 4000, result })
    return result
  }
  const emit = () => {
    for (const response of streams.values()) for (const stream of response) {
      if (!stream.writableEnded && !stream.writableNeedDrain) stream.write('event: change\ndata: {}\n\n')
    }
  }
  app.addHook('onRequest', async (q, reply) => {
    const origin = q.headers.origin
    if (origin && origin !== 'haven://app') denied()
    if (origin) reply.header('access-control-allow-origin', origin).header('vary','Origin')
    reply.header('cache-control','no-store').header('x-content-type-options','nosniff')
    const now = clock()
    if (rate.size >= 1024) for (const [key, item] of rate) if (item.until < now) rate.delete(key)
    const auth = q.url.startsWith('/auth/')
    const key = q.ip + (auth ? '/auth' : '')
    let item = rate.get(key)
    if (!item || item.until < now) {
      if (!item && rate.size >= 4096) throw fail(429, 'Tente novamente em um minuto.')
      item = { count: 0, until: now + 60000 }
      rate.set(key,item)
    }
    if (++item.count > (auth ? 12 : 450)) throw fail(429, 'Tente novamente em um minuto.')
  })
  app.options('/*', (_, reply) => reply.header('access-control-allow-methods','GET, POST, OPTIONS')
    .header('access-control-allow-headers','Content-Type, Authorization').code(204).send())
  app.setErrorHandler((error, _, reply) => {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500
    if (status === 500) console.error(error.code || error.name)
    reply.code(status).send({ error: status === 500 ? 'Serviço temporariamente indisponível.' : error.message })
  })

  const session = user => {
    const token = secret()
    run('DELETE FROM sessions WHERE expires <= ?', clock())
    run('INSERT INTO sessions VALUES(?,?,?)',digest(token),user,clock() + 7 * DAY)
    return { token }
  }
  const membership = (space, u) => get('SELECT role FROM members WHERE space=? AND user=?',space,u)
  const accessSpace = (space, u, edit = false) => {
    const row = membership(id(space),u)
    if (!row || (edit && row.role === 'member')) denied()
    return row
  }
  const friendship = (a,b) => get('SELECT * FROM friends WHERE a=? AND b=?', ...pair(a,b))
  const room = (rid,u,kind) => {
    const row = get('SELECT * FROM rooms WHERE id=?',id(rid))
    if (!row || row.kind !== kind) missing()
    accessSpace(row.space,u)
    return row
  }
  const call = (cid,u) => {
    const row = get('SELECT c.*,cm.state FROM calls c JOIN call_members cm ON c.id=cm.call WHERE c.id=? AND cm.user=? AND c.expires>?',id(cid),u,clock())
    if (!row) denied()
    if (row.room) room(row.room,u,'voice')
    return row
  }
  const scope = (kind, target, u) => {
    id(target)
    if (kind === 'dm') {
      if (!friendship(u,target)?.accepted) denied()
      return 'dm:' + pair(u,target).join(':')
    }
    if (kind === 'room') room(target,u,'text')
    else if (kind === 'wall') accessSpace(target,u)
    else if (kind === 'call') {
      if (call(target,u).state !== 'joined') denied()
    } else bad('Conversa inválida.')
    return kind + ':' + target
  }

  const secure = (method,url,fn,options) => app.route({ method,url,...options, handler: async (q, reply) => {
    const token = q.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1]
    const hash = token && digest(token)
    const user = hash && get('SELECT ' + person + ' FROM users u JOIN sessions s ON s.user=u.id WHERE s.hash=? AND s.expires>?',hash,clock())
    if (!user) throw fail(401,'Entre com sua conta.')
    if (user.seen + 10000 < clock()) run('UPDATE users SET seen=? WHERE id=?',clock(),user.id)
    const result = await fn(q, user, reply, hash)
    if (method === 'POST' && !['/media-token','/logout','/conversations/:kind/:target/read'].includes(url)) emit()
    return result
  } })
  const GET = (url,fn) => secure('GET',url,fn)
  const POST = (url,fn,options) => secure('POST',url,fn,options)
  app.get('/health', () => ({ ok: true }))
  app.post('/auth/login', async ({ body }) => {
    const { handle,password } = credentials(body || {})
    const user = get('SELECT id,password FROM users WHERE handle=?',handle)
    if (!(await passwordMatches(password,user?.password)) || !user) throw fail(401,'Usuário ou senha inválidos.')
    return session(user.id)
  })
  app.post('/auth/register', async ({ body }) => {
    const { handle,password } = credentials(body || {})
    const name = str(body.name, 1, 48)
    const code = str(body.invite, 43, 43)
    const hash = digest(code)
    if (!get('SELECT 1 FROM invites WHERE hash=? AND uses>0 AND expires>?',hash,clock())) denied()
    const encoded = await passwordHash(password)
    return runTx(db, () => {
      const invite = get('SELECT * FROM invites WHERE hash=? AND uses>0 AND expires>?',hash,clock())
      if (!invite) denied()
      if (get('SELECT id FROM users WHERE handle=?',handle)) throw fail(409,'Usuário indisponível.')
      const uid = randomUUID()
      run('INSERT INTO users(id,handle,name,password) VALUES(?,?,?,?)',uid,handle,name,encoded)
      run('UPDATE invites SET uses=uses-1 WHERE hash=?',hash)
      if (invite.space) run('INSERT INTO members VALUES(?,?,?)',invite.space,uid,'member')
      return session(uid)
    })
  })
  POST('/logout', (_,u,reply,hash) => {
    run('DELETE FROM sessions WHERE hash=?',hash)
    for (const stream of streams.get(hash) || []) stream.end()
    return { ok:true }
  })
  GET('/changes', (q, u, reply, hash) => {
    const list = streams.get(hash) || new Set()
    let count = 0
    for (const entries of streams.values()) count += entries.size
    if (list.size >= 3 || count >= 64) throw fail(429,'Conexões em tempo real em uso.')
    reply.hijack()
    const stream = reply.raw
    stream.writeHead(200, { ...reply.getHeaders(), 'content-type':'text/event-stream', 'x-accel-buffering':'no' })
    stream.write(': conexão\n\n')
    list.add(stream)
    streams.set(hash,list)
    const keep = setInterval(() => {
      if (!get('SELECT 1 FROM sessions WHERE hash=? AND expires>?',hash,clock())) stream.end()
      else if (!stream.writableNeedDrain) stream.write(': atividade\n\n')
    },20000)
    stream.on('close', () => {
      clearInterval(keep)
      list.delete(stream)
      if (!list.size) streams.delete(hash)
    })
  })
  app.addHook('preClose', async () => {
    for (const list of streams.values()) for (const stream of list) stream.end()
  })

  GET('/state', async (_, { id: u, ...me }) => {
    const spaces = all('SELECT s.*,m.role FROM spaces s JOIN members m ON m.space=s.id WHERE m.user=? ORDER BY s.name',u)
    const rooms = all('SELECT r.* FROM rooms r JOIN members m ON m.space=r.space WHERE m.user=? ORDER BY r.name',u)
    const friends = all(`SELECT ${person},f.sender,f.accepted FROM friends f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE f.a=? OR f.b=? ORDER BY u.name`,u,u,u)
    const members = all(`SELECT ${person},other.role,other.space FROM members mine JOIN members other ON mine.space=other.space JOIN users u ON u.id=other.user WHERE mine.user=? ORDER BY u.name`,u)
    const now = clock()
    const calls = all(`SELECT c.id,c.creator,c.room,c.created,cm.state,u.name,
      CASE WHEN c.created>? THEN (SELECT COUNT(*) FROM call_members waiting WHERE waiting.call=c.id AND waiting.state='invited') ELSE 0 END AS pending
      FROM calls c JOIN call_members cm ON cm.call=c.id JOIN users u ON u.id=c.creator
      WHERE cm.user=? AND c.expires>? AND (cm.state='joined' OR (cm.state='invited' AND c.created>?))
      ORDER BY c.created DESC LIMIT 25`,now-RING_MS,u,now,now-RING_MS)
    const events = all('SELECT e.* FROM events e JOIN members m ON m.space=e.space WHERE m.user=? AND e.starts>? ORDER BY e.starts LIMIT 100',u,clock()-DAY)
    const liveRooms = all("SELECT DISTINCT c.id,c.room FROM calls c JOIN rooms r ON c.room=r.id JOIN members m ON m.space=r.space JOIN call_members cm ON cm.call=c.id JOIN users u ON u.id=cm.user WHERE m.user=? AND c.expires>? AND cm.state='joined' AND u.seen>? ORDER BY c.created DESC LIMIT 24",u,clock(),clock()-45000)
    const counts = [...rooms.filter(r=>r.kind==='text').map(r=>['room',r.id]), ...friends.filter(f=>f.accepted).map(f=>['dm',f.id])]
    const unread = {}
    const findRecent = db.prepare('SELECT m.id,m.body,m.sent,u.name FROM messages m JOIN users u ON u.id=m.sender WHERE m.scope=? ORDER BY m.id DESC LIMIT 1')
    const latest = []
    for (const [kind,target] of counts) {
      const channel = scope(kind,target,u)
      const n = get('SELECT COUNT(*) AS total FROM messages WHERE scope=? AND sender<>? AND id>COALESCE((SELECT latest FROM reads WHERE user=? AND scope=?),0)',channel,u,u,channel).total
      if (n) unread[target] = n
      const recent = findRecent.get(channel)
      if (recent) latest.push({ ...recent, kind, target })
    }
    const occupancy = (await Promise.all(liveRooms.map(async c => ({ room:c.room,...await liveVoice(c.id) })))).filter(r=>r.total)
    return { me:{ id:u,...me },spaces,rooms,members,friends,calls,events,occupancy,unread,latest:latest.sort((a,b)=>b.id-a.id).slice(0,5) }
  })

  POST('/profile', ({body:b},u) => {
    const color = ['verde','azul','lavanda','areia'].includes(b?.color) ? b.color : 'verde'
    run('UPDATE users SET name=?,color=? WHERE id=?',str(b?.name,1,48),color,u.id)
    return { ok:true }
  })
  POST('/friends/request', ({body:b},u) => {
    const handle = str(b?.handle,3,24).toLowerCase()
    const target = get('SELECT id FROM users WHERE handle=? AND id<>?',handle,u.id)
    if (!target) missing()
    run('INSERT OR IGNORE INTO friends VALUES(?,?,?,0)',...pair(u.id,target.id),u.id)
    return { ok:true }
  })
  POST('/friends/:id/respond', ({params:p,body:b},u) => {
    const other = id(p.id)
    if (typeof b?.accept !== 'boolean') bad('Resposta inválida.')
    const existing = friendship(u.id,other)
    if (!existing || existing.accepted || existing.sender === u.id) denied()
    if (b.accept) run('UPDATE friends SET accepted=1 WHERE a=? AND b=?',...pair(u.id,other))
    else run('DELETE FROM friends WHERE a=? AND b=?',...pair(u.id,other))
    return { ok:true }
  })
  POST('/friends/:id/remove', ({params:p},u) => {
    const [a,b] = pair(u.id,id(p.id))
    run('DELETE FROM friends WHERE a=? AND b=?',a,b)
    return { ok:true }
  })

  POST('/spaces', ({body:b},u) => {
    const name = str(b?.name,1,48)
    const description = str(b.description ?? '',0,240)
    return runTx(db, () => {
      const sid = randomUUID()
      run('INSERT INTO spaces(id,name,description) VALUES(?,?,?)',sid,name,description)
      run("INSERT INTO members VALUES(?,?,'owner')",sid,u.id)
      run("INSERT INTO rooms VALUES(?,?,?,'voice'),(?,?,?,'text')",randomUUID(),sid,'Principal',randomUUID(),sid,'Conversa')
      return { id:sid }
    })
  })
  POST('/spaces/:id/edit', ({params:p,body:b},u) => {
    accessSpace(p.id,u.id,true)
    const theme = ['serra','noite','bruma'].includes(b?.theme) ? b.theme : 'serra'
    run('UPDATE spaces SET name=?,description=?,theme=? WHERE id=?',str(b?.name,1,48),str(b.description ?? '',0,240),theme,p.id)
    return { ok:true }
  })
  POST('/spaces/:id/invite', ({params:p},u) => {
    accessSpace(p.id,u.id,true)
    return { code:issueInvite(db,{space:p.id}) }
  })
  POST('/spaces/join', ({body:b},u) => {
    const hash = digest(str(b?.code,43,43))
    return runTx(db, () => {
      const invite = get('SELECT * FROM invites WHERE hash=? AND space IS NOT NULL AND expires>? AND uses>0',hash,clock())
      if (!invite) denied()
      if (!membership(invite.space,u.id)) {
        run("INSERT INTO members VALUES(?,?,'member')",invite.space,u.id)
        run('UPDATE invites SET uses=uses-1 WHERE hash=?',hash)
      }
      return { id:invite.space }
    })
  })
  POST('/spaces/:id/role', ({params:p,body:b},u) => {
    if (accessSpace(p.id,u.id,true).role !== 'owner') denied()
    const target = id(b?.user)
    if (target === u.id || !['member','admin'].includes(b.role) || !membership(p.id,target)) denied()
    run('UPDATE members SET role=? WHERE space=? AND user=?',b.role,p.id,target)
    return { ok:true }
  })
  POST('/spaces/:id/rooms', ({params:p,body:b},u) => {
    accessSpace(p.id,u.id,true)
    const name = str(b?.name,1,48)
    if (b.id) {
      const updated = run('UPDATE rooms SET name=? WHERE space=? AND id=?',name,p.id,id(b.id))
      if (!updated.changes) missing()
      return { id:b.id }
    }
    if (!['voice','text'].includes(b.kind)) bad('Tipo de sala inválido.')
    const rid = randomUUID()
    run('INSERT INTO rooms VALUES(?,?,?,?)',rid,p.id,name,b.kind)
    return { id:rid }
  })
  POST('/spaces/:id/events', ({params:p,body:b},u) => {
    accessSpace(p.id,u.id)
    const title = str(b?.title,1,96)
    if (!Number.isSafeInteger(b.starts) || b.starts < clock() || b.starts > clock()+365*DAY) bad('Informe um horário futuro.')
    const eid = randomUUID()
    run('INSERT INTO events VALUES(?,?,?,?,?)',eid,p.id,u.id,title,b.starts)
    return { id:eid }
  })
  POST('/calls', ({body:b},u) => runTx(db, () => {
    const voice = b?.room ? room(b.room,u.id,'voice') : null
    const targets = b?.users ?? []
    if (!Array.isArray(targets) || targets.length > 12 || (voice && targets.length)) bad('Convites inválidos.')
    const recipients = [...new Set(targets)]
    for (const target of recipients) if (target === u.id || !friendship(u.id,id(target))?.accepted) denied()
    if (recipients.length) {
      const members = [u.id,...recipients]
      const params = members.map(()=>'?').join(',')
      const existing = get(`SELECT c.id, self.state FROM calls c
        JOIN call_members self ON self.call=c.id AND self.user=?
        JOIN call_members host ON host.call=c.id AND host.user=c.creator AND host.state='joined'
        WHERE c.room IS NULL AND c.code IS NULL AND c.expires>? AND c.created>?
        AND self.state IN ('joined','invited')
        AND EXISTS (SELECT 1 FROM call_members WHERE call=c.id AND user<>c.creator
          AND state IN ('joined','invited'))
        AND (SELECT COUNT(*) FROM call_members WHERE call=c.id)=?
        AND NOT EXISTS (SELECT 1 FROM call_members WHERE call=c.id AND user NOT IN (${params}))
        ORDER BY c.created DESC LIMIT 1`,u.id,clock(),clock()-RING_MS,members.length,...members)
      if (existing) {
        if (existing.state==='invited') run("UPDATE call_members SET state='joined' WHERE call=? AND user=?",existing.id,u.id)
        return { id:existing.id, code:null }
      }
    }
    const open = voice && get('SELECT id FROM calls WHERE room=? AND expires>? ORDER BY created DESC LIMIT 1',voice.id,clock())
    const cid = open?.id || randomUUID()
    const code = !voice && !targets.length ? randomUUID().replaceAll('-','').slice(0,16) : null
    if (!open) run('INSERT INTO calls VALUES(?,?,?,?,?,?)',cid,u.id,voice?.id ?? null,code,clock(),clock()+DAY)
    run("INSERT INTO call_members VALUES(?,?,'joined') ON CONFLICT(call,user) DO UPDATE SET state='joined'",cid,u.id)
    for (const target of recipients) run("INSERT INTO call_members VALUES(?,?,'invited')",cid,target)
    return { id:cid, code }
  }))
  POST('/calls/join', ({body:b},u) => {
    const found = get('SELECT id FROM calls WHERE code=? AND expires>?',str(b?.code,16,16).toLowerCase(),clock())
    if (!found) missing()
    run("INSERT INTO call_members VALUES(?,?,'joined') ON CONFLICT(call,user) DO UPDATE SET state='joined'",found.id,u.id)
    return { id:found.id }
  })
  POST('/calls/:id/respond', async ({params:p,body:b},u) => {
    const existing = call(p.id,u.id)
    if (!['joined','declined','left'].includes(b?.state)) bad('Resposta inválida.')
    const staleInvite = existing.state==='invited' && existing.created<=clock()-RING_MS
    if (b.state === 'joined' && (staleInvite || !['invited','joined'].includes(existing.state))) {
      throw fail(409,'Este convite de chamada expirou ou foi cancelado.')
    }
    runTx(db, () => {
      run('UPDATE call_members SET state=? WHERE call=? AND user=?',b.state,p.id,u.id)
      if (existing.creator === u.id && b.state !== 'joined') {
        run("UPDATE call_members SET state='left' WHERE call=? AND state='invited'",p.id)
      }
    })
    voiceStatus.delete(p.id)
    if (existing.state === 'joined' && b.state !== 'joined') {
      await roomService.removeParticipant(p.id,u.id).catch(()=>{})
    }
    return { ok:true }
  })
  POST('/media-token', async ({body:b},u) => {
    const found = call(b?.id,u.id)
    if (found.state !== 'joined') denied()
    const token = new AccessToken(config.key, config.secret,{identity:u.id,name:u.name,ttl:'5m'})
    token.addGrant({room:found.id,roomJoin:true,canPublish:true,canSubscribe:true,canPublishData:false,
      canPublishSources:[TrackSource.MICROPHONE,TrackSource.CAMERA,TrackSource.SCREEN_SHARE,TrackSource.SCREEN_SHARE_AUDIO]})
    return { token:await token.toJwt(), url:config.media, code:found.creator === u.id ? found.code : null }
  })
  GET('/conversations/:kind/:target', ({params:p,query:q},u) => {
    const channel = scope(p.kind,p.target,u.id)
    const before = Number(q.before ?? Number.MAX_SAFE_INTEGER)
    if (!Number.isSafeInteger(before) || before < 1) bad('Página inválida.')
    const rows = all('SELECT m.id,m.sender,m.body,m.sent,m.kind,u.name,u.color FROM messages m JOIN users u ON u.id=m.sender WHERE m.scope=? AND m.id<? ORDER BY m.id DESC LIMIT 41',channel,before)
    return { rows:rows.slice(0,40).reverse(), more:rows.length>40 }
  })
  POST('/conversations/:kind/:target', ({params:p,body:b},u) => {
    const channel = scope(p.kind,p.target,u.id)
    const body = str(b?.text ?? '',b?.media ? 0 : 1,2000)
    const [kind,media] = b?.media ? acceptMedia(b) : [null,null]
    if (p.kind === 'wall' && !kind) bad('Selecione uma imagem ou clipe.')
    const row = run('INSERT INTO messages(scope,sender,body,sent,kind,media) VALUES(?,?,?,?,?,?)',channel,u.id,body,clock(),kind,media)
    return { id:row.lastInsertRowid }
  }, { bodyLimit:12 * 1024 * 1024 })
  POST('/conversations/:kind/:target/read', ({params:p,body:b},u) => {
    const channel = scope(p.kind,p.target,u.id)
    if (!Number.isSafeInteger(b?.latest) || !get('SELECT 1 FROM messages WHERE scope=? AND id=?',channel,b.latest)) bad('Mensagem indisponível.')
    run('INSERT INTO reads VALUES(?,?,?) ON CONFLICT(scope,user) DO UPDATE SET latest=MAX(latest,excluded.latest)',channel,u.id,b.latest)
    return { ok:true }
  })
  GET('/conversations/:kind/:target/media/:mid', ({params:p},u,reply) => {
    const channel = scope(p.kind,p.target,u.id)
    const row = get('SELECT kind,media FROM messages WHERE scope=? AND id=? AND kind IS NOT NULL',channel,p.mid)
    if (!row) missing()
    return reply.type(row.kind).send(Buffer.from(row.media))
  })
  return app
}
