import { GoogleGenAI, createUserContent, createPartFromUri } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function uploadFileToGemini(filePath, mimeType) {
  const myfile = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  });
  console.log("Uploaded file:", myfile);
  return myfile;
}

export async function generateContentWithFile(fileObj, promptText) {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: createUserContent([
      createPartFromUri(fileObj.uri, fileObj.mimeType),
      "\n\n",
      promptText,
    ]),
  });
  console.log("result.text=", result.text);
  return result.text;
}

let response = null;


export async function generateAiJson(allText) {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Extract the content from the following PDF text and create between 12 and 30 flashcards,
     all grouped under a single relevant title for the PDF content. The response must be a single JSON object
      with the structure: {"title":..., "flashcards":[{"question":..., "answer":..., "hint":...}, ...]}.
       All flashcards must be in the original language of the PDF. Do not add any text outside the JSON object.
       \nPDF text:\n${allText}`,
  });
  return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
}
export async function CompareResponnse(Aitext,Yourtext) {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Compare the correct answer below with the user's answer.
       The correct answer is:\n${Aitext}\nThe user's answer is:\n${Yourtext}\nReturn a JSON array with two elements:
        the first should be a grade from 1 to 10 for the user's answer, and the second should be a short feedback
         (maximum 10 words). The feedback must be in the same language as the answers above 
         (the language in which Aitext and Yourtext are written). Do not add any other text except the array.`,
    });
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }


