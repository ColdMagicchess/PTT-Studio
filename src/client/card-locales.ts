/** Copy for the pptx_* chat cards. */
export const CARD_NS = 'pptx-studio.cards'

export const cardZh: Record<string, string> = {
  buildTitle: 'PPT 组装', checkTitle: 'PPT 检查', reviewTitle: '视觉评审', assetsTitle: '生成配图', boardTitle: '风格样张', renderTitle: '渲染页面',
  running: '进行中…', failed: '失败', slidesSize: '{slides} 页 · {size}', health: '{errors} 错误 · {warnings} 警告',
  reviewSummary: '{errors} 错误 · {warnings} 警告 · {passed} 页通过', 'verdict.pass': '通过', 'verdict.warn': '需改进', 'verdict.fail': '不合格',
  openPreview: '打开预览', expand: '展开缩略图与问题', expandAll: '展开全部问题', collapse: '收起', inspect: '查看调用', noFindings: '没有发现问题',
  error: '错误', warning: '警告', fix: '建议：', imageCount: '{count} 张图', failedCount: '{count} 张失败', jobRunning: '后台任务 {id} 运行中，完成后会自动通知',
  sheetAlt: '幻灯片缩略图', imageLoading: '缩略图加载中…', imageFailed: '缩略图不可用', dialog: '图片预览', close: '关闭',
}

export const cardEn: Record<string, string> = {
  buildTitle: 'PPT build', checkTitle: 'PPT check', reviewTitle: 'Vision review', assetsTitle: 'Generated images', boardTitle: 'Style boards', renderTitle: 'Rendered slides',
  running: 'running…', failed: 'failed', slidesSize: '{slides} slides · {size}', health: '{errors} errors · {warnings} warnings',
  reviewSummary: '{errors} errors · {warnings} warnings · {passed} passed', 'verdict.pass': 'pass', 'verdict.warn': 'needs work', 'verdict.fail': 'fail',
  openPreview: 'Open preview', expand: 'Show thumbnails and findings', expandAll: 'Show all findings', collapse: 'Collapse', inspect: 'Inspect', noFindings: 'No problems found',
  error: 'error', warning: 'warning', fix: 'Fix: ', imageCount: '{count} images', failedCount: '{count} failed', jobRunning: 'Background job {id} is running; you will be notified when it finishes',
  sheetAlt: 'Slide thumbnails', imageLoading: 'Loading thumbnail…', imageFailed: 'Thumbnail unavailable', dialog: 'Image preview', close: 'Close',
}
