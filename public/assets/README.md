# 全局素材库 public/assets/

放**跨项目共享**的素材：UI 外框、图标、贴图、字体、音效、图集等。只被一个项目用的素材，放该项目自己的素材库 `public/designs/<项目>/assets/`。

两个素材库都会被自动扫描进目录页：目录页不筛选项目时显示全局素材，选中某项目时显示该项目的素材。

## 约定

- **生命周期四层是固定约束，层内子目录自由创建**（如 `raw/components/`、`raw/textures/`，不强制用途名单）——素材审核状态由所在层推导，与子目录名无关（正式稿只认 `approved/`）：

  | 子目录 | 内容 | 规则 |
  | --- | --- | --- |
  | `ref/` | 风格参考（anchor / ref-card 等） | 只读、只定调；正式稿引用报 SVG013 |
  | `raw/` | 原始产出，未过审 | 正式稿引用为 SVG105 提示，过审迁入 `approved/` |
  | `scene/` | 场景效果图、标注图、合成预览 | 按 `SC-xxx/` 分目录；正式稿引用报 SVG014 |
  | `approved/` | 人工审核通过的素材 | 正式稿只引用这里 |

- 文件名小写 + 连字符：`panel-frame.svg`、`icon-sword.svg`；占位素材以 `placeholder-` 开头（引用时会有 SVG106 提示）。
- 能矢量的不要用位图；设计稿里引用现有素材，不要在稿内复制粘贴同一份图形。
- 美术字标题（字面本身即图形、无法用 `<text>` 还原字形）才允许存位图，放 `raw/titles/` 或 `approved/titles/`。
- 设计稿内用相对路径引用（稿在 `designs/<项目>/<分类>/` 下）：
  - 项目私有素材：`../assets/raw/ui/xxx.svg`（往上一层到项目根）
  - 全局共享素材：`../../../assets/raw/ui/xxx.svg`（往上三层到 `public/`）

## 命名示例

```
assets/                              ← 全局（跨项目复用才放这里）
  ref/anchor.png                     风格锚点图（只读）
  raw/ui/panel-frame.svg             面板外框（未审）
  raw/textures/stone-tile.png        贴图
  raw/audio/ui-click.mp3             音效
  approved/icons/icon-sword.svg      图标（已过审）

designs/<项目>/assets/               ← 项目私有（默认放这里）
  ref/ref-card.png                   角色参考卡
  raw/components/card-frame.svg      该项目的部件素材
  raw/characters/xxx.png             该项目的角色立绘
  approved/titles/logo-xxx.png       已过审的标题美术字
  scene/SC-001/annotated.png         场景标注图
```

`npm run check` 会校验设计稿里引用的素材是否真实存在（SVG009），并按生命周期分级检查（ref/scene 引用报错、raw 引用提示，见 AGENTS.md 第 7 节）。素材从 raw 移入 approved 时，**必须同步改写稿内引用路径**，否则图会挂。
