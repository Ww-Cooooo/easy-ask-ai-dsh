# 安装与更新

[返回项目首页](../README.md)

本页介绍基于 [Easy Ask AI Skill](https://github.com/Ww-Cooooo/easy-ask-ai) 改编的 Harness 插件。**在其他 Agent 中使用，请[安装原版 Skill](https://github.com/Ww-Cooooo/easy-ask-ai#安装与开始使用)**（需支持 Skill；不含 Harness 原生侧栏）。

已验证目标为 Windows、DeepSeek Harness 0.2.2-rc.1。安装包已经编译，普通用户不需要构建源码。模型、账号和工作区由 Harness 配置；插件不附送模型或 Token。

## 常用客户端

打开 **插件 → 添加插件**，输入固定版本压缩包地址并安装、启用：

```text
https://github.com/Ww-Cooooo/easy-ask-ai-dsh/releases/download/v0.4.10/eh3-dsh-easy-ask-ai-0.4.10.tgz
```

网络不便时，先从 [v0.4.10 Release](https://github.com/Ww-Cooooo/easy-ask-ai-dsh/releases/tag/v0.4.10) 下载同名 `.tgz`，再在添加插件时选择其本地路径。Release 同时提供 SHA-256 文件供核对。

按管理器显示的应用结果处理：如提示重启，保存未发送输入后重启。进入工作区的一条普通聊天，点击输入栏附近的“查看本次对话”；右栏应显示本聊天的讨论。左侧“Easy Ask AI DSH”保留完整记录与导出入口。

## 命令行独立试用

使用官方 `dsh` 命令，在安装包所在文件夹执行下列命令。`easy-ask-ai-test` 必须是尚未使用的新配置名；若名称已被占用，请在三条命令中同时换名。第一条会创建配置并显示帮助后退出；**不要对已有配置重复使用 `--from-default-profile`，它会替换该配置的插件清单。**

```sh
dsh --profile easy-ask-ai-test --from-default-profile web --help
dsh plugin --profile easy-ask-ai-test add ./eh3-dsh-easy-ask-ai-0.4.10.tgz
dsh --profile easy-ask-ai-test
```

首次安装可能联网取得依赖。这个独立配置需要自行配置模型、加入工作区，不会更新另一个常用客户端配置。

桌面版自带 CLI。如果终端找不到 `dsh`，将上述命令中的 `dsh` 换成安装目录内 `resources/runtime/cli/bin/dsh.cmd` 的完整路径；在 PowerShell 7 中，带空格的可执行路径应写为 `& '实际路径/dsh.cmd'`，后面保留原参数。

## 更新、停用与移除

从新版本 Release 取得固定版本包，在使用该插件的同一配置中安装。压缩包来源没有 npm 注册表来源的同款自动版本更新区。更新前可备份工作区 `.prompt-ready/<任务标识>/eh3-easy-ask-ai/`；不要为了更新重新创建或重置整个 Harness 配置。

管理器里停用或移除插件不会删除这些工作区记录、原文件或另存的结果。重新安装后从原工作区恢复，不会自动重发旧任务。更多数据清理边界见 [使用说明](USAGE.md#数据失败与卸载)。

当前不提供 npm 安装命令；社区目录是否收录不影响从 Release 直接安装。本插件与原 Easy Ask AI Skill 使用独立仓库和包。
