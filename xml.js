"use strict";
/*
 * File: xml.js
 * Desc: Standalone XML viewer. No runtime dependencies.
 * Copyright (c) 2026 Andres Trujillo [Mateus] byUwUr
 * https://github.com/byuwur/easy-xml-viewer
 * MIT License (see LICENSE).
 */
(function (global) {
  /* --- SETUP --- */
  if (global.byXMLviewer?.initialized) return;
  const instances = new WeakMap();
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
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

  /* --- CONTROLS --- */
  /**
   * Adds container light/dark controls, retaining legacy stylesheet links as a fallback.
   * @param {HTMLElement} element Viewer container and theme owner.
   * @param {HTMLElement} controls Toolbar control group.
   * @param {string} filename Legacy theme stylesheet basename.
   * @returns {HTMLButtonElement} Theme toggle button.
   */
  const appendThemeToggle = (element, controls, filename) => {
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const themePattern = new RegExp(`^([^?#]*/)?${escapedFilename}\\.(light|dark)\\.css([?#].*)?$`, "i");
    const stylesheet = [document.getElementById("byVIEWtheme"), ...document.querySelectorAll('link[rel~="stylesheet"]')].find(
      (link) => link && themePattern.test(link.getAttribute("href") || "")
    );
    // Explicit container state takes precedence over a shared legacy stylesheet.
    const localTheme = (target) => {
      if (["light", "dark"].includes(target.dataset.theme)) return target.dataset.theme;
      if (target.classList.contains("dark")) return "dark";
      if (target.classList.contains("light")) return "light";
      return target.dataset.theme ? "light" : null;
    };
    const legacyTheme = () => (stylesheet?.isConnected ? (stylesheet.getAttribute("href") || "").match(themePattern) : null);
    const getTheme = () => localTheme(element) || legacyTheme()?.[2].toLowerCase() || "light";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "byVIEWthemeToggle";
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
    const sync = () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      const toggles =
        !localTheme(element) && legacyTheme() ? [button, ...document.querySelectorAll(".byXMLdocument > .byVIEWtoolbar > .byVIEWcontrols > .byVIEWthemeToggle")] : [button];
      for (const toggle of toggles) {
        // A legacy link must not change the controls of independently themed viewers.
        if (toggle !== button && localTheme(toggle.closest(".byXMLdocument"))) continue;
        toggle.title = `Switch to ${next} theme`;
        toggle.setAttribute("aria-label", toggle.title);
      }
    };
    button.addEventListener("click", () => {
      const next = getTheme() === "dark" ? "light" : "dark";
      if (!localTheme(element) && legacyTheme()) {
        const href = stylesheet.getAttribute("href");
        stylesheet.setAttribute(
          "href",
          href.replace(themePattern, (_, path = "", theme, suffix = "") => `${path}${filename}.${next}.css${suffix}`)
        );
      } else if (element.dataset.theme && !["light", "dark"].includes(element.dataset.theme)) {
        // Named palettes stay selected while only the mode changes.
        element.classList.toggle("light", next === "light");
        element.classList.toggle("dark", next === "dark");
      } else if (element.hasAttribute("data-theme") || (!element.classList.contains("light") && !element.classList.contains("dark"))) {
        element.dataset.theme = next;
      } else {
        element.classList.toggle("light", next === "light");
        element.classList.toggle("dark", next === "dark");
      }
      sync();
    });
    button.addEventListener("focus", sync);
    button.addEventListener("pointerenter", sync);
    sync();
    return controls.appendChild(button);
  };

  /**
   * Adds text size controls for a renderer.
   * @param {HTMLElement} element - Renderer whose font size is changed.
   * @param {HTMLElement} controls - Toolbar that receives the controls.
   * @return {HTMLElement} The text size button group.
   */
  const appendFontSizeControls = (element, controls) => {
    element.dataset.byViewDefaultFontSize ??= element.style.fontSize;
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
    return sizes;
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
  };

  /* --- LIFECYCLE --- */
  // One instance owns the container; replacement disposes its pending work first.
  const mount = (element, options, getText) => {
    if (!(element instanceof HTMLElement)) throw new TypeError("byXMLviewer: element must be an HTMLElement.");
    instances.get(element)?.destroy();
    const state = { active: true };
    state.destroy = () => {
      if (!state.active) return;
      state.active = false;
      if (instances.get(element) === state) {
        instances.delete(element);
        element.replaceChildren();
        element.classList.remove("byXMLdocument", "byVIEWcompact", "byVIEWbottom");
        element.removeAttribute("aria-busy");
      }
    };
    instances.set(element, state);
    element.replaceChildren();
    element.classList.add("byXMLdocument");
    element.classList.toggle("byVIEWcompact", options.controlsCompact !== false);
    element.classList.toggle("byVIEWbottom", options.controlsPosition === "bottom");
    const content = node("div", "byVIEWcontent");
    const toolbar = node("div", "byVIEWtoolbar");
    toolbar.dataset.size = ["small", "regular", "large"].includes(options.controlsSize) ? options.controlsSize : "regular";
    const info = node("small", "byVIEWinfo");
    for (const [text, href] of [
      ["easy-xml-viewer", "https://github.com/byuwur/easy-xml-viewer"],
      ["@byUwUr", "https://byuwur.co"]
    ]) {
      const link = node("a", "", text);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (info.childNodes.length) info.append(` · v${byXMLviewer.VERSION} · `);
      info.appendChild(link);
    }
    if (options.credits !== false) toolbar.appendChild(info);
    const controls = node("div", "byVIEWcontrols");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Viewer controls");
    if (options.themeToggle !== false) appendThemeToggle(element, controls, "xml");
    if (options.fontSizeControls !== false) appendFontSizeControls(element, controls);
    if (options.copyButton !== false) appendCopyButton(controls, getText, "Copy source");
    if (controls.childNodes.length) toolbar.appendChild(controls);
    if (options.toolbar === false || !toolbar.childNodes.length) {
      element.classList.remove("byVIEWbottom");
      element.appendChild(content);
    } else element.append(...(options.controlsPosition === "bottom" ? [content, toolbar] : [toolbar, content]));
    state.content = content;
    state.error = (error) => {
      if (!state.active) return;
      element.setAttribute("aria-busy", "false");
      const message = node("p", "byVIEWerror", error.message);
      message.setAttribute("role", "alert");
      content.replaceChildren(message);
    };
    return state;
  };

  /* --- CONTENT --- */
  const parseXML = (source) => {
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
    const document = new DOMParser().parseFromString(source, "application/xml");
    const error = ["http://www.mozilla.org/newlayout/xml/parsererror.xml", "http://www.w3.org/1999/xhtml"]
      .map((namespace) => document.getElementsByTagNameNS(namespace, "parsererror")[0])
      .find(Boolean);
    if (error) throw new SyntaxError(error.textContent.trim());
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
  const xmlRecords = (document, options) => {
    if (!document) return [];
    const records = [],
      stack = [];
    for (let child = document.lastChild; child; child = child.previousSibling) stack.push({ value: child, parent: null });
    while (stack.length) {
      const record = stack.pop(),
        value = record.value;
      if (value.nodeType === 3 && options.showWhitespace !== true && !value.nodeValue.trim()) continue;
      record.index = records.length;
      record.search = [value.nodeName, value.nodeValue ?? "", ...Array.from(value.attributes || [], (attribute) => `${attribute.name}=${attribute.value}`)].join(" ").toLowerCase();
      records.push(record);
      for (let child = value.lastChild; child; child = child.previousSibling) stack.push({ value: child, parent: record });
    }
    return records;
  };

  /** Parse an inert XML document and render elements/attributes as text, with cancellable chunked DOM creation. */
  /* --- PUBLIC API --- */
  function byXMLviewer(element, source, options = {}) {
    if (source === undefined) source = element?.textContent ?? "";
    options = { collapsed: false, search: false, copyNodes: false, copyValues: false, showWhitespace: false, ...options };
    const state = mount(element, options, () => source);
    const actions = node("div", "byVIEWactions");
    const search = node("input");
    search.type = "search";
    search.placeholder = "Search XML";
    search.setAttribute("aria-label", "Search XML");
    if (options.search !== false) actions.appendChild(search);
    const status = node("p", "byVIEWstatus", "Parsing…");
    status.setAttribute("role", "status");
    const tree = node("div", "byXMLtree");
    if (options.expandCollapse === true && options.collapsible !== false) button(actions, "Expand all", "Expand all XML nodes", () =>
      tree.querySelectorAll("details").forEach((details) => {
        details.open = true;
      })
    );
    if (options.expandCollapse === true && options.collapsible !== false) button(actions, "Collapse all", "Collapse all XML nodes", () =>
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
          const details = node(options.collapsible === false ? "div" : "details", "byXMLnode");
          details.open = Boolean(query) || !options.collapsed;
          const summary = node(options.collapsible === false ? "div" : "summary", "byXMLheader");
          summary.appendChild(node("span", "byXMLtag", `<${value.nodeName}`));
          for (const attribute of value.attributes) {
            summary.append(" ", node("span", "byXMLattribute", attribute.name), "=", node("span", "byXMLvalue", JSON.stringify(attribute.value)));
          }
          summary.appendChild(node("span", "byXMLtag", value.childNodes.length ? ">" : " />"));
          if (options.copyNodes !== false) {
            copyButton(summary, () => serializer.serializeToString(value), "Copy XML node", "Copy node");
          }
          if (options.copyValues === true) copyButton(summary, () => value.textContent, "Copy XML value", "Copy value");
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
          if (options.copyValues === true) copyButton(line, () => value.nodeValue ?? "", "Copy XML value", "Copy value");
          parent.appendChild(line);
        }
        if (++count % 100 === 0) {
          await pause();
          if (!state.active || version !== generation) return false;
        }
      }
      if (!state.active || version !== generation) return false;
      tree.replaceChildren(root);
      status.hidden = options.statusBar === false && records.length > 0 && (!query || matches > 0);
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
        records = xmlRecords(parseXML(source), options);
        return await render();
      } catch (error) {
        state.error(error);
        return false;
      }
    })();
    return { ready: state.ready, destroy: state.destroy };
  }

  global.byXMLviewer = byXMLviewer;
  byXMLviewer.VERSION = "1";
  byXMLviewer.initialized = true;
  byXMLviewer.parse = parseXML;
})(typeof window !== "undefined" ? window : this);
