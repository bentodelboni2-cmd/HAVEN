import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectionState, Room, RoomEvent, Track } from 'livekit-client'
import type { Participant, TrackPublication } from 'livekit-client'
import type { Api } from './api'

export const profiles = {
  '720p30': { width:1280,height:720,frameRate:30,mbps:4 },
  '1080p30': { width:1920,height:1080,frameRate:30,mbps:7 },
  '1080p60': { width:1920,height:1080,frameRate:60,mbps:10 },
}
export type Quality = keyof typeof profiles
export type Prefs = {
  quality: Quality; bitrate: number; mic: string; camera: string; output: string
  ptt: boolean; pttKey: string; music: boolean; theme: 'ardosia'|'carvao'
}
export const initialPrefs: Prefs = {quality:'1080p60',bitrate:0,mic:'',camera:'',output:'',ptt:false,pttKey:'Space',music:false,theme:'ardosia'}
export type ActiveCall = { id: string; title: string; code: string | null; room: Room }
export type Share = { person: Participant; publication: TrackPublication }
type Credentials = { url: string; token: string; code: string | null }

export function useCall(api: Api, prefs: Prefs) {
  const [active,setActive] = useState<ActiveCall>()
  const [busy,setBusy] = useState(false)
  const [version,setVersion] = useState(0)
  const [deaf,setDeaf] = useState(false)
  const [requestedShare,setRequestedShare] = useState<Quality>()
  const [sessionVolumes,setVolumes] = useState<Record<string,number>>({})
  const activeRef = useRef<ActiveCall | undefined>(undefined)
  const transition = useRef(false)
  const refresh = useCallback(() => setVersion(v=>v+1),[])
  const room = active?.room
  const mine = room?.localParticipant
  const participants: Participant[] = room ? [room.localParticipant,...room.remoteParticipants.values()] : []
  const shares = participants.flatMap(person => {
    const publication = person.getTrackPublication(Track.Source.ScreenShare)
    return publication?.track && !publication.isMuted ? [{person,publication}] : []
  })
  const source = mine?.getTrackPublication(Track.Source.ScreenShare)
  const sharing = Boolean(source?.track)
  const hasShareAudio = Boolean(mine?.getTrackPublication(Track.Source.ScreenShareAudio)?.track)

  async function leave() {
    const current = activeRef.current
    if (!current) return
    activeRef.current = undefined
    setActive(undefined)
    try { await current.room.disconnect() }
    finally { await api.json('/calls/'+current.id+'/respond',{state:'left'}).catch(()=>{}) }
  }

  async function join(id: string, title: string) {
    if (transition.current) return
    if (activeRef.current?.id === id) return
    transition.current = true
    setBusy(true)
    let next: Room | undefined
    try {
      await leave()
      const result = await api.json<Credentials>('/media-token',{id})
      const url = new URL(result.url)
      const privateHost = /^(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/
      if (!(url.protocol === 'wss:' || (url.protocol === 'ws:' && privateHost.test(url.hostname))) || url.username || url.password) throw new Error('Endereço de mídia inválido.')
      next = new Room({adaptiveStream:true,dynacast:true,
        audioCaptureDefaults:{deviceId:prefs.mic || undefined,autoGainControl:!prefs.music,echoCancellation:!prefs.music,noiseSuppression:!prefs.music},
        videoCaptureDefaults:{deviceId:prefs.camera || undefined},
        audioOutput:prefs.output ? {deviceId:prefs.output} : undefined,
      })
      const updateEvents = [RoomEvent.ConnectionStateChanged,RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.ActiveSpeakersChanged,RoomEvent.ConnectionQualityChanged]
      for (const event of updateEvents) next.on(event,refresh)
      await next.connect(result.url,result.token,{maxRetries:2})
      const current = { id,title,code:result.code,room:next }
      activeRef.current = current
      setDeaf(false)
      setRequestedShare(undefined)
      setVolumes({})
      setActive(current)
    } catch (error) {
      await next?.disconnect().catch(()=>{})
      await api.json('/calls/'+id+'/respond',{state:'left'}).catch(()=>{})
      throw error
    } finally {
      transition.current = false
      setBusy(false)
    }
  }

  useEffect(() => () => { void activeRef.current?.room.disconnect() },[])
  useEffect(() => {
    if (!room) return
    const disconnect = () => {
      const current = activeRef.current
      if (current?.room === room) {
        void api.json('/calls/'+current.id+'/respond',{state:'left'}).catch(()=>{})
      }
      refresh()
    }
    room.on(RoomEvent.Disconnected,disconnect)
    return () => { room.off(RoomEvent.Disconnected,disconnect) }
  },[room,refresh,api])

  useEffect(() => {
    if (!mine || !prefs.ptt) return
    let pressed = false
    let stopped = false
    let chain = Promise.resolve()
    const sync = () => {
      chain = chain.then(async () => {
        if (room?.state === ConnectionState.Connected) await mine.setMicrophoneEnabled(!stopped && pressed)
      }).catch(() => {})
    }
    const down = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement
      if (ev.repeat || ev.code !== prefs.pttKey || target?.closest('input, textarea, select, [contenteditable]') || (ev.code === 'Space' && target?.closest('button'))) return
      ev.preventDefault()
      pressed = true
      sync()
    }
    const up = (ev: KeyboardEvent) => { if (ev.code === prefs.pttKey && pressed) { pressed = false; sync() } }
    const blur = () => { if (pressed) { pressed=false; sync() } }
    sync()
    window.addEventListener('keydown',down)
    window.addEventListener('keyup',up)
    window.addEventListener('blur',blur)
    return () => {
      stopped = true
      sync()
      window.removeEventListener('keydown',down)
      window.removeEventListener('keyup',up)
      window.removeEventListener('blur',blur)
    }
  },[mine,room,prefs.ptt,prefs.pttKey])

  async function share(withAudio: boolean) {
    if (!mine) return
    const profile = profiles[prefs.quality]
    const published = await mine.setScreenShareEnabled(true,{
      audio:withAudio ? {restrictOwnAudio:true,echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:2} : false,
      resolution:{width:profile.width,height:profile.height,frameRate:profile.frameRate},
      contentHint:'motion',
    },{
      screenShareEncoding:{maxBitrate:(prefs.bitrate || profile.mbps)*1_000_000,maxFramerate:profile.frameRate},
      simulcast:false,videoCodec:'h264',forceStereo:true,dtx:false,
    })
    if (published) setRequestedShare(prefs.quality)
    refresh()
  }

  function updateVolume(id: string, value: number) { setVolumes(v=>({...v,[id]:value})) }
  return {active,busy,version,deaf,setDeaf,sessionVolumes,updateVolume,join,leave,mine,participants,shares,sharing,requestedShare,hasShareAudio,share}
}
export type Media = ReturnType<typeof useCall>

export function useStats(track: Track | undefined) {
  const [display,setDisplay] = useState('')
  useEffect(() => {
    setDisplay('')
    if (!track) return
    let last: {bytes:number; time:number} | undefined
    let stopped = false
    let sampling = false
    const tick = async () => {
      if (sampling) return
      sampling = true
      try {
        const reports = await track.getRTCStatsReport()
        if (!reports || stopped) return
        const rows = [...reports.values()]
        const row = rows.find(r=>(r.type==='inbound-rtp' || r.type==='outbound-rtp') && (r.kind || r.mediaType)==='video')
        if (!row) return
        const bytes = row.bytesReceived ?? row.bytesSent
        const mbps = last && row.timestamp > last.time && bytes >= last.bytes ? (bytes-last.bytes)*8/(row.timestamp-last.time)/1000 : undefined
        last = { bytes,time:row.timestamp }
        const transport = reports.get(row.transportId)
        const pair = transport && reports.get(transport.selectedCandidatePairId)
        const remote = row.remoteId && reports.get(row.remoteId)
        const rtt = remote?.roundTripTime ?? pair?.currentRoundTripTime
        const lost = row.packetsLost ?? remote?.packetsLost
        setDisplay([
          row.frameWidth && row.frameHeight && row.frameWidth+'×'+row.frameHeight,
          typeof row.framesPerSecond === 'number' && row.framesPerSecond+' FPS',
          typeof row.framesDecoded === 'number' && row.framesDecoded+' quadros decodificados',
          mbps !== undefined && mbps.toFixed(2)+' Mbps',
          typeof rtt === 'number' && Math.round(rtt*1000)+' ms RTT',
          typeof lost === 'number' && lost+' pacotes perdidos',
        ].filter(x=>x!==false && x!==undefined).join(' · '))
      } catch { if (!stopped) setDisplay('Métricas indisponíveis') }
      finally { sampling = false }
    }
    void tick()
    const timer = window.setInterval(tick,1500)
    return () => { stopped = true; window.clearInterval(timer) }
  },[track])
  return display
}
