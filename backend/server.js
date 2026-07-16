const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

// Robust manual fallback env loader & trimmer for Windows CRLF consistency
if (!process.env.MONGO_URI) {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach(line => {
        const index = line.indexOf('=');
        if (index > 0) {
          const key = line.substring(0, index).trim();
          const value = line.substring(index + 1).trim();
          if (key && value) {
            process.env[key] = value;
          }
        }
      });
    } catch (err) {
      console.error('Failed to parse .env file manually:', err.message);
    }
  }
}

// Clean all environment variables of whitespace/CRLF characters
for (const key of Object.keys(process.env)) {
  if (typeof process.env[key] === 'string') {
    process.env[key] = process.env[key].trim();
  }
}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'elevateai_super_secret_jwt_key';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Serve uploads statically so frontend can access resumes directly
app.use('/uploads', express.static(uploadDir));

// -------------------------------------------------------------
// SELF-HEALING DATABASE SYSTEM (MongoDB with Local JSON Fallback)
// -------------------------------------------------------------
const fallbackDbPath = path.join(__dirname, 'db_fallback.json');
let mockDb = { sessions: {}, users: {} };

if (fs.existsSync(fallbackDbPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(fallbackDbPath, 'utf8'));
    mockDb.sessions = loaded.sessions || {};
    mockDb.users = loaded.users || {};
    
    // Migrate legacy unstructured formats
    for (const key of Object.keys(loaded)) {
      if (key !== 'sessions' && key !== 'users' && loaded[key] && loaded[key].candidateName) {
        mockDb.sessions[key] = loaded[key];
      }
    }
  } catch (e) {
    console.error('Failed to parse local fallback DB, resetting:', e);
  }
}

function persistFallbackDb() {
  try {
    fs.writeFileSync(fallbackDbPath, JSON.stringify(mockDb, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write local fallback DB:', e);
  }
}

let isMongoConnected = false;

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected successfully');
    isMongoConnected = true;
  })
  .catch(err => {
    console.error('MongoDB connection error, falling back to local JSON database:', err.message);
    isMongoConnected = false;
  });

// Schemas & Models
const Session = require('./models/Session');
const User = require('./models/User');

// Helper DB CRUD Operations for Users
async function saveUser(userData) {
  if (isMongoConnected) {
    try {
      if (userData.save && typeof userData.save === 'function') {
        return await userData.save();
      } else {
        let doc;
        if (userData._id) {
          doc = await User.findById(userData._id);
          if (doc) Object.assign(doc, userData);
          else doc = new User(userData);
        } else {
          doc = new User(userData);
        }
        return await doc.save();
      }
    } catch (err) {
      console.error('Failed to write user to MongoDB, caching in local DB instead:', err.message);
    }
  }
  
  if (!userData._id) {
    userData._id = new mongoose.Types.ObjectId().toString();
  }
  const id = userData._id.toString();
  const rawData = JSON.parse(JSON.stringify(userData));
  rawData._id = id;
  
  mockDb.users[id] = rawData;
  persistFallbackDb();
  return rawData;
}

async function findUserByEmail(email) {
  if (isMongoConnected) {
    try {
      return await User.findOne({ email: email.toLowerCase().trim() });
    } catch (err) {
      console.error('Mongoose findUserByEmail error:', err.message);
    }
  }
  const normEmail = email.toLowerCase().trim();
  return Object.values(mockDb.users).find(u => u.email.toLowerCase().trim() === normEmail) || null;
}

async function findUserById(id) {
  if (isMongoConnected) {
    try {
      return await User.findById(id);
    } catch (err) {
      console.error('Mongoose findUserById error:', err.message);
    }
  }
  return mockDb.users[id] || null;
}

// Helper DB CRUD Operations for Sessions
async function saveSession(sessionData) {
  if (isMongoConnected) {
    try {
      if (sessionData.save && typeof sessionData.save === 'function') {
        return await sessionData.save();
      } else {
        let doc;
        if (sessionData._id) {
          doc = await Session.findById(sessionData._id);
          if (doc) {
            Object.assign(doc, sessionData);
          } else {
            doc = new Session(sessionData);
          }
        } else {
          doc = new Session(sessionData);
        }
        return await doc.save();
      }
    } catch (dbErr) {
      console.error('Failed to write session to MongoDB, caching in local DB instead:', dbErr.message);
    }
  }
  
  if (!sessionData._id) {
    sessionData._id = new mongoose.Types.ObjectId().toString();
  }
  const id = sessionData._id.toString();
  const rawData = JSON.parse(JSON.stringify(sessionData));
  rawData._id = id;
  
  mockDb.sessions[id] = rawData;
  persistFallbackDb();
  return rawData;
}

async function findSessionById(id) {
  if (isMongoConnected) {
    try {
      const doc = await Session.findById(id);
      if (doc) return doc;
    } catch (err) {
      console.error('Mongoose findById error:', err.message);
    }
  }
  return mockDb.sessions[id] || null;
}

async function getAllSessions(userId) {
  if (isMongoConnected) {
    try {
      return await Session.find({ userId }).sort({ createdAt: -1 }).select('candidateName targetRole targetCompany overallScore status createdAt');
    } catch (err) {
      console.error('Mongoose find all error:', err.message);
    }
  }
  
  return Object.values(mockDb.sessions)
    .filter(s => s.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(s => ({
      _id: s._id,
      candidateName: s.candidateName,
      targetRole: s.targetRole,
      targetCompany: s.targetCompany,
      overallScore: s.overallScore,
      status: s.status,
      createdAt: s.createdAt
    }));
}

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Gemini API setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

// Utility to convert file to base64 for Gemini inline data
function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType
    },
  };
}

// JWT Authentication Middleware
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. Sign up or log in first.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
};

// -------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------

// Sign Up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please enter all fields (Name, Email, Password)' });
    }

    const userExists = await findUserByEmail(email);
    if (userExists) {
      return res.status(400).json({ error: 'User already exists with this email address' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      name,
      email,
      password: hashedPassword,
      createdAt: new Date()
    };

    const savedUser = await saveUser(newUser);

    const token = jwt.sign({ id: savedUser._id, name: savedUser.name }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email
      }
    });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ error: 'Registration failed due to a server error' });
  }
});

// Log In
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter both email and password' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Login failed due to a server error' });
  }
});

// Get Current User Profile
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User profile not found' });
    res.json({
      id: user._id,
      name: user.name,
      email: user.email
    });
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch profile' });
  }
});

// -------------------------------------------------------------
// INTERVIEW SESSION ENDPOINTS
// -------------------------------------------------------------

// Start Session
app.post('/api/session/start', authMiddleware, async (req, res) => {
  try {
    const { candidateName, targetRole, targetCompany, jobDescription } = req.body;
    if (!candidateName || !targetRole) {
      return res.status(400).json({ error: 'Candidate name and Target Role are required' });
    }

    const sessionData = {
      candidateName,
      userId: req.user.id,
      targetRole,
      targetCompany: targetCompany || 'Any Company',
      jobDescription: jobDescription || '',
      status: 'created',
      createdAt: new Date(),
      resumeParsedData: { skills: [], projects: [], experience: [], education: [], certifications: [] },
      technicalRound: { questions: [], score: 0 },
      codingRound: { challenges: [], score: 0 },
      hrRound: { questions: [], score: 0 },
      communicationRound: { topic: '', userAnswer: '', score: 0, grammarFeedback: '', overallFeedback: '' },
      overallScore: 0
    };

    const session = await saveSession(sessionData);
    res.status(201).json(session);
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload Resume & Parse
app.post('/api/session/:id/resume', authMiddleware, upload.single('resume'), async (req, res) => {
  try {
    const { id } = req.params;
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied: session does not belong to user' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No resume file uploaded' });
    }

    const filePath = req.file.path;
    let resumeUrl = '';

    // Upload to Cloudinary
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'resumes',
        resource_type: 'auto'
      });
      resumeUrl = result.secure_url;
    } catch (cloudinaryErr) {
      console.error('Cloudinary upload error, using local path as fallback:', cloudinaryErr.message);
      // Fallback returns absolute local server path
      resumeUrl = `http://localhost:5000/uploads/${req.file.filename}`;
    }

    // Parse resume content using Gemini
    let resumeParsedData = {
      skills: [],
      projects: [],
      experience: [],
      education: [],
      certifications: []
    };

    try {
      const pdfPart = fileToGenerativePart(filePath, req.file.mimetype);
      const prompt = `
        Analyze this resume document. Extract the following information:
        - Skills: a clean list of technical and soft skills (array of strings)
        - Projects: list of projects described (array of strings)
        - Experience: list of jobs or work experience (array of strings)
        - Education: list of educational qualifications (array of strings)
        - Certifications: list of certifications (array of strings)
        
        Respond with a JSON object of the format:
        {
          "skills": ["Skill1", "Skill2"],
          "projects": ["Project1", "Project2"],
          "experience": ["Job1", "Job2"],
          "education": ["Edu1", "Edu2"],
          "certifications": ["Cert1", "Cert2"]
        }
      `;

      const response = await model.generateContent({
        contents: [{ parts: [pdfPart, { text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });

      const parsed = JSON.parse(response.response.text());
      resumeParsedData = {
        skills: parsed.skills || [],
        projects: parsed.projects || [],
        experience: parsed.experience || [],
        education: parsed.education || [],
        certifications: parsed.certifications || []
      };
    } catch (geminiErr) {
      console.error('Gemini Resume parsing failed, proceeding with empty parser:', geminiErr.message);
    } finally {
      // Clean up local file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    session.resumeUrl = resumeUrl;
    session.resumeParsedData = resumeParsedData;
    session.status = 'resume_parsed';
    
    const updatedSession = await saveSession(session);
    res.json(updatedSession);
  } catch (error) {
    console.error('Error handling resume upload:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Questions Preview: Generate All Questions for Study Guide
app.post('/api/session/:id/preview-questions', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const skills = session.resumeParsedData.skills.join(', ') || 'General Development';
    const experience = session.resumeParsedData.experience.join('. ') || 'N/A';
    const crypto = require('crypto');
    const randomSeed = crypto.randomBytes(8).toString('hex');

    const prompt = `
      You are an elite Senior Interview Panel Board. 
      Your task is to generate a highly customized, ultra-precise prep packet of interview questions for the candidate "${session.candidateName}" who is applying for the role of "${session.targetRole}" at "${session.targetCompany}".
      
      Candidate Profile:
      - Skills: [${skills}]
      - Experiences: [${experience}]
      - Target Role: "${session.targetRole}"
      - Selected Company: "${session.targetCompany}"
      
      Unique Randomization parameters:
      - Session Seed: "${randomSeed}"
      - Instructions: Generate completely fresh, unique, and dynamic questions. Choose different sub-topics, frameworks, and tools from their skills: [${skills}] to focus on. Under no circumstances should you generate standard templates or duplicate previous interview questions.
      
      To ensure 95% to 98% relevance and accuracy:
      1. Tailor the difficulty level exactly to the candidate's experience. If they have internship or junior level experience, ask junior/intermediate level questions. If they have senior level experience, ask architectural/advanced questions.
      2. Align the questions with "${session.targetCompany}"'s actual known interview standards and topics. If it is Google, focus on strong algorithm design, data structures, and large scale system design. If it is Wipro or similar IT service companies, focus on MERN stack, database integration, and troubleshooting.
      3. Do NOT ask generic questions. Every question must directly reference or test a technology listed in the candidate's skills: [${skills}].
      4. Make sure technical questions, HR questions, and coding challenges are presented in a correct, professional, and clear manner.
      
      Generate the following exactly:
      1. Exactly 5 custom technical interview questions.
      2. Exactly 1 coding challenge suitable for this role (with a title, description, and expectedSolution code or approach).
      3. Exactly 3 behavioral/HR questions.
      4. Exactly 1 JAM (Just A Minute) session topic.

      Return the result as a single, valid JSON object matching this schema:
      {
        "technicalQuestions": ["question 1", "question 2", "question 3", "question 4", "question 5"],
        "codingChallenge": {
          "title": "Problem Title",
          "description": "Problem Description",
          "expectedSolution": "Expected solution or key hints"
        },
        "hrQuestions": ["question 1", "question 2", "question 3"],
        "jamTopic": "JAM Topic"
      }
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const data = JSON.parse(response.response.text());

    // Save generated questions to session for later reuse in mock quiz
    session.technicalRound = {
      questions: data.technicalQuestions.map(q => ({
        question: q,
        userAnswer: '',
        score: 0,
        feedback: ''
      })),
      score: 0
    };

    session.codingRound = {
      challenges: [{
        title: data.codingChallenge.title,
        description: data.codingChallenge.description,
        expectedSolution: data.codingChallenge.expectedSolution,
        userCode: '',
        score: 0,
        feedback: ''
      }],
      score: 0
    };

    session.hrRound = {
      questions: data.hrQuestions.map(q => ({
        question: q,
        userAnswer: '',
        score: 0,
        feedback: ''
      })),
      score: 0
    };

    session.communicationRound = {
      topic: data.jamTopic,
      userAnswer: '',
      score: 0,
      grammarFeedback: '',
      overallFeedback: ''
    };

    const updatedSession = await saveSession(session);
    res.json({
      technicalQuestions: data.technicalQuestions,
      codingChallenge: data.codingChallenge,
      hrQuestions: data.hrQuestions,
      jamTopic: data.jamTopic,
      sessionId: updatedSession._id
    });
  } catch (error) {
    console.error('Error generating preview questions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Technical Round: Generate Questions
app.post('/api/session/:id/technical/generate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.technicalRound && session.technicalRound.questions && session.technicalRound.questions.length > 0) {
      return res.json(session.technicalRound.questions);
    }

    const skills = session.resumeParsedData.skills.join(', ') || 'General Development';
    const experience = session.resumeParsedData.experience.join('. ') || 'N/A';
    
    const prompt = `
      You are a technical interviewer for the role of ${session.targetRole} at ${session.targetCompany}.
      Based on the candidate's skills [${skills}] and experience [${experience}], generate exactly 3 relevant technical questions.
      Keep them challenging but appropriate for their skillset.
      Return a JSON array of strings: ["question 1", "question 2", "question 3"]
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const questions = JSON.parse(response.response.text());
    
    session.technicalRound = {
      questions: questions.map(q => ({
        question: q,
        userAnswer: '',
        score: 0,
        feedback: ''
      })),
      score: 0
    };

    const updatedSession = await saveSession(session);
    res.json(updatedSession.technicalRound.questions);
  } catch (error) {
    console.error('Error generating technical questions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Technical Round: Submit Answers
app.post('/api/session/:id/technical/submit', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body; // Array of { question, userAnswer }
    
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const gradingPrompt = `
      You are a technical interviewer grading answers for the role of ${session.targetRole}.
      Grading the following answers:
      ${JSON.stringify(answers)}
      
      For each answer, assign a score from 0 to 100 based on accuracy, depth, and relevance.
      Provide constructive feedback for each.
      Return a JSON array of objects of the format:
      [
        {
          "question": "Question text",
          "userAnswer": "Answer text",
          "score": 85,
          "feedback": "Your explanation is good but misses key optimization..."
        }
      ]
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: gradingPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const gradedQuestions = JSON.parse(response.response.text());
    
    let totalScore = 0;
    gradedQuestions.forEach(q => {
      totalScore += q.score || 0;
    });
    const avgScore = Math.round(totalScore / gradedQuestions.length);

    session.technicalRound.questions = gradedQuestions;
    session.technicalRound.score = avgScore;
    session.status = 'technical_done';
    
    const updatedSession = await saveSession(session);
    res.json(updatedSession);
  } catch (error) {
    console.error('Error submitting technical answers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Coding Round: Generate Challenge
app.post('/api/session/:id/coding/generate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.codingRound && session.codingRound.challenges && session.codingRound.challenges.length > 0 && session.codingRound.challenges[0].title) {
      return res.json(session.codingRound.challenges[0]);
    }

    const skills = session.resumeParsedData.skills.join(', ') || 'Javascript';
    
    const prompt = `
      Generate a coding challenge suitable for a candidate interviewing for the role of ${session.targetRole}.
      Customize it to their skills: [${skills}].
      Format: Return a JSON object with:
      - title: The name of the coding problem
      - description: Clear problem description with inputs, outputs, constraints, and examples
      - expectedSolution: A sample correct solution or approach explanation.
      
      JSON schema:
      {
        "title": "String",
        "description": "String (use markdown syntax for paragraphs/code blocks)",
        "expectedSolution": "String"
      }
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const challenge = JSON.parse(response.response.text());

    session.codingRound = {
      challenges: [{
        title: challenge.title,
        description: challenge.description,
        expectedSolution: challenge.expectedSolution,
        userCode: '',
        score: 0,
        feedback: ''
      }],
      score: 0
    };

    const updatedSession = await saveSession(session);
    res.json(updatedSession.codingRound.challenges[0]);
  } catch (error) {
    console.error('Error generating coding challenge:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Coding Round: Submit Solution
app.post('/api/session/:id/coding/submit', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userCode } = req.body;

    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const challenge = session.codingRound.challenges[0];
    if (!challenge) {
      return res.status(400).json({ error: 'No coding challenge active' });
    }

    const gradingPrompt = `
      Evaluate this candidate's code submission for the challenge: "${challenge.title}".
      Problem Description: "${challenge.description}".
      Expected approach: "${challenge.expectedSolution}".
      Candidate's Submitted Code:
      \`\`\`
      ${userCode}
      \`\`\`
      
      Score the code out of 100 based on correctness, efficiency (time/space complexity), and code style.
      Provide a feedback summary.
      Return a JSON object:
      {
        "score": 90,
        "feedback": "Excellent work! Time complexity is O(N). Style is clean, but could handle edge cases..."
      }
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: gradingPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = JSON.parse(response.response.text());

    session.codingRound.challenges[0].userCode = userCode;
    session.codingRound.challenges[0].score = result.score || 0;
    session.codingRound.challenges[0].feedback = result.feedback || '';
    session.codingRound.score = result.score || 0;
    session.status = 'coding_done';

    const updatedSession = await saveSession(session);
    res.json(updatedSession);
  } catch (error) {
    console.error('Error submitting coding solution:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// HR Round: Generate Questions
app.post('/api/session/:id/hr/generate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.hrRound && session.hrRound.questions && session.hrRound.questions.length > 0) {
      return res.json(session.hrRound.questions);
    }

    const prompt = `
      You are an HR Manager interviewing a candidate for the role of ${session.targetRole} at ${session.targetCompany}.
      Generate exactly 3 behavioral or HR questions to assess cultural fit, collaboration, problem solving, and resilience.
      Return a JSON array of strings: ["question 1", "question 2", "question 3"]
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const questions = JSON.parse(response.response.text());

    session.hrRound = {
      questions: questions.map(q => ({
        question: q,
        userAnswer: '',
        score: 0,
        feedback: ''
      })),
      score: 0
    };

    const updatedSession = await saveSession(session);
    res.json(updatedSession.hrRound.questions);
  } catch (error) {
    console.error('Error generating HR questions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// HR Round: Submit Answers
app.post('/api/session/:id/hr/submit', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body; // Array of { question, userAnswer }

    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const gradingPrompt = `
      You are an HR manager grading behavioral answers for the role of ${session.targetRole}.
      Grading the following responses:
      ${JSON.stringify(answers)}
      
      For each response, assign a score from 0 to 100 based on communication, leadership qualities, alignment with values, and clarity.
      Provide short constructive feedback.
      Return a JSON array of objects of the format:
      [
        {
          "question": "Question text",
          "userAnswer": "Answer text",
          "score": 85,
          "feedback": "Good use of the STAR method to describe your challenge. Next time emphasize what you learned..."
        }
      ]
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: gradingPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const gradedQuestions = JSON.parse(response.response.text());

    let totalScore = 0;
    gradedQuestions.forEach(q => {
      totalScore += q.score || 0;
    });
    const avgScore = Math.round(totalScore / gradedQuestions.length);

    session.hrRound.questions = gradedQuestions;
    session.hrRound.score = avgScore;
    session.status = 'hr_done';

    const updatedSession = await saveSession(session);
    res.json(updatedSession);
  } catch (error) {
    console.error('Error submitting HR answers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Communication/JAM Session: Generate Topic
app.post('/api/session/:id/communication/generate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.communicationRound && session.communicationRound.topic) {
      return res.json({ topic: session.communicationRound.topic });
    }

    const prompt = `
      Generate a single JAM (Just A Minute) session topic suitable for a ${session.targetRole} applicant.
      It should be something they can speak about for one minute (e.g., "The future of AI in coding", "How to manage technical debt", "Why remote work succeeds").
      Return a JSON object:
      {
        "topic": "Topic text"
      }
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const parsed = JSON.parse(response.response.text());
    
    session.communicationRound = {
      topic: parsed.topic,
      userAnswer: '',
      score: 0,
      grammarFeedback: '',
      overallFeedback: ''
    };
    
    const updatedSession = await saveSession(session);
    res.json({ topic: parsed.topic });
  } catch (error) {
    console.error('Error generating JAM topic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Communication/JAM Session: Submit
app.post('/api/session/:id/communication/submit', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userAnswer } = req.body;

    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const topic = session.communicationRound.topic;

    const gradingPrompt = `
      Evaluate the candidate's communication in a JAM (Just A Minute) session.
      Topic: "${topic}"
      Candidate's Response (transcribed audio speech):
      "${userAnswer}"
      
      Score the communication out of 100 based on structure, vocabulary, grammatical correctness, confidence/flow, and relevance.
      
      You MUST perform a deep analysis of the vocabulary and grammar used in their speech:
      1. Detected Grammar: Identify tenses, subject-verb agreements, sentence structure, run-on phrases, and compile a count of any filler words used (like 'um', 'like', 'uh', 'you know').
      2. Detected Vocabulary: Evaluate the richness and sophistication of the vocabulary choice. List positive terms used, and note areas where terminology could be enhanced.
      
      Provide your analysis in the grammarFeedback field structured exactly as:
      ### Detected Grammar & filler words:
      • [List grammar feedback and filler counts]
      
      ### Detected Vocabulary & Sophistication:
      • [List vocabulary analysis and enrichment advice]
      
      Return a JSON object:
      {
        "score": 75,
        "grammarFeedback": "### Detected Grammar & filler words:\\n• You used the filler word 'like' 3 times.\\n• Sentence structure is good, tenses are correct.\\n\\n### Detected Vocabulary & Sophistication:\\n• Sophisticated use of technical terminology.\\n• Rich phrasing throughout, though more transitions could be added.",
        "overallFeedback": "Very confident tone and well structured. Make sure to define your main point in the first 10 seconds."
      }
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: gradingPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = JSON.parse(response.response.text());

    session.communicationRound.userAnswer = userAnswer;
    session.communicationRound.score = result.score || 0;
    session.communicationRound.grammarFeedback = result.grammarFeedback || '';
    session.communicationRound.overallFeedback = result.overallFeedback || '';
    session.status = 'communication_done';

    const updatedSession = await saveSession(session);
    res.json(updatedSession);
  } catch (error) {
    console.error('Error grading communication/JAM session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate Final AI Career Recommendation & Job Fit Report
app.post('/api/session/:id/report/generate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Aggregate scores
    const techScore = session.technicalRound.score || 0;
    const codingScore = session.codingRound.score || 0;
    const hrScore = session.hrRound.score || 0;
    const commScore = session.communicationRound.score || 0;

    // Call Gemini to do a full comprehensive analysis
    const analysisPrompt = `
      You are an AI Senior Career Coach and Hiring Expert.
      Analyze the candidate's interview session details to generate a comprehensive Career Recommendation & Job Fit Analysis.
      
      Candidate Profile:
      - Name: ${session.candidateName}
      - Target Role: ${session.targetRole}
      - Target Company: ${session.targetCompany}
      - Job Description provided: ${session.jobDescription || 'None'}
      - Parsed Resume Skills: ${JSON.stringify(session.resumeParsedData.skills)}
      - Experience Summary: ${JSON.stringify(session.resumeParsedData.experience)}
      - Projects Summary: ${JSON.stringify(session.resumeParsedData.projects)}
      
      Interview Evaluation:
      - Technical Interview Score: ${techScore}%
        Details: ${JSON.stringify(session.technicalRound.questions)}
      - Coding Round Score: ${codingScore}%
        Details: ${JSON.stringify(session.codingRound.challenges)}
      - HR Interview Score: ${hrScore}%
        Details: ${JSON.stringify(session.hrRound.questions)}
      - Communication Round Score: ${commScore}%
        Details: Topic: "${session.communicationRound.topic}", Answer: "${session.communicationRound.userAnswer}"
      
      Generate a Career Recommendation Report matching the following JSON structure. All scores should be integers between 0 and 100.
      The categories for hiringReadiness.category MUST be one of: "Excellent Fit", "Strong Fit", "Good Fit", "Needs Improvement", "Not Yet Ready".
      Provide highly personalized career recommendations for OTHER roles they might be suited for, specific company recommendations (from top-tier to startups, with clear matching reasons), prioritized skill gap analysis, a personalized 4-week learning roadmap tailored to their weaknesses, and a mentor summary with overall strengths, areas to improve, estimated readiness time, and advice.
      
      JSON Structure:
      {
        "jobFitScore": {
          "technical": 85,
          "communication": 78,
          "experience": 80,
          "problemSolving": 90,
          "overall": 83
        },
        "hiringReadiness": {
          "category": "Strong Fit",
          "explanation": "Detailed paragraph explaining this rating based on their high technical score but needs slight communication refinement..."
        },
        "careerRecommendations": [
          { "role": "Backend Developer", "reason": "Due to strong DSA concepts and database optimization skills." },
          { "role": "DevOps Engineer", "reason": "Given your understanding of system architectures and scripting skills." }
        ],
        "companyRecommendations": [
          { "company": "Google", "reason": "Strong data structure scores match their high-bar engineering requirements." },
          { "company": "Zoho", "reason": "Solid full-stack project building matches their developer profile." }
        ],
        "skillGap": [
          { "skill": "Learn System Design", "priority": "High", "expectedImpact": "Crucial for scaling systems and moving to mid/senior levels." },
          { "skill": "Practice Dynamic Programming", "priority": "Medium", "expectedImpact": "Increases problem-solving speed in coding rounds." }
        ],
        "learningRoadmap": [
          { "week": "Week 1", "topics": ["Arrays and Strings", "Resume Improvements"], "description": "Strengthen coding basics and refine your projects section." },
          { "week": "Week 2", "topics": ["Trees and Graphs", "Mock Interviews"], "description": "Master tree traversal algorithms and run mock interviews." },
          { "week": "Week 3", "topics": ["System Design Basics", "Communication Practice"], "description": "Study load balancers, caching, and work on filler words." },
          { "week": "Week 4", "topics": ["Company-Specific Prep", "HR Preparation"], "description": "Go through past coding questions and refine HR answers." }
        ],
        "mentorSummary": {
          "strengths": "Highlights of key strengths found in resume and interview rounds.",
          "areasToImprove": "Key weaknesses that dragged down the scores.",
          "confidenceLevel": "High", 
          "interviewReadiness": "2-4 Weeks",
          "careerAdvice": "Detailed, encouraging general advice.",
          "nextSteps": "Actionable immediate steps."
        }
      }
    `;

    const response = await model.generateContent({
      contents: [{ parts: [{ text: analysisPrompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const report = JSON.parse(response.response.text());

    // Calculate overall score
    const totalScore = Math.round((techScore + codingScore + hrScore + commScore) / 4);
    session.overallScore = totalScore;
    session.report = report;
    session.status = 'completed';

    const updatedSession = await saveSession(session);
    res.json(updatedSession);
  } catch (error) {
    console.error('Error generating career recommendation report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch Single Session
app.get('/api/session/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const session = await findSessionById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List All Sessions for the Logged In User
app.get('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await getAllSessions(req.user.id);
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear all session history for the logged-in user
app.delete('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!isMongoConnected) {
      const updatedSessions = {};
      Object.keys(mockDb.sessions).forEach(id => {
        if (mockDb.sessions[id].userId !== userId) {
          updatedSessions[id] = mockDb.sessions[id];
        }
      });
      mockDb.sessions = updatedSessions;
      persistFallbackDb();
    } else {
      await Session.deleteMany({ userId });
    }
    res.json({ message: 'Session history cleared successfully' });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
