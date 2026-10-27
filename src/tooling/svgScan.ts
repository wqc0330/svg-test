/**
 * 极简 SVG 扫描器：只做本项目需要的事 —— 拿到标签、属性、层级、文本、行号。
 * 不追求完整的 XML 规范，够读设计稿即可；零依赖。
 */

export interface ScannedTag {
  name: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
  /** 0 = 根 <svg> 自身 */
  depth: number;
  parent: string | null;
  /** 标签在源码中的起始偏移 */
  index: number;
  /** 1 基行号 */
  line: number;
  /** 该标签的内部文本（已压缩空白、去嵌套标签），用于 title/desc/text */
  text: string;
  /** 标签体结束偏移（> 之后） */
  bodyEnd: number;
}

export interface ScanResult {
  tags: ScannedTag[];
  root: ScannedTag | null;
}

const TAG_RE =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/\s*([A-Za-z][\w:.-]*)\s*>|<([A-Za-z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

const ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** 无需闭合的标签（在本项目里基本只出现 self-closing 形式） */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'stop', 'use', 'image']);

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!raw) return attrs;
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) {
    const name = m[1];
    if (!name) continue;
    attrs[name] = m[2] ?? m[3] ?? '';
  }
  return attrs;
}

function cleanText(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scanSvg(source: string): ScanResult {
  const tags: ScannedTag[] = [];
  const stack: ScannedTag[] = [];

  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  const lineOf = (index: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] as number) <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  let root: ScannedTag | null = null;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(source))) {
    const closeName = m[1];
    const openName = m[2];

    if (closeName) {
      let pos = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if ((stack[i] as ScannedTag).name === closeName) {
          pos = i;
          break;
        }
      }
      if (pos >= 0) {
        const tag = stack[pos] as ScannedTag;
        tag.text = cleanText(source.slice(tag.bodyEnd, m.index));
        stack.length = pos;
      }
      continue;
    }

    if (!openName) continue; // 注释 / CDATA / 处理指令

    const rawAttrs = m[3] ?? '';
    const selfClosing = /\/\s*$/.test(rawAttrs);
    const tag: ScannedTag = {
      name: openName,
      attrs: parseAttrs(selfClosing ? rawAttrs.replace(/\/\s*$/, '') : rawAttrs),
      selfClosing,
      depth: stack.length,
      parent: stack.length > 0 ? (stack[stack.length - 1] as ScannedTag).name : null,
      index: m.index,
      line: lineOf(m.index),
      text: '',
      bodyEnd: TAG_RE.lastIndex,
    };

    tags.push(tag);
    if (!root && openName === 'svg') root = tag;
    if (!selfClosing && !VOID_TAGS.has(openName)) stack.push(tag);
  }

  return { tags, root };
}

/** 便捷：取第一个指定名字标签的文本（如 title / desc）。 */
export function firstText(tags: ScannedTag[], name: string): string {
  const hit = tags.find((t) => t.name === name && t.text.length > 0);
  return hit ? hit.text : '';
}
