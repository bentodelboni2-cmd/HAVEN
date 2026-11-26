export type Person = { id: string; handle: string; name: string; color: string; seen: number }
export type Friend = Person & { sender: string; accepted: number }
export type Role = 'owner' | 'admin' | 'member'
export type Space = { id: string; name: string; description: string; theme: string; role: Role }
export type Channel = { id: string; name: string; kind: 'voice' | 'text'; space: string }
export type Event = { id: string; space: string; title: string; starts: number }
export type Call = { id: string; name: string; room: string | null; state: 'joined' | 'invited'; pending?: number }
export type Thread = { kind: 'room' | 'dm' | 'call' | 'wall'; target: string }
export type Message = { id: number; name: string; sender: string; body: string; sent: number; color: string; kind: string | null }
export type Snapshot = {
  admin?: boolean
  me: Person; spaces: Space[]; rooms: Channel[]; members: (Person & { space: string; role: Role })[]
  friends: Friend[]; events: Event[]; calls: Call[]; occupancy: {room: string; total: number; screens: string[]}[]
  unread: Record<string, number>; latest: (Thread & Pick<Message,'id'|'name'|'body'|'sent'>)[]
}
export type CaptureSource = { id: string; name: string; thumbnail: string }
declare global {
  interface Window {
    haven?: {
      sources: () => Promise<CaptureSource[]>; select: (id: string) => Promise<boolean>; clearSources: () => Promise<void>
      canIsolateAudio: () => Promise<boolean>
      readSession: () => Promise<{base:string;token:string}|null>
      saveSession: (value:{base:string;token:string}) => Promise<boolean>
      clearSession: () => Promise<void>
      checkUpdate: (base:string) => Promise<{version:string}|null>
      installUpdate: (base:string,version:string) => Promise<boolean>
      window: (action: 'min'|'max'|'close'|'hud'|'restore') => Promise<void>
    }
  }
}
const ngrokDefault = 'https://bagpipe-woven-gruffly.ngrok-free.dev'
export const baseDefault = import.meta.env.VITE_HAVEN_SERVER || ngrokDefault
export const accountServerKey = 'haven.account-server'
export function migrateAccountServer(address: string) {
  return baseDefault===ngrokDefault && address==='http://192.168.0.4:8787' ? baseDefault : address
}
export function endpoint(value: string) {
  const url = new URL(value.trim())
  const privateHost = /^(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && privateHost.test(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Informe a origem HTTPS ou um endereço HTTP da rede local.')
  return url.origin
}
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export function client(base: string, token = '') {
  const request = async (path: string, data?: unknown, signal?: AbortSignal) => {
    const headers = new Headers()
    if (token) headers.set('Authorization','Bearer ' + token)
    if (data !== undefined) headers.set('Content-Type','application/json')
    const response = await fetch(base+path, { headers, signal, redirect:'error', ...(data === undefined ? {} : { method:'POST', body:JSON.stringify(data) }) })
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      throw new ApiError(response.status, detail.error || 'Serviço indisponível.')
    }
    return response
  }
  return {
    json: async <T,>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> => (await request(path,data,signal)).json(),
    blob: async (path: string, signal?: AbortSignal) => (await request(path,undefined,signal)).blob(),
    changes: async (update: () => void, signal: AbortSignal) => {
      const stream = (await request('/changes',undefined,signal)).body?.pipeThrough(new TextDecoderStream())
      if (!stream) return
      const reader = stream.getReader()
      let pending = ''
      try {
        while (!signal.aborted) {
          const {value,done} = await reader.read()
          if (done) break
          pending += value
          let at: number
          while ((at = pending.indexOf('\n\n')) !== -1) {
            if (pending.slice(0,at).startsWith('event: change')) update()
            pending = pending.slice(at+2)
          }
        }
      } finally { reader.releaseLock() }
    },
  }
}
export type Api = ReturnType<typeof client>
export const threadPath = ({kind,target}:Thread) => '/conversations/' + kind + '/' + target
export const describe = (error: unknown) => error instanceof TypeError ? 'Servidor indisponível. Confira a conexão e o endereço.' : error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /,'') : String(error)
export function connectionMessage(base:string, error:unknown, retry=true) {
  const hint=retry?' O HAVEN vai tentar novamente.':''
  if (!navigator.onLine) return 'Sem internet.'+hint
  if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name==='TimeoutError')) return describe(error)
  try {
    const host = new URL(base).hostname
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
      return 'O servidor do HAVEN não respondeu na rede privada. Confira o Tailscale e se o tablet está online.'+hint
    }
  } catch { /* The generic message also covers malformed saved addresses. */ }
  return 'O servidor do HAVEN não respondeu.'+hint
}
export const online = (person: Person) => Date.now() - person.seen < 45000
export const dateTime = (date: number) => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date)
export const time = (date: number) => new Intl.DateTimeFormat('pt-BR',{timeStyle:'short'}).format(date)
