import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Minus, Mountain, Play, Square, X } from 'lucide-react'
import { describe } from './api'
import type { Api, Snapshot } from './api'
import { Avatar, Panel, SectionTitle } from './components'
import { profiles } from './media'
import type { Prefs, Quality } from './media'
import { defaultSoundSettings, soundCategories, soundEngine } from './sounds'

export function Brand(){return <span className="brand"><Mountain size={23} strokeWidth={1.9}/>HAVEN</span>}
export function WindowButtons(){
  return window.haven&&<div className="window-buttons">
    <button className="icon" aria-label="Minimizar" onClick={()=>void window.haven!.window('min')}><Minus size={17}/></button>
    <button className="icon" aria-label="Alternar maximização" onClick={()=>void window.haven!.window('max')}><Square size={13}/></button>
    <button className="icon window-close" aria-label="Fechar HAVEN" onClick={()=>void window.haven!.window('close')}><X size={18}/></button>
  </div>
}
export function Form({children,submit,label='Salvar'}:{children:ReactNode;submit:(data:FormData)=>Promise<void>;label?:string}){
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function handle(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    const data=new FormData(e.currentTarget)
    setBusy(true);setError('')
    try{await submit(data)}catch(error){setError(describe(error))}
    finally{setBusy(false)}
  }
  return <form className="stack" onSubmit={handle}>{children}{error&&<small role="alert">{error}</small>}
    <div className="dialog-actions"><button className="accent" disabled={busy}>{busy?'Aguarde…':label}</button></div>
  </form>
}
export function SettingsPage({state,prefs,save,api,base,notify,signOut,refresh,changeServer,openAdmin,update,checkUpdate,changeDevice,suppressSounds}:{
  state:Snapshot;prefs:Prefs;save:(p:Prefs)=>void;api:Api;base:string;notify:(e:unknown)=>void;signOut:()=>Promise<void>;refresh:()=>void
  changeServer:(address:string)=>Promise<void>;openAdmin:()=>void;update:{version:string}|null;checkUpdate:()=>Promise<{version:string}|null|undefined>
  changeDevice:(kind:MediaDeviceKind,id:string)=>Promise<void>;suppressSounds:boolean
}){
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([])
  const [working,setWorking]=useState(false)
  const [updating,setUpdating]=useState(false)
  const [switching,setSwitching]=useState(false)
  const currentPrefs=useRef(prefs)
  currentPrefs.current=prefs
  async function versionAction() {
    if(updating||!window.haven)return
    setUpdating(true)
    try {
      if(update) {
        await window.haven.installUpdate(base,update.version)
        notify('Instalador verificado. Conclua a atualização na janela do Windows.')
      } else if(!await checkUpdate())notify('Nenhuma atualização disponível neste servidor.')
    } catch(error){notify(error)}
    finally{setUpdating(false)}
  }
  useEffect(()=>{
    let cancelled=false
    const scan=()=>void navigator.mediaDevices.enumerateDevices().then(items=>{if(!cancelled)setDevices(items)}).catch(error=>{if(!cancelled)notify(error)})
    scan()
    navigator.mediaDevices.addEventListener('devicechange',scan)
    return ()=>{cancelled=true;navigator.mediaDevices.removeEventListener('devicechange',scan)}
  },[notify])
  const list=(label:string,kind:MediaDeviceKind,value:string,change:(s:string)=>void)=><label>{label}<select value={value} disabled={switching} onChange={async e=>{
    const id=e.target.value
    setSwitching(true)
    try{await changeDevice(kind,id);change(id);notify(label+' atualizado.')}
    catch(error){notify(error)}
    finally{setSwitching(false)}
  }}>
    <option value="">Padrão do sistema</option>{devices.filter(d=>d.kind===kind&&d.deviceId&&d.deviceId!=='default').map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||label+' '+(i+1)}</option>)}
  </select></label>
  async function checkDevices(camera:boolean){
    setWorking(true)
    try{
      const sample=await navigator.mediaDevices.getUserMedia(camera?{video:true}:{audio:true})
      try{setDevices(await navigator.mediaDevices.enumerateDevices());notify(camera?'Câmera disponível.':'Microfone disponível.')}
      finally{sample.getTracks().forEach(track=>track.stop())}
    }catch(error){notify(error)}finally{setWorking(false)}
  }
  return <><SectionTitle>Ajustes</SectionTitle><div className="settings-grid">
    <Panel title="Perfil"><Form key={state.me.name+state.me.color} submit={async f=>{
      await api.json('/profile',{name:f.get('name'),color:f.get('color')});refresh();notify('Perfil salvo.')
    }}><Avatar p={state.me}/><label>Nome<input name="name" defaultValue={state.me.name} maxLength={48} required/></label>
      <label>Cor do avatar<select name="color" defaultValue={state.me.color}><option value="verde">Verde-água</option><option value="azul">Azul</option><option value="lavanda">Lavanda</option><option value="areia">Areia</option></select></label><small>@{state.me.handle}</small></Form></Panel>
    <Panel title="Áudio e vídeo"><div className="stack">
      {list('Microfone','audioinput',prefs.mic,mic=>save({...currentPrefs.current,mic}))}
      {list('Câmera','videoinput',prefs.camera,camera=>save({...currentPrefs.current,camera}))}
      {list('Saída de áudio','audiooutput',prefs.output,output=>save({...currentPrefs.current,output}))}
      <div className="inline wrap"><button className="quiet" onClick={()=>void checkDevices(false)} disabled={working}>Testar microfone</button><button className="quiet" onClick={()=>void checkDevices(true)} disabled={working}>Testar câmera</button></div>
      <label className="check"><input type="checkbox" checked={prefs.music} onChange={e=>save({...prefs,music:e.target.checked})}/> Modo música (desliga AGC, cancelamento de eco e redução de ruído)</label>
      <small>O modo música é aplicado na próxima chamada.</small>
    </div></Panel>
    <Panel title="Sons do HAVEN"><div className="stack">
      <label>Volume das notificações · {Math.round(prefs.soundVolume*100)}%
        <input aria-label="Volume das notificações" type="range" min={0} max={100} value={Math.round(prefs.soundVolume*100)} onChange={e=>save({...prefs,soundVolume:e.target.valueAsNumber/100})}/>
      </label>
      {suppressSounds&&<small>Os sons do HAVEN ficam pausados enquanto o áudio do sistema é compartilhado.</small>}
      <details className="sound-settings"><summary>Escolher e testar sons</summary>
        {soundCategories.map(({id,label,description})=><div className="sound-setting" key={id}>
          <label className="check" title={description}><input type="checkbox" checked={prefs.sounds[id]??defaultSoundSettings[id]} onChange={e=>{
            const checked=e.target.checked
            if(!checked)soundEngine.stop(id)
            save({...prefs,sounds:{...prefs.sounds,[id]:checked}})
          }}/>{label}</label>
          <button className="icon" title={'Testar '+label.toLowerCase()} aria-label={'Testar '+label.toLowerCase()} disabled={suppressSounds||prefs.soundVolume===0}
            onClick={()=>void soundEngine.play(id,prefs.soundVolume)}><Play size={15}/></button>
        </div>)}
      </details>
    </div></Panel>
    <Panel title="Compartilhamento e atalhos"><div className="stack">
      <label>Qualidade solicitada<select value={prefs.quality} onChange={e=>save({...prefs,quality:e.target.value as Quality})}>{Object.keys(profiles).map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Limite de transmissão (Mbps)<input type="number" min={0} max={25} value={prefs.bitrate} onChange={e=>save({...prefs,bitrate:Math.max(0,Math.min(25,e.target.valueAsNumber||0))})}/></label>
      <small>Use 0 para escolher o limite do perfil automaticamente.</small>
      <label className="check"><input type="checkbox" checked={prefs.ptt} onChange={e=>save({...prefs,ptt:e.target.checked})}/> Pressione para falar com o HAVEN em foco</label>
      <label>Tecla<select value={prefs.pttKey} onChange={e=>save({...prefs,pttKey:e.target.value})}><option value="Space">Espaço</option><option value="KeyV">V</option><option value="F8">F8</option></select></label>
    </div></Panel>
    <Panel title="Aparência, rede e privacidade"><div className="stack">
      <label>Tema<select value={prefs.theme} onChange={e=>save({...prefs,theme:e.target.value as Prefs['theme']})}><option value="ardosia">Ardósia</option><option value="carvao">Carvão</option></select></label>
      <p>Servidor <strong>{base}</strong></p><p>A mídia ainda não tem criptografia de ponta a ponta.</p>
      {window.haven&&<button className={update?'accent':'quiet'} disabled={updating} onClick={()=>void versionAction()}>{updating?'Verificando…':update?'Instalar HAVEN '+update.version:'Verificar atualizações'}</button>}
      <details><summary>Configuração avançada do servidor</summary>
        <Form key={base} label="Trocar servidor" submit={async form=>{await changeServer(String(form.get('address')))}}><label>Endereço<input type="url" name="address" required defaultValue={base}/></label>
          <small>Ao trocar o endereço, entre com sua conta nesse servidor.</small>
        </Form>
      </details>
      {state.admin&&<button className="quiet" onClick={openAdmin}>Administração</button>}
      <button className="quiet" onClick={()=>void signOut().catch(notify)}>Encerrar sessão</button>
    </div></Panel>
  </div></>
}
