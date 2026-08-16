# Mendoza Family Registry

A small static website that turns a GEDCOM family-tree export from Ancestry.com
into a browsable "civil registry" style site: an interactive generational tree
plus a profile page for every person.

No build step, no framework — plain HTML/CSS/JS, ready for GitHub Pages.

## Structure

```
index.html          Page shell
css/style.css        All styling
js/app.js            Hash-router + tree/index/profile rendering
data/data.json        All individuals & families (parsed from GEDCOM)
data/tree.json         Pre-computed generation/x layout for the tree view
source/               The original .ged export and the two Python scripts
                       used to regenerate data.json / tree.json
```

## Regenerating the data (if the tree changes)

If you export an updated tree from Ancestry (Tree Settings → Export Tree),
drop the new `.ged` file into `source/`, update the filename at the top of
`source/parse_gedcom.py` if it changed, then run:

```bash
cd source
python3 parse_gedcom.py      # source/data.json (Ancestry .ged -> structured JSON)
python3 compute_layout.py    # source/tree.json (adds generation/x layout)
cp data.json tree.json ../data/
```

## Running locally

Because the app fetches `data/*.json`, you need to serve the folder over
HTTP (opening `index.html` directly as a `file://` URL will fail due to
browser CORS rules for `fetch`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Publishing on GitHub Pages

1. Push this repo to GitHub (already set up at
   `https://github.com/wallacemendoza/fam_tree`).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`.
4. Save — GitHub will publish at `https://wallacemendoza.github.io/fam_tree/`.

## A privacy note

This tree includes exact birth dates and birthplaces for living relatives,
including young children. Once this repo is public, that information is
public too — searchable and scrapeable by anyone. Before you publish,
it's worth deciding whether to:

- Keep the repo private (GitHub Pages can still serve from a private repo
  on plans that support it — check your account's current Pages settings),
- Or trim exact dates/places for living people in `data/data.json` (e.g.
  keep birth year only, drop place) before pushing.

Nothing in the current build makes that call for you — it just displays
whatever is in `data.json`.
