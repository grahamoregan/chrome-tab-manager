# Tab Sort — Design

The agreed design, kept in step with the code. See `CLAUDE.md` for the original requirements.
**Status** marks what's built; **Planned** sections are agreed but not built yet.

## Surfaces
- **Manager** (full tab, `src/manager/index.html`) is the whole UI. Clicking the toolbar icon or pressing ⌥⇧T opens it, or focuses the existing manager tab rather than creating a second. There is no popup.
- **Chrome right-click menu** on pages and links: "Add to Tab Sort project ▸" listing the 25 most recently changed projects, plus "New project from this…".
- Incognito is ignored.

## Stack
Manifest V3, TypeScript, Vite + `@crxjs/vite-plugin`, React, Vitest for pure logic.
Loaded unpacked for personal use. MIT licence. Permissions: `tabs`, `tabGroups`, `storage`,
`unlimitedStorage`, `contextMenus`, `favicon`, host `<all_urls>` (for `captureVisibleTab`).
Tab-changing actions run in the background service worker (via messages), so they finish even if the manager tab moves or closes.

## Data model
- **Link**: one per normalised URL — `{ id (= normalised URL), url, title, favIconUrl, addedAt }`.
- **Project**: `{ id, name, createdAt, updatedAt, linkIds[], viewMode: 'list'|'preview' }`.
- Many-to-many: a link may appear in several projects. Links no project uses are garbage collected.
- Projects, links, settings, the undo entry and "Recently closed" (last 300) live in `chrome.storage.local`. They survive restarts and extension reloads, and are deleted only if the extension is removed.
- Saved links are independent of tabs: closing a tab never changes a project.
- Thumbnails: small JPEG blobs in IndexedDB keyed by normalised URL. Thumbnails of pages not in any project are pruned after 3 days.
- JSON export/import for backup (thumbnails not included).
- Open tabs are matched to saved links by normalised URL ("open" dot, Open vs Focus).

## Thumbnails
Captured opportunistically when a tab is active and has finished loading (`captureVisibleTab`), downscaled to 400px wide, throttled, and refreshed at most every 30 minutes. Never flips through tabs. Placeholder (favicon) until captured.

## URL normalisation & duplicates
- Strip `#fragment` and tracking params (`utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `trk`, `trkInfo`, `si`, `ref_src`…); keep other query params (sorted); lowercase host; drop trailing slash on non-root paths.
- Duplicates = open tabs with the same normalised URL across all windows. Keep the active tab, else the most recent `lastAccessed`. Never close pinned or audible tabs.

## Gather by site
- Site = registrable domain (eTLD+1, e.g. `uk.linkedin.com` → `linkedin.com`, `bbc.co.uk`).
- Target window = window with most tabs of that site; ties → current window. Pinned tabs never moved.
- Moved tabs put into a tab group named after the site (reuse an existing group with that title). Tabs already in a group you made aren't pulled out of it. Setting to disable grouping.
- Pick one site from a list sorted by count, or "Tidy all".

## Stale feeds
- Rules: `{ host, path, match: 'exact'|'prefix' }`. Host matches subdomains; trailing slash and query ignored; prefix matches on path-segment boundaries.
- Defaults (all exact): `linkedin.com/feed`, `facebook.com/`, `bbc.co.uk/news`, `bbc.com/news`, `instagram.com/`, `x.com/home`, `twitter.com/home`.
- A tab is stale if it matches a rule and `now - lastAccessed >= threshold` (default 30 min, configurable). Pinned, audible and active tabs are skipped. Deep links never match.
- Manual only. Settings has a "test a URL" box.

## Open tabs: All windows and window filters
- The "Open tabs" sidebar section starts with an **All windows** row, then one row per window. The manager opens on **All windows**.
- Clicking a window shows only its tabs. Clicking the selected window again, or clicking **All windows**, goes back to all tabs. ⌘-click (Ctrl-click) adds or removes a window from the selection; ⇧-click selects a range. Deselecting the last window goes back to All windows.
- With more than one window shown (All windows, or several selected), tabs are grouped under a heading per window ("Window 1 · 18 unsorted"); clicking a heading filters to that window.
- Header title: "All windows", "Window 2" or "Windows 1, 3", with "N unsorted of M tabs". "Focus window" and "New project from this window" only appear when exactly one window is selected.
- Badges: All windows shows the total unsorted count; each window its own.
- A selected window that closes drops out of the selection; if none are left, the view returns to All windows.
- The selection isn't remembered between visits.

## Merge windows
- Selecting two or more windows (⌘-click) shows a **Merge 3 windows into Window 2** button in the header, with how many tabs will move. (This replaced per-window checkboxes, so there is one selection model.)
- Target = the selected window with the most tabs (all tabs, sorted or not); ties → the current window, then the lowest window number.
- **All** tabs move, including pinned tabs (re-pinned after moving, since Chrome unpins tabs that change window) and sorted tabs. Tab groups move as whole groups, keeping their name and colour. The emptied windows close automatically.
- Undo moves the tabs back into their original windows and positions (restoring pinned state), recreating any window that closed. Tab groups aren't restored by Undo.
- After merging, the view shows the merged window.

## Safety
- Every action that closes tabs shows a preview first, then offers Undo. Closed tabs are recorded in "Recently closed by Tab Sort" (Settings), where each can be reopened.
- Undo covers the **single most recent** action (closing, moving/merging, project changes); doing something else replaces it. The Undo bar stays visible for 30 minutes.

## Projects
- Selection: click, ⌘-click, ⇧-click, ⌘A, Esc. Drag onto project = move; ⌥ while dropping = copy. Delete/Backspace removes selected links from the project.
- Link context menu: Open/Focus, Open in new window, Copy to project ▸, Move to project ▸, Remove from this project.
- Window tab context menu: Focus, Add to project ▸, New project from selection, Close tab(s).
- **Tab lists show unsorted tabs.** A tab is *sorted* once its normalised URL is in at least one project; sorted tabs drop out of the window list as soon as they're added (by drag or right-click), so the list works as an inbox of what's left to file. The manager's own tab is never listed. Other non-web tabs (chrome://, new tab) can't be saved, so they stay listed as unsorted until closed.
  - Sidebar badges show unsorted counts; the header shows "N unsorted of M tabs".
  - A "Show sorted tabs" toggle in the window header shows every tab (sorted ones get their project chips), e.g. to focus or close them. Off by default.
  - When every tab shown is sorted, the pane says so instead of looking empty.
  - "New project from this window" uses the tabs currently listed (unsorted only, unless the toggle is on).
  - Each tab in a window list has a **×** at the right-hand end of its row (top-right corner of a preview card) that closes that one tab, with Undo and a "Recently closed" entry. It doesn't change the selection or start a drag. Project link lists have no × (removing a link from a project is a different action).
- **Save everything & close**: saves every web tab into one project "Saved session – <date time>" (option: one project per window), merging duplicates, then closes all tabs except the manager and pinned tabs (pinned tabs are still saved). Undo reopens the tabs *and* removes the session project. *Under review — may be replaced by "Archive & close all".*
- Open project: new window, skip already-open links, confirm if > 20, tabs load only when clicked (created then discarded).
- Delete projects (multi-select): never closes tabs; Undo available.
- Flat list sortable by name / recently changed.
- **Right-click menus stay on screen.** The menu is moved left/up if it would go past the window edge. Submenus (Add/Copy/Move to project ▸) open to the right, or to the left when there isn't room, and are shifted up and scroll if the project list is taller than the space below.

## Search
- The top-bar box is just **Search** (⌘F or `/` focuses it, Esc clears it). It searches titles and URLs; every word must match, in any order, ignoring case.
- Results replace the main pane in two sections:
  1. **Open tabs** across all windows, sorted or not (the manager's own tab excluded), showing the window and any project chips. They behave like tabs in a window list: × to close, double-click to focus, drag to a project, right-click for Focus / Add to project / Close.
  2. **Saved links** in projects, as before (Open/Focus, Open in new window, Copy to project). A saved link that's already listed under Open tabs isn't repeated; its project chips show it's saved.
- Open tabs come first because finding a tab is the common case. Either section is hidden when it has no matches.
- List mode: open dot, favicon, title, domain, date added. Preview mode: thumbnail cards with project chips. Mode remembered per project.

## Manager-first quick actions
The popup was removed (v0.2); its features moved into the manager:

| Popup feature | Manager home |
|---|---|
| Close duplicates, Clear stale feeds, Gather by site | Quick-action buttons in the top bar, left of Settings, with live counts: `Duplicates 12` `Stale feeds 9` `Gather 4` |
| Previews before closing | A review view in the main pane ("Review: 12 duplicates"): full list with a checkbox per tab (all ticked to start, untick to keep a tab), Close/Cancel at the top. Duplicates are grouped, showing which copy is kept. |
| Gather list | Review view in the main pane: sites sorted by tab count with a **Gather** button each, **Tidy all** at the top |
| Window/tab stats | Sidebar heading: "Open tabs · 5 windows · 142 tabs" |
| Save to project… | Dropped: drag, right-click → Add to project, and "New project from this window" cover it |
| Save everything & close | A **⋯** menu next to Settings (pending the archive decision) |
| Undo | Stays in the top bar |

- The quick-action counts update live as tabs change (stale-feed counts also re-check every minute). A button with nothing to do is disabled.
- After a review action completes, the main pane returns to what it showed before.
- Trade-off accepted: the popup worked without leaving the current page; the manager is a tab. A toolbar badge with the duplicate count is a possible follow-up.

## Planned: archive & close (details to be agreed)
Close all tabs but save their details under a dated name such as "Unsorted – 2026-11-12", without them having to go into a project.
Proposed answers awaiting confirmation: a separate "Archives" sidebar section whose links can be dragged into projects to file them; archives only unsorted tabs; same-day archives are added to; closes all windows except pinned tabs and the manager; may replace "Save everything & close"; archived tabs still count as unsorted; kept until deleted.

## Build history
1. Scaffold + pure logic with tests. ✅
2. Popup quick actions + preview/Undo. ✅ (popup later removed)
3. Data layer + thumbnails. ✅
4. Manager. ✅
5. Save & close, open project, context menus, settings, export/import. ✅
6. Unsorted window lists, × to close tabs, merge windows. ✅
7. Manager-first (remove popup). ✅
8. Right-click menus stay on screen; search covers open tabs. ✅
9. All windows view, window filters (⌘/⇧-click), merge from selection. ✅
10. Sorting within projects. ⏳ (design proposed)
11. Archive & close. ⏳ (after decisions)
