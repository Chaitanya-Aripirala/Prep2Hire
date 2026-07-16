// API Configuration
const API_BASE_URL = 'http://localhost:5000';

// Auth State Variables
let token = localStorage.getItem('token') || null;
let currentUser = null;

// Frontend State Variables
let sessionId = null;
let technicalQuestions = [];
let technicalAnswers = [];
let currentTechIndex = 0;

let codingChallenge = null;

let hrQuestions = [];
let hrAnswers = [];
let currentHrIndex = 0;

let jamTopic = '';
let jamTimerInterval = null;
let jamSecondsLeft = 60;
let jamTimerRunning = false;

// DOM Elements
const views = {
  landing: document.getElementById('view-landing'),
  setup: document.getElementById('view-setup'),
  loading: document.getElementById('view-loading-state'),
  questionsPreview: document.getElementById('view-questions-preview'),
  technical: document.getElementById('view-technical'),
  coding: document.getElementById('view-coding'),
  hr: document.getElementById('view-hr'),
  communication: document.getElementById('view-communication'),
  report: document.getElementById('view-report')
};

// Theme elements
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const body = document.body;

// Setup elements
const startNewAssessmentBtn = document.getElementById('start-new-assessment-btn');
const viewHistoryBtn = document.getElementById('view-history-btn');
const setupBackBtn = document.getElementById('setup-back-btn');
const assessmentSetupForm = document.getElementById('assessment-setup-form');
const dropZone = document.getElementById('drop-zone');
const resumeFileInput = document.getElementById('resumeFile');
const fileInfo = document.getElementById('file-info');
const setupSubmitBtn = document.getElementById('setup-submit-btn');

// Loading state elements
const loadingTitle = document.getElementById('loading-title');
const loadingText = document.getElementById('loading-text');
const loadingProgressBar = document.getElementById('loading-progress-bar');

// Technical elements
const techQuestionTitle = document.getElementById('tech-question-title');
const techAnswerInput = document.getElementById('tech-answer-input');
const techQuestionCounter = document.getElementById('tech-question-counter');
const techNextBtn = document.getElementById('tech-next-btn');

// Coding elements
const codingTitle = document.getElementById('coding-title');
const codingDescription = document.getElementById('coding-description');
const codingEditor = document.getElementById('coding-editor');
const codingResetBtn = document.getElementById('coding-reset-btn');
const codingSkipBtn = document.getElementById('coding-skip-btn');
const codingSubmitBtn = document.getElementById('coding-submit-btn');

// HR elements
const hrQuestionTitle = document.getElementById('hr-question-title');
const hrAnswerInput = document.getElementById('hr-answer-input');
const hrQuestionCounter = document.getElementById('hr-question-counter');
const hrNextBtn = document.getElementById('hr-next-btn');

// Communication elements
const jamTopicTitle = document.getElementById('jam-topic-title');
const jamTimer = document.getElementById('jam-timer');
const jamAnswerInput = document.getElementById('jam-answer-input');
const jamStartTimerBtn = document.getElementById('jam-start-timer-btn');
const jamSubmitBtn = document.getElementById('jam-submit-btn');

// Report elements
const reportBackHomeBtn = document.getElementById('report-back-home-btn');
const downloadPdfBtn = document.getElementById('download-pdf-btn');

// Logo navigation
const headerLogoBtn = document.getElementById('header-logo-btn');

// Modals elements
const loginModal = document.getElementById('login-modal');
const signupModal = document.getElementById('signup-modal');

const headerLoginBtn = document.getElementById('header-login-btn');
const headerSignupBtn = document.getElementById('header-signup-btn');
const headerLogoutBtn = document.getElementById('header-logout-btn');

const loginCloseBtn = document.getElementById('login-close-btn');
const signupCloseBtn = document.getElementById('signup-close-btn');

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

const loginErrorMsg = document.getElementById('login-error-msg');
const signupErrorMsg = document.getElementById('signup-error-msg');

const switchToSignup = document.getElementById('switch-to-signup');
const switchToLogin = document.getElementById('switch-to-login');

// -------------------------------------------------------------
// EVENT LISTENERS & INITS
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadPastAssessments();
  setupTheme();
  setupDragAndDrop();
  setupAuthEvents();
});

// View Navigation Helper
function showView(viewName) {
  Object.keys(views).forEach(key => {
    if (key === viewName) {
      views[key].classList.add('active');
    } else {
      views[key].classList.remove('active');
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Logo clicks go home
headerLogoBtn.addEventListener('click', () => {
  clearInterval(jamTimerInterval);
  if (typeof stopRecording === 'function') stopRecording();
  showView('landing');
  loadPastAssessments();
});

// View History Button
viewHistoryBtn.addEventListener('click', () => {
  showView('landing');
  loadPastAssessments();
});

// Start Assessment Click
startNewAssessmentBtn.addEventListener('click', () => {
  if (!token) {
    openModal('login');
    return;
  }
  assessmentSetupForm.reset();
  fileInfo.textContent = '';
  showView('setup');
});

// Setup Back Button
setupBackBtn.addEventListener('click', () => {
  showView('landing');
});

// Reset Coding Editor
codingResetBtn.addEventListener('click', () => {
  codingEditor.value = `// Implement your solution here\n\nfunction solve() {\n  // Code goes here\n}`;
});

// -------------------------------------------------------------
// AUTHENTICATION MANAGEMENT
// -------------------------------------------------------------

function checkAuth() {
  token = localStorage.getItem('token') || null;
  const userJson = localStorage.getItem('user');
  currentUser = userJson ? JSON.parse(userJson) : null;

  const loggedOutGroup = document.getElementById('auth-logged-out');
  const loggedInGroup = document.getElementById('auth-logged-in');
  const userDisplay = document.getElementById('user-display-name');

  if (token && currentUser) {
    loggedOutGroup.style.display = 'none';
    loggedInGroup.style.display = 'flex';
    userDisplay.textContent = currentUser.name;
  } else {
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    loggedOutGroup.style.display = 'flex';
    loggedInGroup.style.display = 'none';
  }
}

// Intercepts all requests to inject Authorization header
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const res = await fetch(url, options);
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      checkAuth();
      showView('landing');
      loadPastAssessments();
      openModal('login');
      throw new Error('Authentication expired. Please log in.');
    }
    return res;
  } catch (err) {
    console.error('Fetch error:', err);
    throw err;
  }
}

function openModal(modalName) {
  if (modalName === 'login') {
    loginErrorMsg.textContent = '';
    loginForm.reset();
    loginModal.classList.add('active');
    signupModal.classList.remove('active');
  } else if (modalName === 'signup') {
    signupErrorMsg.textContent = '';
    signupForm.reset();
    signupModal.classList.add('active');
    loginModal.classList.remove('active');
  }
}

function closeModal() {
  loginModal.classList.remove('active');
  signupModal.classList.remove('active');
}

function setupAuthEvents() {
  headerLoginBtn.addEventListener('click', () => openModal('login'));
  headerSignupBtn.addEventListener('click', () => openModal('signup'));
  
  loginCloseBtn.addEventListener('click', closeModal);
  signupCloseBtn.addEventListener('click', closeModal);
  
  switchToSignup.addEventListener('click', () => openModal('signup'));
  switchToLogin.addEventListener('click', () => openModal('login'));

  // Close modals on overlay click
  window.addEventListener('click', (e) => {
    if (e.target === loginModal || e.target === signupModal) {
      closeModal();
    }
  });

  headerLogoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    checkAuth();
    showView('landing');
    loadPastAssessments();
  });

  // Login Form Submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.textContent = '';
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      checkAuth();
      closeModal();
      loadPastAssessments();
    } catch (err) {
      loginErrorMsg.textContent = err.message;
    }
  });

  // Signup Form Submission
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupErrorMsg.textContent = '';
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      checkAuth();
      closeModal();
      loadPastAssessments();
    } catch (err) {
      signupErrorMsg.textContent = err.message;
    }
  });
}

// -------------------------------------------------------------
// THEME MANAGEMENT (Light / Dark Mode)
// -------------------------------------------------------------
function setupTheme() {
  const currentTheme = localStorage.getItem('theme') || 'dark';
  if (currentTheme === 'light') {
    body.classList.remove('dark-theme');
    body.classList.add('light-theme');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
  } else {
    body.classList.remove('light-theme');
    body.classList.add('dark-theme');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
  }
}

themeToggleBtn.addEventListener('click', () => {
  if (body.classList.contains('dark-theme')) {
    body.classList.remove('dark-theme');
    body.classList.add('light-theme');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem('theme', 'light');
  } else {
    body.classList.remove('light-theme');
    body.classList.add('dark-theme');
    themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    localStorage.setItem('theme', 'dark');
  }
});

// -------------------------------------------------------------
// DRAG AND DROP FILE HANDLER
// -------------------------------------------------------------
function setupDragAndDrop() {
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
      resumeFileInput.files = files;
      updateFileInfo(files[0]);
    }
  });

  resumeFileInput.addEventListener('change', (e) => {
    if (resumeFileInput.files.length) {
      updateFileInfo(resumeFileInput.files[0]);
    }
  });
}

function updateFileInfo(file) {
  if (file.type !== 'application/pdf') {
    fileInfo.textContent = 'Only PDF resume files are accepted.';
    fileInfo.style.color = 'var(--danger-color)';
    resumeFileInput.value = '';
    return;
  }
  fileInfo.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  fileInfo.style.color = 'var(--success-color)';
}

// -------------------------------------------------------------
// BACKEND API CALLS & SESSION STATS
// -------------------------------------------------------------

// Load Past Assessment Lists
async function loadPastAssessments() {
  const grid = document.getElementById('past-reports-grid');
  
  if (!token) {
    grid.innerHTML = `
      <div class="loading-placeholder">
        <i class="fa-solid fa-lock" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--primary-color);"></i>
        <p>Please log in or sign up to view and track your mock interview history.</p>
      </div>
    `;
    return;
  }

  const clearBtn = document.getElementById('clear-history-btn');
  if (clearBtn) clearBtn.style.display = 'none';

  try {
    const res = await authFetch(`${API_BASE_URL}/api/sessions`);
    if (!res.ok) throw new Error('Failed to fetch histories');
    const sessions = await res.json();
    
    if (sessions.length === 0) {
      grid.innerHTML = `
        <div class="loading-placeholder">
          <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 1rem;"></i>
          <p>No previous career assessments found. Start one to see it here!</p>
        </div>
      `;
      return;
    }

    if (clearBtn) clearBtn.style.display = 'inline-block';

    grid.innerHTML = sessions.map(s => {
      const dateStr = new Date(s.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const scoreText = s.status === 'completed' ? `${s.overallScore}% Fit` : 'Incomplete';
      return `
        <div class="card glass-card report-history-card" onclick="viewSessionReport('${s._id}')">
          <div class="history-card-header">
            <div>
              <h4 class="history-role">${s.targetRole}</h4>
              <p class="history-company"><i class="fa-solid fa-building"></i> ${s.targetCompany}</p>
            </div>
            <span class="history-score-badge">${scoreText}</span>
          </div>
          <div class="history-meta">
            <span><i class="fa-solid fa-user"></i> ${s.candidateName}</span>
            <span><i class="fa-solid fa-calendar"></i> ${dateStr}</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading history:', error);
    grid.innerHTML = `
      <div class="loading-placeholder" style="color: var(--danger-color)">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Could not connect to database server. Please check your Node environment running status.</p>
      </div>
    `;
  }
}

// Open Past Session Report Directly
async function viewSessionReport(id) {
  sessionId = id;
  showView('loading');
  updateProgressLoading('Generating Dashboard', 'Retrieving career fit metrics from MongoDB...', 75);
  
  try {
    const res = await authFetch(`${API_BASE_URL}/api/session/${id}`);
    const session = await res.json();
    if (session.status === 'completed') {
      renderReport(session);
      showView('report');
    } else {
      // Resume from last state if incomplete
      resumeAssessmentFlow(session);
    }
  } catch (error) {
    console.error('Error opening report:', error);
    showView('landing');
    alert('Failed to load session details.');
  }
}

// Resume assessment flow from last checkpoint
function resumeAssessmentFlow(session) {
  sessionId = session._id;
  if (session.status === 'created' || session.status === 'resume_parsed') {
    startTechnicalInterview();
  } else if (session.status === 'technical_done') {
    startCodingRound();
  } else if (session.status === 'coding_done') {
    startHrRound();
  } else if (session.status === 'hr_done') {
    startCommunicationRound();
  } else if (session.status === 'communication_done') {
    generateFinalReport();
  }
}

// -------------------------------------------------------------
// ASSESSMENT WORKFLOW FLOW STEPS
// -------------------------------------------------------------

// Submit Profile Setup
assessmentSetupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const candidateName = document.getElementById('candidateName').value;
  const targetRole = document.getElementById('targetRole').value;
  const targetCompany = document.getElementById('targetCompany').value;
  const jobDescription = document.getElementById('jobDescription').value;
  
  const file = resumeFileInput.files[0];
  if (!file) {
    alert('Please upload your resume PDF');
    return;
  }

  showView('loading');
  updateProgressLoading('Scanning Profile', 'Initializing candidate assessment session in database...', 10);

  try {
    // 1. Start Session
    const startRes = await authFetch(`${API_BASE_URL}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateName, targetRole, targetCompany, jobDescription })
    });
    
    if (!startRes.ok) throw new Error('Failed to create session');
    const session = await startRes.json();
    sessionId = session._id;

    // 2. Upload and Parse Resume
    updateProgressLoading('Extracting Skills & Experience', 'Sending PDF to Gemini for deep intelligence extraction...', 35);
    
    const formData = new FormData();
    formData.append('resume', file);
    
    const resumeRes = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/resume`, {
      method: 'POST',
      body: formData
    });
    
    if (!resumeRes.ok) throw new Error('Failed to parse resume');
    
    // 3. Generate Study Guide / Preview Questions
    updateProgressLoading('Generating Study Guide', 'Creating custom practice questions for all rounds...', 75);
    
    const previewRes = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/preview-questions`, {
      method: 'POST'
    });
    
    if (!previewRes.ok) throw new Error('Failed to generate preview questions');
    const previewData = await previewRes.json();
    
    // Populate Preview Questions UI
    populateQuestionsPreview(previewData);
    
    // Transition to preview screen
    showView('questionsPreview');

  } catch (error) {
    console.error('Setup error:', error);
    showView('setup');
    alert('Error setting up interview: ' + error.message);
  }
});

// Populate Preview Questions UI
function populateQuestionsPreview(data) {
  // 1. Technical Questions
  const techDiv = document.getElementById('preview-tech-questions');
  techDiv.innerHTML = `<ol>${data.technicalQuestions.map(q => `<li>${q}</li>`).join('')}</ol>`;
  
  // 2. Coding Challenge
  const codingDiv = document.getElementById('preview-coding-questions');
  codingDiv.innerHTML = `
    <p><strong>${data.codingChallenge.title}</strong></p>
    <p>${data.codingChallenge.description}</p>
    <pre class="mt-2" style="background: rgba(0,0,0,0.25); padding: 12px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 0.875rem; max-height: 200px;"><code>${data.codingChallenge.expectedSolution}</code></pre>
  `;
  
  // 3. HR Questions
  const hrDiv = document.getElementById('preview-hr-questions');
  hrDiv.innerHTML = `<ol>${data.hrQuestions.map(q => `<li>${q}</li>`).join('')}</ol>`;
  
  // 4. JAM Session Topic
  const jamDiv = document.getElementById('preview-jam-questions');
  jamDiv.innerHTML = `<ul><li><strong>Topic:</strong> ${data.jamTopic}</li></ul>`;
}

// Add event listeners for Questions Preview buttons
document.getElementById('preview-start-quiz-btn').addEventListener('click', () => {
  startTechnicalInterview();
});

document.getElementById('preview-skip-btn').addEventListener('click', () => {
  generateFinalReport();
});

// Clear History button listener
document.getElementById('clear-history-btn').addEventListener('click', async () => {
  if (confirm('Are you sure you want to permanently clear all past assessments? This cannot be undone.')) {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/sessions`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to clear history');
      alert('Your assessment history has been cleared.');
      loadPastAssessments();
    } catch (error) {
      console.error(error);
      alert('Error clearing history: ' + error.message);
    }
  }
});

// Update progress bar helper
function updateProgressLoading(title, text, percentage) {
  loadingTitle.textContent = title;
  loadingText.textContent = text;
  loadingProgressBar.style.width = `${percentage}%`;
}

// -------------------------------------------------------------
// TECHNICAL ROUND FLOW
// -------------------------------------------------------------
async function startTechnicalInterview() {
  showView('loading');
  updateProgressLoading('Initiating Technical Round', 'Downloading customized questions...', 85);
  
  try {
    const res = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/technical/generate`, { method: 'POST' });
    if (!res.ok) throw new Error('Questions generation failed');
    technicalQuestions = await res.json();
    
    currentTechIndex = 0;
    technicalAnswers = [];
    showTechQuestion();
    showView('technical');
  } catch (err) {
    console.error(err);
    alert('Error setting up technical round: ' + err.message);
    showView('setup');
  }
}

function showTechQuestion() {
  const currentQ = technicalQuestions[currentTechIndex];
  techQuestionTitle.textContent = currentQ.question;
  techAnswerInput.value = '';
  techQuestionCounter.textContent = `Question ${currentTechIndex + 1} of ${technicalQuestions.length}`;
  
  if (currentTechIndex === technicalQuestions.length - 1) {
    techNextBtn.innerHTML = 'Submit Technical Round <i class="fa-solid fa-paper-plane"></i>';
  } else {
    techNextBtn.innerHTML = 'Next Question <i class="fa-solid fa-arrow-right"></i>';
  }
}

techNextBtn.addEventListener('click', async () => {
  const answer = techAnswerInput.value.trim();
  if (!answer) {
    alert('Please enter an answer before proceeding.');
    return;
  }

  // Save current answer
  technicalAnswers.push({
    question: technicalQuestions[currentTechIndex].question,
    userAnswer: answer
  });

  if (currentTechIndex < technicalQuestions.length - 1) {
    currentTechIndex++;
    showTechQuestion();
  } else {
    // End of round. Submit.
    showView('loading');
    updateProgressLoading('Evaluating Technical Answers', 'AI is scoring your responses & giving feedback...', 45);
    
    try {
      const submitRes = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/technical/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: technicalAnswers })
      });
      
      if (!submitRes.ok) throw new Error('Answer submission failed');
      
      // Proceed to Coding Round
      startCodingRound();
    } catch (err) {
      console.error(err);
      alert('Error submitting answers: ' + err.message);
      showView('technical');
    }
  }
});

// -------------------------------------------------------------
// CODING ROUND FLOW
// -------------------------------------------------------------
async function startCodingRound() {
  showView('loading');
  updateProgressLoading('Customizing Coding Challenge', 'Generating problem matched to your career path...', 60);

  try {
    const res = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/coding/generate`, { method: 'POST' });
    if (!res.ok) throw new Error('Coding generation failed');
    codingChallenge = await res.json();

    // Set challenge info
    codingTitle.textContent = codingChallenge.title;
    codingDescription.innerHTML = renderMarkdown(codingChallenge.description);
    
    // Set Editor
    codingEditor.value = `// Implement your solution here\n\nfunction solve() {\n  // Code goes here\n}`;
    showView('coding');
  } catch (err) {
    console.error(err);
    alert('Error setting up coding round: ' + err.message);
    startHrRound();
  }
}

codingSubmitBtn.addEventListener('click', async () => {
  const code = codingEditor.value.trim();
  submitCodingRound(code);
});

codingSkipBtn.addEventListener('click', () => {
  submitCodingRound('// Candidate skipped coding round');
});

async function submitCodingRound(code) {
  showView('loading');
  updateProgressLoading('Evaluating Code', 'Checking syntax, big-O complexity, and accuracy...', 75);

  try {
    const res = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/coding/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode: code })
    });
    
    if (!res.ok) throw new Error('Coding evaluation failed');
    
    startHrRound();
  } catch (err) {
    console.error(err);
    alert('Error submitting coding solution: ' + err.message);
    startHrRound();
  }
}

// -------------------------------------------------------------
// HR INTERVIEW ROUND FLOW
// -------------------------------------------------------------
async function startHrRound() {
  showView('loading');
  updateProgressLoading('Creating Behavioral Interview', 'Formulating questions for team collaboration & culture match...', 80);

  try {
    const res = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/hr/generate`, { method: 'POST' });
    if (!res.ok) throw new Error('HR generation failed');
    hrQuestions = await res.json();
    
    currentHrIndex = 0;
    hrAnswers = [];
    showHrQuestion();
    showView('hr');
  } catch (err) {
    console.error(err);
    alert('Error setting up HR round: ' + err.message);
    startCommunicationRound();
  }
}

function showHrQuestion() {
  const currentQ = hrQuestions[currentHrIndex];
  hrQuestionTitle.textContent = currentQ.question;
  hrAnswerInput.value = '';
  hrQuestionCounter.textContent = `Question ${currentHrIndex + 1} of ${hrQuestions.length}`;
  
  if (currentHrIndex === hrQuestions.length - 1) {
    hrNextBtn.innerHTML = 'Submit HR Round <i class="fa-solid fa-paper-plane"></i>';
  } else {
    hrNextBtn.innerHTML = 'Next Question <i class="fa-solid fa-arrow-right"></i>';
  }
}

hrNextBtn.addEventListener('click', async () => {
  const answer = hrAnswerInput.value.trim();
  if (!answer) {
    alert('Please enter an answer before proceeding.');
    return;
  }

  hrAnswers.push({
    question: hrQuestions[currentHrIndex].question,
    userAnswer: answer
  });

  if (currentHrIndex < hrQuestions.length - 1) {
    currentHrIndex++;
    showHrQuestion();
  } else {
    showView('loading');
    updateProgressLoading('Evaluating Behavioral Fit', 'AI is checking answers for leadership & collaboration...', 85);
    
    try {
      const submitRes = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/hr/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: hrAnswers })
      });
      
      if (!submitRes.ok) throw new Error('HR answer submission failed');
      
      startCommunicationRound();
    } catch (err) {
      console.error(err);
      alert('Error submitting HR answers: ' + err.message);
      startCommunicationRound();
    }
  }
});

// -------------------------------------------------------------
// COMMUNICATION / JAM SESSION FLOW
// -------------------------------------------------------------
async function startCommunicationRound() {
  showView('loading');
  updateProgressLoading('Preparing JAM session', 'Generating topic for impromptu speech evaluation...', 90);

  try {
    const res = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/communication/generate`, { method: 'POST' });
    if (!res.ok) throw new Error('JAM generation failed');
    const data = await res.json();
    
    jamTopic = data.topic;
    jamTopicTitle.textContent = jamTopic;
    
    jamAnswerInput.value = '';
    jamSecondsLeft = 60;
    jamTimer.textContent = jamSecondsLeft;
    jamStartTimerBtn.style.display = 'inline-flex';
    clearInterval(jamTimerInterval);
    jamTimerRunning = false;
    
    showView('communication');
  } catch (err) {
    console.error(err);
    alert('Error setting up communication round: ' + err.message);
    generateFinalReport();
  }
}

// Speech Recognition Global State & Helpers
let recognition = null;
let isRecording = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }
    
    if (finalTranscript) {
      jamAnswerInput.value += finalTranscript;
    }
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    const statusEl = document.getElementById('mic-status');
    if (statusEl) statusEl.textContent = 'Error: ' + event.error;
    stopRecording();
  };
  
  recognition.onend = () => {
    if (isRecording && recognition) {
      try {
        recognition.start();
      } catch (err) {
        console.error('Failed to restart recognition:', err);
      }
    }
  };
}

function startRecording() {
  if (!recognition) {
    alert('Speech recognition is not supported in this browser. Please use Google Chrome or Edge.');
    return;
  }
  isRecording = true;
  try {
    recognition.start();
  } catch (err) {
    console.error(err);
  }
  const micBtn = document.getElementById('jam-mic-btn');
  if (micBtn) {
    micBtn.classList.add('mic-recording');
    micBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
  }
  const statusEl = document.getElementById('mic-status');
  if (statusEl) statusEl.textContent = 'Microphone recording active. Speak clearly...';
  
  if (!jamTimerRunning) {
    startJamTimer();
  }
}

function stopRecording() {
  isRecording = false;
  if (recognition) {
    try {
      recognition.stop();
    } catch (err) {
      console.error(err);
    }
  }
  const micBtn = document.getElementById('jam-mic-btn');
  if (micBtn) {
    micBtn.classList.remove('mic-recording');
    micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  }
  const statusEl = document.getElementById('mic-status');
  if (statusEl) statusEl.textContent = 'Recording stopped.';
}

function startJamTimer() {
  if (jamTimerRunning) return;
  
  jamTimerRunning = true;
  jamStartTimerBtn.style.display = 'none';
  jamAnswerInput.focus();
  
  jamTimerInterval = setInterval(() => {
    jamSecondsLeft--;
    jamTimer.textContent = jamSecondsLeft;
    
    if (jamSecondsLeft <= 10) {
      document.getElementById('jam-timer-badge').style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
    }

    if (jamSecondsLeft <= 0) {
      clearInterval(jamTimerInterval);
      stopRecording();
      alert("Time is up! Submitting your JAM response.");
      submitCommunicationRound();
    }
  }, 1000);
}

jamStartTimerBtn.addEventListener('click', () => {
  startJamTimer();
});

document.getElementById('jam-mic-btn').addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

jamSubmitBtn.addEventListener('click', () => {
  clearInterval(jamTimerInterval);
  stopRecording();
  submitCommunicationRound();
});

async function submitCommunicationRound() {
  stopRecording();
  const answer = jamAnswerInput.value.trim();
  if (!answer) {
    alert('Please enter a response for the JAM topic.');
    return;
  }

  showView('loading');
  updateProgressLoading('Analyzing Vocabulary & Grammar', 'Scoring structure, confidence, and grammatical patterns...', 95);

  try {
    const res = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/communication/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAnswer: answer })
    });
    
    if (!res.ok) throw new Error('JAM submission failed');
    
    generateFinalReport();
  } catch (err) {
    console.error(err);
    alert('Error submitting JAM session: ' + err.message);
    generateFinalReport();
  }
}

// -------------------------------------------------------------
// REPORT GENERATION & RENDERING
// -------------------------------------------------------------
async function generateFinalReport() {
  showView('loading');
  updateProgressLoading('Generating Career Fit Report', 'Synthesizing scores, skill gaps, learning roadmap & mentoring advice...', 98);

  try {
    const res = await authFetch(`${API_BASE_URL}/api/session/${sessionId}/report/generate`, { method: 'POST' });
    if (!res.ok) throw new Error('Report generation failed');
    const session = await res.json();
    
    renderReport(session);
    showView('report');
  } catch (err) {
    console.error(err);
    alert('Error generating report: ' + err.message);
    showView('landing');
  }
}

// Render Report onto the Dashboard UI
function renderReport(session) {
  const rep = session.report;
  
  // Set meta details
  document.getElementById('rep-candidate-name').textContent = session.candidateName;
  document.getElementById('rep-target-role').textContent = session.targetRole;
  document.getElementById('rep-target-company').textContent = session.targetCompany;
  document.getElementById('rep-date').textContent = new Date(session.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // 1. Overall Score Ring animation
  const overall = rep.jobFitScore.overall;
  document.getElementById('rep-overall-score').textContent = `${overall}%`;
  
  const ring = document.getElementById('rep-overall-ring');
  const radius = ring.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  ring.style.strokeDasharray = `${circumference} ${circumference}`;
  const offset = circumference - (overall / 100) * circumference;
  ring.style.strokeDashoffset = offset;

  // Set ring color gradient base based on score
  if (overall >= 85) {
    ring.style.stroke = 'var(--success-color)';
  } else if (overall >= 70) {
    ring.style.stroke = 'var(--primary-color)';
  } else if (overall >= 50) {
    ring.style.stroke = 'var(--warning-color)';
  } else {
    ring.style.stroke = 'var(--danger-color)';
  }

  // 2. Competency sub-scores progress bars
  const tech = rep.jobFitScore.technical;
  document.getElementById('rep-tech-val').textContent = `${tech}%`;
  document.getElementById('rep-tech-bar').style.width = `${tech}%`;

  const comm = rep.jobFitScore.communication;
  document.getElementById('rep-comm-val').textContent = `${comm}%`;
  document.getElementById('rep-comm-bar').style.width = `${comm}%`;

  const exp = rep.jobFitScore.experience;
  document.getElementById('rep-exp-val').textContent = `${exp}%`;
  document.getElementById('rep-exp-bar').style.width = `${exp}%`;

  const prob = rep.jobFitScore.problemSolving;
  document.getElementById('rep-prob-val').textContent = `${prob}%`;
  document.getElementById('rep-prob-bar').style.width = `${prob}%`;

  // 3. Hiring Readiness category
  const readinessBadge = document.getElementById('rep-readiness-badge');
  const readinessExplanation = document.getElementById('rep-readiness-explanation');
  const readiness = rep.hiringReadiness.category;
  
  readinessBadge.textContent = readiness;
  readinessExplanation.textContent = rep.hiringReadiness.explanation;

  // Set badge color class
  readinessBadge.className = 'readiness-badge'; // reset
  if (readiness === 'Excellent Fit') readinessBadge.classList.add('badge-excellent');
  else if (readiness === 'Strong Fit') readinessBadge.classList.add('badge-strong');
  else if (readiness === 'Good Fit') readinessBadge.classList.add('badge-good');
  else if (readiness === 'Needs Improvement') readinessBadge.classList.add('badge-needs-improvement');
  else readinessBadge.classList.add('badge-not-ready');

  // 4. Score Cards Details
  // ATS Resume list
  const atsList = document.getElementById('rep-resume-summary-list');
  const skillsList = session.resumeParsedData.skills || [];
  const projectsList = session.resumeParsedData.projects || [];
  
  document.getElementById('rep-ats-score').textContent = `Resume Scan: ${skillsList.length > 5 ? 85 : 60}/100`;
  
  let listHtml = '';
  if (skillsList.length > 0) {
    listHtml += `<li><strong>Detected Skills:</strong> ${skillsList.slice(0, 10).join(', ')}${skillsList.length > 10 ? '...' : ''}</li>`;
  }
  if (projectsList.length > 0) {
    listHtml += `<li><strong>Key Project Matches:</strong> ${projectsList.slice(0, 2).join('. ')}</li>`;
  }
  if (session.resumeParsedData.experience && session.resumeParsedData.experience.length > 0) {
    listHtml += `<li><strong>Work History:</strong> ${session.resumeParsedData.experience[0]}</li>`;
  }
  if (listHtml === '') {
    listHtml = '<li>No resume parsed data could be compiled.</li>';
  }
  atsList.innerHTML = listHtml;

  // Coding Round details
  const codingChallengeScore = session.codingRound.score;
  const codingCh = session.codingRound.challenges[0];
  document.getElementById('rep-coding-score').textContent = `${codingChallengeScore}/100`;
  document.getElementById('rep-coding-feedback').textContent = codingCh ? codingCh.feedback : 'Skipped or not evaluated.';

  // Communication Details
  document.getElementById('rep-communication-score').textContent = `${session.communicationRound.score}/100`;
  document.getElementById('rep-comm-grammar').innerHTML = formatBulletPoints(session.communicationRound.grammarFeedback);
  document.getElementById('rep-comm-overall').textContent = session.communicationRound.overallFeedback;

  // HR Details
  document.getElementById('rep-hr-score').textContent = `${session.hrRound.score}/100`;
  const hrFeedbacks = session.hrRound.questions.map(q => q.feedback).join(' ');
  document.getElementById('rep-hr-feedback').textContent = hrFeedbacks || 'HR answers not found.';

  // 5. Alternate Career Recommendations
  const careerRecs = document.getElementById('rep-career-recommendations');
  if (rep.careerRecommendations && rep.careerRecommendations.length > 0) {
    careerRecs.innerHTML = rep.careerRecommendations.map(c => `
      <div class="rec-item">
        <h4 class="rec-title">${c.role}</h4>
        <p class="rec-desc">${c.reason}</p>
      </div>
    `).join('');
  } else {
    careerRecs.innerHTML = '<p class="rec-desc">No alternative recommendations generated.</p>';
  }

  // 6. Target Company Matches
  const companyRecs = document.getElementById('rep-company-recommendations');
  if (rep.companyRecommendations && rep.companyRecommendations.length > 0) {
    companyRecs.innerHTML = rep.companyRecommendations.map(c => `
      <div class="company-item">
        <h4 class="rec-title">${c.company}</h4>
        <p class="rec-desc">${c.reason}</p>
      </div>
    `).join('');
  } else {
    companyRecs.innerHTML = '<p class="rec-desc">No specific company recommendation matches.</p>';
  }

  // 7. Skill Gap Analysis
  const skillGapTable = document.getElementById('rep-skill-gap-table');
  if (rep.skillGap && rep.skillGap.length > 0) {
    skillGapTable.innerHTML = rep.skillGap.map(s => {
      const priorityClass = s.priority.toLowerCase();
      return `
        <tr>
          <td><strong>${s.skill}</strong></td>
          <td><span class="tag ${priorityClass}">${s.priority}</span></td>
          <td>${s.expectedImpact}</td>
        </tr>
      `;
    }).join('');
  } else {
    skillGapTable.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-secondary)">No major skill gaps identified. Keep it up!</td></tr>';
  }

  // 8. 4-Week Learning Roadmap
  const timeline = document.getElementById('rep-roadmap-timeline');
  if (rep.learningRoadmap && rep.learningRoadmap.length > 0) {
    timeline.innerHTML = rep.learningRoadmap.map(w => `
      <div class="timeline-card glass-card">
        <h4 class="timeline-week">${w.week}</h4>
        <p class="report-list" style="margin-bottom: 0.5rem;">
          ${w.topics.map(t => `<span class="tag bg-blue" style="margin: 0.15rem;">${t}</span>`).join('')}
        </p>
        <p class="timeline-desc">${w.description}</p>
      </div>
    `).join('');
  } else {
    timeline.innerHTML = '<div style="grid-column: 1/-1; text-align:center;">No custom roadmap generated.</div>';
  }

  // 9. AI Career Mentor Summary
  document.getElementById('rep-mentor-strengths').textContent = rep.mentorSummary.strengths;
  document.getElementById('rep-mentor-improvements').textContent = rep.mentorSummary.areasToImprove;
  document.getElementById('rep-mentor-advice').textContent = rep.mentorSummary.careerAdvice;
  
  const confidenceBadge = document.getElementById('rep-mentor-confidence');
  confidenceBadge.textContent = rep.mentorSummary.confidenceLevel;
  confidenceBadge.className = 'tag'; // reset
  if (rep.mentorSummary.confidenceLevel === 'High') confidenceBadge.classList.add('bg-green');
  else if (rep.mentorSummary.confidenceLevel === 'Medium') confidenceBadge.classList.add('bg-blue');
  else confidenceBadge.classList.add('tag', 'high');

  document.getElementById('rep-mentor-readiness').textContent = rep.mentorSummary.interviewReadiness;
  document.getElementById('rep-mentor-nextsteps').textContent = rep.mentorSummary.nextSteps;
}

// Helper to convert plain markdown to html styling
function renderMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// Convert period sentences or bullet formatting to UL bullet tags
function formatBulletPoints(text) {
  if (!text) return '';
  if (Array.isArray(text)) {
    return `<ul class="report-list">${text.map(i => `<li>${String(i).trim()}</li>`).join('')}</ul>`;
  }
  if (typeof text !== 'string') {
    text = String(text);
  }
  if (text.includes('- ') || text.includes('* ')) {
    const listItems = text.split(/[-*]/).filter(item => item.trim() !== '');
    return `<ul class="report-list">${listItems.map(i => `<li>${i.trim()}</li>`).join('')}</ul>`;
  }
  const sentences = text.split('.').filter(s => s.trim() !== '');
  return `<ul class="report-list">${sentences.map(s => `<li>${s.trim()}.</li>`).join('')}</ul>`;
}

// -------------------------------------------------------------
// PDF DOWNLOAD IMPLEMENTATION
// -------------------------------------------------------------
downloadPdfBtn.addEventListener('click', () => {
  const element = document.getElementById('report-pdf-container');
  const name = document.getElementById('rep-candidate-name').textContent || 'Candidate';
  const role = document.getElementById('rep-target-role').textContent || 'Role';
  
  const elementClone = element.cloneNode(true);
  elementClone.style.padding = '20px';
  elementClone.style.maxWidth = '100%';
  elementClone.style.backgroundColor = '#ffffff';
  elementClone.style.color = '#000000';
  
  const glassCards = elementClone.querySelectorAll('.glass-card');
  glassCards.forEach(c => {
    c.style.backgroundColor = '#ffffff';
    c.style.color = '#000000';
    c.style.borderColor = '#dddddd';
    c.style.boxShadow = 'none';
  });

  const opt = {
    margin:       [0.3, 0.3],
    filename:     `${name.replace(/\s+/g, '_')}_${role.replace(/\s+/g, '_')}_Career_Assessment.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true, 
      backgroundColor: '#ffffff'
    },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(elementClone).save();
});

// Report back to Home Dashboard button
reportBackHomeBtn.addEventListener('click', () => {
  showView('landing');
  loadPastAssessments();
});
