#!/usr/bin/env node
/**
 * Block-level DeepL translator for Hugo content.
 *
 * Usage: npm run translate
 *
 * - Reads English markdown under content/ (see SOURCE_FILES)
 * - Splits body into blocks (blank-line separated; fenced code left intact)
 * - Caches translations by SHA-256 of each source block in scripts/.translate-cache.json
 * - Writes content/<name>.<lang>.md for es, fr, zh, vi
 *
 * Env: DeepL_API_KEY or DEEPL_API_KEY (free keys end in :fx)
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as deepl from "deepl-node";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
dotenv.config({ path: join(ROOT, ".env") });

const API_KEY =
  process.env.DeepL_API_KEY ||
  process.env.DEEPL_API_KEY ||
  process.env.deepl_api_key;

if (!API_KEY) {
  console.error(
    "Missing DeepL API key. Set DeepL_API_KEY (or DEEPL_API_KEY) in .env"
  );
  process.exit(1);
}

/** Hugo lang → DeepL target code */
const LOCALES = {
  es: "es",
  fr: "fr",
  zh: "zh-hans",
  vi: "vi",
};

/** English source files to translate (relative to content/). Skip CHARTER. */
const SOURCE_FILES = [
  "_index.md",
  "faq.md",
  "community.md",
  "getting-started.md",
];

const CACHE_PATH = join(__dirname, ".translate-cache.json");
const CONTENT_DIR = join(ROOT, "content");

/** Bump when translation logic changes so blocks are re-billed once. */
const CACHE_VERSION = "v4-url-mask";

const translator = new deepl.Translator(API_KEY);

/** Opaque token DeepL should leave alone; tolerant restore allows stray spaces. */
const MASK_RE = /⟦\s*(\d+)\s*⟧/g;

function maskToken(id) {
  return `⟦${id}⟧`;
}

/**
 * Technical terms kept in English in all locales (longest match first).
 * Add new entries here; re-run `npm run translate` after edits.
 */
const PROTECTED_TERMS = [
  "in-toto",
  "SBOMit",
  "attestations",
  "attestation",
  "addendums",
  "layouts",
  "layout",
  "OpenSSF",
  "SBOMs",
  "SBOM",
  "SLSA",
  "FRSCA",
  "CycloneDX",
  "Witness",
  "metadata",
  "SPDX",
].sort((a, b) => b.length - a.length);

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function cacheKey(text) {
  return sha256(`${CACHE_VERSION}:${text}`);
}

/**
 * Hide HTML comments from DeepL (XML tag handling breaks on <!-- -->).
 * Restored after translation.
 */
function maskHtmlComments(text) {
  const vault = [];
  const masked = text.replace(/<!--[\s\S]*?-->/g, (match) => {
    const id = vault.length;
    vault.push(match);
    return `\n\n⟦C${id}⟧\n\n`;
  });
  return { text: masked, vault };
}

function unmaskHtmlComments(text, vault) {
  return text.replace(/⟦\s*C(\d+)\s*⟧/g, (_, id) => vault[Number(id)] ?? "");
}

/**
 * Replace markdown link targets and bare URLs with numbered placeholders.
 * Link text is still translated; only the URL is hidden from DeepL.
 */
function maskLinksAndUrls(text) {
  const vault = [];
  let result = "";
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const mdMatch = rest.match(/^\]\(([^)]+)\)/);
    const bareMatch = mdMatch ? null : rest.match(/^https?:\/\/[^\s)\]]+/);
    if (mdMatch) {
      const id = vault.length;
      vault.push(mdMatch[1]);
      result += `](${maskToken(id)})`;
      i += mdMatch[0].length;
    } else if (bareMatch) {
      const id = vault.length;
      vault.push(bareMatch[0]);
      result += maskToken(id);
      i += bareMatch[0].length;
    } else {
      result += text[i];
      i += 1;
    }
  }
  return { text: result, vault };
}

function unmaskLinksAndUrls(text, vault) {
  return text.replace(MASK_RE, (_, id) => {
    const idx = Number(id);
    return vault[idx] ?? maskToken(id);
  });
}

/** Wrap protected terms in <x>…</x> for DeepL ignore_tags. */
function protectTerms(text) {
  let result = "";
  let i = 0;
  while (i < text.length) {
    let matched = null;
    for (const term of PROTECTED_TERMS) {
      if (
        text.slice(i, i + term.length).toLowerCase() === term.toLowerCase()
      ) {
        matched = term;
        break;
      }
    }
    if (matched) {
      result += `<x>${matched}</x>`;
      i += matched.length;
    } else {
      result += text[i];
      i += 1;
    }
  }
  return result;
}

/** Unwrap <x> tags and fix occasional DeepL splits of hyphenated terms. */
function restoreTerms(text) {
  return text.replace(/<\/?x>/gi, "").replace(/\bin\s+toto\b/gi, "in-toto");
}

/** Mask URLs → protect terms → (DeepL) → restore terms → unmask URLs. */
function prepareBlockForTranslation(text) {
  const { text: masked, vault } = maskLinksAndUrls(text);
  return { deeplInput: protectTerms(masked), vault };
}

function finalizeBlockTranslation(text, vault) {
  return unmaskLinksAndUrls(restoreTerms(text), vault);
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

/** Split markdown body into blocks; keep fenced code as single blocks. */
function splitBlocks(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let buf = [];
  let inFence = false;

  const flush = () => {
    const text = buf.join("\n");
    buf = [];
    if (text.trim() === "" && text === "") return;
    // Preserve intentional blank-only blocks? Skip empty.
    if (text.trim() === "") return;
    blocks.push(text);
  };

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (!inFence) {
        if (buf.length) flush();
        inFence = true;
        buf = [line];
      } else {
        buf.push(line);
        inFence = false;
        flush();
      }
      continue;
    }
    if (inFence) {
      buf.push(line);
      continue;
    }
    if (line.trim() === "") {
      if (buf.length) flush();
      continue;
    }
    buf.push(line);
  }
  if (buf.length) flush();
  return blocks;
}

function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { fm: {}, fmRaw: "", body: raw };
  const fmRaw = m[1];
  const body = m[2];
  const fm = {};
  for (const line of fmRaw.split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    fm[kv[1]] = val;
  }
  return { fm, fmRaw, body };
}

function isCodeBlock(block) {
  return /^```/.test(block.trimStart());
}

/** Leave Hugo shortcodes untouched (e.g. figure src paths). */
function isHugoShortcode(block) {
  return /^\{\{[<%]/.test(block.trimStart());
}

/** Comment placeholders must not be sent to DeepL. */
function isCommentPlaceholder(block) {
  return /^⟦C\d+⟧$/.test(block.trim());
}

function slugFromFilename(name) {
  // _index.md → home; faq.md → faq
  const base = basename(name, ".md");
  return base === "_index" ? "home" : base;
}

function buildEnglishFrontMatter(fm, translationKey) {
  const lines = ["---"];
  if (fm.author) {
    lines.push(`author: "${String(fm.author).replace(/"/g, '\\"')}"`);
  }
  if (fm.title !== undefined) {
    lines.push(`title: "${String(fm.title).replace(/"/g, '\\"')}"`);
  }
  lines.push(`translationKey: "${translationKey}"`);
  if (fm.ShowToc !== undefined) {
    lines.push(`ShowToc: ${fm.ShowToc}`);
  }
  if (fm.TocOpen !== undefined) {
    lines.push(`TocOpen: ${fm.TocOpen}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

/** Ensure English source has translationKey so Hugo links all locales. */
function ensureEnglishTranslationKey(relPath) {
  const abs = join(CONTENT_DIR, relPath);
  const raw = readFileSync(abs, "utf8");
  const { fm, body } = parseFrontMatter(raw);
  const translationKey = slugFromFilename(relPath);
  if (fm.translationKey === translationKey) return;
  const header = buildEnglishFrontMatter(fm, translationKey);
  writeFileSync(abs, header + body, "utf8");
  console.log(`  updated content/${relPath} (translationKey: ${translationKey})`);
}

function buildFrontMatter(fm, lang, translationKey) {
  const title = fm.title ?? "";
  const author = fm.author ?? "SBOMit Maintainers";
  const showToc = fm.ShowToc;
  const lines = [
    "---",
    `author: "${author}"`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `translationKey: "${translationKey}"`,
  ];
  if (showToc !== undefined) {
    lines.push(`ShowToc: ${showToc}`);
  }
  if (fm.TocOpen !== undefined) {
    lines.push(`TocOpen: ${fm.TocOpen}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

async function translateTexts(texts, targetLang) {
  if (texts.length === 0) return [];
  const prepared = texts.map(prepareBlockForTranslation);
  const result = await translator.translateText(
    prepared.map((p) => p.deeplInput),
    "en",
    targetLang,
    {
      tagHandling: "xml",
      ignoreTags: ["x"],
      preserveFormatting: true,
    }
  );
  const arr = Array.isArray(result) ? result : [result];
  return arr.map((r, i) =>
    finalizeBlockTranslation(r.text, prepared[i].vault)
  );
}

async function translateFile(relPath, cache, stats) {
  const abs = join(CONTENT_DIR, relPath);
  if (!existsSync(abs)) {
    console.warn(`Skip missing: ${relPath}`);
    return;
  }
  ensureEnglishTranslationKey(relPath);
  const raw = readFileSync(abs, "utf8");
  const { fm, body: bodyRaw } = parseFrontMatter(raw);
  const { text: body, vault: commentVault } = maskHtmlComments(bodyRaw);
  const translationKey = slugFromFilename(relPath);
  const blocks = splitBlocks(body);

  // Title is a separately cached string
  const titleEn = fm.title || "";

  for (const [hugoLang, deeplLang] of Object.entries(LOCALES)) {
    const outBlocks = [];
    const toTranslate = []; // { index in outBlocks placeholder | 'title', text, hash }
    const jobs = [];

    // Title
    if (titleEn) {
      const hash = cacheKey(`title:${titleEn}`);
      const cached = cache[hash]?.[hugoLang];
      if (cached) {
        stats.hits++;
        jobs.push({ kind: "title", text: cached, hash });
      } else {
        stats.misses++;
        jobs.push({ kind: "title", text: null, hash, source: titleEn });
        toTranslate.push({ jobIdx: jobs.length - 1, source: titleEn });
      }
    } else {
      jobs.push({ kind: "title", text: titleEn, hash: null });
    }

    for (const block of blocks) {
      if (
        isCodeBlock(block) ||
        isHugoShortcode(block) ||
        isCommentPlaceholder(block)
      ) {
        outBlocks.push(block);
        jobs.push({ kind: "block", text: block, hash: null, skip: true });
        continue;
      }
      const hash = cacheKey(block);
      const cached = cache[hash]?.[hugoLang];
      if (cached) {
        stats.hits++;
        outBlocks.push(cached);
        jobs.push({ kind: "block", text: cached, hash, skip: true });
      } else {
        stats.misses++;
        const placeholderIdx = outBlocks.length;
        outBlocks.push(null);
        jobs.push({
          kind: "block",
          text: null,
          hash,
          source: block,
          outIdx: placeholderIdx,
        });
        toTranslate.push({
          jobIdx: jobs.length - 1,
          source: block,
          outIdx: placeholderIdx,
        });
      }
    }

    if (toTranslate.length) {
      const sources = toTranslate.map((t) => t.source);
      console.log(
        `  DeepL ${hugoLang}: ${sources.length} block(s) for ${relPath}`
      );
      const translated = await translateTexts(sources, deeplLang);
      for (let i = 0; i < toTranslate.length; i++) {
        const t = toTranslate[i];
        const text = translated[i];
        const job = jobs[t.jobIdx];
        job.text = text;
        if (!cache[job.hash]) cache[job.hash] = {};
        cache[job.hash][hugoLang] = text;
        if (job.kind === "block" && t.outIdx !== undefined) {
          outBlocks[t.outIdx] = text;
        }
      }
    }

    const titleTranslated =
      jobs.find((j) => j.kind === "title")?.text ?? titleEn;
    const fmOut = {
      ...fm,
      title: titleTranslated,
    };
    // Rebuild outBlocks from jobs that aren't skip-filled... we already filled outBlocks
    const bodyOut =
      unmaskHtmlComments(outBlocks.join("\n\n") + "\n", commentVault);
    const header = buildFrontMatter(fmOut, hugoLang, translationKey);
    const outName =
      relPath === "_index.md"
        ? `_index.${hugoLang}.md`
        : `${basename(relPath, ".md")}.${hugoLang}.md`;
    const outPath = join(CONTENT_DIR, outName);
    writeFileSync(outPath, header + bodyOut, "utf8");
    console.log(`  wrote content/${outName}`);
  }
}

async function main() {
  console.log("SBOMit translate — block-level DeepL cache\n");
  const cache = loadCache();
  const stats = { hits: 0, misses: 0 };

  for (const file of SOURCE_FILES) {
    console.log(`Source: content/${file}`);
    await translateFile(file, cache, stats);
  }

  saveCache(cache);
  console.log(
    `\nDone. cache hits=${stats.hits} misses=${stats.misses} → ${CACHE_PATH}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
