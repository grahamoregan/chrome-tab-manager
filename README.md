# Chrome Tab Manager

A Chrome extension for people with far too many tabs. This is an example of one of those projects I would
never have prioritised previously but Claude Code make things like this achievable in such a short
amount of time now that I can finally get around to some pet projects :)

It can:

- **Close duplicates** across all windows, keeping the copy you used most recently.
- **Clear stale feeds**: close home-feed tabs (LinkedIn feed, Facebook, BBC News front page, X home…) you haven't looked at for 30+ minutes, never touching posts or articles.
- **Gather tabs by site**: pull every LinkedIn (or any site's) tab into the window that already has the most, optionally in a labelled tab group.
- **Split huge windows**: select a window and split it into windows of up to 80 tabs (or any number you choose), keeping tab order. Pinned tabs stay put, tab groups move whole, and it can be undone.
- **Save tabs into projects**, with list and thumbnail preview views, drag-and-drop between projects, and "save everything & close".
- **Prioritise within a project**: drag links into order (or Move to top / ⌥↑ ⌥↓), click column names to sort by title, site or date (either direction), and press × to archive links as you work through what you've saved.
- **See what's still open**: links in a project that also have an open tab are labelled "Open · Window 2" (click to switch to it), and **Close open tabs** closes them while keeping the links saved.

Everything that closes tabs shows a preview first and can be undone. Data stays in your Chrome profile.

## Install (unpacked)

```sh
git clone https://github.com/grahamoregan/chrome-tab-manager.git
cd chrome-tab-manager
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `dist` folder.

## Picking up code changes

Chrome doesn't notice code changes on its own. There are two ways to load them:

1. **Rebuild and reload (simplest).** Run `npm run build`, then click the ↻ reload icon on the Tab Sort card in
   `chrome://extensions`, then refresh the manager tab.
2. **Live reload while developing.** Run `npm run dev` and leave it running, with the extension loaded from `dist`.
   Changes to the manager appear immediately, and changes to the background script make the extension
   reload itself. When you're done, run `npm run build` again: the dev version only works while the dev server is running.

**Your data survives reloads.** Projects, settings and thumbnails are kept when the extension is reloaded or updated.
**Removing** the extension from Chrome deletes them, so use Settings → Export JSON first if you ever need to remove
and reinstall.

**Debugging:** the Tab Sort card in `chrome://extensions` has an **Errors** button and a **service worker** link, which
opens the console for the background script.

Click the Tab Sort toolbar icon, or press **⌥⇧T** (Alt+Shift+T), to open the manager. Change it at `chrome://extensions/shortcuts`.

## Develop

```sh
npm test          # unit tests for URL, duplicate, site and stale-feed logic and the project model
npm run typecheck
npm run dev       # Vite dev server with hot reload; load `dist` unpacked once
```

See `DESIGN.md` for the design decisions.

## Licence

MIT, see [LICENSE](LICENSE).
