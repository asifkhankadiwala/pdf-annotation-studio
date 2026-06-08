import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PdfViewer } from '@/lib/pdf-viewer.js';
import { AnnotationManager } from '@/lib/annotation-manager.js';
import { getFieldType, getParty } from '@/lib/field-config.js';
import { getProfile, getFillValue, normalizeParty } from '@/lib/user-profile.js';
import { exportSignedPdf } from '@/lib/export-pdf.js';
import { pdfjsLib, SAMPLE_PDF_URL, LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY } from '@/lib/pdfjs.js';
import { useToast } from '@/context/ToastContext';

const FILE_NAME = 'sample-contract.pdf';

export default function SignMode() {
  const { showToast } = useToast();
  const pageContainerRef = useRef(null);
  const viewerRef = useRef(null);
  const annotationsRef = useRef(null);
  const sourcePdfBytesRef = useRef(null);

  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [signerParty, setSignerParty] = useState('party_1');
  const [fieldAnnotations, setFieldAnnotations] = useState([]);

  const profile = useMemo(() => getProfile(signerParty), [signerParty]);

  const pendingMine = useMemo(
    () =>
      fieldAnnotations.filter(
        (ann) =>
          ann.type === 'field' &&
          normalizeParty(ann.party) === normalizeParty(signerParty) &&
          !ann.filled
      ),
    [fieldAnnotations, signerParty]
  );

  const completeMine = useMemo(
    () =>
      fieldAnnotations.filter(
        (ann) =>
          ann.type === 'field' &&
          normalizeParty(ann.party) === normalizeParty(signerParty) &&
          ann.filled
      ),
    [fieldAnnotations, signerParty]
  );

  const mineTotal = pendingMine.length + completeMine.length;
  const pageIndicator = totalPages ? `${currentPage} / ${totalPages}` : '— / —';

  const syncFields = useCallback((list) => {
    setFieldAnnotations(list.filter((ann) => ann.type === 'field'));
  }, []);

  const fillField = useCallback(
    (id) => {
      const annotations = annotationsRef.current;
      const ann = annotations.getAnnotationById(id);
      if (!ann || ann.type !== 'field') return;

      if (normalizeParty(ann.party) !== normalizeParty(signerParty)) {
        showToast('This field is assigned to the other party.', false);
        return;
      }

      if (ann.filled) {
        showToast('Field already completed.', true);
        return;
      }

      const fill = getFillValue(ann.fieldType, getProfile(signerParty));
      const value = fill?.value || '';
      const replacedTextId = annotations.generateId();

      annotations.updateAnnotation(id, {
        filled: true,
        filledValue: value,
        filledBy: signerParty,
        filledAt: new Date().toISOString(),
        replacedByTextId: replacedTextId,
      });

      annotations.addAnnotation({
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

      viewerRef.current.currentPage = ann.page;
      setCurrentPage(ann.page);
      showToast(`${getFieldType(ann.fieldType)?.label || ann.fieldType} filled.`, true);
    },
    [showToast, signerParty]
  );

  const focusNextField = useCallback(() => {
    const next = pendingMine[0];
    if (!next) {
      showToast('All required fields are complete.', true);
      return;
    }
    viewerRef.current.currentPage = next.page;
    viewerRef.current.scrollToPage(next.page);
    setCurrentPage(next.page);
    annotationsRef.current.select(next.id);
  }, [pendingMine, showToast]);

  const navigatePage = useCallback((delta) => {
    const viewer = viewerRef.current;
    if (!viewer?.numPages) return;
    let page = viewer.currentPage + delta;
    page = Math.max(1, Math.min(viewer.numPages, page));
    viewer.currentPage = page;
    viewer.scrollToPage(page);
    setCurrentPage(page);
  }, []);

  const reRenderDocument = useCallback(async () => {
    const viewer = viewerRef.current;
    const annotations = annotationsRef.current;
    const page = viewer.currentPage;
    const anns = [...annotations.annotations];
    annotations.layers = {};
    await viewer.renderAllPages();
    annotations.annotations = anns;
    annotations.renderAll();
    viewer.currentPage = page;
    setCurrentPage(page);
    syncFields(anns);
  }, [syncFields]);

  const changeZoom = useCallback(
    async (delta) => {
      const viewer = viewerRef.current;
      if (!viewer?.doc) return;
      viewer.setScale(viewer.scale + delta);
      setZoomPercent(Math.round(viewer.scale * 100));
      await reRenderDocument();
    },
    [reRenderDocument]
  );

  const jumpToField = useCallback((ann) => {
    viewerRef.current.currentPage = ann.page;
    viewerRef.current.scrollToPage(ann.page);
    setCurrentPage(ann.page);
    annotationsRef.current.select(ann.id);
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (!sourcePdfBytesRef.current) {
      showToast('No PDF loaded to export.', false);
      return;
    }
    try {
      showToast('Preparing export…');
      await exportSignedPdf(
        sourcePdfBytesRef.current,
        annotationsRef.current.annotations,
        FILE_NAME
      );
      showToast('Signed PDF exported.', true);
    } catch (err) {
      console.error(err);
      showToast('Could not export PDF.', false);
    }
  }, [showToast]);

  const openPdf = useCallback(async (buffer) => {
    const viewer = viewerRef.current;
    const annotations = annotationsRef.current;
    annotations.clear();
    viewer.clear();
    sourcePdfBytesRef.current = new Uint8Array(buffer.slice(0));

    const numPages = await viewer.loadFromArrayBuffer(buffer);
    setPdfLoaded(true);
    setLoadError(false);
    setTotalPages(numPages);
    setCurrentPage(1);
    setZoomPercent(Math.round(viewer.scale * 100));
    await viewer.renderAllPages();
  }, []);

  const loadSavedFieldsFromLocalStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY);
      if (!raw) {
        syncFields([]);
        return;
      }
      const data = JSON.parse(raw);
      const list = (data.annotations || data || []).filter((ann) => ann?.type === 'field');
      annotationsRef.current.importJson({ annotations: list });
      showToast(`Loaded ${list.length} fields from markup mode.`, true);
    } catch (err) {
      console.error(err);
      showToast('Could not load saved annotations.', false);
      syncFields([]);
    }
  }, [showToast, syncFields]);

  const loadSamplePdf = useCallback(async () => {
    showToast('Loading sample PDF…');
    try {
      const res = await fetch(SAMPLE_PDF_URL, { signal: AbortSignal.timeout(10000) });
      const buffer = await res.arrayBuffer();
      await openPdf(buffer);
      loadSavedFieldsFromLocalStorage();
      showToast('Sample PDF loaded.', true);
    } catch (err) {
      console.error(err);
      setLoadError(true);
      setPdfLoaded(false);
      showToast('Failed to load sample PDF.', false);
    }
  }, [loadSavedFieldsFromLocalStorage, openPdf, showToast]);

  const fillFieldRef = useRef(fillField);
  fillFieldRef.current = fillField;

  const loadSamplePdfRef = useRef(loadSamplePdf);
  loadSamplePdfRef.current = loadSamplePdf;

  useEffect(() => {
    const viewer = new PdfViewer(pageContainerRef.current, pdfjsLib);
    const annotations = new AnnotationManager();
    viewerRef.current = viewer;
    annotationsRef.current = annotations;

    annotations.tool = 'select';
    annotations.setDragEnabled(true);
    annotations.setCanDragAnnotation((ann) => ann?.type === 'filled_text');

    viewer.onPageRendered = (pageNum, layerEl) => {
      annotations.registerLayer(pageNum, layerEl);
    };

    annotations.onShapeClick = (id, ann) => {
      if (ann?.type === 'field') {
        fillFieldRef.current(id);
        return false;
      }
      return true;
    };

    annotations.onChange = syncFields;
    loadSamplePdfRef.current();
  }, [syncFields]);

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <svg className="header__logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="4" y="2" width="20" height="26" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M10 12h12M10 17h8M10 22h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="24" cy="24" r="6" fill="#6366f1" />
            <path d="M22 24l1.5 1.5L26 22" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="header__brand-text">
            <h1 className="header__title">PDF Contract Sign Mode</h1>
            <p className="header__subtitle">Click field placeholders to fill them</p>
          </div>
        </div>

        <nav className="header__toolbar" aria-label="Page and zoom controls">
          <div className="header__cluster header__cluster--page">
            <span className="header__cluster-label">Page</span>
            <div className="page-nav page-nav--header">
              <button type="button" className="icon-btn" disabled={totalPages <= 1} aria-label="Previous page" onClick={() => navigatePage(-1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="page-indicator">{pageIndicator}</span>
              <button type="button" className="icon-btn" disabled={totalPages <= 1} aria-label="Next page" onClick={() => navigatePage(1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
          </div>

          <div className="header__cluster header__cluster--zoom">
            <span className="header__cluster-label">Zoom</span>
            <div className="zoom-controls zoom-controls--header">
              <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => changeZoom(-0.25)}>−</button>
              <span className="zoom-label">{zoomPercent}%</span>
              <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => changeZoom(0.25)}>+</button>
            </div>
          </div>
        </nav>

        <div className="header__actions">
          <Link to="/" className="btn btn--ghost btn--sm">Markup Studio</Link>
          <button type="button" className="btn btn--ghost btn--sm" disabled={!pdfLoaded} onClick={handleExportPdf}>
            Export PDF
          </button>
          <button type="button" className="btn btn--primary btn--sm" disabled={pendingMine.length === 0} onClick={focusNextField}>
            Next field
          </button>
        </div>
      </header>

      <div className="workspace sign-workspace">
        <aside className="toolbar sign-toolbar">
          <div className="toolbar__group toolbar__group--assignee">
            <span className="toolbar__label">Signer</span>
            <select
              className="party-select"
              value={signerParty}
              onChange={(e) => {
                setSignerParty(e.target.value);
                showToast(`Signing as ${getParty(e.target.value).label}`, true);
              }}
            >
              <option value="party_1">Performing Party (A)</option>
              <option value="party_2">Contracting Party (B)</option>
            </select>
            <p className="party-hint">Only your party fields are fillable</p>
          </div>

          <div className="toolbar__group">
            <span className="toolbar__label">Completion</span>
            <div className="sign-stat">
              <strong>{completeMine.length} / {mineTotal}</strong>
              <span>fields signed</span>
            </div>
          </div>

          <div className="toolbar__group">
            <span className="toolbar__label">My information</span>
            <div className="profile-card">
              <div className="profile-row"><span>Signature</span><strong>{profile.signature || '—'}</strong></div>
              <div className="profile-row"><span>Initials</span><strong>{profile.initials || '—'}</strong></div>
              <div className="profile-row"><span>Name</span><strong>{profile.name || '—'}</strong></div>
              <div className="profile-row"><span>Company</span><strong>{profile.company || '—'}</strong></div>
              <div className="profile-row"><span>Title</span><strong>{profile.title || '—'}</strong></div>
            </div>
          </div>
        </aside>

        <main className="viewer">
          {!pdfLoaded && (
            <div className="empty-state">
              <div className="empty-state__card">
                <h2>{loadError ? 'Could not load sample contract' : 'Loading sample contract…'}</h2>
                <p>{loadError ? 'Check internet connection and retry.' : 'Fields are loaded automatically from your latest markup session.'}</p>
                {loadError && (
                  <div className="empty-state__actions">
                    <button type="button" className="btn btn--primary" onClick={loadSamplePdf}>Retry sample load</button>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="viewer__scroll" style={{ display: pdfLoaded ? undefined : 'none' }}>
            <div ref={pageContainerRef} className="page-container" />
          </div>
        </main>

        <aside className="sidebar">
          <div className="sidebar__header">
            <h2>Field status</h2>
            <span className="badge">{pendingMine.length}</span>
          </div>
          <ul className="annotation-list">
            {fieldAnnotations.length === 0 && (
              <li className="annotation-list__empty">No fields loaded yet</li>
            )}
            {fieldAnnotations.map((ann) => (
              <li
                key={ann.id}
                className={`annotation-list__item${normalizeParty(ann.party) !== normalizeParty(signerParty) ? ' is-muted' : ''}`}
                onClick={() => jumpToField(ann)}
              >
                <span
                  className="annotation-list__icon"
                  style={{ background: getParty(normalizeParty(ann.party)).color }}
                />
                <div className="annotation-list__body">
                  <div className="annotation-list__type">
                    {getFieldType(ann.fieldType)?.label || ann.fieldType} ·{' '}
                    {getParty(normalizeParty(ann.party)).shortLabel}
                  </div>
                  <div className="annotation-list__text">
                    {ann.filled ? ann.filledValue || '' : getFieldType(ann.fieldType)?.placeholder || ''}
                  </div>
                  <div className="annotation-list__page">Page {ann.page}</div>
                </div>
                <span className={`field-item__badge ${ann.filled ? 'field-item__badge--done' : 'field-item__badge--pending'}`}>
                  {ann.filled ? 'Done' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
