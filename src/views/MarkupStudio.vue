<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import { PdfViewer } from '@/lib/pdf-viewer.js';
import { AnnotationManager } from '@/lib/annotation-manager.js';
import { getParty } from '@/lib/field-config.js';
import {
  pdfjsLib,
  SAMPLE_PDF_URL,
  LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY,
} from '@/composables/usePdfJs.js';
import { useToast } from '@/composables/useToast.js';

const router = useRouter();
const { showToast } = useToast();

const pageContainerRef = ref(null);
const viewer = shallowRef(null);
const annotations = shallowRef(null);

const pdfLoaded = ref(false);
const loadError = ref(false);
const currentPage = ref(1);
const totalPages = ref(0);
const zoomPercent = ref(100);
const selectedId = ref(null);
const annotationList = ref([]);

const activeTool = ref('select');
const activeFieldTool = ref(null);
const party = ref('party_1');
const color = ref('#fbbf24');
const strokeWidth = ref(3);

const noteModalOpen = ref(false);
const noteEditId = ref(null);
const notePlacement = ref(null);
const noteText = ref('');

const colors = [
  { value: '#fbbf24', title: 'Yellow' },
  { value: '#34d399', title: 'Green' },
  { value: '#60a5fa', title: 'Blue' },
  { value: '#f472b6', title: 'Pink' },
  { value: '#ef4444', title: 'Red' },
];

const markupTools = [
  { id: 'select', title: 'Select (V)', shortcut: 'v' },
  { id: 'highlight', title: 'Highlight (H)', shortcut: 'h' },
  { id: 'rectangle', title: 'Rectangle (R)', shortcut: 'r' },
  { id: 'note', title: 'Sticky note (N)', shortcut: 'n' },
  { id: 'draw', title: 'Freehand (D)', shortcut: 'd' },
];

const fieldTools = [
  { id: 'signature', label: 'Signature' },
  { id: 'initial', label: 'Initials' },
  { id: 'date', label: 'Date' },
  { id: 'name', label: 'Name' },
  { id: 'company', label: 'Company' },
  { id: 'title', label: 'Title' },
];

const canDelete = computed(() => Boolean(selectedId.value));
const canExport = computed(() => pdfLoaded.value);
const pageIndicator = computed(() =>
  totalPages.value ? `${currentPage.value} / ${totalPages.value}` : '— / —'
);

function syncAnnotationList(list) {
  annotationList.value = [...list];
}

function setTool(tool) {
  activeTool.value = tool;
  activeFieldTool.value = null;
  annotations.value?.setTool(tool);
}

function setFieldTool(fieldType) {
  if (activeFieldTool.value === fieldType) {
    activeFieldTool.value = null;
    setTool('select');
    return;
  }
  activeFieldTool.value = fieldType;
  activeTool.value = 'field';
  annotations.value?.setFieldTool(fieldType);
  const p = getParty(party.value);
  showToast(`Click PDF to place ${fieldType} (${p.shortLabel})`, true);
}

function setParty(nextParty) {
  party.value = nextParty;
  annotations.value?.setParty(nextParty);
  showToast(`Assignee: ${getParty(nextParty).label}`, true);
}

function setColor(nextColor) {
  color.value = nextColor;
  annotations.value?.setColor(nextColor);
}

function setStroke(nextWidth) {
  strokeWidth.value = nextWidth;
  annotations.value?.setStrokeWidth(nextWidth);
}

function navigatePage(delta) {
  if (!viewer.value?.numPages) return;
  let page = viewer.value.currentPage + delta;
  page = Math.max(1, Math.min(viewer.value.numPages, page));
  viewer.value.currentPage = page;
  viewer.value.scrollToPage(page);
  currentPage.value = page;
}

function changeZoom(delta) {
  if (!viewer.value?.doc) return;
  viewer.value.setScale(viewer.value.scale + delta);
  zoomPercent.value = Math.round(viewer.value.scale * 100);
  reRenderDocument();
}

async function reRenderDocument() {
  const page = viewer.value.currentPage;
  const anns = [...annotations.value.annotations];
  annotations.value.layers = {};
  await viewer.value.renderAllPages();
  annotations.value.annotations = anns;
  annotations.value.renderAll();
  viewer.value.currentPage = page;
  currentPage.value = page;
  syncAnnotationList(anns);
}

function deleteSelected() {
  if (annotations.value?.deleteSelected()) {
    showToast('Annotation deleted.', true);
  }
}

function exportAnnotations() {
  const json = annotations.value.exportJson();
  const blob = new Blob([json], { type: 'application/json' });
  const name = 'sample-annotations.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Annotations exported.', true);
}

function goToSignMode() {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY,
      annotations.value.exportJson()
    );
  } catch (err) {
    console.error(err);
  }
  router.push('/sign');
}

function openNoteModal(id, placement) {
  noteEditId.value = id;
  notePlacement.value = placement || null;
  if (id) {
    const ann = annotations.value.annotations.find((a) => a.id === id);
    noteText.value = ann ? ann.text : '';
  } else {
    noteText.value = '';
  }
  noteModalOpen.value = true;
}

function closeNoteModal() {
  noteModalOpen.value = false;
  noteEditId.value = null;
  notePlacement.value = null;
  annotations.value.pendingNote = null;
}

function saveNoteModal() {
  const text = noteText.value.trim();
  if (noteEditId.value) {
    annotations.value.updateNoteText(noteEditId.value, text);
    showToast('Note updated.', true);
  } else if (notePlacement.value) {
    const { pageNum, x, y } = notePlacement.value;
    annotations.value.addNote(pageNum, x, y, text);
    showToast('Note added.', true);
  }
  closeNoteModal();
  syncAnnotationList(annotations.value.annotations);
}

function selectAnnotation(ann) {
  annotations.value.select(ann.id);
  viewer.value.currentPage = ann.page;
  viewer.value.scrollToPage(ann.page);
  currentPage.value = ann.page;
}

function onKeydown(e) {
  if (e.target.matches('textarea, input, select')) return;
  const shortcuts = { v: 'select', h: 'highlight', r: 'rectangle', n: 'note', d: 'draw' };
  const tool = shortcuts[e.key.toLowerCase()];
  if (tool) setTool(tool);
  if (e.key === 'Delete' || e.key === 'Backspace') {
    annotations.value?.deleteSelected();
  }
}

async function openPdf(buffer) {
  annotations.value.clear();
  viewer.value.clear();

  const numPages = await viewer.value.loadFromArrayBuffer(buffer);
  pdfLoaded.value = true;
  loadError.value = false;
  totalPages.value = numPages;
  currentPage.value = 1;
  zoomPercent.value = Math.round(viewer.value.scale * 100);

  await viewer.value.renderAllPages((current, total) => {
    showToast(`Rendering page ${current} of ${total}…`);
  });

  viewer.value.scrollToPage(1);
  syncAnnotationList([]);
}

async function loadSamplePdf() {
  showToast('Loading sample PDF…');
  try {
    const res = await fetch(SAMPLE_PDF_URL, { signal: AbortSignal.timeout(10000) });
    const buffer = await res.arrayBuffer();
    await openPdf(buffer);
    showToast('Sample PDF loaded', true);
  } catch (err) {
    console.error(err);
    loadError.value = true;
    pdfLoaded.value = false;
    showToast('Could not load sample PDF.', false);
  }
}

onMounted(() => {
  viewer.value = new PdfViewer(pageContainerRef.value, pdfjsLib);
  annotations.value = new AnnotationManager();

  viewer.value.onPageRendered = (pageNum, layerEl) => {
    annotations.value.registerLayer(pageNum, layerEl);
  };

  annotations.value.onChange = syncAnnotationList;
  annotations.value.onSelect = (id) => {
    selectedId.value = id;
  };
  annotations.value.onNoteEdit = openNoteModal;

  document.addEventListener('keydown', onKeydown);
  loadSamplePdf();
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="header__brand">
        <svg class="header__logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="4" y="2" width="20" height="26" rx="2" stroke="currentColor" stroke-width="2" />
          <path d="M10 12h12M10 17h8M10 22h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <circle cx="24" cy="24" r="6" fill="#6366f1" />
          <path d="M22 24l1.5 1.5L26 22" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="header__brand-text">
          <h1 class="header__title">PDF Annotation Studio</h1>
          <p class="header__subtitle">Vue 3 · Browser-based PDF markup</p>
        </div>
      </div>

      <nav class="header__toolbar" aria-label="Markup and view controls">
        <div class="header__cluster header__cluster--markup">
          <span class="header__cluster-label">Markup</span>
          <div class="header__tool-row">
            <button
              v-for="tool in markupTools"
              :key="tool.id"
              type="button"
              class="tool-btn tool-btn--compact"
              :class="{ 'is-active': activeTool === tool.id && !activeFieldTool }"
              :title="tool.title"
              @click="setTool(tool.id)"
            >
              <svg v-if="tool.id === 'select'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg>
              <svg v-else-if="tool.id === 'highlight'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
              <svg v-else-if="tool.id === 'rectangle'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
              <svg v-else-if="tool.id === 'note'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.5 1.5L13 11" /></svg>
            </button>
          </div>
        </div>

        <div class="header__divider" aria-hidden="true" />

        <div class="header__cluster header__cluster--color">
          <span class="header__cluster-label">Color</span>
          <div class="color-picker color-picker--header">
            <button
              v-for="swatch in colors"
              :key="swatch.value"
              type="button"
              class="color-swatch"
              :class="{ 'is-active': color === swatch.value }"
              :style="{ '--swatch': swatch.value }"
              :title="swatch.title"
              @click="setColor(swatch.value)"
            />
          </div>
        </div>

        <div class="header__cluster header__cluster--stroke">
          <span class="header__cluster-label">Stroke</span>
          <div class="header__stroke-row">
            <input
              v-model.number="strokeWidth"
              type="range"
              min="1"
              max="8"
              class="stroke-slider stroke-slider--header"
              title="Stroke width"
              @input="setStroke(strokeWidth)"
            />
            <span class="stroke-label">{{ strokeWidth }}px</span>
          </div>
        </div>

        <div class="header__divider" aria-hidden="true" />

        <div class="header__cluster header__cluster--page">
          <span class="header__cluster-label">Page</span>
          <div class="page-nav page-nav--header">
            <button type="button" class="icon-btn" :disabled="totalPages <= 1" aria-label="Previous page" @click="navigatePage(-1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span class="page-indicator">{{ pageIndicator }}</span>
            <button type="button" class="icon-btn" :disabled="totalPages <= 1" aria-label="Next page" @click="navigatePage(1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <div class="header__cluster header__cluster--zoom">
          <span class="header__cluster-label">Zoom</span>
          <div class="zoom-controls zoom-controls--header">
            <button type="button" class="icon-btn" aria-label="Zoom out" @click="changeZoom(-0.25)">−</button>
            <span class="zoom-label">{{ zoomPercent }}%</span>
            <button type="button" class="icon-btn" aria-label="Zoom in" @click="changeZoom(0.25)">+</button>
          </div>
        </div>

        <button
          type="button"
          class="icon-btn icon-btn--danger"
          :disabled="!canDelete"
          title="Delete selected"
          aria-label="Delete selected"
          @click="deleteSelected"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
        </button>
      </nav>

      <div class="header__actions">
        <button type="button" class="btn btn--ghost btn--sm" @click="goToSignMode">
          <span class="btn__text">Sign mode</span>
        </button>
        <button type="button" class="btn btn--primary btn--sm" :disabled="!canExport" @click="exportAnnotations">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
          <span class="btn__text">Export</span>
        </button>
      </div>
    </header>

    <div class="workspace">
      <aside class="toolbar" aria-label="Annotation tools">
        <div class="toolbar__group toolbar__group--assignee">
          <span class="toolbar__label">Assignee</span>
          <select v-model="party" class="party-select" title="Which party fills this field" @change="setParty(party)">
            <option value="party_1">Performing Party (A)</option>
            <option value="party_2">Contracting Party (B)</option>
          </select>
          <p class="party-hint">Fields are color-coded per party</p>
        </div>

        <div class="toolbar__group">
          <span class="toolbar__label">Document fields</span>
          <div class="pdf-field-tools">
            <button
              v-for="field in fieldTools"
              :key="field.id"
              type="button"
              class="pdf-tool"
              :class="{ 'is-active': activeFieldTool === field.id }"
              :title="`Place ${field.label.toLowerCase()} field`"
              @click="setFieldTool(field.id)"
            >
              {{ field.label }}
            </button>
          </div>
        </div>
      </aside>

      <main class="viewer">
        <div v-if="!pdfLoaded" class="empty-state">
          <div class="empty-state__card">
            <h2>{{ loadError ? 'Could not load sample contract' : 'Loading sample contract…' }}</h2>
            <p>{{ loadError ? 'Check internet connection and retry.' : 'This demo always uses the built-in sample PDF.' }}</p>
            <div v-if="loadError" class="empty-state__actions">
              <button type="button" class="btn btn--primary" @click="loadSamplePdf">Retry sample load</button>
            </div>
          </div>
        </div>
        <div v-show="pdfLoaded" class="viewer__scroll">
          <div ref="pageContainerRef" class="page-container" />
        </div>
      </main>

      <aside class="sidebar">
        <div class="sidebar__header">
          <h2>Annotations</h2>
          <span class="badge">{{ annotationList.length }}</span>
        </div>
        <ul class="annotation-list">
          <li v-if="annotationList.length === 0" class="annotation-list__empty">No annotations yet</li>
          <li
            v-for="ann in annotationList"
            :key="ann.id"
            class="annotation-list__item"
            :class="{ 'is-active': ann.id === selectedId }"
            @click="selectAnnotation(ann)"
          >
            <span
              class="annotation-list__icon"
              :style="{ background: annotations?.getAnnotationColor(ann) }"
            />
            <div class="annotation-list__body">
              <div class="annotation-list__type">
                {{ ann.type === 'field' ? ann.fieldType : ann.type }}
              </div>
              <div class="annotation-list__text">{{ annotations?.getSummary(ann) }}</div>
              <div class="annotation-list__page">Page {{ ann.page }}</div>
            </div>
          </li>
        </ul>
      </aside>
    </div>

    <div v-if="noteModalOpen" class="modal" role="dialog" aria-labelledby="note-modal-title">
      <div class="modal__backdrop" @click="closeNoteModal" />
      <div class="modal__panel">
        <h3 id="note-modal-title">{{ noteEditId ? 'Edit note' : 'Add note' }}</h3>
        <textarea v-model="noteText" rows="4" placeholder="Type your note…" />
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" @click="closeNoteModal">Cancel</button>
          <button type="button" class="btn btn--primary" @click="saveNoteModal">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>
