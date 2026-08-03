---
author: "SBOMit Maintainers"
title: "Pour commencer"
translationKey: "getting-started"
ShowToc: true
TocOpen: true
---
Ce guide vous explique comment configurer [Witness](https://github.com/in-toto/witness) pour instrumenter
votre build, puis comment utiliser SBOMit pour générer un fichier SBOM enrichi à partir du fichier attestation obtenu.

---

## Conditions préalables

- [Go](https://go.dev/doc/install) version 1.19 ou ultérieure
- [openssl](https://www.openssl.org/)
- [jq](https://jqlang.github.io/jq/)
- [base64](https://www.gnu.org/software/coreutils/manual/html_node/base64-invocation.html) (faisant partie de GNU coreutils)

---

## Partie 1 : Witness

Witness encapsule votre processus de compilation et enregistre l'attestations signée, qui constitue une piste d'audit cryptographique.

### 1. Installer « Witness »

```bash
bash <(curl -s https://raw.githubusercontent.com/in-toto/witness/main/install-witness.sh)
```

Ou téléchargez un fichier binaire depuis la [page des versions de Witness](https://github.com/in-toto/witness/releases).

### 2. Créer une paire de clés de signature

Witness signe chaque fichier « attestation » à l'aide d'une clé privée. Pour effectuer un test rapide en local :

```bash
openssl genpkey -algorithm ed25519 -outform PEM -out testkey.pem
openssl pkey -in testkey.pem -pubout > testpub.pem
```

&gt; **Astuce :** Witness prend également en charge la signature sans clé via [SPIRE/SPIFFE](https://spiffe.io/) et
&gt; [Sigstore Fulcio](https://github.com/sigstore/fulcio) pour les environnements CI/CD.

### 3. Configurer Witness

Créez un fichier `.Witness.yaml` à la racine de votre projet. Ce fichier est généralement ajouté au contrôle de version en même temps que votre
clé publique :

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

Les options de ligne de commande ont priorité sur les valeurs du fichier de configuration. Exécutez « Witness help » pour afficher toutes les options.

### 4. Enveloppez votre montage

Ajoutez « Witness run » au début de votre commande de compilation pour générer un fichier « attestation » :

```bash
witness run --step build -o attestation.json -- <your-build-command>
```

**Projet Go :**

```bash
witness run --step build -o attestation.json -- go build -o myapp .
```

**Projet Python :**

```bash
witness run --step build -o attestation.json -- pip install -r requirements.txt
```

Witness exécute toujours un ensemble de base d’
attestateurs — voir `Witness attestors list` pour la liste complète.

&gt; **Astuce :** Pour les compilations qui génèrent de nombreux fichiers (par exemple, `node_modules`), utilisez
&gt; `--dirhash-glob node_modules/*` afin de calculer le hachage du contenu du répertoire plutôt que celui de chaque fichier individuellement.

### 5. Vérifier l'attestation

Le fichier « attestation » est une [enveloppe DSSE](https://github.com/secure-systems-lab/dsse) signée.
Pour afficher le contenu :

```bash
cat attestation.json | jq -r .payload | base64 -d | jq
```

Vous verrez une collection « attestation » contenant des attestations de type : `material`, `command-run`,
`product`, `environment` et, éventuellement, `network-trace`. Il s'agit des données utilisées par l'SBOMit.

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

## Partie 2 : SBOMit

À partir d'un fichier « attestation », SBOMit génère un fichier « SBOM » enrichi en exécutant des
résolveurs de paquets spécifiques à chaque langage sur les données de compilation Witness observées.

### 1. Installer « SBOMit »

```bash
go install github.com/sbomit/sbomit@latest
```

### 2. Générer une «SBOM » enrichie

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

### 3. (Facultatif) --catalog pour générer l'arborescence des dépendances

SBOMit peut faire appel à Syft comme source de catalogue supplémentaire, en fusionnant ses résultats avec les données issues d'attestation
:

```bash
sbomit generate attestation.json --catalog syft --project-dir /path/to/project
```

SBOMitgénère (pour l'instant) une **liste plate** de dépendances : il sait ce qui a été installé et utilisé, mais ne reconstitue pas l'arborescence complète des dépendances. 
Syft, pour les écosystèmes où il peut déterminer la
structure arborescente (par exemple, les modules Go ou npm), conserve cette relation parent-enfant dans sa sortie.

En passant l'option `--catalog syft`, SBOMit utilise l'arborescence des dépendances de Syft comme base, puis
la complète avec tout ce que Syft ne peut pas détecter : les versions réelles installées au moment de la compilation,
les bibliothèques natives, les fichiers non gérés par un gestionnaire de paquets, ainsi que la provenance des appels réseau capturée
par Witness.
