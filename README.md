# dsh-american-detector

一个 DSH 插件（bundle）：判断**你是不是美国用户**，如果是，就在你每次发送指令时弹出一个
**假的**“您的账户已被封禁”弹窗——按**任意键**或点一下空白处就能关掉，关掉后一切照常。

它纯属恶搞，默认不联网、不上传、不修改任何账户状态。

## 它检查什么

判定用**贝叶斯对数几率**（不是加权求和），每个信号给出 `L = ln(P(观测|美国用户)/P(观测|非美国用户))`，
同一证据维度（`group`）内只保留最强的一条，总和 `>= 2.2` 判为美国用户。
完整系数表、共因折叠规则与标定画像见 **[docs/scoring.md](docs/scoring.md)**。

| 证据维度 | 检查内容 | L 范围 |
|---|---|---|
| 浏览器 UI 语言 | 首选语言 `en-US`/`en-*`/`zh*`、页面语言、12 小时制 | +1.3 ~ −1.2 |
| 跨源一致性 | 浏览器时区 + 浏览器语言 + 主机时区 + 系统区域 + 输入法 + IP 是否一致；**矛盾即"覆盖特征"** | +2.0 ~ −1.5 |
| 输入法 / 键盘布局 | 是否启用中文输入法（拼音等）——语言习惯的硬证据 | +0.8 ~ −1.3 |
| 系统语言 / 区域 | `AppleLocale` 是否 `en_US` / `zh_CN` | +1.2 ~ −0.8 |
| 时区代码 | 浏览器与主机时区（每次扫描实时读 `/etc/localtime`） | +0.7 ~ −0.4 |
| 代理 / VPN | **中文圈翻墙客户端**（Shadowrocket/Clash/Surge…）为负、西式 VPN 为弱正、默认路由是否走隧道 | +0.4 ~ −1.6 |
| 软件分布 | 中美厂商软件的**比例**（不是"有没有装美国软件"） | +1.1 ~ −0.9 |
| 接入的 LLM | claude / chatgpt / ollama / cursor / copilot 等，以及是否同时用中国厂商 | +0.6 ~ −0.3 |
| 浏览器出品方 | Chrome、Arc、Safari、Edge、Firefox、Brave… | +0.6 ~ −0.5 |
| 操作系统 | macOS / Windows / Linux | +0.5 ~ −0.4 |
| Docker 伪装 | 声称 Linux，但内核属于容器运行时 | +1.2 |
| IP 属地 | 公网 IP 国家码（**需显式开启 `?dsh-ip=1`**，默认关闭） | +0.7 ~ −0.7 |

关键点：**有反向证据**。一个中文系统 + `Asia/Shanghai` + 中文输入法 + 开着 Shadowrocket 的用户，
即使装了 7 个美国软件、用了一堆美国 LLM，判定是 **−2.9**（远低于 2.2）——不会被弹窗。
而把时区拨到美国、浏览器改成英文的伪装，会因为"跨源一致性出现矛盾"被判为美国用户。

## 关键词规则：输入 `test` 固定弹封禁

与判定**完全无关**：只要提交的指令**整行就是** `test`（`BAN_KEYWORDS`），就固定弹出封禁警告。

* 匹配规则：先 `trim`、转小写、去掉行尾标点空白，然后**整行相等**才算命中。
  所以 `test`、`Test`、` test `、`test!`、`TEST。` 都算；`latest`、`tester`、`test the plugin`、`测试 test` 都不算
  （避免误伤正文里提到 test 的正常指令）。
* 优先级最高：排在周期性认证门之前，因为它是**关键词规则**而不是统计判定——命中时不消耗轮次计数。
* 弹窗会明确写"命中内置触发词「test」"，折叠区标题也变成"关键词规则强制触发"。
* 关掉：`?dsh-keywords=0`；想改词表就编辑 `src/client/index.js` 里的 `BAN_KEYWORDS`。
* **不计入记忆式警报**：命中这一行会以 `{ forced: true, keyword: 'test', american: false }` 写进
  记忆（留档、可在 `history()` 里看到），但**不算作美国用户判定**，不会拉响警报。
  所以点掉弹窗后，下一条正常指令不会被"历史警报"继续弹；反复输入 `test` 也不会污染那 50 行窗口。
  `history()` 里 `forcedCount` 单列统计这些行，`americanCount` 不含它们。

## 弹窗外观

两个弹窗都**撑满整个 viewport**（内层留 `clamp()` 边距，卡片 `width/height: 100%`，
上限 1600px / 1240px），字号随手屏高度缩放。

* **封禁弹窗（红色）**：默认**只显示判决**——图标、`您的账户已被封禁`、一行英文副标题、
  一句理由。判定依据（对数几率明细、账户编号、模型、每行证据）**默认折叠**，点
  「查看判定依据」才展开；展开后证据以**两栏**排布，宽屏下用满横向空间。
* **认证弹窗（蓝色）**：同样全屏；默写口令放大、输入框与方框随屏幕缩放，步骤一/二纵向铺开。
* 两个弹窗互斥，认证门优先级更高（见下）。

## 记忆式警报（最近 50 次）

每次发送指令都会把这次判定记一行到 `localStorage`
（键 `dsh-american-detector/history/v1`，最多保留 **50** 行）。**只要这 50 行里出现过一次
「美国用户」，警报就保持拉响**：之后即使当前得分不达标，每次发送照样弹窗，弹窗里会写明
“历史警报：最近 N 次判定中有 M 次命中过美国用户”。

* 只增不减：一旦拉响，不会因为你换了语言或关了 VPN 就自动停。
* 想解除：`window.__AMERICAN_DETECTOR__.clearHistory()`，或用 `?dsh-ban=0` 临时压制
  （后者同时也关掉测试模式，是最高优先级的开关）。
* 也就是说：昨天被判定成美国用户、今天不是——今天仍然会弹，因为记忆里那一次还在。

## 登录认证门（每 4~5 轮一次，蓝色弹窗）

和风险判定**无关**：每发满 4 或 5 条指令（每轮重新随机），就会强制弹出一个**蓝色**的
「账户登录验证」窗口，**优先级高于封禁弹窗**（弹认证时不会同时弹封禁）。必须完成两个步骤才能继续：

1. **连续默写「中国人能飞」三遍**：必须简体中文，逐行输入、每行回车；繁体字（中國人能飛）、
   多字少字都会被判错并提示重来。标点与空格会被忽略，所以输入法的全角逗号不影响判定。
2. **假 reCAPTCHA**：按住方框不放，满 **10 秒**自动通过；中途松手即取消并重新计时。

两点把握：

* **不能跳过**：未完成的挑战会写进 `localStorage`（键 `dsh-american-detector/gate/v1`），
  刷新页面会**直接把弹窗恢复**；弹窗打开期间输入框被锁定，Esc、点空白、乱按键都不会关闭它。
* **只拦一次**：通过后计数清零、重新抽 4~5 轮，`已验证次数` 累加。

调试开关：`?dsh-gate=1` 下一条指令强制弹认证，`?dsh-gate=0` 完全关闭这道门，
`window.__AMERICAN_DETECTOR__.gateNow()` 立刻弹出，`.resetGate()` 清零计数。

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
window.__AMERICAN_DETECTOR__.verdict()       # 当前判定 + 完整打分表 + 是否因记忆拉响
window.__AMERICAN_DETECTOR__.history()       # 记忆摘要：条数、命中次数、最近的分数与时间
window.__AMERICAN_DETECTOR__.export()        # 记忆 + 认证门状态的 JSON（可直接贴出来排查）
window.__AMERICAN_DETECTOR__.clearHistory()  # 清空记忆、解除警报
window.__AMERICAN_DETECTOR__.keywords()      # 关键词词表，默认 ['test']
window.__AMERICAN_DETECTOR__.matchesKeyword(v)# 某行是否会触发关键词规则
window.__AMERICAN_DETECTOR__.gate()          # 认证门：已过几次、下一轮第几条、是否有未完成的挑战
window.__AMERICAN_DETECTOR__.gateNow()       # 立刻弹出蓝色认证窗口
window.__AMERICAN_DETECTOR__.resetGate()     # 认证计数清零
window.__AMERICAN_DETECTOR__.show()          # 立刻弹一个假封禁弹窗（默认折叠理由）
window.__AMERICAN_DETECTOR__.rescan()        # 重新扫描主机并返回新判定
```

## 调试开关（加在 URL 上）

| 参数 | 作用 |
|---|---|
| `?dsh-ban=1` | 测试模式：不管多少分，每次发送都弹窗 |
| `?dsh-ban=0` | 关闭：绝不弹窗（也能压制记忆式警报和认证门） |
| `?dsh-ban-score=1.5` | 改判定线（对数几率，默认 2.2） |
| `?dsh-ip=1` | 允许**一次**公网 IP 国家码查询，用于跨源一致性（默认关闭） |
| `?dsh-ban-off=browser-language,host-os` | 忽略指定信号（id 见打分表） |
| `?dsh-gate=1` | 下一条指令强制弹出蓝色登录认证 |
| `?dsh-gate=0` | 完全关闭登录认证门 |
| `?dsh-keywords=0` | 关闭关键词规则（输入 `test` 不再固定弹窗） |

例如：`http://127.0.0.1:3080/?dsh-ban=1`，发一条消息就能看到弹窗；
按任意键关闭，再发一条会再弹一次。想直接看认证门：`http://127.0.0.1:3080/?dsh-gate=1`。

## 结构

```
dsh-american-detector/
├── package.json            # dsh.bundle（主机侧层）+ dsh.client（浏览器侧行）
├── cordis.patch.yml        # bundle 层：insert 主机侧插件行
├── src/host/detect.js      # 只读检测：系统、已装软件、LLM 配置、VPN、容器、时区
├── src/host/index.js       # 主机侧插件：/api/american-detector/report|refresh 路由
├── src/client/browser-signals.js  # 浏览器侧信号 + 跨源一致性计算
├── src/client/score.js     # 评分模型：对数几率、共因折叠、阈值、历史重放
├── src/client/history.js   # 最近 50 次判定的记忆（localStorage）+ 记忆式警报
├── src/client/gate.js      # 登录认证门的计数、口令规则、挑战持久化
├── src/client/overlay.js   # 假封禁弹窗（红色，shadow DOM，独立样式，不污染 GUI）
├── src/client/gate-overlay.js     # 登录认证弹窗（蓝色，默写 + 假 recaptcha）
├── src/client/index.js     # 插件主体：监听“发送指令”→ 优先级调度 → 弹窗
├── lib/client.js           # 构建产物：window.__ModuleLoader__.load(...) 闭包工厂包
└── scripts/
    ├── build-client.mjs    # 把 src/client/*.js 打成 lib/client.js（零依赖）
    ├── dom-harness.mjs     # 无头浏览器 stub（元素、shadow DOM、事件、定时器、localStorage）
    ├── test-client.mjs     # 封禁弹窗 + 记忆式警报的测试
    ├── test-gate.mjs       # 登录认证门的测试（计数、口令、计时、刷新恢复）
    ├── calibrate.mjs       # 用 10 个合成画像标定阈值与系数
    ├── dryrun.mjs          # 用本机真实数据跑一遍判定（不打开 GUI）
    ├── test-all.mjs        # 构建 + 全部测试 + 标定
    └── install.mjs         # 装进 / 卸出 profile
├── docs/scoring.md         # 评分模型：系数表、共因折叠、标定画像与方法论
```

## 优先级

每次发送指令按这个顺序处理：

1. **认证门已经开着** → 吃掉这次按键，只把焦点还给认证输入框。
2. **整行等于关键词（`test`）** → 固定弹红色封禁弹窗（不消耗认证门的轮次计数）。
3. **认证门到点（每 4~5 轮）** → 弹蓝色认证窗口，这次发送不会真的发出（`Enter` 被拦下）。
4. **判定为美国用户**（含记忆式警报）→ 弹红色封禁弹窗，也是关掉才会继续。
5. 否则放行。

## 它是怎么发现“发送了指令”的

主路径（可靠）：插件订阅每个会话的 `SessionBinding.session` 快照，
`pendingSubmissions` 一出现新条目就说明你按了发送（`beginSubmission` 在提示词发出前调用）。
这条路径与输入框实现无关，`Enter`、点发送按钮、附件发送都能捕获。

兜底路径：捕获阶段监听 `keydown`，在输入框里按 Enter 且草稿非空也视为发送，
并且这一次按键会被“关弹窗”逻辑吃掉，不会真的发出去（因为已经弹窗了）。

认证门自己带输入框：它的 `keydown` 会 `stopImmediatePropagation`，而全局监听器用
`event.composedPath()` 判断事件是否来自认证窗口内部，因此窗口打开时打字只会进认证框。

## 安全说明

* 所有检测都是**只读**的：读文件、读环境变量、读注册表、读网卡列表，仅此而已。
* 除 `/api/american-detector/report`（本机回环地址、只返回检测结果）外没有任何网络请求；
  没有任何遥测、上传或外发。
* 弹窗只是 DOM，它**不会**真的封禁、修改或删除任何东西；它渲染在自己的 shadow DOM 里，
  不影响 GUI 的样式与状态。
* 认证门同样是假的：口令校验和 10 秒计时都在本机用 JavaScript 完成，不发请求、不校验任何凭据、
  不改登录状态；它只是把页面挡住而已。
* 弹窗底部自带一行小字说明这是假的恶搞弹窗，避免真的吓到人。
* 判定记忆和认证计数只写在浏览器的 `localStorage` 里，不落盘到别处、不外发；
  `clearHistory()` / `resetGate()` 或清站点数据即可抹掉。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 刷新后完全不弹 | 确认 URL 里没有 `?dsh-ban=0` / `?dsh-gate=0`；控制台跑 `window.__AMERICAN_DETECTOR__.verdict()` 看分数与警报状态 |
| `window.__AMERICAN_DETECTOR__` 是 undefined | 客户端包没挂载：刷新页面；再不行看 `dsh web` 终端有没有 client-modules 报错 |
| 判定分接近 0（几乎没有证据） | 主机侧报告没读到：`curl -s 127.0.0.1:3080/api/american-detector/report` 看是否 200；插件启动时会自动重试 5 次 |
| 想知道"为什么是这个判定" | 弹窗里点「查看判定依据」，或 `node scripts/dryrun.mjs`、`node scripts/calibrate.mjs --verbose`（**◆** 反向证据、**▪** 已折叠的共因证据） |
| 昨天会弹今天不弹 | 现在有记忆式警报，不会再出现；若确实没弹，看 `history()` 里有没有 `american: true` 的行 |
| 认证门一直不出现 | `gate()` 看 `nextAt` 和 `turns`；`?dsh-gate=0` 会彻底关掉它 |
| 认证门一刷新又回来 | 这是设计：未完成的挑战会持久化，`resetGate()` 可以清掉 |
| 想彻底静音但保留记忆 | `?dsh-ban=0`（只压制，不删除记忆），或 `?dsh-gate=0` 单独关认证门 |
