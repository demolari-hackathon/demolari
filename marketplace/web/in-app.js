// On open inside the ambasada app (the mini app, `miniapp.entry` in ambasada.config.ts; docs/MINI-APPS.md §5,
// decision 16): when the manifest asks for `identity` and nobody is signed in, or someone other than the app's account
// is (an earlier "Sign in with ambasada" in this web view), sign the app's account in before the page shows.
// `ambasada.auth.signInSilently()` gets a shell token and POSTs it to /api/auth/shell, which sets the same session as
// "Sign in with ambasada"; the page then reloads, rendered signed in. Nothing shows meanwhile (at most 5 s; the app's
// splash stays until ready()). When the shell says no, the page shows with its "Sign in with ambasada" button. When
// the whole site is the mini app (entry /), the page is kept clear of the app's bar (clearHostChrome).
// Needs https://hub.ambasada.id/miniapp.js before it; on the web it only fills in the name.
// Under `ambasada dev`, ?ambasada_shell=mock pretends to be inside the app (the mock signs the token).
const RELOADED = "ambasada_signed_in"; // set before that reload, to the app's account: a session that did not stick can't loop

addEventListener("DOMContentLoaded", async () => {
  const a = window.ambasada;
  const mock = new URLSearchParams(location.search).get("ambasada_shell") === "mock";
  const page = document.documentElement.style;
  if (a && (mock || canSignIn(a))) page.visibility = "hidden";
  const me = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({}));
  if (a && mock && me.dev_issuer) {
    const token = await fetch(`${me.dev_issuer}/dev/shell-token?aud=${encodeURIComponent(location.origin)}`).then((r) => r.json());
    a.mockEnv({ ...(token.user ? { user: token.user } : {}), answers: { "auth.getToken": token } }); // the mock's visitor
  }
  // Inside the app, the app's account is the one signed in: a session for someone else is replaced, once per account.
  const inApp = a?.context().user?.id ?? "1";
  if (me.user && (!a?.context().user || me.user.id === inApp)) sessionStorage.removeItem(RELOADED);
  else if (a && sessionStorage.getItem(RELOADED) !== inApp && (await wantsIdentity(a)) && (await signInSilently(a))) {
    sessionStorage.setItem(RELOADED, inApp);
    return location.reload();
  }
  for (const el of document.querySelectorAll("[data-in-app-name]")) if (me.user) el.textContent = `, ${me.user.name ?? "you"}`;
  for (const el of document.querySelectorAll("[data-in-app-signin]")) el.hidden = !!me.user || !me.configured;
  if (a) clearHostChrome(a);
  page.visibility = "";
  a?.ready();
});

/**
 * Inside the ambasada app its bar and the phone's safe areas sit over the page: pad <body> by them (the CSS variables
 * ready() sets). Host chrome only, no fonts, colours or widths. A page that keeps clear itself (ui-page: web/app.html)
 * is left alone; on the web, nothing changes.
 */
function clearHostChrome(a) {
  const inside = a.isInAmbasada ? a.isInAmbasada() : !!window.ambasadaShell || /AmbasadaChat\//.test(navigator.userAgent);
  if (!inside || document.querySelector(".ui-page")) return;
  const body = document.body.style;
  body.paddingTop = "calc(var(--ambasada-host-bar, 0px) + var(--ambasada-safe-area-top, 0px))";
  for (const side of ["bottom", "left", "right"]) body.setProperty(`padding-${side}`, `var(--ambasada-safe-area-${side}, 0px)`);
}

/** Inside the app, with a shell that mints tokens and a person to sign in (older miniapp.js builds: by hand). */
function canSignIn(a) {
  if (a.auth.canSignInSilently) return a.auth.canSignInSilently();
  return a.capabilities().includes("auth.getToken") && !!a.context().user;
}

/** The manifest's `scopes` (`miniapp.scopes` in ambasada.config.ts) include identity; unreadable: try, the shell decides. */
async function wantsIdentity(a) {
  if (!canSignIn(a)) return false;
  const manifest = await fetch("/.well-known/ambasada.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return !Array.isArray(manifest?.scopes) || manifest.scopes.includes("identity");
}

/** The user, or null (the shell said no, the server refused, 5 s gone by). */
async function signInSilently(a) {
  if (a.auth.signInSilently) return a.auth.signInSilently({ me: false });
  const late = new Promise((resolve) => setTimeout(resolve, 5000, null));
  const run = async () => {
    const { token } = await a.auth.getToken();
    const res = await fetch("/api/auth/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    return res.ok ? (await res.json()).user : null;
  };
  return Promise.race([run().catch(() => null), late]);
}
