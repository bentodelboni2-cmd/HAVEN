const {app,BrowserWindow} = require('electron')
app.whenReady().then(()=>{
  const win=new BrowserWindow({title:'HAVEN - Movimento de teste',width:1920,height:1080,useContentSize:true,alwaysOnTop:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  win.loadFile(require('node:path').join(__dirname,'capture-fixture.html'))
})
