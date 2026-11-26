import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

export function registerReleases(app, directory) {
  if(!directory)return
  app.get('/updates/:file',async (request,reply)=>{
    const {file}=request.params
    const manifest=file==='manifest.json'
    if(!manifest&&!/^HAVEN-\d{1,4}\.\d{1,4}\.\d{1,4}-Setup-x64\.exe$/.test(file))return reply.code(404).send()
    const path=join(directory,file)
    const info=await stat(path).catch(()=>null)
    if(!info?.isFile())return reply.code(404).send()
    return reply.type(manifest?'application/json':'application/octet-stream')
      .header('content-length',info.size).send(createReadStream(path))
  })
}
