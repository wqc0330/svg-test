import { existsSync, type Dirent } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { AssetEntry, DesignDetail, DesignEntry, Manifest, ProjectEntry } from '../shared/types.js';
import { lintSvg } from './svgRules.js';

const ASSET_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.svg',
  '.mp3',
  '.ogg',
  '.wav',
  '.json',
  '.ttf',
  '.woff2',
  '.atlas',
]);

const PROJECT_FILE = 'project.json';

const toPosix = (p: string): string => p.split(sep).join('/');

/** 项目素材库目录名：designs/<项目>/assets/，里面的文件是素材不是设计稿。 */
const PROJECT_ASSETS_DIR = 'assets';

/** 通用扫描：root 下所有文件，返回相对 root 的 posix 路径。跳过 `_` 前缀与隐藏目录。 */
async function walkRel(root: string, prefix = ''): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walkRel(join(root, entry.name), rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files.sort();
}

interface ProjectMeta {
  name?: string;
  description?: string;
  createdAt?: string;
}

async function readProjectMeta(dir: string): Promise<ProjectMeta> {
  try {
    const raw = await readFile(join(dir, PROJECT_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as ProjectMeta;
  } catch {
    // 没有 project.json 或 JSON 坏了：回退到目录名，不阻断目录页
  }
  return {};
}

export async function buildDesignEntry(
  root: string,
  absolutePath: string,
  project: { id: string; name: string },
): Promise<DesignEntry> {
  const designsDir = join(root, 'public', 'designs');
  const source = await readFile(absolutePath, 'utf8');
  const relFromDesigns = toPosix(relative(designsDir, absolutePath));
  const relFromProject = relFromDesigns.slice(project.id.length + 1);
  const id = relFromProject.replace(/\.svg$/i, '');
  const path = `public/designs/${relFromDesigns}`;
  const info = await stat(absolutePath);
  const { meta, annotations, issues } = lintSvg(source, {
    file: `designs/${relFromDesigns}`,
    baseDir: resolve(absolutePath, '..'),
    fileExists: (p) => existsSync(p),
  });
  const folder = id.includes('/') ? (id.split('/')[0] as string) : '';

  return {
    kind: 'design',
    id,
    projectId: project.id,
    projectName: project.name,
    name: meta.name,
    description: meta.description,
    category: meta.category || folder || '未分类',
    viewBox: meta.viewBox,
    width: meta.width,
    height: meta.height,
    tags: meta.tags,
    file: `/designs/${relFromDesigns}`,
    path,
    updatedAt: info.mtime.toISOString(),
    annotationCount: annotations.length,
    issues,
  };
}

/** 列出 public/designs 下的项目目录（跳过 `_` 前缀与隐藏目录）。 */
async function listProjectDirs(designsDir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(designsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export async function buildManifest(root: string): Promise<Manifest> {
  const designsDir = join(root, 'public', 'designs');
  const assetsDir = join(root, 'public', 'assets');

  const projects: ProjectEntry[] = [];
  const designs: DesignEntry[] = [];
  const assets: AssetEntry[] = [];

  for (const dirName of await listProjectDirs(designsDir)) {
    const projectDir = join(designsDir, dirName);
    const meta = await readProjectMeta(projectDir);
    const project = { id: dirName, name: meta.name?.trim() || dirName };

    // 项目内的 assets/ 是素材库，不算设计稿
    const relFiles = await walkRel(projectDir);
    const designFiles = relFiles
      .filter((rel) => extname(rel).toLowerCase() === '.svg' && rel.split('/')[0] !== PROJECT_ASSETS_DIR);
    for (const rel of designFiles) {
      designs.push(await buildDesignEntry(root, join(projectDir, rel), project));
    }

    // 项目私有素材：designs/<项目>/assets/
    assets.push(...(await collectAssets(join(projectDir, PROJECT_ASSETS_DIR), dirName)));

    const info = await stat(projectDir);
    projects.push({
      kind: 'project',
      id: dirName,
      name: project.name,
      description: meta.description ?? '',
      path: `public/designs/${dirName}`,
      updatedAt: info.mtime.toISOString(),
      designCount: designFiles.length,
      assetCount: assets.filter((a) => a.scope === dirName).length,
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  designs.sort(
    (a, b) =>
      a.projectId.localeCompare(b.projectId) ||
      a.category.localeCompare(b.category, 'zh-CN') ||
      a.name.localeCompare(b.name, 'zh-CN'),
  );

  assets.push(...(await collectAssets(assetsDir, 'global')));

  return { generatedAt: new Date().toISOString(), projects, designs, assets };
}

/** 扫描一个素材库目录（scope = 'global' 或项目 id），生成素材条目。目录不存在返回空。 */
async function collectAssets(dir: string, scope: string): Promise<AssetEntry[]> {
  const relFiles = await walkRel(dir);
  const entries: AssetEntry[] = [];
  for (const rel of relFiles) {
    if (!ASSET_EXTS.has(extname(rel).toLowerCase())) continue;
    const abs = join(dir, rel);
    const info = await stat(abs);
    const urlBase =
      scope === 'global' ? 'assets' : `designs/${scope}/${PROJECT_ASSETS_DIR}`;
    entries.push({
      kind: 'asset',
      id: `${scope}:${rel}`,
      name: rel.replace(/^.*\//, ''),
      ext: extname(rel).replace('.', '').toUpperCase(),
      bytes: info.size,
      file: `/${urlBase}/${rel}`,
      path: `public/${urlBase}/${rel}`,
      updatedAt: info.mtime.toISOString(),
      scope,
    });
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

/** 读取单张设计稿详情（查看器用）。file 可传 public/designs/... 或 designs/...。 */
export async function buildDesignDetail(root: string, relPath: string): Promise<DesignDetail | null> {
  const designsDir = resolve(root, 'public', 'designs');
  const normalized = relPath.replace(/^\/+/, '').replace(/^public\//, '');
  const absolute = resolve(root, 'public', normalized);
  if (!absolute.startsWith(designsDir + sep) && absolute !== designsDir) return null;
  if (!existsSync(absolute)) return null;

  const relFromDesigns = toPosix(relative(designsDir, absolute));
  const projectId = relFromDesigns.split('/')[0];
  if (!projectId || projectId === relFromDesigns) return null; // 必须位于某个项目内
  const meta = await readProjectMeta(join(designsDir, projectId));

  const entry = await buildDesignEntry(root, absolute, { id: projectId, name: meta.name?.trim() || projectId });
  const source = await readFile(absolute, 'utf8');
  const { annotations } = lintSvg(source, {
    file: entry.path,
    baseDir: resolve(absolute, '..'),
    fileExists: (p) => existsSync(p),
  });
  return { entry, annotations, issues: entry.issues };
}

/* ------------------------------------------------------------------ */
/* 新建项目                                                             */
/* ------------------------------------------------------------------ */

const INVALID_FOLDER_CHARS = /[\\/:*?"<>|]/;

/** 目录名规则：允许中文，但必须是单层、不含路径分隔符、不以 . / _ 开头。 */
export function projectIdError(id: string): string | null {
  if (id.length === 0) return '目录名不能为空';
  if (id.length > 40) return '目录名不要超过 40 个字符';
  if (INVALID_FOLDER_CHARS.test(id)) return '目录名不能包含 \\ / : * ? " < > |';
  if (id.startsWith('.')) return '目录名不能以 . 开头';
  if (id.startsWith('_')) return '目录名不能以 _ 开头（下划线留给模板与草稿）';
  if (id.includes('..')) return '目录名不能包含连续的点';
  if (/[\u0000-\u001f]/.test(id)) return '目录名不能包含控制字符';
  return null;
}

export type CreateProjectResult =
  | { ok: true; project: ProjectEntry }
  | { ok: false; status: number; message: string };

/** 建 public/designs/<id>/ + project.json。不覆盖已存在的目录。 */
export async function createProject(root: string, name: string, slug: string): Promise<CreateProjectResult> {
  const cleanName = name.trim();
  const cleanId = (slug.trim() || cleanName).replace(/\s+/g, '-');

  if (cleanName.length === 0) return { ok: false, status: 400, message: '项目名称不能为空' };
  if (cleanName.length > 40) return { ok: false, status: 400, message: '项目名称不要超过 40 个字符' };
  const idError = projectIdError(cleanId);
  if (idError) return { ok: false, status: 400, message: idError };

  const projectDir = join(root, 'public', 'designs', cleanId);
  if (existsSync(projectDir)) return { ok: false, status: 409, message: `目录 designs/${cleanId} 已存在` };

  await mkdir(projectDir, { recursive: true });
  await mkdir(join(projectDir, PROJECT_ASSETS_DIR), { recursive: true });
  const createdAt = new Date().toISOString();
  await writeFile(
    join(projectDir, PROJECT_FILE),
    `${JSON.stringify({ name: cleanName, description: '', createdAt }, null, 2)}\n`,
    'utf8',
  );

  const info = await stat(projectDir);
  return {
    ok: true,
    project: {
      kind: 'project',
      id: cleanId,
      name: cleanName,
      description: '',
      path: `public/designs/${cleanId}`,
      updatedAt: info.mtime.toISOString(),
      designCount: 0,
      assetCount: 0,
    },
  };
}
