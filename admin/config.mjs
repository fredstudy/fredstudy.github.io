// Where the admin page talks to (spec 125.2, 125.23). Public values only: the project URL and the anon key are in every
// app build anyway. NEVER a service key here.
// SITE: the real page on https://fredstudy.github.io/admin/. Stays REPLACE_ME in git; filled in by hand right before the
//   upload (Jonathan's yes), together with connect-src in index.html (admin.test.mjs checks that the two agree).
// LOCAL: the shared local stack (`supabase status`), its anon key is the public supabase-demo key. Used on localhost only.
export const SITE = { url: 'https://fxfzehltyribnxzmpnrv.supabase.co', anonKey: 'sb_publishable_7ypytCqnBbRwjlDdVndrhQ_bQVnOcTX' };
export const LOCAL = { url: 'http://127.0.0.1:54321', anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' };

/** The config for the page's host, or null when it is not filled in yet (the page then says it is not connected). */
export function supabaseConfig(hostname) {
  const c = ['localhost', '127.0.0.1'].includes(hostname) ? LOCAL : SITE;
  return c.url === 'REPLACE_ME' || c.anonKey === 'REPLACE_ME' ? null : c;
}
