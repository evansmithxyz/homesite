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
click drops food, and the koi come to eat it; hovering a project's card draws a few koi to its edge. It holds still for
visitors who ask for reduced motion. To add a project, add it to the list in
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
