import type { DocDetail } from '../shared/types.js';
import { clear, el, fullDate } from './dom.js';

export interface DocElements {
  /** 文档主容器（hidden 切换，与查看器共用 viewer-main 布局） */
  main: HTMLElement;
  /** markdown 渲染目标 */
  canvas: HTMLElement;
  /** 文档元信息挂载点（复用查看器的侧栏位） */
  meta: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  /** 原始 markdown 链接 */
  raw: HTMLAnchorElement;
}

export interface DocView {
  /** 加载并渲染一份项目文档（path 为相对项目根路径，如 public/designs/<项目>/docs/00-OVERVIEW.md） */
  open(path: string): Promise<void>;
  show(): void;
  hide(): void;
}

/* ------------------------------------------------------------------ */
/* 极简 markdown 渲染（零依赖）：标题 / 表格 / 列表 / 代码 / 引用 / 图片   */
/* game-docs 模板以表格为主，表格是第一优先级。                           */
/* ------------------------------------------------------------------ */

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ESC[ch] ?? ch);
}

/** 行内格式：代码 > 图片 > 链接 > 粗体 > 斜体。全部先转义再替换，避免注入。 */
function inline(text: string, resolveUrl: (url: string) => string): string {
  const codes: string[] = [];
  let out = escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
    return `<img src="${escapeHtml(resolveUrl(src))}" alt="${alt}" loading="lazy" />`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const resolved = resolveUrl(href);
    const external = /^[a-z][a-z0-9+.-]*:/i.test(resolved) || resolved.startsWith('#');
    return `<a href="${escapeHtml(resolved)}"${external ? '' : ' target="_blank" rel="noreferrer"'}>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => `<code>${codes[Number(index)] ?? ''}</code>`);
}

type UrlResolver = (url: string) => string;

function renderBlocks(lines: string[], resolveUrl: UrlResolver): string {
  const html: string[] = [];
  let i = 0;
  const isBlank = (s: string): boolean => s.trim().length === 0;
  const isTableRow = (s: string): boolean => /^\s*\|.*\|\s*$/.test(s);
  const isTableDivider = (s: string): boolean => /^\s*\|[\s:|-]+\|\s*$/.test(s);
  const cells = (s: string): string[] =>
    s
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    // 围栏代码块
    const fence = /^```/.exec(line);
    if (fence) {
      const buffer: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) {
        buffer.push(lines[i] ?? '');
        i += 1;
      }
      i += 1;
      html.push(`<pre><code>${escapeHtml(buffer.join('\n'))}</code></pre>`);
      continue;
    }

    // 标题
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      html.push(`<h${level}>${inline(heading[2] ?? '', resolveUrl)}</h${level}>`);
      i += 1;
      continue;
    }

    // 分隔线
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      html.push('<hr />');
      i += 1;
      continue;
    }

    // 引用块
    if (/^\s*>/.test(line)) {
      const buffer: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) {
        buffer.push((lines[i] ?? '').replace(/^\s*>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${renderBlocks(buffer, resolveUrl)}</blockquote>`);
      continue;
    }

    // 表格：当前行含 | 且下一行是分隔行
    if (isTableRow(line) && isTableDivider(lines[i + 1] ?? '')) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? '')) {
        rows.push(cells(lines[i] ?? ''));
        i += 1;
      }
      const thead = `<thead><tr>${head.map((c) => `<th>${inline(c, resolveUrl)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((row) => `<tr>${row.map((c) => `<td>${inline(c, resolveUrl)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      html.push(`<div class="doc-table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // 任务列表 / 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) {
        const raw = (lines[i] ?? '').replace(/^\s*[-*]\s+/, '');
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(raw);
        if (task) {
          const checked = (task[1] ?? '').toLowerCase() === 'x';
          items.push(
            `<li class="doc-task${checked ? ' is-done' : ''}">` +
              `<span class="doc-checkbox" aria-hidden="true">${checked ? '✓' : ''}</span>` +
              `<span>${inline(task[2] ?? '', resolveUrl)}</span></li>`,
          );
        } else {
          items.push(`<li>${inline(raw, resolveUrl)}</li>`);
        }
        i += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i] ?? '')) {
        items.push(`<li>${inline((lines[i] ?? '').replace(/^\s*\d+[.)]\s+/, ''), resolveUrl)}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // 段落：收集到空行
    const buffer: string[] = [];
    while (i < lines.length && !isBlank(lines[i] ?? '') && !/^(#{1,6}\s|```|\s*>|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i] ?? '') && !isTableRow(lines[i] ?? '')) {
      buffer.push(lines[i] ?? '');
      i += 1;
    }
    if (buffer.length > 0) html.push(`<p>${inline(buffer.join('\n'), resolveUrl)}</p>`);
    else i += 1;
  }
  return html.join('\n');
}

/** 文档视图：与 SVG 查看器共用 viewer-main 布局，markdown 渲染进画布区。 */
export function createDocView(els: DocElements): DocView {
  /**
   * 文档内容挂在自己的容器里，绝不能 clear(els.canvas)——
   * canvas 里还住着查看器的 #stage（Shadow DOM 宿主），清掉它，
   * 之后再看任何稿子都会渲染进脱离 DOM 的孤儿节点，右侧永远空白。
   */
  let host: HTMLElement | null = null;

  function ensureHost(): HTMLElement {
    if (!host || !host.isConnected) {
      host = el('div', { class: 'doc-host' });
      els.canvas.append(host);
    }
    return host;
  }

  function fail(message: string): void {
    const box = ensureHost();
    box.replaceChildren(
      el('div', { class: 'stage-error' }, [el('p', { text: message })]),
    );
    els.title.textContent = '加载失败';
    els.subtitle.textContent = '';
  }

  async function open(path: string): Promise<void> {
    try {
      const response = await fetch(`/api/doc?file=${encodeURIComponent(path)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      const detail = (await response.json()) as DocDetail;

      document.title = `${detail.name} · 设计稿工作台`;
      els.title.textContent = detail.name;
      els.subtitle.textContent = `${detail.projectName} · ${detail.path.replace('public/', '')}`;
      els.raw.href = `/${detail.path.replace(/^public\//, '')}`;

      // markdown 里的相对链接（如 ../assets/ref/anchor.png）按文档自身 URL 解析
      const docUrl = new URL(`/${detail.path.replace(/^public\//, '')}`, location.href).href;
      const resolveUrl = (url: string): string => {
        if (url.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/')) return url;
        try {
          return new URL(url, docUrl).href;
        } catch {
          return url;
        }
      };

      const article = el('article', { class: 'doc' });
      article.innerHTML = renderBlocks(detail.content.split(/\r?\n/), resolveUrl);

      const box = ensureHost();
      box.replaceChildren(article);
      els.canvas.scrollTop = 0;

      // 元信息面板：项目 + 路径 + 更新时间，兼作文档信息栏
      clear(els.meta);
      els.meta.append(
        el('section', { class: 'panel' }, [
          el('h2', { class: 'panel-title', text: '文档信息' }),
          el('div', { class: 'kv-list' }, [
            el('div', { class: 'kv kv-block' }, [
              el('span', { class: 'kv-key', text: '项目' }),
              el('span', { class: 'kv-val', text: detail.projectName }),
            ]),
            el('div', { class: 'kv kv-block' }, [
              el('span', { class: 'kv-key', text: '路径' }),
              el('code', { class: 'kv-path mono', text: detail.path.replace('public/', '') }),
            ]),
            el('div', { class: 'kv' }, [
              el('span', { class: 'kv-key', text: '更新' }),
              el('span', { class: 'kv-val mono', text: fullDate(new Date().toISOString()) }),
            ]),
          ]),
          el('p', { class: 'panel-desc', text: '制作文档在 public/designs/<项目>/docs/ 下，直接改文件即可，目录树实时可见。' }),
        ]),
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  function show(): void {
    if (host) host.hidden = false;
  }

  function hide(): void {
    // main 的显隐与 is-doc 类由 setChrome 统一管理
  }

  return { open, show, hide };
}
