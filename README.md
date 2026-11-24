> **⚠️ This Data App is for demo/inspiration purposes only. Use at your own risk!**

![TableauOS screenshot](docs/screenshot.png)

# TableauOS

A Tableau data app that presents a Tableau site's projects, workbooks and data sources as a small desktop
(file browser, taskbar, windows, themes) with an Admin Center. **For Tableau site administrators only.**

## How it works
- Runs inside Tableau as a viz extension and calls the REST API through `tableau.extensions.fetchAsync`, i.e. with
  the signed-in user's own session. No server URL, site name, or token is configured anywhere in the code; the
  site and user are read from `GET /sessions/current`.
- Non-admin users see a non-dismissable "administrators only" modal.
- Outside Tableau (plain browser) you can connect with a Personal Access Token. Server URL, site and token are typed
  into the Connection window and stored only in your browser. Never commit credentials.

## Build and publish
    ./build.sh            # produces build/TableauOS.twbx
Publish the `.twbx` to your site (Tableau Cloud/Server) from Desktop or via the REST API / Tableau MCP, and allow the
extension on the site if required.

## Layout
- `Tableau Finder.twb` - workbook shell
- `Packages/com.tableau.mcp.tableau-finder/` - extension (`content/src/*.js|css`, `config.js`, `manifest.json`)
