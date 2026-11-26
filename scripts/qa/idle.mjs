import {app,children,clients,connection,db,register,spawn,wait} from './harness.mjs'
let browser
try {
  const start=performance.now()
  const c=await connection(1)
  await c.visible('Entrar no HAVEN')
  const startup=Math.round(performance.now()-start)
  await register(c,1)
  const navigation=performance.now()
  await c.click('Amigos')
  await c.visible('Adicionar amigo')
  const navigate=Math.round(performance.now()-navigation)
  const endpoint='http://127.0.0.1:'+((Number(process.env.HAVEN_QA_PORT)||19241)+1)
  const {webSocketDebuggerUrl}=await fetch(endpoint+'/json/version').then(response=>response.json())
  browser=new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{browser.addEventListener('open',resolve,{once:true});browser.addEventListener('error',reject,{once:true})})
  let id=0
  const processes=()=>new Promise((resolve,reject)=>{
    const seq=++id
    function message(event) {
      const data=JSON.parse(event.data)
      if(data.id!==seq)return
      browser.removeEventListener('message',message)
      if(data.error)reject(Error(data.error.message))
      else resolve(data.result.processInfo)
    }
    browser.addEventListener('message',message)
    browser.send(JSON.stringify({id:seq,method:'SystemInfo.getProcessInfo'}))
  })
  await c.send('Network.enable')
  await c.send('Performance.enable')
  let stateRequests=0
  let changesRequests=0
  const track=event=>{
    const item=JSON.parse(event.data)
    if(item.method!=='Network.requestWillBeSent')return
    const path=new URL(item.params.request.url).pathname
    if(path==='/state')stateRequests++
    if(path==='/changes')changesRequests++
  }
  c.ws.addEventListener('message',track)
  const metrics=async()=>Object.fromEntries((await c.send('Performance.getMetrics')).metrics.map(({name,value})=>[name,value]))
  const before=await metrics()
  const cpuBefore=new Map((await processes()).map(process=>[process.id,process.cpuTime]))
  await wait(30000)
  const after=await metrics()
  const windowProcesses=await processes()
  const totalCpu=windowProcesses.reduce((sum,process)=>sum+Math.max(0,process.cpuTime-(cpuBefore.get(process.id)??process.cpuTime)),0)
  const pids=windowProcesses.map(process=>Number(process.id)).filter(Number.isSafeInteger)
  const windows=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    `$pids=@(${pids.join(',')}); $proc=Get-Process -Id $pids -ErrorAction SilentlyContinue; $pattern='pid_(' + ($pids -join '|') + ')_'; $gpu=Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory -ErrorAction SilentlyContinue | Where-Object Name -Match $pattern; [pscustomobject]@{workingSetMB=[Math]::Round((($proc | Measure-Object WorkingSet64 -Sum).Sum)/1MB);gpuDedicatedMB=if($gpu){[Math]::Round((($gpu | Measure-Object DedicatedUsage -Sum).Sum)/1MB)}else{$null}} | ConvertTo-Json -Compress`],
    {windowsHide:true,stdio:['ignore','pipe','ignore']})
  let memory=''
  windows.stdout.on('data',chunk=>{memory+=chunk})
  const code=await new Promise(resolve=>windows.once('close',resolve))
  const system=code===0?JSON.parse(memory):{}
  console.log(JSON.stringify({
    startupMs:startup,navigateMs:navigate,stateRequests,changesRequests,totalCpuMs:Math.round(totalCpu*1000),...system,
    rendererTaskMs:Math.round((after.TaskDuration-before.TaskDuration)*1000),
    jsHeapMB:+(after.JSHeapUsedSize/1024**2).toFixed(1),
    listeners:after.JSEventListeners
  }))
} finally {
  browser?.close()
  for(const client of clients)client.ws.close()
  for(const child of children)child.kill()
  await app.close()
  db.close()
}
