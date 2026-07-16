const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  candidateName: { type: String, required: true },
  userId: { type: String, default: null },
  targetRole: { type: String, required: true },
  targetCompany: { type: String, default: 'Any Company' },
  jobDescription: { type: String, default: '' },
  resumeUrl: { type: String, default: '' },
  resumeParsedData: {
    skills: [String],
    experience: [String],
    projects: [String],
    education: [String],
    certifications: [String]
  },
  technicalRound: {
    questions: [{
      question: String,
      userAnswer: String,
      score: Number,
      feedback: String
    }],
    score: { type: Number, default: 0 }
  },
  codingRound: {
    challenges: [{
      title: String,
      description: String,
      expectedSolution: String,
      userCode: String,
      score: Number,
      feedback: String
    }],
    score: { type: Number, default: 0 }
  },
  hrRound: {
    questions: [{
      question: String,
      userAnswer: String,
      score: Number,
      feedback: String
    }],
    score: { type: Number, default: 0 }
  },
  communicationRound: {
    topic: String,
    userAnswer: String,
    score: { type: Number, default: 0 },
    grammarFeedback: String,
    overallFeedback: String
  },
  overallScore: { type: Number, default: 0 },
  report: {
    jobFitScore: {
      technical: Number,
      communication: Number,
      experience: Number,
      problemSolving: Number,
      overall: Number
    },
    hiringReadiness: {
      category: String,
      explanation: String
    },
    careerRecommendations: [{
      role: String,
      reason: String
    }],
    companyRecommendations: [{
      company: String,
      reason: String
    }],
    skillGap: [{
      skill: String,
      priority: String, // High, Medium, Low
      expectedImpact: String
    }],
    learningRoadmap: [{
      week: String,
      topics: [String],
      description: String
    }],
    mentorSummary: {
      strengths: String,
      areasToImprove: String,
      confidenceLevel: String, // High, Medium, Low
      interviewReadiness: String, // e.g., "Ready", "2 Weeks", etc.
      careerAdvice: String,
      nextSteps: String
    }
  },
  status: { 
    type: String, 
    enum: ['created', 'resume_parsed', 'technical_done', 'coding_done', 'hr_done', 'communication_done', 'completed'],
    default: 'created' 
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Session', SessionSchema);
