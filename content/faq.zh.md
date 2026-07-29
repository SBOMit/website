---
author: "SBOMit Maintainers"
title: "常见问题解答"
translationKey: "faq"
ShowToc: true
TocOpen: false
---
## 为什么我们需要精确的SBOMs？

2021年12月，当[Log4Shell (CVE-2021-44228)](https://nvd.nist.gov/vuln/detail/CVE-2021-44228)爆发时，
在不到72小时内，受影响的系统数量从4万激增至83万。 Log4j
作为传递依赖被深埋在代码中，大多数团队根本无从知晓是否在运行该组件，更遑论其具体位置。事件响应工作因此演变为一项涉及整个组织的排查工程。

{{< figure src="/images/log4shell-growth.png" alt="Log4Shell affected systems grew from 40,000 to 830,000 in 72 hours" caption="Affected systems in the 72 hours following the Log4Shell outbreak." >}}

Log4Shell 事件清楚地证明了软件资产清点（SBOMs）的重要性：如果你拥有软件中每个
组件的完整、准确的清单，就能在几分钟内回答“我们是否受到影响？”这个问题。自那以后，软件资产清点
已成为行政命令、采购要求和行业框架所强制要求的内容。 
现在的问题是，生成的 SBOMs 是否足够准确以供实际使用，
而对于当今大多数组织而言，答案是否定的。当下一次 Log4Shell 漏洞出现时，您的 SBOM 能否解答这个问题？您是否信任它？

---

## 你的包管理器/清单无法识别什么？

超乎你的想象。我们分析了 Docker Hub 上排名前 1,000 的基于 Debian 的镜像，发现
许多镜像中相当大比例的文件（有时高达 40% 至 100%）根本无法归因于任何
软件包管理器。

{{< figure src="/images/dark-matter-dockerhub.png" alt="Distribution of untracked files across top 1,000 Docker Hub images" caption="Distribution of files unaccounted for by the package manager across the top 1,000 Debian-based Docker Hub images." >}}

这些是真实文件，在运行时加载，可能存在安全漏洞，且对任何依赖于包管理器 metadata 的 SBOM 工具而言都是不可见的。
我们的研究发现其中存在可被利用的 CVE：

- **CVE-2025-32754**（`jenkins/ssh-agent`）——SSH 密钥是在镜像构建时生成的，因此每个
  基于该镜像构建的容器都会使用相同的密钥。 攻击者可以连接到构建
  容器，读取构建密钥，并悄无声息地离开。
- **CVE-2025-32111** (`acme.sh`) — 构建过程中泄露了构建密钥。 攻击者
  若掌握此密钥，便可替换广泛使用的 Let's Encrypt 客户端，并对互联网流量中的
  相当大一部分实施中间人
  攻击。

如果使用扫描器对最终图像进行检查，是无法发现这些问题的。SBOMit 能捕获这些问题，因为
Witness 会实时监控构建过程。

---

## 什么是 in-toto、Witness 和 attestations？

**[in-toto](https://in-toto.io/)** 是 CNCF 推出的一套用于保障软件供应链安全的框架。它
定义了一项标准，用于记录和验证软件开发过程中的各个步骤，例如谁执行了
每个步骤、操作了哪些文件以及产生了哪些输出结果。 每个步骤都会被记录为一份
关于该步骤执行情况的、经过签名的防篡改声明，并由执行该步骤的一方进行签名。

**[Witness](https://github.com/in-toto/witness)** 是一个 in-toto 实现，它会对
您的构建管道进行插桩，以自动生成这些 attestations。您只需将构建命令包裹在
`Witness run` 中，它就会为该步骤记录一个已签名的 attestation 集合。
Witness 由 TestifySec 创建，并捐赠给了 CNCF in-toto 生态系统。

**attestations** 是核心基本单元。每个都是一个构建步骤的有符号记录，包含：

| attestation | 捕获内容 |
|---|---|
| `material` | 输入文件及其哈希值（输入内容） |
| `command-run` | 执行的命令、打开的文件、启动的进程 |
| `product` | 输出文件及其哈希值（处理结果） |
| `environment` | 操作系统、运行时环境、工具版本 |
| `network-trace` | 该步骤期间的所有出站网络连接 |

由于每个attestation都在步骤运行时进行签名，因此构建历史记录
可通过加密方式进行验证。

有关此主题的更多信息，请参阅in-toto网站上的[in-toto有哪些优势](https://in-toto.io/in-toto/)。

---

## SBOMit 是如何运作的？

`SBOMit` 工具会读取一个 Witness attestation 文件，并：

1. 解析所有 attestation 类型，以全面了解构建过程中发生的情况
2. 运行 **特定语言的包解析器**（Python、Go、Rust、JavaScript/pnpm），将
   观察到的文件路径映射回包名和确切版本
3. 过滤掉临时/缓存构建产物，并对包引用进行去重
4. 生成一个标准的 **SPDX**（2.2/2.3）或 **CycloneDX**（1.4/1.5）SBOM，其中包含
   构建过程中观察到的数据

最终生成的SBOM文件将如实反映实际安装和使用的内容，包括准确的版本信息、原生库以及包管理器无法检测到的文件。有关安装和使用方法，请参阅[入门指南](/getting-started)。

---

## 如果我的供应链中存在不安全的环节怎么办？

attestations 这些并不能替代安全的构建流程，而只是对发生过什么的
记录，并非对所发生过程的安全性的保证。如果您的构建过程从
互联网上下载了一个脚本并执行了它，Witness 将如实记录这一操作。

attestations 为您提供的正是 **可视性和可追溯性**。`network-trace` attestation
将显示该意外的出站连接。`command-run` attestation 将记录
发起该连接的进程。事后无法隐瞒任何信息，因为 attestations 在
构建时已进行签名。

对于希望在此基础上实施相关策略的团队，例如强制要求构建仅从
已批准的注册表中拉取代码、确保特定步骤始终由特定密钥签名，或者确保没有意外
进程运行，[Witness
策略验证](https://github.com/in-toto/witness/blob/main/docs/concepts/policy.md)
以及诸如 [SLSA
](https://slsa.dev/) 之类的框架，可在in-toto

attestations
的基础上构建具有明确立场的安全规则。SBOMit
可与SLSA
的合规性评分结合使用，从而全面
展现软件的组成内容及其构建过程。

---

## 签署SBOM和使用SBOMit有什么区别？

对SBOM进行签名可提供**完整性**，从而保证您确信该文档自
签名以来未被篡改。 内容最初可能就存在错误或不完整，
而您只是信任某一方在某个特定时间点
对该软件所作的声明。如果签名密钥遭到泄露，或者签名者出现失误，那么已签名的 SBOM 文件
便毫无价值。

借助 SBOMit 和 Witness，每个 attestation 都会在 **构建步骤运行时**，由
执行该步骤的进程进行签名。 您无需信任某一方事后提出的声明，而是拥有
来自供应链每个环节的独立加密证据。意外的不准确之处
（例如某个步骤被跳过，某个依赖项被悄然替换）是可以被检测到的，因为它们会破坏
attestation链。而蓄意的篡改则要难得多。
