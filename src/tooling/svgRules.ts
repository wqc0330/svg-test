import { join, resolve } from 'node:path';
import type { Annotation, LintIssue } from '../shared/types.js';
import { firstText, scanSvg, type ScannedTag } from './svgScan.js';

/**
 * 设计稿语义角色词表。新增角色必须先改这里 + AGENTS.md，避免各稿自造词。
 */
export const ROLES = [
  'screen',
  'layer',
  'background',
  'panel',
  'frame',
  'button',
  'control',
  'item',
  'bar',
  'gauge',
  'slot',
  'hud',
  'minimap',
  'sprite',
  'character',
  'icon',
  'text',
  'label',
  'hotspot',
  'hitbox',
  'overlay',
  'decoration',
  'effect',
] as const;

export type Role = (typeof ROLES)[number];

/** 可交互角色：内部元素允许挂 data-action，且必须带 aria-label。 */
export const INTERACTIVE_ROLES: readonly string[] = ['button', 'control', 'item', 'hotspot', 'slot'];

export interface SvgMeta {
  name: string;
  description: string;
  category: string;
  tags: string[];
  viewBox: string;
  width: number;
  height: number;
}

export interface LintOptions {
  /** 相对项目根目录的路径，用于报告 */
  file: string;
  /** 该 SVG 所在目录的绝对路径，用于检查素材引用是否存在 */
  baseDir?: string;
  fileExists?: (absolutePath: string) => boolean;
}

export interface LintResult {
  meta: SvgMeta;
  annotations: Annotation[];
  issues: LintIssue[];
}

function parseViewBox(value: string): { width: number; height: number } {
  const nums = value
    .split(/[\s,]+/)
    .map((n) => Number.parseFloat(n))
    .filter((n) => Number.isFinite(n));
  if (nums.length !== 4) return { width: 0, height: 0 };
  return { width: nums[2] as number, height: nums[3] as number };
}

function ancestors(tags: ScannedTag[], index: number): ScannedTag[] {
  const result: ScannedTag[] = [];
  let want = (tags[index] as ScannedTag).depth - 1;
  for (let i = index - 1; i >= 0 && want >= 0; i--) {
    const tag = tags[i] as ScannedTag;
    if (tag.depth === want) {
      result.push(tag);
      want -= 1;
    }
  }
  return result;
}

export function readMeta(source: string, fallbackName: string): SvgMeta {
  const { tags, root } = scanSvg(source);
  const attrs = root?.attrs ?? {};
  const viewBox = attrs['viewBox'] ?? '';
  const size = parseViewBox(viewBox);
  return {
    name: firstText(tags, 'title') || attrs['data-name'] || fallbackName,
    description: firstText(tags, 'desc'),
    category: attrs['data-category'] ?? '',
    tags: (attrs['data-tags'] ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    viewBox,
    width: size.width,
    height: size.height,
  };
}

export function lintSvg(source: string, options: LintOptions): LintResult {
  const { file, baseDir, fileExists } = options;
  const { tags, root } = scanSvg(source);
  const issues: LintIssue[] = [];
  const push = (level: 'error' | 'warn', code: string, message: string, line?: number): void => {
    issues.push(line === undefined ? { level, code, message, file } : { level, code, message, file, line });
  };

  const fallbackName = file.replace(/^.*\//, '').replace(/\.svg$/i, '');
  const meta = readMeta(source, fallbackName);

  // —— 结构 ——
  if (!root) {
    push('error', 'SVG001', '找不到根 <svg> 节点');
    return { meta, annotations: [], issues };
  }
  if (!root.attrs['viewBox']) {
    push('error', 'SVG002', '根 <svg> 缺少 viewBox：设计稿必须声明画布坐标系', root.line);
  }
  if (!firstText(tags, 'title')) {
    push('error', 'SVG003', '缺少 <title>：目录页与查看器靠它显示名称', root.line);
  }
  if (!firstText(tags, 'desc')) {
    push('error', 'SVG004', '缺少 <desc>：一句话说明这张稿要表达什么', root.line);
  }
  if (!meta.category) {
    push('warn', 'SVG103', '根 <svg> 缺少 data-category，已回退为目录名', root.line);
  }

  // —— 图层语义 ——
  for (const tag of tags) {
    if (tag.name === 'g' && tag.depth === 1 && !tag.attrs['data-role']) {
      push('error', 'SVG005', '根级图层 <g> 必须标注 data-role（如 layer / background / hud）', tag.line);
    }
    const role = tag.attrs['data-role'];
    if (role && !(ROLES as readonly string[]).includes(role)) {
      push('error', 'SVG006', `data-role="${role}" 不在角色词表内（见 AGENTS.md 6.2）`, tag.line);
    }
    if (tag.name === 'foreignObject') {
      push('error', 'SVG008', '禁止 <foreignObject>：设计稿不要用 HTML 表达布局', tag.line);
    }
    if (tag.name === 'script') {
      push('error', 'SVG012', '禁止 <script>：设计稿是静态交付物，逻辑写在代码里', tag.line);
    }
  }

  // —— 交互契约 ——
  tags.forEach((tag, index) => {
    const action = tag.attrs['data-action'];
    if (!action) return;
    const chain = ancestors(tags, index);
    const hasInteractiveAncestor =
      INTERACTIVE_ROLES.includes(tag.attrs['data-role'] ?? '') ||
      chain.some((a) => INTERACTIVE_ROLES.includes(a.attrs['data-role'] ?? ''));
    if (!hasInteractiveAncestor) {
      push(
        'error',
        'SVG007',
        `<${tag.name} data-action="${action}"> 必须放在 data-role 为 button/control/item/hotspot 的容器内`,
        tag.line,
      );
    }
  });

  for (const tag of tags) {
    const role = tag.attrs['data-role'] ?? '';
    if (!INTERACTIVE_ROLES.includes(role)) continue;
    if (!tag.attrs['aria-label'] && !tag.attrs['data-label']) {
      push('error', 'SVG010', `<g data-role="${role}"> 缺少 aria-label（查看器与可访问性都依赖它）`, tag.line);
    }
    if (!tag.attrs['role']) {
      push('warn', 'SVG104', `<g data-role="${role}"> 建议补 role="${role === 'button' ? 'button' : 'group'}"`, tag.line);
    }
  }

  // —— id 唯一 ——
  const seen = new Set<string>();
  for (const tag of tags) {
    const id = tag.attrs['id'];
    if (!id) continue;
    if (seen.has(id)) push('error', 'SVG011', `id="${id}" 重复`, tag.line);
    seen.add(id);
  }

  // —— 素材引用 ——
  for (const tag of tags) {
    const href = tag.attrs['href'] ?? tag.attrs['xlink:href'];
    if (!href || href.startsWith('#') || href.startsWith('data:')) continue;
    if (/^https?:/i.test(href)) {
      push('warn', 'SVG102', `引用了外部资源 ${href}：设计稿不应依赖网络`, tag.line);
      continue;
    }
    if (baseDir && fileExists) {
      const clean = href.split(/[?#]/)[0] as string;
      const absolute = resolve(join(baseDir, clean));
      if (!fileExists(absolute)) {
        push('error', 'SVG009', `引用的素材不存在：${href}`, tag.line);
      }
    }
  }

  // —— 字体 ——（<style> 里声明过 font-family 视为已覆盖）
  const styleDeclaresFont = /<style[\s\S]*?font-family/i.test(source);
  const textWithoutFont = styleDeclaresFont
    ? []
    : tags.filter(
        (tag) =>
          tag.name === 'text' &&
          !tag.attrs['font-family'] &&
          !ancestors(tags, tags.indexOf(tag)).some((a) => a.attrs['font-family']),
      );
  if (textWithoutFont.length > 0) {
    push('warn', 'SVG101', `${textWithoutFont.length} 处 <text> 未声明 font-family，不同机器渲染会漂移`, (textWithoutFont[0] as ScannedTag).line);
  }

  const annotations: Annotation[] = tags
    .filter((tag) => tag.attrs['data-role'] || tag.attrs['data-action'])
    .map((tag) => {
      const annotation: Annotation = { tag: tag.name, line: tag.line };
      if (tag.attrs['data-role']) annotation.role = tag.attrs['data-role'];
      const label = tag.attrs['aria-label'] ?? tag.attrs['data-label'] ?? tag.text;
      if (label) annotation.label = label;
      if (tag.attrs['data-action']) annotation.action = tag.attrs['data-action'];
      if (tag.attrs['data-state']) annotation.state = tag.attrs['data-state'];
      return annotation;
    });

  return { meta, annotations, issues };
}
