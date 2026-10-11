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

各类动效可独立关闭；支持 Gentle（220 ms）和 Quick（150 ms）。遵循系统 Reduce Motion 设置。

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
