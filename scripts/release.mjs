import { spawnSync } from 'node:child_process'
import { createHash, createPublicKey, randomUUID, sign, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const keyFile = process.env.HAVEN_SIGNING_KEY
const target = process.env.HAVEN_RELEASE_TARGET
const pnpm = process.env.npm_execpath
if(!keyFile||!target||!pnpm)throw new Error('Configure HAVEN_SIGNING_KEY e HAVEN_RELEASE_TARGET e execute pnpm release.')
const privateKey=await readFile(keyFile)
const {publicKey}=JSON.parse(await readFile('desktop/release-config.json','utf8'))
if(createPublicKey(privateKey).export({type:'spki',format:'pem'})!==publicKey)throw new Error('A chave não corresponde à pública instalada no HAVEN.')
const {version}=JSON.parse(await readFile('package.json','utf8'))
if(!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version))throw new Error('Use uma versão numérica como 0.4.0.')

function run(args){
  const result=spawnSync(process.execPath,[pnpm,...args],{stdio:'inherit'})
  if(result.error||result.status!==0)throw result.error||new Error('Etapa de release falhou.')
}
async function checksum(path){
  const hash=createHash('sha256')
  for await (const chunk of createReadStream(path))hash.update(chunk)
  return hash.digest('hex')
}
run(['check'])
run(['test'])
run(['build','--logLevel','error'])
run(['exec','electron-builder','--win','nsis','--x64','--publish','never','--config.directories.output=release/'+version])

const file='HAVEN-'+version+'-Setup-x64.exe'
const source=join('release',version,'HAVEN Setup '+version+'.exe')
const info={version,file,size:(await stat(source)).size,sha256:await checksum(source)}
if(info.size<=0||info.size>300*1024*1024)throw new Error('Instalador fora do limite.')
const bytes=Buffer.from(JSON.stringify(info))
const signature=sign(null,bytes,privateKey)
if(!verify(null,bytes,publicKey,signature))throw new Error('Não foi possível verificar a assinatura da versão.')
const manifest=JSON.stringify({payload:bytes.toString('base64url'),signature:signature.toString('base64url')})+'\n'

const directory=resolve(target)
await mkdir(directory,{recursive:true})
const lock=join(directory,'.release.lock')
await writeFile(lock,String(process.pid),{flag:'wx'})
const staging=join(directory,'.staging-'+randomUUID())
const manifestPath=join(directory,'manifest.json')
try {
  const previous=await readFile(manifestPath,'utf8').catch(err=>{if(err.code!=='ENOENT')throw err})
  if(previous){
    const envelope=JSON.parse(previous)
    const payload=Buffer.from(envelope.payload,'base64url')
    if(!verify(null,payload,publicKey,Buffer.from(envelope.signature,'base64url')))throw new Error('O manifesto existente tem assinatura inválida.')
    const old=JSON.parse(payload)
    const rank=v=>v.split('.').reduce((total,part)=>total*10000+Number(part),0)
    if(rank(old.version)>rank(version))throw new Error('O destino contém uma versão mais recente.')
    if(old.version===version&&old.sha256!==info.sha256)throw new Error('Incremente a versão antes de publicar um instalador diferente.')
  }
  await mkdir(staging)
  const temporary=join(staging,file)
  await copyFile(source,temporary)
  if(await checksum(temporary)!==info.sha256)throw new Error('A cópia divergiu do instalador verificado.')
  const existing=await stat(join(directory,file)).catch(error=>{if(error.code!=='ENOENT')throw error})
  if(existing){
    if(await checksum(join(directory,file))!==info.sha256)throw new Error('O instalador publicado já existe com conteúdo diferente.')
  }else await rename(temporary,join(directory,file))
  await writeFile(join(staging,'manifest.json'),manifest,{flag:'wx'})
  await rename(join(staging,'manifest.json'),manifestPath)
  console.log('Versão '+version+' publicada no diretório configurado.')
} finally {
  await rm(staging,{recursive:true,force:true})
  await rm(lock,{force:true})
}
