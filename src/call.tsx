import { memo, useEffect, useRef, useState } from 'react'
import { ConnectionState, ParticipantEvent, Track } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { AudioLines, Camera, CameraOff, ChevronDown, ChevronsUp, Clipboard, Headphones, HeadphoneOff, Maximize, MessageSquare, Mic, MicOff, Monitor, MonitorOff, PhoneOff, Signal, SmilePlus } from 'lucide-react'
import { describe } from './api'
import type { Api, CaptureSource } from './api'
import { Avatar, Conversation, Dialog, Empty, SectionTitle } from './components'
import { profiles, useStats } from './media'
import type { Media, Prefs, Quality } from './media'
import { soundEnabled } from './feedback'
import { soundEngine } from './sounds'
import { ResizeHandles } from './resize'
import type { ColumnResize } from './resize'

const participantColumn: ColumnResize = { grid:'.call-media', property:'--participants-width', storage:'call.participants.width' }
const stageColumn: ColumnResize = { ...participantColumn, measure:'.participant-pane' }
const chatColumn: ColumnResize = { grid:'.call-layout', property:'--chat-width', storage:'call.chat.width' }

const Player=memo(function Player({track,kind,muted=false,volume=100,output='',fit=false}:{track:Track;kind:'audio'|'video';muted?:boolean;volume?:number;output?:string;fit?:boolean}) {
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
    }
  },[track,kind,muted,volume])
  useEffect(()=>{
    if(kind==='audio' && node.current?.setSinkId)void node.current.setSinkId(output).catch(()=>{})
  },[kind,output])
  return kind==='audio' ? <audio ref={el=>{node.current=el}} autoPlay muted={muted}/> :
    <video ref={el=>{node.current=el}} className={fit?'fit':undefined} autoPlay playsInline muted/>
})

export function CallAudio({media,prefs}:{media:Media;prefs:Prefs}) {
  return <>{media.participants.filter(p=>p!==media.mine).flatMap(p=>[Track.Source.Microphone,Track.Source.ScreenShareAudio].map(source=>{
    const pub=p.getTrackPublication(source)
    return pub?.track ? <Player key={pub.trackSid} kind="audio" track={pub.track} muted={media.deaf||media.isolatingAudio||media.mutedParticipants[p.identity]||pub.isMuted} volume={media.sessionVolumes[p.identity]??100} output={prefs.output}/> : null
  }))}</>
}

function ParticipantCard({person,mine,volume,setVolume,muted,toggleMute,visible}:{person:Participant;mine:boolean;volume:number;setVolume:(n:number)=>void;muted:boolean;toggleMute:()=>void;visible:boolean}) {
  const name=person.name || 'Participante'
  const video=person.getTrackPublication(Track.Source.Camera)
  const [speaking,setSpeaking]=useState(person.isSpeaking)
  useEffect(()=>{
    if(!visible)return
    setSpeaking(person.isSpeaking)
    person.on(ParticipantEvent.IsSpeakingChanged,setSpeaking)
    return ()=>{person.off(ParticipantEvent.IsSpeakingChanged,setSpeaking)}
  },[person,visible])
  return <article className={'participant '+(speaking?'speaking':'')}>
    <div className="participant-preview">{video?.track&&!video.isMuted ? <Player track={video.track} kind="video"/> : <Avatar p={{name,color:mine?'verde':'lavanda'}}/>}</div>
    <div className="participant-label"><strong>{mine?'Você':name}</strong>{speaking?<AudioLines size={15} className="green"/>:person.isMicrophoneEnabled?<Mic size={14}/>:<MicOff size={14}/>}</div>
    {!mine&&<div className="participant-audio">
      <button className="icon" aria-label={(muted?'Reativar áudio de ':'Silenciar ')+name} title={muted?'Reativar só para mim':'Silenciar só para mim'} aria-pressed={muted} onClick={toggleMute}>{muted?<HeadphoneOff size={15}/>:<Headphones size={15}/>}</button>
      <input type="range" min={0} max={100} value={volume} aria-label={'Volume de '+name} onChange={e=>setVolume(+e.target.value)}/>
    </div>}
    <ResizeHandles name={mine?'seu vídeo':'vídeo de '+name} id={mine?'call.tile.self':'call.tile.'+person.identity}/>
  </article>
}

function StageStats({track,requested,local}:{track?:Track;requested?:Quality;local:boolean}) {
  const stats=useStats(track)
  return <small>{stats?(local?'Enviado · ':'Recebido · ')+stats:'Aguardando métricas WebRTC'}{requested?' · solicitado '+requested:''}</small>
}

export function CallView({api,media,prefs,save,notify,me,version,visible,legacyMessageSound}:{api:Api;media:Media;prefs:Prefs;save:(p:Prefs)=>void;notify:(e:unknown)=>void;me:string;version:number;visible:boolean;legacyMessageSound:boolean}) {
  const [chat,setChat]=useState(true)
  const [selected,setSelected]=useState('')
  const [expanded,setExpanded]=useState(false)
  const [fullscreen,setFullscreen]=useState(false)
  const [changingQuality,setChangingQuality]=useState(false)
  const surface=useRef<HTMLElement>(null)
  const current=media.active
  const focused=media.shares.find(s=>s.person.identity===selected)||media.shares[0]
  useEffect(()=>{
    if(!visible)return
    const stage=surface.current
    const change=()=>setFullscreen(document.fullscreenElement===surface.current)
    const escape=(event:KeyboardEvent)=>{ if(event.key==='Escape')setExpanded(false) }
    document.addEventListener('fullscreenchange',change)
    document.addEventListener('keydown',escape)
    return ()=>{
      document.removeEventListener('fullscreenchange',change)
      document.removeEventListener('keydown',escape)
      if(stage&&document.fullscreenElement===stage)void document.exitFullscreen().catch(()=>{})
    }
  },[visible])
  useEffect(()=>{
    if(!focused) {
      setExpanded(false)
      if(document.fullscreenElement===surface.current && document.fullscreenElement)void document.exitFullscreen().catch(notify)
    }
  },[focused?.publication.trackSid,notify])
  async function toggleFullScreen() {
    if(document.fullscreenElement===surface.current && document.fullscreenElement) {
      await document.exitFullscreen().catch(notify)
    } else if(expanded) {
      setExpanded(false)
    } else {
      try { await surface.current?.requestFullscreen() }
      catch { setExpanded(true) }
    }
  }
  if(!current)return null
  const state=current.room.state
  return <div className="call-view">
    <div className="call-heading"><SectionTitle>{current.title}</SectionTitle><div className="inline">
      <details className="call-details">
        <summary className={'status '+(state===ConnectionState.Connected?'green':'')} title="Detalhes da chamada"><Signal size={17}/>{state===ConnectionState.Connected?'Conectado':state===ConnectionState.Disconnected?'Desconectado':'Reconectando'}<ChevronDown size={13}/></summary>
        <div className="call-details-content">
          <span>Mídia sem criptografia de ponta a ponta</span>
          {media.hasShareAudio&&<span className="green">Áudio do sistema publicado</span>}
          {media.isolatingAudio&&<span>Som da chamada pausado neste PC durante a captura.</span>}
          {focused?.publication.track&&<StageStats track={visible?focused.publication.track:undefined} local={focused.person===media.mine} requested={focused.person===media.mine?media.requestedShare:undefined}/>}
          <label>Qualidade solicitada <select value={prefs.quality} disabled={changingQuality} onChange={async e=>{
            const quality=e.target.value as Quality
            setChangingQuality(true)
            try { await media.changeQuality(quality); save({...prefs,quality}) }
            catch { notify('Não foi possível mudar a qualidade da captura.') }
            finally { setChangingQuality(false) }
          }}>{Object.keys(profiles).map(p=><option key={p}>{p}</option>)}</select></label>
        </div>
      </details>
      {current.code&&<button className="quiet" onClick={()=>void navigator.clipboard.writeText(current.code!).then(()=>notify('Código copiado.')).catch(notify)}><Clipboard size={16}/> Copiar código</button>}
      <button className="icon" title={chat?'Ocultar conversa':'Mostrar conversa'} aria-label={chat?'Ocultar conversa':'Mostrar conversa'} aria-pressed={chat} onClick={()=>setChat(v=>!v)}><MessageSquare size={19}/></button>
    </div></div>
    <div className={'call-layout '+(chat&&visible?'':'no-chat')}>
      <div className="call-media">
        <section className={'stage'+(focused?.publication.track?' presenting':'')+(expanded?' expanded':'')} ref={surface}>
          {focused?.publication.track ? <>
            <Player track={focused.publication.track} kind="video" fit/>
            <div className="stage-meta"><strong>{focused.person.name || 'Participante'}</strong>
              <button className="icon" aria-label={fullscreen||expanded?'Sair da tela cheia':'Tela cheia'} title={fullscreen||expanded?'Sair da tela cheia':'Tela cheia'} onClick={()=>void toggleFullScreen()}><Maximize size={17}/></button>
            </div>
          </> : <div className="stage-idle"><Monitor size={34}/><strong>Nenhuma tela compartilhada</strong><p>Use os controles de chamada para apresentar sua tela.</p></div>}
          <ResizeHandles name="transmissão" id="call.stage" column={stageColumn}/>
        </section>
        <div className="participant-pane"><div className="participant-list">{media.participants.map(p=><ParticipantCard key={p.identity} person={p} mine={p===media.mine} volume={media.sessionVolumes[p.identity]??100} setVolume={n=>media.updateVolume(p.identity,n)}
          muted={Boolean(media.mutedParticipants[p.identity])} toggleMute={()=>media.toggleParticipantMute(p.identity)} visible={visible}/>)}</div>
          <ResizeHandles name="participantes" id="call.participants" column={participantColumn}/>
        </div>
        {media.shares.length>1&&<div className="share-tabs">{media.shares.map(s=><button key={s.person.identity} className={focused?.person===s.person?'quiet selected':'quiet'} onClick={()=>setSelected(s.person.identity)}><Monitor size={15}/>{s.person.name}</button>)}</div>}
      </div>
      {chat&&visible&&<aside className="panel call-chat">
        <header><h2>Conversa da chamada</h2>
          <details className="call-reactions"><summary aria-label="Reações" title="Reações"><SmilePlus size={18}/></summary>
            <div className="reactions">{['👍','❤️','👏','😂'].map(reaction=><button className="icon" key={reaction} aria-label={'Reagir '+reaction} onClick={event=>{
              event.currentTarget.closest('details')?.removeAttribute('open')
              void api.json('/conversations/call/'+current.id,{text:reaction}).catch(notify)
            }}>{reaction}</button>)}</div>
          </details>
        </header>
        <Conversation key={current.id} api={api} thread={{kind:'call',target:current.id}} signal={version} me={me} notify={notify} onIncoming={legacyMessageSound?()=>{
          if(!media.capturingAudio&&!media.hasShareAudio&&soundEnabled(prefs,'message'))void soundEngine.play('message',prefs.soundVolume)
        }:undefined}/>
        <ResizeHandles name="conversa da chamada" id="call.chat" column={chatColumn}/>
      </aside>}
    </div>
  </div>
}

export function CallControls({media,prefs,notify,open,toggleHud,hud,shareRequest,onShareOpened,pending}:{media:Media;prefs:Prefs;notify:(e:unknown)=>void;open:()=>void;toggleHud:()=>void;hud:boolean;shareRequest:number;onShareOpened:()=>void;pending:boolean}) {
  const [sources,setSources]=useState<CaptureSource[]|null>(null)
  const [choice,setChoice]=useState('')
  const [audio,setAudio]=useState(true)
  const [working,setWorking]=useState(false)
  const [failure,setFailure]=useState('')
  const [nativeIsolation,setNativeIsolation]=useState(false)
  const [pauseCallAudio,setPauseCallAudio]=useState(false)
  const pickerRequest=useRef(0)
  const mine=media.mine
  const mic=Boolean(mine?.isMicrophoneEnabled)
  const camera=Boolean(mine?.isCameraEnabled)
  const connected=media.active?.room.state===ConnectionState.Connected
  useEffect(()=>{
    void window.haven?.canIsolateAudio().then(setNativeIsolation).catch(()=>{})
    return ()=>{ void window.haven?.clearSources().catch(()=>{}) }
  },[])
  const action=async (fn:()=>unknown)=>{
    setWorking(true)
    try{await fn()}catch(error){notify(error)}
    finally{setWorking(false)}
  }
  function listSources(message='') {
    if(!window.haven)return
    setSources([])
    setChoice('')
    setFailure(message)
    const request=++pickerRequest.current
    void window.haven.sources().then(items=>{
      if (request!==pickerRequest.current) return
      setSources(items)
      if (!items.length) setFailure('Nenhuma fonte de captura disponível.')
    }).catch(error=>{if(request===pickerRequest.current)setFailure(describe(error))})
  }
  const pick=()=>{
    if(media.sharing){void action(()=>mine?.setScreenShareEnabled(false));return}
    if(!window.haven){void action(()=>media.share(true,true));return}
    if(hud)toggleHud()
    listSources()
  }
  useEffect(()=>{
    if(shareRequest&&connected){if(!media.sharing)pick();onShareOpened()}
  },[shareRequest,connected,media.sharing])
  const capture=async()=>{
    if(!choice||!window.haven)return
    setWorking(true)
    setFailure('')
    try{
      await media.share(audio,!nativeIsolation||pauseCallAudio)
      void window.haven.clearSources().catch(()=>{})
      setSources(null)
    }catch(error){
      listSources(error instanceof DOMException && ['NotReadableError','NotAllowedError','AbortError'].includes(error.name)
        ? 'Não foi possível capturar essa fonte. Confira se a janela está aberta e escolha a fonte novamente.' : describe(error))
    }
    finally{setWorking(false)}
  }
  if(!media.active)return null
  return <>
    <footer className="call-controls">
      {!hud&&<button className="call-return quiet" onClick={open}><ChevronsUp size={18}/><span>{media.active.title}</span></button>}
      <div className="control-buttons">
        <button className={'icon '+(!mic?'muted':'')} title={prefs.ptt?'Pressione '+prefs.pttKey+' para falar':mic?'Silenciar microfone':'Ativar microfone'} aria-label={mic?'Silenciar microfone':'Ativar microfone'} disabled={!connected||working||prefs.ptt} aria-pressed={mic} onClick={()=>void action(()=>mine?.setMicrophoneEnabled(!mic))}>{mic?<Mic size={20}/>:<MicOff size={20}/>}<span className="control-label">Microfone</span></button>
        <button className={'icon '+(media.deaf?'muted':'')} title={media.deaf?'Ouvir chamada':'Desativar áudio recebido'} aria-label={media.deaf?'Ouvir chamada':'Desativar áudio recebido'} aria-pressed={media.deaf} onClick={()=>media.setDeaf(!media.deaf)}>{media.deaf?<HeadphoneOff size={20}/>:<Headphones size={20}/>}<span className="control-label">Áudio</span></button>
        <button className={'icon '+(camera?'selected':'')} title={camera?'Desligar câmera':'Ligar câmera'} aria-label={camera?'Desligar câmera':'Ligar câmera'} aria-pressed={camera} disabled={!connected||working} onClick={()=>void action(()=>mine?.setCameraEnabled(!camera))}>{camera?<Camera size={20}/>:<CameraOff size={20}/>}<span className="control-label">Câmera</span></button>
        <button className={'icon '+(media.sharing?'selected':'')} title={media.sharing?'Parar compartilhamento':'Compartilhar tela'} aria-label={media.sharing?'Parar compartilhamento':'Compartilhar tela'} aria-pressed={media.sharing} disabled={!connected||working} onClick={pick}>{media.sharing?<MonitorOff size={20}/>:<Monitor size={20}/>}<span className="control-label">{media.sharing?'Parar transmissão':'Compartilhar tela'}</span></button>
        {window.haven&&<button className={'icon '+(hud?'selected':'')} aria-label={hud?'Sair do modo flutuante':'Modo flutuante'} title={hud?'Sair do modo flutuante':'Modo flutuante'} onClick={toggleHud}><Maximize size={18}/></button>}
        <button className="danger disconnect" disabled={working} onClick={()=>void action(media.leave)}><PhoneOff size={19}/><span>{pending?'Cancelar chamada':'Sair'}</span></button>
      </div>
    </footer>
    {sources&&<Dialog title="Compartilhar tela ou janela" close={()=>{if(!working){pickerRequest.current++;void window.haven?.clearSources().catch(()=>{});setSources(null)}}}>
      <p>Escolha o que os participantes podem ver.</p>
      {failure&&<p role="alert">{failure}</p>}
      {!sources.length&&!failure&&<Empty>Procurando telas e janelas…</Empty>}
      <div className="source-list">{sources.map(s=><button key={s.id} disabled={working} className={choice===s.id?'selected':''} aria-pressed={choice===s.id} onClick={()=>{
        setChoice('')
        const request=++pickerRequest.current
        void window.haven?.select(s.id).then(ready=>{
          if(request!==pickerRequest.current)return
          if(ready)setChoice(s.id)
          else listSources('A lista mudou. Escolha a fonte novamente.')
        }).catch(()=>{if(request===pickerRequest.current)listSources('Escolha a fonte novamente.')})
      }}>
        <img src={s.thumbnail} alt=""/><small>{s.name}</small>
      </button>)}</div>
      <label className="check"><input type="checkbox" checked={audio} onChange={e=>setAudio(e.target.checked)}/> Compartilhar áudio do sistema</label>
      {audio&&!nativeIsolation&&<p>O som da chamada será pausado neste PC para evitar eco durante a captura.</p>}
      {audio&&nativeIsolation&&<label className="check"><input type="checkbox" checked={pauseCallAudio} onChange={e=>setPauseCallAudio(e.target.checked)}/> Pausar o som da chamada neste PC durante a captura</label>}
      <div className="dialog-actions"><button className="accent" disabled={!choice||working} onClick={()=>void capture()}>Iniciar compartilhamento</button></div>
    </Dialog>}
  </>
}
