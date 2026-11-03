# The Drivine website

The site at [drivine.org](https://drivine.org/), built with
[Starlight](https://starlight.astro.build) and published by `.github/workflows/website.yml`.

- `src/pages/index.astro`: the landing page.
- `public/video/`: the landing page's explainer, played from the site itself rather than YouTube's embed (which served
  it at 240p in some browsers). `drivine-explainer.mp4` is re-encoded from the master in the private
  `liberation-data/drivine-explainer-video` repository (`video/final/drivine-graph-rag-master.mp4`): H.264 1080p30 with
  AAC sound, its index at the front (`-movflags +faststart`) so it starts before it has all downloaded, and well under
  GitHub Pages' 100 MB a file. `drivine-explainer.vtt` is that repository's `video/final/captions.srt`, rejoined into
  sentences and split again into captions of two lines of 42 characters at most:
  `node scripts/captions.mjs <captions.srt> public/video/drivine-explainer.vtt`. When the video ends, which it does by
  fading to black, the page shows its end card, `src/assets/video-end.jpg` (the frame at 4:25), with a Watch again
  button. A new cut replaces all three (the end card with
  `ffmpeg -ss <a second before the end> -i <the video> -frames:v 1 -q:v 4 src/assets/video-end.jpg`), and the length
  on the page: `4:26` in the hero's tip and on the play button, and in words in the button's `aria-label` and the line
  under the player.
- `public/og-card.jpg`: the card a shared link to the site shows (the landing page's and every docs page's
  `og:image`), the video's poster `src/assets/video-poster.jpg` cropped to 1200x630. A new poster replaces it too.
- `src/components/Share.astro`: the Share buttons under the video, on its end card, in the footer, and beside each docs
  page's title (`src/components/PageTitle.astro`).
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

The landing page's star counts, and the newest released train under its installs (which also versions the Gradle
line and the hero's drivine4j copy button), are fetched from GitHub's API when the site is built, with `GITHUB_TOKEN`
if set: the train from liberation-data/drivine-release's `trains/<train>.json`, the newest whose `released` is set.
What can't be fetched is left out: the Gradle line keeps `<version>`, and the copy button the bare coordinate.
