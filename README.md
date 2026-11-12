# Tab Sort

A Chrome extension for people with far too many tabs. It can:

- **Close duplicates** across all windows, keeping the copy you used most recently.
- **Gather tabs by site**: pull every LinkedIn (or any site's) tab into the window that already has the most, optionally in a labelled tab group.
- **Clear stale feeds**: close home-feed tabs (LinkedIn feed, Facebook, BBC News front page, X home…) you haven't looked at for 30+ minutes, never touching posts or articles.
- **Save tabs into projects**, with list and thumbnail preview views, drag-and-drop between projects, and "save everything & close".

Everything that closes tabs shows a preview first and can be undone. Data stays in your Chrome profile.

## Install (unpacked)

```sh
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `dist` folder.
After pulling changes, run `npm run build` again and press the reload icon on the extension card.

Shortcut: **⌥⇧T** (Alt+Shift+T) opens the manager. Change it at `chrome://extensions/shortcuts`.

## Develop

```sh
npm test          # unit tests for URL, duplicate, site and stale-feed logic and the project model
npm run typecheck
npm run dev       # Vite dev server with hot reload; load `dist` unpacked once
```

See `DESIGN.md` for the design decisions.

## Licence

MIT
