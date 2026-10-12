function createFontSettings(React, store) {
var h = React.createElement;
var normalizeState = CP_FONTS.normalizeState;
var normalizeStack = CP_FONTS.normalizeStack;
var buildCss = CP_FONTS.buildCss;
var withVar = CP_FONTS.withVar;
var ROLE_SLOTS = CP_FONTS.ROLE_SLOTS;
var SIZE_SLOTS = CP_FONTS.SIZE_SLOTS;
var MARKDOWN_SLOTS = CP_FONTS.MARKDOWN_SLOTS;
var splitTopLevel = CP_FONTS.splitTopLevel;
var entryOf = CP_FONTS.entryOf;
var normalizeSelector = CP_FONTS.normalizeSelector;
var UI_SCALES = CP_FONTS.UI_SCALES;
var PRESETS = CP_FONTS.PRESETS;
var FONT_GROUPS = CP_FONTS.FONT_GROUPS;
var CONTENT_SIZE_MIN = CP_FONTS.CONTENT_SIZE_MIN;
var CONTENT_SIZE_MAX = CP_FONTS.CONTENT_SIZE_MAX;
var FONT_CONTENT_DEFAULT = CP_FONTS.FONT_CONTENT_DEFAULT;
var readStoredSystemFonts = CP_FONTS.readStoredSystemFonts;
var storeSystemFonts = CP_FONTS.storeSystemFonts;
		/** 字体族下拉 + 「添加」/「清空」，下面是一个可手工编辑的字体栈输入框。 */
		function FamilyPicker(props) {
			var pickedRef = React.useState("");
			var picked = pickedRef[0];
			var setPicked = pickedRef[1];

			/** 把选中的字体族追加到字体栈末尾（已存在则不重复添加）。 */
			var append = function (family) {
				if (family === "") return;
				var existing = splitTopLevel(String(props.value || ""))
					.map(function (raw) { return raw.trim().replace(/^["']|["']$/g, "").toLowerCase(); })
					.filter(function (raw) { return raw !== ""; });
				if (existing.indexOf(family.toLowerCase()) !== -1) return;
				props.onChange(props.value ? props.value + ", " + family : family);
			};

			var groups = FONT_GROUPS.map(function (group) {
				return h("optgroup", { key: group.label, label: group.label },
					group.fonts.map(function (family) { return h("option", { key: family, value: family }, family); }));
			});
			if (props.systemFonts && props.systemFonts.length > 0) {
				groups.push(h("optgroup", { key: "system", label: "本机全部字体（已读取 " + props.systemFonts.length + " 个）" },
					props.systemFonts.map(function (family) { return h("option", { key: family, value: family }, family); })));
			}

			return h("div", { className: "dfl-picker" },
				h("div", { className: "dfl-pickerRow" },
					h("select", {
						className: "dfl-select", "aria-label": "选择字体",
						value: picked,
						onChange: function (event) { setPicked(event.target.value); },
					},
						h("option", { value: "" }, "选择字体…"),
						groups),
					h("button", {
						type: "button",
						className: "dfl-btn dfl-btnPrimary",
						onClick: function () { append(picked); setPicked(""); },
					}, "添加"),
					h("button", {
						type: "button",
						className: "dfl-btn",
						onClick: function () { props.onChange(""); },
					}, "清空"),
					props.compact === true ? null : h("button", {
						type: "button",
						className: "dfl-btn",
						title: "读取本机已安装的全部字体族（浏览器会询问权限）",
						onClick: props.onLoadSystemFonts,
					}, "本机字体…")),
				h("input", {
					className: "dfl-input",
					type: "text", "aria-label": props.label || props.placeholder || "字体栈",
					spellCheck: false,
					placeholder: props.placeholder,
					value: props.value,
					onChange: function (event) { props.onChange(event.target.value); },
				}));
		}

		function VarRow(props) {
			var entry = props.entry;
			return h("div", { className: "dfl-row" },
				h("div", { className: "dfl-rowHead" },
					h("label", { className: "dfl-toggle" },
						h("input", {
							type: "checkbox",
							checked: entry.on === true,
							onChange: function (event) { props.onToggle(event.target.checked); },
						}),
						h("span", { className: "dfl-label" }, props.label)),
					h("code", { className: "dfl-varName" }, props.name)),
				h(FamilyPicker, {
					value: entry.stack,
					placeholder: "字体族，多个用逗号分隔",
					compact: true,
					systemFonts: props.systemFonts,
					onLoadSystemFonts: props.onLoadSystemFonts,
					onChange: props.onChange,
				}),
				props.hint ? h("p", { className: "dfl-hint" }, props.hint) : null);
		}

		function SlotGroup(props) {
			return h("details", { className: "dfl-group" },
				h("summary", null, props.title, h("span", { className: "dfl-count" }, " · " + props.slots.length + " 项")),
				h("div", { className: "dfl-rows" },
					props.slots.map(function (slot) {
						return h(VarRow, {
							key: slot.name,
							name: slot.name,
							label: slot.label,
							hint: slot.hint,
							entry: entryOf(props.state, slot.name),
							systemFonts: props.systemFonts,
							onLoadSystemFonts: props.onLoadSystemFonts,
							onToggle: function (on) { props.onVar(slot.name, { on: on }); },
							onChange: function (stack) { props.onVar(slot.name, { stack: stack, on: true }); },
						});
					})));
		}

		function FontLabSection() {
			var state = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
            function setState(update) { store.save(typeof update === 'function' ? update(store.getSnapshot()) : update); }
            var active = React.useRef(true);
            React.useEffect(function () { active.current = true; return function () { active.current = false; }; }, []);
			var copiedRef = React.useState(false);
			var copied = copiedRef[0];
			var setCopied = copiedRef[1];

			// 本机字体族：点「本机字体…」时按需读取（Local Font Access API，需要用户授权）。
			var systemRef = React.useState(readStoredSystemFonts);
			var systemFonts = systemRef[0];
			var setSystemFonts = systemRef[1];
			var fontStatusRef = React.useState("");
			var fontStatus = fontStatusRef[0];
			var setFontStatus = fontStatusRef[1];
			var loadSystemFonts = function () {
				if (typeof window.queryLocalFonts !== "function") {
					setFontStatus("此环境不支持读取本机字体列表，可直接在输入框里填字体名。");
					return;
				}
				setFontStatus("正在读取本机字体…（若浏览器弹出授权提示，请选择允许）");
				window.queryLocalFonts().then(function (fonts) {
                    if (!active.current) return;
					var names = [];
					var seen = Object.create(null);
					(fonts || []).forEach(function (font) {
						var family = font && font.family;
						if (typeof family === "string" && family !== "" && seen[family] !== true) {
							seen[family] = true;
							names.push(family);
						}
					});
					if (names.length === 0) {
						setFontStatus("没有读到本机字体，可继续手动输入。");
						return;
					}
					names.sort(function (a, b) { return a.localeCompare(b); });
					setSystemFonts(names);
					storeSystemFonts(names);
					setFontStatus("已载入 " + names.length + " 个本机字体族（下次复用缓存），见下拉里的「本机全部字体」组。");
				}, function (error) {
                    if (!active.current) return;
					setFontStatus("读取本机字体被拒绝（" + ((error && error.message) || "权限未授予") + "），可继续手动输入字体名。");
				});
			};

			var css = React.useMemo(function () { return buildCss(state); }, [state]);



			var patchState = function (patch) {
				setState(function (current) {
					var next = {};
					Object.keys(current).forEach(function (key) { next[key] = current[key]; });
					Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
					return normalizeState(next);
				});
			};
			var onVar = function (name, patch) {
				setState(function (current) { return withVar(current, name, patch); });
			};
			var applyPreset = function (preset) {
				patchState({ master: true, globalFamily: preset.family, globalMono: preset.mono });
			};
			var restoreDefaults = function () {
				patchState({ master: true, globalFamily: "", globalMono: "", uiScale: 100, contentSize: "", vars: {}, rules: [] });
			};
			var addRule = function () {
				setState(function (current) {
					var rules = (current.rules || []).slice();
					rules.push({
						id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
						on: true,
						selector: "",
						stack: "",
					});
					return normalizeState({ uiScale: current.uiScale, contentSize: current.contentSize, master: current.master, globalFamily: current.globalFamily, globalMono: current.globalMono, vars: current.vars, rules: rules });
				});
			};
			var patchRule = function (id, patch) {
				setState(function (current) {
					var rules = (current.rules || []).map(function (rule) {
						if (rule.id !== id) return rule;
						var next = { on: rule.on, selector: rule.selector, stack: rule.stack, id: rule.id };
						Object.keys(patch).forEach(function (key) { next[key] = patch[key]; });
						return next;
					});
					return normalizeState({ uiScale: current.uiScale, contentSize: current.contentSize, master: current.master, globalFamily: current.globalFamily, globalMono: current.globalMono, vars: current.vars, rules: rules });
				});
			};
			var removeRule = function (id) {
				setState(function (current) {
					return normalizeState({
						uiScale: current.uiScale, contentSize: current.contentSize,
						master: current.master,
						globalFamily: current.globalFamily,
						globalMono: current.globalMono,
						vars: current.vars,
						rules: (current.rules || []).filter(function (rule) { return rule.id !== id; }),
					});
				});
			};
			var copyCss = function () {
				try {
					window.navigator.clipboard.writeText(css).then(function () {
						if (active.current) setCopied(true);

					}, function () { setCopied(false); });
				} catch (error) {
					setCopied(false);
				}
			};

			var advancedVarCount = Object.keys(state.vars || {}).filter(function (name) {
				var entry = state.vars[name];
				return entry && entry.on === true && normalizeStack(entry.stack) !== "";
			}).length;
			var advancedRuleCount = (state.rules || []).filter(function (rule) {
				return rule && rule.on === true && normalizeSelector(rule.selector) !== "" && normalizeStack(rule.stack) !== "";
			}).length;

			var activeParts = [];
			if (normalizeStack(state.globalFamily) !== "") activeParts.push("全局字体 " + normalizeStack(state.globalFamily));
			if (normalizeStack(state.globalMono) !== "") activeParts.push("等宽字体 " + normalizeStack(state.globalMono));
			if (Number(state.uiScale) !== 100) activeParts.push("界面缩放 " + state.uiScale + "%");
			if (state.contentSize !== "") activeParts.push("会话正文字号 " + state.contentSize + "px");
			var summary = state.master !== true
				? "已关闭：本插件当前不干预任何字体与字号"
				: (activeParts.length > 0
					? "已生效：" + activeParts.join("；")
					: "已开启但没有任何设置：当前仍是 DSH 默认与官方「外观」设置");

			return h("div", { className: "dfl-root" },
				h("div", { className: "dfl-head" },
					h("h3", { className: "dfl-title" }, "字体"),
					h("p", { className: "dfl-desc" }, summary)),

				h("div", { className: "dfl-master" },
					h("label", { className: "dfl-switch" },
						h("input", {
							type: "checkbox",
							checked: state.master === true,
							onChange: function (event) { patchState({ master: event.target.checked }); },
						}),
						h("span", { className: "dfl-switchLabel" }, "启用字体覆盖")),
					h("p", { className: "dfl-hint" }, "关闭后本插件完全不注入样式，回到 DSH 默认与官方「外观」里的字体设置。")),

				h("div", { className: "dfl-global" },
					h("div", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "全局字体（界面与会话正文）"),
						h(FamilyPicker, {
							value: state.globalFamily,
							placeholder: "留空则不覆盖；也可在下拉里选字体后点「添加」",
							systemFonts: systemFonts,
							onLoadSystemFonts: loadSystemFonts,
							onChange: function (value) { patchState({ globalFamily: value, master: true }); },
						})),
					h("div", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "等宽字体（代码、工具输出、终端）"),
						h(FamilyPicker, {
							value: state.globalMono,
							placeholder: "留空则不覆盖；也可在下拉里选字体后点「添加」",
							systemFonts: systemFonts,
							onLoadSystemFonts: loadSystemFonts,
							onChange: function (value) { patchState({ globalMono: value, master: true }); },
						})),
					h("p", { className: "dfl-hint", role: "status" }, store.getError() || fontStatus),
					h("p", { className: "dfl-hint" }, "这两项覆盖全部字号档位与 Markdown 各级的字体（它们默认都引用全局基座），所以日常只需要这两行。")),

				h("div", { className: "dfl-scale" },
					h("div", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "界面整体缩放（文字与间距一起放大）"),
						h("div", { className: "dfl-presets" },
							UI_SCALES.map(function (scale) {
								return h("button", {
									key: scale,
									type: "button",
									className: "dfl-btn" + (Number(state.uiScale) === scale ? " dfl-btnActive" : ""),
									onClick: function () { patchState({ uiScale: scale, master: true }); },
								}, scale + "%");
							}))),
					h("label", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "会话正文字号（px）"),
						h("input", {
							className: "dfl-input",
							type: "number",
							min: CONTENT_SIZE_MIN,
							max: CONTENT_SIZE_MAX,
							step: 1,
							placeholder: "留空则用官方设置（默认 " + FONT_CONTENT_DEFAULT + "）",
							value: state.contentSize,
							onChange: function (event) { patchState({ contentSize: event.target.value, master: true }); },
						})),
					h("p", { className: "dfl-hint" }, "整体缩放使用 CSS zoom 放大布局，界面文字、间距与图标一起放大；并非浏览器缩放，具体弹窗布局需按宿主核验。会话正文另有独立字号，也可用官方「外观 → 字号大小」。都是点一下即时生效。")),

				h("div", { className: "dfl-presets" },
					PRESETS.map(function (preset) {
						return h("button", {
							key: preset.id,
							type: "button",
							className: "dfl-btn dfl-btnPrimary",
							onClick: function () { applyPreset(preset); },
						}, preset.label);
					}),
					h("button", { type: "button", className: "dfl-btn", onClick: restoreDefaults }, "恢复 DSH 默认")),

				h("details", { className: "dfl-group" },
					h("summary", null, "高级：逐部位微调",
						h("span", { className: "dfl-count" }, " · " + (ROLE_SLOTS.length + SIZE_SLOTS.length + MARKDOWN_SLOTS.length) + " 个槽位"
							+ (advancedVarCount + advancedRuleCount > 0 ? "，已启用 " + advancedVarCount + " 槽位 / " + advancedRuleCount + " 规则" : ""))),
					h("div", { className: "dfl-rows" },
						h("p", { className: "dfl-hint" }, "高级项会压过上面的全局设置；不需要时保持关闭即可。"),
						ROLE_SLOTS.map(function (slot) {
							return h(VarRow, {
								key: slot.name,
								name: slot.name,
								label: slot.label,
								hint: slot.hint,
								entry: entryOf(state, slot.name),
								systemFonts: systemFonts,
								onLoadSystemFonts: loadSystemFonts,
								onToggle: function (on) { onVar(slot.name, { on: on }); },
								onChange: function (stack) { onVar(slot.name, { stack: stack, on: true }); },
							});
						})),
					h(SlotGroup, { title: "字号档位", slots: SIZE_SLOTS, state: state, onVar: onVar, systemFonts: systemFonts, onLoadSystemFonts: loadSystemFonts }),
					h(SlotGroup, { title: "Markdown 各级", slots: MARKDOWN_SLOTS, state: state, onVar: onVar, systemFonts: systemFonts, onLoadSystemFonts: loadSystemFonts }),
					h("details", { className: "dfl-group" },
						h("summary", null, "自定义选择器规则", h("span", { className: "dfl-count" }, " · " + (state.rules || []).length + " 条")),
						h("div", { className: "dfl-rows" },
							(state.rules || []).map(function (rule) {
								return h("div", { className: "dfl-ruleRow", key: rule.id },
									h("input", {
										type: "checkbox",
										checked: rule.on === true,
										onChange: function (event) { patchRule(rule.id, { on: event.target.checked }); },
									}),
									h("input", {
										className: "dfl-input",
										type: "text",
										spellCheck: false,
										"aria-label": "规则选择器", placeholder: "CSS 选择器（例如 [data-dsh-bottom-panel]）",
										value: rule.selector === undefined ? "" : rule.selector,
										onChange: function (event) { patchRule(rule.id, { selector: event.target.value, on: true }); },
									}),
									h("input", {
										className: "dfl-input",
										type: "text",
										"aria-label": "规则字体",
										spellCheck: false,
										placeholder: "字体族",
										value: rule.stack === undefined ? "" : rule.stack,
										onChange: function (event) { patchRule(rule.id, { stack: event.target.value, on: true }); },
									}),
									h("button", {
										type: "button",
										className: "dfl-btn dfl-btnDanger",
										title: "删除这条规则",
										onClick: function () { removeRule(rule.id); },
									}, "×"));
							}),
							h("button", { type: "button", className: "dfl-btn", onClick: addRule }, "+ 添加规则"),
							h("p", { className: "dfl-hint" }, "规则会在选中元素上强制 font-family（!important），适合覆盖变量够不到的具体面板。")))),

				h("details", { className: "dfl-group" },
					h("summary", null, "导出 / 固化"),
					h("div", { className: "dfl-rows" },
						h("p", { className: "dfl-hint" }, "下面是当前生效的 CSS。想脱离本插件固化，可把等价设置写进 profile patch 的 ui-theme 条目（textFontFamily / codeFontFamily / terminalFontFamily），或放进任意自定义 CSS 注入点。"),
						h("textarea", { className: "dfl-export", readOnly: true, value: css, spellCheck: false }),
						h("button", { type: "button", className: "dfl-btn", onClick: copyCss }, copied ? "已复制" : "复制 CSS"))));
		}


return FontLabSection;
}
