import { defineApp } from "@ambasada/sdk";
import { defineCompany } from "@ambasada/village";
export default defineCompany(defineApp({
  id: "demolatorii-hackathon", name: "Agent Checkup",
  description: "Security checkups for AI agents: evidence, boundaries, and practical fixes.",
  product: { url: "http://localhost:3000" },
}), {
  idea: { title: "Security checkups for AI agents: test their boundaries before someone else does.", category: "data" },
  offerings: "./offerings.ts", agent: { dir: "./agent" },
});
