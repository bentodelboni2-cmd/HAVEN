import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const [target, root] = process.argv.slice(2)
const files = { protocol:'utils/hwstats/memory_linux.go', livekit:'pkg/telemetry/prometheus/node_linux.go' }
if (!Object.hasOwn(files,target) || !root) throw new Error('Use tablet-livekit-patch.mjs protocol|livekit caminho-da-raiz.')
const file = files[target]
const original = readFileSync(join(root,file),'utf8')
function replaceOnce(input, pattern, next) {
  if ([...input.matchAll(pattern)].length !== 1) throw new Error('O checkout não corresponde ao trecho esperado: ' + pattern)
  return input.replace(pattern,next)
}
let updated
if (target === 'protocol') {
  updated = replaceOnce(original,/(e, err := fileExists\(k\)\n\s+if err != nil \{\n\s+)return nil, err/g,'$1return osStat, nil')
} else {
  updated = replaceOnce(original,/^import \(\n\s*"fmt"\n\s*"github\.com\/florianl\/go-tc"\n\)\n\n/gm,'')
  updated = replaceOnce(updated,/^(func getTCStats\(\) \(packets, drops uint32, err error\) \{)\n[\s\S]*?^\}/gm,'$1\n\treturn 0, 0, nil\n}')
}
const temp = mkdtempSync(join(tmpdir(),'haven-livekit-'))
const candidate = join(temp,'candidate.go')
try {
  writeFileSync(candidate,updated)
  const diff = spawnSync('diff',['-u','--label','a/'+file,'--label','b/'+file,join(root,file),candidate],{encoding:'utf8'})
  if (diff.status !== 1) throw diff.error || new Error(diff.stderr || 'Sem diferenças.')
  process.stdout.write(diff.stdout)
} finally {
  unlinkSync(candidate)
  rmdirSync(temp)
}
