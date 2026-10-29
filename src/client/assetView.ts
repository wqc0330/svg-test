import type { AssetEntry } from '../shared/types.js';
import { bytes, el, fullDate } from './dom.js';
import { resolveRelativeRefs } from './viewerView.js';

export interface AssetElements {
  /** 主容器（hidden 切换，与查看器 / 文档视图共用 viewer-main 布局） */
  main: HTMLElement;
  /** 预览渲染目标（与查看器 stage、文档 host 同级并存，互不清除） */
  canvas: HTMLElement;
  /** 素材元信息挂载点（复用查看器的侧栏位） */
  meta: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  /** 原始文件链接 */
  raw: HTMLAnchorElement;
}

export interface AssetView {
  /** 打开一个素材（在右侧画布内预览，不新开标签页）。asset 为 null 时显示占位错误。 */
  open(asset: AssetEntry | null): Promise<void>;
  show(): void;
  hide(): void;
}

const RASTER_EXTS = new Set(['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'AVIF']);

const STATUS_LABEL: Record<string, string> = {
  approved: '已通过（approved）',
  raw: '原始产出，未过审（raw）',
  ref: '风格参考，不进正式稿（ref）',
  scene: '场景预览 / 审核对照（scene）',
  none: '未分层（不在这四层里，正式稿不能引用）',
};

/** 素材预览视图：svg 内联进 Shadow DOM（隔离稿内样式），位图直接 <img>。 */
export function createAssetView(els: AssetElements): AssetView {
  // 自带宿主，不动查看器的 #stage：谁也不清谁的容器
  const host = el('div', { class: 'asset-stage' });
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(
    el('style', {
      text:
        ':host{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:32px;box-sizing:border-box;overflow:auto}' +
        'img{max-width:100%;max-height:100%;object-fit:contain}' +
        'svg{max-width:100%;max-height:100%}',
    }),
  );
  els.canvas.append(host);

  function renderMeta(asset: AssetEntry): void {
    clearMeta();
    els.meta.append(
      el('section', { class: 'panel' }, [
        el('h2', { class: 'panel-title', text: '素材信息' }),
        el('div', { class: 'kv-list' }, [
          kvBlock('路径', asset.path.replace('public/', '')),
          kv('归属', asset.scope === 'global' ? '全局素材库' : `项目素材库 · ${asset.scope}`),
          kv('生命周期', STATUS_LABEL[asset.status] ?? asset.status),
          kv('格式 / 大小', `${asset.ext} · ${bytes(asset.bytes)}`),
          kv('更新', fullDate(asset.updatedAt)),
        ]),
        asset.placeholder
          ? el('p', { class: 'panel-desc', text: '⚠ 占位素材（placeholder- 前缀）：不能过审、不能发版，记得替换。' })
          : el('p', { class: 'panel-desc', text: '在工作台内预览；点击树里 / 目录里的素材都会到这里，不再新开标签页。' }),
      ]),
    );
  }

  function kv(key: string, value: string): HTMLElement {
    return el('div', { class: 'kv' }, [
      el('span', { class: 'kv-key', text: key }),
      el('span', { class: 'kv-val mono', text: value }),
    ]);
  }

  function kvBlock(key: string, value: string): HTMLElement {
    return el('div', { class: 'kv kv-block' }, [
      el('span', { class: 'kv-key', text: key }),
      el('code', { class: 'kv-path mono', text: value }),
    ]);
  }

  function clearMeta(): void {
    els.meta.replaceChildren();
  }

  function fail(message: string): void {
    shadow.replaceChildren(
      el('style', {
        text:
          ':host{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:32px;box-sizing:border-box}' +
          '.stage-error{color:#c0392b;font-size:14px}',
      }),
      el('div', { class: 'stage-error' }, [el('p', { text: message })]),
    );
    clearMeta();
    els.title.textContent = '加载失败';
    els.subtitle.textContent = '';
  }

  async function open(asset: AssetEntry | null): Promise<void> {
    if (!asset) {
      fail('素材不存在或已被移动：清单里找不到它。');
      return;
    }
    try {
      document.title = `${asset.name} · 设计稿工作台`;
      els.title.textContent = asset.name;
      els.subtitle.textContent = `${asset.path.replace('public/', '')} · ${asset.ext} · ${bytes(asset.bytes)}`;
      els.raw.href = asset.file;
      els.raw.textContent = '原始文件 ↗';

      const response = await fetch(asset.file);
      if (!response.ok) throw new Error(`读取素材失败：HTTP ${response.status}`);

      if (asset.ext === 'SVG') {
        const source = await response.text();
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
        if (doc.querySelector('parsererror')) throw new Error('SVG 解析失败，检查 XML 语法');
        const parsed = doc.documentElement;
        if (parsed.nodeName.toLowerCase() !== 'svg') throw new Error('根节点不是 <svg>');
        const svg = document.importNode(parsed, true) as unknown as SVGSVGElement;
        // svg 素材内部的相对引用按素材自身 URL 解析，和查看器同一套规则
        resolveRelativeRefs(svg, new URL(asset.file, location.href).href);
        shadow.replaceChildren(
          el('style', {
            text:
              ':host{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:32px;box-sizing:border-box;overflow:auto}' +
              'svg{max-width:100%;max-height:100%}',
          }),
          svg,
        );
      } else if (RASTER_EXTS.has(asset.ext)) {
        shadow.replaceChildren(
          el('style', {
            text:
              ':host{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:32px;box-sizing:border-box;overflow:auto}' +
              'img{max-width:100%;max-height:100%;object-fit:contain}',
          }),
          el('img', { src: asset.file, alt: asset.name }),
        );
      } else {
        // 音频 / 字体等其他类型不强行预览，给出可访问的提示
        shadow.replaceChildren(
          el('style', {
            text: ':host{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:32px;box-sizing:border-box}',
          }),
          el('div', { class: 'stage-error' }, [
            el('p', { text: `${asset.ext} 类型不支持内嵌预览，用右上角「原始文件 ↗」打开。` }),
          ]),
        );
      }

      renderMeta(asset);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }

  function show(): void {
    if (!host.isConnected) els.canvas.append(host);
  }

  function hide(): void {
    // main 的显隐与 is-asset 类由 setChrome 统一管理
  }

  return { open, show, hide };
}
