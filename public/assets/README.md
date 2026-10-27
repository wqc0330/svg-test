# 素材目录 public/assets/

放**设计稿引用的原始素材**：UI 外框、图标、贴图、字体、音效、图集等。目录页会自动把它们列在「素材」区，点击直接打开文件。

## 约定

- 按用途分子目录：`ui/`、`icons/`、`textures/`、`audio/`、`fonts/`。
- 文件名小写 + 连字符：`panel-frame.svg`、`icon-sword.svg`。
- 能矢量的不要用位图；设计稿里引用现有素材，不要在稿内复制粘贴同一份图形。
- 设计稿内用相对路径引用，`designs/screens/x.svg` → `../../assets/ui/panel-frame.svg`。

## 命名示例

```
assets/
  ui/panel-frame.svg      面板外框
  icons/icon-sword.svg    图标
  textures/stone-tile.png 贴图
  audio/ui-click.mp3      音效
```

`npm run check` 会校验设计稿里引用的素材是否真实存在（错误码 SVG009）。
