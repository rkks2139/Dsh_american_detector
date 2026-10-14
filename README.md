# dsh-american-detector

一个 DSH 插件（bundle）：判断**你是不是美国用户**，如果是，就在你每次发送指令时弹出一个
**假的**“您的账户已被封禁”弹窗——按**任意键**或点一下空白处就能关掉，关掉后一切照常。

它纯属恶搞，不联网、不上传、不修改任何账户状态。

## 它检查什么

| 信号 | 判定内容 | 权重 |
|---|---|---|
| 系统语言 / 区域 | 系统语言是否为英文、区域是否为美国（macOS 读 `AppleLocale` / `AppleLanguages`） | 16 |
| 浏览器语言 | 浏览器首选语言是否英文、是否 `en-US` | 22 / 16 |
| 时区代码 | 浏览器 / 主机时区是否落在 `America/New_York … America/Los_Angeles` | 18 / 10 |
| VPN / 代理 | 是否开启 VPN（`utun*`、`tun*`、`wg*`、`tailscale*` 隧道网卡）或系统/环境代理 | 16 / 12 |
| 浏览器出品方 | 浏览器是不是美国人开发的（Chrome、Arc、Safari、Edge、Firefox、Brave…） | 14 / 10 |
| 美国公司软件 | 电脑中是否有美国经营主体开发的软件（扫 `/Applications`、PATH、Windows 注册表） | 18 / 12 |
| 接入美国 LLM | 是否接入 claude / chatgpt / ollama / cursor / copilot 等（配置目录 + API Key 环境变量） | 14 / 9 |
| 操作系统 | 设备系统是否是 macOS 或 Windows | 8 |
| Docker 伪装 | 系统声称 Linux，但内核属于容器运行时（`/.dockerenv`、cgroup、overlayfs…） | 18 |
| 页面语言 | 界面是否以英文渲染（`document.lang`） | 8 |
| 12 小时制 | 是否使用美国习惯的 AM/PM 时间格式 | 4 |

判定规则（`src/client/verdict.js`）：

* **硬性规则**（命中任意一条直接判为美国用户）：浏览器首选 `en-US`、浏览器时区是美国本土时区。
* **加权累计**：所有命中信号权重相加，`>= 60` 分判为美国用户。
* 两者取或。

也就是说：一个中文系统 + `Asia/Shanghai` + 中文浏览器的用户，就算装了一堆美国软件、
开着 VPN，也基本到不了 60 分；而一个 `en-US` + 美国时区的用户会直接命中硬性规则。

## 安装

插件包就在这个目录（`dsh-american-detector/`）。

```sh
# 已经装好了。重装 / 换 profile：
node scripts/install.mjs --profile web

# 卸载
node scripts/install.mjs --profile web --uninstall
```

安装脚本做两件事（等价于 `dsh plugin --profile web add file:<本目录>`，本机没有 pnpm 所以手动做）：

1. 把本包链接到 `~/.dsh/profiles/<profile>/node_modules/dsh-american-detector`；
2. 把 `dsh-american-detector` 追加到该 profile `package.json` 的 `dsh.profile.bundles`。

profile 的 `package.json` 里 `patchReload: live`，所以运行中的 `dsh web` 会**热加载主机侧**；
浏览器侧需要在网页里**刷新一次**（启动图 `window.__DSH_BOOT__` 只在页面渲染时注入）。

## 验证

```sh
# 主机侧报告（OS、软件、LLM、VPN、Docker、时区）
curl -s http://127.0.0.1:3080/api/american-detector/report | head -c 600

# 强制刷新一次扫描
curl -s http://127.0.0.1:3080/api/american-detector/refresh >/dev/null

# 浏览器控制台（页面里）
window.__AMERICAN_DETECTOR__.verdict()   # 看当前判定和完整打分表
window.__AMERICAN_DETECTOR__.show()      # 立刻弹一个假封禁弹窗
window.__AMERICAN_DETECTOR__.rescan()    # 重新扫描主机并返回新判定
```

## 调试开关（加在 URL 上）

| 参数 | 作用 |
|---|---|
| `?dsh-ban=1` | 测试模式：不管多少分，每次发送都弹窗 |
| `?dsh-ban=0` | 关闭：绝不弹窗 |
| `?dsh-ban-score=40` | 改判定分数线（默认 60） |
| `?dsh-ban-off=browser-language,host-os` | 忽略指定信号（id 见打分表） |

例如：`http://127.0.0.1:3080/?dsh-ban=1`，发一条消息就能看到弹窗；
按任意键关闭，再发一条会再弹一次。

## 结构

```
dsh-american-detector/
├── package.json            # dsh.bundle（主机侧层）+ dsh.client（浏览器侧行）
├── cordis.patch.yml        # bundle 层：insert 主机侧插件行
├── src/host/detect.js      # 只读检测：系统、已装软件、LLM 配置、VPN、容器、时区
├── src/host/index.js       # 主机侧插件：/api/american-detector/report|refresh 路由
├── src/client/browser-signals.js  # 浏览器侧信号：语言、时区、UA、出品方、页面语言
├── src/client/verdict.js   # 打分与判定
├── src/client/overlay.js   # 假封禁弹窗（shadow DOM，独立样式，不会污染 GUI）
├── src/client/index.js     # 插件主体：监听“发送指令”→ 判定 → 弹窗；任意键关闭
├── lib/client.js           # 构建产物：window.__ModuleLoader__.load(...) 闭包工厂包
└── scripts/
    ├── build-client.mjs    # 把 src/client/*.js 打成 lib/client.js（零依赖）
    ├── test-client.mjs     # 无头冒烟测试（stub 浏览器 + 假 ctx）
    └── install.mjs         # 装进 / 卸出 profile
```

## 它是怎么发现“发送了指令”的

主路径（可靠）：插件订阅每个会话的 `SessionBinding.session` 快照，
`pendingSubmissions` 一出现新条目就说明你按了发送（`beginSubmission` 在提示词发出前调用）。
这条路径与输入框实现无关，`Enter`、点发送按钮、附件发送都能捕获。

兜底路径：捕获阶段监听 `keydown`，在输入框里按 Enter 且草稿非空也视为发送，
并且这一次按键会被“关弹窗”逻辑吃掉，不会真的发出去（因为已经弹窗了）。

## 安全说明

* 所有检测都是**只读**的：读文件、读环境变量、读注册表、读网卡列表，仅此而已。
* 除 `/api/american-detector/report`（本机回环地址、只返回检测结果）外没有任何网络请求；
  没有任何遥测、上传或外发。
* 弹窗只是 DOM，它**不会**真的封禁、修改或删除任何东西；它渲染在自己的 shadow DOM 里，
  不影响 GUI 的样式与状态。
* 弹窗底部自带一行小字说明这是假的恶搞弹窗，避免真的吓到人。
