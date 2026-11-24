// Non-secret configuration only. Never put credentials here: this file is packaged into the workbook.
window.FINDER_CONFIG = {
  apiVersion: '3.22',
  // Inside Tableau, calls go through tableau.extensions.fetchAsync (host-relative URLs, signed in as the viewing
  // user's own session, so no server URL, site or token is needed). The first prefix that works is used.
  bridgePrefixes: ['', '/api'],
  // Only used when running OUTSIDE Tableau (plain browser): the REST path under the server URL that you type
  // into the Connection window. Leave root empty; it is never hardcoded.
  apiBase: '/api',
  root: '',
  autoConnect: true
};
