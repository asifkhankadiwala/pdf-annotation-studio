<script setup>
import { computed, onMounted, ref, shallowRef } from 'vue';
import { PdfViewer } from '@/lib/pdf-viewer.js';
import { AnnotationManager } from '@/lib/annotation-manager.js';
import { getFieldType, getParty } from '@/lib/field-config.js';
import { getProfile, getFillValue, normalizeParty } from '@/lib/user-profile.js';
import { exportSignedPdf } from '@/lib/export-pdf.js';
import {
  pdfjsLib,
  SAMPLE_PDF_URL,
  LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY,
} from '@/composables/usePdfJs.js';
import { useToast } from '@/composables/useToast.js';

const { showToast } = useToast();

const pageContainerRef = ref(null);
const viewer = shallowRef(null);
const annotations = shallowRef(null);

const pdfLoaded = ref(false);
const loadError = ref(false);
const currentPage = ref(1);
const totalPages = ref(0);
const zoomPercent = ref(100);
const signerParty = ref('party_1');
const sourcePdfBytes = ref(null);
const fileName = 'sample-contract.pdf';
const fieldAnnotations = ref([]);

const profile = computed(() => getProfile(signerParty.value));

const pendingMine = computed(() =>
  fieldAnnotations.value.filter(
    (ann) =>
      ann.type === 'field' &&
      normalizeParty(ann.party) === normalizeParty(signerParty.value) &&
      !ann.filled
  )
);

const completeMine = computed(() =>
  fieldAnnotations.value.filter(
    (ann) =>
      ann.type === 'field' &&
      normalizeParty(ann.party) === normalizeParty(signerParty.value) &&
      ann.filled
  )
);

const mineTotal = computed(() => pendingMine.value.length + completeMine.value.length);
const pageIndicator = computed(() =>
  totalPages.value ? `${currentPage.value} / ${totalPages.value}` : '— / —'
);

function syncFields(list) {
  fieldAnnotations.value = list.filter((ann) => ann.type === 'field');
}

function fillField(id) {
  const ann = annotations.value.getAnnotationById(id);
  if (!ann || ann.type !== 'field') return;

  if (normalizeParty(ann.party) !== normalizeParty(signerParty.value)) {
    showToast('This field is assigned to the other party.', false);
    return;
  }

  if (ann.filled) {
    showToast('Field already completed.', true);
    return;
  }

  const fill = getFillValue(ann.fieldType, getProfile(signerParty.value));
  const value = fill?.value || '';
  const replacedTextId = annotations.value.generateId();

  annotations.value.updateAnnotation(id, {
    filled: true,
    filledValue: value,
    filledBy: signerParty.value,
    filledAt: new Date().toISOString(),
    replacedByTextId: replacedTextId,
  });

  annotations.value.addAnnotation({
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

  viewer.value.currentPage = ann.page;
  currentPage.value = ann.page;
  showToast(`${getFieldType(ann.fieldType)?.label || ann.fieldType} filled.`, true);
}

function focusNextField() {
  const next = pendingMine.value[0];
  if (!next) {
    showToast('All required fields are complete.', true);
    return;
  }
  viewer.value.currentPage = next.page;
  viewer.value.scrollToPage(next.page);
  currentPage.value = next.page;
  annotations.value.select(next.id);
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
  syncFields(anns);
}

function jumpToField(ann) {
  viewer.value.currentPage = ann.page;
  viewer.value.scrollToPage(ann.page);
  currentPage.value = ann.page;
  annotations.value.select(ann.id);
}

function onSignerChange() {
  showToast(`Signing as ${getParty(signerParty.value).label}`, true);
}

async function handleExportPdf() {
  if (!sourcePdfBytes.value) {
    showToast('No PDF loaded to export.', false);
    return;
  }
  try {
    showToast('Preparing export…');
    await exportSignedPdf(
      sourcePdfBytes.value,
      annotations.value.annotations,
      fileName
    );
    showToast('Signed PDF exported.', true);
  } catch (err) {
    console.error(err);
    showToast('Could not export PDF.', false);
  }
}

async function openPdf(buffer) {
  annotations.value.clear();
  viewer.value.clear();
  sourcePdfBytes.value = new Uint8Array(buffer.slice(0));

  const numPages = await viewer.value.loadFromArrayBuffer(buffer);
  pdfLoaded.value = true;
  loadError.value = false;
  totalPages.value = numPages;
  currentPage.value = 1;
  zoomPercent.value = Math.round(viewer.value.scale * 100);

  await viewer.value.renderAllPages();
}

function loadSavedFieldsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY);
    if (!raw) {
      syncFields([]);
      return;
    }
    const data = JSON.parse(raw);
    const list = (data.annotations || data || []).filter((ann) => ann?.type === 'field');
    annotations.value.importJson({ annotations: list });
    showToast(`Loaded ${list.length} fields from markup mode.`, true);
  } catch (err) {
    console.error(err);
    showToast('Could not load saved annotations.', false);
    syncFields([]);
  }
}

async function loadSamplePdf() {
  showToast('Loading sample PDF…');
  try {
    const res = await fetch(SAMPLE_PDF_URL, { signal: AbortSignal.timeout(10000) });
    const buffer = await res.arrayBuffer();
    await openPdf(buffer);
    loadSavedFieldsFromLocalStorage();
    showToast('Sample PDF loaded.', true);
  } catch (err) {
    console.error(err);
    loadError.value = true;
    pdfLoaded.value = false;
    showToast('Failed to load sample PDF.', false);
  }
}

onMounted(() => {
  viewer.value = new PdfViewer(pageContainerRef.value, pdfjsLib);
  annotations.value = new AnnotationManager();
  annotations.value.tool = 'select';
  annotations.value.setDragEnabled(true);
  annotations.value.setCanDragAnnotation((ann) => ann?.type === 'filled_text');

  viewer.value.onPageRendered = (pageNum, layerEl) => {
    annotations.value.registerLayer(pageNum, layerEl);
  };

  annotations.value.onShapeClick = (id, ann) => {
    if (ann?.type === 'field') {
      fillField(id);
      return false;
    }
    return true;
  };

  annotations.value.onChange = syncFields;
  loadSamplePdf();
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
          <h1 class="header__title">PDF Contract Sign Mode</h1>
          <p class="header__subtitle">Click field placeholders to fill them</p>
        </div>
      </div>

      <nav class="header__toolbar" aria-label="Page and zoom controls">
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
      </nav>

      <div class="header__actions">
        <RouterLink to="/" class="btn btn--ghost btn--sm">Markup Studio</RouterLink>
        <button type="button" class="btn btn--ghost btn--sm" :disabled="!pdfLoaded" @click="handleExportPdf">
          Export PDF
        </button>
        <button type="button" class="btn btn--primary btn--sm" :disabled="pendingMine.length === 0" @click="focusNextField">
          Next field
        </button>
      </div>
    </header>

    <div class="workspace sign-workspace">
      <aside class="toolbar sign-toolbar">
        <div class="toolbar__group toolbar__group--assignee">
          <span class="toolbar__label">Signer</span>
          <select v-model="signerParty" class="party-select" @change="onSignerChange">
            <option value="party_1">Performing Party (A)</option>
            <option value="party_2">Contracting Party (B)</option>
          </select>
          <p class="party-hint">Only your party fields are fillable</p>
        </div>

        <div class="toolbar__group">
          <span class="toolbar__label">Completion</span>
          <div class="sign-stat">
            <strong>{{ completeMine.length }} / {{ mineTotal }}</strong>
            <span>fields signed</span>
          </div>
        </div>

        <div class="toolbar__group">
          <span class="toolbar__label">My information</span>
          <div class="profile-card">
            <div class="profile-row"><span>Signature</span><strong>{{ profile.signature || '—' }}</strong></div>
            <div class="profile-row"><span>Initials</span><strong>{{ profile.initials || '—' }}</strong></div>
            <div class="profile-row"><span>Name</span><strong>{{ profile.name || '—' }}</strong></div>
            <div class="profile-row"><span>Company</span><strong>{{ profile.company || '—' }}</strong></div>
            <div class="profile-row"><span>Title</span><strong>{{ profile.title || '—' }}</strong></div>
          </div>
        </div>
      </aside>

      <main class="viewer">
        <div v-if="!pdfLoaded" class="empty-state">
          <div class="empty-state__card">
            <h2>{{ loadError ? 'Could not load sample contract' : 'Loading sample contract…' }}</h2>
            <p>{{ loadError ? 'Check internet connection and retry.' : 'Fields are loaded automatically from your latest markup session.' }}</p>
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
          <h2>Field status</h2>
          <span class="badge">{{ pendingMine.length }}</span>
        </div>
        <ul class="annotation-list">
          <li v-if="fieldAnnotations.length === 0" class="annotation-list__empty">No fields loaded yet</li>
          <li
            v-for="ann in fieldAnnotations"
            :key="ann.id"
            class="annotation-list__item"
            :class="{ 'is-muted': normalizeParty(ann.party) !== normalizeParty(signerParty) }"
            @click="jumpToField(ann)"
          >
            <span
              class="annotation-list__icon"
              :style="{ background: getParty(normalizeParty(ann.party)).color }"
            />
            <div class="annotation-list__body">
              <div class="annotation-list__type">
                {{ getFieldType(ann.fieldType)?.label || ann.fieldType }} ·
                {{ getParty(normalizeParty(ann.party)).shortLabel }}
              </div>
              <div class="annotation-list__text">
                {{ ann.filled ? ann.filledValue || '' : getFieldType(ann.fieldType)?.placeholder || '' }}
              </div>
              <div class="annotation-list__page">Page {{ ann.page }}</div>
            </div>
            <span
              class="field-item__badge"
              :class="ann.filled ? 'field-item__badge--done' : 'field-item__badge--pending'"
            >
              {{ ann.filled ? 'Done' : 'Pending' }}
            </span>
          </li>
        </ul>
      </aside>
    </div>
  </div>
</template>
