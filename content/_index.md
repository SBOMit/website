---
title: "SBOMit"
---

When [Log4Shell (CVE-2021-44228)](https://nvd.nist.gov/vuln/detail/CVE-2021-44228) hit in December 2021, the number of exposed systems exploded from 40,000 to 830,000 in under 72 hours.
Log4j was buried as a transitive dependency, and most teams couldn't answer a simple question: *are we affected?*

SBOMs were proposed as the solution, a machine-readable inventory of every component in a software artifact, enabling automated vulnerability scanning and rapid impact assessment.
And they are the right answer.

But the current state of SBOM generation falls short of that potential. This isn't a failure of SBOM tools, they work as designed.
The limitation is the **metadata they have access to**. Most SBOMs are generated either from manifest files before the build, or by scanning the artifact after.
In both cases, the tool is working with an incomplete and often inaccurate snapshot of what's actually inside the software. ([Read more in the FAQ →](/faq))

---

## What is SBOMit?

SBOMit addresses this by moving SBOM generation closer to the build.
It integrates with [Witness](https://github.com/in-toto/witness), a supply chain attestation framework built on [in-toto](https://in-toto.io/) to instrument each build step and record cryptographically signed attestations capturing exactly what ran, what files were accessed, what packages were downloaded, and what network calls were made.

SBOMit is not itself a replacement for SBOM tools.
The goal is for existing tools to consume Witness attestations as an input source and use SBOMit's resolvers to produce a more complete, accurate SBOM.
SBOMit provides the attestation processing layer and **the enrichment** that SBOM tools currently lack access to.

**When your SBOM is complete and accurate, it becomes a real security asset** not just a compliance checkbox. You can answer "are we affected?" in minutes. You can verify that nothing unexpected happened during the build. You can treat your SBOM as an integral part of your defense.

---

## SBOMit vs. Current SBOM Generation

A traditional SCA scanner isn't doing anything wrong, it simply doesn't have access to the
right data. SBOMit with Witness gives it that data.

| | Current SBOM Generation | With SBOMit |
|---|---|---|
| **When generated** | Before build (manifests) or after (scanning) | During the build |
| **Package versions** | From lockfile (often stale or wrong) | Exact versions installed at build time |
| **Native / unmanaged files** | Missed | Captured via file-access tracing |
| **False positives** | Common (packages listed but not installed) | Removed (only what was actually used) |
| **False negatives** | Common (transitive deps, `.so` files missed) | Resolved (everything observed is reported) |
| **Cryptographic proof** | None | Signed in-toto attestations at every step |
| **Tamper resistance** | Easily forged post-hoc | Tamper-evident chain of custody |

---

*Ready to try it? See the [Getting Started guide →](/getting-started)*

*For a deeper dive into the research and how attestations work, see the [FAQ →](/faq)*

---

## Project Status

SBOMit is an early-stage but functional open source project under the
[Linux Foundation / OpenSSF](https://openssf.org/) umbrella, governed by a
[Technical Steering Committee](/CHARTER).

- [SBOMit/sbomit](https://github.com/SBOMit/sbomit) — the enrichment tool
- [in-toto/witness](https://github.com/in-toto/witness) — the attestation framework
