import { existsSync, type Dirent } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import type {
  AssetEntry,
  AssetStatus,
  DesignDetail,
  DesignEntry,
  DocDetail,
  DocEntry,
  Manifest,
  ProjectEntry,
} from '../shared/types.js';
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

/** 项目制作文档目录名：designs/<项目>/docs/，里面的 markdown 是文档不是设计稿。 */
const PROJECT_DOCS_DIR = 'docs';

/** 素材生命周期四层：assets/ 下一级目录名 → 状态。 */
const ASSET_STATUS_DIRS = new Set(['ref', 'raw', 'scene', 'approved']);

/** 仓库根目录下的文档模板（新建项目时复制成项目 docs/ 骨架）。 */
const DOCS_TEMPLATE_DIR = 'docs';

const DOC_TEMPLATE_FILES = [
  '00-OVERVIEW.md',
  '01-GAMEPLAY.md',
  '02-SCENES.md',
  '03-ASSETS.md',
  '04-DECISIONS.md',
  '05-SHIP.md',
] as const;

/** 由素材在 assets/ 下的相对路径推导生命周期状态。 */
function assetStatus(rel: string): AssetStatus {
  const top = rel.split('/')[0] ?? '';
  return ASSET_STATUS_DIRS.has(top) ? (top as AssetStatus) : 'none';
}

/** 占位素材：文件名以 placeholder- 开头（约定见 AGENTS.md）。 */
function isPlaceholder(name: string): boolean {
  return /^placeholder-/i.test(name);
}

/** 从 markdown 原文提取一级标题作为文档名，失败返回 null。 */
function firstHeading(md: string): string | null {
  const match = /^#\s+(.+?)\s*$/m.exec(md);
  if (!match) return null;
  const name = match[1].replace(/[（(].*?[)）]\s*$/, '').trim();
  return name.length > 0 ? name : null;
}

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
  const docs: DocEntry[] = [];
  const assets: AssetEntry[] = [];

  for (const dirName of await listProjectDirs(designsDir)) {
    const projectDir = join(designsDir, dirName);
    const meta = await readProjectMeta(projectDir);
    const project = { id: dirName, name: meta.name?.trim() || dirName };

    // 项目内的 assets/（素材库）与 docs/（制作文档）不算设计稿
    const relFiles = await walkRel(projectDir);
    const reserved = new Set([PROJECT_ASSETS_DIR, PROJECT_DOCS_DIR]);
    const designFiles = relFiles.filter(
      (rel) => extname(rel).toLowerCase() === '.svg' && !reserved.has(rel.split('/')[0] ?? ''),
    );
    for (const rel of designFiles) {
      designs.push(await buildDesignEntry(root, join(projectDir, rel), project));
    }

    // 项目私有素材：designs/<项目>/assets/
    assets.push(...(await collectAssets(join(projectDir, PROJECT_ASSETS_DIR), dirName)));

    // 项目制作文档：designs/<项目>/docs/
    docs.push(...(await collectDocs(join(projectDir, PROJECT_DOCS_DIR), project)));

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
      docCount: docs.filter((d) => d.projectId === dirName).length,
    });
  }

  projects.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  designs.sort(
    (a, b) =>
      a.projectId.localeCompare(b.projectId) ||
      a.category.localeCompare(b.category, 'zh-CN') ||
      a.name.localeCompare(b.name, 'zh-CN'),
  );
  docs.sort((a, b) => a.projectId.localeCompare(b.projectId) || a.id.localeCompare(b.id));

  assets.push(...(await collectAssets(assetsDir, 'global')));

  return { generatedAt: new Date().toISOString(), projects, designs, docs, assets };
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
      status: assetStatus(rel),
      placeholder: isPlaceholder(rel.replace(/^.*\//, '')),
    });
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

/** 扫描项目制作文档目录 designs/<项目>/docs/，生成文档条目。目录不存在返回空。 */
async function collectDocs(
  dir: string,
  project: { id: string; name: string },
): Promise<DocEntry[]> {
  const relFiles = await walkRel(dir);
  const entries: DocEntry[] = [];
  for (const rel of relFiles) {
    if (extname(rel).toLowerCase() !== '.md') continue;
    const abs = join(dir, rel);
    const info = await stat(abs);
    const id = rel.replace(/\.md$/i, '');
    const top = rel.split('/')[0] ?? '';
    const group: DocEntry['group'] = top === 'review' || top === 'specs' ? top : 'doc';
    let name = rel.replace(/^.*\//, '').replace(/\.md$/i, '');
    try {
      const source = await readFile(abs, 'utf8');
      name = firstHeading(source) ?? name;
    } catch {
      // 读不了就用文件名，不阻断清单
    }
    entries.push({
      kind: 'doc',
      id,
      projectId: project.id,
      projectName: project.name,
      name,
      group,
      file: `/designs/${project.id}/${PROJECT_DOCS_DIR}/${rel}`,
      path: `public/designs/${project.id}/${PROJECT_DOCS_DIR}/${rel}`,
      updatedAt: info.mtime.toISOString(),
    });
  }
  return entries;
}

/** 读取项目制作文档详情（文档视图用）。file 可传 public/designs/... 或 designs/...。 */
export async function buildDocDetail(root: string, relPath: string): Promise<DocDetail | null> {
  const designsDir = resolve(root, 'public', 'designs');
  const normalized = relPath.replace(/^\/+/, '').replace(/^public\//, '');
  const absolute = resolve(root, 'public', normalized);
  // 只允许读某个项目 docs/ 目录内的 markdown，防目录穿越
  if (!absolute.startsWith(designsDir + sep) && absolute !== designsDir) return null;
  const relFromDesigns = toPosix(relative(designsDir, absolute));
  const projectId = relFromDesigns.split('/')[0];
  const withinDocs = relFromDesigns.startsWith(`${projectId}/${PROJECT_DOCS_DIR}/`);
  if (!projectId || projectId === relFromDesigns || !withinDocs) return null;
  if (!/\.md$/i.test(absolute) || !existsSync(absolute)) return null;

  const meta = await readProjectMeta(join(designsDir, projectId));
  let content = '';
  try {
    content = await readFile(absolute, 'utf8');
  } catch {
    return null;
  }
  return {
    path: `public/${normalized.replace(/\\/g, '/')}`,
    projectId,
    projectName: meta.name?.trim() || projectId,
    name: firstHeading(content) ?? absolute.replace(/^.*\//, '').replace(/\.md$/i, ''),
    content,
  };
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

/** 建 public/designs/<id>/ + project.json + 素材四层 + 文档骨架。不覆盖已存在的目录。 */
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
  for (const layer of ASSET_STATUS_DIRS) {
    await mkdir(join(projectDir, PROJECT_ASSETS_DIR, layer), { recursive: true });
  }
  const createdAt = new Date().toISOString();
  await writeFile(
    join(projectDir, PROJECT_FILE),
    `${JSON.stringify({ name: cleanName, description: '', createdAt }, null, 2)}\n`,
    'utf8',
  );
  await seedProjectDocs(root, projectDir, cleanName);

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
      docCount: 0,
    },
  };
}

/** 把根目录 docs/ 模板复制成项目文档骨架；模板缺失时至少给一份 00-OVERVIEW。 */
async function seedProjectDocs(root: string, projectDir: string, projectName: string): Promise<void> {
  const docsDir = join(projectDir, PROJECT_DOCS_DIR);
  const templateDir = join(root, DOCS_TEMPLATE_DIR);
  await mkdir(join(docsDir, 'review'), { recursive: true });
  await mkdir(join(docsDir, 'specs'), { recursive: true });
  for (const file of DOC_TEMPLATE_FILES) {
    try {
      await copyFile(join(templateDir, file), join(docsDir, file));
    } catch {
      // 模板缺失不阻断建项目，骨架文件由下面的 OVERVIEW 兜底
    }
  }
  try {
    await copyFile(join(templateDir, 'review', '_TEMPLATE.md'), join(docsDir, 'review', '_TEMPLATE.md'));
    await copyFile(join(templateDir, 'specs', '_TEMPLATE.md'), join(docsDir, 'specs', '_TEMPLATE.md'));
  } catch {
    // 同上
  }
  const overview = [
    `# OVERVIEW · ${projectName}`,
    '',
    '> 项目唯一入口。先看「当前制作单」，再打开对应场景卡；不必通读全部文档。',
    '> 模板说明见仓库根 docs/00-OVERVIEW.md，按本项目情况逐项填写。',
    '',
    '| 项 | 内容 |',
    '|---|---|',
    `| 项目 | ${projectName} |`,
    '| 当前场景 ID | （待定） |',
    '| 本轮明确不做 | |',
    '',
  ].join('\n');
  await writeFile(join(docsDir, '00-OVERVIEW.md'), `${overview}\n`, 'utf8');
}
