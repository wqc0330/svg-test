import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDesignDetail, buildDocDetail, buildManifest, createProject } from '../tooling/manifest.js';

/** dist/server/index.js → 项目根目录 */
const PROJECT_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');
const PORT = Number(process.env['PORT'] ?? 5173);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const NO_STORE = new Set(['.html', '.js', '.css', '.json']);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

async function serveStatic(res: ServerResponse, urlPath: string, method: string): Promise<void> {
  let pathname = urlPath;
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = resolve(join(PUBLIC_DIR, pathname));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
    sendText(res, 403, '403 越界访问');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const ext = extname(filePath).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';
    if (method === 'HEAD') {
      res.writeHead(200, { 'content-type': type, 'content-length': info.size });
      res.end();
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'content-type': type,
      'content-length': body.byteLength,
      'cache-control': NO_STORE.has(ext) ? 'no-store' : 'no-cache',
    });
    res.end(body);
  } catch {
    sendText(res, 404, `404 找不到 ${urlPath}\n\n目录页：/\n设计稿位于 public/designs/，素材位于 public/assets/`);
  }
}

async function readJsonBody(req: IncomingMessage, limit = 8192): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  return JSON.parse(text);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendText(res, 400, '400 路径编码有误');
    return;
  }

  if (method === 'POST') {
    if (pathname !== '/api/projects') {
      sendText(res, 404, `404 没有这个接口：${pathname}`);
      return;
    }
    try {
      const body = (await readJsonBody(req)) as { name?: unknown; slug?: unknown };
      const name = typeof body.name === 'string' ? body.name : '';
      const slug = typeof body.slug === 'string' ? body.slug : '';
      const result = await createProject(PROJECT_ROOT, name, slug);
      if (!result.ok) {
        sendJson(res, result.status, { error: result.message });
        return;
      }
      console.log(`[svg-test] 新建项目 ${result.project.id} → public/designs/${result.project.id}`);
      sendJson(res, 201, { project: result.project });
    } catch (error) {
      sendJson(res, 400, { error: `请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}` });
    }
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD, POST', 'content-type': 'text/plain; charset=utf-8' });
    res.end('405 只支持 GET / HEAD / POST');
    return;
  }

  try {
    if (pathname === '/api/manifest') {
      sendJson(res, 200, await buildManifest(PROJECT_ROOT));
      return;
    }

    if (pathname === '/api/design') {
      const rel = url.searchParams.get('file');
      if (!rel) {
        sendJson(res, 400, { error: '缺少 file 参数，例如 /api/design?file=public/designs/hud/battle-hud.svg' });
        return;
      }
      const detail = await buildDesignDetail(PROJECT_ROOT, rel);
      if (!detail) {
        sendJson(res, 404, { error: `找不到设计稿：${rel}` });
        return;
      }
      sendJson(res, 200, detail);
      return;
    }

    if (pathname === '/api/doc') {
      const rel = url.searchParams.get('file');
      if (!rel) {
        sendJson(res, 400, { error: '缺少 file 参数，例如 /api/doc?file=public/designs/<项目>/docs/00-OVERVIEW.md' });
        return;
      }
      const detail = await buildDocDetail(PROJECT_ROOT, rel);
      if (!detail) {
        sendJson(res, 404, { error: `找不到项目文档（仅限 designs/<项目>/docs/ 内的 .md）：${rel}` });
        return;
      }
      sendJson(res, 200, detail);
      return;
    }

    await serveStatic(res, pathname, method);
  } catch (error) {
    console.error('[svg-test] 处理请求失败', error);
    sendText(res, 500, '500 服务内部错误，详见终端日志');
  }
}

const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  SVG 设计稿工作台`);
  console.log(`  目录  →  http://localhost:${PORT}/`);
  console.log(`  数据  →  http://localhost:${PORT}/api/manifest`);
  console.log(`  校验  →  npm run check\n`);
});
