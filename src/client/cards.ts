/**
 * Chat cards for the pptx_* tools, registered into the Web client's keyed
 * `tool.call.toolview` slot. Each card reads only the recorded tool result
 * (its presentationMeta), so a reopened Session shows the same card. Images
 * (contact sheets, thumbnails, generated assets) are read through the
 * Session-authorized workspace-files Remote and shown as blob URLs.
 */
import * as React from 'react'
import { ImageLightbox, StateDot, Tag, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import { cardModel, healthTone, imageMime, type BuildCard, type CardFinding, type CardModel, type CheckCard, type GalleryCard, type ReviewCard } from './card-model.ts'

const h = React.createElement

/** Reads one image file of a Session into a blob URL. */
export type ImageLoader = (sessionId: string, path: string, signal: AbortSignal) => Promise<string>

/** Translate a card copy key. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** Card CSS, injected once while the plugin is active. */
export const CARD_CSS = `
.pptxs-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin:4px 0;display:flex;flex-direction:column;gap:10px;max-width:760px}
.pptxs-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.pptxs-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.pptxs-meta{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.pptxs-spacer{flex:1}
.pptxs-sheet{display:block;width:100%;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);cursor:zoom-in;background:var(--dsw-alias-bg-layer-2)}
.pptxs-sheet-ph{width:100%;aspect-ratio:16/9;border-radius:8px;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
.pptxs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.pptxs-cell{display:flex;flex-direction:column;gap:4px;min-width:0}
.pptxs-thumb{width:100%;aspect-ratio:16/9;object-fit:contain;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);cursor:zoom-in}
.pptxs-cap{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pptxs-actions{display:flex;gap:8px;flex-wrap:wrap}
.pptxs-btn{font:inherit;font-size:12px;padding:4px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer}
.pptxs-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.pptxs-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.pptxs-item{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.pptxs-item b{color:var(--dsw-alias-label-primary);font-weight:600}
.pptxs-fix{color:var(--dsw-alias-label-tertiary)}
.pptxs-page{display:flex;flex-direction:column;gap:4px;padding:8px 0;border-top:1px solid var(--dsw-alias-border-l1)}
.pptxs-page:first-child{border-top:0;padding-top:0}
.pptxs-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.pptxs-error{font-size:12px;color:var(--dsw-alias-label-error);white-space:pre-wrap}
`

/** Props the keyed toolview slot passes (the subset these cards read). */
interface ToolViewProps {
  phase: 'preparing' | 'start' | 'result'
  toolName: string
  sessionId?: string
  block: { meta?: unknown; isError?: boolean; content?: readonly { type: string; text?: string }[]; error?: { code?: string } }
  openFile: (path: string) => void
  inspect?: (() => void) | undefined
  useDisclosure: () => { expanded: boolean; toggle: () => void }
}

/** Copy key of each tool's card title. */
const TITLE_KEY: Record<string, string> = {
  pptx_build: 'buildTitle', pptx_check: 'checkTitle', pptx_review: 'reviewTitle',
  pptx_generate_assets: 'assetsTitle', pptx_style_board: 'boardTitle', pptx_render: 'renderTitle',
}

function resultText(block: ToolViewProps['block']): string {
  return (block.content ?? []).map(part => part.type === 'text' && typeof part.text === 'string' ? part.text : '').join('\n').trim()
}

/**
 * Build the toolview component for all pptx_* tools.
 * @param load - Session image loader.
 * @param t - card copy translator.
 * @returns the slot component.
 */
export function createCard(load: ImageLoader, t: Translate): (props: ToolViewProps) => unknown {
  /** One lazily loaded image. */
  function Picture(props: { sessionId: string | undefined; path: string; alt: string; className: string; placeholder?: string; onOpen?: (url: string) => void }): unknown {
    const [url, setUrl] = React.useState<string | null>(null)
    const [failed, setFailed] = React.useState(false)
    React.useEffect(() => {
      if (props.sessionId === undefined || imageMime(props.path) === undefined) { setFailed(true); return undefined }
      const abort = new AbortController()
      let alive = true
      setFailed(false)
      load(props.sessionId, props.path, abort.signal).then(
        (value) => { if (alive) setUrl(value) },
        () => { if (alive) setFailed(true) },
      )
      return () => { alive = false; abort.abort() }
    }, [props.sessionId, props.path])
    if (url === null) {
      return props.placeholder === undefined
        ? h('div', { className: props.className, title: props.path, 'aria-label': props.alt })
        : h('div', { className: props.placeholder }, failed ? t('imageFailed') : t('imageLoading'))
    }
    return h('img', { className: props.className, src: url, alt: props.alt, title: props.path, onClick: () => props.onOpen?.(url) })
  }

  function Findings(props: { findings: CardFinding[] }): unknown {
    if (props.findings.length === 0) return h('div', { className: 'pptxs-meta' }, t('noFindings'))
    return h('ul', { className: 'pptxs-list' }, props.findings.map((f, i) =>
      h('li', { key: i, className: 'pptxs-item' },
        h(Tag, { tone: f.severity === 'error' ? 'danger' : 'warning' }, f.severity === 'error' ? t('error') : t('warning')),
        ' ', h('b', null, f.slide), ' · ', f.check, ' — ', f.message)))
  }

  function Health(props: { errors: number; warnings: number }): unknown {
    return h(React.Fragment, null,
      h(Tag, { tone: healthTone(props.errors, props.warnings) }, t('health', { errors: props.errors, warnings: props.warnings })))
  }

  function BuildView(props: { model: BuildCard; view: ToolViewProps; zoom: (url: string) => void }): unknown {
    const { model, view } = props
    const disclosure = view.useDisclosure()
    return h('div', { className: 'pptxs-card', 'data-pptx-card': 'build' },
      h('div', { className: 'pptxs-head' },
        h('span', { className: 'pptxs-title', title: model.path }, t('buildTitle') + ' · ' + model.fileName),
        h('span', { className: 'pptxs-meta' }, t('slidesSize', { slides: model.slides, size: model.size })),
        h('span', { className: 'pptxs-spacer' }),
        h(Health, { errors: model.errors, warnings: model.warnings })),
      model.sheet === null ? null : h(Picture, { sessionId: view.sessionId, path: model.sheet, alt: t('sheetAlt'), className: 'pptxs-sheet', placeholder: 'pptxs-sheet-ph', onOpen: props.zoom }),
      disclosure.expanded && model.thumbnails.length > 0
        ? h('div', { className: 'pptxs-grid' }, model.thumbnails.map((path, i) =>
          h('div', { key: path, className: 'pptxs-cell' },
            h(Picture, { sessionId: view.sessionId, path, alt: 'P' + (i + 1), className: 'pptxs-thumb', onOpen: props.zoom }),
            h('span', { className: 'pptxs-cap' }, 'P' + (i + 1)))))
        : null,
      disclosure.expanded ? h(Findings, { findings: model.findings }) : null,
      h('div', { className: 'pptxs-actions' },
        h('button', { type: 'button', className: 'pptxs-btn', onClick: () => view.openFile(model.path) }, t('openPreview')),
        h('button', { type: 'button', className: 'pptxs-btn', onClick: disclosure.toggle }, disclosure.expanded ? t('collapse') : t('expand')),
        view.inspect === undefined ? null : h('button', { type: 'button', className: 'pptxs-btn', onClick: view.inspect }, t('inspect'))))
  }

  function CheckView(props: { model: CheckCard; view: ToolViewProps }): unknown {
    const disclosure = props.view.useDisclosure()
    return h('div', { className: 'pptxs-card', 'data-pptx-card': 'check' },
      h('div', { className: 'pptxs-head' },
        h('span', { className: 'pptxs-title' }, t('checkTitle')),
        h('span', { className: 'pptxs-spacer' }),
        h(Health, { errors: props.model.errors, warnings: props.model.warnings })),
      props.model.findings.length === 0 ? null : (disclosure.expanded ? h(Findings, { findings: props.model.findings }) : null),
      props.model.findings.length === 0 ? h('div', { className: 'pptxs-meta' }, t('noFindings'))
        : h('div', { className: 'pptxs-actions' }, h('button', { type: 'button', className: 'pptxs-btn', onClick: disclosure.toggle }, disclosure.expanded ? t('collapse') : t('expand'))))
  }

  function ReviewView(props: { model: ReviewCard; view: ToolViewProps; zoom: (url: string) => void }): unknown {
    const { model, view } = props
    const disclosure = view.useDisclosure()
    return h('div', { className: 'pptxs-card', 'data-pptx-card': 'review' },
      h('div', { className: 'pptxs-head' },
        h('span', { className: 'pptxs-title' }, t('reviewTitle')),
        h('span', { className: 'pptxs-meta' }, model.model),
        h('span', { className: 'pptxs-spacer' }),
        h(Tag, { tone: healthTone(model.summary.errors, model.summary.warnings) }, t('reviewSummary', model.summary))),
      h('div', null, model.pages.map((page, index) => {
        const issues = disclosure.expanded ? page.issues : page.issues.slice(0, 1)
        return h('div', { key: page.page, className: 'pptxs-page' },
          h('div', { className: 'pptxs-row' },
            h(Tag, { tone: page.verdict === 'pass' ? 'success' : page.verdict === 'fail' ? 'danger' : 'warning' }, 'P' + page.page + ' · ' + t('verdict.' + page.verdict) + (page.score === null ? '' : ' ' + page.score)),
            disclosure.expanded && model.files[index] !== undefined
              ? h(Picture, { sessionId: view.sessionId, path: model.files[index]!, alt: 'P' + page.page, className: 'pptxs-thumb', onOpen: props.zoom })
              : null),
          issues.length === 0 ? null : h('ul', { className: 'pptxs-list' }, issues.map((issue, i) =>
            h('li', { key: i, className: 'pptxs-item' }, h('b', null, issue.area), ' — ', issue.issue,
              issue.fix === '' ? null : h('div', { className: 'pptxs-fix' }, t('fix') + issue.fix)))))
      })),
      h('div', { className: 'pptxs-actions' },
        h('button', { type: 'button', className: 'pptxs-btn', onClick: disclosure.toggle }, disclosure.expanded ? t('collapse') : t('expandAll'))))
  }

  function GalleryView(props: { model: GalleryCard; view: ToolViewProps; zoom: (url: string) => void }): unknown {
    const { model, view } = props
    const titleKey = model.kind === 'pptx-assets' ? 'assetsTitle' : model.kind === 'pptx-style-board' ? 'boardTitle' : 'renderTitle'
    return h('div', { className: 'pptxs-card', 'data-pptx-card': model.kind },
      h('div', { className: 'pptxs-head' },
        h('span', { className: 'pptxs-title' }, t(titleKey)),
        h('span', { className: 'pptxs-meta' }, t('imageCount', { count: model.images.length }) + (model.note === null ? '' : ' · ' + model.note)),
        h('span', { className: 'pptxs-spacer' }),
        model.failed.length > 0 ? h(Tag, { tone: 'danger' }, t('failedCount', { count: model.failed.length })) : null),
      model.job === null ? null : h('div', { className: 'pptxs-row' }, h(StateDot, { state: 'ongoing' }), t('jobRunning', { id: model.job.id })),
      model.images.length === 0 ? null : h('div', { className: 'pptxs-grid' }, model.images.map(image =>
        h('div', { key: image.path, className: 'pptxs-cell' },
          h(Picture, { sessionId: view.sessionId, path: image.path, alt: image.label, className: 'pptxs-thumb', onOpen: props.zoom }),
          h('span', { className: 'pptxs-cap', title: image.path }, image.label)))),
      model.failed.length === 0 ? null : h('ul', { className: 'pptxs-list' }, model.failed.map(f =>
        h('li', { key: f.id, className: 'pptxs-item' }, h('b', null, f.id), f.error === null ? '' : ' — ' + f.error))))
  }

  function Pending(props: { view: ToolViewProps }): unknown {
    return h('div', { className: 'pptxs-card', 'data-pptx-card': 'pending' },
      h('div', { className: 'pptxs-head' },
        h(StateDot, { state: 'ongoing' }),
        h(TextShimmer, { active: true }, h('span', { className: 'pptxs-title' }, t(TITLE_KEY[props.view.toolName] ?? 'buildTitle') + ' · ' + t('running')))))
  }

  function Failed(props: { view: ToolViewProps; text: string }): unknown {
    return h('div', { className: 'pptxs-card', 'data-pptx-card': 'failed' },
      h('div', { className: 'pptxs-head' },
        h(StateDot, { state: 'error' }),
        h('span', { className: 'pptxs-title' }, t(TITLE_KEY[props.view.toolName] ?? 'buildTitle') + ' · ' + t('failed'))),
      props.text === '' ? null : h('div', { className: 'pptxs-error' }, props.text.slice(0, 800)),
      props.view.inspect === undefined ? null : h('div', { className: 'pptxs-actions' }, h('button', { type: 'button', className: 'pptxs-btn', onClick: props.view.inspect }, t('inspect'))))
  }

  return function PptxToolCard(view: ToolViewProps): unknown {
    const [zoomed, setZoomed] = React.useState<string | null>(null)
    const zoom = (url: string): void => { setZoomed(url) }
    if (view.phase !== 'result') return h(Pending, { view })
    if (view.block.isError === true) return h(Failed, { view, text: resultText(view.block) })
    const model: CardModel | undefined = cardModel(view.toolName, view.block.meta)
    if (model === undefined) return h(Failed, { view, text: resultText(view.block) })
    const body = model.kind === 'pptx-build' ? h(BuildView, { model, view, zoom })
      : model.kind === 'pptx-check' ? h(CheckView, { model, view })
        : model.kind === 'pptx-review' ? h(ReviewView, { model, view, zoom })
          : h(GalleryView, { model, view, zoom })
    return h(React.Fragment, null, body,
      zoomed === null ? null : h(ImageLightbox, { src: zoomed, alt: t('sheetAlt'), labels: { dialog: t('dialog'), close: t('close') }, onClose: () => { setZoomed(null) } }))
  }
}
