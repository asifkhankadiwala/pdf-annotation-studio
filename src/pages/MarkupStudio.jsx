import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PdfViewer } from '@/lib/pdf-viewer.js';
import { AnnotationManager } from '@/lib/annotation-manager.js';
import { getParty } from '@/lib/field-config.js';
import { pdfjsLib, SAMPLE_PDF_URL, LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY } from '@/lib/pdfjs.js';
import { useToast } from '@/context/ToastContext';

const COLORS = [
  { value: '#fbbf24', title: 'Yellow' },
  { value: '#34d399', title: 'Green' },
  { value: '#60a5fa', title: 'Blue' },
  { value: '#f472b6', title: 'Pink' },
  { value: '#ef4444', title: 'Red' },
];

const MARKUP_TOOLS = [
  { id: 'select', title: 'Select (V)' },
  { id: 'highlight', title: 'Highlight (H)' },
  { id: 'rectangle', title: 'Rectangle (R)' },
  { id: 'note', title: 'Sticky note (N)' },
  { id: 'draw', title: 'Freehand (D)' },
];

const FIELD_TOOLS = [
  { id: 'signature', label: 'Signature' },
  { id: 'initial', label: 'Initials' },
  { id: 'date', label: 'Date' },
  { id: 'name', label: 'Name' },
  { id: 'company', label: 'Company' },
  { id: 'title', label: 'Title' },
];

function ToolIcon({ toolId }) {
  if (toolId === 'select') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      </svg>
    );
  }
  if (toolId === 'highlight') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    );
  }
  if (toolId === 'rectangle') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    );
  }
  if (toolId === 'note') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.5 1.5L13 11" />
    </svg>
  );
}

export default function MarkupStudio() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const pageContainerRef = useRef(null);
  const viewerRef = useRef(null);
  const annotationsRef = useRef(null);

  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [selectedId, setSelectedId] = useState(null);
  const [annotationList, setAnnotationList] = useState([]);
  const [activeTool, setActiveTool] = useState('select');
  const [activeFieldTool, setActiveFieldTool] = useState(null);
  const [party, setPartyState] = useState('party_1');
  const [color, setColorState] = useState('#fbbf24');
  const [strokeWidth, setStrokeWidthState] = useState(3);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteEditId, setNoteEditId] = useState(null);
  const [notePlacement, setNotePlacement] = useState(null);
  const [noteText, setNoteText] = useState('');

  const pageIndicator = useMemo(
    () => (totalPages ? `${currentPage} / ${totalPages}` : '— / —'),
    [currentPage, totalPages]
  );

  const syncAnnotationList = useCallback((list) => {
    setAnnotationList([...list]);
  }, []);

  const setTool = useCallback((tool) => {
    setActiveTool(tool);
    setActiveFieldTool(null);
    annotationsRef.current?.setTool(tool);
  }, []);

  const setFieldTool = useCallback(
    (fieldType) => {
      if (activeFieldTool === fieldType) {
        setActiveFieldTool(null);
        setTool('select');
        return;
      }
      setActiveFieldTool(fieldType);
      setActiveTool('field');
      annotationsRef.current?.setFieldTool(fieldType);
      const p = getParty(party);
      showToast(`Click PDF to place ${fieldType} (${p.shortLabel})`, true);
    },
    [activeFieldTool, party, setTool, showToast]
  );

  const setParty = useCallback(
    (nextParty) => {
      setPartyState(nextParty);
      annotationsRef.current?.setParty(nextParty);
      showToast(`Assignee: ${getParty(nextParty).label}`, true);
    },
    [showToast]
  );

  const setColor = useCallback((nextColor) => {
    setColorState(nextColor);
    annotationsRef.current?.setColor(nextColor);
  }, []);

  const setStroke = useCallback((nextWidth) => {
    setStrokeWidthState(nextWidth);
    annotationsRef.current?.setStrokeWidth(nextWidth);
  }, []);

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
    if (!viewer || !annotations) return;
    const page = viewer.currentPage;
    const anns = [...annotations.annotations];
    annotations.layers = {};
    await viewer.renderAllPages();
    annotations.annotations = anns;
    annotations.renderAll();
    viewer.currentPage = page;
    setCurrentPage(page);
    syncAnnotationList(anns);
  }, [syncAnnotationList]);

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

  const deleteSelected = useCallback(() => {
    if (annotationsRef.current?.deleteSelected()) {
      showToast('Annotation deleted.', true);
    }
  }, [showToast]);

  const exportAnnotations = useCallback(() => {
    const json = annotationsRef.current.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-annotations.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Annotations exported.', true);
  }, [showToast]);

  const goToSignMode = useCallback(() => {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY,
        annotationsRef.current.exportJson()
      );
    } catch (err) {
      console.error(err);
    }
    navigate('/sign');
  }, [navigate]);

  const openNoteModal = useCallback((id, placement) => {
    setNoteEditId(id);
    setNotePlacement(placement || null);
    if (id) {
      const ann = annotationsRef.current.annotations.find((a) => a.id === id);
      setNoteText(ann ? ann.text : '');
    } else {
      setNoteText('');
    }
    setNoteModalOpen(true);
  }, []);

  const closeNoteModal = useCallback(() => {
    setNoteModalOpen(false);
    setNoteEditId(null);
    setNotePlacement(null);
    annotationsRef.current.pendingNote = null;
  }, []);

  const saveNoteModal = useCallback(() => {
    const text = noteText.trim();
    const annotations = annotationsRef.current;
    if (noteEditId) {
      annotations.updateNoteText(noteEditId, text);
      showToast('Note updated.', true);
    } else if (notePlacement) {
      const { pageNum, x, y } = notePlacement;
      annotations.addNote(pageNum, x, y, text);
      showToast('Note added.', true);
    }
    closeNoteModal();
    syncAnnotationList(annotations.annotations);
  }, [closeNoteModal, noteEditId, notePlacement, noteText, showToast, syncAnnotationList]);

  const selectAnnotation = useCallback((ann) => {
    const viewer = viewerRef.current;
    annotationsRef.current.select(ann.id);
    viewer.currentPage = ann.page;
    viewer.scrollToPage(ann.page);
    setCurrentPage(ann.page);
  }, []);

  const openPdf = useCallback(
    async (buffer) => {
      const viewer = viewerRef.current;
      const annotations = annotationsRef.current;
      annotations.clear();
      viewer.clear();

      const numPages = await viewer.loadFromArrayBuffer(buffer);
      setPdfLoaded(true);
      setLoadError(false);
      setTotalPages(numPages);
      setCurrentPage(1);
      setZoomPercent(Math.round(viewer.scale * 100));

      await viewer.renderAllPages((current, total) => {
        showToast(`Rendering page ${current} of ${total}…`);
      });

      viewer.scrollToPage(1);
      syncAnnotationList([]);
    },
    [showToast, syncAnnotationList]
  );

  const loadSamplePdf = useCallback(async () => {
    showToast('Loading sample PDF…');
    try {
      const res = await fetch(SAMPLE_PDF_URL, { signal: AbortSignal.timeout(10000) });
      const buffer = await res.arrayBuffer();
      await openPdf(buffer);
      showToast('Sample PDF loaded', true);
    } catch (err) {
      console.error(err);
      setLoadError(true);
      setPdfLoaded(false);
      showToast('Could not load sample PDF.', false);
    }
  }, [openPdf, showToast]);

  const loadSamplePdfRef = useRef(loadSamplePdf);
  loadSamplePdfRef.current = loadSamplePdf;

  useEffect(() => {
    const viewer = new PdfViewer(pageContainerRef.current, pdfjsLib);
    const annotations = new AnnotationManager();
    viewerRef.current = viewer;
    annotationsRef.current = annotations;

    viewer.onPageRendered = (pageNum, layerEl) => {
      annotations.registerLayer(pageNum, layerEl);
    };
    annotations.onChange = syncAnnotationList;
    annotations.onSelect = setSelectedId;
    annotations.onNoteEdit = openNoteModal;

    const onKeydown = (e) => {
      if (e.target.matches('textarea, input, select')) return;
      const shortcuts = { v: 'select', h: 'highlight', r: 'rectangle', n: 'note', d: 'draw' };
      const tool = shortcuts[e.key.toLowerCase()];
      if (tool) setTool(tool);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        annotations.deleteSelected();
      }
    };

    document.addEventListener('keydown', onKeydown);
    loadSamplePdfRef.current();

    return () => document.removeEventListener('keydown', onKeydown);
  }, [openNoteModal, setTool, syncAnnotationList]);

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
            <h1 className="header__title">PDF Annotation Studio</h1>
            <p className="header__subtitle">React · Browser-based PDF markup</p>
          </div>
        </div>

        <nav className="header__toolbar" aria-label="Markup and view controls">
          <div className="header__cluster header__cluster--markup">
            <span className="header__cluster-label">Markup</span>
            <div className="header__tool-row">
              {MARKUP_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`tool-btn tool-btn--compact${activeTool === tool.id && !activeFieldTool ? ' is-active' : ''}`}
                  title={tool.title}
                  onClick={() => setTool(tool.id)}
                >
                  <ToolIcon toolId={tool.id} />
                </button>
              ))}
            </div>
          </div>

          <div className="header__divider" aria-hidden="true" />

          <div className="header__cluster header__cluster--color">
            <span className="header__cluster-label">Color</span>
            <div className="color-picker color-picker--header">
              {COLORS.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  className={`color-swatch${color === swatch.value ? ' is-active' : ''}`}
                  style={{ '--swatch': swatch.value }}
                  title={swatch.title}
                  onClick={() => setColor(swatch.value)}
                />
              ))}
            </div>
          </div>

          <div className="header__cluster header__cluster--stroke">
            <span className="header__cluster-label">Stroke</span>
            <div className="header__stroke-row">
              <input
                type="range"
                min="1"
                max="8"
                value={strokeWidth}
                className="stroke-slider stroke-slider--header"
                title="Stroke width"
                onChange={(e) => setStroke(Number(e.target.value))}
              />
              <span className="stroke-label">{strokeWidth}px</span>
            </div>
          </div>

          <div className="header__divider" aria-hidden="true" />

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

          <button
            type="button"
            className="icon-btn icon-btn--danger"
            disabled={!selectedId}
            title="Delete selected"
            aria-label="Delete selected"
            onClick={deleteSelected}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
          </button>
        </nav>

        <div className="header__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={goToSignMode}>
            <span className="btn__text">Sign mode</span>
          </button>
          <button type="button" className="btn btn--primary btn--sm" disabled={!pdfLoaded} onClick={exportAnnotations}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            <span className="btn__text">Export</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="toolbar" aria-label="Annotation tools">
          <div className="toolbar__group toolbar__group--assignee">
            <span className="toolbar__label">Assignee</span>
            <select
              className="party-select"
              title="Which party fills this field"
              value={party}
              onChange={(e) => setParty(e.target.value)}
            >
              <option value="party_1">Performing Party (A)</option>
              <option value="party_2">Contracting Party (B)</option>
            </select>
            <p className="party-hint">Fields are color-coded per party</p>
          </div>

          <div className="toolbar__group">
            <span className="toolbar__label">Document fields</span>
            <div className="pdf-field-tools">
              {FIELD_TOOLS.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  className={`pdf-tool${activeFieldTool === field.id ? ' is-active' : ''}`}
                  title={`Place ${field.label.toLowerCase()} field`}
                  onClick={() => setFieldTool(field.id)}
                >
                  {field.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="viewer">
          {!pdfLoaded && (
            <div className="empty-state">
              <div className="empty-state__card">
                <h2>{loadError ? 'Could not load sample contract' : 'Loading sample contract…'}</h2>
                <p>{loadError ? 'Check internet connection and retry.' : 'This demo always uses the built-in sample PDF.'}</p>
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
            <h2>Annotations</h2>
            <span className="badge">{annotationList.length}</span>
          </div>
          <ul className="annotation-list">
            {annotationList.length === 0 && (
              <li className="annotation-list__empty">No annotations yet</li>
            )}
            {annotationList.map((ann) => (
              <li
                key={ann.id}
                className={`annotation-list__item${ann.id === selectedId ? ' is-active' : ''}`}
                onClick={() => selectAnnotation(ann)}
              >
                <span
                  className="annotation-list__icon"
                  style={{ background: annotationsRef.current?.getAnnotationColor(ann) }}
                />
                <div className="annotation-list__body">
                  <div className="annotation-list__type">
                    {ann.type === 'field' ? ann.fieldType : ann.type}
                  </div>
                  <div className="annotation-list__text">{annotationsRef.current?.getSummary(ann)}</div>
                  <div className="annotation-list__page">Page {ann.page}</div>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {noteModalOpen && (
        <div className="modal" role="dialog" aria-labelledby="note-modal-title">
          <div className="modal__backdrop" onClick={closeNoteModal} />
          <div className="modal__panel">
            <h3 id="note-modal-title">{noteEditId ? 'Edit note' : 'Add note'}</h3>
            <textarea
              rows={4}
              placeholder="Type your note…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={closeNoteModal}>Cancel</button>
              <button type="button" className="btn btn--primary" onClick={saveNoteModal}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
