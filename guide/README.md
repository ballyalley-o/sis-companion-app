# SIS Companion Help Centre

Source-controlled user documentation for staff. This is separate from `documentation/`, which contains engineering specifications and historical plans.

## Build

From the repository root:

```sh
python3 guide/build.py
```

Requires Python 3.9 or newer. No package installation or network access is required. The generated site is `guide/dist/` (ignored by Git). The build checks every internal navigation link and asset reference and verifies one main heading per guide. CSS and JavaScript are shared local assets. Search works entirely within the hosted documentation origin.

## Edit a guide

- Edit a Markdown file in `content/`.
- Update `navigation.json` when adding or reordering guides.
- Supported authoring: headings, paragraphs, flat ordered/unordered lists, bold, inline code, internal links, tables, fenced code, and `flow` fences for process steps.
- Link to guides using `../guide-slug/`.
- Keep role permissions, button labels, state transitions, and integration limits consistent with the source.
- Update the source-reviewed date in the guide content and build template when a review is completed.
- Run the build and JavaScript syntax check before publishing:

```sh
python3 guide/build.py
node --check guide/asset/app.js
```

The build is not a browser test. Check real mobile, keyboard navigation, search, printing, and the hosting access gate before releasing.

## Hosting

Target: `https://doc.siscompanion.com.au` with staff-only access. See `HOSTING.md`. `vercel.json` is ready for a separate project whose root directory is `guide`, build command is `python3 build.py`, and output directory is `dist`.

The site intentionally has no backend or authentication implementation. The hosting identity gate must protect all HTML, search data, fonts, and images. `noindex` and `robots.txt` reduce accidental indexing; they are not access control. Do not publish these files on an unprotected origin.

The app's Help centre entry is enabled by `EXPO_PUBLIC_DOCUMENTATION_URL` only after the host is configured. The website remains independently updateable after a mobile app release.
