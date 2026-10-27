import type { AssetEntry, DesignEntry, Manifest } from '../shared/types.js';
import { mountDrawer, type DrawerHandle } from './drawer.js';
import { bytes, clear, el, fromNow, must } from './dom.js';

const app = must<HTMLElement>('#app');
const stat = must<HTMLElement>('#stat');
const search = must<HTMLInputElement>('#search');

let manifest: Manifest | null = null;
let activeProject: string | null = new URLSearchParams(location.search).get('project');
let drawer: DrawerHandle | null = null;

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
  return el(
    'a',
    {
      class: 'card',
      href: `/viewer.html?file=${encodeURIComponent(design.path)}`,
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
}

function assetRow(asset: AssetEntry): HTMLElement {
  return el('a', { class: 'asset', href: asset.file, target: '_blank', rel: 'noreferrer' }, [
    el('span', { class: 'asset-ext', text: asset.ext }),
    el('span', { class: 'asset-name', text: asset.name }),
    el('span', { class: 'asset-path mono', text: asset.path.replace('public/', '') }),
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

function setProject(projectId: string | null): void {
  activeProject = projectId;
  const url = new URL(location.href);
  if (projectId) url.searchParams.set('project', projectId);
  else url.searchParams.delete('project');
  history.replaceState(null, '', url);
  render();
}

function filterBar(): HTMLElement | null {
  if (!manifest || !activeProject) return null;
  const project = manifest.projects.find((p) => p.id === activeProject);
  if (!project) return null;
  const clearBtn = el('button', { class: 'chip-clear', type: 'button', 'aria-label': '清除项目筛选', text: '×' });
  clearBtn.addEventListener('click', () => setProject(null));
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
    el('p', { class: 'muted', text: '写完跑一次 npm run check，确认标注规范通过。' }),
  ]);
}

function emptyAll(): HTMLElement {
  return el('div', { class: 'empty' }, [
    el('h2', { text: '还没有项目' }),
    el('p', { text: '点左上角开关打开项目树，用「＋ 新建」建一个项目。' }),
    el('p', { class: 'mono', text: 'public/designs/<项目>/<分类>/<名字>.svg' }),
    el('p', { class: 'muted', text: '每个项目一个目录，目录里的 project.json 记录显示名称。' }),
  ]);
}

function render(): void {
  if (!manifest) return;

  if (activeProject && !manifest.projects.some((p) => p.id === activeProject)) {
    activeProject = null;
  }

  const query = search.value.trim().toLowerCase();
  const scoped = activeProject ? manifest.designs.filter((d) => d.projectId === activeProject) : manifest.designs;
  const designs = scoped.filter((d) => matches(d, query));
  const assets = query
    ? manifest.assets.filter((a) => `${a.name} ${a.path}`.toLowerCase().includes(query))
    : activeProject
      ? []
      : manifest.assets;

  stat.textContent = `${manifest.projects.length} 个项目 · ${manifest.designs.length} 份稿 · ${manifest.assets.length} 个素材`;

  clear(app);
  const bar = filterBar();
  if (bar) app.append(bar);

  if (manifest.projects.length === 0 && manifest.assets.length === 0) {
    app.append(emptyAll());
    return;
  }

  if (designs.length === 0 && activeProject) {
    const project = manifest.projects.find((p) => p.id === activeProject);
    app.append(query ? el('div', { class: 'empty' }, [el('p', { text: `没有匹配「${query}」的设计稿` })]) : emptyProject(project?.name ?? activeProject));
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
          el('h2', { class: 'section-title', text: '素材' }),
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

async function loadManifest(): Promise<Manifest> {
  const response = await fetch('/api/manifest');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as Manifest;
}

async function boot(): Promise<void> {
  try {
    manifest = await loadManifest();
    render();
    drawer = mountDrawer({
      manifest,
      activeProject,
      activeDesignPath: null,
      onSelectProject: (projectId) => setProject(projectId),
      onSelectDesign: (design) => {
        location.href = `/viewer.html?file=${encodeURIComponent(design.path)}`;
      },
      onCreated: (next, projectId) => {
        manifest = next;
        setProject(projectId);
        drawer?.update(next, { project: projectId, design: null });
      },
    });
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

search.addEventListener('input', render);
void boot();
