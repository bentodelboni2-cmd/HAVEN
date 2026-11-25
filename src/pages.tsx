import { ArrowLeft, ArrowRight, ChevronDown, Hash, LayoutGrid, MessageSquare, Users, Phone, Plus, Radio, Settings, Volume2 } from 'lucide-react'
import type { Api, Channel, Snapshot, Space, Thread } from './api'
import { online } from './api'
import { Avatar, Conversation, Empty, Events, Panel, Recent, SectionTitle } from './components'

const roles = {owner:'Proprietário',admin:'Administrador',member:'Membro'}
type Open = (thread:Thread,title:string)=>void
type Voice = (room:Channel)=>void

function VoiceActivity({data,onVoice,space}:{data:Snapshot;onVoice:Voice;space?:Space}){
  const list=data.occupancy.flatMap(o=>{
    const channel=data.rooms.find(r=>r.id===o.room)
    return channel&&(!space||space.id===channel.space)?[{...o,channel}]:[]
  })
  return list.length ? list.map(o=><button className="feed-button" key={o.room} onClick={()=>onVoice(o.channel)}><span className="glyph"><Radio size={17}/></span><div><strong>{o.channel.name}</strong><small>{o.total} {o.total===1?'participante':'participantes'}{o.screens.length>0?' · '+o.screens.join(', ')+' compartilhando':''}</small></div><ArrowRight size={16}/></button>) : <Empty>Nenhuma sala de voz em atividade.</Empty>
}
type HomeProps = {
  data: Snapshot; open: Open; onVoice: Voice
  call: () => void; join: () => void; goFriends: () => void; goSpaces: () => void
  active: boolean; busy: boolean
}

export function Home({ data, open, onVoice, call, join, goFriends, goSpaces, active, busy }: HomeProps) {
  const onlineCount = data.friends.filter(friend => friend.accepted && online(friend)).length
  const upcoming = data.events.filter(event => event.starts > Date.now()).slice(0, 2)
  const hasUpdates = data.latest.length > 0 || upcoming.length > 0
  return <div className="home">
    <section className="home-landscape" aria-labelledby="greeting">
      <div className="home-welcome">
        <h1 id="greeting">Olá, {data.me.name}.</h1>
        <div className="home-call-actions">
          <button className="accent" disabled={busy} onClick={call}><Phone size={17}/>{active ? 'Voltar à chamada' : 'Iniciar chamada'}</button>
          <button className="home-join" disabled={busy} onClick={join}><Hash size={17}/>Entrar com código</button>
        </div>
      </div>
    </section>
    <div className="home-destinations">
      <button className="destination" onClick={goFriends}>
        <span className="destination-icon lavender"><Users size={23}/></span>
        <span><strong>Ver amigos</strong>{onlineCount > 0 && <small>{onlineCount} online agora</small>}</span><ArrowRight size={18}/>
      </button>
      <button className="destination" onClick={goSpaces}>
        <span className="destination-icon"><LayoutGrid size={22}/></span>
        <span><strong>{data.spaces.length ? 'Meus espaços' : 'Entrar em um espaço'}</strong>{!data.spaces.length && <small>Com um convite do grupo</small>}</span><ArrowRight size={18}/>
      </button>
    </div>
    {data.occupancy.length > 0 && <Panel title="Salas em atividade"><VoiceActivity data={data} onVoice={onVoice}/></Panel>}
    {hasUpdates && <details className="home-updates"><summary>Recentes e agenda<ChevronDown size={16}/></summary>
      <div className="home-feed">
        {data.latest.length > 0 && <Panel title="Mensagens recentes"><Recent items={data.latest.slice(0, 3)} open={open}/></Panel>}
        {upcoming.length > 0 && <Panel title="Próximos encontros"><Events events={upcoming} spaces={data.spaces}/></Panel>}
      </div>
    </details>}
  </div>
}
export function Spaces({data,space,api,version,notify,open,openSpace,onVoice,edit,invite,create,join,editRoom,event,role,activeRoom}:{
  data:Snapshot;space?:Space;api:Api;version:number;notify:(e:unknown)=>void;open:Open;openSpace:(id:string)=>void;onVoice:Voice
  edit:(s:Space)=>void;invite:(s:Space)=>void;create:()=>void;join:()=>void;editRoom:(s:Space,r?:Channel)=>void;event:(s:Space)=>void;role:(s:Space,user:string,role:string)=>void;activeRoom?:string
}){
  if(!space) {
    const actions=<div className="inline wrap"><button className="accent" onClick={join}>Entrar com convite</button><button className="quiet" onClick={create}><Plus size={16}/> Criar espaço</button></div>
    return <><div className="heading"><SectionTitle>Espaços</SectionTitle>{data.spaces.length>0&&actions}</div>
      {data.spaces.length ? <div className="space-list">{data.spaces.map(s=><button key={s.id} className={'hero space-entry '+s.theme} onClick={()=>openSpace(s.id)}><h2>{s.name}</h2><p>{s.description||roles[s.role]}</p><ArrowRight size={20}/></button>)}</div> :
      <section className="collection-empty"><LayoutGrid size={27}/><h2>Seu primeiro espaço</h2><p>Entre com o convite do seu grupo ou crie um espaço para reunir os amigos.</p>{actions}</section>}
    </>
  }
  const canEdit=space.role!=='member'
  const rooms=data.rooms.filter(room=>room.space===space.id)
  const members=data.members.filter(m=>m.space===space.id)
  return <><div className="heading"><button className="quiet" onClick={()=>openSpace('')}><ArrowLeft size={16}/> Todos os espaços</button>{canEdit&&<div className="inline"><button className="quiet" onClick={()=>edit(space)}><Settings size={16}/> Editar</button><button className="quiet" onClick={()=>invite(space)}><Plus size={17}/> Convidar</button></div>}</div>
    <div className="dashboard"><div className="column">
      <section className={'hero '+space.theme}><div><h1>{space.name}</h1>{space.description&&<p>{space.description}</p>}<small>{members.length} {members.length===1?'membro':'membros'} · {roles[space.role]}</small></div></section>
      <Panel title="Salas" action={canEdit&&<button className="quiet" onClick={()=>editRoom(space)}><Plus size={16}/> Nova sala</button>}>
        <div className="room-grid">{rooms.map(r=><div className={'room-card '+(activeRoom===r.id?'selected':'')} key={r.id}>
          <button className="feed-button" onClick={()=>r.kind==='voice'?onVoice(r):open({kind:'room',target:r.id},r.name)}><span className="glyph">{r.kind==='voice'?<Volume2 size={18}/>:<Hash size={18}/>}</span><div><strong>{r.name}</strong><small>{r.kind==='voice'?(data.occupancy.find(o=>o.room===r.id)?.total||0)+' na sala':(data.unread[r.id]||0)+' não lidas'}</small></div></button>
          {canEdit&&<button className="icon" aria-label={'Editar '+r.name} onClick={()=>editRoom(space,r)}><Settings size={16}/></button>}
        </div>)}</div>
      </Panel>
      <div className="space-bottom">
        <Panel title="Ao vivo"><VoiceActivity data={data} onVoice={onVoice} space={space}/></Panel>
        <Panel title="Mural"><Conversation key={space.id} api={api} thread={{kind:'wall',target:space.id}} signal={version} notify={notify} me={data.me.id} wall/></Panel>
      </div>
    </div><aside className="column">
      <Panel title="Membros"><ul className="feed">{members.map(m=><li key={m.id}><Avatar p={m} presence/><div><strong>{m.name}</strong><small>{roles[m.role]}</small></div>
        {space.role==='owner'&&m.role!=='owner'&&<select aria-label={'Cargo de '+m.name} value={m.role} onChange={e=>role(space,m.id,e.target.value)}><option value="member">Membro</option><option value="admin">Admin</option></select>}</li>)}</ul></Panel>
      <Panel title="Agenda" action={<button className="icon" aria-label="Agendar encontro" onClick={()=>event(space)}><Plus size={19}/></button>}><Events events={data.events.filter(e=>e.space===space.id)} spaces={data.spaces}/></Panel>
      <Panel title="Atividade recente"><Recent items={data.latest.filter(r=>rooms.some(c=>c.id===r.target))} open={open}/></Panel>
    </aside></div></>
}
export function Friends({data,add,open,call,respond}:{data:Snapshot;add:()=>void;open:Open;call:(id:string,name:string)=>void;respond:(id:string,accept:boolean)=>void}){
  if(!data.friends.length)return <><SectionTitle>Amigos</SectionTitle><section className="collection-empty">
    <Users size={27}/><h2>Encontre seu primeiro amigo</h2><p>Adicione alguém pelo nome de usuário para conversar ou ligar.</p>
    <button className="accent" onClick={add}><Plus size={16}/> Adicionar amigo</button>
  </section></>
  return <><div className="heading"><SectionTitle>Amigos</SectionTitle><button className="accent" onClick={add}><Plus size={17}/> Adicionar amigo</button></div>
    <Panel title="Seus amigos"><ul className="feed friends">{data.friends.map(f=><li key={f.id}><Avatar p={f} presence/><div><strong>{f.name}</strong><small>@{f.handle} · {f.accepted?(online(f)?'Online':'Offline'):f.sender===data.me.id?'Pedido enviado':'Pedido recebido'}</small></div>
      {f.accepted?<div className="inline"><button className="quiet" onClick={()=>open({kind:'dm',target:f.id},f.name)}><MessageSquare size={17}/> Mensagem {data.unread[f.id]||''}</button><button className="quiet" onClick={()=>call(f.id,f.name)}><Phone size={17}/> Ligar</button></div>:
        f.sender!==data.me.id&&<div className="inline">{[true,false].map(accept=><button key={String(accept)} className={accept?'accent':'quiet'} onClick={()=>respond(f.id,accept)}>{accept?'Aceitar':'Recusar'}</button>)}</div>}
    </li>)}</ul></Panel></>
}
