import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export const SAMPLE_PDF_URL =
  'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

export const LOCAL_STORAGE_SIGN_ANNOTATIONS_KEY =
  'pdfannotations.sample.sign.annotations';

export { pdfjsLib };
