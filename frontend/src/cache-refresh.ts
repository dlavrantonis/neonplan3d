// The companion app keeps the last page, including its scripts, and a plain reload reads that copy again.
// A different address is a cache miss, so the app asks Home Assistant for the page and the new bundle.

/** The ?v= this bundle was loaded with, or null when it was opened without one. */
export function loadedBundleToken(): string | null {
  try {
    return new URL(import.meta.url).searchParams.get("v");
  } catch {
    return null;
  }
}

/** The running script is an older copy than the one Home Assistant is serving. */
export function bundleIsStale(loaded: string | null, served: string | null | undefined): boolean {
  if (!loaded || !served) return false;
  return loaded !== served;
}

/**
 * Where to send the page so the webview fetches it again. Null when this address already asked for
 * `token` (a second try would loop). `force` is the Reload button: it always picks a new address.
 */
export function refreshTarget(href: string, token: string, force = false): string | null {
  const here = new URL(href);
  if (!force && here.searchParams.get("fp3d_bundle") === token) return null;
  here.searchParams.set("fp3d_bundle", force ? `${token}.${Date.now()}` : token);
  return here.href;
}

let refreshing = false;

/** Drop cached pages and open this one again, so the companion app loads the bundle it is serving now. */
export async function refreshAppCache(token: string, force = false): Promise<void> {
  if (refreshing) return;
  const target = refreshTarget(location.href, token, force);
  if (!target) return;
  refreshing = true;
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if ("caches" in globalThis) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // a webview may hide these; the new address still misses its cache
  }
  location.replace(target);
}
