import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, Eye, EyeOff, Mountain, SlidersHorizontal } from 'lucide-react'
import { ApiError, baseDefault, client, describe, endpoint } from './api'
import { WindowButtons } from './shell'

type Step = 'login' | 'invite' | 'profile'

async function accountServer(value: string) {
  let address: string
  try { address = endpoint(value) }
  catch { throw new Error('Confira o endereço em Servidor de contas.') }
  try {
    const health = await client(address).json<{ok?: boolean}>('/health', undefined, AbortSignal.timeout(6000))
    if (health?.ok === true) return address
  } catch { /* The login form offers the same recovery for an offline or incorrect server. */ }
  if (new URL(address).port === '7880') {
    throw new Error('Essa é a porta de mídia. Em Servidor de contas, use o endereço do HAVEN (normalmente na porta 8787).')
  }
  throw new Error('Sem conexão com o servidor de contas. Confira o endereço e se o HAVEN está rodando no servidor.')
}

export function Login({ base, authorized }: { base: string; authorized: (address: string, token: string, created: boolean) => void }) {
  const [step, setStep] = useState<Step>('login')
  const [invite, setInvite] = useState('')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [address, setAddress] = useState(base)
  const [network, setNetwork] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const firstField = useRef<HTMLInputElement>(null)
  useEffect(() => { firstField.current?.focus() }, [step])

  function move(next: Step) {
    setStep(next)
    setReveal(false)
    setError('')
    if (next === 'login' || step === 'login') setPassword('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (step === 'invite') {
      if (!/^[\w-]{43}$/.test(invite.trim())) {
        setError('Cole o convite completo que você recebeu.')
        firstField.current?.focus()
        return
      }
      move('profile')
      return
    }
    setBusy(true)
    try {
      const origin = await accountServer(address)
      const created = step === 'profile'
      const body = created ? { handle, password, name, invite: invite.trim() } : { handle, password }
      const result = await client(origin).json<{token: string}>(created ? '/auth/register' : '/auth/login', body, AbortSignal.timeout(15000))
      authorized(origin, result.token, created)
    } catch (cause) {
      if (step === 'profile' && cause instanceof ApiError && cause.status === 403) {
        setStep('invite')
        setError('Este convite não está disponível. Confira a chave ou peça outra ao seu grupo.')
      } else if (step === 'login' && cause instanceof ApiError && [400, 401].includes(cause.status)) {
        setError('O usuário ou a senha não conferem. Tente de novo.')
      } else if (cause instanceof DOMException && cause.name === 'TimeoutError') {
        setError('O servidor demorou para responder. Tente de novo.')
      } else {
        setError(describe(cause))
      }
    } finally { setBusy(false) }
  }

  const title = step === 'login' ? 'Entrar no HAVEN' : step === 'invite' ? 'Seu convite' : 'Crie seu perfil'
  return <div className="entry">
    <header className="entry-titlebar"><WindowButtons /></header>
    <main className="entry-layout">
      <div className="entry-landscape" aria-label="HAVEN">
        <div className="entry-wordmark"><Mountain strokeWidth={1.35} aria-hidden="true" /><span>HAVEN</span></div>
      </div>
      <section className="entry-sheet" aria-labelledby="entry-title">
        <form className="entry-form" onSubmit={submit} aria-busy={busy}>
          {step !== 'login' && <button type="button" className="entry-back" disabled={busy} onClick={() => move(step === 'profile' ? 'invite' : 'login')}>
            <ArrowLeft size={15}/>{step === 'profile' ? 'Convite' : 'Voltar para entrar'}
          </button>}
          <h1 id="entry-title">{title}</h1>
          {step === 'invite' ? <>
            <p className="entry-hint">Use a chave que alguém do seu grupo compartilhou com você.</p>
            <label>Chave de convite<input ref={firstField} name="invite" placeholder="Cole sua chave aqui" value={invite} onChange={e => setInvite(e.target.value)} required autoComplete="off" spellCheck={false}/></label>
          </> : <>
            {step === 'profile' && <label>Como quer ser chamado?<input ref={firstField} name="name" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} maxLength={48} required autoComplete="nickname"/></label>}
            <label>Usuário<input ref={step === 'login' ? firstField : undefined} name="handle" placeholder={step === 'profile' ? 'Ex.: lua_silva' : 'Seu nome de usuário'} value={handle} onChange={e => setHandle(e.target.value)}
              required minLength={3} maxLength={24} pattern={step === 'profile' ? '[A-Za-z0-9_]{3,24}' : undefined} title={step === 'profile' ? 'Use de 3 a 24 letras sem acentos, números ou sublinhado.' : undefined} autoComplete="username" spellCheck={false}/></label>
            <div className="password-field"><label htmlFor="entry-password">Senha</label><div className="password-control">
              <input id="entry-password" name="password" placeholder={step === 'profile' ? 'Pelo menos 10 caracteres' : 'Sua senha'} type={reveal ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)} required minLength={step === 'profile' ? 10 : undefined} maxLength={128} autoComplete={step === 'profile' ? 'new-password' : 'current-password'}/>
              <button type="button" aria-label={reveal ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setReveal(!reveal)}>{reveal ? <EyeOff size={17}/> : <Eye size={17}/>}</button>
            </div></div>
          </>}
          {error && <p className="entry-error" role="alert">{error}</p>}
          <button className="accent entry-submit" disabled={busy}>{busy ? (step === 'profile' ? 'Criando sua conta…' : 'Entrando…') : step === 'login' ? 'Entrar' : step === 'invite' ? 'Continuar' : 'Criar conta'}<ArrowRight size={17}/></button>
          {step === 'login' && <div className="entry-invite"><span>Primeira vez aqui?</span><button type="button" disabled={busy} onClick={() => move('invite')}>Tenho um convite</button></div>}
        </form>
        <div className="entry-network">
          <button className="network-toggle" type="button" disabled={busy} aria-expanded={network} aria-controls="server-fields" onClick={() => setNetwork(!network)}><SlidersHorizontal size={15}/>Servidor de contas<ChevronDown size={14}/></button>
          {network && <div id="server-fields" className="network-fields"><label>Endereço do servidor<input type="url" value={address} disabled={busy} onChange={e => setAddress(e.target.value)} placeholder={baseDefault} spellCheck={false}/></label>
            <button type="button" className="text-action" disabled={busy} onClick={() => {setAddress(baseDefault); setError('')}}>Usar servidor deste PC</button></div>}
        </div>
      </section>
    </main>
  </div>
}
