# SCENES · 朽烬归尘

> **制作主入口。一场景一卡：先画出结果，再拆素材和交互。**
> 场景卡与设计稿 SVG 一一对应：稿子根节点写 `data-scene-id="SC-xxx"`，场景卡的「设计稿」字段填稿子路径。
> 复用组件（components/）不单独建卡，挂在使用的场景下。

## 场景索引

| 场景 ID | 名称 | 设计稿 | 优先级 | 素材审核 | 实机验收 | 状态 |
|---|---|---|---|---|---|---|
| SC-001 | 主菜单 | `screens/main-menu.svg` | P0 | 未审 | 未测 | 设计中 |
| SC-002 | 战斗场景 | `screens/battle-arena.svg` + `hud/battle-hud.svg` | P0 | 未审 | 未测 | 设计中 |
| SC-003 | 回合结算 | `popups/round-result.svg` | P1 | 未审 | 未测 | 设计中 |

状态只用：`设计中 → 待素材 → 待审核 → 可实现 → 已验收`。返修时回到 `待素材`。

## 复用组件索引

| 组件 | 设计稿 | 挂载场景 |
|---|---|---|
| 装备卡（2×3 大卡） | `components/item-card-armor-blue-2x3.svg` | SC-002 |
| 腰带卡（2×1） | `components/item-card-belt-white-2x1.svg` | SC-002 |
| 医疗枪卡（2×2） | `components/item-card-medigun-green-2x2.svg` | SC-002 |
| 狙击枪卡（3×2） | `components/item-card-sniper-red-3x2.svg` | SC-002 |
| 装备卡基础版 | `components/item-card.svg` | SC-002 / SC-003 |

---

## SC-002：战斗场景

### 1. 场景定义

| 项 | 内容 |
|---|---|
| 玩家目标 | 在己方阵板出牌、换位，把对手血量打到 0 |
| 关联玩法 / 参数 | 出牌（M01 待补）；烧牌积烬（M02 待补） |
| 设计稿 | `screens/battle-arena.svg`（2048×1152），常驻层 `hud/battle-hud.svg` |
| 适配范围 | 16:9 桌面 |
| 安全区 | 四边 56px |
| 稿子版本 | 与稿子根节点 `data-version` 一致 |

### 2. 场景图

- 设计稿 SVG：`screens/battle-arena.svg`（阵板层：上为对手、下为己方，阵板与卡框均为 `assets/raw/ui/` 素材）
- 常驻 HUD：`hud/battle-hud.svg`

- [x] 已画完整场景，而不是素材散图
- [ ] 稿子根节点已写 `data-scene-id="SC-002"`（待补）
- [ ] 占位素材已明确标记（文件名 `placeholder-` 开头）

### 3. 尺寸与布局

常规布局以稿子内的语义标注为准；例外补充：

| 区域 / 元素 ID | 例外说明 |
|---|---|
| 对手阵板 `board-10x3`（上） | y≈150，卡槽 10×3 |
| 己方阵板 `board-10x3`（下） | y≈736 |

### 4. 交互逻辑

| 触发区 ID | 玩家输入 | 前置条件 | 系统反馈 | 状态变化 / 跳转 | 失败反馈 | 参数 ID |
|---|---|---|---|---|---|---|
| （按稿内 data-action 补） | | | | | | |

### 5. 场景状态

| 状态 | 进入条件 | 画面差异 | 可用交互 | 离开条件 |
|---|---|---|---|---|
| 默认 | 进入战斗 | — | 出牌 / 换位 | 双方确认 |
| 按下 / 选中 | 点选卡牌 | 卡牌高亮 | 拖入阵板 | 取消或打出 |
| 禁用 | 非本回合 | 己方阵板置灰 | 不可出牌 | 轮到己方 |
| 失败 / 错误 | 血量归零 | 弹出 SC-003 | 确认结算 | 返回主菜单 |

### 6. 本场景素材

| 素材 ID | 用途 / 元素 ID | 数量 / 状态帧 | 优先级 | 生产状态 | 人工结论 |
|---|---|---|---|---|---|
| A001 | 竞技场黄昏庭院背景（`assets/raw/backgrounds/arena-dusk-courtyard.png`） | 1 | P0 | 制作中 | 未审 |
| A002 | 守灰者·落烬（全身 / 战斗）（`assets/raw/characters/knight-ashfall*.png`） | 2 帧 | P0 | 制作中 | 未审 |
| A003 | 守灰者·烬羽（全身 / 战斗）（`assets/raw/characters/knight-embercrest*.png`） | 2 帧 | P0 | 制作中 | 未审 |
| A004 | 阵板 10×3（`assets/raw/ui/board-10x3.svg`） | 1 | P0 | 制作中 | 未审 |
| A005 | 卡框（`assets/raw/ui/card-frame.svg`） | 1 | P0 | 制作中 | 未审 |
| A006 | 血条框（`assets/raw/ui/hpbar-frame.svg`） | 1 | P0 | 制作中 | 未审 |
| A007 | 装备图 4 件（`assets/raw/items/`） | 4 | P0 | 制作中 | 未审 |

### 7. 审核与完成

- 人工审核单：`docs/review/SC-002.md`
- [ ] 机器检查全部通过（`npm run check`，该稿 0 错误）
- [ ] 人已审核本场景设计稿和素材，结论为「通过」
- [ ] 正式素材全部进入 `assets/approved/`，稿内引用同步改写
- [ ] 默认、空、错误等必要状态已画
- [ ] 目标分辨率下无裁切、重叠、热区错位
- [ ] 实现侧完成一次完整玩家路径

**只有以上全部通过，场景才算完成。**
