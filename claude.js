import dotenv from "dotenv";

// Load .env and .env.local (local overrides)
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const msg = process.argv.slice(2).join(" ");

async function run() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is not set. Create a .env file with ANTHROPIC_API_KEY=your-key");
    process.exit(1);
  }

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1000,
    messages: [{ role: "user", content: msg }],
  });

  console.log(response.content[0].text);
}

run();
