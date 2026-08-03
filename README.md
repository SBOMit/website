# SBOMit Website

This repository contains the static site for SBOMit.

The site uses:

- [Hugo](https://gohugo.io/) as a static site generator
- [Hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod) theme
- [Netlify](https://www.netlify.com/) for building, hosting, and DNS management

Live site: [sbomit.dev](https://sbomit.dev/)

## Running locally

### Running with Hugo

If you already have Hugo installed, clone this repository and run:

```shell
hugo serve
```

With the repo’s pinned Hugo (after `npm install`):

```shell
./node_modules/.bin/hugo serve --port 1313 -e dev -DFE
```

Open [http://127.0.0.1:1313/](http://127.0.0.1:1313/).

**Quick check:** use the language control (English / Español / Français / …). Switching from `/es/faq/` to Français should keep you on the FAQ page (`/fr/faq/`).

### Running with npm

```shell
npm install
npm run serve
```

`npm run serve` wraps Hugo via Netlify Dev. For day-to-day work, plain `hugo serve` is enough.

## Translations

After editing English content under `content/`, regenerate locales:

```shell
npm run translate
```

Requires a DeepL API key in `.env` (see `.env.example`). Full workflow (cache, hand-fixes): **[scripts/README.md](scripts/README.md)**.

Netlify does **not** need the DeepL key — translations are committed to the repo and Hugo builds them as static pages.

## Build

```shell
npm run build
```

Production deploys use `npm run build:production` (see `netlify.toml`).

## Running on Netlify

Changes on the `main` branch are detected by Netlify and trigger a new deployment. When PRs are merged into `main`, your changes are deployed.

Direct access to Netlify is restricted to maintainers.

- [Netlify SBOMit Team Overview](https://app.netlify.com/teams/sbomit/overview)
