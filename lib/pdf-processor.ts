/**
 * PDF processing utilities for lab reports
 * Handles password-protected PDFs, text extraction, and lab value parsing
 * Uses pdfjs-dist with server-side configuration
 */

// For server-side, we need to use a different approach
// pdfjs-dist has issues with DOMMatrix in Node.js, so we'll use pdf-parse as fallback
// or configure pdfjs-dist to work without DOM APIs

let pdfjsLib: any;
let getDocument: any;
let PDFDocumentProxy: any;

// Dynamic import to handle server-side vs client-side
if (typeof window === 'undefined') {
  // Server-side: Use pdfjs-dist without worker (synchronous mode)
  // This avoids DOMMatrix issues
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib = pdfjs;
  getDocument = pdfjs.getDocument;
  
  // Disable worker for server-side (use synchronous rendering)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
} else {
  // Client-side: Use standard pdfjs-dist
  pdfjsLib = require('pdfjs-dist');
  getDocument = pdfjsLib.getDocument;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

// Type definitions
export interface LabValue {
  analyteName: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  collectionDate?: string;
  accessionNumber?: string;
  laboratoryName?: string;
}

export interface PDFProcessingResult {
  text: string;
  labValues: LabValue[];
  pageCount: number;
}

export type PDFDocumentProxyType = any;

/**
 * Load and decrypt password-protected PDF
 */
export async function loadPDF(
  pdfBuffer: Buffer,
  password?: string
): Promise<PDFDocumentProxyType> {
  const loadingTask = getDocument({
    data: pdfBuffer,
    password: password,
    useWorkerFetch: false, // Disable worker fetch for server-side
    isEvalSupported: false, // Disable eval for security
    verbosity: 0, // Reduce logging
  });

  try {
    const pdf = await loadingTask.promise;
    return pdf;
  } catch (error: any) {
    if (error.name === 'PasswordException') {
      throw new Error('PDF password incorrect or required');
    }
    throw new Error(`Failed to load PDF: ${error.message}`);
  }
}

/**
 * Extract text from PDF
 */
export async function extractTextFromPDF(pdf: PDFDocumentProxyType): Promise<string> {
  let fullText = '';
  const numPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Combine text items with proper spacing
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    
    fullText += pageText + '\n\n';
  }

  return fullText.trim();
}

/**
 * Parse lab values from extracted text
 * Uses pattern matching to identify common lab test formats
 */
export function parseLabValues(text: string): LabValue[] {
  const labValues: LabValue[] = [];
  
  // Common patterns for lab results
  // Format: Test Name | Value | Unit | Reference Range
  // Example: "Glucose | 95 | mg/dL | 70-100"
  
  const lines = text.split('\n');
  let currentLabName = '';
  let currentLabDate: string | undefined;
  let currentAccession: string | undefined;
  let currentLabName_full: string | undefined;
  
  // Try to extract lab name and date from header
  for (const line of lines.slice(0, 20)) {
    // Look for date patterns
    const dateMatch = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    if (dateMatch && !currentLabDate) {
      currentLabDate = dateMatch[1];
    }
    
    // Look for accession numbers
    const accessionMatch = line.match(/accession[:\s]+([A-Z0-9\-]+)/i);
    if (accessionMatch && !currentAccession) {
      currentAccession = accessionMatch[1];
    }
    
    // Look for lab name
    const labNameMatch = line.match(/([A-Z][A-Z\s&]+(?:LABORATORY|LAB|DIAGNOSTICS|MEDICAL))/i);
    if (labNameMatch && !currentLabName_full) {
      currentLabName_full = labNameMatch[1].trim();
    }
  }
  
  // Parse test results
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Pattern 1: Test Name | Value | Unit | Range
    const pipePattern = /^([A-Z][A-Za-z\s]+?)\s*\|\s*([\d.]+)\s*\|\s*([A-Za-z\/%]+)\s*\|\s*([\d.\-\s<>]+)$/;
    const pipeMatch = line.match(pipePattern);
    
    if (pipeMatch) {
      labValues.push({
        analyteName: pipeMatch[1].trim(),
        value: pipeMatch[2].trim(),
        unit: pipeMatch[3].trim(),
        referenceRange: pipeMatch[4].trim(),
        collectionDate: currentLabDate,
        accessionNumber: currentAccession,
        laboratoryName: currentLabName_full,
      });
      continue;
    }
    
    // Pattern 2: Test Name: Value Unit (Range)
    const colonPattern = /^([A-Z][A-Za-z\s]+?):\s*([\d.]+)\s*([A-Za-z\/%]+)\s*\(([\d.\-\s<>]+)\)$/;
    const colonMatch = line.match(colonPattern);
    
    if (colonMatch) {
      labValues.push({
        analyteName: colonMatch[1].trim(),
        value: colonMatch[2].trim(),
        unit: colonMatch[3].trim(),
        referenceRange: colonMatch[4].trim(),
        collectionDate: currentLabDate,
        accessionNumber: currentAccession,
        laboratoryName: currentLabName_full,
      });
      continue;
    }
    
    // Pattern 3: Test Name Value Unit Range (tab or multiple spaces)
    const tabPattern = /^([A-Z][A-Za-z\s]+?)\s{2,}([\d.]+)\s+([A-Za-z\/%]+)\s+([\d.\-\s<>]+)$/;
    const tabMatch = line.match(tabPattern);
    
    if (tabMatch) {
      labValues.push({
        analyteName: tabMatch[1].trim(),
        value: tabMatch[2].trim(),
        unit: tabMatch[3].trim(),
        referenceRange: tabMatch[4].trim(),
        collectionDate: currentLabDate,
        accessionNumber: currentAccession,
        laboratoryName: currentLabName_full,
      });
      continue;
    }
    
    // Pattern 4: Common test names followed by value
    const commonTests = [
      'Glucose', 'Cholesterol', 'HDL', 'LDL', 'Triglycerides',
      'Hemoglobin', 'Hematocrit', 'WBC', 'RBC', 'Platelets',
      'Sodium', 'Potassium', 'Creatinine', 'BUN', 'ALT', 'AST',
      'TSH', 'T4', 'T3', 'Vitamin D', 'B12', 'Folate',
    ];
    
    for (const testName of commonTests) {
      const testPattern = new RegExp(`^${testName}[:\s]+([\d.]+)\\s*([A-Za-z\/%]+)?`, 'i');
      const testMatch = line.match(testPattern);
      
      if (testMatch) {
        labValues.push({
          analyteName: testName,
          value: testMatch[1].trim(),
          unit: testMatch[2]?.trim(),
          collectionDate: currentLabDate,
          accessionNumber: currentAccession,
          laboratoryName: currentLabName_full,
        });
        break;
      }
    }
  }
  
  // If no structured data found, try to extract any number-value pairs
  if (labValues.length === 0) {
    // Fallback: look for any pattern that might be a lab value
    const fallbackPattern = /([A-Z][A-Za-z\s]{2,30}?)[:\s]+([\d.]+)\s*([A-Za-z\/%]+)?/g;
    let match;
    
    while ((match = fallbackPattern.exec(text)) !== null) {
      const testName = match[1].trim();
      // Skip if it looks like a date or other non-test value
      if (testName.length > 3 && testName.length < 50 && !testName.match(/^\d/)) {
        labValues.push({
          analyteName: testName,
          value: match[2].trim(),
          unit: match[3]?.trim(),
          collectionDate: currentLabDate,
          accessionNumber: currentAccession,
          laboratoryName: currentLabName_full,
        });
      }
    }
  }
  
  return labValues;
}

/**
 * Process PDF: decrypt, extract text, and parse lab values
 */
export async function processPDF(
  pdfBuffer: Buffer,
  password?: string
): Promise<PDFProcessingResult> {
  // Load PDF (with password if provided)
  const pdf = await loadPDF(pdfBuffer, password);
  const pageCount = pdf.numPages;
  
  // Extract text
  const text = await extractTextFromPDF(pdf);
  
  // Parse lab values
  const labValues = parseLabValues(text);
  
  return {
    text,
    labValues,
    pageCount,
  };
}

