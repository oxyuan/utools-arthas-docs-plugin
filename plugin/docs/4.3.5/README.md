# Arthas 文档离线镜像（v4.3.5）

本目录是通过抓取 <https://arthas.aliyun.com/doc/> 生成的 Markdown 版本，站点导航标注的版本为 **v4.3.5**。

- 抓取时间：2026-10-17 07:49:49 (UTC)
- 页面总数：76
- 转换方式：抓取页面正文 HTML，去除侧边目录 / 页脚 / 锚点等站点结构后转为 GFM Markdown，并沿用 `plugins/scripts/normalize-md.js` 做格式规范化
- 图片：正文图片已下载到插件根目录 `images/`，文档中以 `images/xxx.png` 引用
- 站内链接：`/doc/xxx.html` 已改写为 `/doc/xxx.md`，便于插件内跳转

## jvm 相关

| 文档 | 说明 |
| --- | --- |
| [dashboard](./dashboard.md) | 当前系统的实时数据面板 |
| [getstatic](./getstatic.md) | 查看类的静态属性 |
| [heapdump](./heapdump.md) | dump java heap, 类似 jmap 命令的 heap dump 功能 |
| [jvm](./jvm.md) | 查看当前 JVM 的信息 |
| [logger](./logger.md) | 查看和修改 logger |
| [mbean](./mbean.md) | 查看 Mbean 的信息 |
| [memory](./memory.md) | 查看 JVM 的内存信息 |
| [ognl](./ognl.md) | 执行 ognl 表达式 |
| [perfcounter](./perfcounter.md) | 查看当前 JVM 的 Perf Counter 信息 |
| [sysenv](./sysenv.md) | 查看 JVM 的环境变量 |
| [sysprop](./sysprop.md) | 查看和修改 JVM 的系统属性 |
| [thread](./thread.md) | 查看当前 JVM 的线程堆栈信息 |
| [vmoption](./vmoption.md) | 查看和修改 JVM 里诊断相关的 option |
| [vmtool](./vmtool.md) | 从 jvm 里查询对象，执行 forceGc |

## class/classloader 相关

| 文档 | 说明 |
| --- | --- |
| [classloader](./classloader.md) | 查看 classloader 的继承树，urls，类加载信息，使用 classloader 去 getResource |
| [classloader-metaspace](./classloader-metaspace.md) | 按 ClassLoader 实例统计 metaspace / class metadata 内存 |
| [dump](./dump.md) | dump 已加载类的 byte code 到特定目录 |
| [jad](./jad.md) | 反编译指定已加载类的源码 |
| [mc](./mc.md) | 内存编译器，内存编译.java文件为.class文件 |
| [redefine](./redefine.md) | 加载外部的.class文件，redefine 到 JVM 里 |
| [retransform](./retransform.md) | 加载外部的.class文件，retransform 到 JVM 里 |
| [sc](./sc.md) | 查看 JVM 已加载的类信息 |
| [sm](./sm.md) | 查看已加载类的方法信息 |

## monitor/watch/trace 相关

| 文档 | 说明 |
| --- | --- |
| [monitor](./monitor.md) | 方法执行监控 |
| [line](./line.md) | 观察指定源码行的入参、局部变量和表达式结果 |
| [stack](./stack.md) | 输出当前方法被调用的调用路径 |
| [trace](./trace.md) | 方法内部调用路径，并输出方法路径上的每个节点上耗时 |
| [tt](./tt.md) | 方法执行数据的时空隧道，记录下指定方法每次调用的入参和返回信息，并能对这些不同的时间下调用进行观测 |
| [watch](./watch.md) | 方法执行数据观测 |

## profiler/火焰图

| 文档 | 说明 |
| --- | --- |
| [profiler](./profiler.md) | 使用对应用采样，生成火焰图 |
| [jfr](./jfr.md) | 动态开启关闭 JFR 记录 |

## 鉴权

| 文档 | 说明 |
| --- | --- |
| [auth](./auth.md) | 鉴权 |

## options

| 文档 | 说明 |
| --- | --- |
| [options](./options.md) | 查看或设置 Arthas 全局开关 |

## 扩展命令

| 文档 | 说明 |
| --- | --- |
| [external-command](./external-command.md) | 启动时从外部 jar 加载自定义 Arthas 命令 |

## 管道

| 文档 | 说明 |
| --- | --- |
| [grep](./grep.md) | 搜索满足条件的结果 |

## 基础命令

| 文档 | 说明 |
| --- | --- |
| [base64](./base64.md) | base64 编码转换，和 linux 里的 base64 命令类似 |
| [cat](./cat.md) | 打印文件内容，和 linux 里的 cat 命令类似 |
| [cls](./cls.md) | 清空当前屏幕区域 |
| [echo](./echo.md) | 打印参数，和 linux 里的 echo 命令类似 |
| [grep](./grep.md) | 匹配查找，和 linux 里的 grep 命令类似 |
| [help](./help.md) | 查看命令帮助信息 |
| [history](./history.md) | 打印命令历史 |
| [keymap](./keymap.md) | Arthas 快捷键列表及自定义快捷键 |
| [pwd](./pwd.md) | 返回当前的工作目录，和 linux 命令类似 |
| [quit](./quit.md) | 退出当前 Arthas 客户端，其他 Arthas 客户端不受影响 |
| [reset](./reset.md) | 重置增强类，将被 Arthas 增强过的类全部还原，Arthas 服务端关闭时会重置所有增强过的类 |
| [session](./session.md) | 查看当前会话的信息 |
| [stop](./stop.md) | 关闭 Arthas 服务端，所有 Arthas 客户端全部退出 |
| [tee](./tee.md) | 复制标准输入到标准输出和指定的文件，和 linux 里的 tee 命令类似 |
| [version](./version.md) | 输出当前目标 Java 进程所加载的 Arthas 版本号 |

## 其它页面

| 文档 | 说明 |
| --- | --- |
| [advanced-use](./advanced-use.md) | 当需要排查一个问题，但是这个问题的出现时间不能确定，那我们就可以把检测命令挂在后台运行，并将保存到输出日志。 |
| [advice-class](./advice-class.md) | 无论是匹配表达式也好、观察表达式也罢，他们核心判断变量都是围绕着一个 Arthas 中的通用通知对象 Advice 进行。 |
| [agent](./agent.md) | 通常 Arthas 是以动态 attach 的方式来诊断应用，但从3.2.0版本起，Arthas 支持直接以 java agent 的方式启动。 |
| [ai](./ai.md) | Arthas 可以通过 MCP Server 接入 AI 助手，让 AI 客户端以工具调用的方式执行 Arthas 诊断命令，适合结合 Java 应用排障、运行… |
| [arthas-properties](./arthas-properties.md) | arthas.properties文件在 arthas 的目录下。 |
| [arthas3](./arthas3.md) | Arthas3.0 中最重要的特性，不需要登录机器就可以对应用进行诊断，体验和本地诊断完全一致 |
| [async](./async.md) | arthas 中的后台异步任务，使用了仿 linux 系统任务相关的命令。linux 任务相关介绍。 |
| [batch-support](./batch-support.md) | 通过批处理功能，arthas 支持一次性批量运行多个命令，并取得命令执行的结果。可结合 --select 参数可以指定进程名字一起使用。 |
| [commands](./commands.md) | 请注意，这些命令，都通过字节码增强技术来实现的，会在指定类的方法中插入一些切面来实现数据统计和观测，因此在线上、预发使用时，请尽量明确需要观测的类、方法以及条件… |
| [contact-us](./contact-us.md) | 使用疑问，意见可以直接在 Issues 里提出： https://github.com/alibaba/arthas/issues |
| [docker](./docker.md) | 很多时候，应用在 docker 里出现 arthas 无法工作的问题，是因为应用没有安装 JDK ，而是安装了 JRE 。… |
| [download](./download.md) | 最新版本，点击下载： |
| [faq](./faq.md) | 不在本列表里的问题，请到 issue 里搜索。 https://github.com/alibaba/arthas/issues |
| [groovy](./groovy.md) | Arthas 支持 groovy 脚本增强，允许像 BTrace 一样编写脚本来解决问题，可以在 groovy 脚本中进行 if/for/switch/whil… |
| [http-api](./http-api.md) | Http API 提供类似 RESTful 的交互接口，请求和响应均为 JSON 格式的数据。… |
| [idea-plugin](./idea-plugin.md) | 插件由社区开发者提供。 |
| [install-detail](./install-detail.md) | 下载arthas-boot.jar，然后用java -jar的方式启动： |
| [manual-install](./manual-install.md) | 最新版本，点击下载： |
| [mcp-server](./mcp-server.md) | Arthas MCP Server 是 Arthas 的实验性模块，实现了基于 MCP（Model Context Protocol） 协议的服务端。… |
| [ognl-express](./ognl-express.md) | 本页介绍 Arthas 中较复杂、但仍适合在线诊断的 OGNL 写法，重点说明变量、集合筛选与投影、临时结果组装、空值处理和 ClassLoader。… |
| [quick-start](./quick-start.md) | 可以通过下面的方式自己动手实践，快速入门。 |
| [release-notes](./release-notes.md) |  |
| [save-log](./save-log.md) | 将命令的结果完整保存在日志文件中，便于后续进行分析 |
| [spring-boot-starter](./spring-boot-starter.md) | arthas 3.7.2及以后的版本同时支持 springboot 2/3 |
| [start-arthas](./start-arthas.md) | 启动脚本如下： |
| [tunnel](./tunnel.md) | 通过 Arthas Tunnel Server/Client 来远程管理/连接多个 Agent。 |
| [web-console](./web-console.md) | Arthas 目前支持 Web Console，用户在 attach 成功之后，可以直接访问：http://127.0.0.1:8563/。 |
