/** Font sizes per text role and density tier; mirrors references/text-density.md. */
import type { TextDensity, TextRole } from '../deck/types.ts'

/** Default size in points for each role at each density. */
export const ROLE_SIZE: Record<TextRole, Record<TextDensity, number>> = {
  display: { light: 54, medium: 48, dense: 44 },
  title: { light: 36, medium: 32, dense: 28 },
  subtitle: { light: 22, medium: 20, dense: 18 },
  heading: { light: 24, medium: 20, dense: 18 },
  body: { light: 24, medium: 18, dense: 15 },
  number: { light: 72, medium: 60, dense: 48 },
  caption: { light: 14, medium: 12, dense: 11 },
}

/** Minimum size in points for each role, independent of density. */
export const ROLE_MIN: Record<TextRole, number> = {
  display: 36, title: 24, subtitle: 16, heading: 16, body: 12, number: 36, caption: 10,
}

/**
 * Line spacing multiple for a role.
 * @param role - text role.
 * @param density - deck density tier.
 */
export function lineSpacing(role: TextRole, density: TextDensity): number {
  if (role === 'display' || role === 'title' || role === 'number') return 1.1
  return density === 'dense' ? 1.25 : 1.3
}
