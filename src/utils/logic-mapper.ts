
import { getDb } from '../db/connection.js';

export interface LogicMap {
  app_name: string;
  architecture: string;
  pipes: {
    input: string;
    processing: string;
    memory: string;
    output: string;
  };
  recommended_libraries: string[];
  vibe_rating: number; // 0-100 based on KB success claims
}

/**
 * The Logic Mapper takes a vibecoded app idea and builds the "Plumbing" map.
 * It uses the Knowledge Base to find successful patterns for similar apps.
 */
export function mapAppLogic(appDescription: string): LogicMap {
  const db = getDb();
  const descriptionLower = appDescription.toLowerCase();

  // 1. Initial Vibe Check (Searching KB for patterns)
  const sanitizedQuery = appDescription.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).slice(0, 3).join(' ');
  const claims = db.prepare(`
    SELECT claim_text FROM claims 
    WHERE id IN (SELECT rowid FROM claims_fts WHERE claims_fts MATCH ?)
    AND confidence > 0.7
    LIMIT 5
  `).all(sanitizedQuery) as any[];

  // 2. Build the Logic Pipes based on context
  let architecture = "Standalone Agent";
  let input = "User Request";
  let processing = "LLM Synthesis";
  let memory = "Ephemeral (None)";
  let output = "Text Response";
  let libraries = ["openai", "zod"];
  let vibe = 50;

  if (descriptionLower.includes("game") || descriptionLower.includes("babylon")) {
    architecture = "Engine-Driven Simulation";
    input = "User Interaction + Animation Frame";
    processing = "Physics & Scene Update";
    memory = "Global Game State (JSON/SQLite)";
    output = "Canvas Rendering (WebGL)";
    libraries = ["babylonjs", "recoil", "cannon-es"];
    vibe = 85;
  } else if (descriptionLower.includes("scrap") || descriptionLower.includes("research")) {
    architecture = "Multi-Hop Research Pipeline";
    input = "Target URL / Search Query";
    processing = "Scrapling Adaptive Extraction";
    memory = "Persistent Knowledge Base (SQLite)";
    output = "Structured Research Report";
    libraries = ["scrapling", "better-sqlite3", "hono"];
    vibe = 95;
  } else if (descriptionLower.includes("rag") || descriptionLower.includes("database")) {
    architecture = "Vector-Augmented Knowledge Engine";
    input = "Natural Language Query";
    processing = "Similarity Search + LLM Grounding";
    memory = "Vector Database (Chroma/Pinecone)";
    output = "Evidence-Backed Answer";
    libraries = ["langchain", "chromadb", "openai"];
    vibe = 90;
  }

  // Adjust vibe based on how many claims we found in KB
  vibe = Math.min(100, vibe + (claims.length * 2));

  return {
    app_name: appDescription.split(' ').slice(0, 3).join(' '),
    architecture,
    pipes: { input, processing, memory, output },
    recommended_libraries: libraries,
    vibe_rating: vibe
  };
}
