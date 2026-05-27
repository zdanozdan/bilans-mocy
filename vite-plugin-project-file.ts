import fs from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

export const PROJECTS_DIR = 'projects'

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

export const sanitizeProjectFileName = (value: string): string => {
  const trimmed = value.trim()
  const base = path.basename(trimmed || 'projekt.json')
  const withExt = base.toLowerCase().endsWith('.json') ? base : `${base}.json`
  return withExt.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ._-]/gi, '-')
}

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function projectFileApiPlugin(): Plugin {
  return {
    name: 'bilans-project-file-api',
    configureServer(server) {
      const projectsPath = path.resolve(server.config.root, PROJECTS_DIR)

      const ensureProjectsDir = async () => {
        await fs.mkdir(projectsPath, { recursive: true })
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/project')) {
          next()
          return
        }

        try {
          await ensureProjectsDir()
          const url = new URL(req.url, 'http://127.0.0.1')

          if (req.method === 'GET' && url.pathname === '/api/project/status') {
            sendJson(res, 200, { available: true, projectsDir: PROJECTS_DIR })
            return
          }

          if (req.method === 'GET' && url.pathname === '/api/project/list') {
            const entries = await fs.readdir(projectsPath, { withFileTypes: true })
            const files = entries
              .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
              .map((entry) => entry.name)
              .sort((a, b) => a.localeCompare(b, 'pl'))

            sendJson(res, 200, { files })
            return
          }

          if (req.method === 'GET' && url.pathname === '/api/project') {
            const fileName = sanitizeProjectFileName(url.searchParams.get('file') ?? 'projekt.json')
            const filePath = path.join(projectsPath, fileName)

            try {
              const content = await fs.readFile(filePath, 'utf8')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(content)
            } catch {
              sendJson(res, 404, { error: `Brak pliku ${PROJECTS_DIR}/${fileName}` })
            }

            return
          }

          if (req.method === 'PUT' && url.pathname === '/api/project') {
            const body = await readBody(req)
            const parsed = JSON.parse(body) as {
              fileName?: string
              project?: unknown
              devices?: unknown
            }

            if (!parsed.project || !Array.isArray(parsed.devices)) {
              sendJson(res, 400, { error: 'Niepoprawny format zapisu projektu.' })
              return
            }

            const fileName = sanitizeProjectFileName(parsed.fileName ?? 'projekt.json')
            const filePath = path.join(projectsPath, fileName)
            const payload = JSON.stringify(
              { project: parsed.project, devices: parsed.devices },
              null,
              2,
            )

            await fs.writeFile(filePath, payload, 'utf8')
            sendJson(res, 200, {
              ok: true,
              fileName,
              path: `${PROJECTS_DIR}/${fileName}`,
            })
            return
          }

          sendJson(res, 404, { error: 'Nieznany endpoint API projektu.' })
        } catch (error) {
          sendJson(res, 500, {
            error: error instanceof Error ? error.message : 'Błąd zapisu pliku projektu.',
          })
        }
      })
    },
  }
}
