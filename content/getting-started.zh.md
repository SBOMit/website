---
author: "SBOMit Maintainers"
title: "入门指南"
translationKey: "getting-started"
ShowToc: true
TocOpen: true
---
本指南将逐步介绍如何配置 [Witness](https://github.com/in-toto/witness) 来对
您的构建进行监控，然后使用 SBOMit 从生成的 attestation 文件中生成一个增强版的 SBOM 文件。

---

## 先决条件

- [Go](https://go.dev/doc/install) 1.19 或更高版本
- [openssl](https://www.openssl.org/)
- [jq](https://jqlang.github.io/jq/)
- [base64](https://www.gnu.org/software/coreutils/manual/html_node/base64-invocation.html)（属于 GNU coreutils 的一部分）

---

## 第一部分：Witness

Witness 封装您的构建流程，并记录已签名的attestations，即加密审计日志。

### 1. 安装Witness

```bash
bash <(curl -s https://raw.githubusercontent.com/in-toto/witness/main/install-witness.sh)
```

或者从 [Witness 发布页面](https://github.com/in-toto/witness/releases) 下载二进制文件。

### 2. 创建签名密钥对

Witness 使用私钥对每个attestation进行签名。若要进行快速本地测试：

```bash
openssl genpkey -algorithm ed25519 -outform PEM -out testkey.pem
openssl pkey -in testkey.pem -pubout > testpub.pem
```

&gt; **提示：** Witness 还支持通过 [SPIRE/SPIFFE](https://spiffe.io/) 和
&gt; [Sigstore Fulcio](https://github.com/sigstore/fulcio) 进行无密钥签名，适用于 CI/CD 环境。

### 3. 配置Witness

在项目根目录下创建一个名为 `.Witness.yaml` 的文件。该文件通常会与您的
公钥一起提交：

```yaml
# .witness.yaml
run:
    signer-file-key-path: testkey.pem
    trace: false
verify:
    attestations:
        - "attestation.json"
    policy: policy-signed.json
    publickey: testpub.pem
```

命令行参数会覆盖配置文件中的值。运行 `Witness help` 可查看所有选项。

### 4. 打包您的构建

在构建命令前加上 `Witness run`，即可生成一个 attestation 文件：

```bash
witness run --step build -o attestation.json -- <your-build-command>
```

**Go 项目：**

```bash
witness run --step build -o attestation.json -- go build -o myapp .
```

**Python 项目：**

```bash
witness run --step build -o attestation.json -- pip install -r requirements.txt
```

Witness 始终运行一组基础
验证器——完整列表请参见 `Witness attestors list`。

&gt; **提示：** 对于会生成大量文件的构建（例如 `node_modules`），请使用
&gt; `--dirhash-glob node_modules/*` 来对目录内容进行哈希计算，而不是对每个单独的文件进行哈希计算。

### 5. 检查attestation

attestation文件是一个已签名的[DSSE信封](https://github.com/secure-systems-lab/dsse)。
要查看有效载荷：

```bash
cat attestation.json | jq -r .payload | base64 -d | jq
```

您将看到一个名为attestation的集合，其中包含类型化的attestations：`material`、`command-run`、
`product`、`environment`，以及可选的`network-trace`。这是SBOMit所使用的数据。

<!-- ### 6. (Optional) Verify with a policy

Witness can enforce that a build followed a required policy before a binary is accepted. See the
[Witness policy documentation](https://github.com/in-toto/witness/blob/main/docs/concepts/policy.md)
for full details. The short version:

**Create a policy file:**

```json
{
  "expires": "2026-12-31T00:00:00-05:00",
  "steps": {
    "build": {
      "name": "build",
      "attestations": [
        { "type": "https://witness.dev/attestations/material/v0.1", "regopolicies": [] },
        { "type": "https://witness.dev/attestations/command-run/v0.1", "regopolicies": [] },
        { "type": "https://witness.dev/attestations/product/v0.1", "regopolicies": [] }
      ],
      "functionaries": [{ "publickeyid": "{{PUBLIC_KEY_ID}}" }]
    }
  },
  "publickeys": {
    "{{PUBLIC_KEY_ID}}": {
      "keyid": "{{PUBLIC_KEY_ID}}",
      "key": "{{B64_PUBLIC_KEY}}"
    }
  }
}
```

**Substitute the key values:**

```bash
id=$(sha256sum testpub.pem | awk '{print $1}') && sed -i "s/{{PUBLIC_KEY_ID}}/$id/g" policy.json
pubb64=$(cat testpub.pem | base64 -w 0) && sed -i "s/{{B64_PUBLIC_KEY}}/$pubb64/g" policy.json
```

**Sign the policy:**

```bash
witness sign -f policy.json --signer-file-key-path testkey.pem --outfile policy-signed.json
```

**Verify the artifact meets the policy:**

```bash
witness verify -f myapp -a attestation.json -p policy-signed.json -k testpub.pem
```

A zero exit status means the artifact satisfies the policy. Non-zero exit prints the reason for
failure. -->

---

## 第2部分：SBOMit

基于attestation文件，SBOMit 通过在观察到的构建数据 Witness 上运行特定语言的
包解析器，生成一个增强版的 SBOM。

### 1. 安装SBOMit

```bash
go install github.com/sbomit/sbomit@latest
```

### 2. 生成一个经过增强的SBOM

```bash
# SPDX 2.3 (default)
sbomit generate attestation.json

# SPDX 2.2
sbomit generate attestation.json -f spdx22

# CycloneDX 1.5
sbomit generate attestation.json -f cdx15

# CycloneDX 1.4
sbomit generate attestation.json -f cdx14
```

### 3. （可选）使用 --catalog 选项捕获依赖关系树

SBOMit 可以将 Syft 作为额外的目录来源调用，并将它的输出与attestation生成的
数据合并：

```bash
sbomit generate attestation.json --catalog syft --project-dir /path/to/project
```

SBOMit（目前）会生成一个 **扁平列表** 来列出依赖项，它知道哪些组件已被安装和使用，但不会重建完整的依赖树。
对于能够解析
树结构的生态系统（例如 Go 模块、npm），Syft 会在其输出中保留这种父子关系。

通过传递 `--catalog syft` 参数，SBOMit 会以 Syft 的依赖树为基础，
并补充 Syft 无法检测到的所有内容：构建时实际安装的版本、
原生库、未被任何包管理器追踪的文件，以及由 Witness 捕获的
网络调用来源信息。
