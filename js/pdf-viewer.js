/**
 * PDF rendering with PDF.js — canvas layer per page.
 */
export class PdfViewer {
  constructor(containerEl, pdfjsLib) {
    this.$container = $(containerEl);
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

    const $wrapper = $('<div>')
      .addClass('page-wrapper')
      .attr('data-page', pageNum)
      .css({ width: viewport.width, height: viewport.height });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    const ctx = canvas.getContext('2d');
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    ctx.scale(outputScale, outputScale);

    $wrapper.append(canvas);

    const $layer = $('<div>')
      .addClass('annotation-layer')
      .attr('data-page', pageNum)
      .css({ width: viewport.width, height: viewport.height });

    $wrapper.append($layer);

    await page.render({ canvasContext: ctx, viewport }).promise;

    this.$container.append($wrapper);

    if (typeof this.onPageRendered === 'function') {
      this.onPageRendered(pageNum, $layer[0], viewport);
    }

    return { pageNum, viewport, layerEl: $layer[0] };
  }

  async renderAllPages(onProgress) {
    this.$container.empty();
    this.pageViewports = {};

    for (let i = 1; i <= this.numPages; i++) {
      await this.renderPage(i);
      if (typeof onProgress === 'function') {
        onProgress(i, this.numPages);
      }
    }
  }

  getLayerForPage(pageNum) {
    return this.$container.find(`.annotation-layer[data-page="${pageNum}"]`)[0];
  }

  getViewport(pageNum) {
    return this.pageViewports[pageNum];
  }

  scrollToPage(pageNum) {
    const $page = this.$container.find(`.page-wrapper[data-page="${pageNum}"]`);
    if ($page.length) {
      $page[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  clear() {
    this.$container.empty();
    this.doc = null;
    this.pageViewports = {};
    this.currentPage = 1;
  }
}
