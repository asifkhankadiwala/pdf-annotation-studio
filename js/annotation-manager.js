/**
 * Annotation storage, drawing, and DOM rendering.
 * Coordinates are normalized (0–1) relative to page dimensions for zoom resilience.
 */
import {
  getParty,
  getFieldType,
  normalizedFieldSize,
} from './field-config.js';

export class AnnotationManager {
  constructor() {
    this.annotations = [];
    this.selectedId = null;
    this.tool = 'select';
    this.fieldType = null;
    this.party = 'party_1';
    this.color = '#fbbf24';
    this.strokeWidth = 3;
    this.isDrawing = false;
    this.drawStart = null;
    this.currentPath = null;
    this.pendingNote = null;
    this.layers = {};
    this.activeDrawPage = null;
    this.previewSvg = null;
    this.isDragging = false;
    this.dragPage = null;
    this.dragLayerEl = null;
    this.dragAnnId = null;
    this.dragOffset = null;
    this.dragEnabled = true;
    this.canDragAnnotation = null;
    this.onChange = null;
    this.onSelect = null;
  }

  generateId() {
    return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  setParty(partyId) {
    this.party = partyId;
    this.renderAll();
  }

  setTool(tool) {
    if (this.isDrawing && this.tool === 'draw' && this.activeDrawPage) {
      this.finishDrawSession(this.activeDrawPage);
    }
    this.tool = tool;
    this.fieldType = null;
    this.deselect();
    this.updateLayerCursors();
  }

  setFieldTool(fieldType) {
    if (this.isDrawing && this.tool === 'draw' && this.activeDrawPage) {
      this.finishDrawSession(this.activeDrawPage);
    }
    this.tool = 'field';
    this.fieldType = fieldType;
    this.deselect();
    this.updateLayerCursors();
  }

  clearFieldTool() {
    this.fieldType = null;
    if (this.tool === 'field') {
      this.tool = 'select';
    }
    this.updateLayerCursors();
  }

  setColor(color) {
    this.color = color;
  }

  setStrokeWidth(width) {
    this.strokeWidth = width;
  }

  setDragEnabled(enabled) {
    this.dragEnabled = Boolean(enabled);
  }

  setCanDragAnnotation(fn) {
    this.canDragAnnotation = typeof fn === 'function' ? fn : null;
  }

  registerLayer(pageNum, layerEl) {
    this.layers[pageNum] = layerEl;
    this.renderPage(pageNum);
    this.bindLayerEvents(pageNum, layerEl);
    this.updateLayerCursors();
  }

  updateLayerCursors() {
    Object.values(this.layers).forEach((el) => {
      const $el = $(el);
      $el.removeClass(
        'is-interactive tool-select tool-highlight tool-rectangle tool-note tool-draw tool-field'
      );
      if (this.tool === 'select') {
        $el.addClass('is-interactive tool-select');
      } else {
        $el.addClass(`is-interactive tool-${this.tool}`);
      }
    });
  }

  bindLayerEvents(pageNum, layerEl) {
    const $layer = $(layerEl);
    $layer.off('.ann');

    $layer.on('mousedown.ann', (e) => this.handleMouseDown(e, pageNum, layerEl));
    $layer.on('mousemove.ann', (e) => this.handleMouseMove(e, pageNum, layerEl));
    $layer.on('mouseup.ann', (e) => this.handleMouseUp(e, pageNum, layerEl));

    $layer.on('click.ann', '.annotation-shape', (e) => {
      e.stopPropagation();
      const id = $(e.currentTarget).data('id');
      const ann = this.getAnnotationById(id);
      if (typeof this.onShapeClick === 'function') {
        const shouldContinue = this.onShapeClick(id, ann, e);
        if (shouldContinue === false) {
          return;
        }
      }
      this.select(id);
    });

    $layer.on('mousedown.ann', '.annotation-shape', (e) => {
      e.stopPropagation();
      if (!this.dragEnabled) {
        return;
      }
      const id = $(e.currentTarget).data('id');
      const ann = this.getAnnotationById(id);
      if (
        typeof this.canDragAnnotation === 'function' &&
        !this.canDragAnnotation(ann, e)
      ) {
        return;
      }
      this.startDrag(id, pageNum, layerEl, e);
    });

    $layer.on('dblclick.ann', '.annotation-note', (e) => {
      e.stopPropagation();
      const id = $(e.currentTarget).closest('.annotation-shape').data('id');
      if (typeof this.onNoteEdit === 'function') {
        this.onNoteEdit(id);
      }
    });
  }

  getRelativeCoords(e, layerEl) {
    const rect = layerEl.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / height)),
      px: e.clientX - rect.left,
      py: e.clientY - rect.top,
      w: width,
      h: height,
    };
  }

  bindDocumentDrawEvents(pageNum, layerEl) {
    const onMove = (e) => this.handleMouseMove(e, pageNum, layerEl);
    const onUp = (e) => {
      if (this.isDrawing && this.tool === 'draw') {
        this.handleMouseUp(e, pageNum, layerEl);
      }
    };

    $(document)
      .off('.annDraw')
      .on('mousemove.annDraw', onMove)
      .on('mouseup.annDraw', onUp);
  }

  unbindDocumentDrawEvents() {
    $(document).off('.annDraw');
  }

  finishDrawSession(pageNum) {
    this.currentPath = null;
    this.isDrawing = false;
    this.activeDrawPage = null;
    this.unbindDocumentDrawEvents();
    this.clearPreview(pageNum);
    this.renderPage(pageNum);
  }

  ensurePreviewSvg(pageNum, layerEl) {
    const $layer = $(layerEl);
    $layer.find('.ann-preview-stroke').remove();

    const w = layerEl.offsetWidth || 1;
    const h = layerEl.offsetHeight || 1;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ann-preview-stroke');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:20';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    $layer.append(svg);
    this.previewSvg = { svg, path, w, h, layerEl };
  }

  updatePreviewPath(layerEl) {
    if (!this.currentPath || !this.previewSvg) {
      return;
    }

    const el = layerEl || this.previewSvg.layerEl;
    const w = el.offsetWidth || this.previewSvg.w;
    const h = el.offsetHeight || this.previewSvg.h;

    if (this.previewSvg.svg.parentNode !== el) {
      this.ensurePreviewSvg(this.currentPath.page, el);
    }

    this.previewSvg.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.previewSvg.path.setAttribute('stroke', this.currentPath.color);
    this.previewSvg.path.setAttribute('stroke-width', this.currentPath.strokeWidth);
    this.previewSvg.path.setAttribute(
      'd',
      this.buildPathD(this.currentPath.points, w, h)
    );
  }

  buildPathD(points, w, h) {
    if (!points.length) {
      return '';
    }
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0] * w} ${p[1] * h}`)
      .join(' ');
  }

  handleMouseDown(e, pageNum, layerEl) {
    if (this.tool === 'select') {
      if ($(e.target).closest('.annotation-shape').length === 0) {
        this.deselect();
      }
      // If mousedown started a drag, startDrag() already handled it.
      return;
    }

    e.preventDefault();
    const coords = this.getRelativeCoords(e, layerEl);

    if (this.tool === 'field' && this.fieldType) {
      if ($(e.target).closest('.annotation-shape').length) {
        return;
      }
      this.placeField(pageNum, layerEl, coords);
      return;
    }

    if (this.tool === 'note') {
      this.pendingNote = { pageNum, x: coords.x, y: coords.y };
      if (typeof this.onNoteEdit === 'function') {
        this.onNoteEdit(null, { pageNum, x: coords.x, y: coords.y });
      }
      return;
    }

    if (this.tool === 'draw') {
      this.isDrawing = true;
      this.activeDrawPage = pageNum;
      this.currentPath = {
        id: this.generateId(),
        type: 'draw',
        page: pageNum,
        color: this.color,
        strokeWidth: this.strokeWidth,
        points: [[coords.x, coords.y]],
        createdAt: new Date().toISOString(),
      };
      this.ensurePreviewSvg(pageNum, layerEl);
      this.updatePreviewPath(layerEl);
      this.bindDocumentDrawEvents(pageNum, layerEl);
      return;
    }

    this.isDrawing = true;
    this.drawStart = { pageNum, ...coords };
  }

  handleMouseMove(e, pageNum, layerEl) {
    if (!this.isDrawing) {
      return;
    }

    const coords = this.getRelativeCoords(e, layerEl);

    if (this.tool === 'draw' && this.currentPath) {
      const pts = this.currentPath.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(coords.x - last[0], coords.y - last[1]) > 0.002) {
        pts.push([coords.x, coords.y]);
      }
      this.updatePreviewPath(layerEl);
      return;
    }

    if (this.drawStart && (this.tool === 'highlight' || this.tool === 'rectangle')) {
      this.renderPreview(pageNum, coords);
    }
  }

  handleMouseUp(e, pageNum, layerEl) {
    if (!this.isDrawing) {
      return;
    }

    const coords = this.getRelativeCoords(e, layerEl);

    if (this.tool === 'draw' && this.currentPath) {
      const pts = this.currentPath.points;
      if (pts.length === 1) {
        pts.push([coords.x, coords.y]);
      }
      if (pts.length >= 2) {
        this.annotations.push(this.currentPath);
        this.notifyChange();
      }
      this.finishDrawSession(pageNum);
      return;
    }

    if (this.drawStart && this.tool === 'highlight') {
      const ann = this.createBoxAnnotation('highlight', this.drawStart, coords);
      if (ann) {
        this.annotations.push(ann);
        this.notifyChange();
      }
    }

    if (this.drawStart && this.tool === 'rectangle') {
      const ann = this.createBoxAnnotation('rectangle', this.drawStart, coords);
      if (ann) {
        this.annotations.push(ann);
        this.notifyChange();
      }
    }

    this.isDrawing = false;
    this.drawStart = null;
    this.clearPreview(pageNum);
    this.renderPage(pageNum);
  }

  getAnnotationById(id) {
    return this.annotations.find((a) => a.id === id) || null;
  }

  updateAnnotation(id, patch) {
    const ann = this.getAnnotationById(id);
    if (!ann) {
      return false;
    }
    Object.assign(ann, patch || {});
    this.notifyChange();
    if (ann.page) {
      this.renderPage(ann.page);
    } else {
      this.renderAll();
    }
    return true;
  }

  addAnnotation(annotation) {
    if (!annotation || typeof annotation !== 'object') {
      return null;
    }
    this.annotations.push(annotation);
    this.notifyChange();
    if (annotation.page) {
      this.renderPage(annotation.page);
    } else {
      this.renderAll();
    }
    return annotation.id || null;
  }

  startDrag(id, pageNum, layerEl, e) {
    const ann = this.getAnnotationById(id);
    if (!ann) return;

    // While in "field placement" mode, only allow dragging field widgets.
    if (this.tool === 'field' && ann.type !== 'field') return;

    // Don't drag freehand drawings as they are full-page overlays.
    if (ann.type === 'draw') return;

    this.isDragging = true;
    this.dragPage = pageNum;
    this.dragLayerEl = layerEl;
    this.dragAnnId = id;
    this.select(id);

    const coords = this.getRelativeCoords(e, layerEl);
    this.dragOffset = { x: coords.x - (ann.x || 0), y: coords.y - (ann.y || 0) };

    this.bindDocumentDragEvents();
  }

  bindDocumentDragEvents() {
    $(document).off('.annDrag');
    $(document)
      .on('mousemove.annDrag', (e) => this.handleDragMove(e))
      .on('mouseup.annDrag', (e) => this.handleDragUp(e));
  }

  handleDragMove(e) {
    if (!this.isDragging || !this.dragAnnId || !this.dragLayerEl || !this.dragPage) return;

    const ann = this.getAnnotationById(this.dragAnnId);
    if (!ann) return;

    const coords = this.getRelativeCoords(e, this.dragLayerEl);
    const w = ann.width ?? 0;
    const h = ann.height ?? 0;

    const maxX = 1 - (typeof w === 'number' ? w : 0);
    const maxY = 1 - (typeof h === 'number' ? h : 0);

    ann.x = Math.max(0, Math.min(maxX, coords.x - this.dragOffset.x));
    ann.y = Math.max(0, Math.min(maxY, coords.y - this.dragOffset.y));

    this.renderPage(this.dragPage);
  }

  handleDragUp() {
    this.isDragging = false;
    this.dragPage = null;
    this.dragLayerEl = null;
    this.dragAnnId = null;
    this.dragOffset = null;
    $(document).off('.annDrag');
  }

  createBoxAnnotation(type, start, end) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    if (width < 0.01 || height < 0.005) {
      return null;
    }

    return {
      id: this.generateId(),
      type,
      page: start.pageNum,
      x,
      y,
      width,
      height,
      color: this.color,
      strokeWidth: this.strokeWidth,
      createdAt: new Date().toISOString(),
    };
  }

  placeField(pageNum, layerEl, coords) {
    const layerW = layerEl.offsetWidth || 1;
    const layerH = layerEl.offsetHeight || 1;
    const size = normalizedFieldSize(this.fieldType, layerW, layerH);
    const x = Math.max(0, Math.min(1 - size.width, coords.x - size.width / 2));
    const y = Math.max(0, Math.min(1 - size.height, coords.y - size.height / 2));

    const ann = {
      id: this.generateId(),
      type: 'field',
      fieldType: this.fieldType,
      party: this.party,
      page: pageNum,
      x,
      y,
      width: size.width,
      height: size.height,
      createdAt: new Date().toISOString(),
    };

    this.annotations.push(ann);
    this.notifyChange();
    this.renderPage(pageNum);
    this.select(ann.id);
    return ann.id;
  }

  addNote(pageNum, x, y, text) {
    const ann = {
      id: this.generateId(),
      type: 'note',
      page: pageNum,
      x,
      y,
      text: text || '',
      color: this.color,
      createdAt: new Date().toISOString(),
    };
    this.annotations.push(ann);
    this.pendingNote = null;
    this.notifyChange();
    this.renderPage(pageNum);
    return ann.id;
  }

  updateNoteText(id, text) {
    const ann = this.annotations.find((a) => a.id === id);
    if (ann) {
      ann.text = text;
      this.notifyChange();
      this.renderPage(ann.page);
    }
  }

  select(id) {
    this.selectedId = id;
    this.renderAll();
    if (typeof this.onSelect === 'function') {
      this.onSelect(id);
    }
  }

  deselect() {
    this.selectedId = null;
    this.renderAll();
    if (typeof this.onSelect === 'function') {
      this.onSelect(null);
    }
  }

  deleteSelected() {
    if (!this.selectedId) {
      return false;
    }
    const ann = this.annotations.find((a) => a.id === this.selectedId);
    this.annotations = this.annotations.filter((a) => a.id !== this.selectedId);
    const page = ann ? ann.page : null;
    this.selectedId = null;
    this.notifyChange();
    if (page) {
      this.renderPage(page);
    } else {
      this.renderAll();
    }
    return true;
  }

  getByPage(pageNum) {
    return this.annotations.filter((a) => a.page === pageNum);
  }

  renderAll() {
    Object.keys(this.layers).forEach((p) => this.renderPage(Number(p)));
  }

  renderPage(pageNum) {
    const layerEl = this.layers[pageNum];
    if (!layerEl) {
      return;
    }

    const $layer = $(layerEl);
    $layer.find('.annotation-shape, .annotation-draw, .ann-preview, .ann-preview-stroke').remove();

    this.getByPage(pageNum).forEach((ann) => {
      const $shape = this.createShapeElement(ann, layerEl);
      if ($shape) {
        $layer.append($shape);
      }
    });
  }

  createShapeElement(ann, layerEl) {
    const w = layerEl.offsetWidth;
    const h = layerEl.offsetHeight;
    const isSelected = ann.id === this.selectedId;

    if (ann.type === 'field') {
      if (ann.replacedByTextId) {
        return null;
      }
      const party = getParty(ann.party);
      const fieldCfg = getFieldType(ann.fieldType);
      const $field = $('<div>')
        .addClass('annotation-shape pdf-field')
        .attr('data-id', ann.id)
        .css({
          left: `${ann.x * 100}%`,
          top: `${ann.y * 100}%`,
          width: `${ann.width * 100}%`,
          height: `${ann.height * 100}%`,
        });

      if (isSelected) {
        $field.addClass('is-selected');
      }

      const $label = $('<span>')
        .addClass('pdf-field__label')
        .toggleClass('pdf-field__label--large', Boolean(fieldCfg?.largeText))
        .text(fieldCfg?.placeholder || ann.fieldType);

      // TourCntrl markup widgets show only the colored tab + colored rectangle + text.
      const $tab = $('<div>').addClass('pdf-field__tab').css('background', party.color);
      const $body = $('<div>')
        .addClass('pdf-field__body')
        .css('background', party.bgColor);
      $body.append($label);
      $field.append($tab).append($body);
      return $field;
    }

    if (ann.type === 'filled_text') {
      const $text = $('<div>')
        .addClass('annotation-shape pdf-filled-text')
        .attr('data-id', ann.id)
        .css({
          left: `${ann.x * 100}%`,
          top: `${ann.y * 100}%`,
          minWidth: ann.width ? `${ann.width * 100}%` : undefined,
          minHeight: ann.height ? `${ann.height * 100}%` : undefined,
        });

      if (isSelected) {
        $text.addClass('is-selected');
      }

      const $label = $('<span>')
        .addClass('pdf-filled-text__label')
        .text(ann.text || '');
      if (ann.fieldType === 'signature') {
        $label.addClass('pdf-filled-text__label--signature');
      }
      $text.append($label);
      return $text;
    }

    if (ann.type === 'draw') {
      const $svgWrap = $('<div>').addClass('annotation-draw');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', this.buildPathD(ann.points, w, h));
      path.setAttribute('stroke', ann.color);
      path.setAttribute('stroke-width', ann.strokeWidth);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      $svgWrap.append(svg);

      const $wrap = $('<div>')
        .addClass('annotation-shape annotation-shape--draw')
        .attr('data-id', ann.id)
        .css({
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          color: ann.color,
          pointerEvents: 'none',
        });
      if (isSelected) {
        $wrap.addClass('is-selected').css('pointerEvents', 'auto');
      }
      $wrap.append($svgWrap);
      return $wrap;
    }

    const $el = $('<div>')
      .addClass('annotation-shape')
      .attr('data-id', ann.id)
      .css({
        left: `${ann.x * 100}%`,
        top: `${ann.y * 100}%`,
        width: ann.width ? `${ann.width * 100}%` : undefined,
        height: ann.height ? `${ann.height * 100}%` : undefined,
        color: ann.color,
      });

    if (isSelected) {
      $el.addClass('is-selected');
    }

    if (ann.type === 'highlight') {
      $el.addClass('annotation-highlight');
    } else if (ann.type === 'rectangle') {
      $el.addClass('annotation-rectangle').css('border-width', ann.strokeWidth);
    } else if (ann.type === 'note') {
      $el.addClass('annotation-note');
      $el.append(
        $('<span>').addClass('annotation-note__preview').text(ann.text || '(empty note)')
      );
    }

    return $el;
  }

  renderPreview(pageNum, endCoords) {
    const layerEl = this.layers[pageNum];
    if (!layerEl) {
      return;
    }

    $(layerEl).find('.ann-preview').remove();

    if (this.drawStart && endCoords) {
      const ann = this.createBoxAnnotation(this.tool, this.drawStart, endCoords);
      if (ann) {
        ann.id = 'preview';
        const $p = this.createShapeElement(ann, layerEl).addClass('ann-preview');
        $(layerEl).append($p);
      }
    }
  }

  clearPreview(pageNum) {
    const layerEl = this.layers[pageNum];
    if (layerEl) {
      $(layerEl).find('.ann-preview, .ann-preview-stroke').remove();
    }
    this.previewSvg = null;
  }

  notifyChange() {
    if (typeof this.onChange === 'function') {
      this.onChange(this.annotations);
    }
  }

  exportJson() {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        annotations: this.annotations,
      },
      null,
      2
    );
  }

  importJson(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const list = data.annotations || data;
    if (!Array.isArray(list)) {
      throw new Error('Invalid annotation file');
    }
    this.annotations = list;
    this.selectedId = null;
    this.renderAll();
    this.notifyChange();
  }

  clear() {
    this.unbindDocumentDrawEvents();
    this.previewSvg = null;
    this.currentPath = null;
    this.isDrawing = false;
    this.activeDrawPage = null;
    this.annotations = [];
    this.selectedId = null;
    this.layers = {};
    this.notifyChange();
  }

  getSummary(ann) {
    const labels = {
      highlight: 'Highlight',
      rectangle: 'Rectangle',
      note: 'Note',
      draw: 'Drawing',
      field: 'Field',
    };
    let text = labels[ann.type] || ann.type;
    if (ann.type === 'field') {
      const party = getParty(ann.party);
      const fieldCfg = getFieldType(ann.fieldType);
      text = `${fieldCfg?.label || ann.fieldType} · ${party.shortLabel}`;
    }
    if (ann.type === 'note' && ann.text) {
      text = ann.text.length > 40 ? `${ann.text.slice(0, 40)}…` : ann.text;
    }
    return text;
  }

  getAnnotationColor(ann) {
    if (ann.type === 'field') {
      return getParty(ann.party).color;
    }
    return ann.color || '#6366f1';
  }
}
