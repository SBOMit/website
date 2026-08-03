---
author: "SBOMit Maintainers"
title: "Primeros pasos"
translationKey: "getting-started"
ShowToc: true
TocOpen: true
---
Esta guía explica paso a paso cómo configurar [Witness](https://github.com/in-toto/witness) para instrumentar
tu compilación y, a continuación, cómo utilizar SBOMit para generar un SBOM enriquecido a partir del attestation resultante.

---

## Requisitos previos

- [Go](https://go.dev/doc/install) 1.19 o posterior
- [openssl](https://www.openssl.org/)
- [jq](https://jqlang.github.io/jq/)
- [base64](https://www.gnu.org/software/coreutils/manual/html_node/base64-invocation.html) (parte de GNU coreutils)

---

## Parte 1: Witness

Witness envuelve tu proceso de compilación y registra los archivos «attestations» firmados, un registro de auditoría criptográfica.

### 1. Instalar «Witness»

```bash
bash <(curl -s https://raw.githubusercontent.com/in-toto/witness/main/install-witness.sh)
```

O bien, descarga un archivo binario desde la [página de versiones de Witness](https://github.com/in-toto/witness/releases).

### 2. Crear un par de claves de firma

Witness firma cada archivo «attestation» con una clave privada. Para realizar una prueba rápida en el equipo local:

```bash
openssl genpkey -algorithm ed25519 -outform PEM -out testkey.pem
openssl pkey -in testkey.pem -pubout > testpub.pem
```

&gt; **Consejo:** Witness también admite la firma sin clave a través de [SPIRE/SPIFFE](https://spiffe.io/) y
&gt; [Sigstore Fulcio](https://github.com/sigstore/fulcio) para entornos de CI/CD.

### 3. Configurar Witness

Crea un archivo `.Witness.yaml` en la raíz de tu proyecto. Este archivo suele incluirse en el commit junto con tu
clave pública:

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

Los parámetros de la línea de comandos tienen prioridad sobre los valores del archivo de configuración. Ejecuta «Witness help» para ver todas las opciones.

### 4. Compila tu proyecto

Añade al principio de tu comando de compilación «Witness run» para generar un archivo «attestation»:

```bash
witness run --step build -o attestation.json -- <your-build-command>
```

**Proyecto Go:**

```bash
witness run --step build -o attestation.json -- go build -o myapp .
```

**Proyecto de Python:**

```bash
witness run --step build -o attestation.json -- pip install -r requirements.txt
```

Witness siempre ejecuta un conjunto básico de
verificadores; consulta `Witness attestors list` para ver la lista completa.

&gt; **Consejo:** Para compilaciones que generan muchos archivos (por ejemplo, `node_modules`), utiliza
&gt; `--dirhash-glob node_modules/*` para calcular el hash del contenido del directorio en lugar de hacerlo con cada archivo por separado.

### 5. Revisa el attestation

El archivo «attestation» es un [sobre DSSE](https://github.com/secure-systems-lab/dsse) firmado.
Para ver la carga útil:

```bash
cat attestation.json | jq -r .payload | base64 -d | jq
```

Verás una colección «attestation» que contiene «attestations» con los siguientes tipos: `material`, `command-run`,
`product`, `environment` y, opcionalmente, `network-trace`. Estos son los datos que utiliza SBOMit.

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

## Parte 2: SBOMit

A partir de un archivo «attestation», SBOMit genera un «SBOM» enriquecido mediante la ejecución de
resolventes de paquetes específicos de cada lenguaje sobre los datos de compilación Witness observados.

### 1. Instalar «SBOMit»

```bash
go install github.com/sbomit/sbomit@latest
```

### 2. Generar un archivo «SBOM» enriquecido

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

### 3. (Opcional) --catalog para capturar el árbol de dependencias

SBOMit Se puede utilizar Syft como fuente de catálogo adicional, fusionando sus resultados con los datos derivados de attestation:

```bash
sbomit generate attestation.json --catalog syft --project-dir /path/to/project
```

SBOMitgenera (por el momento) una **lista plana** de dependencias; sabe qué se ha instalado y utilizado, pero no reconstruye el árbol completo de dependencias. 
Syft, en el caso de ecosistemas en los que puede resolver la
estructura en árbol (por ejemplo, módulos de Go o npm), conserva esa relación padre-hijo en su salida.

Al especificar `--catalog syft`, SBOMit utiliza el árbol de dependencias de Syft como base y
luego lo complementa con todo aquello que Syft no puede detectar: las versiones reales instaladas en el momento de la compilación,
las bibliotecas nativas, los archivos que no gestiona ningún gestor de paquetes y el origen de las llamadas de red capturado
por Witness.
