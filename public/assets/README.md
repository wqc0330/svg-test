# 全局素材库 public/assets/

放**跨项目共享**的素材：UI 外框、图标、贴图、字体、音效、图集等。只被一个项目用的素材，放该项目自己的素材库 `public/designs/<项目>/assets/`。

两个素材库都会被自动扫描进目录页：目录页不筛选项目时显示全局素材，选中某项目时显示该项目的素材。

## 约定

- 按用途分子目录：`ui/`、`icons/`、`textures/`、`audio/`、`fonts/`、`backgrounds/`、`characters/`、`items/`、`decorations/`、`titles/`。
- 文件名小写 + 连字符：`panel-frame.svg`、`icon-sword.svg`。
- 能矢量的不要用位图；设计稿里引用现有素材，不要在稿内复制粘贴同一份图形。
- 美术字标题（字面本身即图形、无法用 `<text>` 还原字形）才允许存位图，放 `titles/`。
- 设计稿内用相对路径引用（稿在 `designs/<项目>/<分类>/` 下）：
  - 项目私有素材：`../assets/ui/xxx.svg`（往上一层到项目根）
  - 全局共享素材：`../../../assets/ui/xxx.svg`（往上三层到 `public/`）

## 命名示例

```
assets/                          ← 全局（跨项目复用才放这里）
  ui/panel-frame.svg      面板外框
  icons/icon-sword.svg    图标
  textures/stone-tile.png 贴图
  audio/ui-click.mp3      音效

designs/<项目>/assets/           ← 项目私有（默认放这里）
  ui/hpbar-frame.svg      该项目的血条外框
  backgrounds/xxx.png     该项目的场景原画
  characters/xxx.png      该项目的角色立绘
  items/plates/xxx.png    该项目的卡面图
  titles/logo-xxx.png     该项目的标题美术字
```

`npm run check` 会校验设计稿里引用的素材是否真实存在（错误码 SVG009）。
