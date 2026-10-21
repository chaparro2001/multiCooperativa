/** Segments that are followed by an id and whose parent is the module list, not the segment itself. */
const ID_PREFIXES = new Set(['invoice', 'delivery-note']);

/**
 * Logical parent of a route, used by the header back button when there is no history to go back to
 * (page reload or deep link on web). `null` at the root.
 */
export function parentRoute(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const drop = segments.length >= 2 && ID_PREFIXES.has(segments[segments.length - 2]!) ? 2 : 1;
  const parent = segments.slice(0, -drop);
  if (parent.length === 0) return '/';
  const path = `/${parent.join('/')}`;
  // Invoices and delivery notes each have their own list: the detail goes back to its own.
  if (drop === 2 && path === '/invoices') {
    return `${path}?kind=${segments[segments.length - 2] === 'invoice' ? 'invoice' : 'delivery_note'}`;
  }
  return path;
}
