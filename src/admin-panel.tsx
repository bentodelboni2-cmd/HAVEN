import { useCallback, useEffect, useState } from 'react'
import { Clipboard, Shield } from 'lucide-react'
import { dateTime, describe } from './api'
import type { Api } from './api'
import { Dialog, Empty, Panel, SectionTitle } from './components'

type User = {id:string;name:string;handle:string;seen:number;admin:0|1;disabled:0|1}
type Overview = {
  users:User[]; invites:{id:string;uses:number;expires:number}[]
  entries:{handle:string;action:string;detail:string;at:number}[]
  backups:{name:string;bytes:number;at:number;automatic:boolean}[]; backupEnabled:boolean
  media:{available:boolean;rooms:{id:string;participants:number;transmissions:number|null}[]}
  supervisor:{name:string;restarts:number;lastFailure:number|null}[]
  host:{cores:number;load:number|null;rss:number;usedMemory:number;totalMemory:number;uptime:number;traffic:{received:number;sent:number}|null}
}
const mib = (bytes:number)=>Math.round(bytes/(1024**2)).toLocaleString('pt-BR')+' MiB'

export function AdminPanel({api,me,notify}:{api:Api;me:string;notify:(message:unknown)=>void}) {
  const [status,setStatus]=useState<Overview>()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [codes,setCodes]=useState<string[]>([])
  const [confirm,setConfirm]=useState<{label:string;submit:()=>Promise<unknown>}>()
  const load=useCallback(async(signal?:AbortSignal)=>{
    try {
      const next=await api.json<Overview>('/admin/overview',undefined,signal)
      if(!signal?.aborted){setStatus(next);setError('')}
    }catch(cause){
      if(!signal?.aborted){setError(describe(cause)); if((cause as { status?:number }).status===403)setStatus(undefined)}
    }
  },[api])
  useEffect(()=>{
    const controller=new AbortController()
    void load(controller.signal)
    const timer=window.setInterval(()=>void load(controller.signal),20000)
    return ()=>{controller.abort();window.clearInterval(timer)}
  },[load])
  async function act(action:()=>Promise<unknown>){
    if(busy)return
    setBusy(true)
    try {await action();setConfirm(undefined);await load()}
    catch(cause){setConfirm(undefined);notify(cause)}
    finally{setBusy(false)}
  }
  if(!status)return <><SectionTitle>Administração</SectionTitle><p role={error?'alert':'status'}>{error||'Consultando o servidor…'}</p></>
  return <>
    <div className="heading"><SectionTitle>Administração</SectionTitle><button className="quiet" disabled={busy} onClick={()=>void load()}>Atualizar</button></div>
    {error&&<p className="notice" role="alert">{error}</p>}
    <div className="settings-grid admin-grid">
      <Panel title="Convites de cadastro"><div className="stack">
        <form className="stack" onSubmit={event=>{
          event.preventDefault()
          const form=new FormData(event.currentTarget)
          void act(async()=>{
            const result=await api.json<{codes:string[]}>('/admin/invites',{count:Number(form.get('count')),uses:Number(form.get('uses'))})
            setCodes(result.codes)
          })
        }}>
          <div className="inline wrap">
            <label>Quantidade<input type="number" name="count" min={1} max={20} defaultValue={1} required/></label>
            <label>Usos por convite<input type="number" name="uses" min={1} max={20} defaultValue={1} required/></label>
          </div>
          <button className="accent" disabled={busy}>Gerar convites</button>
        </form>
        {codes.length>0&&<div className="stack"><p>Copie os códigos agora. A lista de convites ativos mostra apenas o identificador.</p>
          {codes.map((code,index)=><input key={code} aria-label={'Convite '+(index+1)} readOnly value={code}/>)}
          <button className="quiet" onClick={()=>void navigator.clipboard.writeText(codes.join('\n')).then(()=>notify('Convites copiados.')).catch(notify)}><Clipboard size={16}/> Copiar códigos</button>
        </div>}
        {status.invites.length?<ul className="feed">{status.invites.map(invite=><li key={invite.id}><div><strong>{invite.id.slice(0,8)}</strong><small>{invite.uses} usos restantes · até {dateTime(invite.expires)}</small></div>
          <button className="quiet" disabled={busy} onClick={()=>setConfirm({label:'Revogar o convite '+invite.id.slice(0,8)+'?',submit:()=>api.json('/admin/invites/revoke',{id:invite.id})})}>Revogar</button>
        </li>)}</ul>:<Empty>Nenhum convite ativo.</Empty>}
      </div></Panel>
      <Panel title="Serviços e chamadas"><div className="stack">
        <p>Contas · online</p><p>LiveKit · {status.media.available?'online':'indisponível'}</p>
        <p>{status.host.cores} CPUs lógicas · {mib(status.host.usedMemory)} de {mib(status.host.totalMemory)} de RAM estimada</p>
        <p>{status.host.load===null?'Carga do host indisponível':('Carga do host (1 min) · '+status.host.load.toLocaleString('pt-BR'))} · Backend · {mib(status.host.rss)} de RAM</p>
        <p>{status.host.traffic?'Rede do host · '+mib(status.host.traffic.received)+' recebidos · '+mib(status.host.traffic.sent)+' enviados':'Contadores de rede indisponíveis.'}</p>
        {status.media.rooms.length?<ul className="feed">{status.media.rooms.map(room=><li key={room.id}><div><strong>Sala {room.id.slice(0,8)}</strong><small>{room.participants} participantes · {room.transmissions ?? '—'} transmissões</small></div></li>)}</ul>:<Empty>Nenhuma chamada ativa detectada.</Empty>}
      </div></Panel>
      <Panel title="Usuários"><ul className="feed">{status.users.map(user=><li key={user.id}><div><strong>{user.name}</strong><small>@{user.handle} · {user.disabled?'Suspenso':Date.now()-user.seen<45000?'Online':'Offline'}{user.admin?' · Administrador':''}</small></div>
        {user.id!==me&&<div className="inline wrap">{(user.disabled?[['enable','Reativar']]:[['disable','Suspender'],user.admin?['revoke','Revogar administração']:['grant','Tornar administrador']]).map(([action,label])=>
          <button key={action} className="quiet" disabled={busy} onClick={()=>setConfirm({label:label+' para @'+user.handle+'?',submit:()=>api.json('/admin/users',{id:user.id,action})})}>{label}</button>)}</div>}
      </li>)}</ul></Panel>
      <Panel title="Backups e atividade"><div className="stack">
        <button className="accent" disabled={busy||!status.backupEnabled} onClick={()=>void act(async()=>{await api.json('/admin/backups',{});notify('Backup criado no servidor.')})}>Criar backup</button>
        {status.backups.length>0&&<ul className="feed">{status.backups.map(file=><li key={file.name}><div><strong>{dateTime(file.at)}{file.automatic?' · automático':''}</strong><small>{file.name} · {Math.ceil(file.bytes/1024)} KiB</small></div></li>)}</ul>}
        <small>Os arquivos ficam no servidor. A restauração é feita pelo administrador no host.</small>
        {status.supervisor.map(service=><p key={service.name}>{service.name} · {service.restarts} reinícios{service.lastFailure?' · última falha em '+dateTime(service.lastFailure):''}</p>)}
        {status.entries.length>0&&<ul className="feed">{status.entries.map((entry,index)=><li key={index}><div><strong>{entry.action}</strong><small>{dateTime(entry.at)} · @{entry.handle} {entry.detail}</small></div></li>)}</ul>}
      </div></Panel>
    </div>
    {confirm&&<Dialog title={confirm.label} close={()=>{if(!busy)setConfirm(undefined)}}><button className="accent" disabled={busy} onClick={()=>void act(confirm.submit)}><Shield size={16}/> Confirmar</button></Dialog>}
  </>
}
