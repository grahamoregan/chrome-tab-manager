# Overview
This is a chrome extension that can be used to organise and sort chrome tabs to make it easier to 
keep on top of having a lot of tabs open. It can also save all tabs so the whole application can be
closed without losing links.

It helps with organising research so tabs can be put into projects. 

The extension can work across windows for a given profile but each profile has its own list of projects.

# Use Case

## Project management
When the extension is opened it can show a split screen which has projects on the left. There is the
ability to add a new project or select multiple projects to delete them.

A project can have many links and a link could appear in multiple projects.

The right hand pane has the list of links and can show them in list or preview mode with the title
and thumbnail are stored. In preview mode to you can see all of the projects that the link is included
in.

Links can be selected and a right click option allows the user to duplicate the tab. Dragging a link
to a new project moves that instance. 
[README.md](README.md)
## Deduplicate
When the extension is opened it should the number of windows open and the number of links  per 
window. There should be an option to close duplicates from the very front of the extension. This should 
find all instances of a link and only keep the most recently active or opened version.

## Sorting
It should be possible to pull all links for a given site into one window. For example, i use linkedin
a lot and i'd like to be able to pull all linkedin links into the window that already has the most
linkedin links open. 

## Clearing stale feeds
There are some sites that dynamically reload the home feed, including linkedin
itself. In that case, I want to have the option to clear all of the home page links in one go. Facebook,
Instagram and X.com do the same thing so an tab that has been open for more than 30 mins will likely 
not be valueable. Add the abilty to do this where I have a list of site home pages and deep links.

