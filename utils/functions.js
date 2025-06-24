// utils/functions.js
import fs from 'fs';
import axios from 'axios';

export async function getUserFlashcards(username) {
  const { getDb } = await import("./mongo.js");
  const db = getDb("Users-Flash");
  const collectionName = `flashCards_${username}`;
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  if (!exists) return [];
  const data = await db.collection(collectionName).find({}).sort({ createdAt: -1 }).toArray();
  return data.map(doc => {
    if (doc.ai && typeof doc.ai === 'object' && doc.ai.raw) {
      try {
        return JSON.parse(doc.ai.raw);
      } catch {
        return doc.ai.raw;
      }
    }
    return doc.ai;
  });
}

export async function uploadAndConvertPdf(filePath, originalname, apiKey) {
  //   const pdfBuffer = fs.readFileSync(filePath);
  //   const FormData = (await import('form-data')).default;
  //   const formData = new FormData();
  //   formData.append('file', pdfBuffer, originalname);
  //   // 1. Upload PDF la PDF.co
  //   const uploadResp = await axios.post(
  //     'https://api.pdf.co/v1/file/upload',
  //     formData,
  //     {
  //       headers: {
  //         ...formData.getHeaders(),
  //         'x-api-key': apiKey
  //       },
  //       maxContentLength: Infinity,
  //       maxBodyLength: Infinity
  //     }
  //   );
  //   if (!uploadResp.data || !uploadResp.data.url) {
  //     throw new Error('PDF.co upload failed: ' + JSON.stringify(uploadResp.data));
  //   }
  //   const fileUrl = uploadResp.data.url;
  //   // 2. Trimite url la conversie
  //   const response = await axios.post(
  //     'https://api.pdf.co/v1/pdf/convert/to/json',
  //     { url: fileUrl },
  //     {
  //       headers: {
  //         'x-api-key': apiKey,
  //         'Content-Type': 'application/json'
  //       }
  //     }
  //   );
  //   // Extrage textul din JSON PDF.co (concatenează toate blocurile de text)
  //   let allText = '';
  //   if (response.data && response.data.body && Array.isArray(response.data.body)) {
  //     for (const page of response.data.body) {
  //       if (page.blocks && Array.isArray(page.blocks)) {
  //         for (const block of page.blocks) {
  //           if (block.text) allText += block.text + '\n';
  //         }
  //       }
  //     }
  //   }
  //   if (!allText) allText = JSON.stringify(response.data);
  //   return { pdfcoJson: response.data, allText };
  // Determină mimeType din extensie (doar PDF aici)
//   const mimeType = "application/pdf";
//   // 1. Upload PDF la Gemini
//   const fileObj = await uploadFileToGemini(filePath, mimeType);
//   // 2. Generează conținut cu Gemini
//   const promptText = `Extract the content from the following PDF and create between 12 and 30 flashcards, all grouped under a single relevant title for the PDF content. The response must be a single JSON object with the structure: {"title":..., "flashcards":[{"question":..., "answer":..., "hint":...}, ...]}. All flashcards must be in the original language of the PDF. Do not add any text outside the JSON object.`;
//   const aiText = await generateContentWithFile(fileObj, promptText);
//   // Returnează textul generat de Gemini (ca allText)
  return { pdfcoJson: {}, allText: aiText };
}

export async function saveFlashcards(username, pdfFile, pdfco, aiJson, getUserFlashcards) {
  const { getDb } = await import("./mongo.js");
  const db = getDb("Users-Flash");
  const collectionName = `flashCards_${username}`;
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName);
  }
  await db.collection(collectionName).insertOne({
    createdAt: new Date(),
    pdfFile,
    pdfco,
    ai: aiJson
  });
  return await getUserFlashcards(username);
}

export async function convertPdfToFlashcards(filePath) {
  const mimeType = "application/pdf";
  const { uploadFileToGemini, generateContentWithFile } = await import('./gemininapi.js');
  const fileObj = await uploadFileToGemini(filePath, mimeType);
  const promptText = `Extract the content from the following PDF and create between 12 and 30 flashcards, all grouped under a single relevant title for the PDF content. The response must be a single JSON object with the structure: {"title":..., "flashcards":[{"question":..., "answer":..., "hint":...}, ...]}. All flashcards must be in the original language of the PDF. Do not add any text outside the JSON object.`;
  const aiText = await generateContentWithFile(fileObj, promptText);
  return aiText;
}

// Procesează PDF și returnează direct obiectul JSON cu flashcards
export async function processPdfToFlashcards(filePath) {
  let result = await convertPdfToFlashcards(filePath);
  return cleanJsonString(result);
}

// Elimină delimitatoarele ```json sau ``` de la început/sfârșit și parsează în JSON
export function cleanJsonString(str) {
  if (!str) return str;
  const cleaned = str
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return cleaned;
  }
}
