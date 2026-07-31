---
author: "SBOMit Maintainers"
title: "Getting Started"
ShowToc: true
TocOpen: true
---

This guide walks through setting up [Witness](https://github.com/in-toto/witness) to instrument
your build, then using SBOMit to generate an enriched SBOM from the resulting attestation.

---

## Prerequisites

- [Go](https://go.dev/doc/install) 1.19 or later
- [openssl](https://www.openssl.org/)
- [jq](https://jqlang.github.io/jq/)
- [base64](https://www.gnu.org/software/coreutils/manual/html_node/base64-invocation.html) (part of GNU coreutils)

---

## Part 1: Witness

Witness wraps your build process and records signed attestations, a cryptographic audit trail.

### 1. Install Witness

```bash
bash <(curl -s https://raw.githubusercontent.com/in-toto/witness/main/install-witness.sh)
```

Or download a binary from the [Witness releases page](https://github.com/in-toto/witness/releases).

### 2. Create a signing keypair

Witness signs each attestation with a private key. For a quick local test:

```bash
openssl genpkey -algorithm ed25519 -outform PEM -out testkey.pem
openssl pkey -in testkey.pem -pubout > testpub.pem
```

> **Tip:** Witness also supports keyless signing via [SPIRE/SPIFFE](https://spiffe.io/) and
> [Sigstore Fulcio](https://github.com/sigstore/fulcio) for CI/CD environments.

### 3. Configure Witness

Create a `.witness.yaml` in your project root. This file is typically committed alongside your
public key:

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

Command-line flags override config file values. Run `witness help` to see all options.

### 4. Wrap your build

Prefix your build command with `witness run` to produce an attestation file:

```bash
witness run --step build -o attestation.json -- <your-build-command>
```

**Go project:**

```bash
witness run --step build -o attestation.json -- go build -o myapp .
```

**Python project:**

```bash
witness run --step build -o attestation.json -- pip install -r requirements.txt
```

Witness always runs a base set of
attestors — see `witness attestors list` for the full list.

> **Tip:** For builds that produce many files (e.g. `node_modules`), use
> `--dirhash-glob node_modules/*` to hash the directory contents rather than every individual file.

### 5. Inspect the attestation

The attestation file is a signed [DSSE envelope](https://github.com/secure-systems-lab/dsse).
To view the payload:

```bash
cat attestation.json | jq -r .payload | base64 -d | jq
```

You will see an attestation collection containing typed attestations: `material`, `command-run`,
`product`, `environment`, and optionally `network-trace`. This is the data SBOMit uses.

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

## Part 2: SBOMit

With an attestation file in hand, SBOMit generates an enriched SBOM by running language-specific
package resolvers over the build data Witness observed.

### 1. Install SBOMit

```bash
go install github.com/sbomit/sbomit@latest
```

### 2. Generate an enriched SBOM

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

### 3. (Optional) --catalog to Capture Dependency Tree

SBOMit can call Syft as an additional catalog source, merging its output with the attestation-derived
data:

```bash
sbomit generate attestation.json --catalog syft --project-dir /path/to/project
```

SBOMit(right now) produces a **flat list** of dependencies, it knows what was installed and used, but does not reconstruct the full dependency tree. 
Syft, for ecosystems where it can resolve the
tree structure (e.g. Go modules, npm), preserves that parent-child relationship in its output.

By passing `--catalog syft`, SBOMit uses Syft's dependency tree as the foundation and
then complements it with everything Syft cannot see: the actual versions installed at build time,
native libraries, files not tracked by any package manager, and network call provenance captured
by Witness.