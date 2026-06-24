/**
 * Returns whether a route is the target itself or a descendant of it.
 * This is useful for broad navigation entries such as the mobile Karyawan tab.
 */
export function pathMatchesHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Selects one active navigation target when routes overlap.
 *
 * For example, /karyawan/gaji matches both /karyawan and /karyawan/gaji.
 * The longest matching href is the most specific current page and therefore
 * the only item that should receive the active treatment in a detailed menu.
 */
export function getMostSpecificActiveHref(pathname: string, hrefs: readonly string[]) {
  return hrefs.reduce<string | undefined>((activeHref, href) => {
    if (!pathMatchesHref(pathname, href)) return activeHref;
    if (!activeHref || href.length > activeHref.length) return href;
    return activeHref;
  }, undefined);
}
