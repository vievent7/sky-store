'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let _puppeteer = null;
function getPuppeteer() {
  if (_puppeteer) return _puppeteer;
  _puppeteer = require('puppeteer');
  return _puppeteer;
}

async function waitForVisualReady(page) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const imgs = Array.from(document.images || []);
    await Promise.all(imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  });
}

async function waitForStableBox(page, selector, attempts = 8, delayMs = 60) {
  let prev = null;
  let stableCount = 0;
  for (let i = 0; i < attempts; i++) {
    const box = await page.$eval(selector, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (
      prev &&
      Math.abs(box.width - prev.width) < 0.5 &&
      Math.abs(box.height - prev.height) < 0.5 &&
      Math.abs(box.x - prev.x) < 0.5 &&
      Math.abs(box.y - prev.y) < 0.5
    ) {
      stableCount++;
      if (stableCount >= 2) return box;
    } else {
      stableCount = 0;
    }
    prev = box;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return prev;
}

async function captureCardPngFromHtml({ cleanHtmlPath, cardId, storagePath }) {
  if (!cleanHtmlPath || !fs.existsSync(cleanHtmlPath)) {
    throw new Error('HTML canonique introuvable pour screenshot');
  }

  const generatedDir = path.join(storagePath, 'generated');
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });
  const outPath = path.join(generatedDir, cardId + '_final.png');

  const puppeteer = getPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 2000, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(cleanHtmlPath).toString(), { waitUntil: 'networkidle0' });
    await waitForVisualReady(page);

    const rootSelector = '[data-card-root="1"]';
    let selectorUsed = rootSelector;
    let target = await page.$(selectorUsed);
    if (!target) throw new Error('conteneur carte [data-card-root="1"] introuvable pour screenshot');

    const metrics = await page.$eval(rootSelector, (el) => {
      const root = el.getBoundingClientRect();
      const childEl = el.firstElementChild;
      const child = childEl ? childEl.getBoundingClientRect() : null;
      const style = window.getComputedStyle(el);
      return {
        root: { width: root.width, height: root.height, x: root.x, y: root.y },
        child: child ? { width: child.width, height: child.height, x: child.x, y: child.y } : null,
        display: style.display,
        position: style.position
      };
    });

    if (
      metrics.child &&
      metrics.child.width > 0 &&
      metrics.child.height > 0 &&
      (metrics.root.width > metrics.child.width * 1.15 || metrics.root.height > metrics.child.height * 1.15)
    ) {
      selectorUsed = `${rootSelector} > *:first-child`;
      target = await page.$(selectorUsed);
    }

    const stableBox = await waitForStableBox(page, selectorUsed);
    if (!stableBox || !stableBox.width || !stableBox.height) {
      throw new Error('dimensions de carte invalides pour screenshot');
    }

    await page.setViewport({
      width: Math.max(Math.ceil(stableBox.width) + 80, 900),
      height: Math.max(Math.ceil(stableBox.height) + 80, 900),
      deviceScaleFactor: 2
    });
    await waitForVisualReady(page);
    await waitForStableBox(page, selectorUsed);

    target = await page.$(selectorUsed);
    if (!target) throw new Error('conteneur carte [data-card-root="1"] introuvable apres resize viewport');

    await target.screenshot({
      path: outPath,
      type: 'png',
      omitBackground: false
    });

    if (!fs.existsSync(outPath)) {
      throw new Error('capture PNG non ecrite');
    }
    return { imagePath: outPath, selectorUsed, metrics };
  } finally {
    await browser.close();
  }
}

module.exports = { captureCardPngFromHtml };
