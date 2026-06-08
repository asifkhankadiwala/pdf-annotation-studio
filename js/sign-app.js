import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
import { PdfViewer } from './pdf-viewer.js';
import { AnnotationManager } from './annotation-manager.js';
import { getFieldType, getParty } from './field-config.js';
import { getProfile, getFillValue } from './user-profile.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const SAMPLE_PDF_URL =
  'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';
const SAMPLE_PDF_NAME = 'sample-contract.pdf';
const LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY = 'pdfannotations.sample.sign.annotations';

const $ = window.jQuery;

const state = {
  viewer: null,
  annotations: null,
  signerParty: 'party_1',
  sourcePdfBytes: null,
  fileName: SAMPLE_PDF_NAME,
};
const SIGN_DEBUG = true;

function debugLog(...args) {
  if (!SIGN_DEBUG) {
    return;
  }
  console.log('[sign-debug]', ...args);
}

function init() {
  debugLog('init start');
  state.viewer = new PdfViewer('#page-container', pdfjsLib);
  state.annotations = new AnnotationManager();
  state.annotations.tool = 'select';
  state.annotations.setDragEnabled(true);
  state.annotations.setCanDragAnnotation((ann) => ann?.type === 'filled_text');
  debugLog('drag enabled only for filled_text annotations');

  state.viewer.onPageRendered = (pageNum, layerEl) => {
    state.annotations.registerLayer(pageNum, layerEl);
  };

  state.annotations.onShapeClick = (id, ann) => {
    debugLog('shape click received', { id, ann });
    if (ann?.type === 'field') {
      debugLog('shape is a field, calling fillField', { id });
      fillField(id);
      return false;
    }
    debugLog('shape is not a field, default select flow continues', { id, type: ann?.type });
    return true;
  };

  state.annotations.onChange = updateFieldStatus;
  bindUi();
  setProfileView();
  loadSamplePdf();
  window.__signDebugState = state;
  debugLog('init complete (window.__signDebugState is available)');
}

function bindUi() {
  $('#signer-party').on('change', function () {
    state.signerParty = $(this).val();
    setProfileView();
    updateFieldStatus();
    showToast(`Signing as ${getParty(state.signerParty).label}`, true);
  });

  $('#btn-prev').on('click', () => navigatePage(-1));
  $('#btn-next').on('click', () => navigatePage(1));
  $('#btn-zoom-in').on('click', () => changeZoom(0.25));
  $('#btn-zoom-out').on('click', () => changeZoom(-0.25));
  $('#btn-next-field').on('click', () => focusNextField());
  $('#btn-export-pdf').on('click', exportSignedPdf);

}

async function loadSamplePdf() {
  showToast('Loading sample PDF…');
  try {
    const timeout = AbortSignal.timeout(10000);
    const response = await fetch(SAMPLE_PDF_URL, { signal: timeout });
    const buffer = await response.arrayBuffer();
    await openPdf(buffer);
    loadSavedFieldsFromLocalStorage();
    showToast('Sample PDF loaded.', true);
  } catch (err) {
    console.error(err);
    showToast('Failed to load sample PDF.', false);
    showSampleLoadError();
  }
}

async function openPdf(buffer) {
  state.annotations.clear();
  state.viewer.clear();
  // Keep an immutable copy for export; PDF.js may transfer/consume the input buffer.
  state.sourcePdfBytes = new Uint8Array(buffer.slice(0));

  const numPages = await state.viewer.loadFromArrayBuffer(buffer);
  $('#empty-state').addClass('hidden');
  $('#viewer-scroll').removeClass('hidden');
  $('#btn-prev, #btn-next').prop('disabled', numPages <= 1);
  $('#btn-export-pdf').prop('disabled', false);

  updatePageIndicator(1, numPages);
  updateZoomLabel();
  await state.viewer.renderAllPages();
}

function loadSavedFieldsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY);
    debugLog('loading fields from localStorage', {
      key: LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY,
      hasRaw: Boolean(raw),
    });
    if (!raw) {
      updateFieldStatus();
      return;
    }
    const data = JSON.parse(raw);
    const list = (data.annotations || data || []).filter((ann) => ann?.type === 'field');
    debugLog('parsed saved fields', {
      totalParsed: Array.isArray(data?.annotations) ? data.annotations.length : Array.isArray(data) ? data.length : 0,
      fieldCount: list.length,
      sample: list[0],
    });
    state.annotations.importJson({ annotations: list });
    showToast(`Loaded ${list.length} fields from markup mode.`, true);
  } catch (err) {
    console.error(err);
    showToast('Could not load saved annotations.', false);
    updateFieldStatus();
  }
}

function fillField(id) {
  const ann = state.annotations.getAnnotationById(id);
  debugLog('fillField called', {
    id,
    signerParty: state.signerParty,
    annotationFound: Boolean(ann),
    annotationType: ann?.type,
    annotationParty: ann?.party,
    annotationFilled: ann?.filled,
  });
  if (!ann || ann.type !== 'field') {
    debugLog('fillField aborted: annotation missing or not field', { id, ann });
    return;
  }

  const annParty = normalizeParty(ann.party);
  const signerParty = normalizeParty(state.signerParty);
  debugLog('party comparison', { id, annParty, signerParty });
  if (annParty !== signerParty) {
    debugLog('fillField blocked: signer does not own field', { id, annParty, signerParty });
    showToast('This field is assigned to the other party.', false);
    return;
  }

  if (ann.filled) {
    debugLog('fillField blocked: field already filled', { id, filledValue: ann.filledValue });
    showToast('Field already completed.', true);
    return;
  }

  const profile = getProfile(state.signerParty);
  const fill = getFillValue(ann.fieldType, profile);
  const value = fill?.value || '';
  debugLog('resolved fill value', {
    id,
    fieldType: ann.fieldType,
    hasProfile: Boolean(profile),
    value,
  });

  const replacedTextId = state.annotations.generateId();
  state.annotations.updateAnnotation(id, {
    filled: true,
    filledValue: value,
    filledBy: state.signerParty,
    filledAt: new Date().toISOString(),
    replacedByTextId: replacedTextId,
  });
  state.annotations.addAnnotation({
    id: replacedTextId,
    type: 'filled_text',
    fieldType: ann.fieldType,
    party: ann.party,
    sourceFieldId: ann.id,
    page: ann.page,
    x: ann.x,
    y: ann.y,
    width: ann.width,
    height: ann.height,
    text: value,
    createdAt: new Date().toISOString(),
  });
  debugLog('annotation updated', {
    id,
    updatedField: state.annotations.getAnnotationById(id),
    createdText: state.annotations.getAnnotationById(replacedTextId),
  });

  state.viewer.currentPage = ann.page;
  updatePageIndicator(ann.page, state.viewer.numPages);
  showToast(`${getFieldType(ann.fieldType)?.label || ann.fieldType} filled.`, true);
}

function focusNextField() {
  const next = getPendingFieldsForSigner()[0];
  if (!next) {
    showToast('All required fields are complete.', true);
    return;
  }
  state.viewer.currentPage = next.page;
  state.viewer.scrollToPage(next.page);
  updatePageIndicator(next.page, state.viewer.numPages);
  state.annotations.select(next.id);
}

function getPendingFieldsForSigner() {
  return state.annotations.annotations.filter(
    (ann) =>
      ann.type === 'field' &&
      normalizeParty(ann.party) === normalizeParty(state.signerParty) &&
      !ann.filled
  );
}

function updateFieldStatus() {
  const fields = state.annotations.annotations.filter((ann) => ann.type === 'field');
  const pendingMine = getPendingFieldsForSigner();
  const completeMine = fields.filter(
    (ann) =>
      normalizeParty(ann.party) === normalizeParty(state.signerParty) &&
      ann.filled
  );
  const mineTotal = pendingMine.length + completeMine.length;

  $('#field-progress').text(`${completeMine.length} / ${mineTotal}`);
  $('#remaining-count').text(pendingMine.length);
  $('#btn-next-field').prop('disabled', pendingMine.length === 0);

  const $list = $('#field-list').empty();
  if (fields.length === 0) {
    $list.append('<li class="annotation-list__empty">No fields loaded yet</li>');
    return;
  }
  
  fields.forEach((ann) => {
    const party = getParty(normalizeParty(ann.party));
    const field = getFieldType(ann.fieldType);
    const isMine = normalizeParty(ann.party) === normalizeParty(state.signerParty);
    const isDone = Boolean(ann.filled);
    const badge = isDone ? 'Done' : 'Pending';
    const badgeClass = isDone ? 'field-item__badge--done' : 'field-item__badge--pending';

    const $item = $(`
      <li class="annotation-list__item ${isMine ? '' : 'is-muted'}" data-id="${ann.id}">
        <span class="annotation-list__icon" style="background:${party.color}"></span>
        <div class="annotation-list__body">
          <div class="annotation-list__type">${escapeHtml(field?.label || ann.fieldType)} · ${escapeHtml(party.shortLabel)}</div>
          <div class="annotation-list__text">${escapeHtml(isDone ? ann.filledValue || '' : field?.placeholder || '')}</div>
          <div class="annotation-list__page">Page ${ann.page}</div>
        </div>
        <span class="field-item__badge ${badgeClass}">${badge}</span>
      </li>
    `);

    $item.on('click', () => {
      state.viewer.currentPage = ann.page;
      state.viewer.scrollToPage(ann.page);
      updatePageIndicator(ann.page, state.viewer.numPages);
      state.annotations.select(ann.id);
    });

    $list.append($item);
  });
}

function setProfileView() {
  const profile = getProfile(state.signerParty);
  $('#profile-signature').text(profile.signature || '—');
  $('#profile-initials').text(profile.initials || '—');
  $('#profile-name').text(profile.name || '—');
  $('#profile-company').text(profile.company || '—');
  $('#profile-title').text(profile.title || '—');
}

function navigatePage(delta) {
  const total = state.viewer.numPages;
  if (!total) {
    return;
  }
  let page = state.viewer.currentPage + delta;
  page = Math.max(1, Math.min(total, page));
  state.viewer.currentPage = page;
  state.viewer.scrollToPage(page);
  updatePageIndicator(page, total);
}

function changeZoom(delta) {
  if (!state.viewer.doc) {
    return;
  }
  state.viewer.setScale(state.viewer.scale + delta);
  updateZoomLabel();
  reRenderDocument();
}

async function reRenderDocument() {
  const page = state.viewer.currentPage;
  const anns = [...state.annotations.annotations];
  state.annotations.layers = {};
  await state.viewer.renderAllPages();
  state.annotations.annotations = anns;
  state.annotations.renderAll();
  state.viewer.currentPage = page;
  updateFieldStatus();
}

function updatePageIndicator(current, total) {
  $('#page-indicator').text(`${current} / ${total}`);
}

function updateZoomLabel() {
  $('#zoom-label').text(`${Math.round(state.viewer.scale * 100)}%`);
}

function showToast(message, success) {
  const $toast = $('#toast');
  $toast
    .text(message)
    .removeClass('hidden is-success')
    .toggleClass('is-success', Boolean(success));

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $toast.addClass('hidden'), 2200);
}

async function exportSignedPdf() {
  if (!state.sourcePdfBytes) {
    showToast('No PDF loaded to export.', false);
    return;
  }

  try {
    showToast('Preparing export…');
    const { PDFDocument, rgb, StandardFonts } = await import(
      'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm'
    );
    const doc = await PDFDocument.load(state.sourcePdfBytes);
    const pages = doc.getPages();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

    state.annotations.annotations.forEach((ann) => {
      const pageIndex = Number(ann.page) - 1;
      const page = pages[pageIndex];
      if (!page) {
        return;
      }
      const { width, height } = page.getSize();

      const x = (ann.x || 0) * width;
      const yTop = (ann.y || 0) * height;
      const w = (ann.width || 0) * width;
      const h = (ann.height || 0) * height;
      const yBottom = height - yTop - h;

      if (ann.type === 'filled_text') {
        const text = String(ann.text || '');
        const isSignature = ann.fieldType === 'signature';
        const fontSize = isSignature ? 16 : 11;
        page.drawText(text, {
          x,
          y: height - yTop - fontSize,
          size: fontSize,
          font: isSignature ? helveticaOblique : helvetica,
          color: rgb(0.06, 0.09, 0.16),
        });
        return;
      }

      if (ann.type === 'field' && ann.filled && !ann.replacedByTextId) {
        const text = String(ann.filledValue || '');
        page.drawText(text, {
          x,
          y: height - yTop - 12,
          size: 11,
          font: ann.fieldType === 'signature' ? helveticaOblique : helvetica,
          color: rgb(0.06, 0.09, 0.16),
        });
      }

      if (ann.type === 'highlight' && w > 0 && h > 0) {
        page.drawRectangle({
          x,
          y: yBottom,
          width: w,
          height: h,
          color: rgb(0.98, 0.86, 0.22),
          opacity: 0.3,
        });
      }

      if (ann.type === 'rectangle' && w > 0 && h > 0) {
        page.drawRectangle({
          x,
          y: yBottom,
          width: w,
          height: h,
          borderColor: rgb(0.95, 0.35, 0.13),
          borderWidth: Math.max(1, Number(ann.strokeWidth) || 1),
          opacity: 1,
        });
      }

      if (ann.type === 'note') {
        const text = String(ann.text || '(note)');
        page.drawText(text, {
          x,
          y: height - yTop - 10,
          size: 9,
          font: helvetica,
          color: rgb(0.1, 0.1, 0.1),
        });
      }

      if (ann.type === 'draw' && Array.isArray(ann.points) && ann.points.length > 1) {
        const stroke = Math.max(1, Number(ann.strokeWidth) || 1);
        for (let i = 1; i < ann.points.length; i += 1) {
          const [x1n, y1n] = ann.points[i - 1];
          const [x2n, y2n] = ann.points[i];
          const x1 = x1n * width;
          const y1 = height - y1n * height;
          const x2 = x2n * width;
          const y2 = height - y2n * height;
          page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: stroke,
            color: rgb(0.2, 0.2, 0.2),
            opacity: 1,
          });
        }
      }
    });

    const pdfBytes = await doc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const downloadName = (state.fileName || 'signed-document').replace(/\.pdf$/i, '') + '-signed.pdf';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Signed PDF exported.', true);
  } catch (err) {
    console.error(err);
    showToast('Could not export PDF.', false);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeParty(party) {
  if (party === 'party1' || party === 'party_a') {
    return 'party_1';
  }
  if (party === 'party2' || party === 'party_b') {
    return 'party_2';
  }
  return party || 'party_1';
}

function showSampleLoadError() {
  const $card = $('#empty-state .empty-state__card');
  $('#empty-state').removeClass('hidden');
  $('#viewer-scroll').addClass('hidden');
  $card.find('h2').text('Could not load sample contract');
  $card.find('p').text('Check internet connection and retry.');

  let $retry = $('#btn-retry-sample-sign');
  if ($retry.length === 0) {
    $retry = $('<button id="btn-retry-sample-sign" type="button" class="btn btn--primary">Retry sample load</button>');
    $card.append($('<div class="empty-state__actions"></div>').append($retry));
    $retry.on('click', () => loadSamplePdf());
  }
}

$(init);
