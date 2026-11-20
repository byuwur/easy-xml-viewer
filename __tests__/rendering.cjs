/*
 * File: __tests__/rendering.cjs
 * Desc: Bounded, offline checks for the public XML renderer contract.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { chromium, firefox, webkit } = require("playwright");
const engine = process.env.BROWSER_ENGINE || "chromium";
assert.ok(["chromium", "firefox", "webkit"].includes(engine), "Unsupported BROWSER_ENGINE");

test("XML library", { timeout: 30000 }, async (t) => {
  const browser = await { chromium, firefox, webkit }[engine].launch({
    timeout: 10000,
    ...(engine === "chromium" ? { channel: process.env.BROWSER_CHANNEL, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {})
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Load authored files directly; CDN availability is not part of this contract.
  await page.route("**/*", (route) => route.abort());
  // ===== BROWSER FIXTURE =====
  await page.setContent('<!doctype html><meta charset="UTF-8"><div id="viewer"></div>');
  await page.addStyleTag({ path: path.join(__dirname, "../xml.css") });
  await page.addScriptTag({ path: path.join(__dirname, "../xml.js") });
  await page.evaluate(() => {
    window.root = document.getElementById("viewer");
  });

  // ===== RENDERING BEHAVIOR =====
  await t.test("renders nested XML and decoded values", async () => {
    assert.equal(
      await page.evaluate(
        () =>
          byXMLviewer(root, '<root><item id="one">value &amp; more</item></root>', {
            animations: false
          }).ready
      ),
      true
    );
    assert.match(await page.locator(".byXMLtree").textContent(), /item/);
    assert.match(await page.locator(".byXMLtree").textContent(), /value & more/);
  });

  await t.test("rejects malformed XML and DTDs, and keeps markup inert", async () => {
    const result = await page.evaluate(async () => {
      const malformed = await byXMLviewer(root, "<a><b></a>").ready;
      const dtd = await byXMLviewer(root, '<!DOCTYPE r [<!ENTITY x SYSTEM "https://invalid.test/secret">]><r>&x;</r>').ready;
      await byXMLviewer(root, '<r><img src="x" onerror="window.injected=1"/><script>window.injected=1</script></r>').ready;
      return {
        malformed,
        dtd,
        elements: root.querySelectorAll("img, script").length,
        injected: Boolean(window.injected)
      };
    });
    assert.deepEqual(result, { malformed: false, dtd: false, elements: 0, injected: false });
  });

  await t.test("replacement and disposal respect the current instance", async () => {
    const result = await page.evaluate(async () => {
      const old = byXMLviewer(root, "<old/>");
      await old.ready;
      const current = byXMLviewer(root, "<current/>");
      const ready = await current.ready;
      old.destroy();
      const preserved = root.textContent.includes("current");
      current.destroy();
      return { ready, preserved, empty: root.childNodes.length === 0 };
    });
    assert.deepEqual(result, { ready: true, preserved: true, empty: true });
  });

  assert.deepEqual(errors, [], "No uncaught browser errors");
});
