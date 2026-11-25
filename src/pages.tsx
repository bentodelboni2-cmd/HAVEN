import { ArrowRight, Gamepad2, Hash, MessageSquare, Monitor, Phone, Plus, Radio, Settings, Volume2 } from 'lucide-react'
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
export function Home({data,open,onVoice,quick,share,join,group,goFriends,busy}:{data:Snapshot;open:Open;onVoice:Voice;quick:()=>void;share:()=>void;join:()=>void;group:()=>void;goFriends:()=>void;busy:boolean}){
  const friends=data.friends.filter(f=>f.accepted&&online(f))
  return <><SectionTitle>Início</SectionTitle><div className="dashboard">
    <div className="column">
      <section className="hero"><div><h2>Boas-vindas, {data.me.name}.</h2><p>Seu espaço para conversar, jogar e compartilhar.</p></div></section>
      <div className="quick-grid">
        <button onClick={quick} disabled={busy}><span className="glyph"><Phone size={20}/></span><div><strong>Chamada rápida</strong><small>Crie uma chamada privada</small></div></button>
        <button onClick={share} disabled={busy}><span className="glyph lavanda"><Monitor size={20}/></span><div><strong>Compartilhar tela</strong><small>Mostre uma tela ou janela</small></div></button>
        <button onClick={join}><span className="glyph azul"><Hash size={20}/></span><div><strong>Entrar com código</strong><small>Entre em uma chamada</small></div></button>
      </div>
      <Panel title="Ao vivo agora"><VoiceActivity data={data} onVoice={onVoice}/></Panel>
      <Panel title="Amigos online" action={<button className="quiet" onClick={goFriends}>Ver amigos <ArrowRight size={15}/></button>}>{friends.length?<div className="people">{friends.map(p=><button className="quiet person-chip" key={p.id} onClick={()=>open({kind:'dm',target:p.id},p.name)}><Avatar p={p} presence/>{p.name}</button>)}</div>:<Empty>Nenhum amigo online agora.</Empty>}</Panel>
      <section className="hero game-hero"><div><h2><Gamepad2 size={23}/> Sessão de jogos</h2><button className="quiet" onClick={group}>Convidar amigos <ArrowRight size={15}/></button></div></section>
    </div>
    <aside className="column"><Panel title="Mensagens recentes"><Recent items={data.latest} open={open}/></Panel><Panel title="Próximos encontros"><Events events={data.events} spaces={data.spaces}/></Panel></aside>
  </div></>
}
export function Spaces({data,space,api,version,notify,open,openSpace,onVoice,edit,invite,create,join,editRoom,event,role,activeRoom}:{
  data:Snapshot;space?:Space;api:Api;version:number;notify:(e:unknown)=>void;open:Open;openSpace:(id:string)=>void;onVoice:Voice
  edit:(s:Space)=>void;invite:(s:Space)=>void;create:()=>void;join:()=>void;editRoom:(s:Space,r?:Channel)=>void;event:(s:Space)=>void;role:(s:Space,user:string,role:string)=>void;activeRoom?:string
}){
  if(!space)return <><div className="heading"><SectionTitle>Espaços</SectionTitle><div className="inline"><button className="quiet" onClick={join}>Entrar com convite</button><button className="accent" onClick={create}><Plus size={17}/> Criar espaço</button></div></div>
    {data.spaces.length?<div className="space-list">{data.spaces.map(s=><button key={s.id} className={'hero space-entry '+s.theme} onClick={()=>openSpace(s.id)}><h2>{s.name}</h2><p>{s.description||roles[s.role]}</p><ArrowRight size={20}/></button>)}</div>:<Panel title="Seus espaços"><Empty>Crie um espaço para seu grupo ou entre com um convite.</Empty></Panel>}</>
  const canEdit=space.role!=='member'
  const rooms=data.rooms.filter(room=>room.space===space.id)
  const members=data.members.filter(m=>m.space===space.id)
  return <><div className="heading"><SectionTitle>{space.name}</SectionTitle>{canEdit&&<div className="inline"><button className="quiet" onClick={()=>edit(space)}><Settings size={16}/> Editar</button><button className="quiet" onClick={()=>invite(space)}><Plus size={17}/> Convidar</button></div>}</div>
    <div className="dashboard"><div className="column">
      <section className={'hero '+space.theme}><div><h2>{space.name}</h2>{space.description&&<p>{space.description}</p>}<small>{members.length} {members.length===1?'membro':'membros'} · {roles[space.role]}</small></div></section>
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
  return <><div className="heading"><SectionTitle>Amigos</SectionTitle><button className="accent" onClick={add}><Plus size={17}/> Adicionar amigo</button></div>
    <Panel title="Seus amigos">{data.friends.length?<ul className="feed friends">{data.friends.map(f=><li key={f.id}><Avatar p={f} presence/><div><strong>{f.name}</strong><small>@{f.handle} · {f.accepted?(online(f)?'Online':'Offline'):f.sender===data.me.id?'Pedido enviado':'Pedido recebido'}</small></div>
      {f.accepted?<div className="inline"><button className="quiet" onClick={()=>open({kind:'dm',target:f.id},f.name)}><MessageSquare size={17}/> Mensagem {data.unread[f.id]||''}</button><button className="quiet" onClick={()=>call(f.id,f.name)}><Phone size={17}/> Ligar</button></div>:
        f.sender!==data.me.id&&<div className="inline">{[true,false].map(accept=><button key={String(accept)} className={accept?'accent':'quiet'} onClick={()=>respond(f.id,accept)}>{accept?'Aceitar':'Recusar'}</button>)}</div>}
    </li>)}</ul>:<Empty>Adicione alguém pelo nome de usuário.</Empty>}</Panel></>
}
