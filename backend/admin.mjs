import { backup } from 'node:sqlite'
import { openDb, issueInvite } from './db.mjs'

const [action, value] = process.argv.slice(2)
if (action !== 'invite' && !(action === 'backup' && value)) throw new Error('Use admin invite [quantidade] ou admin backup caminho.')
const db = openDb(process.env.HAVEN_DB || 'data/haven.sqlite')
try {
  if (action === 'invite') {
    const uses = Number(value || 1)
    if (!Number.isInteger(uses) || uses < 1 || uses > 20) throw new Error('Quantidade de 1 a 20.')
    console.log(issueInvite(db, { uses }))
  } else {
    await backup(db, value)
    console.log('Backup concluído.')
  }
} finally {
  db.close()
}
