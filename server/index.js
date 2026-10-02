import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const rootDirectory = resolve(import.meta.dirname, '..')
const dataPath = process.env.CAMPUSBUDDY_DB_PATH || join(rootDirectory, 'data', 'campusbuddy.sqlite')
const frontendDirectory = join(rootDirectory, 'dist')
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '0.0.0.0'
const collegeName = process.env.CAMPUS_NAME || 'Agni College of Technology'
const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url')
const sessions = new Map()
const statuses = new Set(['Reported', 'Assigned', 'In progress', 'Resolved'])
const categories = new Set(['Wi-Fi', 'Water', 'Electricity', 'Classroom', 'Restroom', 'Canteen', 'Accessibility'])
const priorities = new Set(['High', 'Medium', 'Low'])
const maxRequestBytes = 3_000_000

mkdirSync(dirname(dataPath), { recursive: true })
const database = new DatabaseSync(dataPath)
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Reported',
    priority TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS votes (
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (issue_id, voter_id)
  );
`)

const selectIssues = database.prepare(`
  SELECT issues.*, COUNT(votes.issue_id) AS supporters
  FROM issues LEFT JOIN votes ON votes.issue_id = issues.id
  GROUP BY issues.id ORDER BY issues.id DESC
`)
const selectIssue = database.prepare(`
  SELECT issues.*, COUNT(votes.issue_id) AS supporters
  FROM issues LEFT JOIN votes ON votes.issue_id = issues.id
  WHERE issues.id = ? GROUP BY issues.id
`)

function json(response, status, value, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers })
  response.end(JSON.stringify(value))
}

function issueId(number) {
  return `CB-${String(number).padStart(4, '0')}`
}

function toIssue(row) {
  return {
    id: issueId(row.id),
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    status: row.status,
    priority: row.priority,
    supporters: Number(row.supporters),
    createdAt: row.created_at,
    reportedBy: row.reported_by,
    department: row.department,
    ...(row.image ? { image: row.image } : {}),
  }
}

function readJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = ''
    let size = 0
    let tooLarge = false
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maxRequestBytes) tooLarge = true
      else body += chunk
    })
    request.on('end', () => {
      if (tooLarge) return rejectBody(Object.assign(new Error('Request body is too large.'), { status: 413 }))
      try {
        resolveBody(body ? JSON.parse(body) : {})
      } catch {
        rejectBody(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }))
      }
    })
    request.on('error', rejectBody)
  })
}

function authenticated(request) {
  const token = request.headers.cookie?.match(/(?:^|;\s*)campusbuddy_session=([^;]+)/)?.[1]
  const expiresAt = token ? sessions.get(token) : undefined
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) sessions.delete(token)
    return false
  }
  return true
}

function parseIssueNumber(id) {
  const match = /^CB-(\d+)$/.exec(id)
  return match ? Number(match[1]) : null
}

function serveStatic(request, response, pathname) {
  if (!existsSync(join(frontendDirectory, 'index.html'))) {
    json(response, 404, { error: 'Frontend build not found. Run npm run build first.' })
    return
  }
  const requestedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname)
  const filePath = resolve(frontendDirectory, `.${requestedPath}`)
  if (!filePath.startsWith(`${frontendDirectory}${process.platform === 'win32' ? '\\' : '/'}`) && filePath !== join(frontendDirectory, 'index.html')) {
    json(response, 403, { error: 'File path is not allowed.' })
    return
  }
  const finalPath = existsSync(filePath) && statSync(filePath).isFile() ? filePath : join(frontendDirectory, 'index.html')
  const mimeTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }
  response.writeHead(200, { 'content-type': mimeTypes[extname(finalPath)] || 'application/octet-stream' })
  createReadStream(finalPath).pipe(response)
}

async function handleRequest(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (request.method === 'GET' && pathname === '/api/health') {
    json(response, 200, { ok: true, collegeName })
    return
  }
  if (request.method === 'GET' && pathname === '/api/config') {
    json(response, 200, { collegeName })
    return
  }
  if (request.method === 'GET' && pathname === '/api/issues') {
    json(response, 200, selectIssues.all().map(toIssue))
    return
  }
  if (request.method === 'GET' && pathname === '/api/votes') {
    const voterId = url.searchParams.get('voterId') || ''
    if (!voterId || voterId.length > 100) {
      json(response, 400, { error: 'A valid voter id is required.' })
      return
    }
    const votedIssues = database.prepare(`
      SELECT issues.id FROM votes JOIN issues ON issues.id = votes.issue_id WHERE votes.voter_id = ?
    `).all(voterId).map((row) => issueId(row.id))
    json(response, 200, { issueIds: votedIssues })
    return
  }
  if (request.method === 'POST' && pathname === '/api/admin/login') {
    const body = await readJson(request)
    const supplied = Buffer.from(String(body.password || ''))
    const expected = Buffer.from(adminPassword)
    const valid = supplied.length === expected.length && timingSafeEqual(supplied, expected)
    if (!valid) {
      json(response, 401, { error: 'That admin password is not correct.' })
      return
    }
    const token = randomBytes(32).toString('hex')
    sessions.set(token, Date.now() + 8 * 60 * 60 * 1000)
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    json(response, 200, { ok: true }, { 'set-cookie': `campusbuddy_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}` })
    return
  }
  if (request.method === 'POST' && pathname === '/api/admin/logout') {
    const token = request.headers.cookie?.match(/(?:^|;\s*)campusbuddy_session=([^;]+)/)?.[1]
    if (token) sessions.delete(token)
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
    json(response, 200, { ok: true }, { 'set-cookie': `campusbuddy_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}` })
    return
  }
  if (request.method === 'POST' && pathname === '/api/issues') {
    const body = await readJson(request)
    const title = String(body.title || '').trim()
    const description = String(body.description || '').trim()
    const category = String(body.category || '')
    const location = String(body.location || '').trim()
    const priority = String(body.priority || '')
    const reportedBy = String(body.reportedBy || '').trim()
    const department = String(body.department || '').trim()
    const image = String(body.image || '')
    if (!title || title.length > 90 || !description || description.length > 1000 || !categories.has(category) || !location || location.length > 120 || !priorities.has(priority) || !reportedBy || reportedBy.length > 80 || department.length > 80) {
      json(response, 400, { error: 'Check the title, description, category, location, impact, and reporter name.' })
      return
    }
    if (image && (!image.startsWith('data:image/') || image.length > 2_100_000)) {
      json(response, 400, { error: 'The photo must be an image smaller than 1.5 MB.' })
      return
    }
    const result = database.prepare(`
      INSERT INTO issues (title, description, category, location, priority, reported_by, department, image, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description, category, location, priority, reportedBy, department, image, new Date().toISOString())
    json(response, 201, toIssue(selectIssue.get(result.lastInsertRowid)))
    return
  }

  const voteMatch = /^\/api\/issues\/(CB-\d+)\/vote$/.exec(pathname)
  if (request.method === 'POST' && voteMatch) {
    const number = parseIssueNumber(voteMatch[1])
    const body = await readJson(request)
    const voterId = String(body.voterId || '')
    if (!voterId || voterId.length > 100 || !selectIssue.get(number)) {
      json(response, 404, { error: 'Issue or voter was not found.' })
      return
    }
    const existingVote = database.prepare('SELECT 1 FROM votes WHERE issue_id = ? AND voter_id = ?').get(number, voterId)
    if (existingVote) database.prepare('DELETE FROM votes WHERE issue_id = ? AND voter_id = ?').run(number, voterId)
    else database.prepare('INSERT INTO votes (issue_id, voter_id, created_at) VALUES (?, ?, ?)').run(number, voterId, new Date().toISOString())
    json(response, 200, toIssue(selectIssue.get(number)))
    return
  }

  const statusMatch = /^\/api\/issues\/(CB-\d+)\/status$/.exec(pathname)
  if (request.method === 'PATCH' && statusMatch) {
    if (!authenticated(request)) {
      json(response, 401, { error: 'Admin sign-in is required to update issue status.' })
      return
    }
    const number = parseIssueNumber(statusMatch[1])
    const body = await readJson(request)
    const status = String(body.status || '')
    if (!statuses.has(status)) {
      json(response, 400, { error: 'Choose a valid issue status.' })
      return
    }
    const result = database.prepare('UPDATE issues SET status = ? WHERE id = ?').run(status, number)
    if (result.changes === 0) {
      json(response, 404, { error: 'Issue was not found.' })
      return
    }
    json(response, 200, toIssue(selectIssue.get(number)))
    return
  }

  if (pathname.startsWith('/api/')) {
    json(response, 404, { error: 'API route not found.' })
    return
  }
  serveStatic(request, response, pathname)
}

createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : 'The server could not complete that request.' })
    else response.destroy(error)
  })
}).listen(port, host, () => {
  console.log(`CampusBuddy API for ${collegeName} listening on http://${host}:${port}`)
  if (!process.env.ADMIN_PASSWORD) console.log(`Temporary admin password for this run: ${adminPassword}`)
  console.log(`SQLite database: ${dataPath}`)
})
