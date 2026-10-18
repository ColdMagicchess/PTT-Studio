/**
 * Ambient types for the browser modules the Host's client loader provides.
 * Only the handful of members this page calls are declared; the bundle never
 * resolves them at build time (they are externals in tsdown.client.config.ts).
 */
declare module 'react' {
  export function createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
  export function useState<T>(initial: T): [T, (next: T) => void]
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void
  export const Fragment: unknown
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  export const SettingsForm: any
  export const SettingsValueField: any
  export const SettingsSecretField: any
  export const ImageLightbox: any
  export const StateDot: any
  export const Tag: any
  export const TextShimmer: any
  export const SettingsFormModel: any
  export function settingsTextField(field: string): any
  export function settingsNumberField(field: string): any
}
