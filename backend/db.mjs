import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
export const secret = () => randomBytes(32).toString('base64url')
export const digest = value => createHash('sha256').update(value).digest('hex')
export const clock = () => Date.now()

export async function passwordHash(password, salt = secret()) {
  const key = await scrypt(password, salt, 64)
  return salt + ':' + key.toString('hex')
}

export async function passwordMatches(password, stored) {
  const target = stored || ('anonymous:' + '0'.repeat(128))
  const candidate = await passwordHash(password, target.split(':')[0])
  return timingSafeEqual(Buffer.from(target), Buffer.from(candidate))
}

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;')
    runTx(db, () => {
      const version = db.prepare('PRAGMA user_version').get().user_version
      if (version > 1) throw new Error('Banco exige versão mais recente do HAVEN.')
      if (version === 0) db.exec(`
    CREATE TABLE users(id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'verde', seen INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sessions(hash TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE invites(hash TEXT PRIMARY KEY, space TEXT REFERENCES spaces(id), expires INTEGER NOT NULL, uses INTEGER NOT NULL CHECK(uses >= 0));
    CREATE TABLE spaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', theme TEXT NOT NULL DEFAULT 'serra');
    CREATE TABLE members(space TEXT REFERENCES spaces(id), user TEXT REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('owner','admin','member')), PRIMARY KEY(space,user));
    CREATE TABLE rooms(id TEXT PRIMARY KEY, space TEXT NOT NULL REFERENCES spaces(id), name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('voice','text')));
    CREATE TABLE friends(a TEXT REFERENCES users(id), b TEXT REFERENCES users(id), sender TEXT REFERENCES users(id), accepted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(a,b));
    CREATE TABLE calls(id TEXT PRIMARY KEY, creator TEXT NOT NULL REFERENCES users(id), room TEXT REFERENCES rooms(id), code TEXT UNIQUE, created INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE call_members(call TEXT REFERENCES calls(id), user TEXT REFERENCES users(id), state TEXT NOT NULL CHECK(state IN ('invited','joined','declined','left')), PRIMARY KEY(call,user));
    CREATE TABLE messages(id INTEGER PRIMARY KEY, scope TEXT NOT NULL, sender TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, sent INTEGER NOT NULL, kind TEXT, media BLOB);
    CREATE INDEX messages_scope ON messages(scope,id);
    CREATE TABLE reads(scope TEXT NOT NULL, user TEXT REFERENCES users(id), latest INTEGER NOT NULL, PRIMARY KEY(scope,user));
    CREATE TABLE events(id TEXT PRIMARY KEY, space TEXT NOT NULL REFERENCES spaces(id), author TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, starts INTEGER NOT NULL);
    CREATE INDEX members_user ON members(user);
    CREATE INDEX sessions_user ON sessions(user);
    CREATE INDEX call_members_user ON call_members(user);
    CREATE INDEX events_space ON events(space,starts);
    PRAGMA user_version=1;
      `)
    })
  } catch (error) {
    db.close()
    throw error
  }
  return db
}

export function runTx(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function issueInvite(db, { space = null, days = 2, uses = 1 } = {}) {
  const code = secret()
  db.prepare('INSERT INTO invites VALUES(?,?,?,?)').run(digest(code), space, clock() + days * 86_400_000, uses)
  return code
}
