import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { TokenVerifier } from 'livekit-server-sdk'
import { makeServer } from '../backend/server.mjs'
import { digest, issueInvite, openDb } from '../backend/db.mjs'

test('contas privadas, histórico persistente, arquivos e autorização do LiveKit', async t => {
  const dir = mkdtempSync(join(tmpdir(),'haven-test-'))
  const file = join(dir,'test.sqlite')
  const config = {key:'key',secret:'a-test-key-that-is-never-used-outside-of-tests-1',media:'ws://127.0.0.1:7880'}
  let db = openDb(file)
  let app = makeServer(db,config)
  t.after(async () => { await app.close(); db.close(); rmSync(dir,{recursive:true,force:true}) })
  const request = async (url, {token, payload, status = 200, headers = {}} = {}) => {
    const response = await app.inject({method:payload===undefined?'GET':'POST',url,payload,headers:{...headers,...(token?{authorization:'Bearer '+token}:{})}})
    assert.equal(response.statusCode,status,response.body)
    return response.headers['content-type']?.includes('json')?response.json():response.rawPayload
  }
  const credentials = n => ({handle:n,name:n,password:'A long test password!'})
  const register = (n,invite,status) => request('/auth/register',{payload:{...credentials(n),invite},status})
  const expired = issueInvite(db)
  db.prepare('UPDATE invites SET expires=0 WHERE hash=?').run(digest(expired))
  await register('expired',expired,403)
  const one = issueInvite(db)
  const alice = (await register('alice',one)).token
  await register('used',one,403)
  const bob = (await register('bobby',issueInvite(db))).token
  const outsider = (await register('tranger',issueInvite(db))).token
  const a = (await request('/state',{token:alice})).me
  const b = (await request('/state',{token:bob})).me

  await request('/health',{headers:{origin:'https://example.invalid'},status:403})
  assert.equal((await app.inject({url:'/health',headers:{origin:'haven://app'}})).headers['access-control-allow-origin'],'haven://app')
  const space = (await request('/spaces',{token:alice,payload:{name:'Grupo'}})).id
  const rooms = (await request('/state',{token:alice})).rooms
  const text = rooms.find(r=>r.kind==='text').id
  const voice = rooms.find(r=>r.kind==='voice').id
  const history = '/conversations/room/'+text
  await request(history,{token:outsider,status:403})
  await request('/calls',{token:outsider,payload:{room:voice},status:403})
  const invite = (await request('/spaces/'+space+'/invite',{token:alice,payload:{}})).code
  await request('/spaces/join',{token:bob,payload:{code:invite}})
  await request('/spaces/join',{token:outsider,payload:{code:invite},status:403})
  await request('/spaces/'+space+'/rooms',{token:bob,payload:{name:'Secret',kind:'text'},status:403})
  await request('/spaces/'+space+'/role',{token:alice,payload:{user:b.id,role:'admin'}})
  await request('/spaces/'+space+'/rooms',{token:bob,payload:{name:'Jogos',kind:'voice'}})

  const entry = await request(history,{token:alice,payload:{text:'Mensagem real de integração'}})
  assert.equal((await request('/state',{token:bob})).unread[text],1)
  await request(history+'/read',{token:bob,payload:{latest:entry.id}})
  assert.equal((await request('/state',{token:bob})).unread[text],undefined)
  const wall = '/conversations/wall/'+space
  const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf3sAAAAASUVORK5CYII='
  await request(wall,{token:alice,payload:{kind:'image/png',media:'ZGVmaW5pdGVseSBub3QgUE5H'},status:400})
  const media = (await request(wall,{token:alice,payload:{kind:'image/png',media:image}})).id
  assert.deepEqual(await request(wall+'/media/'+media,{token:bob}),Buffer.from(image,'base64'))
  await request(wall+'/media/'+media,{token:outsider,status:403})
  await request('/conversations/dm/'+b.id,{token:alice,status:403})
  await request('/friends/request',{token:alice,payload:{handle:b.handle}})
  await request('/friends/'+a.id+'/respond',{token:bob,payload:{accept:true}})
  await request('/conversations/dm/'+b.id,{token:alice,payload:{text:'Olá'}})
  assert.equal((await request('/conversations/dm/'+a.id,{token:bob})).rows[0].body,'Olá')

  const call = (await request('/calls',{token:alice,payload:{users:[b.id]}})).id
  const repeats = await Promise.all([1,2,3].map(()=>request('/calls',{token:alice,payload:{users:[b.id,b.id]}})))
  assert.ok(repeats.every(result=>result.id===call))
  assert.equal((await request('/state',{token:bob})).calls.filter(item=>item.state==='invited').length,1)
  await request('/media-token',{token:outsider,payload:{id:call},status:403})
  await request('/media-token',{token:bob,payload:{id:call},status:403})
  await request('/calls/'+call+'/respond',{token:bob,payload:{state:'joined'}})
  const grant = await request('/media-token',{token:bob,payload:{id:call,identity:a.id}})
  const verified = await new TokenVerifier(config.key,config.secret).verify(grant.token)
  assert.equal(verified.sub,b.id)
  assert.equal(verified.video.room,call)
  assert.equal(verified.video.canPublishData,false)
  assert.ok(verified.exp-Math.floor(Date.now()/1000)<=300)
  await request('/calls/'+call+'/respond',{token:bob,payload:{state:'left'}})
  await request('/media-token',{token:bob,payload:{id:call},status:403})
  const canceled = (await request('/calls',{token:alice,payload:{users:[b.id]}})).id
  assert.notEqual(canceled,call)
  await request('/calls/'+canceled+'/respond',{token:alice,payload:{state:'left'}})
  await request('/calls/'+canceled+'/respond',{token:bob,payload:{state:'joined'},status:409})
  assert.ok(!(await request('/state',{token:bob})).calls.some(item=>item.id===canceled))
  const missed = (await request('/calls',{token:alice,payload:{users:[b.id]}})).id
  db.prepare('UPDATE calls SET created=? WHERE id=?').run(Date.now()-61_000,missed)
  assert.ok(!(await request('/state',{token:bob})).calls.some(item=>item.id===missed))
  await request('/calls/'+missed+'/respond',{token:bob,payload:{state:'joined'},status:409})
  const next = (await request('/calls',{token:alice,payload:{users:[b.id]}})).id
  assert.notEqual(next,missed)
  assert.equal((await request('/calls',{token:bob,payload:{users:[a.id]}})).id,next)
  await request('/calls/'+next+'/respond',{token:bob,payload:{state:'left'}})
  const declined = (await request('/calls',{token:alice,payload:{users:[b.id]}})).id
  await request('/calls/'+declined+'/respond',{token:bob,payload:{state:'declined'}})
  await request('/calls/'+declined+'/respond',{token:bob,payload:{state:'joined'},status:409})
  await request('/friends/'+a.id+'/remove',{token:bob,payload:{}})
  await request('/friends/'+a.id+'/remove',{token:bob,payload:{}})
  await request('/conversations/dm/'+a.id,{token:bob,status:403})
  await request('/logout',{token:outsider,payload:{}})
  await request('/state',{token:outsider,status:401})

  await app.close()
  db.close()
  db=openDb(file)
  app=makeServer(db,config)
  assert.equal((await request(history,{token:bob})).rows[0].body,'Mensagem real de integração')
})
