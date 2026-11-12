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

## Picking up code changes

Chrome doesn't notice code changes on its own. There are two ways to load them:

1. **Rebuild and reload (simplest).** Run `npm run build`, then click the ↻ reload icon on the Tab Sort card in
   `chrome://extensions`. Close and reopen the popup, and refresh the manager tab.
2. **Live reload while developing.** Run `npm run dev` and leave it running, with the extension loaded from `dist`.
   Changes to the popup and manager appear immediately, and changes to the background script make the extension
   reload itself. When you're done, run `npm run build` again: the dev version only works while the dev server is running.

**Your data survives reloads.** Projects, settings and thumbnails are kept when the extension is reloaded or updated.
**Removing** the extension from Chrome deletes them, so use Settings → Export JSON first if you ever need to remove
and reinstall.

**Debugging:** the Tab Sort card in `chrome://extensions` has an **Errors** button and a **service worker** link, which
opens the console for the background script.

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
