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

async function walk(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/** `_` 开头的文件/目录是模板、草稿、私有目录：不进目录，也不参与校验。 */
const isWorkingFile = (path: string): boolean => {
  const base = path.replace(/^.*[\\/]/, '');
  return !base.startsWith('_');
};

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

  for (const dirName of await listProjectDirs(designsDir)) {
    const projectDir = join(designsDir, dirName);
    const meta = await readProjectMeta(projectDir);
    const project = { id: dirName, name: meta.name?.trim() || dirName };

    const files = (await walk(projectDir))
      .filter((f) => extname(f).toLowerCase() === '.svg' && isWorkingFile(f))
      .sort();
    for (const file of files) {
      designs.push(await buildDesignEntry(root, file, project));
    }

    const info = await stat(projectDir);
    projects.push({
      kind: 'project',
      id: dirName,
      name: project.name,
      description: meta.description ?? '',
      path: `public/designs/${dirName}`,
      updatedAt: info.mtime.toISOString(),
      designCount: files.length,
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  designs.sort(
    (a, b) =>
      a.projectId.localeCompare(b.projectId) ||
      a.category.localeCompare(b.category, 'zh-CN') ||
      a.name.localeCompare(b.name, 'zh-CN'),
  );

  const assetFiles = (await walk(assetsDir))
    .filter((f) => ASSET_EXTS.has(extname(f).toLowerCase()))
    .sort();

  const assets: AssetEntry[] = [];
  for (const file of assetFiles) {
    const info = await stat(file);
    const relFromAssets = toPosix(relative(assetsDir, file));
    assets.push({
      kind: 'asset',
      id: relFromAssets,
      name: relFromAssets.replace(/^.*\//, ''),
      ext: extname(file).replace('.', '').toUpperCase(),
      bytes: info.size,
      file: `/assets/${relFromAssets}`,
      path: `public/assets/${relFromAssets}`,
      updatedAt: info.mtime.toISOString(),
    });
  }

  return { generatedAt: new Date().toISOString(), projects, designs, assets };
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
    },
  };
}
