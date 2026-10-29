import type { DesignDetail } from '../shared/types.js';
import { clear, copyText, el, fullDate, parseViewBox } from './dom.js';

export interface ViewerElements {
  /** 查看器主容器（hidden 切换） */
  main: HTMLElement;
  canvas: HTMLElement;
  stage: HTMLElement;
  inspector: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  raw: HTMLAnchorElement;
  zoom: HTMLElement;
  gridBtn: HTMLButtonElement;
  fitBtn: HTMLButtonElement;
  fullBtn: HTMLButtonElement;
}

export interface ViewerView {
  /** 加载并渲染一张设计稿（file 为相对项目根的路径，如 public/designs/.../x.svg） */
  open(file: string): Promise<void>;
  show(): void;
  hide(): void;
  isVisible(): boolean;
}

const REL_URL = /^(?:[a-z][a-z0-9+.-]*:|[#/])/i;

/**
 * 稿内相对引用（../assets/…）必须按**稿子自己的 URL**解析。
 * 查看器是把 SVG 内联进工作台文档渲染的，浏览器默认会按页面 URL（站点根）解析，
 * 相对路径就会指向错误的地址。这里在挂载前统一重写成绝对 URL。
 * 素材预览内联 SVG 时同样需要，故导出共用。
 */
export function resolveRelativeRefs(root: Element, base: string): void {
  const XLINK = 'http://www.w3.org/1999/xlink';
  for (const node of root.querySelectorAll('*')) {
    const href = node.getAttribute('href');
    if (href && !REL_URL.test(href)) {
      node.setAttribute('href', new URL(href, base).href);
    }
    const xlinkHref = node.getAttributeNS(XLINK, 'href');
    if (xlinkHref && !REL_URL.test(xlinkHref)) {
      node.setAttributeNS(XLINK, 'xlink:href', new URL(xlinkHref, base).href);
    }
  }
}

/**
 * 查看器视图：从旧 viewer.ts 抽出的可复用控制器。
 * 设计稿画在 Shadow DOM 里：稿内 <style> 不污染工作台，工作台样式也进不去。
 */
export function createViewerView(els: ViewerElements): ViewerView {
  let svg: SVGSVGElement | null = null;
  let box = { x: 0, y: 0, w: 1920, h: 1080 };
  let mode: 'fit' | number = 'fit';

  const shadow = els.stage.attachShadow({ mode: 'open' });

  function layout(): void {
    if (!svg) return;
    const pad = 56;
    const width = Math.max(els.canvas.clientWidth - pad, 160);
    const height = Math.max(els.canvas.clientHeight - pad, 120);
    const scale = mode === 'fit' ? Math.min(width / box.w, height / box.h) : mode;
    els.stage.style.width = `${Math.round(box.w * scale)}px`;
    els.stage.style.height = `${Math.round(box.h * scale)}px`;
    els.zoom.textContent = `${Math.round(scale * 100)}%`;
    els.fitBtn.classList.toggle('is-active', mode === 'fit');
    els.fullBtn.classList.toggle('is-active', mode === 1);
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

    clear(els.inspector);
    els.inspector.append(
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

    els.inspector.append(
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

    els.inspector.append(
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
    clear(els.stage);
    clear(els.inspector);
    els.title.textContent = '加载失败';
    els.subtitle.textContent = '';
    els.stage.append(el('div', { class: 'stage-error' }, [el('p', { text: message })]));
  }

  async function open(file: string): Promise<void> {
    try {
      const detailRes = await fetch(`/api/design?file=${encodeURIComponent(file)}`);
      if (!detailRes.ok) {
        const payload = (await detailRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${detailRes.status}`);
      }
      const detail = (await detailRes.json()) as DesignDetail;
      const entry = detail.entry;

      document.title = `${entry.name} · 设计稿工作台`;
      els.title.textContent = entry.name;
      els.subtitle.textContent = `${entry.path.replace('public/', '')} · ${entry.width}×${entry.height}`;
      els.raw.href = entry.file;
      els.raw.textContent = '原始 SVG ↗';

      const sourceRes = await fetch(entry.file);
      if (!sourceRes.ok) throw new Error(`读取 SVG 失败：HTTP ${sourceRes.status}`);
      const source = await sourceRes.text();

      const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('SVG 解析失败，检查 XML 语法');
      const parsed = doc.documentElement;
      if (parsed.nodeName.toLowerCase() !== 'svg') throw new Error('根节点不是 <svg>');

      svg = document.importNode(parsed, true) as unknown as SVGSVGElement;
      resolveRelativeRefs(svg, new URL(entry.file, location.href).href);
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
      shadow.replaceChildren(svg);

      box = parseViewBox(entry.viewBox || `0 0 ${entry.width} ${entry.height}`);
      renderInspector(detail);
      layout();
    } catch (error) {
      svg = null;
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  function show(): void {
    // 防御：万一画布被别的视图清空过（stage 脱离 DOM），先接回来，否则 Shadow DOM 渲染进孤儿节点
    if (!els.stage.isConnected) els.canvas.prepend(els.stage);
    layout();
  }

  function hide(): void {
    // main 的显隐由 setChrome 统一管理（共享容器，视图各自 hidden 会互相打架）
  }

  els.gridBtn.addEventListener('click', () => {
    els.canvas.classList.toggle('is-grid');
    els.gridBtn.classList.toggle('is-active', els.canvas.classList.contains('is-grid'));
  });
  els.fitBtn.addEventListener('click', () => {
    mode = 'fit';
    layout();
  });
  els.fullBtn.addEventListener('click', () => {
    mode = 1;
    layout();
  });
  new ResizeObserver(() => layout()).observe(els.canvas);

  return { open, show, hide, isVisible: () => !els.main.hidden };
}
