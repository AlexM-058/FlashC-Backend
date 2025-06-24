import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

let clientInstance;

export const initializeMongoClient = (mongoURI) => {
  clientInstance = new MongoClient(mongoURI);
  return clientInstance;
};

export const getDb = (dbName = 'Users-Flash') => {
  if (!clientInstance) {
    throw new Error('MongoClient not initialized. Call initializeMongoClient first.');
  }
  return clientInstance.db(dbName);
};

const ensureCollectionExists = async (db, collectionName) => {
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    await db.createCollection(collectionName);
  }
};

export const findUserByUsername = async (username, collection = 'userdata', dbName = 'Users-Flash') => {
  const db = getDb(dbName);
  await ensureCollectionExists(db, collection);
  const users = db.collection(collection);
  return await users.findOne({ username });
};

export const registerUser = async (username, email, password, collection = 'userdata', dbName = 'Users-Flash') => {
  const db = getDb(dbName);
  await ensureCollectionExists(db, collection);
  const users = db.collection(collection);
  const hashedPassword = await bcrypt.hash(password, 10);
  await users.insertOne({ username, email, password: hashedPassword });
};

export const checkUserExists = async (username, email, collection = 'userdata', dbName = 'Users-Flash') => {
  const db = getDb(dbName);
  await ensureCollectionExists(db, collection);
  const users = db.collection(collection);
  return await users.findOne({
    $or: [...(username ? [{ username }] : []), ...(email ? [{ email }] : [])],
  });
};

// Salvează flashcards pentru un user într-o colecție separată
export const saveUserFlashcards = async (username, pdfFile, aiJson) => {
  const db = getDb();
  const collectionName = `flashCards_${username}`;
  await ensureCollectionExists(db, collectionName);
  await db.collection(collectionName).insertOne({
    id: uuidv4(),
    createdAt: new Date(),
    pdfFile,
    ai: aiJson,
  });
};

// Extrage toate flashcards pentru un user, sortate descrescător după createdAt, cu id și metadate
export const getUserFlashcards = async (username) => {
  const db = getDb();
  const collectionName = `flashCards_${username}`;
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  if (!exists) return [];
  const data = await db.collection(collectionName).find({}).sort({ createdAt: -1 }).toArray();
  // Returnează toate câmpurile relevante (inclusiv id, pdfFile, createdAt, ai)
  return data.map((doc) => ({
    id: doc.id,
    pdfFile: doc.pdfFile,
    createdAt: doc.createdAt,
    ai: doc.ai,
  }));
};

// Verifică dacă există colecția de flashcards pentru user
export const existsUserFlashcardsCollection = async (username) => {
  const db = getDb();
  const collectionName = `flashCards_${username}`;
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  return exists;
};

// Creează explicit colecția de flashcards pentru user dacă nu există
export const createUserFlashcardsCollection = async (username) => {
  const db = getDb();
  const collectionName = `flashCards_${username}`;
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  if (!exists) {
    await db.createCollection(collectionName);
  }
};

// Verifică dacă există deja un document cu același pdfFile în colecția userului
export const existsFlashcardDocument = async (username, pdfFile) => {
  const db = getDb();
  const collectionName = `flashCards_${username}`;
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  if (!exists) return false;
  const doc = await db.collection(collectionName).findOne({ pdfFile });
  return !!doc;
};

export const logCollections = async (dbName = 'Users-Flash') => {
  if (!clientInstance) return;
  const db = getDb(dbName);
  const collections = await db.listCollections().toArray();
  console.log(`\n📁 Collections in database '${dbName}':`);
  collections.forEach((col) => console.log(` - ${col.name}`));
};
