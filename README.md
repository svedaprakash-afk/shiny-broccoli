# Kids Activities Switzerland

A minimalist, Swiss red-and-white directory of activities for children across Switzerland.
Static site (no server) in `docs/`, served by GitHub Pages. Data is refreshed by GitHub Actions.

**Filters:** free/paid · physical/mental · easy/medium/hard · distance from your location or a chosen city · language (DE/FR/IT/EN). UI in all four languages.

## How data gets in

| Source | Script | Status (verified on GitHub Actions) |
|---|---|---|
| OpenStreetMap (Overpass, ODbL) | `scripts/sources/osm.mjs` | **Live**: ~1,780 items (playgrounds, zoos, theme parks, minigolf, trampoline parks, children's museums). Overpass is flaky, so queries are split, tiled and retried across mirrors; a query that still fails is skipped and the next weekly run fills the gap |
| opendata.swiss | `scripts/sources/opendata-swiss.mjs` | **Live**: playgrounds for Basel, Bern, Luzern, Biel/Bienne and Zürich (~530) plus Basel kids/youth offers (50). Handles WGS84 and Swiss LV95 coordinates, WFS GeoJSON, zip and multi-layer files. Only datasets allow-listed in `data/opendata-resources.json` are ingested. Winterthur's WFS was unreachable even from GitHub runners |
| MySwitzerland Tourism API | `scripts/sources/myswitzerland.mjs` | **Not active**: needs a free API key in the `MYSWITZERLAND_API_KEY` secret; skipped without it |
| Municipal / library pages | `scripts/sources/municipal.mjs` | **Not active**: no site is allow-listed yet in `data/municipal-sources.json` (each needs a terms-of-use check) |
| Community | website form → GitHub issue → `approved` label | Works, moderated, see below |
| Seed | `data/seed.json` | 16 hand-entered landmarks with approximate coordinates, to verify |

### Adding opendata.swiss datasets
Run the **Discover opendata.swiss datasets** and **Probe sources** workflows: they print candidate datasets, download URLs and column headers to the job log. Add an entry to `data/opendata-resources.json` (see the header of `opendata-swiss.mjs` for options). If an entry yields 0 items, the refresh log prints the file's real property names so the mapping can be fixed.

OSM refreshes never shrink the dataset: if some Overpass queries fail, previously fetched items are kept.

`scripts/build.mjs` merges everything, validates it and removes duplicates (same name within ~150 m) into `docs/data/activities.json`.

### Pictures, credit and copyright
Every picture shown has a visible credit line (photographer, licence, link to the source). A picture is only kept if all of this holds (enforced in `scripts/lib/schema.mjs`, covered by tests):
- the licence is **CC0, CC BY, CC BY-SA or public domain** (non-commercial and no-derivatives licences are rejected, as are Commons files flagged non-free or restricted);
- a credit exists;
- it comes from an allow-listed host (Wikimedia) or is a photo copied into this repo from an approved submission.

Sources: `scripts/sources/commons.mjs` follows OpenStreetMap `wikimedia_commons` / `image` / `wikidata` tags to Wikimedia Commons files, reads their licence and author, and **hot-links** the Commons thumbnail (nothing is copied). A second route looks up Swiss zoos, amusement parks and aquariums on Wikidata and attaches a photo only when the **name and the location (within 500 m)** both match one of our entries. **Current coverage is small: 26 pictures out of ~2,370 activities, almost all zoos.** Playgrounds, pools and most museums have no openly licensed photo to find; community photo submissions are the way to grow this. `node scripts/sources/commons.mjs` logs why files are rejected.
City open-data photos are **not** used: the opendata.swiss terms cover the dataset, but I could not verify they cover the linked photo files, and the files are several MB each.
Open-licence images still have conditions (credit, share-alike for CC BY-SA). This is not legal advice; a maintainer should review before commercial use.

### Community submissions (moderated)
"Add an activity" opens a prefilled GitHub issue (label `submission`). It collects: name, category, **sport type** (for sport), **cost with fee range** (CHF from/to + note), kind, difficulty, **address or coordinates**, website, ages, languages and optional **photos**.
- **Address:** "Find address" uses the swisstopo geocoder (api3.geo.admin.ch, no key). The person confirms the match. An address-only submission is geocoded again by the workflow.
- **Photos:** the submitter ticks that they own the photo (or may share it), names the credit and picks CC BY-SA 4.0 / CC BY 4.0 / CC0, then drags up to 3 JPG/PNG files (max 2 MB) into the issue. The form tells them to avoid identifiable people and children.
- A maintainer reviews and adds the `approved` label. `submissions.yml` then validates everything, copies each photo into `docs/img/community/` after **re-encoding it with ImageMagick (EXIF/GPS metadata stripped, rotated, downsized, non-images rejected)**, and writes the entry to `data/community.json`.
- Issue text and attachments are untrusted data: the issue is parsed as JSON only, only GitHub attachment URLs are ever fetched, and nothing is interpolated into a shell.
- **The moderator is the real safeguard:** check that a photo has no identifiable children before adding `approved`.

## Known limitations (be aware)
- **Difficulty and language are largely unknown** for scraped data. OSM has neither. Playgrounds default to "easy"; other OSM items have difficulty `unknown`. Items with no language listed count as language-independent and match every language filter.
- **Filters on unknown values:** selecting "Easy" hides items whose difficulty is unknown.
- Fee and sport come from OSM `charge` / `sport` tags where present, so most scraped paid items show no price.
- Distance is straight-line (haversine), not travel time.
- Most Swiss event sites forbid scraping. Municipal sources are intentionally opt-in; check each site's terms and robots.txt.

## Setup
1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. Create labels `submission` and `approved`.
3. Optional: add the `MYSWITZERLAND_API_KEY` secret.
4. Run **Refresh data** once (Actions → Run workflow) to pull OSM data.

## Develop
```
node tests/run.mjs         # parser/validation tests (Node 22, no dependencies)
node scripts/build.mjs     # rebuild docs/data/activities.json
python3 -m http.server -d docs
```
