# Native Polish for Paseo

[English](README.md)

为 Paseo 现有界面增加动效，沿用原有视图和控件。

## 功能

- 左侧栏和 Explorer 展开／收起，并带动相邻 pane 调整大小。
- 新建 workspace 条目淡入，归档时淡出，相邻条目平滑补位。归在侧边栏动效开关下。
- Workspace pin／unpin、状态分组迁移时平滑移动；Project 新增／删除时分组进出场，相邻条目补位。
- Pane 分割、关闭、最大化及恢复。
- Tab 打开、关闭、排序和选中状态过渡。
- 文件树、文件夹箭头、工具调用和 thinking 展开／收起。
- 菜单、弹层、按钮按压和 hover 反馈。
- Agent 状态变化，以及对话尾部新消息的一次淡入。
- Agent 对话、workspace、Files 和 Changes 列表的弹性滚动：到顶／到底后轻微拉动，再以阻尼弹簧回到原位。

各类动效可独立关闭；支持 Gentle（220 ms）和 Quick（150 ms）。遵循系统 Reduce Motion 设置。

弹性滚动有独立的 **Elastic scrolling** 开关。支持的 macOS／iOS 浏览器直接沿用平台回弹；Electron 等环境使用近似效果：拉动实时跟手，阻力随视口大小和距离增加，结束后快速归位，快速甩动触边只回弹一次，惯性尾段的小幅波动不会反复拉开列表；已经到顶或到底时，重新施力或分次滚动仍可再次拉动，并从当前位移衔接。横向滚动、缩放和嵌套代码滚动区保留原有行为。Quick 只加快近似效果的归位；原生移动客户端沿用现有滚动。

桌面端仍是近似效果：Paseo 的 Electron 窗口尚未开启 `scrollBounce`，客户端插件无法修改这个主进程选项。完全一致的 macOS 回弹需要 Paseo 本身支持。

流式更新按界面区域合并处理；快速滚动期间暂停 workspace 快照复制，停止输入后再更新布局基线。编辑、选字和输入法输入绕过全局动效捕获，编辑器和终端内部更新不触发应用布局扫描。窗口失焦或隐藏时暂停动效和扫描，回来后更新当前布局，不补播后台变化。文件树每次提交只抓取一次有数量上限的快照。

## 安装

需要 **Paseo 0.11.2**，并在目标 daemon 启用插件。声明兼容范围为 `>=0.11.2 <0.12.0`；其他补丁版本尚未逐一检查。

```sh
paseo plugin add git:JasprW/paseo-native-polish
```

点击侧边栏 **Native Polish**，或在 Command Center 中选择 **Native Polish: motion settings**。

```sh
paseo plugin update paseo-native-polish
paseo plugin disable paseo-native-polish
paseo plugin enable paseo-native-polish
```

## 平台与数据

动效适用于桌面和浏览器客户端；iOS／Android 保留原有原生过渡。适配器依赖 Paseo 0.11.2 的内部 DOM，升级到新 minor 版本需要重新检查。

插件没有 daemon 后端，也不发送外部请求。退出动效会短暂复制本地可见 DOM；副本不可交互、对辅助技术隐藏，并在过渡后移除。拖动和滚动会中断动效，流式文本及历史消息不会反复播放入场动画。

设置保存在当前客户端的 local storage。停用或卸载插件会清理监听器、样式和动画副本。

## 开发

```sh
git clone https://github.com/JasprW/paseo-native-polish.git
cd paseo-native-polish
npm ci --ignore-scripts
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload paseo-native-polish
```

使用 Node.js 22。目录结构、实现说明和贡献方式见 [English README](README.md)、[架构说明](docs/architecture.md) 和 [CONTRIBUTING](CONTRIBUTING.md)。CI 运行类型检查，视觉交互需在 Paseo 中手动检查。

## 许可证

[Apache-2.0](LICENSE)。这是独立的 Paseo 插件。
