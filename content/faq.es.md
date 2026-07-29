---
author: "SBOMit Maintainers"
title: "Preguntas frecuentes"
translationKey: "faq"
ShowToc: true
TocOpen: false
---
## ¿Por qué necesitamos un «SBOMs» preciso?

Cuando [Log4Shell (CVE-2021-44228)](https://nvd.nist.gov/vuln/detail/CVE-2021-44228) se dio a conocer en diciembre
de 2021, el número de sistemas expuestos se disparó de 40 000 a 830 000 en menos de 72 horas. Log4j estaba
oculto como una dependencia transitiva, y la mayoría de los equipos no tenían forma de saber si lo estaban ejecutando ni dónde. La respuesta ante el incidente se convirtió en un proyecto de búsqueda a escala de toda la organización.

{{< figure src="/images/log4shell-growth.png" alt="Log4Shell affected systems grew from 40,000 to 830,000 in 72 hours" caption="Affected systems in the 72 hours following the Log4Shell outbreak." >}}

Log4Shell dejó claro el interés por la gestión de la información sobre el software (SBOMs): si se dispusiera de un inventario completo y preciso de todos los
componentes del software, se podría responder a la pregunta «¿nos afecta?» en cuestión de minutos. Desde entonces, la gestión de la información sobre el software (SBOMs) se ha
convertido en una obligación en virtud de decretos ejecutivos, requisitos de contratación pública y marcos normativos del sector. 
La cuestión ahora es si los «SBOMs» que se generan son lo suficientemente precisos como para utilizarlos realmente y,
para la mayoría de las organizaciones actuales, no lo son. Cuando se produzca el próximo Log4Shell, ¿responderá tu «SBOM» a la pregunta y confias en él?

---

## ¿Qué es lo que no puede ver tu gestor de paquetes o tu manifiesto?

Más de lo que cabría esperar. Hemos analizado las 1.000 imágenes más populares basadas en Debian de Docker Hub y hemos descubierto que
un porcentaje significativo de los archivos de muchas imágenes (en algunos casos, entre el 40 % y el 100 %) no puede atribuirse a ningún
gestor de paquetes.

{{< figure src="/images/dark-matter-dockerhub.png" alt="Distribution of untracked files across top 1,000 Docker Hub images" caption="Distribution of files unaccounted for by the package manager across the top 1,000 Debian-based Docker Hub images." >}}

Se trata de archivos reales, cargados en tiempo de ejecución, potencialmente vulnerables e invisibles para cualquier herramienta de SBOM
que utilice el gestor de paquetes metadata. Nuestra investigación ha detectado entre ellos vulnerabilidades CVE explotables:

- **CVE-2025-32754** (`jenkins/ssh-agent`) — Las claves SSH se generan en el momento de la compilación de la imagen, por lo que todos los
  contenedores derivados de dicha imagen comparten las mismas claves. Un atacante puede conectarse a un contenedor de compilación
, leer el secreto de compilación y marcharse sin dejar rastro.
- **CVE-2025-32111** (`acme.sh`) — Se filtró un secreto de compilación durante el proceso de compilación. Un atacante
  que dispusiera de este secreto podría sustituir un cliente de Let's Encrypt de uso generalizado y llevar a cabo ataques de tipo «man-in-the-middle»
  sobre una parte significativa del tráfico de Internet.

Un escáner que se ejecutara sobre la imagen final no las detectaría. SBOMit las captura porque
Witness supervisa la compilación a medida que se lleva a cabo.

---

## ¿Qué son in-toto, Witness y attestations?

**[in-toto](https://in-toto.io/)** es un marco de trabajo de la CNCF destinado a garantizar la seguridad de las cadenas de suministro de software. Define
un estándar para registrar y verificar los pasos que conllevan la creación de software, como quién realizó
cada paso, sobre qué archivos se actuó y cuáles fueron los resultados. Cada paso se registra como una
declaración firmada y a prueba de manipulaciones sobre lo que ocurrió, firmada por la parte que lo llevó a cabo.

**[Witness](https://github.com/in-toto/witness)** es una implementación de in-toto que integra
tu proceso de compilación para generar automáticamente estos attestations. Solo tienes que envolver tu comando de compilación con
`Witness run` y este registrará una colección firmada de attestation para ese paso.
Witness fue creado por TestifySec y donado al ecosistema in-toto de la CNCF.

**Los attestations** son la primitiva básica. Cada uno de ellos es un registro con signo de un paso de compilación, que contiene:

| attestation | Capturas |
|---|---|
| `material` | Archivos de entrada y sus hash (lo que se introdujo) |
| `ejecución-de-comandos` | Comandos ejecutados, archivos abiertos, procesos generados |
| `producto` | Archivos de salida y sus hash (lo que se obtuvo) |
| `entorno` | Sistema operativo, entorno de ejecución, versiones de las herramientas |
| `rastreo-de-red` | Todas las conexiones de red salientes durante el paso |

Dado que cada attestation se firma en el momento en que se ejecuta el paso, el historial de compilación es
verificable criptográficamente.

Para obtener más información sobre este tema, consulta [¿Qué ventajas ofrece in-toto?](https://in-toto.io/in-toto/) en la página web in-toto.

---

## ¿Cómo funciona «SBOMit»?

La herramienta «SBOMit» lee un archivo Witness attestation y:

1. Analiza todos los tipos de «attestation» para obtener una visión completa de lo que ha ocurrido durante la compilación
2. Ejecuta **resolutores de paquetes específicos para cada lenguaje** (Python, Go, Rust, JavaScript/pnpm) para asociar
   las rutas de los archivos observadas con los nombres de los paquetes y sus versiones exactas
3. Filtra los artefactos temporales o de caché y elimina las duplicadas en las referencias a paquetes
4. Genera un **archivo SPDX** estándar (2.2/2.3) o un **archivo CycloneDX** (1.4/1.5) SBOM enriquecido con
   los datos observados durante la compilación

El resultado es un archivo «SBOM» que refleja lo que realmente se ha instalado y utilizado, incluidas las versiones exactas, las bibliotecas nativas y los archivos que no detectan los gestores de paquetes. Consulta la [Guía de introducción](/getting-started) para conocer cómo instalarlo y utilizarlo.

---

## ¿Qué ocurre si mi cadena de suministro presenta eslabones inseguros?

attestations no sustituyen a unos procesos de compilación seguros, sino que constituyen un registro de lo que
ha ocurrido, no una garantía de que lo ocurrido fuera seguro. Si tu compilación descarga un script de
Internet y lo ejecuta, Witness certificará fielmente que esto ha ocurrido.

Lo que te ofrecen attestations es **visibilidad y responsabilidad**. El comando `network-trace` attestation
mostrará esa conexión saliente inesperada. El comando `command-run` attestation registrará el
proceso que la realizó. No se puede ocultar nada a posteriori, ya que los archivos attestations se firman en
el momento de la compilación.

Para los equipos que deseen aplicar políticas adicionales, como exigir que las compilaciones solo obtengan código de
registros aprobados, que determinados pasos estén siempre firmados con claves específicas o que no se ejecuten
procesos inesperados, [Witness
la verificación de políticas](https://github.com/in-toto/witness/blob/main/docs/concepts/policy.md)
y marcos como [SLSA
](https://slsa.dev/) establecen reglas de seguridad bien definidas basadas enin-toto

attestations
.SBOMit
puede utilizarse junto con la puntuación de cumplimiento deSLSA
para ofrecer una
visión completa tanto de lo que contiene el software como de cómo se ha producido.

---

## ¿Cuál es la diferencia entre firmar un «SBOM» y utilizar «SBOMit»?

La firma de un SBOM proporciona **integridad**, lo que garantiza que el documento no ha sido alterado desde que
se firmó. El contenido podría haber sido erróneo o incompleto desde
el principio, y usted está confiando en la afirmación de una sola parte sobre el software en un momento concreto
. Si la clave de firma se ve comprometida, o si el firmante cometió errores, el SBOM firmado
no tiene ningún valor.

Con SBOMit y Witness, cada attestation se firma **en el momento en que se ejecuta el paso de compilación**, por el
proceso que lo lleva a cabo. No se confía en la afirmación a posteriori de una sola parte, sino que se dispone de
pruebas criptográficas independientes de cada paso de la cadena de suministro. Las imprecisiones accidentales
(un paso que se ha omitido, una dependencia que se ha sustituido sin que se haya notado) son detectables porque rompen
la cadena de attestation. La manipulación deliberada es mucho más difícil de ocultar.
