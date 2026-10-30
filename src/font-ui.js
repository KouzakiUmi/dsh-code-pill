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
var CONTENT_SIZE_MIN = CP_FONTS.CONTENT_SIZE_MIN;
var CONTENT_SIZE_MAX = CP_FONTS.CONTENT_SIZE_MAX;
var FONT_CONTENT_DEFAULT = CP_FONTS.FONT_CONTENT_DEFAULT;
var sessionFonts = [];
        function literalFamily(family) {
            // API family is one literal name, never a comma-separated stack.
            if (/["\\<>{};\n\r]|\/\*|\*\//.test(family)) return '';
            return normalizeStack('"' + family + '"');
        }
		/** 字体族下拉 + 「添加」/「清空」，下面是一个可手工编辑的字体栈输入框。 */
		function FamilyPicker(props) {
			var pickedRef = React.useState("");
			var picked = pickedRef[0];
			var setPicked = pickedRef[1];
            var errorRef = React.useState('');

			/** 把选中的字体族追加到字体栈末尾（已存在则不重复添加）。 */
			var append = function (family) {
				if (family === "") return;
				var existing = splitTopLevel(String(props.value || ""))
					.map(function (raw) { return raw.trim().replace(/^["']|["']$/g, "").toLowerCase(); })
					.filter(function (raw) { return raw !== ""; });
				if (existing.indexOf(family.toLowerCase()) !== -1) return;
				var literal = literalFamily(family);
                if (!literal) { errorRef[1]('此族名含无法安全编码的字符，可手动填写字体栈。'); return; }
                errorRef[1]('');
                props.onChange(props.value ? props.value + ", " + literal : literal);
			};

            var categoryRef = React.useState(props.mono ? 'mono' : 'all');
            var category = categoryRef[0], setCategory = categoryRef[1];
            var searchRef = React.useState('');
            var search = searchRef[0], setSearch = searchRef[1];
            var available = React.useMemo(function () {
                return CP_FONT_CATALOG.filter(props.systemFonts || [], category, search);
            }, [props.systemFonts, category, search]);
            var selected = available.some(function (font) { return font.family === picked; }) ? picked : '';

			return h("div", { className: "dfl-picker" },
				h("div", { className: "dfl-pickerFilters" },
                    h("select", { className: "dfl-select", "aria-label": "字体分类", value: category,
                        onChange: function (event) { setCategory(event.target.value); setPicked(''); } },
                        CP_FONT_CATALOG.FILTERS.map(function (item) {
                            var count = CP_FONT_CATALOG.filter(props.systemFonts || [], item.id, '').length;
                            return h("option", { key: item.id, value: item.id }, item.label + ' · ' + count);
                        })),
                    h("input", { className: "dfl-fontSearch", type: "search", "aria-label": "搜索字体", placeholder: "搜索已读取的字体…", value: search,
                        onChange: function (event) { setSearch(event.target.value); setPicked(''); } })),
                h("div", { className: "dfl-pickerRow" },
					h("select", {
						className: "dfl-select", "aria-label": "选择字体",
						value: selected, disabled: available.length === 0,
						onChange: function (event) { setPicked(event.target.value); },
					},
						h("option", { value: "" }, available.length ? "选择字体…" : "无匹配字体"),
                        available.map(function (font) { return h("option", { key: font.family, value: font.family }, font.family); })),
					h("button", {
						type: "button",
						className: "dfl-btn dfl-btnPrimary",
						disabled: !selected, onClick: function () { append(selected); setPicked(""); },
					}, "添加"),
					h("button", {
						type: "button",
						className: "dfl-btn",
						onClick: function () { props.onChange(""); },
					}, "清空")),

				h("input", {
					className: "dfl-input",
					type: "text", "aria-label": props.label || props.placeholder || "字体栈",
					spellCheck: false,
					placeholder: props.placeholder,
					value: props.value,
					onChange: function (event) { props.onChange(event.target.value); },
				}), errorRef[0] ? h('p', { className: 'dfl-hint', role: 'alert' }, errorRef[0]) : null);
		}

		function VarRow(props) {
			var entry = props.entry;
            var expandedRef = React.useState(false);
            var expanded = expandedRef[0], setExpanded = expandedRef[1];
            var picker = h(FamilyPicker, {
                value: entry.stack,
                placeholder: "字体族，多个用逗号分隔",
                compact: true,
                systemFonts: props.systemFonts,
                onChange: props.onChange,
            });
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
                expanded ? h(React.Fragment, null, picker,
                    h("div", { className: "dfl-varEditorActions" }, h("button", {
                        type: "button", className: "dfl-btn", onClick: function () { setExpanded(false); },
                    }, "收起选择器")))
                    : h("div", { className: "dfl-compactPicker" },
                        h("input", {
                            className: "dfl-input", type: "text", "aria-label": props.label + "字体栈",
                            spellCheck: false, placeholder: "字体族，多个用逗号分隔", value: entry.stack,
                            onChange: function (event) { props.onChange(event.target.value); },
                        }),
                        h("button", { type: "button", className: "dfl-btn", onClick: function () { setExpanded(true); } }, "选择字体")),
				props.hint ? h("p", { className: "dfl-hint" }, props.hint) : null);
		}

        function Fold(props) {
            var openRef = React.useState(false);
            var children = React.Children.toArray(props.children);
            return h('details', { className: props.className, open: openRef[0],
                onToggle: function (event) { openRef[1](event.currentTarget.open); } },
                children[0], openRef[0] ? children.slice(1) : null);
        }

		function SlotGroup(props) {
			return h(Fold, { className: "dfl-group" },
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
            var copyStatusRef = React.useState('');
            var copyStatus = copyStatusRef[0], setCopyStatus = copyStatusRef[1];

            // Only the current client session's authorized enumeration is offered.
            var systemRef = React.useState(function () { return sessionFonts; });
            var systemFonts = systemRef[0], setSystemFonts = systemRef[1];
            var fontStatusRef = React.useState(function () { return sessionFonts.length ? '使用本次插件会话已读取的名单；字体可能已变化，可刷新或清除。' : '尚未读取本机字体；可以手动输入字体栈。'; });
            var fontStatus = fontStatusRef[0], setFontStatus = fontStatusRef[1];
            var loadingRef = React.useState(false), loading = loadingRef[0], setLoading = loadingRef[1];
            var request = React.useRef(0);
            React.useEffect(function () { return function () { request.current++; }; }, []);
            var loadSystemFonts = function () {
                if (loading) return;
                if (typeof window.queryLocalFonts !== 'function') {
                    setFontStatus('此客户端不支持读取本机字体，仍可手动输入；不会提供假定已安装的候选。');
                    return;
                }
                var id = ++request.current;
                function cancelled() { return !active.current || id !== request.current; }
                setLoading(true); setFontStatus('正在请求读取权限…');
                // Call before any await to preserve transient user activation.
                var query;
                try { query = window.queryLocalFonts(); }
                catch (error) { query = Promise.reject(error); }
                Promise.resolve(query).then(function (faces) {
                    if (cancelled()) return null;
                    return CP_FONT_CATALOG.enumerate(faces, {
                        cancelled: cancelled,
                        onProgress: function (done, total) { if (!cancelled()) setFontStatus('正在识别字体能力：' + done + ' / ' + total); }
                    });
                }).then(function (entries) {
                    if (cancelled() || entries === null) return;
                    sessionFonts = entries; setSystemFonts(entries); setLoading(false);
                    setFontStatus(entries.length ? '已读取 ' + entries.length + ' 个字体族。分类来自字体文件，不按名称推测；同一字体可属于多个类别。' : '没有读到字体，可以继续手动输入。');
                }).catch(function (error) {
                    if (cancelled()) return;
                    sessionFonts = []; setSystemFonts([]); setLoading(false);
                    setFontStatus('读取失败（' + (error.name || 'Error') + '）：' + (error.message || '权限未授予') + '。可继续手动输入。');
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
                        if (active.current) { setCopied(true); setCopyStatus('CSS 已复制到剪贴板。'); }

                    }, function () { if (active.current) { setCopied(false); setCopyStatus('复制失败，请在上方文本框中手动选择复制。'); } });
				} catch (error) {
                    setCopied(false); setCopyStatus('复制失败，请在上方文本框中手动选择复制。');
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
					h("h3", { className: "dfl-title" }, "字体与字号"),
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

                h("section", { className: "dfl-catalog", "aria-label": "本机字体库" },
                    h("div", { className: "dfl-pickerRow" },
                        h("strong", null, "本机字体库"),
                        h("button", { type: "button", className: "dfl-btn", disabled: loading, onClick: loadSystemFonts }, loading ? "正在读取…" : "读取 / 刷新本机字体"),
                        h("button", { type: "button", className: "dfl-btn", onClick: function () {
                            request.current++; sessionFonts = []; setSystemFonts([]); setLoading(false);
                            setFontStatus('已清除本次读取的名单；已选字体配置不变。');
                        } }, "清除已读取名单")),
                    h("p", { className: "dfl-hint", role: "status" }, fontStatus),
                    h("p", { className: "dfl-hint" }, "仅在点击后读取，字体文件只在本页解析，不上传、不保存字体清单。中文为常用简繁汉字抽样；等宽检测全部可打印 ASCII（含空格、标点）。仅各已枚举字面均满足时归类，差异或读取失败归入未完整识别；不保证汉字双宽或变体实例。")),
				h("div", { className: "dfl-global" },
					h("div", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "全局字体（界面与会话正文）"),
						h(FamilyPicker, {
							value: state.globalFamily,
							placeholder: "留空则不覆盖；也可在下拉里选字体后点「添加」",
							systemFonts: systemFonts,
							onChange: function (value) { patchState({ globalFamily: value, master: true }); },
						})),
					h("div", { className: "dfl-field" },
						h("span", { className: "dfl-fieldLabel" }, "等宽字体（代码、工具输出、终端）"),
						h(FamilyPicker, {
							value: state.globalMono,
                            mono: true,
							placeholder: "留空则不覆盖；也可在下拉里选字体后点「添加」",
							systemFonts: systemFonts,
							onChange: function (value) { patchState({ globalMono: value, master: true }); },
						})),
					h("p", { className: "dfl-hint", role: "status" }, store.getError()),
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
                                    'aria-pressed': Number(state.uiScale) === scale,
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

                h("div", { className: "dfl-actions" },
                    h("button", { type: "button", className: "dfl-btn", title: "包括高级槽位与自定义选择器规则", onClick: restoreDefaults }, "清除全部字体设置")),

				h(Fold, { className: "dfl-group" },
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
								onToggle: function (on) { onVar(slot.name, { on: on }); },
								onChange: function (stack) { onVar(slot.name, { stack: stack, on: true }); },
							});
						})),
					h(SlotGroup, { title: "字号档位", slots: SIZE_SLOTS, state: state, onVar: onVar, systemFonts: systemFonts }),
					h(SlotGroup, { title: "Markdown 各级", slots: MARKDOWN_SLOTS, state: state, onVar: onVar, systemFonts: systemFonts }),
					h(Fold, { className: "dfl-group" },
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

				h(Fold, { className: "dfl-group" },
					h("summary", null, "导出 / 固化"),
					h("div", { className: "dfl-rows" },
						h("p", { className: "dfl-hint" }, "下面是当前生效的 CSS。想脱离本插件固化，可把等价设置写进 profile patch 的 ui-theme 条目（textFontFamily / codeFontFamily / terminalFontFamily），或放进任意自定义 CSS 注入点。"),
						h("textarea", { className: "dfl-export", readOnly: true, value: css, spellCheck: false }),
						h("button", { type: "button", className: "dfl-btn", onClick: copyCss }, copied ? "已复制" : "复制 CSS"),
                        h("p", { className: "dfl-hint", role: "status" }, copyStatus))));
		}


return FontLabSection;
}
