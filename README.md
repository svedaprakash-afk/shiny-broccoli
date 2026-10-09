# Kids Activities Switzerland

A minimalist, Swiss red-and-white directory of activities for children across Switzerland.
Static site (no server) in `docs/`, served by GitHub Pages. Data is refreshed by GitHub Actions.

**Filters:** free/paid · physical/mental · easy/medium/hard · distance from your location or a chosen city · language (DE/FR/IT/EN). UI in all four languages.

## How data gets in

| Source | Script | Status |
|---|---|---|
| OpenStreetMap (Overpass, ODbL) | `scripts/sources/osm.mjs` | Runs weekly in Actions |
| opendata.swiss | `scripts/sources/opendata-swiss.mjs` | Only datasets allow-listed with a column mapping in `data/opendata-resources.json` (currently empty) |
| MySwitzerland Tourism API | `scripts/sources/myswitzerland.mjs` | Needs the `MYSWITZERLAND_API_KEY` secret; skipped without it |
| Municipal / library pages | `scripts/sources/municipal.mjs` | Only schema.org JSON-LD from sites listed in `data/municipal-sources.json` (currently empty) |
| Community | website form → GitHub issue → `approved` label | Moderated, see below |
| Seed | `data/seed.json` | 16 hand-entered landmarks with approximate coordinates, to verify |

`scripts/build.mjs` merges everything, validates it and removes duplicates (same name within ~150 m) into `docs/data/activities.json`.

### Community submissions (moderated)
"Add an activity" opens a prefilled GitHub issue (label `submission`). A maintainer reviews it and adds the `approved` label.
The `submissions.yml` workflow then validates the JSON and adds it to `data/community.json`. Issue text is treated as untrusted data: it is parsed and normalised, never executed or interpolated into shell.

## Known limitations (be aware)
- **Difficulty and language are largely unknown** for scraped data. OSM has neither. Playgrounds default to "easy"; other OSM items have difficulty `unknown`. Items with no language listed count as language-independent and match every language filter.
- **Filters on unknown values:** selecting "Easy" hides items whose difficulty is unknown.
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
