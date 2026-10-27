import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './manifest.js';

const useColor = process.stdout.isTTY && !process.env['NO_COLOR'];
const paint = (code: string, text: string): string => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const dim = (t: string): string => paint('2', t);
const red = (t: string): string => paint('31', t);
const yellow = (t: string): string => paint('33', t);
const green = (t: string): string => paint('32', t);

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const manifest = await buildManifest(root);

let errorCount = 0;
let warnCount = 0;

if (manifest.designs.length === 0) {
  console.log(dim('designs/ 下还没有设计稿。参考 designs/_template.svg 新建一份。'));
}

for (const design of manifest.designs) {
  const errors = design.issues.filter((i) => i.level === 'error');
  const warns = design.issues.filter((i) => i.level === 'warn');
  errorCount += errors.length;
  warnCount += warns.length;

  const mark = errors.length > 0 ? red('✗') : green('✓');
  const summary =
    errors.length > 0
      ? red(`${errors.length} 错误`) + (warns.length ? dim(` / ${warns.length} 提示`) : '')
      : warns.length > 0
        ? yellow(`${warns.length} 提示`)
        : dim('标注完整');
  console.log(`${mark} ${design.path.replace('public/', '')}  ${summary}`);

  for (const issue of design.issues) {
    const head = issue.level === 'error' ? red(issue.code) : yellow(issue.code);
    const where = issue.line ? dim(`  第 ${issue.line} 行`) : '';
    console.log(`    ${head} ${issue.message}${where}`);
  }
}

const total = manifest.designs.length;
console.log('');
console.log(
  `${dim('设计稿')} ${total}  ${dim('素材')} ${manifest.assets.length}  ${dim('错误')} ${
    errorCount > 0 ? red(String(errorCount)) : '0'
  }  ${dim('提示')} ${warnCount}`,
);

if (errorCount > 0) {
  console.log(red('\n标注规范未通过。规则见 AGENTS.md 第 6 节。'));
  process.exit(1);
}
console.log(green('\n标注规范通过。'));
