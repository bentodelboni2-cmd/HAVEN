const { app, net, shell } = require('electron')
const { createHash, randomUUID, verify } = require('node:crypto')
const { createWriteStream } = require('node:fs')
const { mkdir, rm } = require('node:fs/promises')
const { join } = require('node:path')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { publicKey } = require('./release-config.json')

const versionPattern = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/
const limit = 300 * 1024 * 1024
const errors = {
  source: 'Servidor de atualizações inválido.',
  unavailable: 'O servidor de atualizações está indisponível.',
  integrity: 'A atualização não passou na verificação de segurança.',
}
function updateBase(base) {
  let url
  try { url = new URL(base) } catch { throw new Error(errors.source) }
  const local = /^(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/
  if(url.origin!==base || (url.protocol!=='https:' && !(url.protocol==='http:'&&local.test(url.hostname)))) throw new Error(errors.source)
  return url.origin+'/updates/'
}
async function get(url, timeout) {
  const result = await net.fetch(url,{redirect:'error',signal:AbortSignal.timeout(timeout)}).catch(()=>null)
  if(!result)throw new Error(errors.unavailable)
  return result
}
function verifyManifest(envelope,key=publicKey) {
  try {
    const {payload,signature}=envelope
    const bytes=Buffer.from(payload,'base64url')
    if(!verify(null,bytes,key,Buffer.from(signature,'base64url')))throw new Error()
    const value=JSON.parse(bytes)
    if(!versionPattern.test(value.version)||value.file!=='HAVEN-'+value.version+'-Setup-x64.exe'||
      !Number.isSafeInteger(value.size)||value.size<=0||value.size>limit||!/^[a-f0-9]{64}$/.test(value.sha256))throw new Error()
    return value
  } catch { throw new Error(errors.integrity) }
}
function newer(version,installed) {
  for (let i=0;i<3;i++) {
    const difference=Number(version.split('.')[i])-Number(installed.split('.')[i])
    if(difference)return difference>0
  }
  return false
}
async function candidate(base) {
  if(process.platform!=='win32'||process.arch!=='x64'||!app.isPackaged||!publicKey)return null
  const result=await get(updateBase(base)+'manifest.json',7000)
  if(result.status===404)return null
  if(!result.ok)throw new Error(errors.unavailable)
  const reader=result.body?.getReader()
  if(!reader)throw new Error(errors.integrity)
  let length=0
  const chunks=[]
  try {
    while(true){
      const {done,value}=await reader.read()
      if(done)break
      length+=value.length
      if(length>8192)throw new Error(errors.integrity)
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(()=>{}) }
  let envelope
  try { envelope=JSON.parse(Buffer.concat(chunks)) } catch { throw new Error(errors.integrity) }
  const info=verifyManifest(envelope)
  return newer(info.version,app.getVersion())?info:null
}
async function check(base) {
  const info=await candidate(base)
  return info&&{version:info.version}
}

let installing=false
async function install(base,version) {
  if(installing)throw new Error('Já existe uma atualização em andamento.')
  installing=true
  let temporary
  try {
    const info=await candidate(base)
    if(!info||version!==info.version)throw new Error('A versão mudou. Verifique as atualizações novamente.')
    const directory=join(app.getPath('userData'),'updates',randomUUID())
    await mkdir(directory,{recursive:true})
    const path=join(directory,info.file)
    temporary=directory
    const response=await get(updateBase(base)+info.file,180000)
    if(!response.ok||!response.body)throw new Error(errors.unavailable)
    let size=0
    const hash=createHash('sha256')
    await pipeline(Readable.fromWeb(response.body),new Transform({
      transform(chunk,_encoding,done){
        size+=chunk.length
        if(size>info.size)return done(new Error(errors.integrity))
        hash.update(chunk);done(null,chunk)
      },
    }),createWriteStream(path,{flags:'wx'}))
    if(size!==info.size||hash.digest('hex')!==info.sha256)throw new Error(errors.integrity)
    const error=await shell.openPath(path)
    if(error)throw new Error('O Windows não conseguiu abrir o instalador.')
    temporary=undefined
    return true
  } finally {
    try { if(temporary)await rm(temporary,{recursive:true,force:true}) }
    finally { installing=false }
  }
}

module.exports={check,install,verifyManifest,newer}
