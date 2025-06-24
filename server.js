import bcrypt from 'bcrypt';
import { authenticateToken as originalAuthenticateToken } from "./utils/AuthToken.js";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeMongoClient } from './utils/mongo.js';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getUserFlashcards, processPdfToFlashcards } from './utils/functions.js';
import { existsUserFlashcardsCollection,
     createUserFlashcardsCollection,
      saveUserFlashcards,
       existsFlashcardDocument } from './utils/mongo.js';
import { CompareResponnse } from './utils/gemininapi.js';
dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


initializeMongoClient(process.env.MONGO_URI);
import('./utils/mongo.js').then(({ logCollections }) => logCollections('Users-Flash'));

function authenticateToken(req, res, next) {
    
    if (req.headers.authorization) {
      console.log("Auth middleware Authorization header:", req.headers.authorization);
    }
   
    return originalAuthenticateToken(req, res, next);
  }
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(cookieParser());

const codes = new Map(); 

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true);
      else cb(new Error('Only PDF files are allowed!'));
    }
  
});

app.get('/', (req, res) => {
  res.send('Server is running!');
});

app.post('/login', express.json(), async (req, res) => {
    const { username, password } = req.body;
    console.log('[DEBUG] /login username:', username);
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }
    try {
      const { findUserByUsername } = await import('./utils/mongo.js');
      const TheUser = await findUserByUsername(username);
      if (!TheUser) {
        return res.status(401).json({ message: "Incorrect username or password." });
      }
      const isMatch = await bcrypt.compare(password, TheUser.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Incorrect username or password." });
      }
      // Generate JWT token
      const token = jwt.sign(
        {
          username: TheUser.username,
          id: TheUser._id,
          rights: TheUser.rights || 0,
          iss: "User"
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      // Set token as httpOnly cookie, allow cross-origin with credentials
      res.cookie("token", token, {
        httpOnly: true,
        sameSite: "none", // important for cross-origin cookies!
        secure: true      // must be true for sameSite: 'none'
      });
      res.status(200).json({ message: "Login successful." });
    } catch (err) {
      console.error('[DEBUG] /login error:', err);
      res.status(500).json({ message: "Internal server error.", debug: err.message, stack: err.stack });
    }
});


app.post('/register', express.json(), async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const { registerUser } = await import('./utils/mongo.js');
    await registerUser(username, email, password, 'userdata', 'Users-Flash');
    console.log(`User ${username} added to 'userdata' collection in 'Users-Flash' database.`);
    res.status(201).json({ message: 'User successfully added!' });
  } catch (err) {
    res.status(500).json({ error: 'Error adding user.' });
  }
});

app.post('/add-card', authenticateToken, express.json(), async (req, res) => {
  const { username, cardData } = req.body;
  if (!username || !cardData) {
    return res.status(400).json({ error: 'username and cardData are required.' });
  }
  try {
    const { addCardForUser } = require('./utils/mongo.js');
    await addCardForUser(username, cardData);
    console.log(`Card added for user ${username}.`);
    res.status(201).json({ message: 'Card added for user.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error adding card.' });
  }
});

app.post('/check-user', express.json(), async (req, res) => {
    const { username, email } = req.body;
    if (!username && !email) {
      return res.status(400).json({
        exists: false,
        message: "Username or email missing",
      });
    }
    try {
      const { checkUserExists } = await import('./utils/mongo.js');
      const existingUser = await checkUserExists(username, email, 'userdata', 'Users-Flash');
      res.status(200).json({ exists: !!existingUser });
    } catch (err) {
      console.error("Check error:", err);
      res.status(500).json({ message: "Server error" });
    }
});
app.patch('/ForgotPassword', express.json(), async (req, res) => {
  const { username, newPassword } = req.body;
  if (!username || !newPassword) {
    return res.status(400).json({ error: 'Username and new password are required.' });
  }
  try {
    const { findUserByUsername, registerUser } = await import('./utils/mongo.js');
    const user = await findUserByUsername(username, 'userdata', 'Users-Flash');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await registerUser(username, user.email, hashedPassword, 'userdata', 'Users-Flash');
    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error("Error updating password:", err);
    res.status(500).json({ error: 'Error updating password.' });
  }
});

app.post('/api/send-code', express.json(), async (req, res) => {
  const { email, username } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email is required.' });
  const code = Math.floor(100000 + Math.random() * 900000);
  codes.set(email, { code, expires: Date.now() + 10 * 60 * 1000 });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #222;">
      <h2>Hi${username ? ' ' + username : ''},</h2>
      <p>Thank you for registering to FlashC!</p>
      <p>Your verification code is:</p>
      <div style="font-size: 2em; font-weight: bold; color: #1976d2; margin: 16px 0;">${code}</div>
      <p>This code is valid for 10 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
      <br>
      <p style="font-size: 0.9em; color: #888;">FlashC Team</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your FlashC Verification Code',
      text: `Hi${username ? ' ' + username : ''},\nYour verification code is: ${code}\nThis code is valid for 10 minutes.`,
      html: htmlContent
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to send verification code.',
      debug: err.message,
      stack: err.stack,
      emailUser: process.env.EMAIL_USER,
      emailPass: process.env.EMAIL_PASS,
      code,
      to: email,
      username
    });
  }
});

app.post('/api/verify-code', express.json(), (req, res) => {
  const { email, code } = req.body;
  const saved = codes.get(email);
  if (
    saved &&
    saved.code.toString() === code.toString() &&
    saved.expires > Date.now()
  ) {
    codes.delete(email);
    res.json({ valid: true });
  } else {
    res.json({ valid: false });
  }
});



app.post( "/api/gemini-text",
  authenticateToken,
  upload.single("pdf"),
  async (req, res) => {
    const username = req.body.username || req.query.username || req.user?.username;
    console.log('[DEBUG] /api/gemini-text - username:', username);
    console.log('[DEBUG] /api/gemini-text - req.file:', req.file);
    if (!username) {
      return res.status(400).json({ success: false, error: "Username is required." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No PDF uploaded." });
    }
    let filePath = req.file.path;
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, Buffer.from([]));
    }
    try {
      const alreadyExists = await existsFlashcardDocument(username, req.file.originalname);
      console.log('[DEBUG] /api/gemini-text - alreadyExists:', alreadyExists);
      if (alreadyExists) {
        return res.status(409).json({ success: false, error: "PDF deja convertit în flashcarduri" });
      }
      const flashcards = await processPdfToFlashcards(filePath);
      console.log('[DEBUG] /api/gemini-text - flashcards:', flashcards);
      const exists = await existsUserFlashcardsCollection(username);
      if (!exists) {
        await createUserFlashcardsCollection(username);
      }
      await saveUserFlashcards(username, req.file.originalname, flashcards);
      console.log('[DEBUG] /api/gemini-text - id salvat pentru PDF:', username, req.file.originalname);
      res.json({ success: true, flashcards });
    } catch (err) {
      console.error('[DEBUG] /api/gemini-text - error:', err);
      res.status(500).json({ success: false, error: err.response?.data || err.message });
    } finally {
      try {
        const uploadDir = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadDir)) {
          for (const file of fs.readdirSync(uploadDir)) {
            fs.unlinkSync(path.join(uploadDir, file));
          }
        }
      } catch (e) {}
    }
  }
);





// Creează folderul uploads dacă nu există la pornirea serverului
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Endpoint pentru extragere flashcards pentru un utilizator
app.get('/api/flashcards/:username', authenticateToken, async (req, res) => {
  const username = req.params.username;
  if (!username) {
    return res.status(400).json({ success: false, error: 'Username is required.' });
  }
  try {
    const flashcardsArr = await getUserFlashcards(username);
    const summary = flashcardsArr.map(set => ({
      title: set.title || (set.ai && set.ai.title) || '',
      count: Array.isArray(set.flashcards) ? set.flashcards.length : (set.ai && Array.isArray(set.ai.flashcards) ? set.ai.flashcards.length : 0)
    }));
    res.json({ success: true, flashcards: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint pentru extragere flashcard după titlu
app.get('/api/flashcard/:username/:title', authenticateToken, async (req, res) => {
  const username = req.params.username;
  const title = req.params.title;
  if (!username || !title) {
    return res.status(400).json({ success: false, error: 'Username și titlu sunt necesare.' });
  }
  try {
    const flashcardsArr = await getUserFlashcards(username);
    const found = flashcardsArr.find(set => set.title === title || (set.ai && set.ai.title === title));
    if (!found) {
      return res.status(404).json({ success: false, error: 'Setul nu a fost găsit.' });
    }
    res.json({ success: true, flashcard: found });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// Endpoint pentru comparație răspunsuri
app.post('/api/compare-answers', authenticateToken, express.json(), async (req, res) => {
  const { Answer, UserAnswer } = req.body;
  if (!Answer || !UserAnswer) {
    return res.status(400).json({ success: false, error: "Both answers are mandatory" });
  }
  const finalArray = await CompareResponnse(Answer, UserAnswer);
  let cleanResult = finalArray;
  try {
    // Elimină delimitatoarele ```json sau ``` și parsează JSON-ul dacă e cazul
    if (typeof finalArray === 'string') {
      const cleaned = finalArray.replace(/```json|```/g, '').trim();
      cleanResult = JSON.parse(cleaned);
    }
  } catch (e) {
    cleanResult = finalArray;
  }
  res.json({ success: true, result: cleanResult });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
  console.log(`Backend running at: http://localhost:${PORT}`);
});