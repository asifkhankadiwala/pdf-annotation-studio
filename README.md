# PDF Annotation Studio

A **React + PDF.js** demo for marking up PDFs in the browser — built as a portfolio piece for freelance profiles (e.g. Upwork).

![Tech stack](https://img.shields.io/badge/React-19-blue) ![PDF.js](https://img.shields.io/badge/PDF.js-4.10-red) ![License](https://img.shields.io/badge/license-MIT-green)

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
- **Sign mode** (`/sign`) — click fields to fill, replace with draggable text, export signed PDF
- **Color palette** and adjustable stroke width
- **Multi-page** rendering with page navigation and zoom
- **Annotations sidebar** — click an item to jump to its page
- **Export / import** annotations as JSON (portable, not embedded in the PDF binary)
- **Keyboard shortcuts**: `V` select, `H` highlight, `R` rectangle, `N` note, `D` draw, `Delete` remove

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080)

- **Markup studio**: `/`
- **Sign mode**: `/sign`

### Production build

```bash
npm run build
npm run preview
```

## Project structure

```
pdfannotations/
├── index.html              # Vite entry
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── pages/
│   │   ├── MarkupStudio.jsx
│   │   └── SignMode.jsx
│   ├── components/
│   │   └── AppToast.jsx
│   ├── context/
│   │   └── ToastContext.jsx
│   ├── lib/
│   │   ├── pdf-viewer.js
│   │   ├── annotation-manager.js
│   │   ├── field-config.js
│   │   ├── user-profile.js
│   │   ├── export-pdf.js
│   │   └── pdfjs.js
│   └── ...
├── css/
│   ├── styles.css
│   └── sign.css
└── legacy/                 # Original jQuery version (reference)
```

## Other framework branches

- **`vue`** branch — Vue 3 + Vite implementation
- **`main`** branch — original jQuery version

## How it works

1. **PDF.js** renders each page to a `<canvas>`.
2. An **annotation layer** (`<div>`) is stacked on top of each page (same dimensions).
3. Coordinates are stored **normalized** (0–1) so annotations scale when zoom changes.
4. Annotations live in memory and can be **exported as JSON** for persistence or demos.
5. **Sign mode** replaces field widgets with draggable `filled_text` annotations on click.
6. **Export PDF** uses `pdf-lib` to bake annotations into a downloadable PDF.

## Security

This project includes supply-chain hardening for **Shai-Hulud / SHA1-Hulud**-class npm attacks. See [SECURITY.md](SECURITY.md).

After installing or updating dependencies:

```bash
npm run security:check
```

## Browser support

Chrome, Firefox, Safari, Edge (modern versions). Requires JavaScript enabled.

## License

MIT — free to use and modify for your portfolio.
