# 设计规范(Design System)

> 版本 1.0 · 2026-09-09 · 参照 ChatGPT / Codex 设计语言
> 代码真源:`src/ui/design.ts`(几何与字型)+ `src/ui/theme.ts`(配色)
> 组件资产:`src/ui/components.tsx`

---

## 一、设计原则

1. **明度分层替代硬边框**:表面靠明度差区分层级,边框只做极弱分隔。
2. **近单色 + 单强调色**:界面以黑白灰为主,强调色(emerald)只出现在状态确认与主操作。
3. **胶囊化控件**:按钮、徽标、开关一律胶囊形(rounded-full)。
4. **层级靠字重与字号**:不依赖容器与描边制造层级。
5. **禁令**:页面代码不得硬编码字号 / 圆角 / 间距 / 颜色,一律引用设计令牌。

## 二、配色(ThemeTokens)

| 令牌 | 浅色 | 深色 | 用途 |
|------|------|------|------|
| `bg` | `#FFFFFF` | `#212121` | 画布 |
| `bgSecondary` | `#F9F9F9` | `#1A1A1A` | 导航栏等次级表面 |
| `bgCard` | `#F7F7F8` | `#2F2F2F` | 卡片、输入底 |
| `text` | `#0D0D0D` | `#ECECEC` | 主文本 |
| `textMuted` | `#5D5D5D` | `#B4B4B4` | 次级文本 |
| `textTertiary` | `#8E8E8E` | `#8E8E8E` | 辅助/时间戳 |
| `border` / `borderLight` | `#ECECEC` / `#F0F0F0` | `#3A3A3A` / `rgba(255,255,255,.06)` | 分隔 |
| `accent` | `#10A37F` | `#19C37D` | 强调(品牌标、开关、滑杆) |
| `btnPrimaryBg` | `#0D0D0D`(白字) | `#FFFFFF`(黑字) | 主按钮(反转) |
| `successText` | `#0D8A6C` | `#19C37D` | 成功提示 |
| `errorText` | `#D93A35` | `#FF5C4C` | 错误/危险 |

语义色(与主题无关,`design.ts#semantic`):金标准徽标 amber(`#B45309` on `rgba(245,158,11,.15)`)、知识库徽标 emerald(`#0D8A6C` on `rgba(16,163,127,.12)`)。

## 三、字型

| 令牌 | 值 | 用途 |
|------|-----|------|
| `fontSize.caption` | 10.5 | 时间戳、来源、脚注 |
| `fontSize.secondary` | 11.5 | 回复正文、描述 |
| `fontSize.body` | 12.5 | 问题/条目标题、按钮(默认) |
| `fontSize.title` | 13.5 | 弹窗标题 |
| `fontSize.heading` | 15 | 页面标题 |
| `fontWeight` | 400 / 500 / 600 / 650 | 常规 / 中等 / 半粗 / 仅页面标题 |

字体栈:`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei", sans-serif`;数字统一 `tabular-nums`。

## 四、几何

| 令牌 | 值 | 用途 |
|------|-----|------|
| `radius.sm / md / lg / xl / pill` | 8 / 12 / 14 / 16 / 9999 | 微元素 / 输入框 / 卡片 / popup 外框 / 胶囊 |
| `spacing.xs→xxl` | 4 / 6 / 8 / 10 / 12 / 16 | 4 的倍数栅格 |
| `size.popupWidth / popupHeight` | 400 / 560 | popup 固定外框(内容区滚动) |
| `size.railWidth / railBtn` | 52 / 36 | 图标导航栏 / 导航按钮 |
| `motion.fast / normal` | 0.12s / 0.15s ease | 悬停 / 开关过渡 |

## 五、组件资产(`ui/components.tsx`)

| 组件 | 说明 |
|------|------|
| `Btn` | 胶囊按钮,4 种 variant:default / primary(黑底白字) / danger / ghost |
| `Card` | 卡片容器(lg 圆角 + 明度分层),可选标题 |
| `Badge` | 徽标,3 种 tone:golden / knowledge / neutral |
| `Notice` | 结果提示条(成功绿 / 错误红,md 圆角) |
| `EmptyState` | 空状态(居中、两行文案) |
| `SearchInput` | 带放大镜的搜索输入框 |
| `Toggle` | ChatGPT 式拨杆开关(accent 色) |
| `Slider` | 数值滑杆(accent 色、tabular-nums 数值) |
| `SectionLabel` | 小节标签 |
| `inputStyle` | 表单元素统一样式原语 |

图标:统一走 `ui/icons.tsx`(lucide-react 封装,24px 画布 / 2px 描边 / 圆角线帽),与 ChatGPT 图标同一设计语言;禁止使用 emoji 充当图标。

## 六、文案规范

- 操作按钮:两字优先(填充 / 复制 / 编辑 / 删除 / 确认 / 取消 / 创建 / 保存 / 设金 / 启用 / 停用)。
- 空状态:「暂无 ××」+ 一句引导。
- 结果提示:动宾结构直述结果;固定表述「发送由人工完成」「后台将自动向量化」。
- 技术细节放 tooltip / title,不挤占界面文案。

## 七、popup 全局样式(注入于 `popup/index.tsx`)

- `.pddcs-btn`:胶囊基础样式(边框、圆角、过渡)。
- `.pddcs-input`:输入框基础样式(focus 由内联 border 提亮)。
- `.pddcs-scroll`:悬浮才出现的细滚动条。
- `.pddcs-rail-btn`:导航图标按钮(悬浮灰块)。
- 外框:`overflow:hidden; border-radius:16px`,body 背景透明。
