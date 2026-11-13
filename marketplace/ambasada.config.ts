import { defineApp } from "@ambasada/sdk";
import { defineCompany } from "@ambasada/village";
export default defineCompany(defineApp({
  id: "demolatorii-hackathon", name: "Piggy Arcade",
  description: "Animated pig races, road crossings and Mines with event TON play credits.",
  product: { url: "http://localhost:3000" },
}), {
  idea: { title: "Piggy Arcade: pig races, road crossings and Mines with transparent event-credit payouts.", category: "games" },
  offerings: "./offerings.ts", agent: { dir: "./agent" },
});
