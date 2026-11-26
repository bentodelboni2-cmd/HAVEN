type Note = readonly [start: number, midi: number, duration: number, strength?: number]
type Cue = { label: string; description: string; notes: readonly Note[] }

// Each phrase uses a soft struck fundamental and two rapidly fading overtones.
const cues = {
  incomingCall: { label: 'Chamada recebida', description: 'Alguém está ligando para você.', notes: [[0, 62, .46], [.20, 69, .48, .76], [.50, 66, .65, .72]] },
  outgoingCall: { label: 'Chamando', description: 'Sua chamada está tocando para a outra pessoa.', notes: [[0, 57, .53], [.35, 64, .58, .64]] },
  callJoin: { label: 'Entrada na chamada', description: 'Você entrou na conversa.', notes: [[0, 57, .25], [.10, 62, .31], [.23, 66, .44, .8]] },
  callLeave: { label: 'Saída da chamada', description: 'Você saiu da conversa.', notes: [[0, 66, .25], [.14, 62, .28], [.28, 57, .43, .76]] },
  participantJoin: { label: 'Alguém entrou', description: 'Uma pessoa entrou na chamada.', notes: [[0, 62, .17, .65], [.09, 66, .27, .68]] },
  participantLeave: { label: 'Alguém saiu', description: 'Uma pessoa saiu da chamada.', notes: [[0, 66, .17, .65], [.10, 62, .27, .60]] },
  micOn: { label: 'Microfone ligado', description: 'Seu microfone foi ativado.', notes: [[0, 62, .08, .7], [.055, 69, .14, .62]] },
  micOff: { label: 'Microfone desligado', description: 'Seu microfone foi silenciado.', notes: [[0, 69, .08, .65], [.055, 62, .14, .58]] },
  audioOn: { label: 'Áudio ligado', description: 'Você voltou a ouvir a chamada.', notes: [[0, 54, .13, .75], [.085, 62, .21, .68]] },
  audioOff: { label: 'Áudio desligado', description: 'Você silenciou o áudio da chamada.', notes: [[0, 62, .13, .7], [.085, 54, .21, .66]] },
  shareStart: { label: 'Início do compartilhamento', description: 'O compartilhamento de tela começou.', notes: [[0, 62, .30], [.10, 69, .34, .70], [.20, 74, .39, .64]] },
  shareStop: { label: 'Fim do compartilhamento', description: 'O compartilhamento de tela terminou.', notes: [[0, 74, .20, .62], [.10, 69, .24, .67], [.22, 62, .35, .75]] },
  message: { label: 'Nova mensagem', description: 'Uma mensagem chegou.', notes: [[0, 74, .25, .76], [.045, 69, .28, .42]] },
  friendRequest: { label: 'Pedido de amizade', description: 'Você recebeu um convite de amizade.', notes: [[0, 66, .27], [.13, 69, .27, .7], [.28, 71, .40, .66]] },
  reconnect: { label: 'Reconexão', description: 'A conexão foi restabelecida.', notes: [[0, 57, .22], [.17, 64, .24], [.32, 69, .36, .65]] },
  disconnect: { label: 'Conexão perdida', description: 'A conexão foi interrompida.', notes: [[0, 64, .26], [.23, 55, .4, .76]] },
  important: { label: 'Aviso importante', description: 'Um aviso do HAVEN precisa da sua atenção.', notes: [[0, 69, .31], [.26, 69, .30, .85], [.53, 74, .47, .74]] },
} as const satisfies Record<string, Cue>

export type SoundCategory = keyof typeof cues
const ids = Object.keys(cues) as SoundCategory[]
export const soundCategories = ids.map(id => ({ id, label: cues[id].label, description: cues[id].description }))
export const defaultSoundSettings = Object.fromEntries(ids.map(id => [id, true])) as Record<SoundCategory, boolean>

function render(context: AudioContext, notes: readonly Note[]) {
  const seconds = Math.max(...notes.map(([start, , duration]) => start + duration))
  const rate = context.sampleRate
  const buffer = context.createBuffer(1, Math.ceil(seconds * rate), rate)
  const samples = buffer.getChannelData(0)
  for (const [start, midi, duration, strength = 1] of notes) {
    const offset = Math.round(start * rate)
    const frequency = 440 * 2 ** ((midi - 69) / 12)
    const frames = Math.min(Math.floor(duration * rate), samples.length - offset)
    for (let i = 0; i < frames; i++) {
      const t = i / rate
      const phase = 2 * Math.PI * frequency * t
      const envelope = Math.min(1, t / .012, (duration - t) / .038) * Math.exp(-3.4 * t / duration)
      const overtones = (.19 * Math.sin(2 * phase) + .08 * Math.sin(3 * phase)) * Math.exp(-16 * t)
      samples[offset + i] += .22 * strength * envelope * (Math.sin(phase) + overtones)
    }
  }
  return buffer
}

class HavenSoundEngine {
  private context?: AudioContext
  private buffers = new Map<SoundCategory, AudioBuffer>()
  private active?: { category: SoundCategory; source: AudioBufferSourceNode; gain: GainNode }
  private pending?: SoundCategory
  private generation = 0
  private idleTimer?: number
  private suspending?: Promise<void>
  private preloading = false

  private rest() {
    window.clearTimeout(this.idleTimer)
    this.idleTimer=window.setTimeout(()=>{
      if(!this.active&&!this.pending&&this.context?.state==='running')this.suspending=this.context.suspend().catch(()=>{})
    },1200)
  }

  private buffer(context:AudioContext, category:SoundCategory) {
    const ready=this.buffers.get(category)
    if(ready)return ready
    const buffer=render(context,cues[category].notes)
    this.buffers.set(category,buffer)
    return buffer
  }

  async unlock() {
    try {
      this.context ??= new AudioContext()
      await this.suspending
      if (this.context.state === 'suspended') await this.context.resume()
      this.rest()
    } catch {
      // Text and visual controls remain available when audio output is unavailable.
    }
  }

  async prepare() {
    if(this.preloading)return
    this.preloading=true
    await this.unlock()
    const context=this.context
    if(context)window.requestIdleCallback(()=>{
      this.buffer(context,'incomingCall')
      this.buffer(context,'outgoingCall')
    })
  }

  async play(category: SoundCategory, volume = .65) {
    this.stop()
    if (!Number.isFinite(volume) || volume <= 0) return
    const generation = this.generation
    this.pending = category
    await this.unlock()
    const context = this.context
    if (generation !== this.generation || context?.state !== 'running') return
    this.pending = undefined
    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = this.buffer(context,category)
    gain.gain.value = Math.min(1, volume)
    source.connect(gain).connect(context.destination)
    this.active = { category, source, gain }
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      if (this.active?.source === source) this.active = undefined
      this.rest()
    }
    source.start()
  }

  stop(category?: SoundCategory) {
    if (!category || this.pending === category) {
      this.generation++
      this.pending = undefined
    }
    const active = this.active
    if (!active || (category && active.category !== category)) return
    this.active = undefined
    const now = active.gain.context.currentTime
    active.gain.gain.setValueAtTime(active.gain.gain.value, now)
    active.gain.gain.linearRampToValueAtTime(0, now + .012)
    active.source.stop(now + .012)
    this.rest()
  }
}

export const soundEngine = new HavenSoundEngine()
