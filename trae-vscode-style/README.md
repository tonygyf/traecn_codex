# VS Code 的 Trae 外观

已安装本地主题扩展 `local-style.trae-local-themes`，包含 **Trae Deep Blue、Trae Dark、Trae Light** 和 **Trae File Icons**。当前启用 Deep Blue。

在 VS Code 中依次按 `Ctrl+K`、`Ctrl+T`，输入 `Trae` 即可切换这三套主题。

主题和文件图标取自本机 Trae CN 的资源，并将 Trae 私有界面颜色映射到了 VS Code 支持的界面颜色。扩展仅声明主题和图标，没有运行时代码。

代码字体改为 Trae 默认的 JetBrains Mono，14px、默认行距、普通字重；终端和调试控制台也使用该字体。字体安装在当前用户下。标签栏采用紧凑高度，并关闭编辑器缩略图和面包屑。

主题覆盖编辑器、侧栏、标题栏、状态栏、菜单和代码高亮。Trae 独有的圆角分区、专用按钮和 UI 字体排列属于它的应用界面实现，普通 VS Code 主题无法完全复刻。

## 恢复

原始配置备份位置记录在 `backup-path.txt`。运行本目录的 `restore-settings.ps1`，可恢复本次修改的外观设置，并保留其他设置。主题扩展和字体会留在本机，可继续选用。

`prepare.py` 是此次生成主题包及配置的记录脚本，无需重复运行。`trae-local-themes-1.0.0.vsix` 是可重新安装的主题包。
