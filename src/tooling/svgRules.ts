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
  'keyart',
  'environment',
  'prop',
  'moodboard',
  'swatch',
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

/** 概念设计稿分类：允许引用 ref/ 与 raw/（风格定调与制作中参考），豁免生命周期引用检查。固定四个，不得自建。 */
export const CONCEPT_CATEGORIES: readonly string[] = ['keyart', 'environments', 'characters', 'props'];

/** 场景稿分类：根节点必须写 data-scene-id 与场景卡锚定（缺失报 SVG016）。 */
export const SCENE_CATEGORIES: readonly string[] = ['screens', 'hud', 'popups'];

/** 场景 ID 格式：SC- 后至少三位数字（SC-001、SC-012…），与场景卡、审核单共用同一组 ID。 */
export const SCENE_ID_RE = /^SC-\d{3,}$/;

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
  /** 设计稿所在分类目录名（screens / hud / keyart…），用于概念稿豁免判断 */
  category?: string;
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
  const { file, baseDir, fileExists, category } = options;
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

  // —— 场景锚定 ——（场景稿必填并与场景卡互相锚定；其他分类写了才校验格式）
  const sceneId = root.attrs['data-scene-id'];
  if (sceneId !== undefined && !SCENE_ID_RE.test(sceneId)) {
    push('error', 'SVG015', `data-scene-id="${sceneId}" 格式不对：应为 SC-xxx（SC 后至少三位数字），与场景卡一致`, root.line);
  }
  if (sceneId === undefined && SCENE_CATEGORIES.includes(category ?? '')) {
    push('error', 'SVG016', `场景稿（${category}/）根节点缺少 data-scene-id：场景卡与审核单靠它锚定`, root.line);
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
  const isConcept = CONCEPT_CATEGORIES.includes(category ?? '');
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
        continue;
      }
      // 生命周期分级检查：ref/scene 引用报错（拿参考图/预览图当素材），raw 提示（未审，过审迁入 approved 后更新）
      const inAssets = /\/assets\//.test(`/${clean.replace(/\\/g, '/')}`);
      const layer = /\/assets\/(ref|raw|scene|approved)\//.exec(`/${clean.replace(/\\/g, '/')}`)?.[1];
      if (inAssets && !layer) {
        // 目录结构完全按 00-OVERVIEW：素材必须落在四层内，assets/ 根与自建层都不算
        push('error', 'SVG017', `素材 ${href} 未放在 assets/ 生命周期四层（ref/raw/scene/approved）内`, tag.line);
      } else if (layer && !isConcept) {
        if (/\/placeholder-[^/]*$/.test(clean)) {
          push('warn', 'SVG106', `引用了占位素材 ${href}：占位图不能过审、不能发版，记得替换`, tag.line);
        } else if (layer === 'ref') {
          push('error', 'SVG013', `正式稿引用了风格参考 ${href}：ref/ 只允许被风格板与概念稿引用`, tag.line);
        } else if (layer === 'scene') {
          push('error', 'SVG014', `正式稿引用了场景预览 ${href}：scene/ 是审核对照图，不是游戏素材`, tag.line);
        } else if (layer === 'raw') {
          push('warn', 'SVG105', `引用了未审素材 ${href}：人工审核通过迁入 assets/approved/ 后同步更新引用`, tag.line);
        }
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
