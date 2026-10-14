# Dsh_american_detector
一个 dsh 插件，用于恶搞neta某些ai工具的中国用户封禁机制。如果检测到用户可能是位于美国的用户，这个插件会在向dsh提问时弹出弹窗。
美国用户的判断条件
-系统语言，浏览器语言是否为英文
-时区是否为美国境内
-是否开启 vpn
-浏览器是否为美国公司开发的bing，arc，chrome等
-电脑中是否有由经营主体在美国的公司开发的软件
-api 是否接入 claude，chatgpt，ollama 等美国 llm
-设备系统是否是 macos 或 windows
-是否有通过 docker 伪装成 linux 掩盖操作系统
弹窗对 dsh 的运行没有任何改变，可以通过按下任意键消除。
