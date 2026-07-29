---
author: "SBOMit Maintainers"
title: "FAQ"
translationKey: "faq"
ShowToc: true
TocOpen: false
---
## Pourquoi avons-nous besoin d'SBOMss précises ?

Lorsque la faille [Log4Shell (CVE-2021-44228)](https://nvd.nist.gov/vuln/detail/CVE-2021-44228) a été découverte en décembre
2021, le nombre de systèmes exposés est passé de 40 000 à 830 000 en moins de 72 heures. Log4j était
enfoui en tant que dépendance transitive, et la plupart des équipes n’avaient aucun moyen de savoir si elles l’utilisaient ni où. La gestion des incidents s’est transformée en un véritable projet d’exploration à l’échelle de l’organisation.

{{< figure src="/images/log4shell-growth.png" alt="Log4Shell affected systems grew from 40,000 to 830,000 in 72 hours" caption="Affected systems in the 72 hours following the Log4Shell outbreak." >}}

Log4Shell a clairement démontré l’intérêt de l’SBOMs : si vous disposiez d’un inventaire complet et précis de chaque
composant de vos logiciels, vous pourriez déterminer en quelques minutes si vous êtes concernés. Depuis lors, l’SBOMs a
été rendue obligatoire par des décrets, des exigences en matière d’achats et des cadres réglementaires sectoriels. 
La question est désormais de savoir si les SBOMss générées sont suffisamment précises pour être réellement exploitables et,
pour la plupart des organisations aujourd’hui, ce n’est pas le cas. Lorsque la prochaine faille de type Log4Shell se présentera, votre SBOM vous permettra-t-elle de répondre à cette question et lui faites-vous confiance ?

---

## Qu'est-ce que votre gestionnaire de paquets ou votre manifeste ne peut pas détecter ?

Plus que vous ne le pensez. Nous avons analysé les 1 000 images basées sur Debian les plus populaires sur Docker Hub et avons constaté qu’
une part importante des fichiers contenus dans de nombreuses images (parfois entre 40 et 100 %) ne peut être attribuée à aucun
gestionnaire de paquets.

{{< figure src="/images/dark-matter-dockerhub.png" alt="Distribution of untracked files across top 1,000 Docker Hub images" caption="Distribution of files unaccounted for by the package manager across the top 1,000 Debian-based Docker Hub images." >}}

Il s'agit de fichiers réels, chargés lors de l'exécution, potentiellement vulnérables et invisibles pour tout outil d'SBOM
qui s'appuie sur l'metadata du gestionnaire de paquets. Nos recherches ont permis de découvrir parmi eux des CVE exploitables :

- **CVE-2025-32754** (`jenkins/ssh-agent`) — Les clés SSH sont générées lors de la création de l'image ; par conséquent, chaque
  conteneur dérivé de cette image partage les mêmes clés. Un attaquant peut se connecter à un
  conteneur de compilation, lire le secret de compilation, puis s'éclipser sans laisser de traces.
- **CVE-2025-32111** (`acme.sh`) — un secret de compilation a été divulgué au cours du processus de compilation. Un attaquant
  disposant de ce secret pourrait remplacer un client Let's Encrypt largement utilisé et mener des attaques de type « man-in-the-middle »
  sur une part importante du trafic Internet.

Un scanner analysant l'image finale ne les détecterait pas. SBOMit les capture car
Witness surveille la compilation en temps réel.

---

## Que sont in-toto, Witness et attestations ?

**[in-toto](https://in-toto.io/)** est un framework de la CNCF destiné à sécuriser les chaînes d’approvisionnement logicielles. Il
définit une norme permettant d’enregistrer et de vérifier les étapes de développement d’un logiciel, notamment qui a effectué
chaque étape, sur quels fichiers il a opéré et quels ont été les résultats obtenus. Chaque étape est enregistrée sous la forme d’une
déclaration signée et inviolable décrivant ce qui s’est passé, signée par la partie qui l’a effectuée.

**[Witness](https://github.com/in-toto/witness)** est une implémentation d’in-toto qui s’intègre à
votre pipeline de build pour générer automatiquement ces attestations. Il suffit d’encapsuler votre commande de build avec
`Witness run` pour qu’elle enregistre une collection signée d’attestations pour cette étape.
Witness a été créé par TestifySec et offert à l’écosystème in-toto de la CNCF.

Les **« attestations »** constituent la primitive de base. Chacune d'entre elles correspond à un enregistrement signé d'une étape de compilation, contenant :

| attestation | Captures |
|---|---|
| `material` | Fichiers d'entrée et leurs hachages (données d'entrée) |
| `command-run` | Commandes exécutées, fichiers ouverts, processus lancés |
| `product` | Fichiers de sortie et leurs hachages (ce qui est sorti) |
| `environment` | Système d’exploitation, environnement d’exécution, versions des outils |
| `network-trace` | Toutes les connexions réseau sortantes pendant l’étape |

Comme chaque attestation est signée au moment de l'exécution de l'étape, l'historique de la compilation est
vérifiable par des moyens cryptographiques.

Pour plus d'informations à ce sujet, veuillez consulter la rubrique [Quels sont les avantages d'in-toto ?](https://in-toto.io/in-toto/) sur le site in-toto.

---

## Comment fonctionne « SBOMit » ?

L'outil « SBOMit » lit un fichier Witness attestation et :

1. Analyse tous les types de fichiers « attestation » afin d’obtenir une vue d’ensemble complète de ce qui s’est passé pendant la compilation
2. Exécute des **résolveurs de paquets spécifiques à chaque langage** (Python, Go, Rust, JavaScript/pnpm) pour associer
   les chemins d’accès aux fichiers observés aux noms de paquets et à leurs versions exactes
3. Filtre les artefacts temporaires ou de cache et déduplique les références aux paquets
4. Génère un fichier **SPDX** (2.2/2.3) ou **CycloneDX** (1.4/1.5) standard SBOM enrichi des
   données observées lors de la compilation

Le résultat est un fichier « SBOM » qui reflète ce qui a réellement été installé et utilisé, y compris les versions exactes, les bibliothèques natives et les fichiers invisibles pour les gestionnaires de paquets. Consultez le [guide de démarrage](/getting-started) pour connaître les modalités d'installation et d'utilisation.

---

## Que se passe-t-il si ma chaîne d'approvisionnement comporte des maillons non sécurisés ?

attestations ne remplacent pas la mise en place de processus de compilation sécurisés, mais constituent un enregistrement de ce qui
s'est passé, et non une garantie que ce qui s'est passé était sûr. Si votre processus de compilation récupère un script depuis
Internet et l'exécute, la commande « Witness » attestera fidèlement que cela s'est produit.

Les «attestations» vous apportent **visibilité et traçabilité**. L’attestation `network-trace`
affichera cette connexion sortante inattendue. L’attestation `command-run` enregistrera le
processus à l’origine de celle-ci. Rien ne peut être dissimulé a posteriori, car les attestations sont signés au
moment de la compilation.

Pour les équipes qui souhaitent appliquer des politiques supplémentaires, comme exiger que les builds proviennent exclusivement de
registres approuvés, que certaines étapes soient toujours signées par des clés spécifiques, ou qu’aucun processus inattendu
ne soit exécuté, [Witness
la vérification des politiques](https://github.com/in-toto/witness/blob/main/docs/concepts/policy.md)
et des frameworks tels que [SLSA
](https://slsa.dev/) établissent des règles de sécurité strictes en complément dein-toto

attestations
.SBOMit
peut être utilisé conjointement avec l’évaluation de conformité deSLSA
pour offrir une
vue d’ensemble complète à la fois du contenu du logiciel et de la manière dont il a été produit.

---

## Quelle est la différence entre signer un « SBOM » et utiliser « SBOMit » ?

La signature d'un fichier SBOM assure l'**intégrité**, ce qui garantit que le document n'a pas été altéré depuis sa
signature. Le contenu pouvait être erroné ou incomplet dès
le départ, et vous vous fiez à l’affirmation d’une seule partie concernant le logiciel à un moment précis
. Si la clé de signature est compromise, ou si le signataire a commis des erreurs, l’SBOMe signé n’a
aucune valeur.

Avec SBOMit et Witness, chaque fichier attestation est signé **au moment où l'étape de compilation s'exécute**, par le
processus qui l'effectue. Vous ne vous fiez pas à l’affirmation a posteriori d’une seule partie, mais disposez au contraire de
preuves cryptographiques indépendantes à chaque étape de la chaîne logistique. Les inexactitudes accidentelles
(une étape omise, une dépendance discrètement remplacée) sont détectables car elles brisent
la chaîne d’attestation. Les altérations délibérées sont nettement plus difficiles à dissimuler.
