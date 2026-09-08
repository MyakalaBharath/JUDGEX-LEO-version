const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "12mb" }));

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

// ---------- OpenAI helper ----------

async function askAI(instructions, input, imageData = null) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured in Render.");
  }

  const content = [
    {
      type: "input_text",
      text: input
    }
  ];

  if (imageData) {
    content.push({
      type: "input_image",
      image_url: imageData
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input: [
        {
          role: "user",
          content
        }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("OpenAI error:", data);
    throw new Error(
      data?.error?.message || `OpenAI request failed (${response.status})`
    );
  }

  return data.output_text || "";
}

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return {};
  }
}

// ---------- Basic health ----------

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "JUDGEX backend is running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    online: true,
    aiConfigured: Boolean(OPENAI_API_KEY),
    model: MODEL
  });
});

// ---------- AI Chatbot ----------

app.post("/api/chat", async (req, res) => {
  try {
    const { message, project, history = [], liveState = {} } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const prompt = `
You are JUDGEX AI, an intelligent hackathon presentation coach and judge.

Help the presenter improve their project and presentation.

PROJECT:
${JSON.stringify(project || {}, null, 2)}

RECENT PRESENTATION STATE:
${JSON.stringify(liveState || {}, null, 2)}

CHAT HISTORY:
${JSON.stringify(history.slice(-10), null, 2)}

USER MESSAGE:
${message}

Give a useful, concise answer. Do not invent project facts.
`;

    const reply = await askAI(
      "You are JUDGEX AI, a professional and supportive AI presentation coach.",
      prompt
    );

    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Transcript Analysis ----------

app.post("/api/transcript-analyze", async (req, res) => {
  try {
    const { project, transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: "Transcript is required." });
    }

    const prompt = `
Analyze this hackathon presentation transcript.

PROJECT:
${JSON.stringify(project || {}, null, 2)}

TRANSCRIPT:
${transcript}

Return ONLY valid JSON:

{
  "clarity": 0,
  "confidence": 0,
  "evidence": 0,
  "technicalDepth": 0
}

All scores must be integers from 0 to 100.
`;

    const text = await askAI(
      "You evaluate presentation communication objectively. Return valid JSON only.",
      prompt
    );

    const result = parseJSON(text);

    res.json({
      result: {
        clarity: result.clarity ?? 0,
        confidence: result.confidence ?? 0,
        evidence: result.evidence ?? 0,
        technicalDepth: result.technicalDepth ?? 0
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Live Presentation Analysis ----------

app.post("/api/live-analyze", async (req, res) => {
  try {
    const {
      project,
      transcript = "",
      frame = null,
      screenFrame = null
    } = req.body;

    if (!project?.projectName) {
      return res.status(400).json({
        error: "Project name is required."
      });
    }

    const image = frame || screenFrame;

    const prompt = `
Analyze the current moment of a hackathon presentation.

PROJECT:
${JSON.stringify(project, null, 2)}

CURRENT TRANSCRIPT:
${transcript}

Return ONLY valid JSON:

{
  "observation": "short observation",
  "strengths": ["strength 1", "strength 2"],
  "alerts": ["issue 1"],
  "coaching": "one practical coaching suggestion"
}

Be constructive. Do not claim to detect emotions or personal characteristics from appearance.
`;

    const text = await askAI(
      "You are a real-time presentation coach. Analyze only information actually available.",
      prompt,
      image
    );

    const result = parseJSON(text);

    res.json({
      result: {
        observation: result.observation || "Live moment analyzed.",
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        alerts: Array.isArray(result.alerts) ? result.alerts : [],
        coaching: result.coaching || "Keep presenting clearly."
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Agentic AI Judge ----------

app.post("/api/agentic-evaluate", async (req, res) => {
  try {
    const { project } = req.body;

    if (!project?.projectName || !project?.problem || !project?.solution) {
      return res.status(400).json({
        error: "Project name, problem and solution are required."
      });
    }

    const prompt = `
You are the main evaluator for JUDGEX.

Evaluate this hackathon project:

${JSON.stringify(project, null, 2)}

Act as five independent judging perspectives:

1. Problem Judge
2. Innovation Judge
3. Technical Judge
4. Impact Judge
5. Feasibility Judge

Then create a consensus evaluation.

Return ONLY valid JSON in exactly this structure:

{
  "overallScore": 0,
  "verdict": "Strong / Needs Improvement / Weak",
  "scores": {
    "problem": 0,
    "innovation": 0,
    "technical": 0,
    "impact": 0,
    "feasibility": 0
  },
  "confidence": 0,
  "summary": "short summary",
  "criticalGaps": [],
  "judgeQuestions": [],
  "actionPlan": [],
  "agentConsensus": "short consensus",
  "agents": [
    {
      "agent": "Problem Judge",
      "score": 0,
      "confidence": 0,
      "findings": []
    },
    {
      "agent": "Innovation Judge",
      "score": 0,
      "confidence": 0,
      "findings": []
    },
    {
      "agent": "Technical Judge",
      "score": 0,
      "confidence": 0,
      "findings": []
    },
    {
      "agent": "Impact Judge",
      "score": 0,
      "confidence": 0,
      "findings": []
    },
    {
      "agent": "Feasibility Judge",
      "score": 0,
      "confidence": 0,
      "findings": []
    }
  ]
}

All scores must be integers from 0 to 100.
Do not invent evidence that is not present in the project description.
`;

    const text = await askAI(
      "You are an objective multi-agent hackathon judging system. Return valid JSON only.",
      prompt
    );

    const result = parseJSON(text);

    res.json({
      result: {
        overallScore: result.overallScore ?? 0,
        verdict: result.verdict || "Evaluated",
        scores: {
          problem: result.scores?.problem ?? 0,
          innovation: result.scores?.innovation ?? 0,
          technical: result.scores?.technical ?? 0,
          impact: result.scores?.impact ?? 0,
          feasibility: result.scores?.feasibility ?? 0
        },
        confidence: result.confidence ?? 0,
        summary: result.summary || "",
        criticalGaps: Array.isArray(result.criticalGaps)
          ? result.criticalGaps
          : [],
        judgeQuestions: Array.isArray(result.judgeQuestions)
          ? result.judgeQuestions
          : [],
        actionPlan: Array.isArray(result.actionPlan)
          ? result.actionPlan
          : [],
        agentConsensus: result.agentConsensus || "",
        agents: Array.isArray(result.agents)
          ? result.agents
          : []
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ---------- Error handling ----------

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    error: "Internal server error."
  });
});

// ---------- Start ----------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`JUDGEX backend running on port ${PORT}`);
  console.log(`AI configured: ${Boolean(OPENAI_API_KEY)}`);
});