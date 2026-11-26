import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AudioLines, Bell, CalendarDays, CirclePlus, Clipboard, House, Images, LayoutGrid, Phone, Plus, Settings, Users, X } from 'lucide-react'
import { ApiError, accountServerKey, baseDefault, client, connectionMessage, describe, endpoint, migrateAccountServer } from './api'
import { AdminPanel } from './admin-panel'
import type { Call, Channel, Snapshot, Space, Thread } from './api'
import { Avatar, Conversation, Dialog, Empty, Events, Panel, Recent, SectionTitle } from './components'
import { CallAudio, CallControls, CallView } from './call'
import { initialPrefs, useCall } from './media'
import type { Prefs } from './media'
import { Friends, Home, Spaces } from './pages'
import { Brand, Form, SettingsPage, WindowButtons } from './shell'
import { createRoot } from 'react-dom/client'
import { Login } from './auth'
import { ringUntil, soundEnabled, useFeedback } from './feedback'
import { soundEngine } from './sounds'
import './style.css'

const nav = [
  { label: 'Início', icon: House }, { label: 'Espaços', icon: LayoutGrid },
  { label: 'Amigos', icon: Users }, { label: 'Chamadas', icon: Phone },
  { label: 'Atividades', icon: CalendarDays }, { label: 'Biblioteca', icon: Images },
] as const
type Page = (typeof nav)[number]['label'] | 'Ajustes' | 'Administração'

function App() {
  const [base,setBase]=useState(()=>localStorage.getItem(accountServerKey)||migrateAccountServer(localStorage.getItem('haven.backend')||baseDefault))
  const [token,setToken]=useState(()=>sessionStorage.getItem('haven.token')||'')
  const [restoring,setRestoring]=useState(Boolean(window.haven))
  const api=useMemo(()=>client(base,token),[base,token])
  const [data,setData]=useState<Snapshot>()
  const [connection,setConnection]=useState('')
  const [update,setUpdate]=useState<{version:string}|null>(null)
  const [page,setPage]=useState<Page>('Início')
  const [spaceId,setSpaceId]=useState('')
  const [thread,setThread]=useState<{thread:Thread;title:string}>()
  const [modal,setModal]=useState<{title:string;content:ReactNode}>()
  const [showNotifications,setShowNotifications]=useState(false)
  const [toast,setToast]=useState('')
  const [version,setVersion]=useState(0)
  const [conversationVersion,setConversationVersion]=useState(0)
  const [responding,setResponding]=useState('')
  const [prefs,setPrefs]=useState<Prefs>(()=>{
    try{return {...initialPrefs,...JSON.parse(localStorage.getItem('haven.preferences')||'{}')}}
    catch{return initialPrefs}
  })
  const [hud,setHud]=useState(false)
  const [library,setLibrary]=useState('')
  const [shareRequest,setShareRequest]=useState(0)
  const toastTimer=useRef<number | undefined>(undefined)
  const starting=useRef(false)
  const workspace=useRef<HTMLElement>(null)
  const media=useCall(api,prefs)
  const importantVolume=useRef(0)
  importantVolume.current=data && !media.capturingAudio && !media.hasShareAudio && soundEnabled(prefs,'important')?prefs.soundVolume:0
  const leave=useRef(media.leave)
  leave.current=media.leave
  const close=()=>{setModal(undefined);setShowNotifications(false)}
  const save=(p:Prefs)=>{localStorage.setItem('haven.preferences',JSON.stringify(p));setPrefs(p)}
  const notify=useCallback((error:unknown)=>{
    setToast(describe(error))
    if(error instanceof Error && importantVolume.current)void soundEngine.play('important',importantVolume.current)
    window.clearTimeout(toastTimer.current)
    toastTimer.current=window.setTimeout(()=>setToast(''),5500)
  },[])
  const refresh=useCallback(()=>{setVersion(v=>v+1);setConversationVersion(v=>v+1)},[])
  const invalidate=useCallback(async ()=>{
    await window.haven?.clearSession().catch(()=>notify('Não foi possível remover a sessão gravada neste PC.'))
    sessionStorage.removeItem('haven.token')
    setToken('');setData(undefined);setThread(undefined);setModal(undefined);setShowNotifications(false);setConnection('');setPage('Início')
  },[notify])
  useEffect(()=>{
    if(!window.haven)return
    void window.haven.readSession().then(async value=>{
      if(!value)return
      const savedAddress=endpoint(value.base)
      const address=localStorage.getItem(accountServerKey)===null ? migrateAccountServer(savedAddress) : savedAddress
      setBase(address);setToken(value.token)
      if(address!==savedAddress && await window.haven?.saveSession({base:address,token:value.token}).catch(()=>false)) {
        localStorage.setItem(accountServerKey,address)
      }
    }).catch(()=>{}).finally(()=>setRestoring(false))
  },[])
  useEffect(()=>{
    if(restoring||!token)return
    const controller=new AbortController()
    api.json<Snapshot>('/state',undefined,AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])).then(next=>{
      if(!controller.signal.aborted){setData(next);setConnection('')}
    }).catch(error=>{
      if(controller.signal.aborted)return
      if(error instanceof ApiError&&error.status===401){void leave.current();void invalidate()}
      else setConnection(connectionMessage(base,error))
    })
    return ()=>controller.abort()
  },[api,base,token,version,invalidate,restoring])
  useEffect(()=>{
    if(restoring||!token)return
    const controller=new AbortController()
    let retry=0
    let batch=0
    let attempts=0
    let heartbeat=0
    let lastPoll=Date.now()
    const update=()=>{window.clearTimeout(batch);batch=window.setTimeout(refresh,110)}
    const connect=()=>void api.changes(update,controller.signal,()=>{
      heartbeat=Date.now()
      if(attempts>0)update()
      attempts=0
    }).catch(()=>{}).finally(()=>{
      if(controller.signal.aborted)return
      heartbeat=0
      retry=window.setTimeout(connect,Math.min(12000,2500*2**attempts))
      attempts=Math.min(attempts+1,3)
    })
    const online=()=>{lastPoll=Date.now();refresh()}
    const offline=()=>setConnection('Sem internet. O HAVEN vai tentar novamente.')
    connect()
    const timer=window.setInterval(()=>{
      const now=Date.now()
      const streaming=heartbeat>now-26000
      if(streaming && now-lastPoll<23000)return
      lastPoll=now
      if(streaming)setVersion(v=>v+1)
      else refresh()
    },12000)
    window.addEventListener('online',online)
    window.addEventListener('offline',offline)
    return ()=>{
      controller.abort();window.clearTimeout(retry);window.clearTimeout(batch);window.clearInterval(timer)
      window.removeEventListener('online',online);window.removeEventListener('offline',offline)
    }
  },[api,token,refresh,restoring])
  const checkUpdate=useCallback(async ()=>{
    const next=await window.haven?.checkUpdate(base)
    setUpdate(next??null)
    return next
  },[base])
  useEffect(()=>{
    if(!token||restoring)return
    const check=()=>void checkUpdate().catch(()=>{})
    check()
    const timer=window.setInterval(check,6*60*60_000)
    return ()=>window.clearInterval(timer)
  },[checkUpdate,restoring,token])
  const invites=data?.calls.filter(call=>call.state==='invited' && ringUntil(call)>Date.now())??[]
  const incoming=invites.find(call=>call.id!==responding)
  const waiting=media.participants.length<=1 ? data?.calls.find(call=>call.id===media.active?.id && (call.pending??0)>0 && ringUntil(call)>Date.now()) : undefined
  useFeedback(data,media,prefs,connection,incoming,waiting)
  const deadline=Math.min(...[...invites,...(waiting?[waiting]:[])].map(ringUntil))
  useEffect(()=>{
    if(!Number.isFinite(deadline))return
    const timer=window.setTimeout(refresh,Math.max(0,deadline-Date.now())+10)
    return ()=>window.clearTimeout(timer)
  },[deadline,refresh])
  useEffect(()=>{workspace.current?.scrollTo(0,0)},[page])
  useEffect(()=>{
    if(!token||hud)return
    const options=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey) && !event.altKey && event.key===','){
        event.preventDefault()
        setThread(undefined)
        setPage('Ajustes')
      }
    }
    window.addEventListener('keydown',options)
    return ()=>window.removeEventListener('keydown',options)
  },[token,hud])
  const hasActive=Boolean(media.active)
  useEffect(()=>{
    if(!hasActive&&hud){setHud(false);void window.haven?.window('restore').catch(notify)}
  },[hasActive,hud,notify])
  const signOut=async()=>{
    await media.leave().catch(()=>{})
    await api.json('/logout',{},AbortSignal.timeout(2500)).catch(()=>{})
    await invalidate()
  }
  async function changeServer(value:string) {
    const address=endpoint(value)
    if(address===base)return
    const health=await client(address).json<{ok?:boolean}>('/health',undefined,AbortSignal.timeout(6000))
    if(health.ok!==true)throw new Error('O endereço não respondeu como servidor do HAVEN.')
    await signOut()
    localStorage.setItem(accountServerKey,address)
    setBase(address)
    setUpdate(null)
  }
  if(restoring)return <div className="waiting"><main role="status">Restaurando sua sessão…</main></div>
  if(!token)return <Login base={base} authorized={async (address,next,created,remember,remembered)=>{
    if(created)notify('Conta criada. Boas-vindas ao HAVEN!')
    if(window.haven) {
      if(remember) {
        const saved=await window.haven.saveSession({base:address,token:next}).catch(()=>false)
        if(!saved)notify('A sessão ficará ativa até fechar o HAVEN.')
        else if(!remembered)notify('Este servidor ainda usa sessões com prazo de validade.')
      } else {
        await window.haven.clearSession().catch(()=>{throw new Error('Não foi possível limpar a sessão salva neste PC.')})
      }
    }
    localStorage.setItem(accountServerKey,address);setBase(address);setToken(next);refresh()
  }}/>
  if(!data)return <div className="waiting"><header className="topbar"><Brand/><WindowButtons/></header><main><h1>{connection||'Conectando ao HAVEN…'}</h1>
    {connection&&<div className="inline"><button className="accent" onClick={refresh}>Tentar novamente</button><button className="quiet" onClick={invalidate}>Voltar ao login</button></div>}
  </main></div>

  const space=data.spaces.find(s=>s.id===spaceId)
  const accepted=data.friends.filter(f=>f.accepted)
  const pendingFriends=data.friends.filter(f=>!f.accepted&&f.sender!==data.me.id).length
  const outgoingPending=Boolean(waiting)
  const navigate=(next:Page)=>{setThread(undefined);setPage(next);if(next==='Espaços')setSpaceId('')}
  const openSpace=(id:string)=>{navigate('Espaços');setSpaceId(id)}
  const openThread=(t:Thread,title:string)=>setThread({thread:t,title})
  const form=(title:string,label:string,children:ReactNode,submit:(f:FormData)=>Promise<void>)=>setModal({title,content:
    <Form label={label} submit={async f=>{await submit(f);close();refresh()}}>{children}</Form>})
  async function act(fn:()=>unknown){try{await fn();refresh()}catch(error){notify(error)}}
  async function enter(make:()=>Promise<{id:string}>,title:string,share=false){
    if(starting.current)return
    starting.current=true
    try{
      const result=await make()
      close();navigate('Chamadas')
      await media.join(result.id,title)
      if(share)setShareRequest(x=>x+1)
      refresh()
    }finally{starting.current=false}
  }
  const start=(body:unknown,title:string,share=false)=>void act(()=>enter(()=>api.json('/calls',body),title,share))
  const voice=(r:Channel)=>start({room:r.id},r.name)
  const respond=(c:Call,ok:boolean)=>{
    if(ok&&starting.current)return
    setResponding(c.id)
    soundEngine.stop('incomingCall')
    void act(async()=>{
      try {
        const send=()=>api.json('/calls/'+c.id+'/respond',{state:ok?'joined':'declined'})
        if(ok)await enter(async()=>{await send();return {id:c.id}},'Chamada com '+c.name)
        else{await send();close()}
      } catch(error){setResponding('');throw error}
    })
  }
  const createSpace=()=>form('Criar espaço','Criar',<><label>Nome<input name="name" required maxLength={48}/></label><label>Descrição<input name="description" maxLength={240}/></label></>,async f=>{
    const {id}=await api.json<{id:string}>('/spaces',Object.fromEntries(f));openSpace(id)
  })
  const joinSpace=()=>form('Entrar em um espaço','Entrar',<label>Código de convite<input name="code" maxLength={43} required/></label>,async f=>{
    const {id}=await api.json<{id:string}>('/spaces/join',{code:f.get('code')});openSpace(id)
  })
  const joinCall=()=>form('Entrar com código','Entrar',<label>Código da chamada<input name="code" required maxLength={16}/></label>,
    f=>enter(()=>api.json('/calls/join',{code:f.get('code')}),'Chamada privada'))
  const group=()=>form('Chamada em grupo','Iniciar chamada',<fieldset><legend>Amigos</legend>{accepted.length?accepted.map(f=><label key={f.id} className="check"><input type="checkbox" name="users" value={f.id}/>{f.name}</label>):<Empty>Adicione amigos para enviar convites.</Empty>}</fieldset>,async f=>{
    const users=f.getAll('users')
    if(!users.length)throw new Error('Selecione pelo menos um amigo.')
    await enter(()=>api.json('/calls',{users}),'Chamada em grupo')
  })
  const addFriend=()=>form('Adicionar amigo','Enviar pedido',<label>Nome de usuário<input name="handle" placeholder="Ex.: lua_silva" autoFocus required minLength={3} maxLength={24} spellCheck={false}/></label>,async f=>{await api.json('/friends/request',{handle:f.get('handle')});notify('Pedido enviado.')})
  const removeFriend=(id:string,name:string)=>form('Remover amigo','Remover',<p>Remover {name} da sua lista de amigos?</p>,async()=>{
    await api.json('/friends/'+id+'/remove',{})
    notify('Amigo removido.')
  })
  const editSpace=(s:Space)=>form('Editar espaço','Salvar',<>
    <label>Nome<input name="name" defaultValue={s.name} required maxLength={48}/></label><label>Descrição<input name="description" defaultValue={s.description} maxLength={240}/></label>
    <label>Banner<select name="theme" defaultValue={s.theme}><option value="serra">Serra</option><option value="noite">Noite</option><option value="bruma">Bruma</option></select></label>
  </>,async f=>{await api.json('/spaces/'+s.id+'/edit',Object.fromEntries(f))})
  const inviteSpace=(s:Space)=>void act(async()=>{
    const {code}=await api.json<{code:string}>('/spaces/'+s.id+'/invite',{})
    setModal({title:'Convite de '+s.name,content:<div className="stack"><p>Válido por dois dias e para um uso.</p><input aria-label="Código do convite" value={code} readOnly/>
      <button className="accent" onClick={()=>void navigator.clipboard.writeText(code).then(()=>notify('Convite copiado.')).catch(notify)}><Clipboard size={16}/> Copiar</button></div>})
  })
  const editRoom=(s:Space,r?:Channel)=>form(r?'Editar sala':'Criar sala','Salvar',<><label>Nome<input name="name" maxLength={48} required defaultValue={r?.name}/></label>
    {!r&&<label>Tipo<select name="kind"><option value="voice">Voz</option><option value="text">Texto</option></select></label>}</>,async f=>{await api.json('/spaces/'+s.id+'/rooms',{...Object.fromEntries(f),id:r?.id})})
  const eventForm=(s?:Space)=>form('Agendar encontro','Agendar',<>
    {!s&&<label>Espaço<select name="space" required>{data.spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    <label>Título<input name="title" required maxLength={96}/></label><label>Data e hora<input name="starts" required type="datetime-local"/></label>
  </>,async f=>{await api.json('/spaces/'+(s?.id||f.get('space'))+'/events',{title:f.get('title'),starts:new Date(String(f.get('starts'))).getTime()})})
  const toggleHud=()=>void window.haven?.window(hud?'restore':'hud').then(()=>setHud(!hud)).catch(notify)
  const pendingCalls=()=>invites.length?<ul className="feed">{invites.map(c=><li key={c.id}><span className="glyph"><Phone size={17}/></span><div><strong>{c.name}</strong><small>Convite de chamada</small></div>
    <div className="inline"><button className="accent" disabled={responding===c.id||media.busy} onClick={()=>respond(c,true)}>Aceitar</button><button className="quiet" disabled={responding===c.id} onClick={()=>respond(c,false)}>Recusar</button></div></li>)}</ul>:<Empty>Nenhum convite de chamada.</Empty>
  const content=()=>{
    switch(page){
      case 'Início': return <Home data={data} open={openThread} onVoice={voice} call={()=>media.active ? navigate('Chamadas') : start({},'Chamada rápida')}
        join={joinCall} goFriends={()=>navigate('Amigos')} goSpaces={()=>data.spaces.length ? navigate('Espaços') : joinSpace()} active={hasActive} busy={media.busy}/>
      case 'Espaços': return <Spaces data={data} space={space} api={api} version={conversationVersion} notify={notify} open={openThread} openSpace={openSpace} onVoice={voice} edit={editSpace} invite={inviteSpace} create={createSpace} join={joinSpace} editRoom={editRoom} event={eventForm}
        activeRoom={data.calls.find(c=>c.id===media.active?.id)?.room||undefined} role={(s,user,role)=>void act(()=>api.json('/spaces/'+s.id+'/role',{user,role}))}/>
      case 'Amigos': return <Friends data={data} add={addFriend} open={openThread} call={(id,name)=>start({users:[id]},'Chamada com '+name)} respond={(id,accept)=>void act(()=>api.json('/friends/'+id+'/respond',{accept}))} remove={removeFriend}/>
      case 'Chamadas': return media.active ? null :
        <><div className="heading"><SectionTitle>Chamadas</SectionTitle><div className="inline wrap"><button className="quiet" onClick={joinCall}>Entrar com código</button><button className="quiet" disabled={media.busy} onClick={()=>start({},'Compartilhamento de tela',true)}>Compartilhar tela</button><button className="quiet" onClick={group}><Users size={17}/> Chamada em grupo</button><button className="accent" onClick={()=>start({},'Chamada privada')} disabled={media.busy}><Phone size={17}/> Chamada privada</button></div></div>
        {media.busy&&<p role="status">Conectando à chamada…</p>}<Panel title="Convites de chamada">{pendingCalls()}</Panel></>
      case 'Atividades': return <><div className="heading"><SectionTitle>Atividades</SectionTitle>{data.spaces.length>0&&<button className="accent" onClick={()=>eventForm()}><Plus size={17}/> Agendar encontro</button>}</div>
        <div className="dashboard"><Panel title="Agenda"><Events events={data.events} spaces={data.spaces}/></Panel><Panel title="Atividade recente"><Recent items={data.latest} open={openThread}/></Panel></div></>
      case 'Biblioteca': {
        const target=data.spaces.find(s=>s.id===library)||data.spaces[0]
        return <><div className="heading"><SectionTitle>Biblioteca</SectionTitle>{target&&<select aria-label="Espaço" value={target.id} onChange={e=>setLibrary(e.target.value)}>{data.spaces.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select>}</div>
          <Panel title={target?'Mídias de '+target.name:'Mídias compartilhadas'}>{target?<Conversation key={target.id} api={api} thread={{kind:'wall',target:target.id}} signal={conversationVersion} notify={notify} me={data.me.id} wall/>:<Empty>Entre em um espaço para acessar seu mural.</Empty>}</Panel></>
      }
      case 'Ajustes': return <SettingsPage state={data} prefs={prefs} save={save} api={api} base={base} notify={notify} signOut={signOut} refresh={refresh}
        changeServer={changeServer} openAdmin={()=>navigate('Administração')} update={update} checkUpdate={checkUpdate} changeDevice={media.changeDevice} suppressSounds={media.capturingAudio||media.hasShareAudio}/>
      case 'Administração': return data.admin?<AdminPanel api={api} me={data.me.id} notify={notify}/>:<Empty>Administração restrita.</Empty>
    }
  }
  const callVisible=!hud && page==='Chamadas' && !thread
  return <div className={'shell '+prefs.theme+(hud?' hud':'')}>
    <header className="topbar">
      <button className="wordmark" onClick={()=>navigate('Início')} aria-label="HAVEN, início"><Brand/></button>
      {!hud&&<nav aria-label="Navegação principal">{nav.map(({label,icon:Icon})=><button key={label} className={page===label?'current':''} aria-current={page===label?'page':undefined} onClick={()=>navigate(label)}><Icon size={17} aria-hidden="true"/>{label}</button>)}</nav>}
      <div className="top-right">{!hud&&<button className="icon notifications" aria-label="Notificações" onClick={()=>setShowNotifications(true)}><Bell size={19}/>{invites.length+pendingFriends>0&&<i>{invites.length+pendingFriends}</i>}</button>}<WindowButtons/></div>
    </header>
    {!hud&&<aside className="rail" aria-label="Espaços e ajustes">
      <button className={'rail-button '+(page==='Espaços'&&!spaceId?'selected':'')} title="Todos os espaços" aria-label="Todos os espaços" onClick={()=>navigate('Espaços')}><LayoutGrid size={20}/></button>{data.spaces.length>0&&<hr/>}
      <div className="rail-spaces">{data.spaces.map(s=><button key={s.id} className={'rail-button space-icon '+(spaceId===s.id&&page==='Espaços'?'selected':'')} title={s.name} aria-label={s.name} onClick={()=>openSpace(s.id)}>{s.name.slice(0,2).toUpperCase()}</button>)}</div>
      <button className="rail-button" title="Criar espaço" aria-label="Criar espaço" onClick={createSpace}><CirclePlus size={21}/></button>
      <div className="rail-end"><button className="profile profile-settings" title="Perfil e ajustes (Ctrl+,)" aria-label="Perfil e ajustes" aria-keyshortcuts="Control+," onClick={()=>navigate('Ajustes')}><Avatar p={data.me}/><Settings size={13}/></button></div>
    </aside>}
    <main className="workspace" hidden={hud} ref={workspace}>
      {connection&&<p className="notice" role="status">{connection} <button className="quiet" onClick={refresh}>Reconectar</button></p>}
      {incoming && !showNotifications && <div className="notice call-invitation" role="status">
        <span><Phone size={16}/> <strong>{incoming.name}</strong> está ligando</span>
        <div className="inline"><button className="accent" disabled={media.busy} onClick={()=>respond(incoming,true)}>Aceitar</button><button className="quiet" onClick={()=>respond(incoming,false)}>Recusar</button></div>
      </div>}
      {media.active&&<div hidden={!callVisible}><CallView key={media.active.id} api={api} media={media} prefs={prefs} save={save} notify={notify} me={data.me.id} version={conversationVersion} visible={callVisible} legacyMessageSound={data.latestCallMessage===undefined}/></div>}
      {!hud&&<div className="page-content" key={page}>{thread?<><div className="heading"><SectionTitle>{thread.title}</SectionTitle><button className="quiet" onClick={()=>setThread(undefined)}>Voltar</button></div>
        <Panel title="Conversa"><Conversation key={thread.thread.kind+thread.thread.target} api={api} thread={thread.thread} signal={conversationVersion} me={data.me.id} notify={notify}/></Panel></>:content()}</div>}
    </main>
    {hud&&<main className="hud-info"><AudioLines size={20}/><strong>{media.active?.title}</strong></main>}
    {media.active&&<CallControls media={media} prefs={prefs} notify={notify} open={()=>navigate('Chamadas')} toggleHud={toggleHud} hud={hud} shareRequest={shareRequest} onShareOpened={()=>setShareRequest(0)} pending={outgoingPending}/>}
    <CallAudio media={media} prefs={prefs}/>
    {modal&&<Dialog title={modal.title} close={close}>{modal.content}</Dialog>}
    {showNotifications&&<Dialog title="Notificações" close={close}><div className="stack">{pendingCalls()}{pendingFriends>0&&<button className="quiet" onClick={()=>{close();navigate('Amigos')}}>Ver pedidos de amizade</button>}</div></Dialog>}
    {toast&&<div className="toast" role="status">{toast}<button className="icon" aria-label="Dispensar aviso" onClick={()=>setToast('')}><X size={16}/></button></div>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App/>)
