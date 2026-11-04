# byuwur/easy-xml-viewer

![easy-xml-viewer preview](prev.jpg)

**XML, unfold every tag.**

Explore elements, attributes, namespaces, text, comments, and CDATA in a searchable tree.

Use it for XML files, service responses, feeds, and configuration that needs a little room to breathe.

One JavaScript file. One scoped stylesheet. No build step. Plain JavaScript, with no runtime dependencies.

[Open the playground](https://byuwur.github.io/easy-xml-viewer/)

Open `index.html` for the local playground; its page assets require internet access.

## Installation and usage

**Recommended: CDN.** No downloads or package manager.

```html
<link href="https://cdn.jsdelivr.net/gh/byuwur/easy-xml-viewer@latest/xml.css" rel="stylesheet" />
<script src="https://cdn.jsdelivr.net/gh/byuwur/easy-xml-viewer@latest/xml.js" defer></script>
<div id="viewer" data-theme="light"></div>
<script>
  document.addEventListener("DOMContentLoaded", () => {
    byXMLviewer(document.getElementById("viewer"), '<root><item id="1">Hello</item></root>', { collapsed: true });
  });
</script>
```

The CDN example uses `@latest` and requires internet access. Use a published tag or commit to pin a version.

**Local files:** For offline use, save `xml.js` and `xml.css` beside your HTML:

```html
<link href="xml.css" rel="stylesheet" />
<script src="xml.js" defer></script>
```

Exported HTML starters use default settings, independently of playground changes.

## Input and API

`byXMLviewer(element, xml?, options?)` accepts a string; omitted input uses the target's text. Empty/whitespace-only input displays an empty state. Malformed or oversized input displays an error and resolves `ready` false.

`byXMLviewer.parse(xml)` uses the browser's XML parser and returns a detached XMLDocument, or null for empty input. It shares the renderer's parser and limits. Invalid input throws `TypeError`, `SyntaxError`, or `RangeError`.

Names retain namespace prefixes and declarations. Attribute values and character references are decoded. Node copy includes descendants and uses XMLSerializer, so quotes, entities, and empty-element formatting may differ from the source. Main Copy preserves the original source.

Copy value uses an element's textContent or a leaf's nodeValue. The XML declaration is displayed separately and excluded from node-search counts.

DTDs/DOCTYPE declarations, including internal/external entities, are rejected. Standard XML entities and numeric references are supported; declaration-like text in comments/CDATA stays ordinary data. Nodes are never imported into the page, and scripts, styles, or external resources are not activated.

Parse-error messages vary by browser. Elements named `parsererror` in the XHTML or Mozilla parser-error namespaces are reserved for error detection; use another namespace for user data with that name.

## XML options and limits

| Option           | Default | Behavior                                                                                                                                                                                       |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collapsible`    | `true`  | Show disclosure controls; false keeps every node expanded.                                                                                                                                     |
| `collapsed`      | `false` | Initially close element disclosures.                                                                                                                                                           |
| `showWhitespace` | `false` | Include whitespace-only text nodes. Significant text spacing is always retained.                                                                                                               |
| `search`         | `false` | Case-insensitive substring search over node names, attribute names/values, and leaf values. Show matching nodes and their ancestor paths, expanded. Clearing restores initial collapse policy. |
| `copyNodes`      | `false` | Show node copy buttons, including collapsed descendants.                                                                                                                                       |

Expand/collapse affects displayed elements only. Filtering leaves source XML unchanged. Mixed text and elements keep document order; indentation is for navigation.

Limits: 2 million input characters, 50,000 document nodes (including whitespace), and 256 nesting levels. DOMParser and indexing are synchronous; DOM creation yields every 100 visible nodes and search every 1,000 records. Closed branches remain in the DOM, so large documents can consume substantial memory. Re-rendering or a new search cancels obsolete DOM work.

## Shared controls and lifecycle

| Option             | Default     | Behavior                                                                     |
| ------------------ | ----------- | ---------------------------------------------------------------------------- |
| `toolbar`          | `true`      | Show the viewer header; secondary tools are configured separately.           |
| `credits`          | `true`      | Show attribution in the header.                                              |
| `statusBar`        | `true`      | Show counts and metadata. Loading, errors, and empty results remain visible. |
| `expandCollapse`   | `false`     | Show Expand all / Collapse all.                                              |
| `copyValues`       | `false`     | Show copy-value buttons, independently of copyNodes.                         |
| `themeToggle`      | `true`      | Show the theme toggle.                                                       |
| `fontSizeControls` | `true`      | Show text-size controls.                                                     |
| `copyButton`       | `true`      | Show full source copy button.                                                |
| `controlsSize`     | `"regular"` | `"small"`, `"regular"`, or `"large"`; invalid values use `"regular"`.        |
| `controlsCompact`  | `true`      | Keep credits beside controls; `false` stacks them. Wraps as needed.          |
| `controlsPosition` | `"top"`     | Sticky `"top"` or `"bottom"` toolbar; invalid values use `"top"`.            |

The controller exposes `ready` and `destroy()`. `ready` resolves `true` after initial rendering, or `false` on a displayed data error or cancellation. Invalid targets/options can throw synchronously.

`ready` describes the initial render only; it does not track later searches or disclosure changes.

```javascript
const viewer = byXMLviewer(target, xml, { search: true });
const rendered = await viewer.ready; // false on data errors or cancellation.
viewer.destroy(); // Call when the host panel is removed.
```

Re-rendering disposes the previous instance. `destroy()` cancels pending work and clears the target only if the instance still owns it. Duplicate script loads preserve the API. Read its version with `byXMLviewer.VERSION`.

Input is displayed as text, never executed. Style `.byXMLdocument` with `--by-view-bg`, `--by-view-text`, `--by-view-muted`, `--by-view-border`, `--by-view-accent`, `--by-view-alt`, `--by-view-string`, and `--by-view-literal`. The container uses system-ui; source/tree content uses monospace. Override the class or target's inline font/size as needed.

Copy requires clipboard permission in a secure context.

Requires a modern browser with async functions, WeakMap, ES2022 array methods, and CSS variables. Tests run in Chromium; other engines are unverified.

`--by-view-content-font` and `--by-view-line-height` set source/tree typography.

Use `toolbar: false` to hide the header, or disable `credits`, `themeToggle`, `fontSizeControls`, and `copyButton` individually. Content actions such as search and format-specific buttons use their own options.

Controls use monospace by default; override `--by-view-controls-font` to change it.

## Themes

`xml.css` includes all palettes in Light and Dark. Monokai is the default.

| Palette           | `data-theme`    | What it looks like                                                |
| ----------------- | --------------- | ----------------------------------------------------------------- |
| Monokai (default) | `monokai`       | Warm light and dark colors.                                       |
| GitHub            | `github`        | Familiar neutral surfaces and syntax colors.                      |
| Solarized         | `solarized`     | Warm light or deep blue-green dark surfaces.                      |
| High Contrast     | `high-contrast` | Black/white surfaces, strong text, borders, and focus indicators. |

Use a mode class and a palette name together:

```html
<div id="viewer" class="dark" data-theme="github"></div>
<!-- High Contrast Light: class="light" data-theme="high-contrast" -->
<!-- High Contrast Dark: class="dark" data-theme="high-contrast" -->
```

Rendering adds `.byXMLdocument`; its variables affect only that container and its children. The theme switch changes mode while keeping the palette; re-rendering preserves both. A named palette without a mode class starts in Light; if both mode classes are present, Dark wins.

`data-theme="light"` and `data-theme="dark"` select Monokai and override mode classes. A mode class alone, or no explicit theme, also uses Monokai.

### High Contrast

High Contrast text colors target at least [7:1 contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html), with [3:1 contrast for control boundaries and focus cues](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Check contrast again when you override colors.

### Make it yours

The playground's **Custom theme CSS** field edits both modes of the selected palette. Export those rules to your own stylesheet and use `data-theme="custom"` with `class="light"` or `class="dark"`. Custom drafts stay in the playground; the renderer does not store them.

Define a named palette after the viewer stylesheet. Unspecified colors inherit Monokai:

```css
.byXMLdocument.light[data-theme="ocean"] {
  --by-view-bg: #f3f8fc;
  --by-view-text: #102a43;
  --by-view-border: #486581;
  --by-view-accent: #005a9c;
}

.byXMLdocument.dark[data-theme="ocean"] {
  --by-view-bg: #102a43;
  --by-view-text: #f0f6fc;
  --by-view-border: #9fb3c8;
  --by-view-accent: #8cd3ff;
}
```

```html
<div id="viewer" class="dark" data-theme="ocean"></div>
```

Named palettes need no JavaScript registration or extra theme files.

In the playground configuration, `theme` is the mode, `palette` is its name, and `customThemeCSS` holds custom rules. Null appearance values inherit defaults. Pass only documented API options to the renderer.

**Copy CSS** exports typography and individual color overrides. Inline colors override palette variables; clear them or Reset to restore palette defaults.

Text-size controls change only this viewer, in `0.125rem` steps from `0.5rem` to `3rem`, independently of button size. **A** restores its initial size; re-rendering preserves the selected size.

### Legacy theme links

Legacy integrations can use `#byVIEWtheme` or a detected `xml.light.css` / `xml.dark.css` link. The toggle keeps its path, query, and hash and updates viewers sharing the link. Explicit container themes stay independent. Separate theme files are no longer shipped; retain your hosted legacy files to use this alternative.

## Checks

Theme tests cover both modes, container isolation, legacy links, custom CSS, and High Contrast. Clipboard tests use stubs; they do not verify real permissions.

Landing tests fetch the pinned Bootstrap stylesheet unless `BOOTSTRAP_CSS_PATH` points to a cached copy.

Install Playwright outside the repository and set `NODE_PATH` to its `node_modules` directory:

```sh
node --check xml.js
node --test tests/rendering.cjs
```

`BROWSER_CHANNEL=chrome` uses installed Chrome; `CHROMIUM_EXECUTABLE_PATH` selects a Chromium executable. Otherwise, install Playwright Chromium. [GitHub Actions](.github/workflows/rendering.yml) runs the same suite.

## The easy viewers

Need another format, or a Markdown editor? Explore the family:

[Markdown](https://github.com/byuwur/easy-md-viewer) · [JSON](https://github.com/byuwur/easy-json-viewer) · [CSV & TSV](https://github.com/byuwur/easy-csv-viewer) · [Logs](https://github.com/byuwur/easy-log-viewer) · [Diff](https://github.com/byuwur/easy-diff-viewer) · [XML](https://github.com/byuwur/easy-xml-viewer) · [YAML](https://github.com/byuwur/easy-yaml-viewer) · [Source code](https://github.com/byuwur/easy-code-viewer)

[Write Markdown with easy-md-editor](https://github.com/byuwur/easy-md-editor).

## License

MIT (c) 2026 Andres Trujillo [Mateus] byUwUr. See [LICENSE](LICENSE).
