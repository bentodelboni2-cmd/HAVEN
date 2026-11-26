import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const { verifyManifest, newer } = createRequire(import.meta.url)('../desktop/updates.cjs')
test('atualizações exigem assinatura válida e uma versão mais recente',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519')
  const file={version:'0.4.1',file:'HAVEN-0.4.1-Setup-x64.exe',size:121,sha256:'a'.repeat(64)}
  const bytes=Buffer.from(JSON.stringify(file))
  const signed={payload:bytes.toString('base64url'),signature:sign(null,bytes,privateKey).toString('base64url')}
  assert.deepEqual(verifyManifest(signed,publicKey),file)
  assert.throws(()=>verifyManifest({...signed,payload:Buffer.from(JSON.stringify({...file,size:120})).toString('base64url')},publicKey),/verificação/)
  assert.throws(()=>verifyManifest(signed,generateKeyPairSync('ed25519').publicKey),/verificação/)
  assert.ok(newer('0.4.10','0.4.9'))
  assert.ok(!newer('0.4.0','0.4.0'))
  assert.ok(!newer('0.3.99','0.4.0'))
})
