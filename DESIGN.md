# Tab Sort — Design

Agreed design for v1. See `CLAUDE.md` for the original requirements.

## Surfaces
- **Popup** (toolbar icon): window/tab stats, quick actions (close duplicates, gather site, clear stale feeds, save everything & close), "Save to project…", "Open manager".
- **Manager** (full tab, `manager.html`): projects pane on the left, links pane on the right, Settings tab. Opening it focuses an existing manager tab rather than creating a second. Shortcut: ⌥⇧T.
- **Chrome right-click menu** on pages and links: "Add to Tab Sort project ▸".
- Incognito is ignored.

## Stack
Manifest V3, TypeScript, Vite + `@crxjs/vite-plugin`, React, Vitest for pure logic.
Loaded unpacked for personal use. MIT licence. Permissions: `tabs`, `tabGroups`, `storage`,
`unlimitedStorage`, `contextMenus`, `favicon`, host `<all_urls>` (for `captureVisibleTab`).

## Data model
- **Link**: one per normalised URL — `{ id, url, title, favIconUrl, addedAt, hasThumbnail }`.
- **Project**: `{ id, name, createdAt, updatedAt, linkIds[], viewMode: 'list'|'preview' }`.
- Many-to-many: a link may appear in several projects. Links no project uses are garbage collected (with their thumbnails).
- Projects + links in `chrome.storage.local`; thumbnails (small JPEG data URLs) in IndexedDB keyed by normalised URL.
- JSON export/import for backup.
- Open tabs are matched to saved links by normalised URL ("open" dot, Open vs Focus).

## Thumbnails
Captured opportunistically when a tab is active and has finished loading (`captureVisibleTab`), downscaled, throttled. Never flips through tabs. Placeholder (favicon + title) until captured.

## URL normalisation & duplicates
- Strip `#fragment` and tracking params (`utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `trk`, `trkInfo`, `si`, `ref_src`…); keep other query params; lowercase host; drop trailing slash on non-root paths.
- Duplicates = open tabs with the same normalised URL across all windows. Keep the most recent `lastAccessed`. Never close pinned or audible tabs.

## Gather by site
- Site = registrable domain (eTLD+1, e.g. `uk.linkedin.com` → `linkedin.com`, `bbc.co.uk`).
- Target window = window with most tabs of that site; ties → current window. Pinned tabs never moved.
- Moved tabs put into a tab group named after the site (reuse existing group with that title). Setting to disable grouping.
- Primary: pick one site from a list sorted by count. Secondary: "tidy all".

## Stale feeds
- Rules: `{ host, path, match: 'exact'|'prefix' }`. Host matches subdomains; trailing slash and query ignored.
- Defaults (all exact): `linkedin.com/feed`, `facebook.com/`, `bbc.co.uk/news`, `bbc.com/news`, `instagram.com/`, `x.com/home`, `twitter.com/home`.
- A tab is stale if it matches a rule and `now - lastAccessed >= threshold` (default 30 min, configurable). Deep links never match.
- Manual only. Settings has a "test a URL" box.

## Merge windows
- In the manager's "Open tabs" list each window has a checkbox (same pattern as deleting projects). With two or more ticked, a bar appears: "Merge 3 windows (52 tabs) into Window 2" → **Merge**.
- Target = the selected window with the most tabs (all tabs, sorted or not); ties → the current window, then the lowest window number.
- **All** tabs move, including pinned tabs (they stay pinned) and sorted tabs. Tab groups move as whole groups, keeping their name and colour. The emptied windows close automatically.
- Undo moves the tabs back into their original windows, recreating any window that has closed. Tab groups aren't restored by Undo.
- Clicking a window name still opens its tab list; ticking only selects it for merging.

## Archive tabs (planned — details to be agreed)
- Close all tabs but save their details under a dated name such as "Unsorted – 2026-11-12", without them having to go into a project.

## Safety
Every destructive action shows a preview, then offers Undo. Closed tabs are recorded in a "Recently closed by Tab Sort" list (capped) and can be reopened.

## Projects
- Selection: click, ⌘-click, ⇧-click. Drag onto project = move; ⌥ while dropping = copy.
- Link context menu: Copy to project ▸, Move to project ▸, Open/Focus, Open in new window, Remove from this project.
- Left pane: live "Open tabs" (per window) to drag from; "New project from this window".
- **Window lists show unsorted tabs.** A tab is *sorted* once its normalised URL is in at least one project; sorted tabs drop out of the window list as soon as they're added (by drag, right-click or the popup), so the list works as an inbox of what's left to file. The manager's own tab is never listed. Other non-web tabs (chrome://, new tab) can't be saved, so they stay listed as unsorted until closed.
  - Sidebar badge shows the unsorted count per window; the window header shows "N unsorted of M tabs".
  - A "Show sorted tabs" toggle in the window header shows every tab (sorted ones get their project chips), e.g. to focus or close them. Off by default.
  - When every tab in a window is sorted, the pane says so instead of looking empty.
  - "New project from this window" uses the tabs currently listed (unsorted only, unless the toggle is on).
  - The popup's window stats still count all tabs.
  - Each tab in a window list has a **×** at the right-hand end of its row (top-right corner of a preview card) that closes that one tab, with Undo and a "Recently closed" entry like every other close. It doesn't change the selection or start a drag. Project link lists have no × (removing a link from a project is a different action).
- Save everything & close: single project "Saved session – <date time>" (option: one per window), deduped, then closes all tabs except the manager.
- Open project: new window, skip already-open links, confirm if > 20, tabs created discarded (lazy).
- Delete projects (multi-select): never closes tabs; Undo available.
- Flat list sortable by name / recently changed; global search over titles and URLs.
- List mode: favicon, title, domain, date added, open dot. Preview mode: thumbnail cards with project chips. Mode remembered per project.

## Build order
1. Scaffold + pure logic with tests.
2. Popup quick actions + preview/Undo.
3. Data layer + thumbnails.
4. Manager.
5. Save & close, open project, context menus, settings, export/import.
