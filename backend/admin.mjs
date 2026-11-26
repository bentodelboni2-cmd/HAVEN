import { backup } from 'node:sqlite'
import { openDb, issueInvite } from './db.mjs'

const [action, value] = process.argv.slice(2)
if (action !== 'invite' && !(['backup','grant'].includes(action) && value)) throw new Error('Use admin invite [usos], admin backup caminho ou admin grant usuario.')
const db = openDb(process.env.HAVEN_DB || 'data/haven.sqlite')
try {
  if (action === 'invite') {
    const uses = Number(value || 1)
    if (!Number.isInteger(uses) || uses < 1 || uses > 20) throw new Error('Quantidade de 1 a 20.')
    console.log(issueInvite(db, { uses }))
  } else if (action==='grant') {
    const user=db.prepare('SELECT id FROM users WHERE handle=? AND id NOT IN (SELECT user FROM disabled_users)').get(value.toLowerCase())
    if(!user)throw new Error('Usuário ativo não encontrado.')
    db.prepare('INSERT OR IGNORE INTO server_admins VALUES(?)').run(user.id)
    console.log('Administrador habilitado.')
  } else {
    await backup(db, value)
    console.log('Backup concluído.')
  }
} finally {
  db.close()
}
