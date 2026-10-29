import type { DesignEntry, DocEntry, Manifest } from '../shared/types.js';
import { el } from './dom.js';

export interface DrawerOptions {
  manifest: Manifest;
  /** 当前高亮的项目（目录页筛选） */
  activeProject?: string | null;
  /** 当前高亮的设计稿 path */
  activeDesignPath?: string | null;
  /** 当前高亮的文档 path */
  activeDocPath?: string | null;
  onSelectProject: (projectId: string | null) => void;
  onSelectDesign: (design: DesignEntry) => void;
  onSelectDoc: (doc: DocEntry) => void;
  /** 新建项目成功后回调，参数是刷新后的清单 */
  onCreated?: (manifest: Manifest, projectId: string) => void;
}

export interface DrawerHandle {
  update(manifest: Manifest, active?: { project?: string | null; design?: string | null; doc?: string | null }): void;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

const NS = 'svg-test:';

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(NS + key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(NS + key, value);
  } catch {
    // 隐私模式下 localStorage 不可用，忽略即可
  }
}

/** 折叠状态存「已折叠」的集合：默认全展开，新增项目自然展开。 */
function loadCollapsed(): Set<string> {
  const raw = readStore('collapsed');
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function mountDrawer(options: DrawerOptions): DrawerHandle {
  let state: DrawerOptions = options;
  const collapsed = loadCollapsed();
  const saveCollapsed = (): void => writeStore('collapsed', JSON.stringify([...collapsed]));

  const toggleBtn = el('button', {
    class: 'icon-btn drawer-toggle',
    type: 'button',
    'aria-label': '展开项目树',
    'aria-expanded': 'false',
    title: '项目树',
  });
  toggleBtn.append(barsIcon());

  const backdrop = el('div', { class: 'drawer-backdrop' });

  const treeBox = el('div', { class: 'tree' });
  const foot = el('div', { class: 'drawer-foot' });

  const nameInput = el('input', {
    class: 'field',
    type: 'text',
    placeholder: '项目名称，如 深渊回响',
    maxlength: '40',
    autocomplete: 'off',
    required: '',
  });
  const slugInput = el('input', {
    class: 'field mono',
    type: 'text',
    placeholder: '目录名，默认同项目名',
    maxlength: '40',
    autocomplete: 'off',
  });
  const formError = el('p', { class: 'form-error' });
  const submitBtn = el('button', { class: 'btn btn-primary btn-small', type: 'submit', text: '创建' });
  const cancelBtn = el('button', { class: 'btn btn-small', type: 'button', text: '取消' });
  const newBtn = el('button', { class: 'btn btn-small', type: 'button', text: '＋ 新建' });

  const form = el('form', { class: 'project-form', hidden: '' }, [
    el('div', { class: 'form-title', text: '新建项目' }),
    nameInput,
    slugInput,
    el('div', { class: 'form-actions' }, [submitBtn, cancelBtn]),
    formError,
  ]);

  const drawer = el('aside', { class: 'drawer', 'aria-label': '项目树', 'aria-hidden': 'true' }, [
    el('div', { class: 'drawer-head' }, [
      el('h2', { class: 'drawer-title', text: '项目' }),
      newBtn,
    ]),
    form,
    treeBox,
    foot,
  ]);

  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.prepend(toggleBtn);
  else document.body.prepend(toggleBtn);
  document.body.append(backdrop, drawer);

  /* ---------------- 开合 ---------------- */

  function isNarrow(): boolean {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function setOpen(open: boolean): void {
    drawer.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-on', open);
    document.body.classList.toggle('drawer-open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    writeStore('drawer', open ? '1' : '0');
  }

  const storedOpen = readStore('drawer');
  setOpen(storedOpen === null ? !isNarrow() : storedOpen === '1');

  toggleBtn.addEventListener('click', () => setOpen(!drawer.classList.contains('is-open')));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.classList.contains('is-open') && form.hidden) setOpen(false);
  });

  /* ---------------- 新建项目 ---------------- */

  function openForm(): void {
    form.hidden = false;
    formError.textContent = '';
    nameInput.value = '';
    slugInput.value = '';
    nameInput.focus();
  }

  function closeForm(): void {
    form.hidden = true;
    formError.textContent = '';
  }

  let slugTouched = false;
  slugInput.addEventListener('input', () => {
    slugTouched = slugInput.value.trim().length > 0;
  });
  nameInput.addEventListener('input', () => {
    if (slugTouched) return;
    slugInput.value = nameInput.value.trim().replace(/\s+/g, '-');
  });

  cancelBtn.addEventListener('click', closeForm);
  newBtn.addEventListener('click', () => {
    if (form.hidden) openForm();
    else closeForm();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void createProject();
  });

  async function createProject(): Promise<void> {
    const name = nameInput.value.trim();
    const slug = slugInput.value.trim() || name;
    if (name.length === 0) {
      formError.textContent = '请填写项目名称';
      nameInput.focus();
      return;
    }
    submitBtn.disabled = true;
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      const payload = (await response.json()) as { project?: { id: string }; error?: string };
      if (!response.ok || !payload.project) {
        formError.textContent = payload.error ?? `创建失败：HTTP ${response.status}`;
        return;
      }
      const refreshed = await fetch('/api/manifest');
      if (!refreshed.ok) {
        formError.textContent = `项目已创建，但刷新清单失败：HTTP ${refreshed.status}`;
        return;
      }
      const manifest = (await refreshed.json()) as Manifest;
      collapsed.delete(`p:${payload.project.id}`);
      saveCollapsed();
      closeForm();
      state.manifest = manifest;
      render();
      state.onCreated?.(manifest, payload.project.id);
    } catch (error) {
      formError.textContent = `创建失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      submitBtn.disabled = false;
    }
  }

  /* ---------------- 树 ---------------- */

  function toggleNode(key: string): void {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    saveCollapsed();
    render();
  }

  /** 选中态由抽屉自己维护，点完立刻重画，不依赖外部回调是否回写。 */
  function selectProject(projectId: string | null): void {
    state.activeProject = projectId;
    state.activeDesignPath = null;
    render();
    state.onSelectProject(projectId);
    if (isNarrow()) setOpen(false);
  }

  function selectDesign(design: DesignEntry): void {
    state.activeDesignPath = design.path;
    state.activeDocPath = null;
    state.activeProject = design.projectId;
    render();
    state.onSelectDesign(design);
    if (isNarrow()) setOpen(false);
  }

  function selectDoc(doc: DocEntry): void {
    state.activeDocPath = doc.path;
    state.activeDesignPath = null;
    state.activeProject = doc.projectId;
    render();
    state.onSelectDoc(doc);
    if (isNarrow()) setOpen(false);
  }

  function nodeRow(
    depth: number,
    key: string,
    label: string,
    meta: { count?: number; active?: boolean; kind: 'project' | 'category' | 'design' | 'doc' | 'all'; hasChildren: boolean },
    handlers: { onSelect: () => void; onToggle: () => void },
  ): HTMLElement {
    const isOpen = !collapsed.has(key);
    const row = el('div', {
      class: `tree-row tree-row-${meta.kind}${meta.active ? ' is-active' : ''}`,
      style: `--depth:${depth}`,
    });

    if (meta.hasChildren) {
      const caret = el('button', {
        class: `caret-btn${isOpen ? ' is-open' : ''}`,
        type: 'button',
        'aria-label': isOpen ? '折叠' : '展开',
        'aria-expanded': isOpen ? 'true' : 'false',
      });
      caret.append(el('span', { class: 'caret' }));
      caret.addEventListener('click', (event) => {
        event.stopPropagation();
        handlers.onToggle();
      });
      row.append(caret);
    } else {
      row.append(el('span', { class: 'caret-gap' }));
    }

    row.append(el('span', { class: `tree-dot tree-dot-${meta.kind}` }));
    row.append(el('span', { class: 'tree-label', text: label, title: label }));
    if (meta.count !== undefined && meta.count > 0) {
      row.append(el('span', { class: 'tree-count', text: String(meta.count) }));
    }
    row.addEventListener('click', handlers.onSelect);
    row.tabIndex = 0;
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handlers.onSelect();
      }
    });
    return row;
  }

  function render(): void {
    treeBox.replaceChildren();
    const { projects, designs } = state.manifest;

    if (projects.length === 0) {
      treeBox.append(
        el('div', { class: 'tree-empty' }, [
          el('p', { text: '还没有项目' }),
          el('p', { class: 'tree-empty-hint', text: '点右上「＋ 新建」创建一个，或把稿子放进 designs/<项目>/ 下。' }),
        ]),
      );
    }

    treeBox.append(
      nodeRow(
        0,
        'all',
        '全部设计稿',
        {
          kind: 'all',
          count: designs.length,
          active: state.activeProject === null && !state.activeDesignPath,
          hasChildren: false,
        },
        {
          onSelect: () => selectProject(null),
          onToggle: () => undefined,
        },
      ),
    );

    for (const project of projects) {
      const projectKey = `p:${project.id}`;
      const projectOpen = !collapsed.has(projectKey);
      const projectDesigns = designs.filter((d) => d.projectId === project.id);
      const projectDocs = state.manifest.docs.filter((d) => d.projectId === project.id);

      const categories = new Map<string, DesignEntry[]>();
      for (const design of projectDesigns) {
        const list = categories.get(design.category) ?? [];
        list.push(design);
        categories.set(design.category, list);
      }

      treeBox.append(
        nodeRow(
          0,
          projectKey,
          project.name,
          {
            kind: 'project',
            count: project.designCount,
            active:
              state.activeProject === project.id && !state.activeDesignPath && !state.activeDocPath,
            hasChildren: projectDesigns.length > 0 || projectDocs.length > 0,
          },
          {
            onSelect: () => selectProject(project.id),
            onToggle: () => toggleNode(projectKey),
          },
        ),
      );

      if (!projectOpen) continue;

      if (categories.size === 0 && projectDocs.length === 0) {
        treeBox.append(
          el('div', { class: 'tree-hint', style: '--depth:1' }, [el('span', { text: '暂无设计稿' })]),
        );
        continue;
      }

      for (const [category, list] of categories) {
        const categoryKey = `c:${project.id}/${category}`;
        const categoryOpen = !collapsed.has(categoryKey);
        treeBox.append(
          nodeRow(
            1,
            categoryKey,
            category,
            { kind: 'category', count: list.length, active: false, hasChildren: true },
            {
              onSelect: () => toggleNode(categoryKey),
              onToggle: () => toggleNode(categoryKey),
            },
          ),
        );
        if (!categoryOpen) continue;

        for (const design of list) {
          const active = state.activeDesignPath === design.path;
          treeBox.append(
            nodeRow(
              2,
              `d:${design.path}`,
              design.name,
              { kind: 'design', active, hasChildren: false },
              {
                onSelect: () => selectDesign(design),
                onToggle: () => undefined,
              },
            ),
          );
        }
      }

      // 制作文档分组：docs/ 下的 markdown（含审核单与规格）
      if (projectDocs.length > 0) {
        const docsKey = `c:${project.id}/__docs__`;
        const docsOpen = !collapsed.has(docsKey);
        treeBox.append(
          nodeRow(
            1,
            docsKey,
            '制作文档',
            { kind: 'category', count: projectDocs.length, active: false, hasChildren: true },
            {
              onSelect: () => toggleNode(docsKey),
              onToggle: () => toggleNode(docsKey),
            },
          ),
        );
        if (docsOpen) {
          for (const doc of projectDocs) {
            const active = state.activeDocPath === doc.path;
            treeBox.append(
              nodeRow(
                2,
                `doc:${doc.path}`,
                doc.name,
                { kind: 'doc', active, hasChildren: false },
                {
                  onSelect: () => selectDoc(doc),
                  onToggle: () => undefined,
                },
              ),
            );
          }
        }
      }
    }

    foot.textContent = `${projects.length} 个项目 · ${designs.length} 份设计稿`;
  }

  render();

  return {
    update(manifest, active) {
      state.manifest = manifest;
      if (active && 'project' in active) state.activeProject = active.project ?? null;
      if (active && 'design' in active) state.activeDesignPath = active.design ?? null;
      if (active && 'doc' in active) state.activeDocPath = active.doc ?? null;
      render();
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!drawer.classList.contains('is-open')),
    isOpen: () => drawer.classList.contains('is-open'),
  };
}

function barsIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('aria-hidden', 'true');
  for (const y of [3.5, 8, 12.5]) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '2.5');
    line.setAttribute('x2', '13.5');
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-linecap', 'round');
    svg.append(line);
  }
  return svg;
}
