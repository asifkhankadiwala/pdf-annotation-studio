# PDF Annotation Studio

A standalone **jQuery + HTML + PDF.js** demo for marking up PDFs in the browser — built as a portfolio piece for freelance profiles (e.g. Upwork).

![Tech stack](https://img.shields.io/badge/jQuery-3.7-blue) ![PDF.js](https://img.shields.io/badge/PDF.js-4.10-red) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Open any PDF** from your computer or load the built-in Mozilla sample
- **Contract assignee** — Performing Party (A) or Contracting Party (B), color-coded like TourCntrl
- **Document fields** (click to place on PDF)
  - Signature, Initials, Date, Name, Company, Title
- **Markup tools**
  - Select & delete
  - Text highlight (semi-transparent boxes)
  - Rectangle boxes
  - Sticky notes with editable text
  - Freehand drawing (ink)
- **Color palette** and adjustable stroke width
- **Multi-page** rendering with page navigation and zoom
- **Annotations sidebar** — click an item to jump to its page
- **Export / import** annotations as JSON (portable, not embedded in the PDF binary)
- **Keyboard shortcuts**: `V` select, `H` highlight, `R` rectangle, `N` note, `D` draw, `Delete` remove

## Quick start

No build step required. Serve the folder over HTTP (PDF.js needs a server for file loading in some browsers).

### Option 1 — Python

```bash
cd pdfannotations
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

### Option 2 — PHP

```bash
php -S localhost:8080
```

### Option 3 — npx

```bash
npx serve .
```

## Project structure

```
pdfannotations/
├── index.html          # Main UI
├── css/
│   └── styles.css      # Dark theme, toolbar, sidebar
├── js/
│   ├── app.js          # jQuery wiring, file load, export
│   ├── field-config.js # Party & document field definitions
│   ├── pdf-viewer.js   # PDF.js canvas rendering
│   └── annotation-manager.js  # Tools, storage, overlay layer
└── README.md
```

## How it works

1. **PDF.js** renders each page to a `<canvas>`.
2. An **annotation layer** (`<div>`) is stacked on top of each page (same dimensions).
3. Coordinates are stored **normalized** (0–1) so annotations scale when zoom changes.
4. Annotations live in memory and can be **exported as JSON** for persistence or demos.

> Note: This demo stores annotations separately from the PDF file. Embedding into the PDF binary would require a server-side library (e.g. iText, PDFLib) — a common follow-up for production projects.

## Upwork / portfolio tips

- Record a **2–3 minute Loom** showing: load PDF → highlight → add note → export JSON → re-import.
- Mention **PDF.js overlay architecture**, normalized coordinates, and jQuery event delegation.
- Link this repo and the live demo URL in your profile.

## Browser support

Chrome, Firefox, Safari, Edge (modern versions). Requires JavaScript enabled.

## License

MIT — free to use and modify for your portfolio.
