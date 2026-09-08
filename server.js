require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-5";
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || MODEL;
const MAX_BODY = process.env.MAX_BODY || "12mb";

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(",").map(x => x.trim())
    : true
}));
app.use(express.json({ limit: MAX_BODY }));
app.use(express.static(path.join(__dirname)));

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function requireAI(res) {
  if (!client) {
    res.status(503).json({ error: "AI backend is not configured. Add OPENAI_API_KEY to .env and restart the server." });
    return false;
  }
  return true;
}

function cleanJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

async function ai(input, model = MODEL) {
  const response = await client.responses.create({ model, input });
  return response.output_text || "";
}

function projectContext(p) {
  return `PROJECT NAME: ${p.projectName}\nPROBLEM: ${p.problem}\nSOLUTION: ${p.solution}\nTECHNOLOGY: ${p.technology || "Not provided"}\nIMPACT/FEASIBILITY: ${p.impact || "Not provided"}`;
}

app.get("/api/health", (req, res) => res.json({
  ok: true,
  aiConfigured: !!client,
  model: MODEL,
  features: { agents: true, vision: true, camera: true, microphone: true, screenShare: true }
}));

app.post("/api/evaluate", async (req, res) => {
  if (!requireAI(res)) return;
  try {
    const p = req.body || {};
    if (!p.projectName || !p.problem || !p.solution) return res.status(400).json({ error: "projectName, problem and solution are required." });
    const prompt = `You are the lead JUDGEX evaluator. Evaluate fairly using only the provided facts. Return ONLY JSON:\n${projectContext(p)}\nSchema: {"overallScore":0,"verdict":"Strong|Promising|Needs Improvement","scores":{"problem":0,"innovation":0,"technical":0,"impact":0,"feasibility":0},"summary":"","strengths":[],"improvements":[],"judgeQuestions":[],"risks":[],"nextActions":[]}. Scores 0-100. Overall should be a weighted judgment, not an arbitrary number.`;
    const result = cleanJson(await ai(prompt));
    res.json({ result });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message || "Evaluation failed" }); }
});

app.post("/api/agentic-evaluate", async (req, res) => {
  if (!requireAI(res)) return;
  try {
    const p = req.body || {};
    if (!p.projectName || !p.problem || !p.solution) return res.status(400).json({ error: "projectName, problem and solution are required." });
    const ctx = projectContext(p);
    const agents = [
      ["Problem & Impact Agent", "Judge problem clarity, user need, measurable impact, and target users."],
      ["Innovation Agent", "Judge novelty, differentiation, defensibility, and whether AI claims are meaningful."],
      ["Technical Agent", "Judge architecture, implementation realism, reliability, security, scalability, and integration risks."],
      ["Pitch Agent", "Judge clarity, storytelling, demo readiness, evidence, and judge-facing communication."],
      ["Feasibility Agent", "Judge cost, deployment, adoption, business model, constraints, and next-step realism."]
    ];
    const outputs = await Promise.all(agents.map(async ([name, role]) => {
      const text = await ai(`You are the ${name} in a multi-agent judging system. ${role}\n${ctx}\nReturn ONLY JSON: {"agent":"${name}","score":0,"confidence":0,"findings":[],"risks":[],"questions":[],"recommendations":[]}. Score and confidence 0-100.`);
      return cleanJson(text);
    }));
    const synthesis = await ai(`You are JUDGEX Lead Judge. Synthesize these independent agent reports without blindly averaging them. Identify contradictions, confidence, critical risks, and the strongest evidence. Return ONLY JSON:\n{ "overallScore":0,"verdict":"Strong|Promising|Needs Improvement","scores":{"problem":0,"innovation":0,"technical":0,"impact":0,"feasibility":0},"confidence":0,"summary":"","topStrengths":[],"criticalGaps":[],"judgeQuestions":[],"actionPlan":[],"agentConsensus":""}\nPROJECT:\n${ctx}\nAGENTS:\n${JSON.stringify(outputs)}`);
    res.json({ result: cleanJson(synthesis), agents: outputs });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message || "Agentic evaluation failed" }); }
});

app.post("/api/live-analyze", async (req, res) => {
  if (!requireAI(res)) return;
  try {
    const { project, transcript = "", frame = null, screenFrame = null } = req.body || {};
    if (!project?.projectName) return res.status(400).json({ error: "Project context is required." });
    const content = [
      { type: "input_text", text: `You are a real-time hackathon judge. Analyze the latest presentation moment. Project: ${project.projectName}. Problem: ${project.problem}. Solution: ${project.solution}. Technology: ${project.technology || ""}. Live transcript: ${transcript || "No new transcript."}` }
    ];
    if (frame) content.push({ type: "input_image", image_url: frame });
    if (screenFrame) content.push({ type: "input_image", image_url: screenFrame });
    const text = await ai([{ role: "user", content }], VISION_MODEL);
    let result;
    try { result = cleanJson(text); } catch { result = { observation: text, scoreDelta: 0, strengths: [], alerts: [], coaching: "" }; }
    res.json({ result, timestamp: new Date().toISOString() });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message || "Live analysis failed" }); }
});

app.post("/api/chat", async (req, res) => {
  if (!requireAI(res)) return;
  try {
    const { message, project, history = [], liveState = {} } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ error: "Message is required." });
    const input = `You are JUDGEX AI, an expert hackathon judge and presentation coach. Be concise but useful. Never invent verification. Project context: ${project ? projectContext(project) : "None"}. Live state: ${JSON.stringify(liveState)}. Conversation: ${JSON.stringify(history.slice(-8))}. User: ${message}`;
    const reply = await ai(input);
    res.json({ reply });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message || "Chat failed" }); }
});

app.post("/api/transcript-analyze", async (req, res) => {
  if (!requireAI(res)) return;
  try {
    const { project, transcript } = req.body || {};
    const text = await ai(`Analyze this live presentation transcript as a judge. Return ONLY JSON: {"clarity":0,"confidence":0,"technicalDepth":0,"evidence":0,"fillerRisk":0,"strengths":[],"issues":[],"nextPrompt":""}. Scores 0-100. Do not infer private traits. Project: ${projectContext(project || {})}. Transcript: ${transcript || ""}`);
    res.json({ result: cleanJson(text) });
  } catch (e) { res.status(500).json({ error: e.message || "Transcript analysis failed" }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, () => console.log(`JUDGEX V2 running at http://localhost:${PORT}`));
