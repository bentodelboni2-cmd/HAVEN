import { useEffect, useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { SlidersHorizontal } from 'lucide-react'

export function LayoutToggle({editing,toggle}:{editing:boolean;toggle:()=>void}) {
  return <button type="button" className={'quiet layout-toggle'+(editing?' selected':'')}
    aria-pressed={editing} aria-label={editing?'Concluir ajuste de layout':'Ajustar layout'}
    title={editing?'Concluir ajuste de layout':'Ajustar layout'} onClick={toggle}>
    <SlidersHorizontal size={17}/>{editing&&<span>Concluir</span>}
  </button>
}

export type ColumnResize = {
  grid: string
  property: string
  storage: string
  measure?: string
  pixels?: boolean
}

const corners = [
  ['nw', 'superior esquerda', -1, -1],
  ['ne', 'superior direita', 1, -1],
  ['sw', 'inferior esquerda', -1, 1],
  ['se', 'inferior direita', 1, 1],
] as const
const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

function stored(key: string) {
  try {
    const value = Number(localStorage.getItem('haven.layout.' + key))
    return Number.isFinite(value) && value > 0 ? value : undefined
  } catch { return undefined }
}

function save(key: string, value?: number) {
  try {
    if (value === undefined) localStorage.removeItem('haven.layout.' + key)
    else localStorage.setItem('haven.layout.' + key, String(value))
  } catch { /* The layout still works when storage is unavailable. */ }
}

function apply(node: HTMLElement, property: string, unit: string, value?: number) {
  if (value === undefined) node.style.removeProperty(property)
  else node.style.setProperty(property, value + unit)
}

export function ResizeHandles({ name, id, column, horizontalOnly = false }: {
  name: string; id: string; column?: ColumnResize; horizontalOnly?: boolean
}) {
  const handles = useRef<HTMLSpanElement>(null)
  const cancelDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => cancelDrag.current?.(), [])

  function targets() {
    const pane = handles.current?.parentElement
    if (!pane) return
    const grid = column ? pane.closest<HTMLElement>(column.grid) : null
    const widthNode = grid || pane
    return {
      pane, grid, widthNode,
      widthKey: column?.storage || id + '.width',
      heightKey: id + '.height',
      widthProp: column?.property || '--pane-width',
      unit: grid && !column?.pixels ? '%' : 'px',
    }
  }

  useLayoutEffect(() => {
    const target = targets()
    if (!target) return
    apply(target.widthNode,target.widthProp,target.unit,stored(target.widthKey))
    if (!horizontalOnly) apply(target.pane,'--pane-height','px',stored(target.heightKey))
  }, [id, column, horizontalOnly])

  function session() {
    const target = targets()
    if (!target) return
    const { pane, grid, widthNode, widthProp, unit, widthKey, heightKey } = target
    const size = pane.getBoundingClientRect()
    const width = column?.measure ? grid?.querySelector(column.measure)?.getBoundingClientRect().width ?? size.width : size.width
    const available = grid?.clientWidth || 1
    const startWidth = stored(widthKey)
    const startHeight = stored(heightKey)
    let nextWidth = startWidth
    let nextHeight = startHeight
    const horizontal = !grid || getComputedStyle(grid).getPropertyValue('--resize-columns').trim() !== 'stacked'
    return {
      move(x?: number, y?: number) {
        if (x !== undefined && horizontal) {
          const wanted = width + (column?.measure ? -x : x)
          nextWidth = x === 0 ? startWidth : unit === '%'
            ? Math.round(Math.max(1,Math.min(90,100*wanted/available))*100)/100
            : Math.max(1,Math.round(Math.min(wanted,window.innerWidth)))
          apply(widthNode,widthProp,unit,nextWidth)
        }
        if (y !== undefined && !horizontalOnly) {
          nextHeight = y === 0 ? startHeight : Math.max(1,Math.round(Math.min(size.height+y,window.innerHeight*1.5)))
          apply(pane,'--pane-height','px',nextHeight)
        }
      },
      finish(keep: boolean) {
        if (keep) {
          if (startWidth !== nextWidth) save(widthKey,nextWidth)
          if (startHeight !== nextHeight) save(heightKey,nextHeight)
        } else {
          apply(widthNode,widthProp,unit,startWidth)
          apply(pane,'--pane-height','px',startHeight)
        }
      },
    }
  }

  function reset() {
    const target = targets()
    if (!target) return
    apply(target.widthNode,target.widthProp,target.unit)
    save(target.widthKey)
    if (!horizontalOnly) {
      apply(target.pane,'--pane-height','px')
      save(target.heightKey)
    }
  }

  function begin(event: PointerEvent<HTMLButtonElement>, sx: number, sy: number) {
    if (cancelDrag.current || !event.isPrimary || event.button !== 0) return
    const change = session()
    if (!change) return
    const { currentTarget:handle, pointerId, clientX, clientY } = event
    const listeners = new AbortController()
    const options = { capture:true, signal:listeners.signal }
    const end = (keep: boolean) => {
      listeners.abort()
      cancelDrag.current = null
      delete handle.dataset.dragging
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
      change.finish(keep)
    }
    cancelDrag.current = () => end(false)
    handle.setPointerCapture(pointerId)
    handle.dataset.dragging = ''
    window.addEventListener('pointermove', next => {
      if (next.pointerId === pointerId) change.move((next.clientX-clientX)*sx,(next.clientY-clientY)*sy)
    }, options)
    window.addEventListener('pointerup', next => { if (next.pointerId === pointerId) end(true) }, options)
    window.addEventListener('pointercancel', next => { if (next.pointerId === pointerId) end(false) }, options)
    window.addEventListener('blur', cancelDrag.current, { signal:listeners.signal })
  }

  function keyboard(event: KeyboardEvent<HTMLButtonElement>, sx: number, sy: number) {
    if (event.key === 'Home') { event.preventDefault(); reset(); return }
    const step = steps[event.key]
    if (!step || (horizontalOnly && !step[0])) return
    event.preventDefault()
    const size = event.shiftKey ? 48 : 16
    const change = session()
    change?.move(step[0] ? step[0]*sx*size : undefined,step[1] ? step[1]*sy*size : undefined)
    change?.finish(true)
  }

  return <span className="resize-handles" ref={handles}>
    {corners.filter(([, ,sx])=>!horizontalOnly||sx===1).map(([corner,label,sx,sy])=><button
      key={corner} type="button" className={'resize-handle '+corner}
      tabIndex={corner==='se'?0:-1}
      aria-label={'Redimensionar '+name+', quina '+label}
      aria-keyshortcuts={horizontalOnly?'ArrowLeft ArrowRight Home':'ArrowLeft ArrowRight ArrowUp ArrowDown Home'}
      title={'Redimensionar '+name+' · clique duplo para restaurar'}
      onPointerDown={event=>begin(event,sx,sy)}
      onKeyDown={event=>keyboard(event,sx,sy)}
      onDoubleClick={reset}
    />)}
  </span>
}
