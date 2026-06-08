/**
 * PDF rendering with PDF.js — canvas layer per page.
 */
export class PdfViewer {
  constructor(containerEl, pdfjsLib) {
    this.container =
      typeof containerEl === 'string'
        ? document.querySelector(containerEl)
        : containerEl;
    this.pdfjsLib = pdfjsLib;
    this.doc = null;
    this.scale = 1.25;
    this.currentPage = 1;
    this.pageViewports = {};
    this.onPageRendered = null;
  }

  async loadFromArrayBuffer(buffer) {
    const loadingTask = this.pdfjsLib.getDocument({ data: buffer });
    this.doc = await loadingTask.promise;
    this.currentPage = 1;
    return this.doc.numPages;
  }

  get numPages() {
    return this.doc ? this.doc.numPages : 0;
  }

  setScale(scale) {
    this.scale = Math.min(3, Math.max(0.5, scale));
    return this.scale;
  }

  async renderPage(pageNum) {
    if (!this.doc) {
      return null;
    }

    const page = await this.doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });
    this.pageViewports[pageNum] = viewport;

    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.dataset.page = String(pageNum);
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    const ctx = canvas.getContext('2d');
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    ctx.scale(outputScale, outputScale);
    wrapper.appendChild(canvas);

    const layer = document.createElement('div');
    layer.className = 'annotation-layer';
    layer.dataset.page = String(pageNum);
    layer.style.width = `${viewport.width}px`;
    layer.style.height = `${viewport.height}px`;
    wrapper.appendChild(layer);

    await page.render({ canvasContext: ctx, viewport }).promise;
    this.container.appendChild(wrapper);

    if (typeof this.onPageRendered === 'function') {
      this.onPageRendered(pageNum, layer, viewport);
    }

    return { pageNum, viewport, layerEl: layer };
  }

  async renderAllPages(onProgress) {
    this.container.replaceChildren();
    this.pageViewports = {};

    for (let i = 1; i <= this.numPages; i += 1) {
      await this.renderPage(i);
      if (typeof onProgress === 'function') {
        onProgress(i, this.numPages);
      }
    }
  }

  getLayerForPage(pageNum) {
    return this.container.querySelector(
      `.annotation-layer[data-page="${pageNum}"]`
    );
  }

  getViewport(pageNum) {
    return this.pageViewports[pageNum];
  }

  scrollToPage(pageNum) {
    const pageEl = this.container.querySelector(
      `.page-wrapper[data-page="${pageNum}"]`
    );
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  clear() {
    this.container.replaceChildren();
    this.doc = null;
    this.pageViewports = {};
    this.currentPage = 1;
  }
}
