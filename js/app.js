/**
 * PDF Annotation Studio — main application (jQuery + PDF.js)
 */
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
import { PdfViewer } from './pdf-viewer.js';
import { AnnotationManager } from './annotation-manager.js';
import { getParty } from './field-config.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const SAMPLE_PDF_URL =
  'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';
const LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY = 'pdfannotations.sample.sign.annotations';

const $ = window.jQuery;

const state = {
  viewer: null,
  annotations: null,
  fileName: '',
  noteEditId: null,
  notePlacement: null,
};

function init() {
  state.viewer = new PdfViewer('#page-container', pdfjsLib);
  state.annotations = new AnnotationManager();

  state.viewer.onPageRendered = (pageNum, layerEl) => {
    state.annotations.registerLayer(pageNum, layerEl);
  };

  state.annotations.onChange = updateSidebar;
  state.annotations.onSelect = (id) => {
    $('#btn-delete').prop('disabled', !id);
    highlightSidebarItem(id);
  };

  state.annotations.onNoteEdit = openNoteModal;

  bindUi();
  loadSamplePdf();
}

function bindUi() {
  $('.tool-btn').on('click', function () {
    $('.tool-btn').removeClass('is-active');
    $('.pdf-tool').removeClass('is-active');
    $(this).addClass('is-active');
    state.annotations.setTool($(this).data('tool'));
  });

  $('#party-select').on('change', function () {
    state.annotations.setParty($(this).val());
    const party = getParty($(this).val());
    showToast(`Assignee: ${party.label}`, true);
  });

  $('.pdf-tool').on('click', function () {
    const fieldType = $(this).data('field');

    if ($(this).hasClass('is-active')) {
      $(this).removeClass('is-active');
      $('.tool-btn[data-tool="select"]').addClass('is-active');
      state.annotations.clearFieldTool();
      return;
    }

    $('.pdf-tool').removeClass('is-active');
    $('.tool-btn').removeClass('is-active');
    $(this).addClass('is-active');
    state.annotations.setFieldTool(fieldType);
    const party = getParty(state.annotations.party);
    showToast(`Click PDF to place ${fieldType} (${party.shortLabel})`, true);
  });

  $('#color-picker .color-swatch').on('click', function () {
    $('#color-picker .color-swatch').removeClass('is-active');
    $(this).addClass('is-active');
    state.annotations.setColor($(this).data('color'));
  });

  $('#stroke-width').on('input', function () {
    const v = Number($(this).val());
    $('#stroke-label').text(`${v}px`);
    state.annotations.setStrokeWidth(v);
  });

  $('#btn-prev').on('click', () => navigatePage(-1));
  $('#btn-next').on('click', () => navigatePage(1));
  $('#btn-zoom-in').on('click', () => changeZoom(0.25));
  $('#btn-zoom-out').on('click', () => changeZoom(-0.25));

  $('#btn-delete').on('click', () => {
    if (state.annotations.deleteSelected()) {
      showToast('Annotation deleted.', true);
    }
  });

  $('#btn-export').on('click', exportAnnotations);
  $('#btn-sign-mode').on('click', goToSignMode);

  $('#note-save').on('click', saveNoteModal);
  $('#note-cancel, .modal__backdrop').on('click', closeNoteModal);

  $(document).on('keydown', (e) => {
    if (e.target.matches('textarea, input')) {
      return;
    }
    const shortcuts = {
      v: 'select',
      h: 'highlight',
      r: 'rectangle',
      n: 'note',
      d: 'draw',
    };
    if (shortcuts[e.key.toLowerCase()]) {
      $(`.tool-btn[data-tool="${shortcuts[e.key.toLowerCase()]}"]`).trigger('click');
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      state.annotations.deleteSelected();
    }
  });
}

async function loadSamplePdf() {
  showToast('Loading sample PDF…');
  state.fileName = 'sample.pdf';

  try {
    const timeout = AbortSignal.timeout(10000);
    const res = await fetch(SAMPLE_PDF_URL, { signal: timeout });
    const buffer = await res.arrayBuffer();
    await openPdf(buffer);
    showToast('Sample PDF loaded', true);
  } catch (err) {
    console.error(err);
    showToast('Could not load sample PDF.', false);
    showSampleLoadError();
  }
}

async function openPdf(buffer) {
  state.annotations.clear();
  state.viewer.clear();

  const numPages = await state.viewer.loadFromArrayBuffer(buffer);

  $('#empty-state').addClass('hidden');
  $('#viewer-scroll').removeClass('hidden');
  $('#btn-export').prop('disabled', false);
  $('#btn-prev, #btn-next').prop('disabled', numPages <= 1);

  updatePageIndicator(1, numPages);
  updateZoomLabel();

  await state.viewer.renderAllPages((current, total) => {
    showToast(`Rendering page ${current} of ${total}…`);
  });

  state.viewer.scrollToPage(1);
  updateSidebar([]);
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

  const newScale = state.viewer.setScale(state.viewer.scale + delta);
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
  updateSidebar(anns);
}

function updatePageIndicator(current, total) {
  $('#page-indicator').text(`${current} / ${total}`);
}

function updateZoomLabel() {
  $('#zoom-label').text(`${Math.round(state.viewer.scale * 100)}%`);
}

function updateSidebar(annotations) {
  const list = annotations || state.annotations.annotations;
  const $list = $('#annotation-list').empty();
  $('#annotation-count').text(list.length);

  if (list.length === 0) {
    $list.append('<li class="annotation-list__empty">No annotations yet</li>');
    return;
  }

  list.forEach((ann) => {
    const iconColor = state.annotations.getAnnotationColor(ann);
    const typeLabel = ann.type === 'field' ? ann.fieldType : ann.type;

    const $item = $(`
      <li class="annotation-list__item" data-id="${ann.id}">
        <span class="annotation-list__icon" style="background:${iconColor}"></span>
        <div class="annotation-list__body">
          <div class="annotation-list__type">${escapeHtml(typeLabel)}</div>
          <div class="annotation-list__text">${escapeHtml(state.annotations.getSummary(ann))}</div>
          <div class="annotation-list__page">Page ${ann.page}</div>
        </div>
      </li>
    `);

    if (ann.id === state.annotations.selectedId) {
      $item.addClass('is-active');
    }

    $item.on('click', () => {
      state.annotations.select(ann.id);
      state.viewer.currentPage = ann.page;
      state.viewer.scrollToPage(ann.page);
      updatePageIndicator(ann.page, state.viewer.numPages);
    });

    $list.append($item);
  });
}

function highlightSidebarItem(id) {
  $('#annotation-list .annotation-list__item').removeClass('is-active');
  if (id) {
    $(`#annotation-list .annotation-list__item[data-id="${id}"]`).addClass('is-active');
  }
}

function openNoteModal(id, placement) {
  state.noteEditId = id;
  state.notePlacement = placement || null;

  if (id) {
    const ann = state.annotations.annotations.find((a) => a.id === id);
    $('#note-text').val(ann ? ann.text : '');
    $('#note-modal-title').text('Edit note');
  } else {
    $('#note-text').val('');
    $('#note-modal-title').text('Add note');
  }

  $('#note-modal').removeClass('hidden');
  $('#note-text').focus();
}

function closeNoteModal() {
  $('#note-modal').addClass('hidden');
  state.noteEditId = null;
  state.notePlacement = null;
  state.annotations.pendingNote = null;
}

function saveNoteModal() {
  const text = $('#note-text').val().trim();

  if (state.noteEditId) {
    state.annotations.updateNoteText(state.noteEditId, text);
    showToast('Note updated.', true);
  } else if (state.notePlacement) {
    const { pageNum, x, y } = state.notePlacement;
    state.annotations.addNote(pageNum, x, y, text);
    showToast('Note added.', true);
  }

  closeNoteModal();
  updateSidebar();
}

function exportAnnotations() {
  const json = state.annotations.exportJson();
  const blob = new Blob([json], { type: 'application/json' });
  const name = (state.fileName || 'document').replace(/\.pdf$/i, '') + '-annotations.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Annotations exported.', true);
}

function importAnnotations(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      state.annotations.importJson(e.target.result);
      updateSidebar();
      showToast('Annotations imported.', true);
    } catch (err) {
      showToast('Invalid annotation file.', false);
    }
  };
  reader.readAsText(file);
}

function goToSignMode() {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY,
      state.annotations.exportJson()
    );
  } catch (err) {
    console.error(err);
  }
  window.location.href = 'sign.html';
}

function showSampleLoadError() {
  const $card = $('#empty-state .empty-state__card');
  $('#empty-state').removeClass('hidden');
  $('#viewer-scroll').addClass('hidden');
  $card.find('h2').text('Could not load sample contract');
  $card.find('p').text('Check internet connection and retry.');

  let $retry = $('#btn-retry-sample');
  if ($retry.length === 0) {
    $retry = $('<button id="btn-retry-sample" type="button" class="btn btn--primary">Retry sample load</button>');
    $card.append($('<div class="empty-state__actions"></div>').append($retry));
    $retry.on('click', () => loadSamplePdf());
  }
}

function showToast(message, success) {
  const $toast = $('#toast');
  $toast
    .text(message)
    .removeClass('hidden is-success')
    .addClass(success ? 'is-success' : '');

  clearTimeout($toast.data('timer'));
  const timer = setTimeout(() => $toast.addClass('hidden'), 2800);
  $toast.data('timer', timer);
}

function escapeHtml(str) {
  return $('<div>').text(str).html();
}

$(document).ready(init);
