window.__ModuleLoader__.load({ id: "dsh-pptx-studio", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let __deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
__deepseek_ai_dsh_client_ui_primitives = __toESM(__deepseek_ai_dsh_client_ui_primitives);

//#region src/client/card-model.ts
/**
* Pure view models for the pptx_* tool cards. No React here, so the rules are
* unit-tested directly; cards.ts only renders what these functions return.
*/
/** Tool names that get a dedicated card. */
const CARD_TOOLS = [
	"pptx_build",
	"pptx_check",
	"pptx_review",
	"pptx_generate_assets",
	"pptx_style_board",
	"pptx_render"
];
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function str(value) {
	return typeof value === "string" ? value : void 0;
}
function num(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function list(value) {
	return Array.isArray(value) ? value : [];
}
/**
* Human-readable byte size.
* @param bytes - byte count.
* @returns e.g. "650 KB" or "2.9 MB".
*/
function formatBytes(bytes) {
	if (bytes < 1024) return bytes + " B";
	if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
	return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
/**
* Last path segment, for either separator.
* @param path - file path.
* @returns the file name.
*/
function fileName(path) {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1] ?? path;
}
/**
* MIME type for an image path, or undefined when it is not a previewable image.
* @param path - file path.
* @returns image MIME type.
*/
function imageMime(path) {
	const lower = path.toLowerCase();
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".webp")) return "image/webp";
}
function findings(value) {
	return list(value).flatMap((entry) => {
		const item = record(entry);
		const message = str(item?.message);
		if (item === void 0 || message === void 0) return [];
		return [{
			slide: str(item.slide) ?? "*",
			check: str(item.check) ?? "",
			severity: item.severity === "error" ? "error" : "warning",
			message
		}];
	});
}
/**
* Turn a tool result's presentation meta into a card model.
* @param tool - wire tool name.
* @param meta - the recorded presentationMeta value.
* @returns the card model, or undefined when the meta is absent or from an older plugin version.
*/
function cardModel(tool, meta) {
	const m = record(meta);
	if (m === void 0) return void 0;
	switch (tool) {
		case "pptx_build": {
			const path = str(m.path);
			if (path === void 0) return void 0;
			return {
				kind: "pptx-build",
				path,
				fileName: fileName(path),
				slides: num(m.slides),
				size: formatBytes(num(m.bytes)),
				errors: num(m.errors),
				warnings: num(m.warnings),
				sheet: str(m.sheet) ?? null,
				thumbnails: list(m.thumbnails).flatMap((t) => typeof t === "string" ? [t] : []),
				findings: findings(m.findings)
			};
		}
		case "pptx_check": return {
			kind: "pptx-check",
			errors: num(m.errors),
			warnings: num(m.warnings),
			findings: findings(m.findings)
		};
		case "pptx_review": {
			const summary = record(m.summary);
			return {
				kind: "pptx-review",
				model: str(m.model) ?? "",
				summary: {
					errors: num(summary?.errors),
					warnings: num(summary?.warnings),
					passed: num(summary?.passed)
				},
				pages: list(m.pages).flatMap((entry) => {
					const page = record(entry);
					if (page === void 0) return [];
					const verdict = page.verdict === "pass" || page.verdict === "fail" ? page.verdict : "warn";
					return [{
						page: num(page.page),
						verdict,
						score: typeof page.score === "number" ? page.score : null,
						issues: list(page.issues).flatMap((raw) => {
							const issue = record(raw);
							const text = str(issue?.issue);
							return issue === void 0 || text === void 0 ? [] : [{
								severity: str(issue.severity) ?? "warning",
								area: str(issue.area) ?? "",
								issue: text,
								fix: str(issue.fix) ?? ""
							}];
						})
					}];
				}),
				files: list(m.files).flatMap((f) => typeof f === "string" ? [f] : [])
			};
		}
		case "pptx_generate_assets": {
			const job = record(m.job);
			const images = list(m.files).flatMap((entry) => {
				const item = record(entry);
				const path = str(item?.file);
				return path === void 0 || imageMime(path) === void 0 ? [] : [{
					label: str(item?.id) ?? fileName(path),
					path
				}];
			});
			for (const raw of list(m.kits)) {
				const kit = record(raw);
				const sheet = str(kit?.sheet);
				if (sheet !== void 0 && imageMime(sheet) !== void 0) images.push({
					label: (str(kit?.id) ?? "kit") + " · " + num(kit?.pieces),
					path: sheet
				});
			}
			return {
				kind: "pptx-assets",
				images,
				failed: list(m.failed).flatMap((entry) => {
					const item = record(entry);
					return item === void 0 ? [] : [{
						id: str(item.id) ?? "?",
						error: str(item.error) ?? null
					}];
				}),
				job: job !== void 0 && str(job.id) !== void 0 ? {
					id: str(job.id),
					label: str(job.label) ?? ""
				} : null,
				note: str(m.backend) ?? null
			};
		}
		case "pptx_style_board": return {
			kind: "pptx-style-board",
			images: list(m.files).flatMap((f, index) => typeof f === "string" && imageMime(f) !== void 0 ? [{
				label: "board-" + (index + 1),
				path: f
			}] : []),
			failed: [],
			job: null,
			note: null
		};
		case "pptx_render": {
			const pages = list(m.pages);
			return {
				kind: "pptx-render",
				images: list(m.files).flatMap((f, index) => typeof f === "string" ? [{
					label: "P" + String(pages[index] ?? index + 1),
					path: f
				}] : []),
				failed: [],
				job: null,
				note: list(m.missingFonts).length > 0 ? list(m.missingFonts).join(", ") : null
			};
		}
		default: return;
	}
}
/**
* Tag tone for an error/warning pair.
* @param errors - error count.
* @param warnings - warning count.
* @returns Tag tone name.
*/
function healthTone(errors, warnings) {
	return errors > 0 ? "danger" : warnings > 0 ? "warning" : "success";
}

//#endregion
//#region src/client/cards.ts
const h = react.createElement;
/** Card CSS, injected once while the plugin is active. */
const CARD_CSS = `
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
`;
/** Copy key of each tool's card title. */
const TITLE_KEY = {
	pptx_build: "buildTitle",
	pptx_check: "checkTitle",
	pptx_review: "reviewTitle",
	pptx_generate_assets: "assetsTitle",
	pptx_style_board: "boardTitle",
	pptx_render: "renderTitle"
};
function resultText(block) {
	return (block.content ?? []).map((part) => part.type === "text" && typeof part.text === "string" ? part.text : "").join("\n").trim();
}
/**
* Build the toolview component for all pptx_* tools.
* @param load - Session image loader.
* @param t - card copy translator.
* @returns the slot component.
*/
function createCard(load, t) {
	/** One lazily loaded image. */
	function Picture(props) {
		const [url, setUrl] = react.useState(null);
		const [failed, setFailed] = react.useState(false);
		react.useEffect(() => {
			if (props.sessionId === void 0 || imageMime(props.path) === void 0) {
				setFailed(true);
				return;
			}
			const abort = new AbortController();
			let alive = true;
			setFailed(false);
			load(props.sessionId, props.path, abort.signal).then((value) => {
				if (alive) setUrl(value);
			}, () => {
				if (alive) setFailed(true);
			});
			return () => {
				alive = false;
				abort.abort();
			};
		}, [props.sessionId, props.path]);
		if (url === null) return props.placeholder === void 0 ? h("div", {
			className: props.className,
			title: props.path,
			"aria-label": props.alt
		}) : h("div", { className: props.placeholder }, failed ? t("imageFailed") : t("imageLoading"));
		return h("img", {
			className: props.className,
			src: url,
			alt: props.alt,
			title: props.path,
			onClick: () => props.onOpen?.(url)
		});
	}
	function Findings(props) {
		if (props.findings.length === 0) return h("div", { className: "pptxs-meta" }, t("noFindings"));
		return h("ul", { className: "pptxs-list" }, props.findings.map((f, i) => h("li", {
			key: i,
			className: "pptxs-item"
		}, h(__deepseek_ai_dsh_client_ui_primitives.Tag, { tone: f.severity === "error" ? "danger" : "warning" }, f.severity === "error" ? t("error") : t("warning")), " ", h("b", null, f.slide), " · ", f.check, " — ", f.message)));
	}
	function Health(props) {
		return h(react.Fragment, null, h(__deepseek_ai_dsh_client_ui_primitives.Tag, { tone: healthTone(props.errors, props.warnings) }, t("health", {
			errors: props.errors,
			warnings: props.warnings
		})));
	}
	function BuildView(props) {
		const { model, view } = props;
		const disclosure = view.useDisclosure();
		return h("div", {
			className: "pptxs-card",
			"data-pptx-card": "build"
		}, h("div", { className: "pptxs-head" }, h("span", {
			className: "pptxs-title",
			title: model.path
		}, t("buildTitle") + " · " + model.fileName), h("span", { className: "pptxs-meta" }, t("slidesSize", {
			slides: model.slides,
			size: model.size
		})), h("span", { className: "pptxs-spacer" }), h(Health, {
			errors: model.errors,
			warnings: model.warnings
		})), model.sheet === null ? null : h(Picture, {
			sessionId: view.sessionId,
			path: model.sheet,
			alt: t("sheetAlt"),
			className: "pptxs-sheet",
			placeholder: "pptxs-sheet-ph",
			onOpen: props.zoom
		}), disclosure.expanded && model.thumbnails.length > 0 ? h("div", { className: "pptxs-grid" }, model.thumbnails.map((path, i) => h("div", {
			key: path,
			className: "pptxs-cell"
		}, h(Picture, {
			sessionId: view.sessionId,
			path,
			alt: "P" + (i + 1),
			className: "pptxs-thumb",
			onOpen: props.zoom
		}), h("span", { className: "pptxs-cap" }, "P" + (i + 1))))) : null, disclosure.expanded ? h(Findings, { findings: model.findings }) : null, h("div", { className: "pptxs-actions" }, h("button", {
			type: "button",
			className: "pptxs-btn",
			onClick: () => view.openFile(model.path)
		}, t("openPreview")), h("button", {
			type: "button",
			className: "pptxs-btn",
			onClick: disclosure.toggle
		}, disclosure.expanded ? t("collapse") : t("expand")), view.inspect === void 0 ? null : h("button", {
			type: "button",
			className: "pptxs-btn",
			onClick: view.inspect
		}, t("inspect"))));
	}
	function CheckView(props) {
		const disclosure = props.view.useDisclosure();
		return h("div", {
			className: "pptxs-card",
			"data-pptx-card": "check"
		}, h("div", { className: "pptxs-head" }, h("span", { className: "pptxs-title" }, t("checkTitle")), h("span", { className: "pptxs-spacer" }), h(Health, {
			errors: props.model.errors,
			warnings: props.model.warnings
		})), props.model.findings.length === 0 ? null : disclosure.expanded ? h(Findings, { findings: props.model.findings }) : null, props.model.findings.length === 0 ? h("div", { className: "pptxs-meta" }, t("noFindings")) : h("div", { className: "pptxs-actions" }, h("button", {
			type: "button",
			className: "pptxs-btn",
			onClick: disclosure.toggle
		}, disclosure.expanded ? t("collapse") : t("expand"))));
	}
	function ReviewView(props) {
		const { model, view } = props;
		const disclosure = view.useDisclosure();
		return h("div", {
			className: "pptxs-card",
			"data-pptx-card": "review"
		}, h("div", { className: "pptxs-head" }, h("span", { className: "pptxs-title" }, t("reviewTitle")), h("span", { className: "pptxs-meta" }, model.model), h("span", { className: "pptxs-spacer" }), h(__deepseek_ai_dsh_client_ui_primitives.Tag, { tone: healthTone(model.summary.errors, model.summary.warnings) }, t("reviewSummary", model.summary))), h("div", null, model.pages.map((page, index) => {
			const issues = disclosure.expanded ? page.issues : page.issues.slice(0, 1);
			return h("div", {
				key: page.page,
				className: "pptxs-page"
			}, h("div", { className: "pptxs-row" }, h(__deepseek_ai_dsh_client_ui_primitives.Tag, { tone: page.verdict === "pass" ? "success" : page.verdict === "fail" ? "danger" : "warning" }, "P" + page.page + " · " + t("verdict." + page.verdict) + (page.score === null ? "" : " " + page.score)), disclosure.expanded && model.files[index] !== void 0 ? h(Picture, {
				sessionId: view.sessionId,
				path: model.files[index],
				alt: "P" + page.page,
				className: "pptxs-thumb",
				onOpen: props.zoom
			}) : null), issues.length === 0 ? null : h("ul", { className: "pptxs-list" }, issues.map((issue, i) => h("li", {
				key: i,
				className: "pptxs-item"
			}, h("b", null, issue.area), " — ", issue.issue, issue.fix === "" ? null : h("div", { className: "pptxs-fix" }, t("fix") + issue.fix)))));
		})), h("div", { className: "pptxs-actions" }, h("button", {
			type: "button",
			className: "pptxs-btn",
			onClick: disclosure.toggle
		}, disclosure.expanded ? t("collapse") : t("expandAll"))));
	}
	function GalleryView(props) {
		const { model, view } = props;
		const titleKey = model.kind === "pptx-assets" ? "assetsTitle" : model.kind === "pptx-style-board" ? "boardTitle" : "renderTitle";
		return h("div", {
			className: "pptxs-card",
			"data-pptx-card": model.kind
		}, h("div", { className: "pptxs-head" }, h("span", { className: "pptxs-title" }, t(titleKey)), h("span", { className: "pptxs-meta" }, t("imageCount", { count: model.images.length }) + (model.note === null ? "" : " · " + model.note)), h("span", { className: "pptxs-spacer" }), model.failed.length > 0 ? h(__deepseek_ai_dsh_client_ui_primitives.Tag, { tone: "danger" }, t("failedCount", { count: model.failed.length })) : null), model.job === null ? null : h("div", { className: "pptxs-row" }, h(__deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), t("jobRunning", { id: model.job.id })), model.images.length === 0 ? null : h("div", { className: "pptxs-grid" }, model.images.map((image) => h("div", {
			key: image.path,
			className: "pptxs-cell"
		}, h(Picture, {
			sessionId: view.sessionId,
			path: image.path,
			alt: image.label,
			className: "pptxs-thumb",
			onOpen: props.zoom
		}), h("span", {
			className: "pptxs-cap",
			title: image.path
		}, image.label)))), model.failed.length === 0 ? null : h("ul", { className: "pptxs-list" }, model.failed.map((f) => h("li", {
			key: f.id,
			className: "pptxs-item"
		}, h("b", null, f.id), f.error === null ? "" : " — " + f.error))));
	}
	function Pending(props) {
		return h("div", {
			className: "pptxs-card",
			"data-pptx-card": "pending"
		}, h("div", { className: "pptxs-head" }, h(__deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), h(__deepseek_ai_dsh_client_ui_primitives.TextShimmer, { active: true }, h("span", { className: "pptxs-title" }, t(TITLE_KEY[props.view.toolName] ?? "buildTitle") + " · " + t("running")))));
	}
	function Failed(props) {
		return h("div", {
			className: "pptxs-card",
			"data-pptx-card": "failed"
		}, h("div", { className: "pptxs-head" }, h(__deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), h("span", { className: "pptxs-title" }, t(TITLE_KEY[props.view.toolName] ?? "buildTitle") + " · " + t("failed"))), props.text === "" ? null : h("div", { className: "pptxs-error" }, props.text.slice(0, 800)), props.view.inspect === void 0 ? null : h("div", { className: "pptxs-actions" }, h("button", {
			type: "button",
			className: "pptxs-btn",
			onClick: props.view.inspect
		}, t("inspect"))));
	}
	return function PptxToolCard(view) {
		const [zoomed, setZoomed] = react.useState(null);
		const zoom = (url) => {
			setZoomed(url);
		};
		if (view.phase !== "result") return h(Pending, { view });
		if (view.block.isError === true) return h(Failed, {
			view,
			text: resultText(view.block)
		});
		const model = cardModel(view.toolName, view.block.meta);
		if (model === void 0) return h(Failed, {
			view,
			text: resultText(view.block)
		});
		const body = model.kind === "pptx-build" ? h(BuildView, {
			model,
			view,
			zoom
		}) : model.kind === "pptx-check" ? h(CheckView, {
			model,
			view
		}) : model.kind === "pptx-review" ? h(ReviewView, {
			model,
			view,
			zoom
		}) : h(GalleryView, {
			model,
			view,
			zoom
		});
		return h(react.Fragment, null, body, zoomed === null ? null : h(__deepseek_ai_dsh_client_ui_primitives.ImageLightbox, {
			src: zoomed,
			alt: t("sheetAlt"),
			labels: {
				dialog: t("dialog"),
				close: t("close")
			},
			onClose: () => {
				setZoomed(null);
			}
		}));
	};
}

//#endregion
//#region src/client/card-locales.ts
/** Copy for the pptx_* chat cards. */
const CARD_NS = "pptx-studio.cards";
const cardZh = {
	buildTitle: "PPT 组装",
	checkTitle: "PPT 检查",
	reviewTitle: "视觉评审",
	assetsTitle: "生成配图",
	boardTitle: "风格样张",
	renderTitle: "渲染页面",
	running: "进行中…",
	failed: "失败",
	slidesSize: "{slides} 页 · {size}",
	health: "{errors} 错误 · {warnings} 警告",
	reviewSummary: "{errors} 错误 · {warnings} 警告 · {passed} 页通过",
	"verdict.pass": "通过",
	"verdict.warn": "需改进",
	"verdict.fail": "不合格",
	openPreview: "打开预览",
	expand: "展开缩略图与问题",
	expandAll: "展开全部问题",
	collapse: "收起",
	inspect: "查看调用",
	noFindings: "没有发现问题",
	error: "错误",
	warning: "警告",
	fix: "建议：",
	imageCount: "{count} 张图",
	failedCount: "{count} 张失败",
	jobRunning: "后台任务 {id} 运行中，完成后会自动通知",
	sheetAlt: "幻灯片缩略图",
	imageLoading: "缩略图加载中…",
	imageFailed: "缩略图不可用",
	dialog: "图片预览",
	close: "关闭"
};
const cardEn = {
	buildTitle: "PPT build",
	checkTitle: "PPT check",
	reviewTitle: "Vision review",
	assetsTitle: "Generated images",
	boardTitle: "Style boards",
	renderTitle: "Rendered slides",
	running: "running…",
	failed: "failed",
	slidesSize: "{slides} slides · {size}",
	health: "{errors} errors · {warnings} warnings",
	reviewSummary: "{errors} errors · {warnings} warnings · {passed} passed",
	"verdict.pass": "pass",
	"verdict.warn": "needs work",
	"verdict.fail": "fail",
	openPreview: "Open preview",
	expand: "Show thumbnails and findings",
	expandAll: "Show all findings",
	collapse: "Collapse",
	inspect: "Inspect",
	noFindings: "No problems found",
	error: "error",
	warning: "warning",
	fix: "Fix: ",
	imageCount: "{count} images",
	failedCount: "{count} failed",
	jobRunning: "Background job {id} is running; you will be notified when it finishes",
	sheetAlt: "Slide thumbnails",
	imageLoading: "Loading thumbnail…",
	imageFailed: "Thumbnail unavailable",
	dialog: "Image preview",
	close: "Close"
};

//#endregion
//#region src/client/index.ts
/** Profile entry id of the Host plugin; the config namespace this page edits. */
const ENTRY_ID = "pptx-studio";
/** Bundle names the Plugins page keys its config slot by. */
const BUNDLE_NAMES = ["dsh-pptx-studio", "@deepseek-ai/dsh-pptx-studio"];
/** Locale namespace this page owns. */
const NS = "settings.pptx-studio";
/** Services the page reads from the browser plugin context. */
const inject = [
	"slots",
	"locale",
	"configForms"
];
/** Fields of the Host config this page edits. */
const FIELDS = [
	"textModelMode",
	"textModelName",
	"visionModelMode",
	"visionModelName",
	"imageBackend",
	"customModelsJson",
	"customModelApiKeyRef"
];
/** Write-only credential controls. */
const SECRETS = [
	"agnesKey",
	"modelscopeKey",
	"customKey"
];
/** Credential references the page always reports on. */
const BASE_REFS = ["AGNES_API_KEY", "MODELSCOPE_API_KEY"];
/** Model mode values the Host accepts. */
const MODES = [
	"session",
	"route",
	"custom"
];
/** Default credential reference for custom models. */
const DEFAULT_CUSTOM_REF = "CUSTOM_API_KEY";
/** Simplified Chinese copy. */
const zh = {
	summary: "选择文字、视觉与图片模型，填写自定义模型和 API Key。",
	intro: "文字模型与视觉模型默认跟随当前对话；也可以指定 Host 已配置的路线（provider/model），或使用下面的自定义 OpenAI 兼容模型。Key 只写入 DSH 凭据库，不会写进配置。",
	textSection: "文字模型",
	visionSection: "视觉模型",
	imageSection: "图片模型",
	customSection: "自定义模型",
	credentialSection: "API Key",
	textMode: "文字模型来源",
	textModeHint: "session = 当前对话模型（默认）；route = Host 已配置的 provider/model；custom = 下面的自定义模型名。",
	textName: "文字模型路线或名称",
	textNameHint: "route 写 provider/model，例如 deepseek-account/deepseek-flash；custom 写自定义模型的 name；session 留空。",
	visionMode: "视觉模型来源",
	visionModeHint: "session = 当前对话模型（默认）；route / custom 与文字模型相同。pptx_review 会用这里的视觉模型逐页评审。",
	visionName: "视觉模型路线或名称",
	visionNameHint: "route 写 provider/model；custom 写自定义模型的 name。",
	imageBackend: "当前图片后端",
	imageBackendHint: "默认 agnes（Agnes AI 国内站）；也可填 modelscope。图片后端列表在插件配置文件里维护。",
	customModels: "自定义模型（JSON 数组）",
	customModelsHint: "每项：{\"name\":\"my-model\",\"baseUrl\":\"https://example.com/v1\",\"model\":\"gpt-4o-mini\",\"apiKeyRef\":\"MY_KEY\",\"api\":\"openai-chat\"}。保存时会校验 JSON 与必填字段。",
	customRef: "自定义模型凭据名",
	customRefHint: "自定义模型 apiKeyRef 使用的凭据名，例如 MY_KEY；下面的输入框会写入这个凭据。",
	agnesKey: "Agnes API Key",
	agnesKeyHint: "留空表示不修改；填入后写入 DSH 凭据 AGNES_API_KEY。",
	modelscopeKey: "ModelScope API Key",
	modelscopeKeyHint: "留空表示不修改；填入后写入 DSH 凭据 MODELSCOPE_API_KEY。",
	customKey: "自定义模型 API Key",
	customKeyHint: "留空表示不修改；填入后写入上面「自定义模型凭据名」指向的凭据。",
	configured: "已配置",
	notConfigured: "未配置",
	overridden: "已修改",
	reset: "恢复默认",
	invalid: "格式不正确，请检查后再保存。",
	invalidJson: "需要合法的 JSON 数组，每项含 name、baseUrl、model、apiKeyRef。",
	invalidMode: "只能填 session、route 或 custom。",
	invalidRef: "凭据名只能包含字母、数字与下划线，且不能以数字开头。",
	save: "保存",
	saving: "保存中…",
	saveFailed: "保存失败，请检查字段后重试。",
	readOnly: "当前部署的设置是只读的。",
	unavailable: "插件当前未加载，暂时无法配置。"
};
/** English copy. */
const en = {
	summary: "Choose text, vision and image models, and store API keys.",
	intro: "Text and vision models follow the current conversation by default. You can also name a configured Host route (provider/model) or use an OpenAI-compatible custom model below. Keys go to the DSH credentials store and never into the config document.",
	textSection: "Text model",
	visionSection: "Vision model",
	imageSection: "Image model",
	customSection: "Custom models",
	credentialSection: "API keys",
	textMode: "Text model source",
	textModeHint: "session = the conversation model (default); route = a configured Host provider/model; custom = a name from the custom list.",
	textName: "Text route or model name",
	textNameHint: "route: provider/model such as deepseek-account/deepseek-flash. custom: the custom model name. Leave empty for session.",
	visionMode: "Vision model source",
	visionModeHint: "session = the conversation model (default); route / custom match the text model. pptx_review uses this model for page-by-page review.",
	visionName: "Vision route or model name",
	visionNameHint: "route: provider/model. custom: the custom model name.",
	imageBackend: "Active image backend",
	imageBackendHint: "Defaults to agnes (Agnes AI China). Set modelscope for the fallback. The backend list lives in the plugin config file.",
	customModels: "Custom models (JSON array)",
	customModelsHint: "Each entry: {\"name\":\"my-model\",\"baseUrl\":\"https://example.com/v1\",\"model\":\"gpt-4o-mini\",\"apiKeyRef\":\"MY_KEY\",\"api\":\"openai-chat\"}. JSON and required fields are validated on save.",
	customRef: "Custom-model credential name",
	customRefHint: "Credential reference used by custom model apiKeyRef, for example MY_KEY. The field below writes to this reference.",
	agnesKey: "Agnes API key",
	agnesKeyHint: "Leave blank to keep the stored key; a value writes the DSH credential AGNES_API_KEY.",
	modelscopeKey: "ModelScope API key",
	modelscopeKeyHint: "Leave blank to keep the stored key; a value writes the DSH credential MODELSCOPE_API_KEY.",
	customKey: "Custom-model API key",
	customKeyHint: "Leave blank to keep it; a value writes the credential named above.",
	configured: "Configured",
	notConfigured: "Not configured",
	overridden: "Changed",
	reset: "Reset",
	invalid: "Invalid value; fix it before saving.",
	invalidJson: "Needs a JSON array whose entries carry name, baseUrl, model and apiKeyRef.",
	invalidMode: "Use session, route or custom.",
	invalidRef: "A credential name takes letters, digits and underscores, and cannot start with a digit.",
	save: "Save",
	saving: "Saving…",
	saveFailed: "The save failed; check the fields and try again.",
	readOnly: "Settings are read-only in this deployment.",
	unavailable: "This plugin is not loaded, so it cannot be configured right now."
};
/** Field-style heading. */
const headingStyle = {
	margin: "14px 0 2px",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--dsw-alias-label-primary)"
};
/** Muted explanatory copy. */
const noteStyle = {
	margin: "0 0 6px",
	fontSize: 12,
	lineHeight: 1.5,
	color: "var(--dsw-alias-label-tertiary)"
};
/** A textarea styled like the primitive inputs. */
const areaStyle = {
	width: "100%",
	boxSizing: "border-box",
	minHeight: 84,
	padding: "8px 10px",
	resize: "vertical",
	border: "1px solid var(--dsw-alias-border-secondary)",
	borderRadius: 8,
	background: "var(--dsw-alias-bg-primary)",
	color: "var(--dsw-alias-label-primary)",
	font: "inherit",
	fontSize: 12,
	lineHeight: 1.5
};
/** Error copy under the textarea. */
const errorStyle = {
	margin: "4px 0 0",
	fontSize: 12,
	color: "var(--dsw-alias-label-error)"
};
/**
* A field that only accepts one of a fixed set of strings.
* @param field - field name inside the config section.
* @param values - accepted values.
* @returns the field spec.
*/
function enumField(field, values) {
	return {
		field,
		format: (value) => typeof value === "string" ? value : "",
		parse: (text) => values.includes(text.trim()) ? {
			kind: "set",
			value: text.trim()
		} : void 0
	};
}
/**
* The custom-model JSON field: validates the array and canonicalizes it.
* @returns the field spec.
*/
function customModelsField() {
	return {
		field: "customModelsJson",
		format: (value) => typeof value === "string" ? value : "[]",
		parse: (text) => {
			try {
				const parsed = JSON.parse(text.trim() === "" ? "[]" : text);
				if (!Array.isArray(parsed)) return void 0;
				for (const entry of parsed) {
					if (typeof entry !== "object" || entry === null) return void 0;
					if (typeof entry.name !== "string" || entry.name.length === 0) return void 0;
					if (typeof entry.baseUrl !== "string" || !/^https:\/\//.test(entry.baseUrl)) return void 0;
					if (typeof entry.model !== "string" || entry.model.length === 0) return void 0;
					if (typeof entry.apiKeyRef !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.apiKeyRef)) return void 0;
				}
				return {
					kind: "set",
					value: JSON.stringify(parsed, null, 2)
				};
			} catch {
				return;
			}
		}
	};
}
/**
* A credential-reference field (a POSIX shell identifier).
* @returns the field spec.
*/
function credentialRefField() {
	return {
		field: "customModelApiKeyRef",
		format: (value) => typeof value === "string" ? value : "",
		parse: (text) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(text.trim()) ? {
			kind: "set",
			value: text.trim()
		} : void 0
	};
}
/**
* Stage and save the page's config and credentials.
*/
var Controller = class {
	/** Shared form model over the plugin config namespace. */
	form;
	/** Snapshot store the slot component reads. */
	store;
	/** Last credential answers, by reference. */
	configured = {};
	/**
	* @param scope - config form scope served by the Host for this plugin entry.
	* @param ctx - browser plugin context (remote credentials).
	*/
	constructor(scope, ctx) {
		this.scope = scope;
		this.ctx = ctx;
		this.form = new __deepseek_ai_dsh_client_ui_primitives.SettingsFormModel(scope, [
			enumField("textModelMode", MODES),
			(0, __deepseek_ai_dsh_client_ui_primitives.settingsTextField)("textModelName"),
			enumField("visionModelMode", MODES),
			(0, __deepseek_ai_dsh_client_ui_primitives.settingsTextField)("visionModelName"),
			(0, __deepseek_ai_dsh_client_ui_primitives.settingsTextField)("imageBackend"),
			customModelsField(),
			credentialRefField()
		], [
			{
				field: "agnesKey",
				write: (text) => this.writeKey("AGNES_API_KEY", text)
			},
			{
				field: "modelscopeKey",
				write: (text) => this.writeKey("MODELSCOPE_API_KEY", text)
			},
			{
				field: "customKey",
				write: (text) => this.writeKey(this.customRef(), text)
			}
		]);
		this.store = this.form.bind(() => this.projection());
		this.refreshCredentials();
	}
	/** The credential reference a custom-model key writes to. */
	customRef() {
		const staged = this.form.field("customModelApiKeyRef").text.trim();
		return staged === "" ? DEFAULT_CUSTOM_REF : staged;
	}
	/** The live credential references this page reports. */
	refs() {
		return [...BASE_REFS, this.customRef()];
	}
	/** Project shell, fields and credential state for the renderer. */
	projection() {
		const fields = Object.fromEntries(FIELDS.map((field) => [field, this.form.field(field)]));
		const secrets = Object.fromEntries(SECRETS.map((field) => [field, this.form.field(field)]));
		const configured = Object.fromEntries(this.refs().map((ref) => [ref, this.configured[ref] === true]));
		return {
			...this.form.shell(),
			fields,
			secrets,
			configured,
			customRef: this.customRef()
		};
	}
	/** Re-read whether the Host holds each credential. */
	async refreshCredentials() {
		try {
			const response = await this.ctx.remote.credentials.describe(this.refs());
			if (!response?.ok) return;
			const next = {};
			for (const ref of this.refs()) next[ref] = response.value?.[ref]?.configured === true;
			this.configured = next;
			this.store.set(this.projection());
		} catch {}
	}
	/**
	* Write one key, then refresh the configured badges.
	* @param ref - credential reference.
	* @param value - secret literal.
	* @returns whether the Host now reports it configured.
	*/
	async writeKey(ref, value) {
		await this.ctx.remote.credentials.set(ref, value);
		await this.refreshCredentials();
		return this.configured[ref] === true;
	}
	/** Stage one field edit. */
	edit(field, text) {
		this.form.actions().edit(field, text);
	}
	/** Reset one field to the composition value. */
	resetField(field) {
		this.form.actions().resetField(field);
	}
	/** Discard every staged edit. */
	discard() {
		this.form.actions().discard();
	}
	/** Save config and staged keys, then refresh credential badges. */
	save() {
		(async () => {
			await this.form.save();
			await this.refreshCredentials();
		})();
	}
	/** Release the form subscriptions. */
	dispose() {
		this.form.dispose();
	}
};
/**
* The page body: a one-line summary for the plugin row and the full form.
* @param props - slot view, translation, actions, primitives and the snapshot hook.
* @returns the summary string or the settings form.
*/
function SettingsPage(props) {
	const { translate: t, primitives: ui } = props;
	const state = props.usePptxSettings((snapshot) => snapshot);
	if (props.view === "summary") return t("summary");
	const disabled = state.writable !== true;
	const field = (name, label, hint) => react.createElement(ui.SettingsValueField, {
		id: "pptx-" + name,
		label,
		hint,
		overriddenLabel: t("overridden"),
		resetLabel: t("reset"),
		invalidLabel: name === "customModelsJson" ? t("invalidJson") : name.endsWith("Mode") ? t("invalidMode") : name === "customModelApiKeyRef" ? t("invalidRef") : t("invalid"),
		disabled,
		...state.fields[name],
		onEdit: (text) => {
			props.edit(name, text);
		},
		onReset: () => {
			props.resetField(name);
		}
	}, name);
	const secret = (fieldName, label, hint, ref) => react.createElement(ui.SettingsSecretField, {
		id: "pptx-" + fieldName,
		label,
		hint,
		text: state.secrets[fieldName].text,
		configured: state.configured[ref] === true,
		stateLabel: state.configured[ref] === true ? t("configured") : t("notConfigured"),
		disabled,
		onEdit: (text) => {
			props.edit(fieldName, text);
		}
	}, fieldName);
	const section = (key, title, children) => react.createElement("section", {
		key,
		style: {
			display: "flex",
			flexDirection: "column"
		}
	}, [react.createElement("h4", {
		key: "title",
		style: headingStyle
	}, title), ...children]);
	const textarea = react.createElement("div", {
		key: "customModelsJson",
		style: { marginTop: 8 }
	}, [
		react.createElement("label", {
			key: "label",
			htmlFor: "pptx-customModelsJson",
			style: {
				display: "block",
				fontSize: 13,
				fontWeight: 600,
				color: "var(--dsw-alias-label-primary)",
				marginBottom: 4
			}
		}, t("customModels")),
		react.createElement("textarea", {
			key: "input",
			id: "pptx-customModelsJson",
			style: areaStyle,
			value: state.fields.customModelsJson.text,
			disabled,
			onChange: (event) => {
				props.edit("customModelsJson", event.target.value);
			}
		}),
		react.createElement("p", {
			key: "hint",
			style: state.fields.customModelsJson.invalid ? errorStyle : noteStyle
		}, state.fields.customModelsJson.invalid ? t("invalidJson") : t("customModelsHint"))
	]);
	return react.createElement(ui.SettingsForm, {
		labels: {
			unavailable: t("unavailable"),
			readOnly: t("readOnly"),
			saveFailed: t("saveFailed"),
			save: t("save"),
			saving: t("saving")
		},
		state,
		onSave: () => {
			props.save();
		},
		onDiscard: () => {
			props.discard();
		},
		children: [
			react.createElement("p", {
				key: "intro",
				style: noteStyle
			}, t("intro")),
			section("text", t("textSection"), [field("textModelMode", t("textMode"), t("textModeHint")), field("textModelName", t("textName"), t("textNameHint"))]),
			section("vision", t("visionSection"), [field("visionModelMode", t("visionMode"), t("visionModeHint")), field("visionModelName", t("visionName"), t("visionNameHint"))]),
			section("image", t("imageSection"), [field("imageBackend", t("imageBackend"), t("imageBackendHint"))]),
			section("custom", t("customSection"), [textarea, field("customModelApiKeyRef", t("customRef"), t("customRefHint"))]),
			section("keys", t("credentialSection"), [
				secret("agnesKey", t("agnesKey"), t("agnesKeyHint"), "AGNES_API_KEY"),
				secret("modelscopeKey", t("modelscopeKey"), t("modelscopeKeyHint"), "MODELSCOPE_API_KEY"),
				secret("customKey", t("customKey"), t("customKeyHint"), state.customRef)
			])
		]
	});
}
/**
* Mount the settings page into the plugin's config slot.
* @param ctx - browser plugin context.
*/
function apply(ctx) {
	mountCards(ctx);
	const primitives = {
		SettingsForm: __deepseek_ai_dsh_client_ui_primitives.SettingsForm,
		SettingsFormModel: __deepseek_ai_dsh_client_ui_primitives.SettingsFormModel,
		SettingsSecretField: __deepseek_ai_dsh_client_ui_primitives.SettingsSecretField,
		SettingsValueField: __deepseek_ai_dsh_client_ui_primitives.SettingsValueField,
		settingsTextField: __deepseek_ai_dsh_client_ui_primitives.settingsTextField
	};
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "pptx-studio: dictionaries");
	const translate = ctx.locale.bind(NS);
	const controller = new Controller(ctx.configForms.get(ENTRY_ID), ctx);
	const Page = (props) => react.createElement(SettingsPage, {
		...props,
		edit: (field, text) => controller.edit(field, text),
		resetField: (field) => controller.resetField(field),
		discard: () => controller.discard(),
		save: () => controller.save(),
		translate,
		primitives
	});
	ctx.effect(() => () => {
		controller.dispose();
	}, "pptx-studio: form disposal");
	ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject("plugins.bundle.config", function* () {
		for (const key of BUNDLE_NAMES) yield ctx.slots.register({
			name: "plugins.bundle.config",
			key,
			locale: NS,
			inject: () => ({ hooks: { pptxSettings: controller.store } })
		}, Page);
	})), "pptx-studio: settings page");
}
/** Cached blob URLs of Session images, revoked when the plugin unloads. */
const MAX_CACHED_IMAGES = 240;
/**
* Register the pptx_* chat cards and their image loader.
* @param ctx - browser plugin context.
*/
function mountCards(ctx) {
	ctx.effect(() => ctx.locale.register(CARD_NS, {
		zh: cardZh,
		en: cardEn
	}), "pptx-studio: card dictionaries");
	const bound = ctx.locale.bind(CARD_NS);
	const t = (key, params) => bound(key, params);
	ctx.effect(() => {
		if (typeof document === "undefined") return () => {};
		const style = document.createElement("style");
		style.dataset.plugin = "dsh-pptx-studio";
		style.textContent = CARD_CSS;
		document.head.appendChild(style);
		return () => {
			style.remove();
		};
	}, "pptx-studio: card styles");
	const cache = /* @__PURE__ */ new Map();
	const urls = /* @__PURE__ */ new Set();
	ctx.effect(() => () => {
		for (const url of urls) URL.revokeObjectURL(url);
		urls.clear();
		cache.clear();
	}, "pptx-studio: card images");
	const load = (sessionId, path, signal) => {
		const key = sessionId + "|" + path;
		const hit = cache.get(key);
		if (hit !== void 0) return hit;
		const files = ctx.get("remote")?.workspaceFiles;
		if (files === void 0) return Promise.reject(/* @__PURE__ */ new Error("workspace files are not available"));
		const mime = imageMime(path) ?? "application/octet-stream";
		const pending = (async () => {
			const result = await files.readBytes(sessionId, path, {}, signal);
			if (!result?.ok) throw new Error(result?.error?.message ?? "read failed");
			const url = URL.createObjectURL(new Blob([result.value.data], { type: mime }));
			urls.add(url);
			return url;
		})();
		pending.catch(() => {
			cache.delete(key);
		});
		if (cache.size >= MAX_CACHED_IMAGES) {
			const oldest = cache.keys().next().value;
			if (oldest !== void 0) cache.delete(oldest);
		}
		cache.set(key, pending);
		return pending;
	};
	const Card = createCard(load, t);
	ctx.effect(() => ctx.slots.inject("tool.call.toolview", function* () {
		for (const key of CARD_TOOLS) yield ctx.slots.register({
			name: "tool.call.toolview",
			key,
			locale: CARD_NS
		}, Card);
	}), "pptx-studio: tool cards");
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });