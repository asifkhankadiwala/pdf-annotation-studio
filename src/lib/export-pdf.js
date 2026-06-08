export async function exportSignedPdf(sourcePdfBytes, annotations, fileName) {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.load(sourcePdfBytes);
  const pages = doc.getPages();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  annotations.forEach((ann) => {
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
        page.drawLine({
          start: { x: x1n * width, y: height - y1n * height },
          end: { x: x2n * width, y: height - y2n * height },
          thickness: stroke,
          color: rgb(0.2, 0.2, 0.2),
          opacity: 1,
        });
      }
    }
  });

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const downloadName =
    (fileName || 'signed-document').replace(/\.pdf$/i, '') + '-signed.pdf';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName;
  a.click();
  URL.revokeObjectURL(url);
}
