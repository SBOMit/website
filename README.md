# SBOMit Website

This repository contains the static site for SBOMit.

The starter uses the following:

- [Hugo](https://gohugo.io/) as a static site generator
- [Hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod) theme
- [Netlify](https://www.netlify.com/) for building, hosting, and DNS management

## Running locally

### Runnign with Hugo

If you already have hugo installed, clone this repository and run the following two commands in its directory:

```shell
# Run the server locally
hugo serve
```

### Running with NPM

If you have npm installed, clone this repository and run the following two commands in its directory:

```shell
# Install npm assets
npm install

# Run the server locally
npm run serve
```

## Running on Netlify

Changes to on the main brach are detected by netlify and will trigger a new deployment. When PRs
are merged into main, your changes will be deployed.

Direct access to netlify is restricted to maintainers.

- [Netlify SBOMit Team Overview](https://app.netlify.com/teams/sbomit/overview)
