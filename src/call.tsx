import { useEffect, useRef, useState } from 'react'
import { ConnectionState, Track } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { AudioLines, Camera, CameraOff, ChevronsUp, Clipboard, Headphones, HeadphoneOff, Maximize, MessageSquare, Mic, MicOff, Monitor, MonitorOff, PhoneOff, Signal } from 'lucide-react'
import { describe } from './api'
import type { Api, CaptureSource } from './api'
import { Avatar, Conversation, Dialog, Empty, SectionTitle } from './components'
import { profiles, useStats } from './media'
import type { Media, Prefs, Quality } from './media'

function Player({track,kind,muted=false,volume=100,output='',fit=false}:{track:Track;kind:'audio'|'video';muted?:boolean;volume?:number;output?:string;fit?:boolean}) {
  const node=useRef<HTMLMediaElement|null>(null)
  useEffect(()=>{
    const el=node.current
    if(!el)return
    track.attach(el)
    if(kind==='video')el.muted=true
    return ()=>{track.detach(el)}
  },[track,kind])
  useEffect(()=>{
    if(node.current&&kind==='audio') {
      node.current.muted=muted
      node.current.volume=volume/100
      if(node.current.setSinkId)void node.current.setSinkId(output).catch(()=>{})
    }
  },[track,kind,muted,volume,output])
  return kind==='audio' ? <audio ref={el=>{node.current=el}} autoPlay/> :
    <video ref={el=>{node.current=el}} className={fit?'fit':undefined} autoPlay playsInline muted/>
}

export function CallAudio({media,prefs}:{media:Media;prefs:Prefs}) {
  return <>{media.participants.filter(p=>p!==media.mine).flatMap(p=>[Track.Source.Microphone,Track.Source.ScreenShareAudio].map(source=>{
    const pub=p.getTrackPublication(source)
    return pub?.track ? <Player key={pub.trackSid} kind="audio" track={pub.track} muted={media.deaf||pub.isMuted} volume={media.sessionVolumes[p.identity]??100} output={prefs.output}/> : null
  }))}</>
}

function ParticipantCard({person,mine,volume,setVolume}:{person:Participant;mine:boolean;volume:number;setVolume:(n:number)=>void}) {
  const name=person.name || 'Participante'
  const video=person.getTrackPublication(Track.Source.Camera)
  return <article className={'participant '+(person.isSpeaking?'speaking':'')}>
    <div className="participant-preview">{video?.track&&!video.isMuted ? <Player track={video.track} kind="video"/> : <Avatar p={{name,color:mine?'verde':'lavanda'}}/>}</div>
    <div className="participant-label"><strong>{mine?'Você':name}</strong>{person.isSpeaking?<AudioLines size={15} className="green"/>:person.isMicrophoneEnabled?<Mic size={14}/>:<MicOff size={14}/>}</div>
    {!mine&&<input type="range" min={0} max={100} value={volume} aria-label={'Volume de '+name} onChange={e=>setVolume(+e.target.value)}/>}
  </article>
}

export function CallView({api,media,prefs,save,notify,me,version}:{api:Api;media:Media;prefs:Prefs;save:(p:Prefs)=>void;notify:(e:unknown)=>void;me:string;version:number}) {
  const [chat,setChat]=useState(true)
  const [selected,setSelected]=useState('')
  const surface=useRef<HTMLElement>(null)
  const current=media.active
  const focused=media.shares.find(s=>s.person.identity===selected)||media.shares[0]
  const stats=useStats(focused?.publication.track)
  if(!current)return null
  const state=current.room.state
  return <div className="call-view">
    <div className="call-heading"><SectionTitle>{current.title}</SectionTitle><div className="inline">
      <span className={'status '+(state===ConnectionState.Connected?'green':'')}><Signal size={17}/>{state===ConnectionState.Connected?'Conectado':state===ConnectionState.Disconnected?'Desconectado':'Reconectando'}</span>
      {current.code&&<button className="quiet" onClick={()=>void navigator.clipboard.writeText(current.code!).then(()=>notify('Código copiado.')).catch(notify)}><Clipboard size={16}/> Copiar código</button>}
      <button className="icon" title={chat?'Ocultar conversa':'Mostrar conversa'} aria-label={chat?'Ocultar conversa':'Mostrar conversa'} aria-pressed={chat} onClick={()=>setChat(v=>!v)}><MessageSquare size={19}/></button>
    </div></div>
    <div className={'call-layout '+(chat?'':'no-chat')}>
      <div className="call-media">
        <section className="stage" ref={surface}>
          {focused?.publication.track ? <>
            <Player track={focused.publication.track} kind="video" fit/>
            <div className="stage-meta"><div><strong>{focused.person.name || 'Participante'}</strong><small>{stats || 'Aguardando métricas WebRTC'}{focused.person===media.mine&&media.requestedShare?' · solicitado '+media.requestedShare:''}</small></div>
              <button className="icon" aria-label="Tela cheia" title="Tela cheia" onClick={()=>void (document.fullscreenElement?document.exitFullscreen():surface.current?.requestFullscreen())?.catch(notify)}><Maximize size={17}/></button>
            </div>
          </> : <div className="stage-idle"><Monitor size={34}/><strong>Nenhuma tela compartilhada</strong><p>Use os controles de chamada para apresentar sua tela.</p></div>}
        </section>
        <div className="participant-list">{media.participants.map(p=><ParticipantCard key={p.identity} person={p} mine={p===media.mine} volume={media.sessionVolumes[p.identity]??100} setVolume={n=>media.updateVolume(p.identity,n)}/>)}</div>
        {media.shares.length>1&&<div className="share-tabs">{media.shares.map(s=><button key={s.person.identity} className={focused?.person===s.person?'quiet selected':'quiet'} onClick={()=>setSelected(s.person.identity)}><Monitor size={15}/>{s.person.name}</button>)}</div>}
      </div>
      {chat&&<aside className="panel call-chat">
        <header><h2>Conversa</h2></header>
        <Conversation key={current.id} api={api} thread={{kind:'call',target:current.id}} signal={version} me={me} notify={notify}/>
        <div className="reactions">{['👍','❤️','👏','😂'].map(reaction=><button className="icon" key={reaction} aria-label={'Reagir '+reaction} onClick={()=>void api.json('/conversations/call/'+current.id,{text:reaction}).catch(notify)}>{reaction}</button>)}</div>
      </aside>}
    </div>
    <div className="call-footnote"><span>Mídia sem criptografia de ponta a ponta</span>{media.hasShareAudio&&<span className="green">Áudio do sistema publicado</span>}
      <label>Qualidade solicitada <select value={prefs.quality} disabled={media.sharing} onChange={e=>save({...prefs,quality:e.target.value as Quality})}>{Object.keys(profiles).map(p=><option key={p}>{p}</option>)}</select></label>
    </div>
  </div>
}

export function CallControls({media,prefs,notify,open,toggleHud,hud,shareRequest,onShareOpened}:{media:Media;prefs:Prefs;notify:(e:unknown)=>void;open:()=>void;toggleHud:()=>void;hud:boolean;shareRequest:number;onShareOpened:()=>void}) {
  const [sources,setSources]=useState<CaptureSource[]|null>(null)
  const [choice,setChoice]=useState('')
  const [audio,setAudio]=useState(true)
  const [working,setWorking]=useState(false)
  const [failure,setFailure]=useState('')
  const pickerRequest=useRef(0)
  const mine=media.mine
  const mic=Boolean(mine?.isMicrophoneEnabled)
  const camera=Boolean(mine?.isCameraEnabled)
  const connected=media.active?.room.state===ConnectionState.Connected
  const action=async (fn:()=>unknown)=>{
    setWorking(true)
    try{await fn()}catch(error){notify(error)}
    finally{setWorking(false)}
  }
  const pick=()=>{
    if(media.sharing){void action(()=>mine?.setScreenShareEnabled(false));return}
    if(!window.haven){void action(()=>media.share(true));return}
    if(hud)toggleHud()
    setSources([])
    setChoice('')
    setFailure('')
    const request=++pickerRequest.current
    void window.haven.sources().then(items=>{
      if (request!==pickerRequest.current) return
      setSources(items)
      if (!items.length) setFailure('Nenhuma fonte de captura disponível.')
    }).catch(error=>{if(request===pickerRequest.current)setFailure(describe(error))})
  }
  useEffect(()=>{
    if(shareRequest&&connected){if(!media.sharing)pick();onShareOpened()}
  },[shareRequest,connected,media.sharing])
  const capture=async()=>{
    if(!choice||!window.haven)return
    setWorking(true)
    setFailure('')
    try{
      await window.haven.select(choice,audio)
      await media.share(audio)
      setSources(null)
    }catch(error){setFailure(describe(error))}
    finally{setWorking(false)}
  }
  if(!media.active)return null
  return <>
    <footer className="call-controls">
      {!hud&&<button className="call-return quiet" onClick={open}><ChevronsUp size={18}/><span>{media.active.title}</span></button>}
      <div className="control-buttons">
        <button className={'icon '+(!mic?'muted':'')} title={prefs.ptt?'Pressione '+prefs.pttKey+' para falar':mic?'Silenciar microfone':'Ativar microfone'} aria-label={mic?'Silenciar microfone':'Ativar microfone'} disabled={!connected||working||prefs.ptt} aria-pressed={mic} onClick={()=>void action(()=>mine?.setMicrophoneEnabled(!mic))}>{mic?<Mic size={20}/>:<MicOff size={20}/>}</button>
        <button className={'icon '+(media.deaf?'muted':'')} title={media.deaf?'Ouvir chamada':'Desativar áudio recebido'} aria-label={media.deaf?'Ouvir chamada':'Desativar áudio recebido'} aria-pressed={media.deaf} onClick={()=>media.setDeaf(!media.deaf)}>{media.deaf?<HeadphoneOff size={20}/>:<Headphones size={20}/>}</button>
        <button className={'icon '+(camera?'selected':'')} title={camera?'Desligar câmera':'Ligar câmera'} aria-label={camera?'Desligar câmera':'Ligar câmera'} aria-pressed={camera} disabled={!connected||working} onClick={()=>void action(()=>mine?.setCameraEnabled(!camera))}>{camera?<Camera size={20}/>:<CameraOff size={20}/>}</button>
        <button className={'icon '+(media.sharing?'selected':'')} title={media.sharing?'Parar compartilhamento':'Compartilhar tela'} aria-label={media.sharing?'Parar compartilhamento':'Compartilhar tela'} aria-pressed={media.sharing} disabled={!connected||working} onClick={pick}>{media.sharing?<MonitorOff size={20}/>:<Monitor size={20}/>}</button>
        {window.haven&&<button className={'icon '+(hud?'selected':'')} aria-label={hud?'Sair do modo flutuante':'Modo flutuante'} title={hud?'Sair do modo flutuante':'Modo flutuante'} onClick={toggleHud}><Maximize size={18}/></button>}
        <button className="danger disconnect" disabled={working} onClick={()=>void action(media.leave)}><PhoneOff size={19}/><span>Sair</span></button>
      </div>
    </footer>
    {sources&&<Dialog title="Compartilhar tela ou janela" close={()=>{if(!working){pickerRequest.current++;setSources(null)}}}>
      <p>Escolha o que os participantes podem ver.</p>
      {failure&&<p role="alert">{failure}</p>}
      {!sources.length&&!failure&&<Empty>Procurando telas e janelas…</Empty>}
      <div className="source-list">{sources.map(s=><button key={s.id} className={choice===s.id?'selected':''} aria-pressed={choice===s.id} onClick={()=>setChoice(s.id)}>
        <img src={s.thumbnail} alt=""/><small>{s.name}</small>
      </button>)}</div>
      <label className="check"><input type="checkbox" checked={audio} onChange={e=>setAudio(e.target.checked)}/> Compartilhar áudio do sistema</label>
      <div className="dialog-actions"><button className="accent" disabled={!choice||working} onClick={()=>void capture()}>Iniciar compartilhamento</button></div>
    </Dialog>}
  </>
}
