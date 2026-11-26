import { useEffect, useRef } from 'react'
import { ConnectionState } from 'livekit-client'
import type { Call, Snapshot } from './api'
import type { Media, Prefs } from './media'
import { defaultSoundSettings, soundEngine } from './sounds'
import type { SoundCategory } from './sounds'

export const ringUntil = (call: Call) => call.created + 60000

export function useFeedback(data: Snapshot | undefined, media: Media, prefs: Prefs, connection: string, incoming?: Call, outgoing?: Call) {
  const previous = useRef<Snapshot | undefined>(undefined)
  const before = useRef<{id?:string; connected:boolean; people:Set<string>; mic:boolean; deaf:boolean; sharing:boolean; lost:boolean} | undefined>(undefined)
  const silent = media.capturingAudio || media.hasShareAudio
  const ring = incoming && soundEnabled(prefs,'incomingCall') ? incoming : outgoing
  const category = ring && ring===incoming ? 'incomingCall' : 'outgoingCall'
  const ringing = Boolean(ring && soundEnabled(prefs,category) && !silent)
  const deadline = ring ? ringUntil(ring) : 0

  useEffect(()=>{
    const unlock=()=>void soundEngine.prepare()
    window.addEventListener('pointerdown',unlock,{once:true})
    window.addEventListener('keydown',unlock,{once:true})
    return ()=>{
      window.removeEventListener('pointerdown',unlock)
      window.removeEventListener('keydown',unlock)
      soundEngine.stop()
    }
  },[])

  useEffect(()=>{
    if(silent || prefs.soundVolume===0) soundEngine.stop()
  },[silent,prefs.soundVolume])
  useEffect(()=>{
    if(!ringing || deadline<=Date.now())return
    const play=()=>{if(Date.now()<deadline)void soundEngine.play(category,prefs.soundVolume)}
    play()
    const repeat=window.setInterval(play,category==='incomingCall'?3500:4500)
    const expire=window.setTimeout(()=>{
      window.clearInterval(repeat)
      soundEngine.stop(category)
    },deadline-Date.now())
    return ()=>{
      window.clearInterval(repeat)
      window.clearTimeout(expire)
      soundEngine.stop(category)
    }
  },[ring?.id,ringing,category,deadline,prefs.soundVolume])

  useEffect(()=>{
    const prior=previous.current
    previous.current=data
    const last=before.current
    const connected=media.active?.room.state===ConnectionState.Connected
    const current={
      id:media.active?.id, connected, people:new Set(media.participants.filter(person=>person!==media.mine).map(person=>person.identity)),
      mic:Boolean(media.mine?.isMicrophoneEnabled), deaf:media.deaf, sharing:media.sharing,
      lost:Boolean(data && (connection || (media.active && !connected))),
    }
    before.current=current
    if(!last || silent || !data)return
    const choices: SoundCategory[]=[]
    if(current.lost!==last.lost)choices.push(current.lost?'disconnect':'reconnect')
    if(current.id!==last.id)choices.push(current.id?'callJoin':'callLeave')
    else if(current.id && connected && last.connected) {
      if(current.sharing!==last.sharing)choices.push(current.sharing?'shareStart':'shareStop')
      if(current.deaf!==last.deaf)choices.push(current.deaf?'audioOff':'audioOn')
      if(!prefs.ptt && current.mic!==last.mic)choices.push(current.mic?'micOn':'micOff')
      if([...current.people].some(id=>!last.people.has(id)))choices.push('participantJoin')
      if([...last.people].some(id=>!current.people.has(id)))choices.push('participantLeave')
    }
    if(prior?.me.id===data.me.id) {
      const lastMessage=prior.latest[0]?.id??0
      const callMessage=data.latestCallMessage
      if((callMessage && callMessage.target===current.id && callMessage.target===last.id && callMessage.sender!==data.me.id && callMessage.id>(prior.latestCallMessage?.id??0))
        || data.latest.some(item=>item.id>lastMessage && (item.sender ? item.sender!==data.me.id : (data.unread[item.target]??0)>(prior.unread[item.target]??0))))choices.push('message')
      if(data.friends.some(friend=>!friend.accepted && friend.sender!==data.me.id && !prior.friends.some(old=>old.id===friend.id)))choices.push('friendRequest')
    }
    const sound=choices.find(id=>soundEnabled(prefs,id))
    if(sound && (!ringing || deadline<=Date.now() || sound==='disconnect' || sound==='reconnect'))void soundEngine.play(sound,prefs.soundVolume)
  })
}

export function soundEnabled(prefs:Prefs,category:SoundCategory) {
  return prefs.soundVolume>0 && (prefs.sounds[category]??defaultSoundSettings[category])
}
