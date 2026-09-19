import 'server-only';
import JSZip from 'jszip';

/**
 * Turns an uploaded file into plain text.
 *
 * Everything here runs locally — no document-conversion service, no extra API
 * cost. Images are the exception: they carry no extractable text, so they are
 * marked as such and read by the model's vision during course analysis.
 */

export interface ExtractionResult {
  text: string;
  pageCount: number;
  state: 'ready' | 'unsupported' | 'failed';
  error: string;
}

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.tex', '.rtf'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic'];

export function extensionOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.slice(index).toLowerCase();
}

export function isImage(filename: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(filename));
}

export function isSupported(filename: string): boolean {
  const extension = extensionOf(filename);
  return (
    extension === '.pdf' ||
    extension === '.docx' ||
    extension === '.pptx' ||
    TEXT_EXTENSIONS.includes(extension) ||
    IMAGE_EXTENSIONS.includes(extension)
  );
}

export async function extractText(buffer: Buffer, filename: string): Promise<ExtractionResult> {
  const extension = extensionOf(filename);

  try {
    if (extension === '.pdf') return await extractPdf(buffer);
    if (extension === '.docx') return await extractDocx(buffer);
    if (extension === '.pptx') return await extractPptx(buffer);
    if (TEXT_EXTENSIONS.includes(extension)) {
      const text = buffer.toString('utf8');
      return { text: normalise(text), pageCount: 1, state: 'ready', error: '' };
    }
    if (IMAGE_EXTENSIONS.includes(extension)) {
      return {
        text: '',
        pageCount: 1,
        state: 'unsupported',
        error: 'IMAGE_NEEDS_VISION',
      };
    }
    if (extension === '.doc' || extension === '.ppt') {
      return {
        text: '',
        pageCount: 0,
        state: 'unsupported',
        error: 'LEGACY_OFFICE_FORMAT',
      };
    }
    return { text: '', pageCount: 0, state: 'unsupported', error: 'UNKNOWN_FORMAT' };
  } catch (error) {
    return {
      text: '',
      pageCount: 0,
      state: 'failed',
      error: error instanceof Error ? error.message : 'extraction failed',
    };
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  // The legacy build runs in Node without a DOM.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const document = await task.promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push(`[page ${pageNumber}]\n${text}`);
    page.cleanup();
  }
  await document.destroy();

  const text = normalise(pages.join('\n\n'));
  return {
    text,
    pageCount: document.numPages,
    // A PDF of scanned images yields no text. Say so rather than storing an
    // empty document and pretending it was read.
    state: text.length > 40 ? 'ready' : 'unsupported',
    error: text.length > 40 ? '' : 'PDF_HAS_NO_TEXT_LAYER',
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  const text = normalise(result.value);
  return {
    text,
    pageCount: 0,
    state: text.length > 0 ? 'ready' : 'unsupported',
    error: text.length > 0 ? '' : 'DOCX_EMPTY',
  };
}

/**
 * PowerPoint text lives in <a:t> nodes inside ppt/slides/slideN.xml. Reading
 * the zip directly avoids pulling in a heavyweight Office parser.
 */
async function extractPptx(buffer: Buffer): Promise<ExtractionResult> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const notesNames = Object.keys(zip.files).filter((name) =>
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name),
  );

  const slides: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async('string');
    const text = textFromOfficeXml(xml);
    if (text) slides.push(`[slide ${slideNumber(name)}]\n${text}`);
  }
  for (const name of notesNames) {
    const xml = await zip.files[name].async('string');
    const text = textFromOfficeXml(xml);
    if (text) slides.push(`[notes ${slideNumber(name)}]\n${text}`);
  }

  const text = normalise(slides.join('\n\n'));
  return {
    text,
    pageCount: slideNames.length,
    state: text.length > 0 ? 'ready' : 'unsupported',
    error: text.length > 0 ? '' : 'PPTX_EMPTY',
  };
}

function slideNumber(name: string): number {
  return Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

function textFromOfficeXml(xml: string): string {
  const runs = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1]));
  // Paragraph boundaries keep bullet lists readable.
  return runs.join(' ').replace(/\s+/g, ' ').trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function normalise(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
