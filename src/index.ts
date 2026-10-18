/**
 * dsh-pptx-studio: design-first PowerPoint generation for DeepSeek Harness.
 *
 * Registers the pptx-studio skill and six tools:
 * pptx_style_board, pptx_generate_assets, pptx_build, pptx_check, pptx_render, pptx_review.
 */
import type { Context } from '@deepseek-ai/cordis'
import { allImageBackends, Config, readLive } from './config.ts'
import { fontMeasurer } from './build/metrics.ts'
import { readSkillDescription, registerSkill } from './skill.ts'
import { registerBuildTools } from './tools/build.ts'
import { registerImageTools } from './tools/images.ts'
import { registerRenderTool } from './tools/render.ts'
import { registerReviewTool } from './tools/review.ts'

export { Config }

/** Cordis plugin name. */
export const name = 'pptx-studio'
/** Required host services. credentials and sandboxPolicy are read with ctx.get when present. */
export const inject = ['tools', 'skills', 'workingDirectory']

/**
 * Activate the plugin.
 * @param ctx - plugin context.
 * @param config - validated configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const imageBackend = readLive(config.imageBackend)
  // Settings-page entries are validated when an image is requested, so a typo there
  // reports on the tool call instead of keeping the whole plugin from loading.
  let known = config.imageBackends.map(b => b.name)
  try { known = allImageBackends(config).map(b => b.name) } catch { /* reported by pptx_generate_assets */ }
  if (imageBackend !== '' && !known.includes(imageBackend)) {
    ctx.logger?.warn?.('pptx-studio: imageBackend "%s" is not configured; image tools will report it', imageBackend)
  }
  const description = await readSkillDescription()
  registerSkill(ctx, description)
  const measurer = fontMeasurer(config.measureFont, config.measureFontBold)
  registerBuildTools(ctx, config, measurer)
  registerImageTools(ctx, config)
  registerRenderTool(ctx, config)
  registerReviewTool(ctx, config)
}
