# Trae CN：把 Codex 放到右侧 AI 栏

此补丁让 Trae 右侧出现独立的 **TRAE / Codex** 标签。左侧仍显示文件树，Codex 使用原插件的真实 Webview、登录状态和聊天历史。

## 原因与改动

当前 Trae CN `1.107.1`，commit `871bca3bb55e7a37af74c1eef2a9696f29aa7b26`：

1. 扩展清单的 schema 接受 `viewsContainers.secondarySidebar`，实际容器注册逻辑却没有处理它。Codex 的 `codexSecondaryViewContainer` 没有注册，`chatgpt.sidebarSecondaryView` 因而落入默认资源管理器。
2. Trae 的辅助侧栏只保留 `type: "ai"` 的容器；其他容器会被自动退回原位置。

补丁只为 `openai.chatgpt` 处理 `secondarySidebar`，在辅助侧栏注册其容器，并将该容器标记为 `ai`。两个修改点分别应用到普通界面和 Solo Lite 的 workbench bundle。Solo Lite Slim 没有这段扩展容器实现，保持原样。

补丁没有修改 Codex 扩展、模型、权限、网络、项目文件或会话内容。`product.json` 中对应的资源校验值同步更新，其他校验项保持原值。首次应用后需要完整退出 Trae 并重新打开；仅重载窗口时，旧主进程缓存的校验值可能出现“安装似乎损坏”提示。

## 检查、应用与回滚

在此目录运行：

```powershell
python .\patch.py check
python .\patch.py apply
python .\patch.py restore
```

`apply` 重复运行不会重复打补丁。它会先检查两个完整代码锚点、函数签名、原资源校验值，并用 `node --check` 验证修改后的 JavaScript，然后才写入；失败时会停止或恢复已写入的文件。脚本要求本机 Python 和 Node.js。

`latest-backup.txt` 记录备份目录，其中包含原始两个 bundle、原 `product.json`、哈希清单，以及应用前全局/当前工作区布局数据库的只读快照。回滚仅恢复补丁文件，不会覆盖聊天记录和日常布局数据。当前安装文件若已被升级或另行修改，回滚会停止，避免覆盖新版本。

## 更新后的维护

现已安装用户级 **Trae Codex 布局保持** 扩展，开关 `traeCodexLayout.keepAfterUpdate` 已启用。它会在启动时检查兼容性，并为兼容更新自动恢复补丁，不修改 Trae 的自动更新设置。日常无需运行这里的旧版手动脚本；详情见相邻 `trae-codex-layout-keeper/README.md`。新版本结构不兼容时会提示并停止写入，首次自动修复后可能需要完整重启一次。

Codex 插件升级通常不影响这个补丁，因为它改在 Trae 的容器兼容层。Trae 自身升级可能覆盖补丁；届时先运行 `check`，再尝试 `apply`。只有代码锚点和原始校验值均匹配时脚本才会应用，否则需要重新检查新版本，不能保证未来版本无需调整。

已验证：两个修改后的 JavaScript bundle 均通过语法检查；所有已登记安装资源的 SHA-256 校验匹配；补丁重复应用不重复修改文件；完整退出主进程、重启、重新打开原项目后 Codex 标签仍在右侧；TRAE 与 Codex 标签均能打开；原来的 OCR 会话可在右侧恢复。未发送测试消息，也未运行新的编码任务。

这是本机兼容补丁，当前版本的上述行为已验证，不代表 Trae 官方支持，也不能保证未来版本无需调整。
