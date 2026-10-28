# The Drivine website

The site at [drivine.org](https://drivine.org/), built with
[Starlight](https://starlight.astro.build) and published by `.github/workflows/website.yml`.

- `src/pages/index.astro`: the landing page.
- The docs are generated, not written here: `scripts/import-readmes.mjs` turns this repository's `docs/` into the
  TypeScript docs (`/ts/`), drivine-python's into the Python docs (`/py/`) and drivine4j's into the Kotlin & Java docs
  (`/jvm/`). Each library's `docs/` holds its guide a file to each `##` section, after `00-introduction.md`; a library
  with no `docs/` guide yet has its README read instead. Each `##` section is a page, and a long one a group of pages,
  one to each `###`. Change the docs by changing the libraries' `docs/`.

```bash
npm install
npm run dev        # imports the docs, then serves the site at localhost:4321
npm run build      # the same, into dist/
```

`npm run build` fetches drivine-python's and drivine4j's docs from GitHub, listing `docs/` through the contents API
(with `GITHUB_TOKEN`, if set) and fetching each file raw, or their READMEs where they have no `docs/` guide.
`DRIVINE_PYTHON_DOCS=<dir>` and `DRIVINE4J_DOCS=<dir>` read local `docs/` folders instead, and
`DRIVINE_PYTHON_README=<path>` and `DRIVINE4J_README=<path>` local READMEs.
