"""
QUANTUM FOOTBALL AI — Backend Python
GitHub Actions Cloud Pipeline
API: football-data.org (free tier)
Dipendenze: pip install requests numpy
"""

import os, sys, json, math, smtplib, traceback, time
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests
import numpy as np

QISKIT_AVAILABLE = False
try:
    from qiskit import QuantumCircuit, transpile
    from qiskit_aer import AerSimulator
    QISKIT_AVAILABLE = True
    print("✅ Qiskit disponibile")
except Exception:
    print("⚡ Qiskit non disponibile — modalità classica")

# ═══════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════
FOOTBALL_DATA_KEY = os.getenv("FOOTBALL_DATA_KEY", "")
TELEGRAM_TOKEN    = os.getenv("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT     = os.getenv("TELEGRAM_CHAT", "")
SMTP_HOST         = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT         = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER         = os.getenv("SMTP_USER", "")
SMTP_PASS         = os.getenv("SMTP_PASS", "")
SMTP_TO           = os.getenv("SMTP_TO", "")

# football-data.org competition codes
COMPETITIONS = {
    "Serie A":          "SA",
    "Premier League":   "PL",
    "La Liga":          "PD",
    "Bundesliga":       "BL1",
    "Ligue 1":          "FL1",
    "Champions League": "CL",
    "Serie B":          "SB",
    "Eredivisie":       "DED",
    "Primeira Liga":    "PPL",
    "Championship":     "ELC",
}

ELO_DB = {
    "Inter":1820, "Napoli":1795, "AC Milan":1778, "Juventus":1760,
    "Atalanta BC":1750, "AS Roma":1720, "SS Lazio":1710, "ACF Fiorentina":1695,
    "Torino FC":1650, "Bologna FC 1909":1640, "Udinese Calcio":1610,
    "Venezia FC":1620, "Genoa CFC":1600, "Hellas Verona FC":1600,
    "Parma Calcio 1913":1595, "Cagliari Calcio":1590, "Empoli FC":1580,
    "Como 1907":1615, "US Lecce":1610, "AC Monza":1615,
    "Spezia Calcio":1570, "AC Pisa 1909":1545, "US Sassuolo Calcio":1610,
    "US Cremonese":1560, "Cesena FC":1520, "US Catanzaro 1929":1530,
    "SSC Bari":1550, "Palermo FC":1560, "UC Sampdoria":1580,
    "Cosenza Calcio":1520, "FC Sudtirol":1530, "Reggiana":1535,
    "Modena FC":1540, "Brescia Calcio":1555, "Mantova":1510,
    "AS Cittadella":1525, "Frosinone Calcio":1545, "SS Juve Stabia":1505,
    "US Salernitana 1919":1540, "Carrarese Calcio":1500,
    "US Avellino":1490, "Benevento Calcio":1510,
    "Manchester City FC":1870, "Arsenal FC":1840, "Liverpool FC":1835,
    "Chelsea FC":1790, "Tottenham Hotspur FC":1775, "Manchester United FC":1760,
    "Newcastle United FC":1745, "Aston Villa FC":1740, "Brighton & Hove Albion FC":1710,
    "West Ham United FC":1690, "Fulham FC":1680, "Wolverhampton Wanderers FC":1660,
    "Everton FC":1650, "Crystal Palace FC":1655, "Brentford FC":1670,
    "Nottingham Forest FC":1660, "AFC Bournemouth":1640, "Leicester City FC":1645,
    "Southampton FC":1600, "Ipswich Town FC":1610,
    "Real Madrid CF":1880, "FC Barcelona":1855, "Club Atletico de Madrid":1820,
    "Sevilla FC":1740, "Real Sociedad de Futbol":1730, "Villarreal CF":1720,
    "Athletic Club":1710, "Real Betis Balompie":1700,
    "FC Bayern Munchen":1860, "Bayer 04 Leverkusen":1830,
    "Borussia Dortmund":1800, "RB Leipzig":1790,
    "Eintracht Frankfurt":1730, "VfB Stuttgart":1720,
    "Paris Saint-Germain FC":1875, "AS Monaco FC":1760,
    "Olympique de Marseille":1740, "Lille OSC":1720,
    "AFC Ajax":1780, "PSV Eindhoven":1800, "Feyenoord":1790,
    "Sport Lisboa e Benfica":1800, "FC Porto":1795, "Sporting CP":1785,
}

def get_elo(name):
    if name in ELO_DB:
        return ELO_DB[name]
    # fuzzy match su parole chiave
    name_l = name.lower()
    for k, v in ELO_DB.items():
        if any(w in name_l for w in k.lower().split() if len(w) > 3):
            return v
    return 1650

# ═══════════════════════════════════════
#  FETCHER football-data.org
# ═══════════════════════════════════════
class FootballDataFetcher:
    BASE = "https://api.football-data.org/v4"

    def __init__(self, api_key):
        self.headers   = {"X-Auth-Token": api_key}
        self.available = bool(api_key)

    def _get(self, ep, params=None):
        time.sleep(6)  # max 10 req/min free tier → 1 ogni 6s
        r = requests.get(f"{self.BASE}/{ep}", headers=self.headers,
                         params=params or {}, timeout=15)
        if r.status_code == 429:
            print("   ⏳ Rate limit — attendo 30s")
            time.sleep(30)
            r = requests.get(f"{self.BASE}/{ep}", headers=self.headers,
                             params=params or {}, timeout=15)
        r.raise_for_status()
        return r.json()

    def get_fixtures(self, comp_code):
        if not self.available:
            return []
        today   = datetime.now().strftime("%Y-%m-%d")
        in3days = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        try:
            data = self._get(f"competitions/{comp_code}/matches", {
                "dateFrom": today, "dateTo": in3days, "status": "SCHEDULED"
            })
            return data.get("matches", [])
        except Exception as e:
            print(f"   ⚠️  get_fixtures {comp_code}: {e}")
            return []

    def get_past_results(self, comp_code, limit=10):
        if not self.available:
            return []
        try:
            data = self._get(f"competitions/{comp_code}/matches", {
                "status": "FINISHED", "limit": limit
            })
            return data.get("matches", [])
        except Exception as e:
            print(f"   ⚠️  get_past_results {comp_code}: {e}")
            return []

# ═══════════════════════════════════════
#  FEATURE ENGINEERING
# ═══════════════════════════════════════
def extract_features(hname, aname):
    he = get_elo(hname)
    ae = get_elo(aname)
    hxg  = he > 1800 and 2.1 or he > 1700 and 1.6 or 1.2
    axg  = ae > 1800 and 2.1 or ae > 1700 and 1.6 or 1.2
    hxga = he > 1800 and 0.9 or he > 1700 and 1.1 or 1.3
    axga = ae > 1800 and 0.9 or ae > 1700 and 1.1 or 1.3
    ep   = 1 / (1 + 10 ** ((ae - he - 60) / 400))
    return {
        "elo_home":     he,
        "elo_away":     ae,
        "elo_diff":     he - ae,
        "elo_win_prob": ep,
        "xg_diff":      hxg - axg,
        "form_diff":    0,
        "lambda_home":  (hxg + axga) / 2,
        "lambda_away":  (axg + hxga) / 2,
    }

# ═══════════════════════════════════════
#  QUANTUM / CLASSICAL ENGINE
# ═══════════════════════════════════════
def classical_predict(f):
    ep   = f["elo_win_prob"]
    fd   = f.get("form_diff", 0)
    xgd  = f.get("xg_diff", 0)
    draw = max(0.12, 0.28 - abs(f.get("elo_diff", 0)) * 0.0002)
    home = max(0.05, ep + fd * 0.1 + xgd * 0.03 - draw / 2)
    away = max(0.05, 1 - home - draw)
    n    = home + draw + away
    return {"home": home/n, "draw": draw/n, "away": away/n,
            "quantum_used": False}

def quantum_predict(f):
    if not QISKIT_AVAILABLE:
        return classical_predict(f)
    try:
        ep  = f["elo_win_prob"]
        xgd = f["xg_diff"]
        fd  = f["form_diff"]
        th  = 2 * math.asin(math.sqrt(max(0.01, min(0.99, ep))))
        ta  = 2 * math.asin(math.sqrt(max(0.01, min(0.99, 1 - ep))))
        qc  = QuantumCircuit(3, 3)
        qc.h(0); qc.h(1); qc.h(2)
        qc.ry(th, 0); qc.ry(ta, 2)
        qc.rz(fd * 0.4, 0); qc.rz(-fd * 0.4, 2)
        qc.rz(xgd * 0.3, 0)
        qc.cx(0, 1); qc.cx(2, 1)
        qc.measure([0, 1, 2], [0, 1, 2])
        sim    = AerSimulator()
        counts = sim.run(transpile(qc, sim), shots=8192).result().get_counts()
        total  = sum(counts.values())
        hc = sum(v for k, v in counts.items() if k.count("1") <= 1)
        ac = sum(v for k, v in counts.items() if k.count("0") <= 1)
        dc = max(1, total - hc - ac)
        ph, pd, pa = hc/total, dc/total, ac/total
        n = ph + pd + pa
        return {"home": ph/n, "draw": pd/n, "away": pa/n,
                "quantum_used": True, "shots": total}
    except Exception as e:
        print(f"   ⚠️  Quantum error: {e}")
        return classical_predict(f)

def full_prediction(f):
    base = quantum_predict(f)
    h, d, a = base["home"], base["draw"], base["away"]
    lh = f["lambda_home"]
    la = f["lambda_away"]
    pover = max(0.20, min(0.85,
        1 - sum(math.exp(-(lh+la)) * (lh+la)**k / math.factorial(k) for k in range(3))
    ))
    pbtts = max(0.15, min(0.82, (1 - math.exp(-lh)) * (1 - math.exp(-la))))
    ent   = -(h*math.log(max(0.001,h)) + d*math.log(max(0.001,d)) + a*math.log(max(0.001,a)))
    conf  = 1 - ent / math.log(3)
    bv    = max(h, d, a)
    bo    = "1" if bv == h else ("2" if bv == a else "X")
    return {**base,
            "dc_1x": h+d, "dc_x2": d+a, "dc_12": h+a,
            "over_25": pover, "under_25": 1-pover,
            "btts_y": pbtts, "btts_n": 1-pbtts,
            "xg_home": round(lh, 2), "xg_away": round(la, 2),
            "confidence": conf, "best_out": bo, "best_val": bv}

# ═══════════════════════════════════════
#  ADAPTIVE MODEL
# ═══════════════════════════════════════
class AdaptiveModel:
    def __init__(self, path="weights.json"):
        self.path = path
        try:
            with open(path) as f:
                self.weights = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            self.weights = {"elo": 0.40, "emotional": 0.35, "quantum": 0.25, "home_adv": 60}

    def save(self):
        with open(self.path, "w") as f:
            json.dump(self.weights, f, indent=2)

    def update(self, predicted, actual):
        key  = {"1": "home", "X": "draw", "2": "away"}.get(actual, "draw")
        prob = predicted.get(key, 1/3)
        adj  = 0.001 * (0.25 - (1 - prob) ** 2)
        t = self.weights["elo"] + self.weights["emotional"] + self.weights["quantum"]
        for k in ("elo", "emotional", "quantum"):
            self.weights[k] /= t
        self.save()

# ═══════════════════════════════════════
#  ALERTS
# ═══════════════════════════════════════
def send_telegram(pred, hname, aname, comp):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT:
        return
    fmt  = lambda v: f"{v*100:.1f}%"
    odd  = lambda v: f"@{1/max(0.001,v):.2f}"
    icon = "🔥" if pred["confidence"] > 0.75 else "✅" if pred["confidence"] > 0.55 else "⚠️"
    msg  = (
        f"⚽ *QUANTUM FOOTBALL AI* ⚛️\n"
        f"━━━━━━━━━━━━━━━━━\n"
        f"🏆 {comp}\n"
        f"🏠 *{hname}* vs *{aname}* ✈️\n\n"
        f"1:{fmt(pred['home'])} {odd(pred['home'])}  "
        f"X:{fmt(pred['draw'])} {odd(pred['draw'])}  "
        f"2:{fmt(pred['away'])} {odd(pred['away'])}\n"
        f"Over2.5:{fmt(pred['over_25'])} · BTTS:{fmt(pred['btts_y'])}\n"
        f"Conf:{fmt(pred['confidence'])} {icon}\n"
        f"_{datetime.now().strftime('%d/%m/%Y %H:%M')}_"
    )
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT, "text": msg,
                  "parse_mode": "Markdown", "disable_web_page_preview": True},
            timeout=10
        )
        print(f"   {'✅' if r.ok else '❌'} Telegram → {hname} vs {aname}")
    except Exception as e:
        print(f"   ❌ Telegram error: {e}")

# ═══════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════
def main():
    print("=" * 60)
    print("⚛️  QUANTUM FOOTBALL AI — Cloud Pipeline")
    print(f"   {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"   API: football-data.org")
    print(f"   Engine: {'Qiskit' if QISKIT_AVAILABLE else 'Classico'}")
    print("=" * 60)

    fetcher = FootballDataFetcher(FOOTBALL_DATA_KEY)
    model   = AdaptiveModel("weights.json")

    if not FOOTBALL_DATA_KEY:
        print("⚠️  FOOTBALL_DATA_KEY mancante — uso fixture mock")

    print(f"\n🔧 Pesi: {model.weights}")
    all_preds = []

    for league_name, comp_code in COMPETITIONS.items():
        print(f"\n📅 {league_name} ({comp_code})")
        matches = fetcher.get_fixtures(comp_code)

        if not matches:
            # mock solo se non ci sono partite reali
            print(f"   ℹ️  Nessuna partita nei prossimi 3 giorni")
            continue

        for match in matches[:3]:
            try:
                hname = match["homeTeam"]["name"]
                aname = match["awayTeam"]["name"]
                fid   = match["id"]
                fdate = match.get("utcDate", datetime.now().isoformat())
                # converti UTC in ora italiana (+1 o +2)
                dt = datetime.fromisoformat(fdate.replace("Z", "+00:00"))
                dt_it = dt + timedelta(hours=1)
                date_str = dt_it.strftime("%d/%m/%Y")
                time_str = dt_it.strftime("%H:%M")

                print(f"   ⚽ {hname} vs {aname} ({date_str} {time_str})")

                feat = extract_features(hname, aname)
                pred = full_prediction(feat)

                print(f"      1:{pred['home']:.1%} X:{pred['draw']:.1%} 2:{pred['away']:.1%} "
                      f"O2.5:{pred['over_25']:.1%} Conf:{pred['confidence']:.1%}")

                all_preds.append({
                    "league":       league_name,
                    "fixture_id":   fid,
                    "home":         hname,
                    "away":         aname,
                    "date":         date_str,
                    "time":         time_str,
                    "prediction":   pred,
                    "generated_at": datetime.now().isoformat()
                })

                send_telegram(pred, hname, aname, league_name)

            except Exception as e:
                print(f"   ❌ Errore: {e}")
                traceback.print_exc()

    # ── BACKTESTING ─────────────────────────────────────────
    print("\n🔄 Auto-adattamento...")
    adapted = 0
    for league_name, comp_code in list(COMPETITIONS.items())[:3]:
        try:
            for result in fetcher.get_past_results(comp_code, limit=5):
                score = result.get("score", {}).get("fullTime", {})
                gh = score.get("home")
                ga = score.get("away")
                if gh is None or ga is None:
                    continue
                actual = "1" if gh > ga else ("2" if ga > gh else "X")
                hname  = result["homeTeam"]["name"]
                aname  = result["awayTeam"]["name"]
                feat   = extract_features(hname, aname)
                mp     = classical_predict(feat)
                model.update(mp, actual)
                adapted += 1
        except Exception as e:
            print(f"   ⚠️  {league_name}: {e}")

    print(f"   Adattamenti: {adapted}")
    print(f"🔧 Pesi finali: {model.weights}")

    # ── SALVA predictions_output.json ───────────────────────
    with open("predictions_output.json", "w") as f:
        json.dump(all_preds, f, indent=2, default=str)
    print(f"\n✅ {len(all_preds)} previsioni → predictions_output.json")

    # ── SALVA fixtures_today.json (per la dashboard) ────────
    fixtures_dashboard = []
    for p in all_preds:
        pred = p.get("prediction", {})
        fixtures_dashboard.append({
            "home":       p["home"],
            "away":       p["away"],
            "league":     p["league"],
            "fixture_id": p["fixture_id"],
            "date":       p.get("date", ""),
            "time":       p.get("time", ""),
            "pred": {
                "home":   round(pred.get("home",    0.33), 4),
                "draw":   round(pred.get("draw",    0.33), 4),
                "away":   round(pred.get("away",    0.33), 4),
                "dc1x":   round(pred.get("dc_1x",   0.60), 4),
                "dcx2":   round(pred.get("dc_x2",   0.60), 4),
                "dc12":   round(pred.get("dc_12",   0.66), 4),
                "over25": round(pred.get("over_25", 0.50), 4),
                "under25":round(pred.get("under_25",0.50), 4),
                "bttsY":  round(pred.get("btts_y",  0.50), 4),
                "bttsN":  round(pred.get("btts_n",  0.50), 4),
                "xg_h":   str(pred.get("xg_home",  "1.50")),
                "xg_a":   str(pred.get("xg_away",  "1.20")),
                "conf":   round(pred.get("confidence", 0.50), 4),
                "best":   pred.get("best_out", "1"),
                "bestP":  round(pred.get("best_val", 0.33), 4),
            }
        })

    with open("fixtures_today.json", "w") as f:
        json.dump({
            "generated_at": datetime.now().isoformat(),
            "date":         datetime.now().strftime("%d/%m/%Y"),
            "total":        len(fixtures_dashboard),
            "fixtures":     fixtures_dashboard
        }, f, indent=2, default=str)

    print(f"✅ {len(fixtures_dashboard)} fixture → fixtures_today.json")
    print("✅ Pipeline completata!")


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERRORE FATALE: {e}")
        traceback.print_exc()
        sys.exit(1)
