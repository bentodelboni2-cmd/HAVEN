const { app, BrowserWindow, desktopCapturer, ipcMain, net, protocol, session } = require('electron')
const { existsSync } = require('node:fs')
const { join, resolve, sep } = require('node:path')
const { pathToFileURL } = require('node:url')

const origin = 'haven://app'
const entry = origin + '/index.html'
const dist = resolve(__dirname, '../dist')
const preview = process.argv.find(arg => arg.startsWith('--haven-preview='))
if (preview && !app.isPackaged) app.setPath('userData', resolve(preview.slice('--haven-preview='.length)))
protocol.registerSchemesAsPrivileged([{ scheme:'haven', privileges:{standard:true, secure:true, supportFetchAPI:true, corsEnabled:true} }])
const trusted = url => typeof url === 'string' && (url === origin || url.startsWith(origin + '/'))
const windows = new Map()

function openWindow() {
  const win = new BrowserWindow({
    title:'HAVEN', width:1440, height:900, minWidth:850, minHeight:580,
    backgroundColor:'#171c24', frame:false, show:false,
    webPreferences:{ preload:join(__dirname,'preload.cjs'), sandbox:true, contextIsolation:true, nodeIntegration:false, spellcheck:false },
  })
  windows.set(win.webContents.id,{ win })
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
    callback(windows.has(contents.id) && trusted(details.requestingUrl) && details.isMainFrame && ['media','display-capture','speaker-selection'].includes(permission))
  })
  browser.setDisplayMediaRequestHandler(async (request, callback) => {
    const owner = [...windows.values()].find(item => item.win.webContents.mainFrame === request.frame)
    const selection = owner?.selection
    if (owner) owner.selection = undefined
    if (!selection || selection.expires < Date.now() || !request.userGesture || !trusted(request.securityOrigin) || !request.videoRequested) return callback(null)
    try {
      const sources = await desktopCapturer.getSources({types:['window','screen'],thumbnailSize:{width:0,height:0}})
      const video = sources.find(source => source.id === selection.id)
      if (!video) return callback(null)
      callback({video, audio:request.audioRequested && selection.audio ? 'loopback' : undefined})
    } catch {
      callback(null)
    }
  })
  ipcMain.handle('sources:list', async event => {
    const owner = from(event)
    owner.selection = undefined
    const sources = await desktopCapturer.getSources({types:['window','screen'],thumbnailSize:{width:256,height:144}})
    owner.sources = new Set(sources.filter(source => source.id.startsWith('screen:') || source.name !== 'HAVEN').map(source => source.id))
    return sources.filter(source => owner.sources.has(source.id)).map(source => ({id:source.id,name:source.name,thumbnail:source.thumbnail.toDataURL()}))
  })
  ipcMain.handle('sources:select', (event,id,audio) => {
    const owner = from(event)
    if (typeof id !== 'string' || !owner.sources?.has(id) || typeof audio !== 'boolean') throw new Error('Seleção inválida.')
    owner.selection = {id,audio,expires:Date.now()+15000}
    owner.sources = undefined
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
