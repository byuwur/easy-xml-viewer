"use strict";
/*
 * File: xml.js
 * Desc: Standalone XML.view. No runtime dependencies.
 * Copyright (c) 2026 Andres Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/xml.view
 * MIT License (see LICENSE).
 */
(function (global) {
  // ===== INITIALIZATION =====
  if (global.byXMLviewer?.initialized) return;

  // ===== METADATA =====
  byXMLviewer.VERSION = "2.2"; // 2026-11-20
  // Mirrored helpers are checked by code.view/.github/scripts/check-family.mjs.
  const componentName = "XML.view";
  const themeFile = "xml";
  const documentClass = "byXMLdocument";
  const contentSelector = ":scope > .byVIEWcontent";

  // ===== STATE =====
  const instances = new WeakMap();
  // ===== HELPERS =====
  const node = (tag, className = "", text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };
  const button = (parent, text, label, action) => {
    const control = node("button", "", text);
    control.type = "button";
    control.title = label;
    control.setAttribute("aria-label", label);
    control.addEventListener("click", action);
    parent.appendChild(control);
    return control;
  };
  const copyButton = (parent, getText, label = "Copy source", text = "Copy") => {
    const control = button(parent, text, label, async () => {
      control.disabled = true;
      try {
        await navigator.clipboard.writeText(getText());
        control.textContent = "Copied!";
        control.dataset.state = "success";
      } catch {
        control.textContent = "Failed";
        control.dataset.state = "error";
        control.title = "Copy failed. Check clipboard access.";
      } finally {
        control.disabled = false;
      }
    });
    control.setAttribute("aria-live", "polite");
    const reset = () => {
      if (control.dataset.state === "error") return;
      delete control.dataset.state;
      control.textContent = text;
      control.title = label;
    };
    control.addEventListener("mouseleave", reset);
    control.addEventListener("focusout", reset);
    return control;
  };
  // Yield at a chunk boundary so input events and replacement renders can run.
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

  // ===== APPEARANCE =====
  const extraPalettes = new Set([
    "dracula",
    "darcula",
    "nord",
    "catppuccin",
    "catppuccin-frappe",
    "catppuccin-macchiato",
    "rose-pine",
    "rose-pine-moon",
    "gruvbox",
    "gruvbox-material",
    "tokyo-night",
    "tokyo-storm",
    "tokyo-moon",
    "one",
    "material",
    "material-ocean",
    "night-owl",
    "synthwave",
    "ayu",
    "everforest",
    "kanagawa",
    "selenized",
    "vscode",
    "monokai-dimmed",
    "discord",
    "slack",
    "bonyur",
    "sakura",
    "bubblegum",
    "candy",
    "rose-gold",
    "lavender",
    "cyberpunk",
    "sunset",
    "volcano",
    "amber",
    "terminal",
    "paper",
    "ink",
    "ocean",
    "forest",
    "mint",
    "ice",
    "sepia"
  ]);
  const warnedPalettes = new Set();
  const warnMissingThemes = (element, palette = element.dataset.theme) => {
    if (!extraPalettes.has(palette) || warnedPalettes.has(palette)) return;
    const document = element.ownerDocument;
    if (document.defaultView.getComputedStyle(document.documentElement).getPropertyValue(`--by-${themeFile}-themes-loaded`).trim() === "1") return;
    warnedPalettes.add(palette);
    console.warn(`${componentName}: Palette "${palette}" requires ${themeFile}.themes.css. Import it after ${themeFile}.css. https://${themeFile}.byuwur.co/`);
  };

  const getLocalTheme = (target) => {
    if (["light", "dark"].includes(target.dataset.theme)) return target.dataset.theme;
    if (target.classList.contains("dark")) return "dark";
    if (target.classList.contains("light")) return "light";
    return target.dataset.theme ? "light" : null;
  };

  const setLocalTheme = (element, mode, palette) => {
    element.classList.toggle("light", mode === "light");
    element.classList.toggle("dark", mode === "dark");
    if (palette != null) element.dataset.theme = palette;
    else if (["light", "dark"].includes(element.dataset.theme)) element.dataset.theme = mode;
  };

  // Explicit appearance options override markup; omitted values preserve the container's state.
  const applyAppearance = (element, options) => {
    const { theme, palette, fontSize } = options;
    if (theme != null && !["light", "dark"].includes(theme)) throw new RangeError("Theme must be light or dark.");
    if (palette != null && (typeof palette !== "string" || !/^[a-z][\w-]*$/i.test(palette) || ["light", "dark"].includes(palette))) throw new RangeError("Palette must be a CSS theme name; use theme for light or dark.");
    warnMissingThemes(element, palette ?? element.dataset.theme);
    const size = typeof fontSize === "number" ? `${Math.max(0.5, Math.min(3, fontSize))}rem` : typeof fontSize === "string" ? `clamp(0.5rem, ${fontSize}, 3rem)` : "";
    if (fontSize != null && (typeof fontSize === "number" ? !Number.isFinite(fontSize) : typeof fontSize !== "string" || !CSS.supports("font-size", size))) throw new RangeError("Font size must be a finite multiplier or a CSS size.");
    // Keep palette identity in data-theme while light/dark classes select its mode.
    if (theme != null || palette != null) setLocalTheme(element, theme ?? getLocalTheme(element) ?? "light", palette);
    return size;
  };

  const applyContentAppearance = (element, options, content) => {
    const size = applyAppearance(element, options);
    const previous = element.querySelector(contentSelector);
    content.style.fontSize = size || previous?.style.fontSize || "";
    content.dataset.byViewDefaultFontSize = size || previous?.dataset.byViewDefaultFontSize || "";
  };

  const syncMotion = (element, options) => {
    const enabled = options.animations !== false;
    const appear = enabled && Boolean(options.appearAnimation);
    element.classList.toggle("byVIEWmotion", enabled);
    element.classList.toggle("byVIEWappear", appear);
    return appear;
  };

  // ===== CONTROLS =====
  // Mirrored across the family so each viewer can run without a shared runtime.
  const createThemeButton = () => {
    const button = node("button", "byVIEWthemeToggle");
    button.type = "button";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
    return button;
  };

  /**
   * Adds container light/dark controls, retaining legacy stylesheet links as a fallback.
   * @param {HTMLElement} element Viewer container and theme owner.
   * @param {HTMLElement} controls Toolbar control group.
   * @returns {{button: HTMLButtonElement, sync: Function}} Mounted theme control.
   */
  const appendThemeToggle = (element, controls) => {
    const themePattern = new RegExp(`^([^?#]*/)?${themeFile}\\.(light|dark)\\.css([?#].*)?$`, "i");
    const stylesheet = [document.getElementById("byVIEWtheme"), ...document.querySelectorAll('link[rel~="stylesheet"]')].find((link) => link && themePattern.test(link.getAttribute("href") || ""));
    const legacyTheme = () => (stylesheet?.isConnected ? (stylesheet.getAttribute("href") || "").match(themePattern) : null);
    const getTheme = () => getLocalTheme(element) || legacyTheme()?.[2].toLowerCase() || "light";
    const button = createThemeButton();
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      const toggles = !getLocalTheme(element) && legacyTheme() ? [button, ...document.querySelectorAll(`.${documentClass} > .byVIEWtoolbar > .byVIEWcontrols > .byVIEWthemeToggle`)] : [button];
      for (const toggle of toggles) {
        // A legacy link must not change the controls of independently themed viewers.
        if (toggle !== button && getLocalTheme(toggle.closest(`.${documentClass}`))) continue;
        toggle.title = `Switch to ${next} theme`;
        toggle.setAttribute("aria-label", toggle.title);
      }
    };
    button.addEventListener("click", () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      if (!getLocalTheme(element) && legacyTheme()) {
        const href = stylesheet.getAttribute("href");
        stylesheet.setAttribute(
          "href",
          href.replace(themePattern, (_, path = "", theme, suffix = "") => `${path}${themeFile}.${next}.css${suffix}`)
        );
      } else {
        // Preserve attribute-only themes and keep existing mode classes in sync.
        const palette = element.dataset.theme;
        if (!element.matches(".light, .dark") && (!palette || ["light", "dark"].includes(palette))) element.dataset.theme = next;
        else setLocalTheme(element, next, palette === "" ? next : undefined);
      }
      sync();
    });
    button.addEventListener("focus", sync);
    button.addEventListener("pointerenter", sync);
    sync();
    controls.appendChild(button);
    return { button, sync };
  };

  /**
   * Adds text size controls for a renderer.
   * @param {HTMLElement} element - Renderer whose font size is changed.
   * @param {HTMLElement} controls - Toolbar that receives the controls.
   * @return {{group: HTMLElement, sync: Function}} Mounted text size controls.
   */
  const appendFontSizeControls = (element, controls) => {
    const sizes = document.createElement("div");
    sizes.className = "byVIEWfontSizes";
    controls.appendChild(sizes);
    const getSize = () => (parseFloat(getComputedStyle(element).fontSize) || 16) / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const decrease = document.createElement("button");
    const increase = document.createElement("button");
    const reset = document.createElement("button");
    reset.textContent = "A";
    decrease.textContent = "A-";
    increase.textContent = "A+";
    for (const [button, title] of [
      [decrease, "Decrease text size"],
      [reset, "Reset text size"],
      [increase, "Increase text size"]
    ]) {
      button.type = "button";
      button.className = "byVIEWfontSize";
      button.title = title;
      button.setAttribute("aria-label", title);
      sizes.appendChild(button);
    }
    const sync = () => {
      const size = getSize();
      decrease.disabled = size <= 0.5;
      increase.disabled = size >= 3;
    };
    for (const [button, step] of [
      [decrease, -0.125],
      [increase, 0.125]
    ]) {
      button.addEventListener("click", () => {
        const size = Math.max(0.5, Math.min(3, getSize() + step));
        element.style.fontSize = `${size}rem`;
        sync();
      });
    }
    reset.addEventListener("click", () => {
      element.style.fontSize = element.dataset.byViewDefaultFontSize;
      sync();
    });
    sync();
    return { group: sizes, sync };
  };

  /**
   * Add a copy action for the complete source, including content outside the visible rendered chunk.
   * @param {HTMLElement} controls Toolbar control group.
   * @param {Function} getText Callback that returns the text to copy.
   * @param {string} label Human-readable label.
   * @returns {void}
   */
  const appendCopyButton = (controls, getText, label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWcopy";
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" aria-hidden="true" focusable="false"><!--!Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M288 64C252.7 64 224 92.7 224 128L224 384C224 419.3 252.7 448 288 448L480 448C515.3 448 544 419.3 544 384L544 183.4C544 166 536.9 149.3 524.3 137.2L466.6 81.8C454.7 70.4 438.8 64 422.3 64L288 64zM160 192C124.7 192 96 220.7 96 256L96 512C96 547.3 124.7 576 160 576L352 576C387.3 576 416 547.3 416 512L416 496L352 496L352 512L160 512L160 256L176 256L176 192L160 192z"/></svg>`;
    const caption = document.createElement("span");
    caption.setAttribute("aria-live", "polite");
    button.appendChild(caption);
    const reset = () => {
      if (button.dataset.state === "error") return;
      delete button.dataset.state;
      caption.textContent = "Copy";
      button.title = label;
      button.setAttribute("aria-label", label);
    };
    reset();
    button.addEventListener("mouseleave", reset);
    button.addEventListener("focusout", reset);
    controls.appendChild(button);
    button.addEventListener("click", async (event) => {
      button.disabled = true;
      let message = "Copied!";
      try {
        await navigator.clipboard.writeText(getText(event));
        caption.textContent = message;
        button.dataset.state = "success";
      } catch {
        caption.textContent = "Failed";
        button.dataset.state = "error";
        message = "Copy failed. Check clipboard access.";
      } finally {
        button.disabled = false;
        button.title = `${message} ${label}`;
        button.setAttribute("aria-label", button.title);
      }
    });
    return button;
  };

  // Keep the toolbar mounted while the current renderer applies option changes.
  const mountControls = (element, content, initialOptions, getText, version, copyLabel = "Copy source") => {
    const toolbar = node("div", "byVIEWtoolbar");
    const controls = node("div", "byVIEWcontrols");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Viewer controls");
    const info = node("small", "byVIEWinfo");
    for (const [text, href] of [
      [componentName, `https://github.com/byuwur/${themeFile}.view`],
      ["@byUwUr", "https://byuwur.co"]
    ]) {
      const link = node("a", "", text);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (info.childNodes.length) info.append(` · v${version} · `);
      info.appendChild(link);
    }
    const theme = appendThemeToggle(element, controls);
    const sizes = appendFontSizeControls(content, controls);
    const copy = appendCopyButton(controls, getText, copyLabel);
    const update = (options, changes = {}) => {
      if ("fontSize" in changes || "theme" in changes || "palette" in changes) {
        applyContentAppearance(element, changes, content);
        theme.sync();
        sizes.sync();
      }
      Object.assign(options, changes);
      if ("animations" in changes || "appearAnimation" in changes) syncMotion(element, options);
      element.classList.toggle("byVIEWcompact", options.controlsCompact !== false);
      const bottom = options.controlsPosition === "bottom";
      toolbar.dataset.size = ["xs", "small", "regular", "large", "xl"].includes(options.controlsSize) ? options.controlsSize : "regular";
      if (!toolbar.childElementCount || ["credits", "themeToggle", "fontSizeControls", "copyButton"].some((key) => key in changes)) {
        controls.replaceChildren();
        if (options.themeToggle !== false) controls.appendChild(theme.button);
        if (options.fontSizeControls !== false) controls.appendChild(sizes.group);
        if (options.copyButton !== false) controls.appendChild(copy);
        toolbar.replaceChildren();
        if (options.credits !== false) toolbar.appendChild(info);
        if (controls.childElementCount) toolbar.appendChild(controls);
      }
      const visible = options.toolbar !== false && toolbar.childElementCount > 0;
      element.classList.toggle("byVIEWbottom", visible && bottom);
      if (!visible) toolbar.remove();
      else if (bottom && toolbar !== element.lastElementChild) element.appendChild(toolbar);
      else if (!bottom && toolbar !== element.firstElementChild) element.prepend(toolbar);
    };
    update(initialOptions);
    return update;
  };

  // ===== RENDERING =====
  const xmlRecords = (document, options) => {
    const { showWhitespace = false } = options;
    if (!document) return [];
    const records = [],
      stack = [];
    // Push siblings in reverse so the stack emits records in document order without recursive traversal.
    for (let child = document.lastChild; child; child = child.previousSibling) stack.push({ value: child, parent: null });
    while (stack.length) {
      const record = stack.pop(),
        value = record.value;
      if (value.nodeType === 3 && !showWhitespace && !value.nodeValue.trim()) continue;
      record.index = records.length;
      // Index names, text, and attributes once; filtering can then retain the ancestor path of each match.
      record.search = [value.nodeName, value.nodeValue ?? "", ...Array.from(value.attributes || [], (attribute) => `${attribute.name}=${attribute.value}`)].join(" ").toLowerCase();
      records.push(record);
      for (let child = value.lastChild; child; child = child.previousSibling) stack.push({ value: child, parent: record });
    }
    return records;
  };

  // ===== LIFECYCLE =====
  // Replace the previous owner and return its cancellable state. Only the current owner may clear the host.
  const mount = (element, options, getText, previous) => {
    if (!(element instanceof HTMLElement)) throw new TypeError("byXMLviewer: element must be an HTMLElement.");
    // Validate appearance before disposing the current instance, so invalid options leave it usable.
    const content = node("div", "byVIEWcontent");
    if (!previous) applyContentAppearance(element, options, content);
    const painted = element.classList.contains("byVIEWready");
    if (previous) {
      previous.active = false;
      cancelAnimationFrame(previous.motionFrame);
    } else instances.get(element)?.destroy();
    const state = { active: true, getText, content, mountedContent: previous?.mountedContent ?? content, api: previous?.api ?? {} };
    state.destroy = () => {
      if (!state.active) return;
      state.active = false;
      cancelAnimationFrame(state.motionFrame);
      // An old controller must not clear a replacement mounted on the same element.
      if (instances.get(element) === state) {
        instances.delete(element);
        element.replaceChildren();
        element.classList.remove(documentClass, "byVIEWplain", "byVIEWcompact", "byVIEWbottom", "byVIEWmotion", "byVIEWappear", "byVIEWready");
        element.removeAttribute("aria-busy");
      }
    };
    instances.set(element, state);
    state.error = (error) => {
      if (!state.active) return;
      element.setAttribute("aria-busy", "false");
      const message = node("p", "byVIEWerror", error.message);
      message.setAttribute("role", "alert");
      state.content.replaceChildren(message);
    };
    if (previous) {
      element.classList.add("byVIEWready");
      state.updateControls = previous.updateControls;
      return state;
    }
    element.replaceChildren();
    element.classList.add(documentClass);
    element.classList.toggle("byVIEWplain", options.displayContainer === false);
    const appear = syncMotion(element, options);
    if (painted && !appear) element.classList.add("byVIEWready");
    else {
      // Paint opacity 0 before starting each requested fade.
      element.classList.remove("byVIEWready");
      state.motionFrame = requestAnimationFrame(() => {
        state.motionFrame = requestAnimationFrame(() => {
          if (state.active) element.classList.add("byVIEWready");
        });
      });
    }
    element.appendChild(content);
    state.updateControls = mountControls(element, content, options, (event) => instances.get(element).getText(event), byXMLviewer.VERSION);
    return state;
  };

  // ===== PUBLIC API =====
  // Parse an inert XML document and render elements/attributes as text, with cancellable chunked DOM creation.
  function byXMLviewer(element, source, options = {}) {
    return renderViewer(element, source, options);
  }

  function renderViewer(element, source, options, previous) {
    if (source === undefined) source = element?.textContent ?? "";
    options = { ...options };
    const { search: showSearch = false, copyNodes = false, copyValues = false, expandCollapse = false, collapsible = true } = options;
    const state = mount(element, options, () => source, previous);
    const actions = node("div", "byVIEWactions");
    const search = node("input");
    search.type = "search";
    search.placeholder = "Search XML";
    search.setAttribute("aria-label", "Search XML");
    if (showSearch) actions.appendChild(search);
    const status = node("p", "byVIEWstatus", "Parsing...");
    status.setAttribute("role", "status");
    const tree = node("div", "byXMLtree");
    if (expandCollapse && collapsible)
      button(actions, "Expand all", "Expand all XML nodes", () =>
        tree.querySelectorAll("details").forEach((details) => {
          details.open = true;
        })
      );
    if (expandCollapse && collapsible)
      button(actions, "Collapse all", "Collapse all XML nodes", () =>
        tree.querySelectorAll("details").forEach((details) => {
          details.open = false;
        })
      );
    const panel = node("div", "byVIEWpanel");
    panel.append(status, tree);
    state.content.append(actions, panel);
    const serializer = new XMLSerializer();
    let records = [],
      generation = 0;
    // ===== RENDERING =====
    const render = async () => {
      const version = ++generation;
      element.setAttribute("aria-busy", "true");
      const query = search.value.toLowerCase(),
        included = new Set();
      let matches = 0;
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (!query || record.search.includes(query)) {
          matches++;
          // Keep ancestor paths so matching descendants remain navigable in the filtered tree.
          for (let current = record; current && !included.has(current); current = current.parent) included.add(current);
        }
        if (i % 1000 === 0) {
          await pause();
          if (!state.active || version !== generation) return false;
        }
      }
      const root = document.createDocumentFragment(),
        containers = new Map();
      const declaration = typeof source === "string" ? source.match(/^\uFEFF?\s*(<\?xml\s[\s\S]*?\?>)/)?.[1] : null;
      if (declaration && !query) root.appendChild(node("div", "byXMLpi", declaration));
      let count = 0;
      for (const record of records) {
        if (!included.has(record)) continue;
        const value = record.value;
        const parent = record.parent ? containers.get(record.parent) : root;
        if (value.nodeType === 1) {
          // Native details/summary provide keyboard disclosure behavior; a noncollapsible tree uses plain containers.
          const details = node(!collapsible ? "div" : "details", "byXMLnode");
          details.open = Boolean(query) || !options.collapsed;
          const summary = node(!collapsible ? "div" : "summary", "byXMLheader");
          summary.appendChild(node("span", "byXMLtag", `<${value.nodeName}`));
          for (const attribute of value.attributes) {
            summary.append(" ", node("span", "byXMLattribute", attribute.name), "=", node("span", "byXMLvalue", JSON.stringify(attribute.value)));
          }
          summary.appendChild(node("span", "byXMLtag", value.childNodes.length ? ">" : " />"));
          if (copyNodes) {
            copyButton(summary, () => serializer.serializeToString(value), "Copy XML node", "Copy node");
          }
          if (copyValues) copyButton(summary, () => value.textContent, "Copy XML value", "Copy value");
          const children = node("div", "byXMLchildren");
          details.append(summary, children);
          if (value.childNodes.length) details.appendChild(node("div", "byXMLtag", `</${value.nodeName}>`));
          parent.appendChild(details);
          containers.set(record, children);
        } else {
          const line = node("div", "byXMLleaf");
          let text = value.nodeValue ?? "",
            className = "byXMLvalue";
          if (value.nodeType === 8) {
            text = `<!--${text}-->`;
            className = "byXMLcomment";
          } else if (value.nodeType === 4) {
            text = `<![CDATA[${text}]]>`;
            className = "byXMLcdata";
          } else if (value.nodeType === 7) {
            text = `<?${value.nodeName}${text ? ` ${text}` : ""}?>`;
            className = "byXMLpi";
          }
          line.appendChild(node("span", className, text));
          if (copyValues) copyButton(line, () => value.nodeValue ?? "", "Copy XML value", "Copy value");
          parent.appendChild(line);
        }
        if (++count % 100 === 0) {
          await pause();
          if (!state.active || version !== generation) return false;
        }
      }
      if (!state.active || version !== generation) return false;
      // Publish the complete fragment only after cancellation checks; stale searches cannot replace it.
      tree.replaceChildren(root);
      state.syncStatus = () => {
        status.hidden = options.statusBar === false && records.length > 0 && (!query || matches > 0);
      };
      state.syncStatus();
      status.textContent = records.length ? (query ? `${matches} matching nodes` : `${records.length} nodes`) : "No XML document.";
      element.setAttribute("aria-busy", "false");
      return true;
    };
    search.addEventListener("input", () => render().catch(state.error));
    element.setAttribute("aria-busy", "true");
    state.ready = (async () => {
      try {
        await pause();
        if (!state.active) return false;
        records = xmlRecords(byXMLviewer.parse(source), options);
        return await render();
      } catch (error) {
        state.error(error);
        return false;
      }
    })();
    if (previous) {
      // Publish the replacement together so the current document stays visible while rendering.
      state.ready = state.ready.then((result) => {
        if (!state.active) return false;
        const current = state.mountedContent.querySelector(".byXMLtree");
        const left = current?.scrollLeft ?? 0;
        const top = current?.scrollTop ?? 0;
        state.mountedContent.replaceChildren(...state.content.childNodes);
        state.content = state.mountedContent;
        state.content.querySelector(".byXMLtree")?.scrollTo(left, top);
        return result;
      });
    }
    Object.assign(state.api, {
      ready: state.ready,
      destroy: state.destroy,
      setOptions(changes) {
        if (!state.active) return;
        const redraw = ["collapsible", "showWhitespace", "search", "copyNodes", "expandCollapse", "copyValues"].some((key) => key in changes && changes[key] !== options[key]);
        state.updateControls(options, changes);
        if ("displayContainer" in changes) element.classList.toggle("byVIEWplain", changes.displayContainer === false);
        if (Object.hasOwn(changes, "statusBar")) state.syncStatus?.();
        if ("collapsed" in changes) {
          for (const branch of tree.querySelectorAll("details")) branch.open = Boolean(search.value) || !options.collapsed;
        }
        if (redraw) {
          return renderViewer(element, source, options, state).ready;
        }
      }
    });
    return state.api;
  }

  byXMLviewer.parse = (source) => {
    if (typeof source !== "string") throw new TypeError("XML input must be a string.");
    if (source.length > 2000000) throw new RangeError("XML exceeds 2 million characters.");
    if (!source.trim()) return null;
    // Reject DTDs before parsing, including external entities, but allow declaration-like text in comments/CDATA.
    for (let i = source.indexOf("<"); i !== -1; i = source.indexOf("<", i + 1)) {
      const end = source.startsWith("<!--", i) ? "-->" : source.startsWith("<![CDATA[", i) ? "]]>" : source.startsWith("<?", i) ? "?>" : null;
      if (end) {
        const close = source.indexOf(end, i + 2);
        i = close < 0 ? source.length : close + end.length - 1;
      } else if (/^<!DOCTYPE\b/i.test(source.slice(i, i + 10))) throw new SyntaxError("DTD/DOCTYPE declarations are not supported. External resources are never loaded.");
    }
    // This document stays detached. Only its text/attributes are copied into viewer-owned HTML.
    const document = new DOMParser().parseFromString(source, "application/xml");
    // Browser engines place XML parse errors in different namespaces; ordinary elements named parsererror are valid.
    const error = ["http://www.mozilla.org/newlayout/xml/parsererror.xml", "http://www.w3.org/1999/xhtml"].map((namespace) => document.getElementsByTagNameNS(namespace, "parsererror")[0]).find(Boolean);
    if (error) throw new SyntaxError(error.textContent.trim());
    // Enforce depth and node budgets before building viewer records or HTML.
    const stack = [{ value: document, depth: 0 }];
    let count = 0;
    while (stack.length) {
      const { value, depth } = stack.pop();
      if (++count > 50000) throw new RangeError("XML exceeds 50,000 nodes.");
      if (depth > 256) throw new RangeError("XML exceeds 256 nesting levels.");
      for (let child = value.lastChild; child; child = child.previousSibling) stack.push({ value: child, depth: depth + 1 });
    }
    return document;
  };

  // ===== EXPORT =====
  global.byXMLviewer = byXMLviewer;
  byXMLviewer.initialized = true;
})(typeof window !== "undefined" ? window : this);
