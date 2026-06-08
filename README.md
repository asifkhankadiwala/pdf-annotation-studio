# PDF Annotation Studio

A **Vue 3 + PDF.js** demo for marking up PDFs in the browser — built as a portfolio piece for freelance profiles (e.g. Upwork).

![Tech stack](https://img.shields.io/badge/Vue-3-green) ![PDF.js](https://img.shields.io/badge/PDF.js-4.10-red) ![License](https://img.shields.io/badge/license-MIT-green)

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
│   ├── main.js
│   ├── App.vue
│   ├── router/index.js
│   ├── views/
│   │   ├── MarkupStudio.vue
│   │   └── SignMode.vue
│   ├── lib/
│   │   ├── pdf-viewer.js
│   │   ├── annotation-manager.js
│   │   ├── field-config.js
│   │   ├── user-profile.js
│   │   └── export-pdf.js
│   └── composables/
├── css/
│   ├── styles.css
│   └── sign.css
└── legacy/                 # Original jQuery version (reference)
```

## How it works

1. **PDF.js** renders each page to a `<canvas>`.
2. An **annotation layer** (`<div>`) is stacked on top of each page (same dimensions).
3. Coordinates are stored **normalized** (0–1) so annotations scale when zoom changes.
4. Annotations live in memory and can be **exported as JSON** for persistence or demos.
5. **Sign mode** replaces field widgets with draggable `filled_text` annotations on click.
6. **Export PDF** uses `pdf-lib` to bake annotations into a downloadable PDF.

## Legacy jQuery version

The original jQuery implementation is preserved in `legacy/` and `js/` for reference.

## Browser support

Chrome, Firefox, Safari, Edge (modern versions). Requires JavaScript enabled.

## Security

This project includes supply-chain hardening for **Shai-Hulud / SHA1-Hulud**-class npm attacks. See [SECURITY.md](SECURITY.md).

After installing or updating dependencies:

```bash
npm run security:check
```

CI runs `npm ci --ignore-scripts`, audit, Shai-Hulud scanning, and build verification on every push.

## License

MIT — free to use and modify for your portfolio.
