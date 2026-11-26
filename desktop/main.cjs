const { app, BrowserWindow, desktopCapturer, ipcMain, net, protocol, safeStorage, session } = require('electron')
const { existsSync } = require('node:fs')
const { readFile, rename, rm, writeFile } = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const { join, resolve, sep } = require('node:path')
const { pathToFileURL } = require('node:url')
const { release } = require('node:os')

const origin = 'haven://app'
const entry = origin + '/index.html'
const dist = resolve(__dirname, '../dist')
const preview = process.argv.find(arg => arg.startsWith('--haven-preview='))
if (preview && !app.isPackaged) app.setPath('userData', resolve(preview.slice('--haven-preview='.length)))
protocol.registerSchemesAsPrivileged([{ scheme:'haven', privileges:{standard:true, secure:true, supportFetchAPI:true, corsEnabled:true} }])
const trusted = url => typeof url === 'string' && (url === origin || url.startsWith(origin + '/'))
const windows = new Map()
let storageQueue = Promise.resolve()
const sessionFile = () => join(app.getPath('userData'), 'haven-session.enc')
function withSession(action) {
  const result = storageQueue.then(action)
  storageQueue = result.catch(() => {})
  return result
}
function validSession(value) {
  try {
    const address = new URL(value.base)
    return typeof value.token === 'string' && /^[\w-]{43}$/.test(value.token)
      && ['https:', 'http:'].includes(address.protocol) && address.origin === value.base
  } catch { return false }
}

function openWindow() {
  const win = new BrowserWindow({
    title:'HAVEN', width:1440, height:900, minWidth:850, minHeight:580,
    backgroundColor:'#171c24', frame:false, show:false,
    webPreferences:{ preload:join(__dirname,'preload.cjs'), sandbox:true, contextIsolation:true, nodeIntegration:false, spellcheck:false },
  })
  windows.set(win.webContents.id,{ win, sourceRequest:0 })
  win.webContents.setWindowOpenHandler(() => ({ action:'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.webContents.on('will-frame-navigate', event => event.preventDefault())
  win.webContents.on('will-attach-webview', event => event.preventDefault())
  const cid = win.webContents.id
  win.on('closed',() => windows.delete(cid))
  win.once('ready-to-show', () => win.show())
  win.loadURL(entry)
  return win
}

function from(event) {
  const owner = windows.get(event.sender.id)
  if (!owner || event.senderFrame !== event.sender.mainFrame || !trusted(event.senderFrame.url)) throw new Error('Origem inválida.')
  return owner
}

app.whenReady().then(async () => {
  if (!existsSync(join(dist,'index.html'))) throw new Error('Execute pnpm build antes de abrir o HAVEN.')
  const browser = session.defaultSession
  browser.protocol.handle('haven', request => {
    const url = new URL(request.url)
    const filepath = resolve(dist,'.' + decodeURIComponent(url.pathname))
    if (url.host !== 'app' || !filepath.startsWith(dist + sep)) return new Response('',{status:404})
    return net.fetch(pathToFileURL(filepath).href)
  })
  browser.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    Boolean(contents && windows.has(contents.id) && trusted(requestingOrigin) && ['media','display-capture','speaker-selection'].includes(permission)))
  browser.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(Boolean(contents && windows.has(contents.id) && trusted(details.requestingUrl) && details.isMainFrame && ['media','display-capture','speaker-selection','fullscreen'].includes(permission)))
  })
  browser.setDisplayMediaRequestHandler((request, callback) => {
    const owner = [...windows.values()].find(item => item.win.webContents.mainFrame === request.frame)
    const selection = owner?.selection
    if (!selection || !request.userGesture || !trusted(request.securityOrigin) || !request.videoRequested) return callback(null)
    owner.selection = undefined
    callback({video:selection, audio:request.audioRequested ? 'loopback' : undefined})
  })
  ipcMain.handle('sources:list', async event => {
    const owner = from(event)
    const request = ++owner.sourceRequest
    owner.selection = undefined
    owner.sources = undefined
    const sources = await desktopCapturer.getSources({types:['window','screen'],thumbnailSize:{width:256,height:144}})
    if (request !== owner.sourceRequest) return []
    const visible = sources.filter(source => source.id.startsWith('screen:') || source.name !== 'HAVEN')
    owner.sources = new Map(visible.map(source => [source.id,{id:source.id,name:source.name}]))
    return visible.map(source => ({id:source.id,name:source.name,thumbnail:source.thumbnail.toDataURL()}))
  })
  ipcMain.handle('sources:select', (event,id) => {
    const owner = from(event)
    owner.selection = typeof id === 'string' ? owner.sources?.get(id) : undefined
    return Boolean(owner.selection)
  })
  ipcMain.handle('sources:clear', event => {
    const owner = from(event)
    ++owner.sourceRequest
    owner.sources = owner.selection = undefined
  })
  ipcMain.handle('sources:audio-isolation', event => {
    from(event)
    return process.platform === 'win32' && Number(release().split('.')[2]) >= 22000
  })
  ipcMain.handle('session:read', event => {
    from(event)
    return withSession(async () => {
      if (process.platform !== 'win32' || !await safeStorage.isAsyncEncryptionAvailable()) return null
      const bytes = await readFile(sessionFile()).catch(error => {
        if (error.code !== 'ENOENT') throw error
      })
      if (!bytes) return null
      const value = JSON.parse((await safeStorage.decryptStringAsync(bytes)).result)
      return validSession(value) ? value : null
    })
  })
  ipcMain.handle('session:save', (event,value) => {
    from(event)
    if (!validSession(value)) throw new Error('Sessão inválida.')
    return withSession(async () => {
      if (process.platform !== 'win32' || !await safeStorage.isAsyncEncryptionAvailable()) return false
      const ciphertext = await safeStorage.encryptStringAsync(JSON.stringify({base:value.base,token:value.token}))
      const temporary = sessionFile() + '.' + randomUUID()
      try {
        await writeFile(temporary, ciphertext, { flag:'wx', mode:0o600 })
        await rename(temporary, sessionFile())
      } finally { await rm(temporary,{force:true}) }
      return true
    })
  })
  ipcMain.handle('session:clear', event => {
    from(event)
    return withSession(() => rm(sessionFile(),{force:true}))
  })
  ipcMain.handle('window:control', (event,action) => {
    const owner = from(event)
    const {win} = owner
    if (action === 'min') win.minimize()
    if (action === 'max') win.isMaximized() ? win.unmaximize() : win.maximize()
    if (action === 'close') win.close()
    if (action === 'hud' && !owner.hud) {
      owner.hud = { bounds:win.getNormalBounds(), maximized:win.isMaximized() }
      if (win.isMaximized()) win.unmaximize()
      win.setMinimumSize(420,150)
      win.setSize(460,160)
      win.setAlwaysOnTop(true,'floating')
    }
    if (action === 'restore' && owner.hud) {
      win.setAlwaysOnTop(false)
      win.setMinimumSize(850,580)
      win.setBounds(owner.hud.bounds)
      if (owner.hud.maximized) win.maximize()
      owner.hud = undefined
    }
  })
  openWindow()
  app.on('activate', () => { if (!windows.size) openWindow() })
})
app.on('window-all-closed', () => app.quit())
