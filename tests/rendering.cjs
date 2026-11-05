const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const { chromium } = require("playwright");

// Caller-provided legacy stylesheets reuse the canonical palettes without distribution files.
const legacyThemeCSS = (theme) => {
  const css = require("node:fs").readFileSync(path.join(__dirname, "../xml.css"), "utf8");
  const section = css.split(`/* --- ${theme.toUpperCase()} --- */`)[1];
  return `.byXMLdocument {${section.match(/\{([\s\S]*?)\}/)[1]}}`;
};

let bootstrapCSS;
const getBootstrapCSS = () =>
  (bootstrapCSS ??= (async () => {
    if (process.env.BOOTSTRAP_CSS_PATH) return require("node:fs/promises").readFile(process.env.BOOTSTRAP_CSS_PATH, "utf8");
    const response = await fetch("https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css");
    assert.ok(response.ok, "Unable to load pinned Bootstrap CSS");
    return response.text();
  })());

test("XML standalone browser contracts", async (t) => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = [],
      requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/^https?:/.test(request.url()) && !request.url().startsWith("http://viewer.test/")) requests.push(request.url());
    });
    await page.route("http://viewer.test/**", (route) => {
      const filename = new URL(route.request().url()).pathname.slice(1);
      if (/^xml\.(light|dark)\.css$/.test(filename)) return route.fulfill({ body: legacyThemeCSS(filename.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      if (!filename || filename === "index.html")
        return route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="xml.css"><script src="xml.js"></script><div id="viewer" data-theme="light"></div>'
        });
      return route.fulfill({ path: path.join(__dirname, "..", filename), contentType: filename.endsWith(".css") ? "text/css" : "text/javascript" });
    });
    await page.goto("http://viewer.test/index.html");
    await page.evaluate(
      async ({ source, second, options }) => {
        await byXMLviewer(document.getElementById("viewer"), source, options).ready;
      },
      {
        source:
          '<?xml version="1.0"?>\n<catalog xmlns:app="urn:example">\n  <!-- A small, independent viewer -->\n  <app:item id="1"><name>Andres &amp; friends</name><notes><![CDATA[<raw> text]]></notes></app:item>\n  <?ready yes?>\n</catalog>',
        options: { fontSizeControls: true, collapsed: false, search: true, copyNodes: true, showWhitespace: false }
      }
    );
    await page.waitForFunction(() => document.getElementById("viewer")?.getAttribute("aria-busy") !== "true" && typeof window.byXMLviewer === "function");
    await page.evaluate(() => {
      window.root = document.getElementById("viewer");
      window.copies = [];
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value) => copies.push(value) } });
    });
    await t.test("themes, copy, font size, and responsive controls", async () => {
      assert.equal(await page.locator("#viewer [role=alert]:visible").count(), 0);
      await page.locator(".byVIEWcopy").click();
      assert.equal(await page.evaluate(() => typeof copies.at(-1)), "string");
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
      await page.waitForFunction(() => getComputedStyle(root).backgroundColor === "rgb(39, 40, 34)");
      await page.getByRole("button", { name: "Increase text size" }).click();
      assert.equal(await page.evaluate(() => root.style.fontSize), "1.125rem");
      await page.setViewportSize({ width: 320, height: 640 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.getByRole("button", { name: "Reset text size" }).click();
    });
    await t.test("clipboard denial is reported", async () => {
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => {
          throw new Error("denied");
        };
      });
      await page.locator(".byVIEWcopy").click();
      assert.equal(await page.locator(".byVIEWcopy").textContent(), "Failed");
      await page.evaluate(() => {
        navigator.clipboard.writeText = async (value) => copies.push(value);
      });
    });

    await t.test("XML namespaces, attributes, CDATA, comments, PI, and entities", async () => {
      await page.evaluate(async () => {
        await byXMLviewer(root, '<?xml version="1.0"?><r xmlns:p="urn:p"><p:item a="&quot;&amp;">text<![CDATA[<raw>]]><!--note--><?step ok?></p:item></r>').ready;
      });
      assert.match(await page.locator(".byXMLtree").textContent(), /p:item/);
      assert.match(await page.locator(".byXMLcdata").textContent(), /<raw>/);
      assert.equal(await page.locator(".byXMLcomment").textContent(), "<!--note-->");
      assert.equal(await page.locator(".byXMLpi").count(), 2);
      assert.equal(await page.evaluate(() => byXMLviewer.parse('<parsererror xmlns="urn:user">valid</parsererror>').documentElement.localName), "parsererror");
    });
    await t.test("collapse, search ancestor paths, and node/value copying", async () => {
      await page.evaluate(async () => {
        await byXMLviewer(root, '<root><branch><leaf id="needle">value &amp; more</leaf></branch><other>hidden</other></root>', { search: true, copyNodes: true, copyValues: true, expandCollapse: true, collapsed: true }).ready;
      });
      assert.equal(await page.locator("details[open]").count(), 0);
      await page.getByRole("button", { name: "Expand all XML nodes" }).click();
      assert.equal(await page.locator("details[open]").count(), 4);
      await page.locator("summary").filter({ hasText: "<leaf" }).getByRole("button", { name: "Copy XML node", exact: true }).click();
      assert.equal(await page.evaluate(() => copies.at(-1)), '<leaf id="needle">value &amp; more</leaf>');
      await page.locator("summary").filter({ hasText: "<leaf" }).getByRole("button", { name: "Copy XML value", exact: true }).click();
      assert.equal(await page.evaluate(() => copies.at(-1)), "value & more");
      await page.getByRole("searchbox", { name: "Search XML" }).fill("needle");
      await page.waitForFunction(() => document.querySelectorAll(".byXMLnode").length === 3);
      assert.equal(await page.locator("details[open]").count(), 3);
      assert.doesNotMatch(await page.locator(".byXMLtree").textContent(), /other/);
      await page.getByRole("searchbox", { name: "Search XML" }).fill("no matches");
      await page.waitForFunction(() => document.querySelector(".byXMLtree").childNodes.length === 0);
    });
    await t.test("malformed/empty XML, depth limits, and DTD rejection", async () => {
      const result = await page.evaluate(async () => {
        const invalid = [];
        for (const source of ["<a><b></a>", '<!DOCTYPE r [<!ENTITY x SYSTEM "https://example.invalid/secret">]><r>&x;</r>', '<r p:a="1"/>', "<a>".repeat(257) + "</a>".repeat(257)]) invalid.push(await byXMLviewer(root, source).ready);
        const comment = await byXMLviewer(root, "<r><!-- <!DOCTYPE harmless> --><![CDATA[<!DOCTYPE data>]]></r>").ready;
        const empty = await byXMLviewer(root, "").ready;
        return { invalid, comment, empty, parsedEmpty: byXMLviewer.parse("") };
      });
      assert.deepEqual(result, { invalid: [false, false, false, false], comment: true, empty: true, parsedEmpty: null });
    });
    await t.test("untrusted XML never becomes executable markup", async () => {
      await page.evaluate(async () => {
        await byXMLviewer(root, '<r><script>window.injected=1</script><img src="https://example.invalid/image" onerror="window.injected=1"/><style>body{display:none}</style></r>').ready;
      });
      assert.equal(await page.locator("#viewer script, #viewer img, #viewer style").count(), 0);
      assert.equal(await page.evaluate(() => window.injected), undefined);
    });
    await t.test("large XML yields, and stale renders/disposal preserve current ownership", async () => {
      const result = await page.evaluate(async () => {
        const source = `<root>${'<item a="1">value</item>'.repeat(3000)}</root>`;
        let tick = false;
        setTimeout(() => {
          tick = true;
        }, 0);
        const view = byXMLviewer(root, source, { collapsed: true });
        const ready = await view.ready;
        const count = root.querySelectorAll(".byXMLnode").length;
        const old = byXMLviewer(root, source),
          current = byXMLviewer(root, "<new/>");
        const cancelled = await old.ready;
        await current.ready;
        old.destroy();
        const preserved = root.textContent.includes("<new");
        current.destroy();
        return { tick, ready, count, cancelled, preserved, disposed: root.childNodes.length === 0 };
      });
      assert.deepEqual(result, { tick: true, ready: true, count: 3001, cancelled: false, preserved: true, disposed: true });
    });

    await t.test("duplicate loading and source independence", async () => {
      await page.evaluate(() => {
        window.original = byXMLviewer;
      });
      await page.addScriptTag({ path: path.join(__dirname, "../xml.js") });
      assert.equal(await page.evaluate(() => original === byXMLviewer), true);
      assert.deepEqual(requests, []);
      assert.deepEqual(errors, []);
    });
  } finally {
    await browser.close();
  }
});

test("suite playground, exports, and stylesheet controls", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copiedHTML = text;
          }
        }
      });
    });
    await page.route("**/*", async (route) => {
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      const url = new URL(route.request().url());
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname);
      if (/^xml\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    await page.waitForFunction(() => document.getElementById("render-status").textContent.startsWith("Rendered"));
    const preview = page.frames().find((frame) => frame.parentFrame());
    const source = await page.locator("#source").inputValue();
    const expectedCopy = source;
    const release = await page
      .frameLocator("#preview-frame")
      .locator(".byVIEWtoolbar")
      .evaluate(() => byXMLviewer.VERSION);
    assert.ok((await page.frameLocator("#preview-frame").locator(".byVIEWinfo").textContent()).includes(` v${release} `), "Credits must match the runtime release");
    const cdnBase = "https://cdn.jsdelivr.net/gh/byuwur/easy-xml-viewer@latest/";
    const readme = require("node:fs").readFileSync(path.join(__dirname, "../README.md"), "utf8");
    for (const extension of ["css", "js"]) assert.ok(readme.includes(`${cdnBase}xml.${extension}`), "README assets must match the CDN starter");
    assert.equal(await page.locator("#install-note").textContent(), "CDN follows the latest release; updates may take time to reach caches.");
    assert.ok((await page.locator("#integration-code").inputValue()).includes(`href="${cdnBase}xml.css"`));
    assert.equal(await page.locator('[data-install="cdn"]').getAttribute("aria-pressed"), "true");
    await page.locator('[data-install="local"]').click();
    const starter = await page.locator("#integration-code").inputValue();
    await page.evaluate(() => {
      window.successfulClipboardWrite = navigator.clipboard.writeText;
      navigator.clipboard.writeText = async () => {
        throw new Error("Denied");
      };
    });
    await page.locator("#copy-html").click();
    await page.waitForFunction(() => document.querySelector("#copy-html span").textContent === "Failed");
    assert.equal(await page.locator("#integration-code").evaluate((element) => document.activeElement === element && element.selectionEnd === element.value.length), true);
    assert.match(await page.locator("#copy-html").getAttribute("title"), /Ctrl\+C/);
    await page.evaluate(() => {
      navigator.clipboard.writeText = window.successfulClipboardWrite;
    });

    assert.ok(starter.includes('href="xml.css"'));
    assert.ok(starter.includes('data-theme="light"'));
    assert.ok(!starter.includes("byVIEWtheme"));
    assert.doesNotMatch(starter, /\.(light|dark)\.css/);
    assert.ok(starter.includes('src="xml.js"'));
    await page.locator('[name="controlsCompact"]').check();
    await page.locator('label[for="controlsPosition-bottom"]').click();
    await page.locator('label[for="controlsSize-small"]').click();
    await preview.waitForFunction(() => document.getElementById("viewer").classList.contains("byVIEWbottom") && document.querySelector(".byVIEWtoolbar").dataset.size === "small");
    assert.equal(await preview.locator("#viewer").evaluate((element) => element.lastElementChild.classList.contains("byVIEWtoolbar")), true);
    await page.locator('label[for="preview-dark"]').click();
    await preview.waitForFunction(() => getComputedStyle(document.getElementById("viewer")).backgroundColor === "rgb(39, 40, 34)");
    await preview.locator(".byVIEWthemeToggle").click();
    await page.waitForFunction(() => document.getElementById("preview-light").checked);
    await page.locator("#source").fill("");
    await page.locator("#render").click();
    await page.waitForFunction(() => !document.getElementById("render-status").textContent.includes("Rendering"));
    assert.equal(await page.locator("#integration-code").inputValue(), starter);
    await page.locator("#copy-html").click();
    assert.equal(await page.evaluate(() => copiedHTML), starter);
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download-html").click()]);
    assert.equal(await require("node:fs/promises").readFile(await download.path(), "utf8"), starter);
    const exported = await browser.newPage();
    await exported.route("https://viewer.test/**", (route) => {
      const file = path.basename(new URL(route.request().url()).pathname);
      if (/^xml\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      if (file === "starter.html") return route.fulfill({ body: starter, contentType: "text/html" });
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await exported.goto("https://viewer.test/starter.html");
    await exported.waitForFunction(() => document.querySelector(".byVIEWtoolbar") && document.getElementById("viewer").getAttribute("aria-busy") !== "true");
    assert.equal(await exported.locator("[role=alert]:visible").count(), 0);
    await exported.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copiedSource = text;
          }
        }
      });
    });
    await exported.locator(".byVIEWcopy").click();
    assert.equal(await exported.evaluate(() => copiedSource), expectedCopy);
    await page.locator('[data-install="cdn"]').click();
    const cdnStarter = await page.locator("#integration-code").inputValue();
    assert.equal(cdnStarter.replaceAll(cdnBase, ""), starter, "Only asset paths change between modes");
    assert.ok(cdnStarter.includes('href="' + cdnBase + 'xml.css"'));
    assert.ok(cdnStarter.includes('src="' + cdnBase + 'xml.js"'));
    assert.equal(await page.locator('[data-install="cdn"]').getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator('[data-install="local"]').getAttribute("aria-pressed"), "false");
    await page.locator("#copy-html").click();
    assert.equal(await page.evaluate(() => copiedHTML), cdnStarter);
    const [cdnDownload] = await Promise.all([page.waitForEvent("download"), page.locator("#download-html").click()]);
    assert.equal(await require("node:fs/promises").readFile(await cdnDownload.path(), "utf8"), cdnStarter);
    const cdnPage = await browser.newPage();
    const cdnRequests = [];
    cdnPage.on("pageerror", (error) => errors.push(error.message));
    // Serve future CDN URLs from the maintained files without depending on publication.
    await cdnPage.route("**/*", (route) => {
      const url = route.request().url();
      if (url === "https://viewer.test/cdn-starter.html") return route.fulfill({ body: cdnStarter, contentType: "text/html" });
      if ([cdnBase + "xml.css", cdnBase + "xml.js"].includes(url)) {
        cdnRequests.push(url);
        return route.fulfill({ path: path.join(__dirname, "..", path.basename(new URL(url).pathname)), contentType: url.endsWith(".js") ? "text/javascript" : "text/css" });
      }
      return route.abort();
    });
    await cdnPage.goto("https://viewer.test/cdn-starter.html");
    await cdnPage.waitForFunction(() => document.querySelector(".byVIEWtoolbar") && document.getElementById("viewer").getAttribute("aria-busy") !== "true");
    assert.equal(await cdnPage.locator("[role=alert]:visible").count(), 0);
    assert.deepEqual(cdnRequests.sort(), [cdnBase + "xml.css", cdnBase + "xml.js"]);
    await cdnPage.close();
    await page.locator('[data-install="local"]').click();
    assert.equal(await page.locator("#integration-code").inputValue(), starter);
    assert.equal(await page.locator('[data-install="local"]').getAttribute("aria-pressed"), "true");
    // Caller-provided legacy stylesheets still synchronize unassigned viewers.
    await exported.evaluate(async () => {
      document.getElementById("viewer").removeAttribute("data-theme");
      const link = document.createElement("link");
      link.rel = "stylesheet";
      document.head.appendChild(link);
      link.setAttribute("href", "xml.light.css?cache=1#theme");
      const other = document.createElement("div");
      other.id = "other";
      document.body.appendChild(other);
      await byXMLviewer(other, "", { fontSizeControls: true }).ready;
    });
    await exported.locator("#other .byVIEWthemeToggle").click();
    assert.equal(await exported.locator('link[href*="dark.css"]').getAttribute("href"), "xml.dark.css?cache=1#theme");
    assert.equal(await exported.locator('[aria-label="Switch to light theme"]').count(), 2);
    await exported.evaluate(async () => {
      document.querySelector('link[href*=".dark.css"]').remove();
      await byXMLviewer(document.getElementById("other"), "", { fontSizeControls: true }).ready;
    });
    assert.equal(await exported.locator("#other .byVIEWthemeToggle").count(), 1);
    await exported.locator('#other [aria-label="Increase text size"]').evaluate((button) => {
      for (let i = 0; i < 30; i++) button.click();
    });
    assert.equal(await exported.locator('#other [aria-label="Increase text size"]').isDisabled(), true);
    assert.equal(await exported.locator("#other").evaluate((element) => element.style.fontSize), "3rem");
    await exported.close();
    await page.locator("#local-file").setInputFiles({ name: "sample.txt", mimeType: "text/plain", buffer: Buffer.from(source) });
    await page.waitForFunction((expected) => document.getElementById("source").value === expected, source);
    await page.locator("#reset").click();
    assert.equal(await page.locator('[name="controlsCompact"]').isChecked(), true);
    assert.equal(await page.locator('[name="controlsPosition"]:checked').inputValue(), "top");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("family customization, navigation and monospace controls", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.lastCopy = text;
          }
        }
      })
    );
    await page.route("**/*", async (route) => {
      if (route.request().url() === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      const url = new URL(route.request().url());
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname);
      if (/^xml\.(light|dark)\.css$/.test(file)) return route.fulfill({ body: legacyThemeCSS(file.includes(".dark.css") ? "dark" : "light"), contentType: "text/css" });
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    assert.equal(await page.locator("#controlsCompact").isChecked(), true);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsCompact, true);
    assert.equal(await frame.locator(".byXMLdocument").evaluate((root) => root.classList.contains("byVIEWcompact")), true);
    assert.deepEqual(
      await frame.evaluate(async (source) => {
        const host = document.createElement("div");
        document.body.append(host);
        const states = [];
        let controller;
        try {
          for (const options of [undefined, { controlsCompact: false }, { controlsCompact: true }, undefined]) {
            controller = byXMLviewer(host, source, options);
            await controller?.ready;
            states.push(host.classList.contains("byVIEWcompact"));
          }
          controller = byXMLviewer(host, source, { themeToggle: false, fontSizeControls: false, copyButton: false });
          await controller?.ready;
          states.push(host.querySelectorAll(".byVIEWinfo").length === 1 && !host.querySelector(".byVIEWcontrols"));
          return states;
        } finally {
          controller?.destroy?.();
          host.remove();
        }
      }, "<sample/>"),
      [true, false, true, true, true],
      "Compact defaults, opt-out, rerenders, and disabled controls agree"
    );
    assert.deepEqual(
      await page
        .locator(".form-switch .form-check-input")
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return { width: style.width, height: style.height };
        }),
      { width: "44px", height: "24px" }
    );
    assert.equal(
      await page.locator(".form-switch .form-check-input").evaluateAll((inputs) =>
        inputs.every((input) => {
          const toggle = input.getBoundingClientRect();
          const row = input.closest(".form-switch").getBoundingClientRect();
          return Math.abs(toggle.right - row.right) < 1 && Math.abs(toggle.top + toggle.height / 2 - row.top - row.height / 2) < 1;
        })
      ),
      true,
      "Every switch lines up at the right edge and center of its row"
    );
    for (const width of [768, 1280]) {
      await page.setViewportSize({ width, height: 720 });
      assert.equal(
        await page.locator("#controlsSize").evaluate((size) => {
          const a = size.querySelector(".btn-group").getBoundingClientRect();
          const b = document.querySelector("#controlsPosition .btn-group").getBoundingClientRect();
          return Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && a.right < b.left;
        }),
        true,
        "Size and position controls share one evenly divided row"
      );
    }
    assert.deepEqual(
      await page
        .locator(".accordion-button")
        .allTextContents()
        .then((labels) => labels.map((label) => label.trim()).slice(0, 3)),
      ["Preview appearance", "Viewer controls", "Rendering"]
    );
    assert.deepEqual(await page.locator("#options-json").evaluate((editor) => Object.keys(JSON.parse(editor.value)).slice(0, 19)), [
      "theme",
      "palette",
      "fontFamily",
      "fontSize",
      "lineHeight",
      "controlsFont",
      "backgroundColor",
      "containerBackgroundColor",
      "textColor",
      "customThemeCSS",
      "toolbar",
      "credits",
      "themeToggle",
      "fontSizeControls",
      "copyButton",
      "controlsCompact",
      "animations",
      "controlsSize",
      "controlsPosition"
    ]);
    assert.equal(await page.locator(".intro h1 + p").textContent(), "Plain JavaScript. No dependencies. Open source. Free. Forever.");
    assert.ok((await page.locator("header .brand-mark").textContent()).trim());
    assert.equal(await page.locator("header .brand-mark").textContent(), "</>");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim()), "#141618");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(20, 22, 24)");
    assert.equal(
      await page
        .locator(".source-editor")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      "rgb(20, 22, 24)"
    );
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#141618");
    await page.locator("#site-theme").evaluate((button) => button.click());
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bs-body-bg").trim()), "#fff");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute("content"), "#fff");
    const root = frame.locator(".byXMLdocument");
    const initial = await root.evaluate((element) => ({ font: element.style.fontFamily, size: element.style.fontSize, bg: element.style.getPropertyValue("--by-view-bg") }));
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /monospace/);
    assert.equal(await page.locator('[aria-label="Viewer suite"] a').count(), 9);
    assert.equal(await page.locator(".viewer-suite").getByRole("link", { name: "MD.edit", exact: true }).getAttribute("href"), "https://byuwur.github.io/easy-md-editor/");
    assert.equal(await page.locator('[aria-label="Viewer suite"]').getByRole("link", { name: "XML", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.locator(".site-footer .fa-heart").count(), 1);
    assert.equal(await page.locator("header .fa-github").count(), 1);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('[aria-label="Viewer suite"]').compareDocumentPosition(document.querySelector("footer")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".preview-appearance"), "::details-content").opacity === "1");
    await page.locator("#preview-controls-font-0").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#preview-controls-font-1").isChecked(), true);
    assert.equal(JSON.parse(await page.locator("#options-json").inputValue()).controlsFont, "system-ui, sans-serif");
    await page.keyboard.press("ArrowLeft");
    await page.evaluate(() => {
      for (const [id, value] of [
        ["preview-font", "Georgia, serif"],
        ["preview-size", "1.5"],
        ["preview-leading", "1.8"],
        ["preview-controls-font", "system-ui, sans-serif"],
        ["preview-bg", "#123456"],
        ["preview-ink", "#fedcba"]
      ]) {
        const input = id === "preview-controls-font" ? document.querySelector(`[name="preview-controls-font"][value="${value}"]`) : document.getElementById(id);
        if (input.type === "radio") input.checked = true;
        else input.value = value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    assert.deepEqual(
      await root.evaluate((element) => {
        const style = getComputedStyle(element);
        return { font: style.fontFamily, size: style.fontSize, line: style.lineHeight, bg: style.backgroundColor, text: style.color };
      }),
      { font: "Georgia, serif", size: "24px", line: "43.2px", bg: "rgb(18, 52, 86)", text: "rgb(254, 220, 186)" }
    );
    assert.equal(
      await frame
        .locator(".byXMLtree")
        .first()
        .evaluate((element) => getComputedStyle(element).fontFamily),
      "Georgia, serif"
    );
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /system-ui/);
    await page.locator("#copy-appearance").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.includes("--by-view-controls-font"));
    assert.match(await page.evaluate(() => lastCopy), /\.byXMLdocument/);
    assert.ok((await page.evaluate(() => lastCopy)).includes("--by-view-document-bg: #123456"));
    await page.locator('[data-options-view="json"]').evaluate((button) => button.click());
    const configuration = JSON.parse(await page.locator("#options-json").inputValue());
    for (const [name, value] of Object.entries({
      theme: "light",
      fontFamily: "Georgia, serif",
      fontSize: 1.5,
      lineHeight: 1.8,
      controlsFont: "system-ui, sans-serif",
      backgroundColor: "#123456",
      containerBackgroundColor: null,
      textColor: "#fedcba"
    })) {
      assert.deepEqual(configuration[name], value, name);
    }
    assert.ok(!["options", "appearance", "callbacks"].some((key) => key in configuration));
    const readme = require("node:fs").readFileSync(path.join(__dirname, "../README.md"), "utf8");
    for (const match of readme.matchAll(/^\|\s*`([a-zA-Z]+)`\s*\|/gm)) {
      assert.ok(match[1] in configuration, `Missing parameter: ${match[1]}`);
    }
    await page.locator("#copy-options").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.startsWith("{"));
    assert.deepEqual(JSON.parse(await page.evaluate(() => lastCopy)), configuration);
    assert.ok(!Object.keys(configuration).some((key) => key.startsWith("preview")));
    await page.locator('[data-options-view="form"]').evaluate((button) => button.click());
    await page.locator("#reset-settings").evaluate((button) => button.click());
    assert.deepEqual(await root.evaluate((element) => ({ font: element.style.fontFamily, size: element.style.fontSize, bg: element.style.getPropertyValue("--by-view-bg") })), initial);
    assert.match(await frame.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).fontFamily), /monospace/);

    for (const button of await page.locator("[data-example]").all()) {
      await button.evaluate((element) => element.click());
      await page.waitForFunction(() => document.getElementById("render-status").textContent.startsWith("Rendered"));
      assert.equal(await frame.locator("[role=alert]:visible").count(), 0);
      assert.match(await page.locator("#metric-size").textContent(), /B$/);
    }
    const sourceEditor = page.locator("#source");
    const fileSource = await sourceEditor.inputValue();
    await page.evaluate(() => {
      window.originalFileText = File.prototype.text;
      File.prototype.text = function () {
        return new Promise((resolve) => {
          window.finishFileRead = resolve;
        });
      };
    });
    try {
      for (const action of ["edit", "restore", "sample"]) {
        await sourceEditor.fill(`${fileSource}\n`);
        await page.locator("#local-file").setInputFiles({ name: "pending.txt", mimeType: "text/plain", buffer: Buffer.from(fileSource) });
        if (action === "edit") await sourceEditor.fill(`${fileSource}\n\n`);
        else if (action === "restore") await page.locator("#restore-source").click();
        else await page.locator("#reset").click();
        const expected = await sourceEditor.inputValue();
        await page.evaluate((text) => window.finishFileRead(text), "An obsolete file read");
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        assert.equal(await sourceEditor.inputValue(), expected, "Late file reads preserve the newer source");
      }
    } finally {
      await page.evaluate(() => {
        File.prototype.text = window.originalFileText;
        delete window.finishFileRead;
        delete window.originalFileText;
      });
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("container themes are scoped, independent, and compatible with legacy links", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setContent('<div id="outside" class="dark">Host</div><div id="first" data-theme="dark"></div><div id="second" class="light"></div><div id="third"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../xml.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../xml.js") });
    await page.evaluate(
      async (args) => {
        window.renderTheme = async (element) => {
          const controller = window.byXMLviewer(element, ...args);
          if (controller?.ready) await controller.ready;
        };
        for (const id of ["first", "second", "third"]) await renderTheme(document.getElementById(id));
      },
      ["<root>Local theme</root>"]
    );
    const color = (id) => page.locator("#" + id).evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(await color("first"), "rgb(39, 40, 34)");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    assert.equal(await page.locator("#outside").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted")), "");
    assert.equal(await page.locator("#first .byVIEWtoolbar").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted").trim()), "#75715e");
    await page.locator("#first .byVIEWthemeToggle").click();
    assert.equal(await page.locator("#first").getAttribute("data-theme"), "light");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.locator("#second .byVIEWthemeToggle").click();
    assert.equal(
      await page
        .locator("#second")
        .getAttribute("class")
        .then((classes) => classes.split(/\s+/).includes("dark")),
      true
    );
    assert.equal(await page.locator("#second").getAttribute("data-theme"), null);
    assert.equal(await color("second"), "rgb(39, 40, 34)");
    await page.evaluate(async () => {
      const second = document.getElementById("second");
      second.dataset.theme = "light";
      await renderTheme(second);
    });
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.evaluate(() => {
      const first = document.getElementById("first");
      first.style.setProperty("--by-view-bg", "#123456");
    });
    assert.equal(await color("first"), "rgb(18, 52, 86)");
    assert.equal(await color("second"), "rgb(250, 250, 245)");
    await page.evaluate(() => document.getElementById("first").style.removeProperty("--by-view-bg"));
    assert.equal(requests.length, 0, "Container theme changes must not fetch stylesheets");

    await page.route("https://legacy.test/**", (route) => route.fulfill({ body: legacyThemeCSS(route.request().url().includes(".dark.css") ? "dark" : "light"), contentType: "text/css" }));
    await page.evaluate(async () => {
      const second = document.getElementById("second");
      second.removeAttribute("data-theme");
      second.classList.remove("light", "dark");
      await new Promise((resolve, reject) => {
        const link = document.createElement("link");
        link.id = "byVIEWtheme";
        link.rel = "stylesheet";
        link.href = "https://legacy.test/xml.light.css?cache=1#theme";
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
      });
      await renderTheme(second);
      await renderTheme(document.getElementById("third"));
    });
    await page.locator("#second .byVIEWthemeToggle").click();
    await page.waitForFunction(() => getComputedStyle(document.getElementById("second")).backgroundColor === "rgb(39, 40, 34)");
    assert.equal(await color("third"), "rgb(39, 40, 34)");
    assert.equal(await color("first"), "rgb(250, 250, 245)");
    assert.equal(await page.locator("#first .byVIEWthemeToggle").getAttribute("aria-label"), "Switch to dark theme");
    assert.equal(await page.locator("#byVIEWtheme").getAttribute("href"), "https://legacy.test/xml.dark.css?cache=1#theme");
    await page.evaluate(async () => {
      document.getElementById("byVIEWtheme").remove();
      await renderTheme(document.getElementById("second"));
    });
    await page.locator("#second .byVIEWthemeToggle").click();
    assert.equal(await page.locator("#second").getAttribute("data-theme"), "dark");
    assert.equal(await color("third"), "rgb(250, 250, 245)");
  } finally {
    await browser.close();
  }
});

test("named palettes retain mode, isolate custom CSS, and meet High Contrast targets", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="outside">Host</div><div id="viewer"></div><div id="other" data-theme="dark"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../xml.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../xml.js") });
    await page.evaluate(
      async (args) => {
        window.renderPalette = async (id) => {
          const controller = window.byXMLviewer(document.getElementById(id), ...args);
          if (controller?.ready) await controller.ready;
        };
        await renderPalette("viewer");
        await renderPalette("other");
      },
      ['<root flag="yes"><item>Theme</item></root>']
    );
    const root = page.locator("#viewer");
    const background = () => root.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.equal(await background(), "rgb(250, 250, 245)", "Default remains Monokai Light");
    for (const [palette, colors] of Object.entries({
      monokai: ["rgb(250, 250, 245)", "rgb(39, 40, 34)"],
      github: ["rgb(255, 255, 255)", "rgb(13, 17, 23)"],
      solarized: ["rgb(253, 246, 227)", "rgb(0, 43, 54)"],
      "high-contrast": ["rgb(255, 255, 255)", "rgb(0, 0, 0)"]
    })) {
      await root.evaluate((element, palette) => {
        element.dataset.theme = palette;
        element.classList.remove("light", "dark");
      }, palette);
      assert.equal(await background(), colors[0], palette);
      await root.locator(".byVIEWthemeToggle").click();
      assert.equal(await root.getAttribute("data-theme"), palette);
      assert.equal(await background(), colors[1], palette);
      await page.evaluate(() => renderPalette("viewer"));
      assert.equal(await background(), colors[1], "Rendering preserves the palette and mode");
      await root.locator(".byVIEWthemeToggle").click();
      assert.equal(await background(), colors[0]);
    }
    for (const mode of ["light", "dark"]) {
      await root.evaluate((element, mode) => {
        element.classList.toggle("dark", mode === "dark");
        element.classList.toggle("light", mode === "light");
      }, mode);
      await root.locator(".byVIEWcopy").focus();
      const measurements = await root.evaluate((element) => {
        const style = getComputedStyle(element);
        const luminance = (color) => {
          const channels = color.startsWith("#")
            ? color
                .slice(1)
                .match(/../g)
                .map((part) => parseInt(part, 16))
            : color
                .match(/[\d.]+/g)
                .slice(0, 3)
                .map(Number);
          const values = channels.map((channel) => channel / 255).map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        };
        const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
        const variables = [...style].filter((property) => property.startsWith("--by-")).map((property) => [property, style.getPropertyValue(property).trim()]);
        const backgrounds = [style.backgroundColor, ...variables.filter(([property]) => /-(?:alt|code-bg|add|remove)$/.test(property)).map(([, value]) => value)];
        const text = variables.filter(([property, value]) => /^#[0-9a-f]{6}$/i.test(value) && !/-(?:bg|border|alt|add|remove)$/.test(property));
        const button = getComputedStyle(element.querySelector(".byVIEWcopy"));
        return {
          text: text.flatMap(([property, value]) => backgrounds.map((bg) => ({ property, ratio: contrast(value, bg) }))),
          border: contrast(button.borderTopColor, style.backgroundColor),
          focus: contrast(button.outlineColor, style.backgroundColor),
          outline: parseFloat(button.outlineWidth)
        };
      });
      assert.ok(measurements.text.length >= 5);
      for (const { property, ratio } of measurements.text) assert.ok(ratio >= 7, mode + " " + property + ": " + ratio.toFixed(2));
      assert.ok(measurements.border >= 3);
      assert.ok(measurements.focus >= 3 && measurements.outline >= 2);
    }
    await root.evaluate((element) => {
      element.classList.add("light", "dark");
      element.dataset.theme = "github";
    });
    assert.equal(await background(), "rgb(13, 17, 23)", "Dark wins when both classes exist");
    await root.evaluate((element) => {
      element.dataset.theme = "light";
    });
    assert.equal(await background(), "rgb(250, 250, 245)", "Legacy mode aliases override classes");
    await page.addStyleTag({ content: '.byXMLdocument.light[data-theme="ocean"] { --by-view-bg: #f3f8fc; } .byXMLdocument.dark[data-theme="ocean"] { --by-view-bg: #102a43; }' });
    await root.evaluate((element) => {
      element.dataset.theme = "ocean";
      element.classList.remove("light", "dark");
    });
    await page.route("https://legacy.test/**", (route) => route.fulfill({ body: "", contentType: "text/css" }));
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const link = document.createElement("link");
          link.id = "byVIEWtheme";
          link.rel = "stylesheet";
          link.href = "https://legacy.test/xml.dark.css?cache=1#theme";
          link.onload = resolve;
          document.head.appendChild(link);
        })
    );
    await page.evaluate(() => renderPalette("viewer"));
    assert.equal(await background(), "rgb(250, 250, 245)", "An unclassified custom palette starts in Light");
    await root.locator(".byVIEWthemeToggle").click();
    assert.equal(await background(), "rgb(16, 42, 67)");
    assert.equal(await root.getAttribute("data-theme"), "ocean");
    assert.equal(await page.locator("#byVIEWtheme").getAttribute("href"), "https://legacy.test/xml.dark.css?cache=1#theme");
    assert.equal(await page.locator("#other").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(39, 40, 34)");
    assert.equal(await page.locator("#outside").evaluate((element) => getComputedStyle(element).getPropertyValue("--by-view-muted")), "");
  } finally {
    await browser.close();
  }
});

test("playground palettes and editable two-mode custom themes stay synchronized", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.lastCopy = text;
          }
        }
      })
    );
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.href === "https://cdn.jsdelivr.net/gh/byuwur/spa.js@v20.6/css/bootstrap.min.css") return route.fulfill({ body: await getBootstrapCSS(), contentType: "text/css" });
      if (url.origin !== "https://viewer.test") return route.abort();
      const file = path.basename(url.pathname);
      return route.fulfill({ path: path.join(__dirname, "..", file), contentType: file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "text/css" });
    });
    await page.goto("https://viewer.test/index.html");
    const frame = page.frames().find((candidate) => candidate.parentFrame());
    await frame.waitForSelector(".byVIEWtoolbar");
    const root = frame.locator(".byXMLdocument");
    const editor = page.locator("#custom-theme-css");
    const palette = page.locator("#preview-palette");
    const background = () => root.evaluate((element) => getComputedStyle(element).backgroundColor);
    const initialBackground = await background();
    const hostBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(await palette.inputValue(), "monokai");
    await page.waitForFunction(() => document.getElementById("custom-theme-css").value.includes('.dark[data-theme="custom"]'));
    const defaults = await editor.inputValue();
    assert.ok(defaults.includes('.byXMLdocument.light[data-theme="custom"]'));
    await palette.selectOption("github");
    const setMode = (mode) =>
      page.evaluate((mode) => {
        const input = document.querySelector('#preview-theme, input[name="viewerTheme"][value="' + mode + '"], input[name="previewTheme"][value="' + mode + '"]');
        if (input.tagName === "SELECT") input.value = mode;
        else input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, mode);
    await setMode("dark");
    assert.equal(await background(), "rgb(13, 17, 23)");
    await root.locator(".byVIEWthemeToggle").click();
    await page.waitForFunction(() => JSON.parse(document.getElementById("options-json").value).theme === "light");
    assert.equal(await palette.inputValue(), "github");
    assert.equal(await background(), "rgb(255, 255, 255)");
    for (const name of ["solarized", "high-contrast"]) {
      await palette.selectOption(name);
      assert.equal(await root.getAttribute("data-theme"), name);
      assert.ok((await editor.inputValue()).includes("--by-view-bg"));
      await setMode("dark");
      assert.equal(await background(), name === "solarized" ? "rgb(0, 43, 54)" : "rgb(0, 0, 0)");
    }
    await page.locator(".preview-appearance").evaluate((element) => {
      element.open = true;
    });
    const custom = '.byXMLdocument.light[data-theme="custom"] { --by-view-bg: #f3f8fc; }\n.byXMLdocument.dark[data-theme="custom"] { --by-view-bg: #102a43; }';
    await editor.fill(custom);
    await page.waitForFunction(() => document.getElementById("preview-palette").value === "custom");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await setMode("light");
    assert.equal(await background(), "rgb(243, 248, 252)");
    await root.locator(".byVIEWthemeToggle").click();
    assert.equal(await root.getAttribute("data-theme"), "custom");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await page.locator("#copy-theme").evaluate((button) => button.click());
    await page.waitForFunction(() => window.lastCopy?.includes('[data-theme="custom"]'));
    assert.equal(await page.evaluate(() => lastCopy), custom);
    const config = JSON.parse(await page.locator("#options-json").inputValue());
    assert.equal(config.theme, "dark");
    assert.equal(config.palette, "custom");
    assert.equal(config.customThemeCSS, custom);
    assert.ok(!("appearance" in config) && !("options" in config));
    await palette.selectOption("github");
    assert.equal(await background(), "rgb(13, 17, 23)");
    await palette.selectOption("custom");
    assert.equal(await editor.inputValue(), custom, "Preset changes retain the draft");
    assert.equal(await background(), "rgb(16, 42, 67)");
    await page.locator("#reset-settings, #reset-options").evaluate((button) => button.click());
    await page.waitForFunction(() => document.getElementById("preview-palette").value === "monokai");
    assert.equal(await editor.inputValue(), defaults);
    assert.equal(await background(), initialBackground);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), hostBackground);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("viewer defaults, optional tools, and copy feedback", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 }, reducedMotion: "reduce" });
    await page.setContent('<div id="viewer"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../xml.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../xml.js") });
    await page.evaluate(
      (args) => {
        window.renderUI = async (options = {}) => {
          const result = byXMLviewer(document.getElementById("viewer"), ...args, options);
          await result?.ready;
        };
      },
      ["<root><needle>value</needle></root>"]
    );
    await page.evaluate(() => renderUI());
    assert.equal(await page.locator(".byVIEWcontrols button").count(), 5);
    assert.equal(await page.locator(".byVIEWfontSizes").count(), 1);
    assert.equal(await page.locator(".byVIEWactions :is(input, select, button):visible").count(), 0);
    assert.equal(await page.locator(".byVIEWstatus:visible").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => renderUI({ fontSizeControls: false, statusBar: false }));
    assert.equal(await page.locator(".byVIEWfontSizes").count(), 0);
    assert.equal(await page.locator(".byVIEWstatus:visible").count(), 0);
    await page.evaluate(() => renderUI());
    for (const scale of [1, 1.5]) {
      for (const controlsSize of ["small", "regular", "large"]) {
        for (const font of ["ui-monospace, monospace", "Georgia, serif"]) {
          for (const mode of ["light", "dark"]) {
            const errors = await page.evaluate(
              async ({ scale, controlsSize, font, mode }) => {
                document.documentElement.style.fontSize = `${scale}rem`;
                const host = document.getElementById("viewer");
                host.dataset.theme = mode;
                host.style.setProperty("--by-view-controls-font", font);
                await renderUI({ controlsSize });
                const button = host.querySelector(".byVIEWthemeToggle");
                const rect = button.getBoundingClientRect();
                const style = getComputedStyle(button),
                  thumb = getComputedStyle(button, "::after");
                const innerWidth = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
                const innerHeight = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
                const position = (value, extent) => (value.endsWith("%") ? (parseFloat(value) * extent) / 100 : parseFloat(value));
                const transform = new DOMMatrixReadOnly(thumb.transform);
                const centerX = rect.left + parseFloat(style.borderLeftWidth) + position(thumb.left, innerWidth) + transform.m41 + parseFloat(thumb.width) / 2;
                const centerY = rect.top + parseFloat(style.borderTopWidth) + position(thumb.top, innerHeight) + transform.m42 + parseFloat(thumb.height) / 2;
                const icons = [...button.querySelectorAll("svg")];
                const icon = icons[mode === "dark" ? 1 : 0].getBoundingClientRect();
                return [Math.abs(centerX - icon.x - icon.width / 2), Math.abs(centerY - icon.y - icon.height / 2), Math.abs(centerY - rect.y - rect.height / 2)];
              },
              { scale, controlsSize, font, mode }
            );
            assert.ok(
              errors.every((error) => error < 0.06),
              `${scale} ${controlsSize} ${font} ${mode}: ${errors}`
            );
          }
        }
      }
    }
    await page.evaluate(async () => {
      document.documentElement.style.fontSize = "";
      document.getElementById("viewer").style.removeProperty("--by-view-controls-font");
      await renderUI();
    });
    for (const mode of ["light", "dark"]) {
      await page.locator("#viewer").evaluate((element, mode) => {
        element.dataset.theme = mode;
      }, mode);
      await page.evaluate(() => renderUI({ toolbar: false, controlsPosition: "bottom", sorting: false, pagination: false, collapsible: false, details: false, lineNumbers: false, loadMore: false }));
      assert.equal(await page.locator("#viewer :is(button, input, select, summary):visible").count(), 0);
      assert.equal(await page.locator(".byVIEWtoolbar").count(), 0);
      assert.equal(await page.locator("#viewer").evaluate((element) => element.classList.contains("byVIEWbottom")), false);
      assert.match(await page.locator("#viewer").textContent(), /needle/);
    }
    await page.evaluate(() => renderUI({ expandCollapse: true, collapsible: false, collapsed: true }));
    assert.equal(await page.locator("summary").count(), 0);
    assert.equal(await page.getByRole("button", { name: /all XML nodes/ }).count(), 0);
    assert.match(await page.locator("#viewer").textContent(), /needle/);
    await page.evaluate(() => renderUI({ credits: false }));
    assert.equal(await page.locator(".byVIEWinfo").count(), 0);
    assert.equal(await page.locator(".byVIEWcontrols button").count(), 5);
    await page.evaluate(() => renderUI({ credits: false, themeToggle: false, fontSizeControls: false, copyButton: false }));
    assert.equal(await page.locator(".byVIEWtoolbar").count(), 0);
    await page.evaluate((options) => renderUI({ fontSizeControls: true, ...options }), { search: true, copyNodes: true, copyValues: true, expandCollapse: true, statusBar: true });
    assert.equal(await page.locator(".byVIEWfontSize").count(), 3);
    assert.equal(await page.locator(".byVIEWpanel > .byVIEWstatus:visible").count(), 1);
    assert.ok(await page.locator(".byVIEWpanel > .byVIEWstatus").evaluate((status) => parseFloat(getComputedStyle(status).borderBottomWidth) > 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Denied");
          }
        }
      });
    });
    await page.locator(".byVIEWcopy").click();
    await page.mouse.move(0, 0);
    await page.locator(".byVIEWcopy").evaluate((element) => element.blur());
    assert.equal(await page.locator(".byVIEWcopy").getAttribute("data-state"), "error");
    assert.equal(await page.locator(".byVIEWcopy").textContent(), "Failed");
    await page.evaluate(() => {
      navigator.clipboard.writeText = async (value) => {
        window.copiedSource = value;
      };
    });
    await page.locator(".byVIEWcopy").click();
    assert.equal(await page.locator(".byVIEWcopy").getAttribute("data-state"), "success");
    assert.match(await page.evaluate(() => copiedSource), /needle/);
  } finally {
    await browser.close();
  }
});

test("document and content backgrounds stay independent through theme and toolbar changes", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, channel: process.env.BROWSER_CHANNEL || "chrome" });
  try {
    const page = await browser.newPage();
    await page.route("https://cdn.jsdelivr.net/**", (route) => route.abort());
    await page.setContent('<div id="viewer" data-theme="light"></div><div id="neighbor" data-theme="light"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../xml.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../xml.js") });
    await page.evaluate(async () => {
      for (const id of ["viewer", "neighbor"]) {
        const result = byXMLviewer(document.getElementById(id), "<root>ready</root>");
        await result?.ready;
      }
    });
    const root = page.locator("#viewer");
    const neighbor = await page.locator("#neighbor").evaluate((element) => getComputedStyle(element).backgroundColor);
    await root.evaluate((element) => {
      element.style.setProperty("--by-view-document-bg", "transparent");
      element.style.setProperty("--by-view-container-bg", "#123456");
    });
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#viewer .byVIEWcopy")).backgroundColor === "rgb(18, 52, 86)");
    for (const changeMode of [false, true]) {
      if (changeMode) await root.locator(".byVIEWthemeToggle").click();
      assert.equal(await root.evaluate((element) => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
      assert.equal(await root.locator(".byVIEWpanel").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(18, 52, 86)");
      assert.equal(
        await root
          .locator(".byVIEWcopy")
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor),
        "rgb(18, 52, 86)"
      );
      assert.equal(await root.locator(".byVIEWtoolbar").evaluate((element) => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
    }
    assert.equal(await page.locator("#neighbor").evaluate((element) => getComputedStyle(element).backgroundColor), neighbor);
    await root.evaluate((element) => element.style.removeProperty("--by-view-container-bg"));
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#viewer .byVIEWcopy")).backgroundColor === "rgb(39, 40, 34)");
    assert.notEqual(
      await root
        .locator(".byVIEWcopy")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
      "rgba(0, 0, 0, 0)"
    );
  } finally {
    await browser.close();
  }
});

test("animation options preserve initial visibility and override system motion preferences", async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "chrome", executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.route("https://cdn.jsdelivr.net/**", (route) => (route.request().url().endsWith("fontawesome.min.css") ? route.fulfill({ body: "", contentType: "text/css" }) : route.abort()));
    await page.setContent('<div id="motion-viewer" data-theme="light"></div>');
    await page.addStyleTag({ path: path.join(__dirname, "../xml.css") });
    await page.addScriptTag({ path: path.join(__dirname, "../xml.js") });
    await page.evaluate(() => {
      window.renderMotion = async (animations) => {
        window.motionController = byXMLviewer(document.getElementById("motion-viewer"), "<root>ready</root>", { animations });
        await motionController?.ready;
      };
    });
    await page.evaluate(() => renderMotion());
    const root = page.locator("#motion-viewer");
    assert.equal(await root.evaluate((element) => element.classList.contains("byVIEWmotion")), true);
    assert.equal(await root.evaluate((element) => getComputedStyle(element).opacity), "1");
    assert.equal(await root.evaluate((element) => element.getAnimations({ subtree: true }).length), 0, "Initial content does not animate");
    assert.equal(
      await root
        .locator("button")
        .first()
        .evaluate((element) => getComputedStyle(element).transitionDuration.split(",")[0]),
      "0.18s"
    );
    const disclosure = await root.evaluateHandle((element) => {
      const details = document.createElement("details");
      details.id = "motion-disclosure";
      details.innerHTML = "<summary>Details</summary><p>Already available content</p>";
      element.append(details);
      getComputedStyle(details, "::details-content").blockSize;
      return details;
    });
    await disclosure.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("motion-disclosure"), "::details-content").opacity === "0");
    const opening = await disclosure.evaluate(async (details) => {
      details.open = true;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return Number(getComputedStyle(details, "::details-content").opacity);
    });
    assert.ok(opening > 0 && opening < 1, "A deliberate disclosure eases in even with reduced motion requested");
    await page.waitForFunction(() => getComputedStyle(document.getElementById("motion-disclosure"), "::details-content").opacity === "1");
    await disclosure.evaluate((details) => {
      details.open = false;
    });
    await page.waitForFunction(() => getComputedStyle(document.getElementById("motion-disclosure"), "::details-content").opacity === "0");
    assert.equal(await disclosure.evaluate((details) => details.open), false);
    await page.evaluate(() => renderMotion(false));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(await root.evaluate((element) => element.classList.contains("byVIEWmotion")), false);
    assert.equal(
      await root
        .locator("button")
        .first()
        .evaluate((element) => getComputedStyle(element).transitionDuration),
      "0s"
    );
    assert.equal(await root.evaluate((element) => element.getAnimations({ subtree: true }).length), 0);
  } finally {
    await browser.close();
  }
});
