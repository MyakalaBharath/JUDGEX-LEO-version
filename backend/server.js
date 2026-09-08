require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

const PORT = process.env.PORT || 10000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5";
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || MODEL;

app.use(cors());
app.use(express.json({ limit: "12mb" }));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function requireAI(res) {
  if (!client) {
    res.status(503).json({
      error: "AI backend is not configured."
    });
    return false;
  }

  return true;
}

async function ai(input, model = MODEL) {
  const response = await client.responses.create({
    model,
    input
  });

  return response.output_text || "";
}

function cleanJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function projectContext(p = {}) {
  return `
PROJECT NAME: ${p.projectName || "Not provided"}
PROBLEM: ${p.problem || "Not provided"}
SOLUTION: ${p.solution || "Not provided"}
TECHNOLOGY: ${p.technology || "Not provided"}
IMPACT: ${p.impact || "Not provided"}
`;
}

/* =========================
   HEALTH
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "JUDGEX backend is running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    online: true,
    aiConfigured: !!client,
    model: MODEL,
    features: {
      chatbot: true,
      agents: true,
      vision: true,
      camera: true,
      microphone: true,
      screenShare: true,
      transcript: true
    }
  });
});

/* =========================
   AI CHATBOT
========================= */

app.post("/api/chat", async (req, res) => {
  if (!requireAI(res)) return;

  try {
    const {
      message,
      project = {},
      history = [],
      liveState = {}
    } = req.body || {};

    if (!message?.trim()) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    const prompt = `
You are JUDGEX AI.

You are an intelligent hackathon assistant, presentation coach,
technical mentor and judge.

Help the presenter with:
- project explanations
- technical questions
- judge questions
- presentation improvement
- architecture
- innovation
- feasibility
- impact
- demo preparation
- live presentation coaching

PROJECT:
${projectContext(project)}

LIVE PRESENTATION STATE:
${JSON.stringify(liveState, null, 2)}

RECENT CHAT:
${JSON.stringify(history.slice(-10), null, 2)}

USER:
${message}

Rules:
1. Do not invent facts.
2. If information is missing, say so.
3. Give practical answers.
4. Keep responses reasonably concise.
5. When useful, give numbered steps.
`;

    const reply = await ai(prompt);

    res.json({
      reply
    });

  } catch (e) {
    console.error("CHAT ERROR:", e);

    res.status(500).json({
      error: e.message || "Chat failed"
    });
  }
});

/* =========================
   NORMAL AI EVALUATION
========================= */

app.post("/api/evaluate", async (req, res) => {
  if (!requireAI(res)) return;

  try {
    const project = req.body || {};

    if (
      !project.projectName ||
      !project.problem ||
      !project.solution
    ) {
      return res.status(400).json({
        error: "projectName, problem and solution are required."
      });
    }

    const prompt = `
You are the lead JUDGEX hackathon evaluator.

Evaluate the project fairly using ONLY the supplied information.

${projectContext(project)}

Return ONLY valid JSON:

{
  "overallScore": 0,
  "verdict": "Strong",
  "scores": {
    "problem": 0,
    "innovation": 0,
    "technical": 0,
    "impact": 0,
    "feasibility": 0
  },
  "summary": "",
  "strengths": [],
  "improvements": [],
  "judgeQuestions": [],
  "risks": [],
  "nextActions": []
}

All scores must be 0-100.
`;

    const result = cleanJson(await ai(prompt));

    res.json({
      result
    });

  } catch (e) {
    console.error("EVALUATION ERROR:", e);

    res.status(500).json({
      error: e.message || "Evaluation failed"
    });
  }
});

/* =========================
   TRUE MULTI-AGENT JUDGE
========================= */

app.post("/api/agentic-evaluate", async (req, res) => {
  if (!requireAI(res)) return;

  try {
    const project = req.body || {};

    if (
      !project.projectName ||
      !project.problem ||
      !project.solution
    ) {
      return res.status(400).json({
        error: "Project name, problem and solution are required."
      });
    }

    const context = projectContext(project);

    const agents = [
      [
        "Problem & Impact Agent",
        "Judge problem clarity, users, urgency and measurable impact."
      ],
      [
        "Innovation Agent",
        "Judge originality, differentiation and innovation."
      ],
      [
        "Technical Agent",
        "Judge architecture, technology, security, reliability and scalability."
      ],
      [
        "Pitch Agent",
        "Judge storytelling, clarity, evidence and demo readiness."
      ],
      [
        "Feasibility Agent",
        "Judge implementation feasibility, cost, deployment and adoption."
      ]
    ];

    const results = await Promise.all(
      agents.map(async ([name, role]) => {

        const prompt = `
You are the ${name}.

ROLE:
${role}

PROJECT:
${context}

Return ONLY valid JSON:

{
  "agent": "${name}",
  "score": 0,
  "confidence": 0,
  "findings": [],
  "risks": [],
  "questions": [],
  "recommendations": []
}

Scores must be 0-100.
`;

        return cleanJson(await ai(prompt));
      })
    );

    const synthesisPrompt = `
You are the JUDGEX Lead Judge.

Synthesize these independent judging agents.

PROJECT:
${context}

AGENT REPORTS:
${JSON.stringify(results, null, 2)}

Return ONLY valid JSON:

{
  "overallScore": 0,
  "verdict": "Strong",
  "scores": {
    "problem": 0,
    "innovation": 0,
    "technical": 0,
    "impact": 0,
    "feasibility": 0
  },
  "confidence": 0,
  "summary": "",
  "topStrengths": [],
  "criticalGaps": [],
  "judgeQuestions": [],
  "actionPlan": [],
  "agentConsensus": ""
}

Do not invent evidence.
`;

    const finalResult = cleanJson(
      await ai(synthesisPrompt)
    );

    res.json({
      result: finalResult,
      agents: results
    });

  } catch (e) {
    console.error("AGENT ERROR:", e);

    res.status(500).json({
      error: e.message || "Agentic evaluation failed"
    });
  }
});

/* =========================
   LIVE CAMERA + SCREEN AI
========================= */

app.post("/api/live-analyze", async (req, res) => {
  if (!requireAI(res)) return;

  try {
    const {
      project = {},
      transcript = "",
      frame = null,
      screenFrame = null
    } = req.body || {};

    if (!project.projectName) {
      return res.status(400).json({
        error: "Project context is required."
      });
    }

    const content = [
      {
        type: "input_text",
        text: `
You are JUDGEX real-time presentation AI.

PROJECT:
${projectContext(project)}

LIVE TRANSCRIPT:
${transcript || "No transcript available."}

Analyze only information actually available.

Return ONLY valid JSON:

{
  "observation": "",
  "strengths": [],
  "alerts": [],
  "coaching": "",
  "scoreDelta": 0
}
`
      }
    ];

    if (frame) {
      content.push({
        type: "input_image",
        image_url: frame
      });
    }

    if (screenFrame) {
      content.push({
        type: "input_image",
        image_url: screenFrame
      });
    }

    const text = await ai(
      [
        {
          role: "user",
          content
        }
      ],
      VISION_MODEL
    );

    let result;

    try {
      result = cleanJson(text);
    } catch {
      result = {
        observation: text,
        strengths: [],
        alerts: [],
        coaching: "",
        scoreDelta: 0
      };
    }

    res.json({
      result,
      timestamp: new Date().toISOString()
    });

  } catch (e) {
    console.error("LIVE ANALYSIS ERROR:", e);

    res.status(500).json({
      error: e.message || "Live analysis failed"
    });
  }
});

/* =========================
   TRANSCRIPT AI
========================= */

app.post("/api/transcript-analyze", async (req, res) => {
  if (!requireAI(res)) return;

  try {
    const {
      project = {},
      transcript = ""
    } = req.body || {};

    if (!transcript) {
      return res.status(400).json({
        error: "Transcript is required."
      });
    }

    const prompt = `
Analyze this hackathon presentation transcript.

PROJECT:
${projectContext(project)}

TRANSCRIPT:
${transcript}

Return ONLY valid JSON:

{
  "clarity": 0,
  "confidence": 0,
  "technicalDepth": 0,
  "evidence": 0,
  "fillerRisk": 0,
  "strengths": [],
  "issues": [],
  "nextPrompt": ""
}

Scores must be 0-100.
Do not infer private traits.
`;

    const result = cleanJson(
      await ai(prompt)
    );

    res.json({
      result
    });

  } catch (e) {
    console.error("TRANSCRIPT ERROR:", e);

    res.status(500).json({
      error: e.message || "Transcript analysis
  
  
    

