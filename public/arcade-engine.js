const RULES = { house_return: 0.95, road_survival: 0.8, max_steps: 8, mines: 3, tiles: 25, race_ms: 8e3, stakes: [50, 100, 200, 500, 1e3] };
class GameError extends Error {
  status;
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const hex = (data) => [...new Uint8Array(data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (text) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const randomSeed = () => hex(crypto.getRandomValues(new Uint8Array(32)));
function payoutFor(game, stake, steps) {
  if (game === "pigs") return Math.floor(stake * 3.8);
  if (steps === 0) return stake;
  let survival = 1;
  if (game === "road") survival = Math.pow(0.8, steps);
  else for (let i = 0; i < steps; i++) survival *= (22 - i) / (25 - i);
  return Math.floor(stake * 0.95 / survival + 1e-9);
}
async function outcomes(seed, client_seed) {
  let counter = 0;
  const rand = async () => {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${seed}:${client_seed}:${counter++}`)));
    let n = 0;
    for (let i = 0; i < 6; i++) n = n * 256 + bytes[i];
    return n / 281474976710656;
  };
  const winner = Math.floor(await rand() * 4), hazards = [];
  for (let i = 0; i < 8; i++) hazards.push(await rand() >= 0.8);
  const cells = Array.from({ length: 25 }, (_, i) => i);
  for (let i = 24; i > 0; i--) {
    const j = Math.floor(await rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return { winner, hazards, bombs: cells.slice(0, 3).sort((a, b) => a - b) };
}
async function makeGame(input, now = Date.now()) {
  if (!["pigs", "road", "mines"].includes(input.game) || !RULES.stakes.includes(input.stake)) throw new GameError("Choose a supported game and a 0.5, 1, 2, 5 or 10 TON stake");
  if (input.pig !== void 0 && (!Number.isInteger(input.pig) || input.pig < 0 || input.pig > 3)) throw new GameError("Choose pig 1\u20134");
  if (typeof input.client_seed !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.client_seed)) throw new GameError("A client seed of 8\u201380 letters or digits is required");
  const seed = randomSeed();
  return {
    ...input,
    ...await outcomes(seed, input.client_seed),
    seed,
    commitment: await sha256(seed),
    pig: input.pig ?? 0,
    nickname: (typeof input.nickname === "string" ? input.nickname : "Player").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 20) || "Player",
    public_score: input.public_score === true,
    status: "awaiting_payment",
    revealed: [],
    steps: 0,
    revision: 0,
    payout: 0,
    created: now,
    started: null,
    buyer: null,
    session: null,
    settlement: "none",
    max_payout: payoutFor(input.game, input.stake, input.game === "pigs" ? 1 : 8),
    reserved: true,
    last_request: null
  };
}
function activate(g, buyer, now = Date.now()) {
  if (g.status === "awaiting_payment") {
    g.buyer = buyer;
    g.status = "active";
    g.started = now;
  }
}
function play(g, action, cell, now = Date.now()) {
  if (g.status !== "active") throw new GameError("This round is not active", 409);
  if (action === "finish" && g.game === "pigs") {
    if (now - (g.started ?? now) < RULES.race_ms) throw new GameError("The pigs are still racing", 409);
    g.steps = 1;
    g.payout = g.pig === g.winner ? payoutFor("pigs", g.stake, 1) : 0;
    g.status = g.payout ? "won" : "lost";
  } else if (action === "cashout" && g.game !== "pigs") {
    if (!g.steps) throw new GameError("Make at least one safe move before cashing out");
    g.payout = payoutFor(g.game, g.stake, g.steps);
    g.status = "cashed_out";
  } else if (action === "hop" && g.game === "road") {
    if (g.hazards[g.steps]) {
      g.steps++;
      g.payout = 0;
      g.status = "lost";
    } else {
      g.steps++;
      if (g.steps === 8) {
        g.payout = payoutFor("road", g.stake, 8);
        g.status = "won";
      }
    }
  } else if (action === "reveal" && g.game === "mines") {
    if (!Number.isInteger(cell) || cell < 0 || cell >= 25 || g.revealed.includes(cell)) throw new GameError("Choose a covered tile");
    g.revealed.push(cell);
    if (g.bombs.includes(cell)) {
      g.status = "lost";
      g.payout = 0;
    } else {
      g.steps++;
      if (g.steps === 8) {
        g.payout = payoutFor("mines", g.stake, 8);
        g.status = "won";
      }
    }
  } else throw new GameError("That action is not available in this game");
  g.revision++;
  if (g.status !== "active" && g.payout > 0) g.settlement = "pending";
}
function publicGame(g) {
  const terminal = !["active", "awaiting_payment"].includes(g.status);
  return {
    id: g.id,
    game: g.game,
    stake: g.stake / 100,
    pig: g.pig,
    status: g.status,
    steps: g.steps,
    revision: g.revision,
    revealed: g.revealed,
    started: g.started,
    payout: g.payout / 100,
    cashout: g.steps ? payoutFor(g.game, g.stake, g.steps) / 100 : 0,
    next_payout: g.steps < 8 ? payoutFor(g.game, g.stake, g.steps + 1) / 100 : null,
    settlement: g.settlement,
    funded: !!g.buyer,
    commitment: g.commitment,
    client_seed: g.client_seed,
    ...terminal ? { proof: { seed: g.seed, algorithm: "SHA-256(seed:client_seed:counter), first 48 bits / 2^48; winner, 8 road draws, Fisher-Yates 25 tiles", winner: g.winner, bombs: g.bombs } } : {}
  };
}
export {
  GameError,
  RULES,
  activate,
  hex,
  makeGame,
  outcomes,
  payoutFor,
  play,
  publicGame,
  randomSeed,
  sha256
};
