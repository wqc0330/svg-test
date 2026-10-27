# svg-test

用 SVG 手写游戏设计稿的工作台：**左侧项目树 → 点进去看稿 → 规范自动校验**。

约定、规范、禁止清单全部写在 [AGENTS.md](./AGENTS.md)，改代码或画稿前先读它。

## 快速开始

```bash
npm install
npm run dev        # → http://localhost:5173
```

- `npm run dev`：编译并启动本地服务（默认 5173，可用 `PORT` 改）
- `npm run check`：校验所有设计稿的语义标注，错误退出码 1
- `npm run typecheck`：只做类型检查
- `npm run build`：产出 `dist/` 与 `public/js/`

## 界面

- **左侧抽屉**：项目树（项目 → 分类 → 稿），顶上开关展开/收起，桌面端把内容推右、窄屏盖上。点项目筛目录页，点稿直接进查看器。状态记在 `localStorage`。
- **「＋ 新建项目」**：在抽屉里填名称即可（目录名默认同项目名）。会在 `public/designs/<目录名>/` 下建 `project.json`，随后自动出现在树里并选中。
- **目录页 `/`**：默认按项目分组展示卡片；选中项目后按分类分组，顶部出现筛选 chip。素材区只在"全部"视图出现。

## 现在有什么

```
public/designs/
  _template.svg                        带完整标注的空白骨架（不进目录、不校验）
  echoes-of-the-abyss/project.json     项目：深渊回响
  echoes-of-the-abyss/screens/main-menu.svg
  echoes-of-the-abyss/hud/battle-hud.svg
public/assets/ui/panel-frame.svg       纵向面板外框，被主菜单引用
```

## 新增项目 / 稿子

新建项目：抽屉里「＋ 新建」，或

```bash
curl -X POST localhost:5173/api/projects -H 'content-type: application/json' -d '{"name":"夜航"}'
```

新增稿子：

```bash
cp public/designs/_template.svg "public/designs/<项目>/screens/my-screen.svg"
```

改 `data-category`、`<title>`、`<desc>`，按 AGENTS.md 第 6 节标注，然后 `npm run check`。

## 数据从哪来

服务端每次请求现扫 `public/designs/<项目>/**/*.svg` 与 `public/assets/**`，用 `src/tooling/svgScan.ts`（手写扫描器，无依赖）读根节点属性、`<title>`、`<desc>` 和所有 `data-role` 标注，拼成清单给前端。项目信息取自各自目录下的 `project.json`，没有就回退目录名。**没有索引文件要维护。**

| 接口 | 作用 |
| --- | --- |
| `GET /api/manifest` | 项目 + 设计稿 + 素材清单 |
| `GET /api/design?file=public/designs/…` | 单稿详情：元信息、标注清单、校验结果 |
| `POST /api/projects` | 新建项目 `{ name, slug? }` |

预览时稿子画在 Shadow DOM 里，所以稿内的 `<style>` 不会污染工作台，工作台的样式也进不去。
