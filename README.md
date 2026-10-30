# evansmith.xyz

The homepage for evansmith.xyz, and the build that puts each project in its own folder:

| Address | What | Built from |
|---------|------|------------|
| `/` | Homepage linking the projects | `site/` |
| `/diagrammer/` | Sentence Diagrammer | `../grammar` |
| `/cube/` | Cube Timer | `../cube` |

The projects stay in their own repositories. This one builds each with its own npm scripts and copies the result into
its folder, with relative asset paths so it works there.

## Build and preview

Needs `npm install` here and in `../grammar` and `../cube`.

```bash
npm install
npm run build     # dist/, laid out like the site
npm run preview   # http://localhost:4173
```

The homepage is plain HTML in `site/index.html`; edit it and build again. Its animated ASCII background (and the
name that unscrambles on load) is `site/ascii.js`: a koi pond drawn in characters, with koi swimming under lily pads
and the name reflected in the water. The pointer drags a wake through the water and startles the koi it sweeps past; a
click drops food, and the koi come to eat it; hovering a project's card draws a few koi to its edge, resting the
pointer on a koi names its variety, and holding it still over open water brings the nearest koi up to it. Koi breathe
out bubbles, a dragonfly darts about and rests on the pads, and about one visit in 30 a golden koi swims among the
rest. The season, by the visitor's date, blows something onto the water: cherry blossom in spring, willow leaves in
summer, maple leaves in autumn, snow in winter. By their clock, dawn and dusk tint it warmer, and night brings the
moon's reflection, in its phase, and fireflies in spring and summer. Now and then a shower of rain passes. Holidays
bring their own: a jack-o'-lantern on a pad the week up to Halloween, paper lanterns at Obon (13–16 August), a red and
white procession of koi at New Year (1–3 January). To see one that isn't happening, ask for it: `/?season=spring`,
`/?time=night` (or `dawn`, `day`, `dusk`), `/?weather=rain`, `/?holiday=halloween` (or `obon`, `newyear`),
`/?koi=golden`, or several at once. It holds still for visitors who ask for reduced motion.
To add a project, add it to the list in
`scripts/build.mjs`, a card to the homepage, a folder to `scripts/deploy.sh` and a route to `deploy/Caddyfile`.

## Put it on the server

```bash
scripts/deploy.sh root@13.140.235.138
```

Run it from Git Bash. It builds, uploads each folder (unpacked beside the live copy, then swapped in), and installs
`deploy/Caddyfile` once `caddy validate` passes.

- Caddy serves each folder at its address and passes `/api` to the diagrammer's spaCy parse server. The parse server
  is set up and updated by `../grammar/scripts/deploy.sh`, not by this script.
- `../grammar/scripts/deploy.sh` (without `--setup`) still updates the diagrammer on its own: it uploads to
  `/srv/sentence-grapher`, which is now served at `/diagrammer/`.
- Don't run `../grammar/scripts/deploy.sh --setup` against this server: it installs the diagrammer's own Caddyfile,
  which serves the diagrammer at `/` and drops the homepage and the cube timer. If you do, run this script again.
- The diagrammer used to live at `/`. Its old share links (`/#s=…`) land on the homepage, which forwards them to
  `/diagrammer/`.
- The cube timer uses Web Bluetooth, which only works over HTTPS (or on localhost). Caddy handles HTTPS by itself.
