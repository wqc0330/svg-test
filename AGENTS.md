# AGENTS.md

本仓库的唯一约定来源。**任何人（包括 AI 代理）在动手前先读这一份**；新增/修改设计稿或代码时按这里的规则执行，不要凭感觉扩展。

---

## 1. 这是什么

用 **SVG 手写游戏设计稿**（界面 / HUD / 弹窗 / 关卡构图，以及概念设计类：Key Art、风格板、场景 / 角色 / 道具概念）的工程。

设计稿不是"一张截图"，而是一份**可被程序读懂的结构文档**：命名清晰的图层、明确的语义标注、可回填的数值约定。因此：

- 稿子要能被人看懂，也要能被 `npm run check` 检查、被查看器解析出标注清单。
- 左侧抽屉是项目树（项目 → 分类 → 稿 + 制作文档），可以直接在抽屉里**新建项目**；工作台是**单页应用**（`/`），点树、点卡片只做局部切换（`/?file=` 进查看器视图、`/?doc=` 进文档视图、`/?project=` 回目录），**不整页刷新**；`viewer.html` 仅作旧链接跳转兼容。
- 每个项目带一套**制作文档**（玩法 / 场景卡 / 素材 / 决策 / 发版，模板在根目录 `docs/`），场景卡与设计稿通过 `data-scene-id`（SC-xxx）互相锚定；素材按 `ref / raw / scene / approved` 生命周期分层，**正式稿只认 approved**。

## 2. 三条铁律

### 铁律一：一切素材都能从目录点进去

`public/designs/**/*.svg`、各项目 `docs/**/*.md`（制作文档）与所有素材目录（`public/assets/**` 全局 + `public/designs/<项目>/assets/**` 项目私有）会被服务端扫描成清单，渲染成左侧项目树 + 首页目录。

- 新增文件放对目录即可出现在目录里，**不要手工维护任何索引文件**。
- 文件名以 `_` 开头的（如 `_template.svg`）和 `_` 开头的目录被视为模板/草稿/私有目录，不进目录、不参与校验。
- 每个项目是 `public/designs/` 下的**一级目录**，项目里再分分类目录；直接放在项目根部的稿算「未分类」。项目内 `assets/` 与 `docs/` 是保留目录名，里面的文件不算设计稿。
- 导航只有两条路：左侧项目树、目录页 `/`。不要另建第二套入口。

### 铁律二：语义化标签优先，没有合适标签就用属性标注

SVG 没有 `button`、`panel`、`progress` 这些元素，所以分两步走：

1. **能用原生标签就用**：`<text>` 表文字、`<image>` 表位图素材、`<symbol>` + `<use>` 表可复用图形、`<g>` 表分组、`<defs>` 表定义、`<title>`/`<desc>` 表名称与说明。
2. **没有原生标签的，用属性补语义**：`data-role` 说明"这是什么"，`aria-label` 说明"它叫什么"，`data-action` 说明"点了会发生什么"，`role`/`tabindex` 让可访问性与自动化能识别。

例：一个按钮必须是

```svg
<g data-role="button" data-action="start-game" data-state="default"
   role="button" tabindex="0" aria-label="开始游戏">
  <rect x="150" y="576" width="368" height="80" rx="10" fill="#111a2e" />
  <text x="188" y="626" class="mm-menu">开始游戏</text>
</g>
```

不允许只画一个圆角矩形了事——那样它只是一坨图形，不是按钮。

### 铁律三：不擅自引入依赖

运行时**零依赖**，构建期只允许 `typescript` 与 `@types/node`。

需要新库（图表、动画、图标集、格式化、测试框架……）时：**先说用途、体积、不引入的替代写法，等用户明确同意后再装**。不要"顺手装上再说"。

## 3. 技术基线

| 项 | 选择 |
| --- | --- |
| 运行时 | Node ≥ 20.11（ESM，`"type": "module"`） |
| 语言 | TypeScript 5，`strict: true` |
| 服务端 | `node:http` 手写静态服务 + 4 个 JSON 接口（清单 / 单稿 / 文档 / 新建项目） |
| 前端 | 原生 DOM + ES Module，编译到 `public/js/` |
| 样式 | 手写 CSS（`public/styles/app.css`），无预处理器 |
| 构建 | `tsc` 两个 project，无打包器 |

**不用**：React/Vue、Vite/Webpack、Tailwind、D3、GSAP、图标库、lodash。

## 4. 项目与目录结构

### 4.1 项目模型

```
public/designs/<项目>/project.json      项目元信息：{ name, description, createdAt }
public/designs/<项目>/<分类>/<稿>.svg   设计稿，分类可省略（省了算「未分类」）
public/designs/<项目>/docs/             制作文档（六件套 + review/ + specs/，目录树里可见）
public/designs/<项目>/assets/           项目私有素材库，按生命周期分四层
public/assets/                          全局素材库，跨项目共享（分层规则相同）
```

素材生命周期四层（照搬 game-docs 管线，**可用 = 机器检查过 + 人审过 + 进 approved**）：

| 子目录 | 内容 | 规则 |
| --- | --- | --- |
| `assets/ref/` | 风格参考（anchor / ref-card 等） | 只读、只定调，正式稿引用报 SVG013 |
| `assets/raw/` | 原始产出 | 未审；正式稿引用为 SVG105 提示，过审迁入 approved 并同步改引用 |
| `assets/scene/` | 场景效果图、标注图、合成预览（`SC-xxx/` 分目录） | 服务审核对照；正式稿引用报 SVG014 |
| `assets/approved/` | 人工审核通过的素材 | **正式稿只认这里** |

- **四层是固定约束，层内子目录自由**：按项目需要自建（如 `raw/components/`、`raw/ui/`、`approved/icons/`），不强制用途名单。素材状态由所在层推导，与子目录名无关。
- **素材必须落在四层内**：`assets/` 根目录不放素材。未分层的素材清单里标 `none`，正式稿引用它报错（SVG017）。
- **设计稿分类目录自由，但概念稿分类固定**：`screens/` `hud/` `popups/` `components/` 等可按需自建；概念稿（Key Art / 风格板 / 场景 / 角色 / 道具·载具概念）只允许放 `keyart/` `environments/` `characters/` `props/` 四个固定目录——校验器据此豁免生命周期引用检查，自建概念分类不豁免。
- **两种「状态」不通用**：清单里素材的 `status`（`approved/raw/ref/scene/none`）是生命周期层，服务端按目录自动推导，不可手改；`03-ASSETS.md` 里的 `待做/制作中/待审/驳回/已通过` 是生产状态，由人维护。同名不同义，别混用。

- 项目 = `public/designs/` 下的一级目录，目录名即 `?project=` 参数。允许中文，但必须是单层、不含 `\ / : * ? " < > |`、不以 `.` `_` 开头、不超过 40 字符。
- 项目内的 `assets/` 目录被识别为**素材库**、`docs/` 被识别为**制作文档**，里面的文件不算设计稿；新建项目时会自动创建素材四层与文档骨架。
- `project.json` 缺省时项目名回退为目录名——不阻断目录页，但新建项目时一定会写。
- 新建方式三种，效果相同：抽屉里「＋ 新建」/ `POST /api/projects` / 手工 `mkdir` + 写 `project.json`。

### 4.2 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/manifest` | 全部项目 + 设计稿 + 制作文档 + 素材（带审核状态，每次现扫磁盘） |
| GET | `/api/design?file=public/designs/<项目>/<分类>/<稿>.svg` | 单稿详情：元信息、语义标注清单、校验结果 |
| GET | `/api/doc?file=public/designs/<项目>/docs/<文档>.md` | 项目制作文档 markdown 原文（仅限项目 docs/ 内） |
| POST | `/api/projects` | 新建项目，body `{ name, slug? }`，成功 201；重名 409；目录名非法 400 |

### 4.3 目录树

```
svg-test/
├── AGENTS.md                  ← 你正在读的约定
├── docs/                      ← 制作文档空白模板（六件套 + review/specs；不进目录树）
├── public/                    ← 直接被浏览器访问的静态根
│   ├── index.html             工作台单页（目录 + 查看器 + 文档视图，局部切换）
│   ├── viewer.html            旧链接兼容：跳转到 /?file=…
│   ├── favicon.svg
│   ├── styles/app.css         全站样式
│   ├── js/                    ⚠️ 编译产物（tsc 生成），不要手改
│   ├── designs/               ← 设计稿，一级目录 = 项目
│   │   ├── _template.svg      模板：复制它起手（不在任何项目内，故不进目录）
│   │   └── echoes-of-the-abyss/
│   │       ├── project.json   { name: "深渊回响", … }
│   │       ├── docs/          制作文档实例（00-OVERVIEW…05-SHIP + review/ + specs/）
│   │       ├── assets/        该项目私有素材：ref/ raw/ scene/ approved/ 四层
│   │       ├── screens/main-menu.svg
│   │       ├── hud/battle-hud.svg
│   │       ├── keyart/main-visual.svg
│   │       ├── environments/abyss-rift.svg
│   │       └── characters/abyss-stalker.svg
│   └── assets/                ← 全局素材库，跨项目共享（分层规则相同）
├── src/
│   ├── shared/types.ts        前后端共用类型
│   ├── tooling/
│   │   ├── svgScan.ts         极简 SVG 扫描器（标签/属性/层级/行号）
│   │   ├── svgRules.ts        角色词表 + 校验规则（唯一真源）
│   │   ├── manifest.ts        扫描项目/稿/文档/素材（全局 + 项目私有）→ 清单、单稿详情、新建项目
│   │   └── lint.ts            npm run check 的 CLI
│   ├── server/index.ts        静态服务 + /api/manifest + /api/design + /api/doc + POST /api/projects
│   └── client/
│       ├── catalog.ts         工作台路由 + 目录视图（单页，局部刷新）
│       ├── viewerView.ts      查看器视图控制器（稿子画在 Shadow DOM 里）
│       ├── docView.ts         文档视图控制器（渲染项目制作文档 markdown）
│       ├── drawer.ts          左侧抽屉：项目树（稿 + 文档）+ 新建项目
│       └── dom.ts             浏览器端小工具
├── tsconfig.server.json       src/{server,tooling,shared} → dist/
└── tsconfig.client.json       src/{client,shared} → public/js/
```

### 4.4 制作文档体系（源自 game-docs 管线）

每个项目在 `docs/` 下维护六件套，**一份文档只回答一类问题**；空白模板在仓库根 `docs/`（不进目录树），项目实例进目录树、可在工作台阅读。

| 文档 | 只回答什么 |
| --- | --- |
| `00-OVERVIEW.md` | 项目是什么、核心循环、**当前制作单**（唯一入口） |
| `01-GAMEPLAY.md` | 玩法机制、关键状态、参数基线 |
| `02-SCENES.md` | 场景索引 + 场景卡（画面、布局、交互、状态、素材清单） |
| `03-ASSETS.md` | 素材生产卡、机器检查、人工审核、图量表 |
| `04-DECISIONS.md` | 决策日志：已生效 + **已否决**（防止旧方案被重新提出） |
| `05-SHIP.md` | 发版清单，10 条封顶 |

- `docs/review/SC-xxx.md` 人工审核单：机器结果工具可填，**人工结论只能由审核人填写，AI 不得代签**。
- `docs/specs/001-功能名.md` 复杂功能规格，按需建，普通交互写在场景卡。
- **ID 契约**：场景 `SC-xxx`、机制 `M0x`、参数 `P0xx`、素材 `A0xx` 全线统一；场景稿根节点写 `data-scene-id="SC-xxx"` 与场景卡锚定（格式与必填由 SVG015/SVG016 校验）。
- 制作主线：**定玩法 → 画场景 → 拆素材 → 生产素材 → 拼回场景 → 人工审核 → 实现交互 → 实机验收**。占位素材可以验证玩法，但不能过审、不能发版。
- 换风格参考（`ref/anchor`）、改内容边界，必须在 `04-DECISIONS.md` 记一行。

## 5. 命令

```bash
npm install                # 只装 typescript + @types/node
npm run dev                # 编译并起服务 → http://localhost:5173
npm run build              # 只编译（dist/ 与 public/js/）
npm run check              # 校验所有设计稿的标注规范，有错误退出码 1
npm run typecheck          # 只查类型
PORT=8080 npm run dev      # 换端口
```

改了 `src/**` 要重新 `npm run dev`；改 `public/**` 里的稿子和样式不用重启（服务端每次请求现扫）。

## 6. 设计稿规范

### 6.1 骨架

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080"
     data-category="hud" data-tags="战斗HUD,1080p" data-version="0.1.0">
  <title>战斗 HUD</title>
  <desc>一句话说明这张稿要表达什么，会显示在目录卡片和查看器里。</desc>
  <style>/* 稿内样式，类名加稿别前缀，如 .hud-xxx */</style>
  <defs>/* 渐变、符号、可复用图形 */</defs>
  <g data-role="background" aria-label="背景层">…</g>
  <g data-role="layer" aria-label="内容层">…</g>
  <g data-role="hud" aria-label="HUD 层">…</g>
  <g data-role="overlay" aria-label="遮罩层">…</g>
</svg>
```

- `viewBox` **必填**，`width`/`height` 写设计分辨率（1920×1080 / 1280×720…），方便 1:1 出图。
- 坐标从 `0 0` 起，不用负坐标堆偏移；不要用 CSS `px` 单位，用无单位数值。
- 图层顺序即 z 轴，从底到顶：背景 → 内容 → HUD → 遮罩。**不要靠 `z-index` 或 `transform` 补救层级**。

### 6.2 角色词表（`data-role`）

代码里的真源是 `src/tooling/svgRules.ts` 的 `ROLES`，**这里没列的值会报 SVG006 错误**。新增角色要同时改代码与本节表格。

| data-role | 含义 | 典型元素 |
| --- | --- | --- |
| `screen` | 整屏画面根容器 | `<g>` |
| `layer` | 图层分组 | `<g>` |
| `background` | 背景层（不可交互） | `<g>` |
| `hud` | 常驻覆盖层分组 | `<g>` |
| `panel` | 面板 / 卡片容器 | `<g>` + `<rect>` |
| `frame` | 外框、装饰边框 | `<image>` / `<rect>` |
| `button` | 按钮（可交互） | `<g>` + `role="button"` |
| `control` | 非按钮控件：滑杆、开关、页签 | `<g>` |
| `item` | 列表项 / 背包格 | `<g>` |
| `slot` | 技能槽 / 装备槽（可交互） | `<g>` |
| `bar` | 数值条（血条/进度条） | `<g>` 含两条 `rect` |
| `gauge` | 环形/表盘式数值 | `<g>` |
| `minimap` | 小地图 | `<g>` |
| `sprite` | 角色/怪物贴图 | `<image>` |
| `character` | 角色整体（含挂点） | `<g>` |
| `keyart` | 主视觉 / 定调图整幅构图 | `<g>` |
| `environment` | 场景概念整体（内部按前/中/后景分 `layer`） | `<g>` |
| `prop` | 道具 / 载具整体 | `<g>` |
| `moodboard` | 风格板 / 情绪板容器 | `<g>` |
| `swatch` | 色卡，`data-value` 存色值（如 `#1B2A4A`） | `<rect>` / `<g>` |
| `icon` | 图标 | `<symbol>` / `<use>` |
| `text` | 大段文字块 | `<text>` |
| `label` | 小标签 / 状态标记 | `<g>` / `<text>` |
| `hotspot` | 不可见点击热区（可交互） | `<rect>` |
| `hitbox` | 碰撞/判定框（调试用） | `<rect>` |
| `overlay` | 遮罩、压黑、弹窗底层 | `<g>` |
| `decoration` | 纯装饰（星点、光效、纹理） | `<g>` |
| `effect` | 特效层 | `<g>` |

可交互角色（`button` `control` `item` `hotspot` `slot`）额外要求：`aria-label` 必填、建议补 `role`、内部元素才允许挂 `data-action`。

### 6.3 属性契约

| 属性 | 挂在 | 作用 |
| --- | --- | --- |
| `data-category` | 根 `<svg>` | 目录页分组名，缺省回退为文件夹名 |
| `data-tags` | 根 `<svg>` | 逗号分隔，供目录页搜索 |
| `data-version` | 根 `<svg>` | 稿子版本，改版时递增 |
| `data-scene-id` | 根 `<svg>`（场景稿） | 场景锚定：`SC-xxx`，与场景卡 / 审核单共用同一 ID；`screens/` `hud/` `popups/` 场景稿**必填**（缺失报 SVG016，格式错误报 SVG015） |
| `data-role` | 任意 | 见 6.2 词表 |
| `data-action` | 可交互容器，或其后代 | 动作标识，kebab-case，与代码里的事件名一致，如 `open-season` |
| `data-state` | 可交互容器 | `default` / `selected` / `pressed` / `ready` / `cooling` / `disabled` |
| `data-value` `data-max` | `bar` / `gauge` / `slot` / `swatch` | 真实数值或色值，程序回填用（如 `data-value="0.72" data-max="1"`、`data-value="#1B2A4A"`） |
| `data-layer` | 根级图层 | 设计侧图层名（中文可），不参与校验但便于对齐 |
| `aria-label` | 可交互容器、`label` | 人类可读名称，查看器标注清单直接显示它 |
| `data-label` | 任意 | `aria-label` 的替代写法，SVG010 与标注清单同样认可；优先用 `aria-label` |
| `role` `tabindex` | 可交互容器 | 可访问性，按钮写 `role="button" tabindex="0"` |

文字一律用 `<text>` + `font-size`/`fill`，**不要转曲**——转曲后不可搜、不可改字，等于把稿子变成图片。

### 6.4 命名

- 文件：小写 + 连字符，`battle-hud.svg`、`season-pass.svg`。
- 分类目录：`screens/`（整屏）、`hud/`、`popups/`、`components/`（可复用部件）、`keyart/`（定调图/风格板）、`environments/`（场景概念）、`characters/`（角色·怪物概念）、`props/`（道具·载具概念）。
- `id`：稿内唯一，kebab-case，带稿别前缀（`hud-hp-fill`），避免多稿同页时冲突。
- 稿内 CSS 类：加稿别前缀（`mm-`、`hud-`、`tpl-`）。查看器用 Shadow DOM 隔离，但导出后可能被内联，前缀能省掉一次事故。

### 6.5 素材引用

素材有两个位置，用**相对路径**引用，不用 base64 内联。生命周期分层见 4.1；**四层是固定约束，层内子目录自由创建**（如 `raw/components/`、`raw/ui/`、`approved/icons/`）。校验分级：正式稿引用 `ref/` 或 `scene/` **报错**（SVG013/014），引用 `raw/` **提示**（SVG105，过审迁入 approved 后同步改引用），引用四层之外的素材**报错**（SVG017）；`ref/` 只允许被风格板与概念稿引用，概念稿（仅限 `keyart/` `environments/` `characters/` `props/` 四个固定分类）豁免：

| 位置 | 归属 | 从 `designs/<项目>/<分类>/稿.svg` 引用 |
| --- | --- | --- |
| `public/designs/<项目>/assets/<层>/` | 项目私有（默认选这里） | `../assets/<层>/…` |
| `public/assets/<层>/` | 全局共享，跨项目复用 | `../../../assets/<层>/…` |

```svg
<!-- designs/<项目>/<分类>/xxx.svg：项目私有素材，往上一层 -->
<image href="../assets/approved/ui/hpbar-frame.svg" width="640" height="60"
       data-role="frame" aria-label="血条外框" />

<!-- 引用全局共享素材才需要往上三层 -->
<image href="../../../assets/approved/ui/panel-frame.svg" x="1320" y="288" width="320" height="480"
       data-role="frame" aria-label="赛季面板外框" />
```

`npm run check` 会验证目标文件是否存在（SVG009）。能矢量的素材不要用位图。只被一个项目用的素材放项目 `assets/`，跨项目复用的才升到全局。缺素材先用文件名以 `placeholder-` 开头的占位图（工作台会标记），不擅自发明正式素材。

### 6.6 禁止清单

| 禁止 | 原因 | 替代 |
| --- | --- | --- |
| `<foreignObject>` | 用 HTML 表达布局，导出即失效 | 用 SVG 原生元素画 |
| `<script>` | 设计稿是静态交付物 | 逻辑写进 `src/client` |
| `<img>` 截图当稿 | 不可编辑、不可检索 | 手写 SVG |
| `http(s)://` 外链资源 | 断网即崩、无法归档 | 素材下载进 `assets/` |
| emoji 当图标 | 各平台字形/尺寸不一致 | `<symbol>` + `<use>` |
| 大段 `<path>` 表示文字 | 不可改字、不可搜索 | `<text>` |
| 复制粘贴同一图形 | 改一处漏一处 | `<symbol>` + `<use>` |

### 6.7 概念设计稿补充规范

概念设计类（Key Art / Moodboard / 场景 / 角色 / 道具·载具）遵循 6.1 骨架与图层顺序，另有约定：

- **分类目录**：`keyart/`（定调图、风格板）、`environments/`（场景概念）、`characters/`（角色·怪物概念）、`props/`（道具·载具概念）；`data-category` 与所在目录一致。
- **角色选用**：主视觉整幅用 `keyart`；场景用 `environment`，内部按前 / 中 / 后景分 `layer`；角色沿用 `character`；道具 / 载具用 `prop`。
- **Moodboard**：容器标 `moodboard`，内部每块色卡标 `swatch` 并把色值写进 `data-value`（如 `data-value="#1B2A4A"`），程序可据此提取配色清单；参考图块用 `frame` 包 `image`，素材进项目 `assets/`。
- **无交互**：概念稿不使用交互角色与 `data-action`；需要标注观察点、设计要点时用 `label` + `<text>`。
- **尺寸**：横版构图 1920×1080；竖版角色 / 道具三视图可用 1080×1920；`viewBox` 与 `width`/`height` 保持一致。

## 7. 校验规则（`npm run check`）

错误会让退出码为 1，必须修；提示不影响通过。

| 码 | 级别 | 含义 | 怎么修 |
| --- | --- | --- | --- |
| SVG001 | 错误 | 找不到根 `<svg>` | 检查 XML 结构 |
| SVG002 | 错误 | 根节点缺 `viewBox` | 补 `viewBox="0 0 W H"` |
| SVG003 | 错误 | 缺 `<title>` | 补名称，目录页要用 |
| SVG004 | 错误 | 缺 `<desc>` | 补一句话说明 |
| SVG005 | 错误 | 根级 `<g>` 缺 `data-role` | 按 6.2 选角色 |
| SVG006 | 错误 | `data-role` 不在词表 | 改成词表值，或先扩词表 |
| SVG007 | 错误 | `data-action` 不在可交互容器内 | 外面套 `data-role="button"` 等 |
| SVG008 | 错误 | 用了 `<foreignObject>` | 改原生 SVG |
| SVG009 | 错误 | 素材引用不存在 | 修路径或补素材 |
| SVG010 | 错误 | 可交互容器缺 `aria-label` | 补上名称 |
| SVG011 | 错误 | `id` 重复 | 改成唯一 id |
| SVG012 | 错误 | 用了 `<script>` | 删掉，逻辑入代码 |
| SVG013 | 错误 | 正式稿引用 `assets/ref/` 风格参考 | 换正式素材；ref 只允许风格板与概念稿引用 |
| SVG014 | 错误 | 正式稿引用 `assets/scene/` 预览图 | scene 是审核对照图，换正式素材 |
| SVG015 | 错误 | `data-scene-id` 格式不对 | 写成 `SC-xxx`（SC 后至少三位数字），与场景卡一致 |
| SVG016 | 错误 | 场景稿（`screens/` `hud/` `popups/`）根节点缺 `data-scene-id` | 补 `data-scene-id="SC-xxx"`，与场景卡一致 |
| SVG017 | 错误 | 引用了 `assets/` 生命周期四层之外的素材 | 移入 `ref/raw/scene/approved` 之一，再同步更新引用 |
| SVG101 | 提示 | `<text>` 未声明 `font-family` | 在 `<style>` 里统一声明 |
| SVG102 | 提示 | 引用外部 http 资源 | 下载到 `assets/` |
| SVG103 | 提示 | 根节点缺 `data-category` | 补分类名 |
| SVG104 | 提示 | 可交互容器缺 `role` | 补 `role="button"` |
| SVG105 | 提示 | 引用 `assets/raw/` 未审素材 | 人工审核通过迁入 `approved/` 后同步更新引用 |
| SVG106 | 提示 | 引用 `placeholder-` 占位素材 | 占位图不能过审、不能发版，记得替换 |

## 8. 新增一份设计稿 / 一个项目

新建项目：左侧抽屉「＋ 新建」填名称即可（目录名默认同项目名，可改；会自动创建 `assets/{ref,raw,scene,approved}` 四层与 `docs/` 文档骨架）。命令行等价：

```bash
mkdir -p "public/designs/夜航/screens" && echo '{"name":"夜航","description":""}' > "public/designs/夜航/project.json"
```

手工建项目时记得把根目录 `docs/` 模板复制成 `public/designs/<项目>/docs/` 实例并填写 00-OVERVIEW。

新增稿子：

```bash
cp public/designs/_template.svg "public/designs/<项目>/screens/my-screen.svg"
```

1. 改 `data-category`（项目内分类，与所在目录一致）、`data-tags`、`<title>`、`<desc>`。
2. 按 6.1 排图层，从底到顶：背景 → 内容 → HUD → 遮罩。
3. 每个可点/可读的块补 `data-role` + `aria-label`，可点的再加 `data-action` / `data-state`。
4. 数值条补 `data-value` / `data-max`；重复图形收进 `<symbol>`；项目素材引用 `../assets/`，全局素材 `../../../assets/`（见 6.5）。
5. `npm run check` 全绿；打开 `/` 确认项目树、卡片缩略图与查看器都正常。

## 9. 代码约定

- **零依赖**：Node 侧只用 `node:*`；浏览器侧只用原生 API。
- ESM + `verbatimModuleSyntax`：类型导入一律 `import type`；相对导入必须带 `.js` 后缀。
- 严格模式，不用 `any`（确实需要时写 `unknown` 并收窄）；公共函数写明参数与返回类型。
- 注释用中文，解释"为什么"，不复述代码。
- 不要手改 `dist/` 与 `public/js/`（编译产物，改了会丢）。
- 服务端错误不许吞掉：返回明确状态码 + 控制台日志。
- 路径拼接一律 `node:path`，并对静态目录做越界校验（参考 `src/server/index.ts`）。

## 10. 常见坑

- **稿内 `<style>` 会污染页面**：查看器已用 Shadow DOM 隔离；若在别处内联渲染 SVG，必须自己隔离或给类名加前缀。
- **新增角色要三处同改**：`src/tooling/svgRules.ts` 的 `ROLES`、本文件 6.2 表格、（如有）文档示例。只改一处会导致别的稿突然报 SVG006。
- **服务端每次请求现扫目录**，所以新增文件不用重启；但改了 `src/**` 必须重新编译。
- **稿子必须住在项目里**：`designs/` 根目录下的 `.svg`（除 `_` 前缀）不会被扫描，因为它不属于任何项目。
- **`_` 前缀的文件与目录都不校验**（如 `_template.svg`、`_wip/`），所以模板写完记得复制成正式文件名再验证。
- **项目目录名会进 URL**，允许中文但要保证单层：不允许 `/ \ : * ? " < > |`，不允许以 `.` `_` 开头。
- 目录页的缩略图直接用 `<img src>` 渲染原稿，稿内引用外部图片在 `<img>` 模式下不会加载——所以素材引用只走查看器（内联渲染）验证。
- **内联渲染时相对引用按页面 URL 解析，不是按稿子路径**：查看器挂载前已把 `href` 统一重写为「以稿子自身 URL 为基」的绝对地址（`viewerView.ts` 的 `resolveRelativeRefs`）。若新增别的内联渲染入口，必须做同样的重写，否则稿内 `../assets/…` 会指到站点根导致图片 404。
- 抽屉的开合与折叠状态存在 `localStorage`（键前缀 `svg-test:`）；排查"树打不开/节点不展开"时先清这两个键。

## 11. AI 代理须知

- 动手前读本文件；改完跑 `npm run check` 与 `npm run typecheck`，两者都过再交付。
- 不要为了"好看"引入库、CDN 字体、外部图片。
- 不要把设计稿导出成图片交付，也不要把稿子塞进代码字符串里生成。
- 不确定某个 `data-role` 该用哪个值时，先查 6.2；确实缺角色就提出扩词表，别自造。
- 改 `src/client/drawer.ts` 后，目录页与查看器两个入口都要过一遍（抽屉是共用组件）。
- 不要删除或改写 `public/assets/` 下的二进制素材，除非用户明确要求。
- 汇报时说明改了哪些文件、`npm run check` 结果、以及是否有新增依赖。
