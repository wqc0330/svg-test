import type { DesignDetail, Manifest } from '../shared/types.js';
import { mountDrawer } from './drawer.js';
import { clear, copyText, el, fullDate, must, parseViewBox } from './dom.js';

const canvas = must<HTMLElement>('#canvas');
const stage = must<HTMLElement>('#stage');
const inspector = must<HTMLElement>('#inspector');
const titleEl = must<HTMLElement>('#title');
const subtitleEl = must<HTMLElement>('#subtitle');
const rawEl = must<HTMLAnchorElement>('#raw');
const zoomEl = must<HTMLElement>('#zoom');
const gridBtn = must<HTMLButtonElement>('#toggle-grid');
const fitBtn = must<HTMLButtonElement>('#zoom-fit');
const fullBtn = must<HTMLButtonElement>('#zoom-100');

let svg: SVGSVGElement | null = null;
let box = { x: 0, y: 0, w: 1920, h: 1080 };
let mode: 'fit' | number = 'fit';

/**
 * 设计稿画在 Shadow DOM 里：
 * 稿内的 <style> 不会污染工作台，工作台的样式也进不去，渲染结果与真实游戏一致。
 */
const shadow = stage.attachShadow({ mode: 'open' });

function layout(): void {
  if (!svg) return;
  const pad = 56;
  const width = Math.max(canvas.clientWidth - pad, 160);
  const height = Math.max(canvas.clientHeight - pad, 120);
  const scale = mode === 'fit' ? Math.min(width / box.w, height / box.h) : mode;
  stage.style.width = `${Math.round(box.w * scale)}px`;
  stage.style.height = `${Math.round(box.h * scale)}px`;
  zoomEl.textContent = `${Math.round(scale * 100)}%`;
  fitBtn.classList.toggle('is-active', mode === 'fit');
  fullBtn.classList.toggle('is-active', mode === 1);
}

function kv(key: string, value: string): HTMLElement {
  return el('div', { class: 'kv' }, [
    el('span', { class: 'kv-key', text: key }),
    el('span', { class: 'kv-val mono', text: value }),
  ]);
}

/** 长路径单独占一行，避免在窄侧栏里被挤成折行碎片。 */
function kvPath(value: string): HTMLElement {
  return el('div', { class: 'kv kv-block' }, [
    el('span', { class: 'kv-key', text: '路径' }),
    el('code', { class: 'kv-path mono', text: value }),
  ]);
}

function renderInspector(detail: DesignDetail): void {
  const { entry, annotations, issues } = detail;
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  const copyBtn = el('button', { class: 'btn btn-small', type: 'button', text: '复制路径' });
  copyBtn.addEventListener('click', () => {
    void copyText(entry.path).then((ok) => {
      copyBtn.textContent = ok ? '已复制' : '复制失败';
      window.setTimeout(() => {
        copyBtn.textContent = '复制路径';
      }, 1400);
    });
  });

  clear(inspector);
  inspector.append(
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: '概览' }),
      el('div', { class: 'kv-list' }, [
        kvPath(entry.path.replace('public/', '')),
        kv('项目', entry.projectName),
        kv('画布', entry.viewBox || '未声明'),
        kv('分类', entry.category),
        kv('标注', `${annotations.length} 处`),
        kv('更新', fullDate(entry.updatedAt)),
      ]),
      el('p', { class: 'panel-desc', text: entry.description || '（缺少 <desc> 说明）' }),
      el('div', { class: 'panel-actions' }, [copyBtn]),
    ]),
  );

  inspector.append(
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: `语义标注 ${annotations.length}` }),
      annotations.length === 0
        ? el('p', { class: 'panel-desc', text: '还没有任何 data-role 标注。' })
        : el(
            'ul',
            { class: 'anno' },
            annotations.map((a) =>
              el('li', { class: 'anno-item' }, [
                el('code', { class: 'chip', text: a.role ?? a.tag }),
                el('span', { class: 'anno-label', text: a.label ?? '—' }),
                a.action ? el('code', { class: 'anno-action', text: a.action }) : null,
                el('span', { class: 'anno-line mono', text: `L${a.line}` }),
              ]),
            ),
          ),
    ]),
  );

  inspector.append(
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel-title', text: '规范校验' }),
      issues.length === 0
        ? el('p', { class: 'panel-ok', text: '✓ 标注完整' })
        : el(
            'ul',
            { class: 'issues' },
            [...errors, ...warns].map((issue) =>
              el('li', { class: `issue issue-${issue.level}` }, [
                el('code', { class: 'issue-code', text: issue.code }),
                el('span', { text: issue.message }),
                issue.line ? el('span', { class: 'issue-line mono', text: `L${issue.line}` }) : null,
              ]),
            ),
          ),
    ]),
  );
}

function fail(message: string): void {
  shadow.replaceChildren();
  clear(stage);
  clear(inspector);
  titleEl.textContent = '加载失败';
  subtitleEl.textContent = '';
  stage.append(el('div', { class: 'stage-error' }, [el('p', { text: message })]));
}

async function boot(): Promise<void> {
  const file = new URLSearchParams(location.search).get('file');
  if (!file) {
    fail('缺少 file 参数。请从目录页进入。');
    return;
  }

  try {
    const detailRes = await fetch(`/api/design?file=${encodeURIComponent(file)}`);
    if (!detailRes.ok) {
      const payload = (await detailRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `HTTP ${detailRes.status}`);
    }
    const detail = (await detailRes.json()) as DesignDetail;
    const entry = detail.entry;

    document.title = `${entry.name} · 设计稿`;
    titleEl.textContent = entry.name;
    subtitleEl.textContent = `${entry.path.replace('public/', '')} · ${entry.width}×${entry.height}`;
    rawEl.href = entry.file;

    const sourceRes = await fetch(entry.file);
    if (!sourceRes.ok) throw new Error(`读取 SVG 失败：HTTP ${sourceRes.status}`);
    const source = await sourceRes.text();

    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('SVG 解析失败，检查 XML 语法');
    const parsed = doc.documentElement;
    if (parsed.nodeName.toLowerCase() !== 'svg') throw new Error('根节点不是 <svg>');

    svg = document.importNode(parsed, true) as unknown as SVGSVGElement;
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
    shadow.replaceChildren(svg);

    box = parseViewBox(entry.viewBox || `0 0 ${entry.width} ${entry.height}`);
    renderInspector(detail);
    layout();
    void mountNav(detail);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

/** 查看器里的项目树：切项目回目录页，切稿换 URL。 */
async function mountNav(detail: DesignDetail): Promise<void> {
  try {
    const response = await fetch('/api/manifest');
    if (!response.ok) return;
    const manifest = (await response.json()) as Manifest;
    mountDrawer({
      manifest,
      activeProject: detail.entry.projectId,
      activeDesignPath: detail.entry.path,
      onSelectProject: (projectId) => {
        location.href = projectId ? `/?project=${encodeURIComponent(projectId)}` : '/';
      },
      onSelectDesign: (design) => {
        if (design.path === detail.entry.path) return;
        location.href = `/viewer.html?file=${encodeURIComponent(design.path)}`;
      },
    });
  } catch {
    // 项目树加载失败不影响看稿
  }
}

fitBtn.addEventListener('click', () => {
  mode = 'fit';
  layout();
});

fullBtn.addEventListener('click', () => {
  mode = 1;
  layout();
});

gridBtn.addEventListener('click', () => {
  canvas.classList.toggle('is-grid');
  gridBtn.classList.toggle('is-active', canvas.classList.contains('is-grid'));
});

new ResizeObserver(() => layout()).observe(canvas);

void boot();
