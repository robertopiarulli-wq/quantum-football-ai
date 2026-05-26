// api/fixtures.js — Vercel Serverless Function
// Proxy sicuro verso API Football: la chiave resta nel server, mai esposta al browser

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const API_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: "API_FOOTBALL_KEY non configurata in Vercel Environment Variables" });
  }

  const { endpoint = "fixtures", ...params } = req.query;

  // Whitelist endpoint sicuri
  const allowed = ["fixtures", "teams/statistics", "standings", "injuries", "teams%2Fstatistics"];
  const decoded = decodeURIComponent(endpoint);
  if (!allowed.includes(endpoint) && !allowed.includes(decoded)) {
    return res.status(403).json({ error: "Endpoint non permesso" });
  }

  try {
    const qs = new URLSearchParams(params).toString();
    const url = `https://v3.football.api-sports.io/${decoded}?${qs}`;

    const response = await fetch(url, {
      headers: { "x-apisports-key": API_KEY },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `API Football: ${response.status}` });
    }

    const data = await response.json();

    // Cache 10 minuti — non consuma quota ad ogni refresh
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=60");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
