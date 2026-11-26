import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { CalendarDays, ImagePlus, MessageSquare, Send, X } from 'lucide-react'
import type { Api, Event, Message, Person, Snapshot, Thread } from './api'
import { dateTime, describe, online, threadPath, time } from './api'

export function Avatar({p,presence=false}:{p:Pick<Person,'name'|'color'> & {seen?:number}; presence?:boolean}) {
  return <span className={'avatar '+p.color} aria-hidden="true">{p.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()}
    {presence && p.seen && online(p as Person) ? <i/> : null}
  </span>
}

export function Dialog({title,children,close}:{title:string;children:ReactNode;close:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal()},[])
  return <dialog ref={dialog} onCancel={close} aria-label={title}>
    <header><h2>{title}</h2><button className="icon" title="Fechar" aria-label="Fechar" onClick={close}><X size={19}/></button></header>
    {children}
  </dialog>
}
export function Panel({title,children,action}:{title:string;children:ReactNode;action?:ReactNode}) {
  return <section className="panel"><header><h2>{title}</h2>{action}</header>{children}</section>
}
export function Empty({children}:{children:ReactNode}) { return <p className="empty">{children}</p> }
export function SectionTitle({children}:{children:ReactNode}) { return <h1 className="section-title">{children}</h1> }
export function Events({events,spaces}:{events:Event[];spaces:Snapshot['spaces']}) {
  const future=events.filter(e=>e.starts>Date.now())
  return future.length ? <ul className="feed">{future.map(e=><li key={e.id}>
    <span className="glyph lavanda"><CalendarDays size={17}/></span><div><strong>{e.title}</strong><small>{dateTime(e.starts)} · {spaces.find(s=>s.id===e.space)?.name}</small></div>
  </li>)}</ul> : <Empty>Nenhum encontro agendado.</Empty>
}
export function Recent({items,open}:{items:Snapshot['latest'];open:(t:Thread,title:string)=>void}) {
  return items.length ? <ul className="feed">{items.map(item=><li key={item.id}><button className="feed-button" onClick={()=>open(item,item.name)}>
    <span className="glyph"><MessageSquare size={17}/></span><div><strong>{item.name}</strong><small>{item.body || 'Mídia compartilhada'}</small></div><small>{time(item.sent)}</small>
  </button></li>)}</ul> : <Empty>Nenhuma mensagem recente.</Empty>
}

function Attachment({api,path,kind}:{api:Api;path:string;kind:string}) {
  const [url,setUrl]=useState('')
  const [error,setError]=useState(false)
  const [near,setNear]=useState(false)
  const placeholder=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(near||!placeholder.current)return
    const observer=new IntersectionObserver(([entry])=>{
      if(entry?.isIntersecting){observer.disconnect();setNear(true)}
    },{rootMargin:'360px'})
    observer.observe(placeholder.current)
    return ()=>observer.disconnect()
  },[near])
  useEffect(()=>{
    if(!near)return
    const controller=new AbortController()
    let object=''
    api.blob(path,controller.signal).then(blob=>{
      if (controller.signal.aborted) return
      object=URL.createObjectURL(blob)
      setUrl(object)
    }).catch(()=>{if(!controller.signal.aborted)setError(true)})
    return ()=>{controller.abort();if(object)URL.revokeObjectURL(object)}
  },[api,path,near])
  if (error) return <small>Mídia indisponível.</small>
  if (!url) return <div className="attachment-placeholder" ref={placeholder}><small>{near?'Carregando mídia…':'Mídia compartilhada'}</small></div>
  return kind.startsWith('image/') ? <img src={url} alt="Imagem compartilhada" loading="lazy" decoding="async"/> :
    <video src={url} aria-label="Clipe compartilhado" controls preload="metadata"/>
}

async function encodeFile(file:File) {
  if (file.size > 8*1024*1024) throw new Error('O limite por arquivo é de 8 MB.')
  const url=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>resolve(String(reader.result))
    reader.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'))
    reader.readAsDataURL(file)
  })
  return {kind:file.type,media:url.slice(url.indexOf(',')+1)}
}

export function Conversation({api,thread,signal,notify,me,wall=false,read=true,onIncoming}:{api:Api;thread:Thread;signal:number;notify:(e:unknown)=>void;me:string;wall?:boolean;read?:boolean;onIncoming?:()=>void}) {
  const path=threadPath(thread)
  const [rows,setRows]=useState<Message[]>([])
  const [more,setMore]=useState(false)
  const [loading,setLoading]=useState(true)
  const [draft,setDraft]=useState('')
  const [file,setFile]=useState<File>()
  const [busy,setBusy]=useState(false)
  const [failure,setFailure]=useState('')
  const [retry,setRetry]=useState(0)
  const scroll=useRef<HTMLDivElement>(null)
  const latestRead=useRef(0)
  const latestSeen=useRef(0)
  const incoming=useRef(onIncoming)
  incoming.current=onIncoming
  const didLoad=useRef(false)
  const fileInput=useRef<HTMLInputElement>(null)
  useEffect(()=>{
    const controller=new AbortController()
    api.json<{rows:Message[];more:boolean}>(path,undefined,controller.signal).then(data=>{
      if(controller.signal.aborted)return
      if(didLoad.current && data.rows.some(row=>row.sender!==me&&row.id>latestSeen.current))incoming.current?.()
      latestSeen.current=Math.max(latestSeen.current,data.rows.at(-1)?.id??0)
      const keepBottom=!didLoad.current || (scroll.current && scroll.current.scrollHeight-scroll.current.scrollTop-scroll.current.clientHeight<100)
      setFailure('')
      setRows(previous=>{
        const first=data.rows[0]?.id
        return [...(first ? previous.filter(m=>m.id<first) : []),...data.rows]
      })
      if(!didLoad.current)setMore(data.more)
      didLoad.current=true
      setLoading(false)
      if(keepBottom&&!wall)requestAnimationFrame(()=>scroll.current?.scrollTo(0,scroll.current.scrollHeight))
      const latest=data.rows.at(-1)?.id
      if(read && latest && latest>latestRead.current && ['dm','room'].includes(thread.kind)){
        latestRead.current=latest
        api.json(path+'/read',{latest}).catch(()=>{latestRead.current=0})
      }
    }).catch(error=>{if(!controller.signal.aborted){setFailure(describe(error));setLoading(false)}})
    return ()=>controller.abort()
  },[api,me,path,signal,retry,read,thread.kind,wall])

  async function send(e:FormEvent) {
    e.preventDefault()
    if(busy || (!file&&(!draft.trim()||wall)))return
    setBusy(true)
    try {
      const media=file ? await encodeFile(file) : {}
      await api.json(path,{text:draft,...media})
      setDraft('')
      setFile(undefined)
      if(fileInput.current)fileInput.current.value=''
      setRetry(x=>x+1)
    } catch(error){notify(error)}
    finally{setBusy(false)}
  }
  async function earlier() {
    if(!rows[0]||busy)return
    setBusy(true)
    try {
      const previous=scroll.current?.scrollHeight
      const data=await api.json<{rows:Message[];more:boolean}>(path+'?before='+rows[0].id)
      setRows(current=>[...data.rows,...current])
      setMore(data.more)
      if(previous!==undefined && !wall) requestAnimationFrame(()=>scroll.current?.scrollTo(0,scroll.current.scrollHeight-previous))
    } catch(error){notify(error)}
    finally{setBusy(false)}
  }
  return <div className={'conversation '+(wall?'wall':'')}>
    <div ref={scroll} className="messages" role={wall ? undefined : 'log'} aria-label={wall?'Mídias compartilhadas':'Mensagens'}>
      {more && <button className="quiet older" onClick={()=>void earlier()} disabled={busy}>Carregar anteriores</button>}
      {loading && <Empty>Carregando…</Empty>}
      {failure && <p role="alert">{failure} <button className="quiet" onClick={()=>setRetry(x=>x+1)}>Tentar de novo</button></p>}
      {!loading&&!failure&&!rows.length&&<Empty>{wall?'Nenhuma mídia compartilhada.':'Nenhuma mensagem nesta conversa.'}</Empty>}
      <div className={wall?'wall-grid':'message-list'}>{rows.map(m=><article key={m.id} className={'message '+(m.sender===me?'own':'')}>
        {!wall && <Avatar p={m}/>}<div className="message-content"><header><strong>{m.sender===me?'Você':m.name}</strong><time title={dateTime(m.sent)}>{time(m.sent)}</time></header>
        {m.body&&<p>{m.body}</p>}{m.kind&&<Attachment api={api} path={path+'/media/'+m.id} kind={m.kind}/>}</div>
      </article>)}</div>
    </div>
    <form className="composer" onSubmit={send}>
      {file&&<div className="selected-file">{file.name}<button type="button" className="icon" aria-label="Remover anexo" onClick={()=>{setFile(undefined);if(fileInput.current)fileInput.current.value=''}}><X size={15}/></button></div>}
      <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={e=>setFile(e.target.files?.[0])}/>
      <button type="button" className="icon" title="Anexar imagem ou clipe" aria-label="Anexar imagem ou clipe" onClick={()=>fileInput.current?.click()}><ImagePlus size={20}/></button>
      <input aria-label={wall?'Legenda da mídia':'Mensagem'} maxLength={2000} placeholder={wall?'Legenda opcional':'Escreva uma mensagem'} value={draft} onChange={e=>setDraft(e.target.value)}/>
      <button className="icon accent" aria-label="Enviar" title="Enviar" disabled={busy||(!file&&(!draft.trim()||wall))}><Send size={18}/></button>
    </form>
  </div>
}
