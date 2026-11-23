// Browser-side document text extraction for lecture PDFs, Word (.docx), PowerPoint (.pptx), and plain text

async function extractPdfText(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pageTexts = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (lines) {
      pageTexts.push(`Page ${pageNum}: ${lines}`);
    }
  }

  return pageTexts.join('\n\n');
}

function collectXmlTagText(xmlString, tagName) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  const nodes = doc.getElementsByTagName(tagName);
  const parts = [];
  for (let i = 0; i < nodes.length; i++) {
    const txt = (nodes[i].textContent || '').trim();
    if (txt) parts.push(txt);
  }
  return parts;
}

async function extractDocxText(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    throw new Error('Invalid Word (.docx) file.');
  }
  const xml = await docFile.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = doc.getElementsByTagName('w:p');
  const lines = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const runs = paragraphs[i].getElementsByTagName('w:t');
    let pText = '';
    for (let j = 0; j < runs.length; j++) {
      pText += runs[j].textContent || '';
    }
    const clean = pText.trim();
    if (clean) lines.push(clean);
  }
  return lines.join('\n');
}

async function extractPptxText(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideEntries = [];

  zip.forEach((relativePath, zipEntry) => {
    const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
    if (match) {
      slideEntries.push({ num: Number(match[1]), entry: zipEntry });
    }
  });

  slideEntries.sort((a, b) => a.num - b.num);
  const slides = [];
  for (const s of slideEntries) {
    const xml = await s.entry.async('string');
    const chunks = collectXmlTagText(xml, 'a:t');
    if (chunks.length > 0) {
      slides.push(`Slide ${s.num}: ${chunks.join(' ')}`);
    }
  }
  return slides.join('\n\n');
}

/**
 * Extracts plain text from .pdf, .docx, .pptx, .txt, .md, or .csv files.
 */
export async function extractTextFromDocument(file) {
  if (!file) throw new Error('No file selected.');
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  let text = '';
  if (ext === 'pdf') {
    text = await extractPdfText(file);
  } else if (ext === 'docx') {
    text = await extractDocxText(file);
  } else if (ext === 'pptx') {
    text = await extractPptxText(file);
  } else if (ext === 'txt' || ext === 'md' || ext === 'csv') {
    text = await file.text();
  } else {
    throw new Error('Unsupported file. Use PDF, DOCX, PPTX, TXT, or MD.');
  }

  const clean = text.replace(/\u0000/g, '').trim();
  if (!clean) {
    throw new Error('No readable text found in file.');
  }
  return clean;
}
