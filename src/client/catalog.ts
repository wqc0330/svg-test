import type { AssetEntry, AssetStatus, DesignEntry, Manifest } from '../shared/types.js';
import { mountDrawer, type DrawerHandle } from './drawer.js';
import { createDocView, type DocView } from './docView.js';
import { createViewerView } from './viewerView.js';
import { bytes, clear, el, fromNow, must } from './dom.js';

const app = must<HTMLElement>('#app');
const stat = must<HTMLElement>('#stat');
const search = must<HTMLInputElement>('#search');

// —— 顶栏两套工具区 + 查看器主区 ——
const brand = must<HTMLElement>('#brand');
const backBtn = must<HTMLAnchorElement>('#back');
const viewerHeading = must<HTMLElement>('#viewer-heading');
const catalogTools = must<HTMLElement>('#catalog-tools');
const viewerTools = must<HTMLElement>('#viewer-tools');

const viewer = createViewerView({
  main: must<HTMLElement>('#viewer-main'),
  canvas: must<HTMLElement>('#canvas'),
  stage: must<HTMLElement>('#stage'),
  inspector: must<HTMLElement>('#inspector'),
  title: must<HTMLElement>('#title'),
  subtitle: must<HTMLElement>('#subtitle'),
  raw: must<HTMLAnchorElement>('#raw'),
  zoom: must<HTMLElement>('#zoom'),
  gridBtn: must<HTMLButtonElement>('#toggle-grid'),
  fitBtn: must<HTMLButtonElement>('#zoom-fit'),
  fullBtn: must<HTMLButtonElement>('#zoom-100'),
});

const docView: DocView = createDocView({
  main: must<HTMLElement>('#viewer-main'),
  canvas: must<HTMLElement>('#canvas'),
  meta: must<HTMLElement>('#inspector'),
  title: must<HTMLElement>('#title'),
  subtitle: must<HTMLElement>('#subtitle'),
  raw: must<HTMLAnchorElement>('#raw'),
});

let manifest: Manifest | null = null;
let activeProject: string | null = new URLSearchParams(location.search).get('project');
let drawer: DrawerHandle | null = null;

/* ------------------------------------------------------------------ */
/* 路由：单页内切换 目录 / 查看器，全程不刷新页面                          */
/* ------------------------------------------------------------------ */

function navigate(url: string, replace = false): void {
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  void route();
}

/** 根据 URL 渲染对应视图：有 file 参数进查看器、doc 参数进文档视图，否则进目录。 */
async function route(): Promise<void> {
  if (!manifest) return;
  const params = new URLSearchParams(location.search);
  const file = params.get('file');
  const docPath = params.get('doc');

  if (file) {
    const design = manifest.designs.find((d) => d.path === file);
    activeProject = design?.projectId ?? null;
    setChrome('viewer');
    await viewer.open(file);
    drawer?.update(manifest, { project: activeProject, design: file, doc: null });
    return;
  }

  if (docPath) {
    const doc = manifest.docs.find((d) => d.path === docPath);
    activeProject = doc?.projectId ?? null;
    setChrome('doc');
    await docView.open(docPath);
    drawer?.update(manifest, { project: activeProject, design: null, doc: docPath });
    return;
  }

  const project = params.get('project');
  activeProject = project && manifest.projects.some((p) => p.id === project) ? project : null;
  setChrome('catalog');
  render();
  drawer?.update(manifest, { project: activeProject, design: null, doc: null });
}

function setChrome(view: 'catalog' | 'viewer' | 'doc'): void {
  const isCatalog = view === 'catalog';
  const isViewer = view === 'viewer';
  const isDoc = view === 'doc';
  brand.hidden = !isCatalog;
  backBtn.hidden = isCatalog;
  viewerHeading.hidden = isCatalog;
  viewerTools.hidden = !isViewer;
  catalogTools.hidden = !isCatalog;
  app.hidden = !isCatalog;
  if (isViewer) viewer.show();
  else viewer.hide();
  if (isDoc) docView.show();
  else docView.hide();
}

/* ------------------------------------------------------------------ */
/* 目录视图                                                             */
/* ------------------------------------------------------------------ */

function issueBadge(design: DesignEntry): HTMLElement | null {
  const errors = design.issues.filter((i) => i.level === 'error').length;
  const warns = design.issues.filter((i) => i.level === 'warn').length;
  if (errors === 0 && warns === 0) return null;
  const title = design.issues.map((i) => `${i.code} ${i.message}`).join('\n');
  return el('span', { class: errors > 0 ? 'badge badge-error' : 'badge badge-warn', title }, [
    errors > 0 ? `${errors} 错误` : `${warns} 提示`,
  ]);
}

function designCard(design: DesignEntry): HTMLElement {
  const head = el('div', { class: 'card-head' }, [
    el('span', { class: 'card-title', text: design.name }),
    issueBadge(design),
  ]);
  const card = el(
    'a',
    {
      class: 'card',
      href: `/?file=${encodeURIComponent(design.path)}`,
      title: design.description || design.name,
    },
    [
      el('div', { class: 'card-thumb' }, [el('img', { src: design.file, alt: design.name, loading: 'lazy' })]),
      el('div', { class: 'card-body' }, [
        head,
        el('div', { class: 'card-meta' }, [
          el('span', { class: 'mono', text: design.viewBox ? `${design.width}×${design.height}` : '缺 viewBox' }),
          el('span', { class: 'dot', text: '·' }),
          el('span', { text: `${design.annotationCount} 处标注` }),
          el('span', { class: 'dot', text: '·' }),
          el('span', { text: fromNow(design.updatedAt) }),
        ]),
        el('div', { class: 'card-path mono', text: design.path.replace('public/', '') }),
      ]),
    ],
  );
  // 左键在工作台内打开（局部切换）；Ctrl/Cmd/中键保持默认行为，新标签页打开
  card.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(`/?file=${encodeURIComponent(design.path)}`);
  });
  return card;
}

const ASSET_STATUS_META: Record<AssetStatus, { label: string; className: string; title: string }> = {
  approved: { label: '已通过', className: 'badge badge-approved', title: '位于 assets/approved/，人工审核已通过' },
  raw: { label: '待审', className: 'badge badge-raw', title: '位于 assets/raw/，原始产出未过审' },
  ref: { label: '参考', className: 'badge badge-ref', title: '位于 assets/ref/，风格参考，不进正式稿' },
  scene: { label: '场景图', className: 'badge badge-scene', title: '位于 assets/scene/，审核对照用' },
  none: { label: '未分层', className: 'badge badge-none', title: '未按 ref/raw/scene/approved 分层，建议迁移' },
};

function statusBadge(asset: AssetEntry): HTMLElement | null {
  if (asset.status === 'approved' && !asset.placeholder) return null;
  const meta = ASSET_STATUS_META[asset.status];
  const badges: HTMLElement[] = [];
  if (asset.status !== 'approved') {
    badges.push(el('span', { class: meta.className, title: meta.title, text: meta.label }));
  }
  if (asset.placeholder) {
    badges.push(el('span', { class: 'badge badge-raw', title: '占位素材，不能过审、不能发版', text: '占位' }));
  }
  return badges.length > 0 ? badges[0] ?? null : null;
}

function assetRow(asset: AssetEntry): HTMLElement {
  return el('a', { class: 'asset', href: asset.file, target: '_blank', rel: 'noreferrer' }, [
    el('span', { class: 'asset-ext', text: asset.ext }),
    el('span', { class: 'asset-name', text: asset.name }),
    el('span', { class: 'asset-path mono', text: asset.path.replace('public/', '') }),
    statusBadge(asset),
    el('span', { class: 'asset-size', text: bytes(asset.bytes) }),
  ]);
}

function section(title: string, count: number, children: HTMLElement[]): HTMLElement {
  return el('section', { class: 'section' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { class: 'section-title', text: title }),
      el('span', { class: 'section-count', text: String(count) }),
    ]),
    el('div', { class: 'grid' }, children),
  ]);
}

function matches(design: DesignEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [
    design.name,
    design.id,
    design.category,
    design.projectName,
    design.description,
    design.tags.join(' '),
    design.path,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function filterBar(): HTMLElement | null {
  if (!manifest || !activeProject) return null;
  const project = manifest.projects.find((p) => p.id === activeProject);
  if (!project) return null;
  const clearBtn = el('button', { class: 'chip-clear', type: 'button', 'aria-label': '清除项目筛选', text: '×' });
  clearBtn.addEventListener('click', () => navigate('/'));
  return el('div', { class: 'filter-bar' }, [
    el('span', { class: 'filter-label', text: '项目' }),
    el('span', { class: 'filter-chip' }, [el('span', { text: project.name }), clearBtn]),
  ]);
}

function emptyProject(projectName: string): HTMLElement {
  return el('div', { class: 'empty' }, [
    el('h2', { text: `${projectName} 还没有设计稿` }),
    el('p', { text: '把 .svg 放进这个项目的目录下就会出现在这里。' }),
    el('p', { class: 'mono', text: 'cp public/designs/_template.svg "public/designs/<目录名>/screens/my-screen.svg"' }),
    el('p', { class: 'muted', text: '项目专属素材放进 designs/<目录名>/assets/，全局共享素材放 public/assets/。' }),
  ]);
}

function emptyAll(): HTMLElement {
  return el('div', { class: 'empty' }, [
    el('h2', { text: '还没有项目' }),
    el('p', { text: '点左上角开关打开项目树，用「＋ 新建」建一个项目。' }),
    el('p', { class: 'mono', text: 'public/designs/<项目>/<分类>/<名字>.svg' }),
    el('p', { class: 'muted', text: '每个项目一个目录，project.json 记录显示名称，assets/ 是该项目专属素材库。' }),
  ]);
}

function render(): void {
  if (!manifest) return;

  const query = search.value.trim().toLowerCase();
  const scoped = activeProject ? manifest.designs.filter((d) => d.projectId === activeProject) : manifest.designs;
  const designs = scoped.filter((d) => matches(d, query));

  // 素材按当前视野取：选中项目显示项目素材库，否则显示全局素材库
  const wantedScope = activeProject ?? 'global';
  const visibleAssets = manifest.assets.filter((a) => a.scope === wantedScope);
  const assets = query
    ? visibleAssets.filter((a) => `${a.name} ${a.path}`.toLowerCase().includes(query))
    : visibleAssets;
  const assetTitle = activeProject ? '项目素材' : '全局素材';

  const project = manifest.projects.find((p) => p.id === activeProject);
  if (project) {
    stat.textContent = `${manifest.projects.length} 个项目 · ${manifest.designs.length} 份稿 · ${project.assetCount} 个项目素材`;
  } else {
    stat.textContent = `${manifest.projects.length} 个项目 · ${manifest.designs.length} 份稿 · ${manifest.assets.length} 个素材`;
  }

  clear(app);
  const bar = filterBar();
  if (bar) app.append(bar);

  if (manifest.projects.length === 0 && manifest.assets.length === 0) {
    app.append(emptyAll());
    return;
  }

  if (designs.length === 0 && activeProject) {
    app.append(
      query
        ? el('div', { class: 'empty' }, [el('p', { text: `没有匹配「${query}」的设计稿` })])
        : emptyProject(project?.name ?? activeProject),
    );
    return;
  }

  if (designs.length === 0 && query) {
    app.append(el('div', { class: 'empty' }, [el('p', { text: `没有匹配「${query}」的设计稿` })]));
  }

  const groups = new Map<string, DesignEntry[]>();
  for (const design of designs) {
    const key = activeProject ? design.category : design.projectName;
    const list = groups.get(key) ?? [];
    list.push(design);
    groups.set(key, list);
  }

  for (const [title, list] of groups) {
    app.append(section(title, list.length, list.map((design) => designCard(design))));
  }

  if (assets.length > 0) {
    app.append(
      el('section', { class: 'section' }, [
        el('div', { class: 'section-head' }, [
          el('h2', { class: 'section-title', text: assetTitle }),
          el('span', { class: 'section-count', text: String(assets.length) }),
        ]),
        el(
          'div',
          { class: 'assets' },
          assets.map((asset) => assetRow(asset)),
        ),
      ]),
    );
  }
}

/* ------------------------------------------------------------------ */
/* 启动                                                                 */
/* ------------------------------------------------------------------ */

async function loadManifest(): Promise<Manifest> {
  const response = await fetch('/api/manifest');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as Manifest;
}

async function boot(): Promise<void> {
  try {
    manifest = await loadManifest();
    drawer = mountDrawer({
      manifest,
      activeProject,
      activeDesignPath: null,
      activeDocPath: null,
      onSelectProject: (projectId) => navigate(projectId ? `/?project=${encodeURIComponent(projectId)}` : '/'),
      onSelectDesign: (design) => navigate(`/?file=${encodeURIComponent(design.path)}`),
      onSelectDoc: (doc) => navigate(`/?doc=${encodeURIComponent(doc.path)}`),
      onCreated: (next, projectId) => {
        manifest = next;
        navigate(`/?project=${encodeURIComponent(projectId)}`);
        drawer?.update(next, { project: projectId, design: null, doc: null });
      },
    });
    setChrome('catalog');
    await route();
  } catch (error) {
    clear(app);
    app.append(
      el('div', { class: 'empty' }, [
        el('h2', { text: '读取目录失败' }),
        el('p', { text: '确认开发服务器已启动：npm run dev' }),
        el('p', { class: 'mono', text: String(error) }),
      ]),
    );
  }
}

backBtn.addEventListener('click', (event) => {
  event.preventDefault();
  navigate('/');
});
search.addEventListener('input', render);
window.addEventListener('popstate', () => void route());
void boot();
