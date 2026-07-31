---
author: "SBOMit Maintainers"
title: "FAQ"
ShowToc: true
TocOpen: false
---

## Why do we need Accurate SBOMs?

When [Log4Shell (CVE-2021-44228)](https://nvd.nist.gov/vuln/detail/CVE-2021-44228) hit in December
2021, the number of exposed systems exploded from 40,000 to 830,000 in under 72 hours. Log4j was
buried as a transitive dependency, and most teams had no way to know whether they were running it and where. Incident response turned into an organization-wide mining project.

{{< figure src="/images/log4shell-growth.png" alt="Log4Shell affected systems grew from 40,000 to 830,000 in 72 hours" caption="Affected systems in the 72 hours following the Log4Shell outbreak." >}}

Log4Shell made the case for SBOMs clearly: if you had a complete, accurate inventory of every
component in your software, you could answer "are we affected?" in minutes. Since then, SBOMs have
been mandated by executive orders, procurement requirements, and industry frameworks. 
The question now is whether the SBOMs being generated are accurate enough to actually use and
for most organizations today, they are not. When the next Log4Shell hits, will your SBOM answer the question and do you trust it?

---

## What can't your package manager/manifest see?

More than you'd expect. We analyzed the top 1,000 Debian-based images on Docker Hub and found that
a significant percentage of files in many images(sometimes 40–100%) cannot be attributed to any
package manager at all.

{{< figure src="/images/dark-matter-dockerhub.png" alt="Distribution of untracked files across top 1,000 Docker Hub images" caption="Distribution of files unaccounted for by the package manager across the top 1,000 Debian-based Docker Hub images." >}}

These are real files, loaded at runtime, potentially vulnerable and invisible to any SBOM tool
that relies on package manager metadata. Our research found exploitable CVEs among them:

- **CVE-2025-32754** (`jenkins/ssh-agent`) — SSH keys are generated at image build time, so every
  container derived from the image shares the same keys. An attacker can connect to a build
  container, read the build secret, and leave without a trace.
- **CVE-2025-32111** (`acme.sh`) — a build secret was leaked during the build process. An attacker
  with this secret could replace a widely-used Let's Encrypt client and perform man-in-the-middle
  attacks on a significant portion of internet traffic.

A scanner running against the final image would not see these. SBOMit captures them because
Witness observes the build as it happens.

---

## What are in-toto, Witness, and attestations?

**[in-toto](https://in-toto.io/)** is a CNCF framework for securing software supply chains. It
defines a standard for recording and verifying the steps that produce software like who performed
each step, what files they operated on, and what the outputs were. Each step is recorded as a
signed tamper-evident statement about what happened, signed by the party that performed it.

**[Witness](https://github.com/in-toto/witness)** is an in-toto implementation that instruments
your build pipeline to produce these attestations automatically. You wrap your build command with
`witness run` and it records a signed attestation collection for that step.
Witness was created by TestifySec and donated to the CNCF in-toto ecosystem.

**Attestations** are the core primitive. Each one is a signed record of a build step, containing:

| Attestation | Captures |
|---|---|
| `material` | Input files and their hashes (what went in) |
| `command-run` | Commands run, files opened, processes spawned |
| `product` | Output files and their hashes (what came out) |
| `environment` | OS, runtime, tool versions |
| `network-trace` | All outbound network connections during the step |

Because every attestation is signed at the time the step runs, the build history is
cryptographically verifiable.

For more information on this topic, please see [What advantages does in-toto provide](https://in-toto.io/in-toto/) on the in-toto website.

---

## How does SBOMit work?

The `sbomit` tool reads a Witness attestation file and:

1. Parses all attestation types to build a complete picture of what happened during the build
2. Runs **language-specific package resolvers** (Python, Go, Rust, JavaScript/pnpm) to map
   observed file paths back to package names and exact versions
3. Filters out temporary/cache artifacts and deduplicates package references
4. Emits a standard **SPDX** (2.2/2.3) or **CycloneDX** (1.4/1.5) SBOM enriched with
   build-observed data

The result is an SBOM that reflects what was actually installed and used including accurate versions, native libraries, and files invisible to package managers. See the [Getting Started guide](/getting-started) for installation and usage.

---

## What if my supply chain has insecure steps?

Attestations are not a substitute for having secure build processes but are a record of what
happened, not a guarantee that what happened was safe. If your build curls a script from the
internet and executes it, Witness will faithfully attest that this occurred.

What attestations give you is **visibility and accountability**. The `network-trace` attestation
will show that unexpected outbound connection. The `command-run` attestation will record the
process that made it. Nothing can be hidden after the fact, because the attestations are signed at
build time.

For teams that want to enforce policies on top of this like mandating that builds only pull from
approved registries, that certain steps are always signed by specific keys, or that no unexpected
processes ran, [Witness policy verification](https://github.com/in-toto/witness/blob/main/docs/concepts/policy.md)
and frameworks like [SLSA](https://slsa.dev/) build opinionated security rules on top of in-toto
attestations. SBOMit can be used alongside SLSA compliance scoring to give a
complete picture of both what is in the software and how it was produced.

---

## What's the difference between signing an SBOM and using SBOMit?

Signing an SBOM provides **integrity** giving guarantee that you know the document hasn't been tampered with since it
was signed. The content may have been wrong or incomplete to
begin with, and you are trusting a single party's assertion about the software at a single point in
time. If the signing key is compromised, or if the signer made errors, the signed SBOM is
worthless.

With SBOMit and Witness, each attestation is signed **at the time the build step runs**, by the
process performing it. You are not trusting one party's after-the-fact assertion, instead you have
independent, cryptographic evidence from every step of the supply chain. Accidental inaccuracies
(a step that was skipped, a dependency that was quietly swapped) are detectable because they break
the attestation chain. Deliberate tampering is significantly harder to hide.
