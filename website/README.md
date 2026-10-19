# The Drivine website

The site at [drivine.org](https://drivine.org/), built with
[Starlight](https://starlight.astro.build) and published by `.github/workflows/website.yml`.

- `src/pages/index.astro`: the landing page.
- The docs are generated, not written here: `scripts/import-readmes.mjs` turns this repository's README into the
  TypeScript docs (`/ts/`) and drivine4j's README into the Kotlin & Java docs (`/jvm/`). Each `##` section is a page,
  and a long one a group of pages, one to each `###`. Change the docs by changing the READMEs.

```bash
npm install
npm run dev        # imports the READMEs, then serves the site at localhost:4321
npm run build      # the same, into dist/
```

`npm run build` fetches drivine4j's README from GitHub; `DRIVINE4J_README=<path>` reads a local copy instead.
