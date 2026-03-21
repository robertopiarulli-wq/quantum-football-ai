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
    # Premier League — ELO aggiornati stagione 2025/26
    "Liverpool FC":1860, "Arsenal FC":1845, "Nottingham Forest FC":1760,
    "Chelsea FC":1755, "Newcastle United FC":1750, "Manchester City FC":1745,
    "Aston Villa FC":1730, "Fulham FC":1710, "Brighton & Hove Albion FC":1705,
    "Brentford FC":1695, "Tottenham Hotspur FC":1690, "AFC Bournemouth":1685,
    "Crystal Palace FC":1660, "Manchester United FC":1650, "West Ham United FC":1640,
    "Everton FC":1635, "Wolverhampton Wanderers FC":1625, "Ipswich Town FC":1615,
    "Leicester City FC":1610, "Southampton FC":1580,
    # Championship 2025/26
    "Sunderland AFC":1640, "Leeds United FC":1650, "Burnley FC":1635,
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
        in7days = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        try:
            data = self._get(f"competitions/{comp_code}/matches", {
                "dateFrom": today, "dateTo": in7days, "status": "SCHEDULED"
            })
            return data.get("matches", [])
        except Exception as e:
            print(f"   ⚠️  get_fixtures {comp_code}: {e}")
            return []

    def get_first_leg_scores(self, comp_code):
        """Recupera i risultati delle partite di andata per le coppe (ultimi 30gg)."""
        try:
            past30 = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            today  = datetime.now().strftime("%Y-%m-%d")
            data   = self._get(f"competitions/{comp_code}/matches", {
                "dateFrom": past30, "dateTo": today, "status": "FINISHED"
            })
            matches = data.get("matches", [])
            # Mappa: (homeTeam, awayTeam) → score andata
            # In un doppio confronto A vs B → B vs A è il ritorno
            first_leg_map = {}
            for m in matches:
                ht = m["homeTeam"]["name"]
                at = m["awayTeam"]["name"]
                sc = m.get("score", {}).get("fullTime", {})
                gh = sc.get("home")
                ga = sc.get("away")
                if gh is not None and ga is not None:
                    first_leg_map[(ht, at)] = {"home_goals": gh, "away_goals": ga}
            return first_leg_map
        except Exception:
            return {}

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

    def get_team_form(self, comp_code, last_n=30):
        """Forma reale separata casa/trasferta + stanchezza. Ritorna (form_map, past_results)."""
        results = self.get_past_results(comp_code, limit=last_n)
        team_stats = {}
        for r in results:
            sc = r.get("score", {}).get("fullTime", {})
            gh = sc.get("home")
            ga = sc.get("away")
            if gh is None or ga is None:
                continue
            ht = r["homeTeam"]["name"]
            at = r["awayTeam"]["name"]
            rdate = r.get("utcDate", "")
            for team, gf, gc, is_home in [(ht, gh, ga, True), (at, ga, gh, False)]:
                if team not in team_stats:
                    team_stats[team] = {
                        "results": [], "gf": [], "gc": [],
                        "home_results": [], "home_gf": [], "home_gc": [],
                        "away_results": [], "away_gf": [], "away_gc": [],
                        "last_date": ""
                    }
                outcome = "W" if gf > gc else ("D" if gf == gc else "L")
                team_stats[team]["results"].append(outcome)
                team_stats[team]["gf"].append(gf)
                team_stats[team]["gc"].append(gc)
                if is_home:
                    team_stats[team]["home_results"].append(outcome)
                    team_stats[team]["home_gf"].append(gf)
                    team_stats[team]["home_gc"].append(gc)
                else:
                    team_stats[team]["away_results"].append(outcome)
                    team_stats[team]["away_gf"].append(gf)
                    team_stats[team]["away_gc"].append(gc)
                if rdate > team_stats[team]["last_date"]:
                    team_stats[team]["last_date"] = rdate

        def form_score(results_list, n=5):
            """Trend ponderato: partite recenti pesano di più."""
            res = results_list[-n:]
            if not res:
                return 0.50
            # Pesi esponenziali: ultima partita = peso massimo
            weights = [1.5 ** i for i in range(len(res))]
            scores  = [1.0 if r=="W" else 0.5 if r=="D" else 0.0 for r in res]
            return sum(w * s for w, s in zip(weights, scores)) / sum(weights)

        def trend_score(results_list):
            """Trend delle ultime 3 vs ultime 10 — rileva crisi o rimonte."""
            if len(results_list) < 3:
                return 0.0
            recent3 = form_score(results_list[-3:], n=3)
            all10   = form_score(results_list[-10:], n=10)
            return round(recent3 - all10, 3)  # positivo = in forma, negativo = in crisi

        def avg(lst):
            return round(sum(lst)/max(1,len(lst)), 2)

        form_map = {}
        now = datetime.utcnow()
        for team, s in team_stats.items():
            # Stanchezza: giorni dall ultima partita
            fatigue = 99
            if s["last_date"]:
                try:
                    last_dt = datetime.fromisoformat(s["last_date"].replace("Z","+00:00")).replace(tzinfo=None)
                    fatigue = (now - last_dt).days
                except Exception:
                    pass
            form_map[team] = {
                "form":       round(form_score(s["results"]), 3),
                "home_form":  round(form_score(s["home_results"]), 3),
                "away_form":  round(form_score(s["away_results"]), 3),
                "trend":      trend_score(s["results"]),
                "home_trend": trend_score(s["home_results"]),
                "away_trend": trend_score(s["away_results"]),
                "xg":         avg(s["gf"]),
                "xga":        avg(s["gc"]),
                "home_xg":    avg(s["home_gf"]),
                "home_xga":   avg(s["home_gc"]),
                "away_xg":    avg(s["away_gf"]),
                "away_xga":   avg(s["away_gc"]),
                "fatigue_days": fatigue,
            }
        return form_map, results  # results riusato per H2H senza nuove chiamate API

    def get_h2h_from_results(self, team1, team2, past_results, limit=10):
        """Testa a testa calcolato dai risultati già scaricati — zero chiamate API extra."""
        try:
            h2h = [r for r in past_results
                   if (r["homeTeam"]["name"] == team1 and r["awayTeam"]["name"] == team2) or
                      (r["homeTeam"]["name"] == team2 and r["awayTeam"]["name"] == team1)]
            h2h = h2h[:limit]
            if not h2h:
                return None
            t1_wins = t2_wins = draws = 0
            for r in h2h:
                sc = r.get("score", {}).get("fullTime", {})
                gh = sc.get("home", 0) or 0
                ga = sc.get("away", 0) or 0
                ht = r["homeTeam"]["name"]
                if gh > ga:
                    if ht == team1: t1_wins += 1
                    else: t2_wins += 1
                elif ga > gh:
                    if ht == team2: t2_wins += 1
                    else: t1_wins += 1
                else:
                    draws += 1
            total = max(1, t1_wins + t2_wins + draws)
            return {
                "t1_win_rate": round(t1_wins / total, 3),
                "draw_rate":   round(draws / total, 3),
                "t2_win_rate": round(t2_wins / total, 3),
                "matches":     total,
            }
        except Exception:
            return None

    def get_standings(self, comp_code):
        """Posizione in classifica per motivazione."""
        try:
            data = self._get(f"competitions/{comp_code}/standings", {})
            standings = data.get("standings", [{}])[0].get("table", [])
            return {row["team"]["name"]: {
                "position": row["position"],
                "total_teams": len(standings),
                "points": row["points"],
                "won": row["won"], "drawn": row["drawn"], "lost": row["lost"],
            } for row in standings}
        except Exception as e:
            return {}

# ═══════════════════════════════════════
#  ELO DINAMICO
# ═══════════════════════════════════════
ELO_FILE = "elo_ratings.json"

def load_dynamic_elo():
    try:
        with open(ELO_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def save_dynamic_elo(elo):
    with open(ELO_FILE, "w") as f:
        json.dump(elo, f, indent=2)

def update_elo_ratings(history, dynamic_elo):
    """Aggiorna ELO dinamico dai risultati verificati non ancora processati."""
    K = 32  # fattore K standard
    updated = 0
    for p in history["predictions"]:
        if p.get("result") and not p.get("elo_updated"):
            h = p["home"]
            a = p["away"]
            re = p["result"]
            eh = dynamic_elo.get(h, ELO_DB.get(h, 1650))
            ea = dynamic_elo.get(a, ELO_DB.get(a, 1650))
            exp_h = 1 / (1 + 10 ** ((ea - eh) / 400))
            exp_a = 1 - exp_h
            score_h = 1.0 if re == "1" else 0.5 if re == "X" else 0.0
            score_a = 1.0 - score_h
            dynamic_elo[h] = round(eh + K * (score_h - exp_h), 1)
            dynamic_elo[a] = round(ea + K * (score_a - exp_a), 1)
            p["elo_updated"] = True
            updated += 1
    return updated

def get_elo_dynamic(name, dynamic_elo):
    """ELO dinamico se disponibile, altrimenti statico, altrimenti fuzzy match."""
    if name in dynamic_elo:
        return dynamic_elo[name]
    return get_elo(name)

# ═══════════════════════════════════════
#  FEATURE ENGINEERING
# ═══════════════════════════════════════
def extract_features(hname, aname, form_map=None, dynamic_elo=None,
                     h2h=None, standings=None, comp_code="", first_leg=None):
    delo = dynamic_elo or {}
    he = get_elo_dynamic(hname, delo)
    ae = get_elo_dynamic(aname, delo)

    hform_data = (form_map or {}).get(hname, {})
    aform_data = (form_map or {}).get(aname, {})

    # xG e xGA separati casa/trasferta
    hxg  = hform_data.get("home_xg",  hform_data.get("xg",  2.1 if he>1800 else 1.6 if he>1700 else 1.2))
    axg  = aform_data.get("away_xg",  aform_data.get("xg",  2.1 if ae>1800 else 1.6 if ae>1700 else 1.2))
    hxga = hform_data.get("home_xga", hform_data.get("xga", 0.9 if he>1800 else 1.1 if he>1700 else 1.3))
    axga = aform_data.get("away_xga", aform_data.get("xga", 0.9 if ae>1800 else 1.1 if ae>1700 else 1.3))

    # Forma separata casa/trasferta
    hform = hform_data.get("home_form", hform_data.get("form", 0.55))
    aform = aform_data.get("away_form", aform_data.get("form", 0.50))

    # Stanchezza: penalizza squadra che ha giocato recentemente
    h_fatigue = hform_data.get("fatigue_days", 99)
    a_fatigue = aform_data.get("fatigue_days", 99)
    fatigue_adj = 0.0
    if h_fatigue < 3:   fatigue_adj -= 0.05   # casa stanca
    if a_fatigue < 3:   fatigue_adj += 0.05   # ospite stanca

    # H2H adjustment
    h2h_adj = 0.0
    if h2h:
        h2h_adj = (h2h.get("t1_win_rate", 0.33) - 0.33) * 0.3

    # Motivazione da classifica
    motivation_adj = 0.0
    if standings:
        hs = standings.get(hname, {})
        as_ = standings.get(aname, {})
        hn  = hs.get("total_teams", 20)
        an  = as_.get("total_teams", 20)
        hpos = hs.get("position", hn // 2)
        apos = as_.get("position", an // 2)
        # Squadra in lotta salvezza (ultimi 3) è più motivata
        if hpos >= hn - 2: motivation_adj += 0.04
        if apos >= an - 2: motivation_adj -= 0.04
        # Squadra in testa ha meno pressione (piccola penalità)
        if hpos == 1: motivation_adj -= 0.02
        if apos == 1: motivation_adj += 0.02

    # Andata/ritorno: aggiusta in base al risultato dell'andata
    first_leg_adj = 0.0
    first_leg_info = {}
    if first_leg:
        gh1 = first_leg.get("home_goals", 0)
        ga1 = first_leg.get("away_goals", 0)
        # La squadra che deve rimontare è più motivata ma rischia di più
        goal_diff = gh1 - ga1  # positivo = casa in vantaggio dall'andata
        if goal_diff >= 2:
            first_leg_adj = -0.08  # casa molto avanti, ospite attacca
        elif goal_diff == 1:
            first_leg_adj = -0.04
        elif goal_diff == -1:
            first_leg_adj = +0.04  # casa deve rimontare
        elif goal_diff <= -2:
            first_leg_adj = +0.08
        first_leg_info = {"gh1": gh1, "ga1": ga1, "diff": goal_diff}

    home_bonus = LEAGUE_PROFILE.get(comp_code, {}).get("home_elo_bonus", 60)
    ep = 1 / (1 + 10 ** ((ae - he - home_bonus) / 400))

    # Penalità confidenza per big match: entrambe top (ELO > 1780)
    big_match_penalty = 0.0
    if he > 1780 and ae > 1780:
        elo_gap = abs(he - ae)
        if elo_gap < 50:   big_match_penalty = 0.12  # praticamente pari
        elif elo_gap < 100: big_match_penalty = 0.07

    ep = max(0.05, min(0.95, ep + fatigue_adj + h2h_adj + motivation_adj + first_leg_adj))

    # Trend recente (crisi o rimonta)
    h_trend = hform_data.get("home_trend", hform_data.get("trend", 0.0))
    a_trend = aform_data.get("away_trend", aform_data.get("trend", 0.0))

    src_h = "API" if hform_data else "ELO"
    src_a = "API" if aform_data else "ELO"
    return {
        "elo_home":       he,
        "elo_away":       ae,
        "elo_diff":       he - ae,
        "elo_win_prob":   ep,
        "xg_diff":        hxg - axg,
        "form_diff":      hform - aform,
        "lambda_home":    (hxg + axga) / 2,
        "lambda_away":    (axg + hxga) / 2,
        "h_fatigue_days": h_fatigue,
        "a_fatigue_days": a_fatigue,
        "h2h_matches":    h2h.get("matches", 0) if h2h else 0,
        "h_trend":        h_trend,
        "a_trend":        a_trend,
        "comp_code":        comp_code,
        "first_leg":        first_leg_info,
        "big_match_penalty": big_match_penalty,
        "src_home":         src_h,
        "src_away":         src_a,
    }

# ═══════════════════════════════════════
#  QUANTUM / CLASSICAL ENGINE
# ═══════════════════════════════════════
# Caratteristiche storiche per campionato
LEAGUE_PROFILE = {
    # draw_bias: tendenza ai pareggi vs media
    # home_bias: vantaggio casa aggiuntivo
    # goals_factor: moltiplicatore gol medi
    # home_elo_bonus: punti ELO extra per giocare in casa (default 60)
    "SA":  {"draw_bias": +0.04, "home_bias": +0.02, "goals_factor": 0.95, "home_elo_bonus": 65},
    "PL":  {"draw_bias": -0.02, "home_bias": +0.00, "goals_factor": 1.10, "home_elo_bonus": 55},
    "PD":  {"draw_bias": +0.02, "home_bias": +0.03, "goals_factor": 1.00, "home_elo_bonus": 60},
    "BL1": {"draw_bias": -0.03, "home_bias": +0.01, "goals_factor": 1.15, "home_elo_bonus": 55},
    "FL1": {"draw_bias": +0.01, "home_bias": +0.02, "goals_factor": 1.05, "home_elo_bonus": 60},
    "CL":  {"draw_bias": -0.02, "home_bias": -0.01, "goals_factor": 1.05, "home_elo_bonus": 30},  # meno vantaggio casa
    "EL":  {"draw_bias": -0.01, "home_bias": -0.01, "goals_factor": 1.05, "home_elo_bonus": 35},
    "SB":  {"draw_bias": +0.05, "home_bias": +0.03, "goals_factor": 0.90, "home_elo_bonus": 70},
    "DED": {"draw_bias": -0.01, "home_bias": +0.01, "goals_factor": 1.10, "home_elo_bonus": 55},
    "PPL": {"draw_bias": +0.02, "home_bias": +0.03, "goals_factor": 0.95, "home_elo_bonus": 60},
    "ELC": {"draw_bias": +0.00, "home_bias": +0.01, "goals_factor": 1.00, "home_elo_bonus": 58},
}

def classical_predict(f):
    ep   = f["elo_win_prob"]
    fd   = f.get("form_diff", 0)
    xgd  = f.get("xg_diff", 0)
    # Trend: crisi o rimonta recente
    h_trend = f.get("h_trend", 0.0)
    a_trend = f.get("a_trend", 0.0)
    trend_adj = (h_trend - a_trend) * 0.08

    # Pesi campionato
    lp = LEAGUE_PROFILE.get(f.get("comp_code", ""), {"draw_bias": 0, "home_bias": 0, "goals_factor": 1.0})

    draw = max(0.10, 0.28 + lp["draw_bias"] - abs(f.get("elo_diff", 0)) * 0.0002)
    home = max(0.05, ep + fd * 0.1 + xgd * 0.03 + lp["home_bias"] + trend_adj - draw / 2)
    away = max(0.05, 1 - home - draw)
    n    = home + draw + away
    return {"home": home/n, "draw": draw/n, "away": away/n,
            "quantum_used": False, "goals_factor": lp["goals_factor"]}

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

# Calibrazione confidenza da history (aggiornata in main)
_CALIBRATION = {}  # {bucket: actual_accuracy} es. {"0.6": 0.58}

def calibrate_confidence(raw_conf):
    """Aggiusta la confidenza in base all'accuratezza storica reale."""
    if not _CALIBRATION:
        return raw_conf
    # Trova il bucket più vicino
    buckets = sorted(_CALIBRATION.keys())
    bucket = min(buckets, key=lambda b: abs(float(b) - raw_conf))
    actual = _CALIBRATION[bucket]
    # Blend: 70% calibrato, 30% raw
    return round(0.7 * actual + 0.3 * raw_conf, 4)

def build_calibration(history_predictions):
    """Costruisce mappa confidenza → accuratezza reale da history.json."""
    verified = [p for p in history_predictions if p.get("result") and p.get("pred_conf")]
    if len(verified) < 20:
        return {}
    buckets = {}
    for p in verified:
        b = round(round(p["pred_conf"] / 0.1) * 0.1, 1)
        key = str(b)
        if key not in buckets:
            buckets[key] = {"correct": 0, "total": 0}
        buckets[key]["total"] += 1
        if p.get("correct_1x2"):
            buckets[key]["correct"] += 1
    return {k: round(v["correct"] / max(1, v["total"]), 3)
            for k, v in buckets.items() if v["total"] >= 5}

def full_prediction(f):
    base = quantum_predict(f)
    h, d, a = base["home"], base["draw"], base["away"]
    lh = f["lambda_home"]
    la = f["lambda_away"]
    # Applica goals_factor del campionato
    gf = base.get("goals_factor", 1.0)
    lh = lh * gf
    la = la * gf
    pover = max(0.20, min(0.85,
        1 - sum(math.exp(-(lh+la)) * (lh+la)**k / math.factorial(k) for k in range(3))
    ))
    pbtts = max(0.15, min(0.82, (1 - math.exp(-lh)) * (1 - math.exp(-la))))
    ent   = -(h*math.log(max(0.001,h)) + d*math.log(max(0.001,d)) + a*math.log(max(0.001,a)))
    raw_conf = 1 - ent / math.log(3)
    # Applica penalità big match
    bmp = f.get("big_match_penalty", 0.0)
    raw_conf = max(0.01, raw_conf - bmp)
    conf = calibrate_confidence(raw_conf)
    # Fix draw prediction: se la differenza 1-2 è piccola e X è rilevante, scegli X
    gap_12 = abs(h - a)
    if d >= 0.24 and gap_12 < 0.10:
        bo = "X"
        bv = d
    elif d >= 0.27 and gap_12 < 0.15:
        bo = "X"
        bv = d
    else:
        bv = max(h, d, a)
        bo = "1" if bv == h else ("2" if bv == a else "X")
    return {**base,
            "dc_1x": h+d, "dc_x2": d+a, "dc_12": h+a,
            "over_25": pover, "under_25": 1-pover,
            "btts_y": pbtts, "btts_n": 1-pbtts,
            "xg_home": round(lh, 2), "xg_away": round(la, 2),
            "confidence": conf, "raw_confidence": round(raw_conf, 4),
            "best_out": bo, "best_val": bv}

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
def send_telegram(pred, hname, aname, comp, date_str="", time_str="", rank=1):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT:
        return
    fmt  = lambda v: f"{v*100:.1f}%"
    odd  = lambda v: f"@{1/max(0.001,v):.2f}"
    icon = "🔥" if pred["confidence"] > 0.75 else "✅" if pred["confidence"] > 0.55 else "⚠️"
    medal = "🥇" if rank == 1 else "🥈" if rank == 2 else "🥉" if rank == 3 else f"#{rank}"
    when  = f"{date_str} {time_str}".strip() or datetime.now().strftime("%d/%m/%Y")
    msg  = (
        f"⚽ *QUANTUM FOOTBALL AI* ⚛️\n"
        f"━━━━━━━━━━━━━━━━━\n"
        f"{medal} Top {rank} per confidenza\n"
        f"🏆 {comp}\n"
        f"📅 {when}\n"
        f"🏠 *{hname}* vs *{aname}* ✈️\n\n"
        f"1:{fmt(pred['home'])} {odd(pred['home'])}  "
        f"X:{fmt(pred['draw'])} {odd(pred['draw'])}  "
        f"2:{fmt(pred['away'])} {odd(pred['away'])}\n"
        f"Over2.5:{fmt(pred['over_25'])} · BTTS:{fmt(pred['btts_y'])}\n"
        f"xG: {pred['xg_home']}—{pred['xg_away']}\n"
        f"Conf:{fmt(pred['confidence'])} {icon}\n"
        f"_Generato: {datetime.now().strftime('%d/%m/%Y %H:%M')}_"
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

def send_email(pred, hname, aname, comp, date_str="", time_str="", rank=1):
    if not all([SMTP_USER, SMTP_PASS, SMTP_TO]):
        return
    fmt  = lambda v: f"{v*100:.1f}%"
    odd  = lambda v: f"@{1/max(0.001,v):.2f}"
    medal = "🥇" if rank == 1 else "🥈" if rank == 2 else "🥉" if rank == 3 else f"#{rank}"
    when  = f"{date_str} {time_str}".strip() or datetime.now().strftime("%d/%m/%Y")
    rows = [
        (f"1 {hname}", pred["home"]), ("X Pareggio", pred["draw"]),
        (f"2 {aname}",  pred["away"]),  ("Over 2.5",   pred["over_25"]),
        ("BTTS Sì",     pred["btts_y"]),
    ]
    trs = "\n".join(
        f"<tr><td style='padding:8px 12px'>{l}</td>"
        f"<td style='text-align:center;font-weight:bold'>{fmt(v)}</td>"
        f"<td style='text-align:center;color:#888'>{odd(v)}</td></tr>"
        for l, v in rows
    )
    html = f"""<html><body style="font-family:monospace;background:#050911;color:#fff;padding:24px">
<h2 style="color:#22d3ee">⚽ QUANTUM FOOTBALL AI ⚛️</h2>
<p style="color:#f59e0b">{medal} Top {rank} per confidenza</p>
<p style="color:#888">🏆 {comp} · 📅 {when}</p>
<h3><span style="color:#22d3ee">{hname}</span> <span style="color:#f59e0b">vs</span> <span style="color:#f472b6">{aname}</span></h3>
<p>xG: <b style="color:#22d3ee">{pred['xg_home']}</b> — <b style="color:#f472b6">{pred['xg_away']}</b>
&nbsp;·&nbsp; Conf: <b style="color:#34d399">{fmt(pred['confidence'])}</b></p>
<table style="width:100%;border-collapse:collapse;background:#0d1526">
<tr><th style="padding:10px;color:#22d3ee;text-align:left">Mercato</th>
<th style="padding:10px;color:#22d3ee">Prob.</th>
<th style="padding:10px;color:#22d3ee">Quota</th></tr>
{trs}
</table>
<p style="color:#555;font-size:11px;margin-top:20px">⚛️ Generato: {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
</body></html>"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"{medal} {hname} vs {aname} | {comp} | {when} | Quantum AI"
    msg["From"]    = SMTP_USER
    msg["To"]      = SMTP_TO
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SMTP_USER, SMTP_TO, msg.as_string())
        print(f"   ✅ Email → {hname} vs {aname}")
    except Exception as e:
        print(f"   ❌ Email error: {e}")


# ═══════════════════════════════════════
#  HISTORY DATABASE
# ═══════════════════════════════════════
HISTORY_FILE = "history.json"

def load_history():
    try:
        with open(HISTORY_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"predictions": [], "last_updated": ""}

def save_history(h):
    with open(HISTORY_FILE, "w") as f:
        json.dump(h, f, indent=2, default=str)

def record_predictions(all_preds, history):
    """Salva le nuove previsioni nel database storico."""
    existing_ids = {p["fixture_id"] for p in history["predictions"]}
    added = 0
    for p in all_preds:
        fid = str(p["fixture_id"])
        if fid not in existing_ids:
            pred = p["prediction"]
            history["predictions"].append({
                "fixture_id":  fid,
                "home":        p["home"],
                "away":        p["away"],
                "league":      p["league"],
                "comp_code":   p.get("comp_code", ""),
                "season":      p.get("season", ""),
                "stage":       p.get("stage", ""),
                "matchday":    p.get("matchday", None),
                "first_leg":   p.get("first_leg", None),
                "date":        p.get("date", ""),
                "time":        p.get("time", ""),
                "predicted_at":p["generated_at"],
                # previsioni
                "pred_home":   round(pred.get("home",   0.33), 4),
                "pred_draw":   round(pred.get("draw",   0.33), 4),
                "pred_away":   round(pred.get("away",   0.33), 4),
                "pred_over25": round(pred.get("over_25",0.50), 4),
                "pred_btts":   round(pred.get("btts_y", 0.50), 4),
                "pred_best":   pred.get("best_out", "1"),
                "pred_conf":   round(pred.get("confidence", 0.50), 4),
                "pred_raw_conf": round(pred.get("raw_confidence", pred.get("confidence", 0.50)), 4),
                # risultato reale — da compilare dopo
                "result":      None,   # "1", "X", "2"
                "goals_home":  None,
                "goals_away":  None,
                "correct_1x2": None,   # True/False
                "correct_over":None,
                "correct_btts":None,
                "verified_at": None,
            })
            added += 1
    history["last_updated"] = datetime.now().isoformat()
    return added

def verify_results(history, fetcher, competitions):
    """Controlla i risultati reali delle partite previste non ancora verificate."""
    pending = [p for p in history["predictions"]
               if p["result"] is None and p.get("date")]
    if not pending:
        return 0

    # Raggruppa per campionato
    by_league = {}
    for p in pending:
        league = p["league"]
        if league not in by_league:
            by_league[league] = []
        by_league[league].append(p)

    verified = 0
    comp_map = {v: k for k, v in competitions.items()}

    for league_name, preds in by_league.items():
        comp_code = competitions.get(league_name)
        if not comp_code:
            continue
        try:
            results = fetcher.get_past_results(comp_code, limit=20)
            result_map = {}
            for r in results:
                fid  = str(r["id"])
                sc   = r.get("score", {}).get("fullTime", {})
                gh   = sc.get("home")
                ga   = sc.get("away")
                if gh is not None and ga is not None:
                    result_map[fid] = (gh, ga)

            for p in preds:
                fid = str(p["fixture_id"])
                if fid in result_map:
                    gh, ga = result_map[fid]
                    outcome = "1" if gh > ga else ("2" if ga > gh else "X")
                    actual_over = (gh + ga) > 2
                    actual_btts = gh > 0 and ga > 0

                    p["result"]      = outcome
                    p["goals_home"]  = gh
                    p["goals_away"]  = ga
                    p["correct_1x2"] = (p["pred_best"] == outcome)
                    p["correct_over"]= (p["pred_over25"] > 0.5) == actual_over
                    p["correct_btts"]= (p["pred_btts"]  > 0.5) == actual_btts
                    p["verified_at"] = datetime.now().isoformat()
                    verified += 1
                    status = "✅" if p["correct_1x2"] else "❌"
                    print(f"   {status} {p['home']} vs {p['away']}: "
                          f"previsto {p['pred_best']}, reale {outcome} ({gh}-{ga})")
        except Exception as e:
            print(f"   ⚠️  verify {league_name}: {e}")

    return verified

def calc_stats(predictions, days=7, season=None, comp_code=None):
    """Calcola statistiche sulle previsioni verificate degli ultimi N giorni."""
    cutoff = datetime.now() - timedelta(days=days)
    recent = [p for p in predictions
              if p.get("verified_at") and
              datetime.fromisoformat(p["verified_at"]) >= cutoff]
    # Filtro opzionale per stagione e campionato
    if season:
        recent = [p for p in recent if p.get("season") == season]
    if comp_code:
        recent = [p for p in recent if p.get("comp_code") == comp_code]

    if not recent:
        return None

    total   = len(recent)
    c1x2    = sum(1 for p in recent if p.get("correct_1x2"))
    cover   = sum(1 for p in recent if p.get("correct_over"))
    cbtts   = sum(1 for p in recent if p.get("correct_btts"))

    # Per campionato
    by_league = {}
    for p in recent:
        lg = p["league"]
        if lg not in by_league:
            by_league[lg] = {"total": 0, "correct": 0}
        by_league[lg]["total"]  += 1
        by_league[lg]["correct"] += int(bool(p.get("correct_1x2")))

    # Top confidence accuracy — soglia 0.25 (realistico per il nostro modello)
    high_conf = [p for p in recent if p.get("pred_conf", 0) >= 0.25]
    hc_acc = sum(1 for p in high_conf if p.get("correct_1x2")) / max(1, len(high_conf))

    return {
        "total":      total,
        "acc_1x2":    c1x2 / total,
        "acc_over":   cover / total,
        "acc_btts":   cbtts / total,
        "by_league":  by_league,
        "high_conf":  {"total": len(high_conf), "acc": hc_acc},
    }

def send_weekly_report(history):
    """Invia report settimanale ogni domenica."""
    today = datetime.now().weekday()  # 6 = domenica
    if today != 6:
        return

    month = datetime.now().month
    year  = datetime.now().year
    current_season = f"{year-1}/{year}" if month < 7 else f"{year}/{year+1}"
    stats = calc_stats(history["predictions"], days=7, season=current_season)
    if not stats:  # fallback senza filtro stagione
        stats = calc_stats(history["predictions"], days=7)

    # Statistiche per campionato (stagione corrente, tutti i giorni)
    from collections import defaultdict
    league_stats = defaultdict(lambda: {"total":0,"correct_1x2":0,"correct_over":0})
    for p in history["predictions"]:
        if p.get("result") is None: continue
        if p.get("season") and p["season"] != current_season: continue
        lg = p.get("league","?")
        league_stats[lg]["total"] += 1
        if p.get("correct_1x2"): league_stats[lg]["correct_1x2"] += 1
        if p.get("correct_over"): league_stats[lg]["correct_over"] += 1
    if not stats:
        print("   ℹ️  Nessun dato verificato per il report settimanale")
        return

    fmt = lambda v: f"{v*100:.1f}%"
    total_stored = len(history["predictions"])
    total_verified = sum(1 for p in history["predictions"] if p.get("result"))

    # Telegram
    if TELEGRAM_TOKEN and TELEGRAM_CHAT:
        lines = [
            "📊 *REPORT SETTIMANALE — QUANTUM FOOTBALL AI*",
            f"━━━━━━━━━━━━━━━━━",
            f"📅 Settimana al {datetime.now().strftime('%d/%m/%Y')}",
            f"",
            f"🎯 *Accuratezza 1X2:* {fmt(stats['acc_1x2'])} ({stats['total']} partite)",
            f"⚽ *Over 2.5:* {fmt(stats['acc_over'])}",
            f"🔁 *BTTS:* {fmt(stats['acc_btts'])}",
            f"🔥 *Alta conf (>60%):* {fmt(stats['high_conf']['acc'])} su {stats['high_conf']['total']} partite",
            f"",
            f"📈 *Per campionato:*",
        ]
        for lg, s in sorted(stats["by_league"].items(),
                            key=lambda x: x[1]["correct"]/max(1,x[1]["total"]), reverse=True):
            acc = s["correct"] / max(1, s["total"])
            lines.append(f"  {lg}: {fmt(acc)} ({s['correct']}/{s['total']})")
        lines += [
            f"",
            f"💾 Database: {total_verified}/{total_stored} partite verificate",
        ]
        try:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT, "text": "\n".join(lines),
                      "parse_mode": "Markdown", "disable_web_page_preview": True},
                timeout=10
            )
            print("   ✅ Report settimanale Telegram inviato")
        except Exception as e:
            print(f"   ❌ Report Telegram error: {e}")

    # Email
    if all([SMTP_USER, SMTP_PASS, SMTP_TO]):
        league_rows = "".join(
            f"<tr><td style='padding:6px 12px'>{lg}</td>"
            f"<td style='text-align:center'>{fmt(s['correct']/max(1,s['total']))}</td>"
            f"<td style='text-align:center;color:#888'>{s['correct']}/{s['total']}</td></tr>"
            for lg, s in sorted(stats["by_league"].items(),
                                key=lambda x: x[1]["correct"]/max(1,x[1]["total"]), reverse=True)
        )
        html = f"""<html><body style="font-family:monospace;background:#050911;color:#fff;padding:24px">
<h2 style="color:#22d3ee">📊 Report Settimanale — Quantum Football AI</h2>
<p style="color:#888">Settimana al {datetime.now().strftime('%d/%m/%Y')} · {stats['total']} partite analizzate</p>
<table style="width:100%;border-collapse:collapse;background:#0d1526;margin-bottom:20px">
<tr><th style="padding:10px;color:#22d3ee;text-align:left">Metrica</th><th style="padding:10px;color:#22d3ee">Accuratezza</th></tr>
<tr><td style="padding:8px 12px">🎯 1X2</td><td style="text-align:center;font-weight:bold;color:#34d399">{fmt(stats['acc_1x2'])}</td></tr>
<tr><td style="padding:8px 12px">⚽ Over 2.5</td><td style="text-align:center;font-weight:bold">{fmt(stats['acc_over'])}</td></tr>
<tr><td style="padding:8px 12px">🔁 BTTS</td><td style="text-align:center;font-weight:bold">{fmt(stats['acc_btts'])}</td></tr>
<tr><td style="padding:8px 12px">🔥 Alta confidenza (&gt;60%)</td><td style="text-align:center;font-weight:bold;color:#f59e0b">{fmt(stats['high_conf']['acc'])} ({stats['high_conf']['total']} partite)</td></tr>
</table>
<h3 style="color:#a78bfa">Per campionato</h3>
<table style="width:100%;border-collapse:collapse;background:#0d1526">
<tr><th style="padding:10px;color:#22d3ee;text-align:left">Campionato</th><th style="padding:10px;color:#22d3ee">Acc.</th><th style="padding:10px;color:#22d3ee">Partite</th></tr>
{league_rows}
</table>
<p style="color:#555;font-size:11px;margin-top:20px">💾 Database: {total_verified}/{total_stored} partite verificate · ⚛️ Quantum Football AI</p>
</body></html>"""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"📊 Report Settimanale Quantum Football AI — {datetime.now().strftime('%d/%m/%Y')}"
        msg["From"]    = SMTP_USER
        msg["To"]      = SMTP_TO
        msg.attach(MIMEText(html, "html"))
        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASS)
                s.sendmail(SMTP_USER, SMTP_TO, msg.as_string())
            print("   ✅ Report settimanale Email inviato")
        except Exception as e:
            print(f"   ❌ Report Email error: {e}")

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

    # ── ELO DINAMICO ────────────────────────────────────────
    dynamic_elo = load_dynamic_elo()
    print(f"   📊 ELO dinamico: {len(dynamic_elo)} squadre in database")

    # ── CALIBRAZIONE CONFIDENZA ──────────────────────────────
    global _CALIBRATION
    try:
        _hist_temp = load_history()
        _CALIBRATION = build_calibration(_hist_temp["predictions"])
        if _CALIBRATION:
            print(f"   🎯 Calibrazione confidenza: {len(_CALIBRATION)} bucket da history")
        else:
            print(f"   🎯 Calibrazione: non ancora disponibile (servono >20 partite verificate)")
    except Exception as e:
        print(f"   ⚠️  Calibrazione error: {e}")

    for league_name, comp_code in COMPETITIONS.items():
        print(f"\n📅 {league_name} ({comp_code})")
        matches = fetcher.get_fixtures(comp_code)

        if not matches:
            print(f"   ℹ️  Nessuna partita nei prossimi 3 giorni")
            continue

        # ── FORM REALE + STANDINGS per campionato ───────────
        form_map = {}
        past_results = []
        standings = {}
        try:
            form_map, past_results = fetcher.get_team_form(comp_code, last_n=30)
            if form_map:
                print(f"   📈 Form reale: {len(form_map)} squadre · {len(past_results)} risultati storici")
        except Exception as e:
            print(f"   ⚠️  Form non disponibile: {e}")
        try:
            standings = fetcher.get_standings(comp_code)
            if standings:
                print(f"   🏆 Classifica: {len(standings)} squadre")
        except Exception as e:
            print(f"   ⚠️  Classifica non disponibile: {e}")

        # ── RISULTATI ANDATA per coppe (knockout) ───────────
        first_leg_map = {}
        knockout_comps = {"CL", "EL", "ECL"}  # coppe europee con doppia sfida
        if comp_code in knockout_comps:
            try:
                first_leg_map = fetcher.get_first_leg_scores(comp_code)
                if first_leg_map:
                    print(f"   🔄 Andate disponibili: {len(first_leg_map)} partite")
            except Exception as e:
                print(f"   ⚠️  Andate non disponibili: {e}")

        # ── STAGIONE corrente ────────────────────────────────
        month = datetime.now().month
        year  = datetime.now().year
        season = f"{year-1}/{year}" if month < 7 else f"{year}/{year+1}"

        for match in matches[:10]:
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

                # H2H dai risultati già scaricati — nessuna chiamata API aggiuntiva
                h2h = fetcher.get_h2h_from_results(hname, aname, past_results, limit=10)

                # Risultato andata (per coppe)
                first_leg = first_leg_map.get((aname, hname)) or first_leg_map.get((hname, aname))

                feat = extract_features(hname, aname, form_map=form_map,
                                       dynamic_elo=dynamic_elo, h2h=h2h,
                                       standings=standings, comp_code=comp_code,
                                       first_leg=first_leg)
                pred = full_prediction(feat)
                src_h = feat.get("src_home", "ELO")
                src_a = feat.get("src_away", "ELO")
                h_fat = feat.get("h_fatigue_days", 99)
                a_fat = feat.get("a_fatigue_days", 99)
                fl    = feat.get("first_leg", {})
                flags = []
                if src_h == "API" or src_a == "API": flags.append("📡API")
                if h2h and h2h.get("matches", 0) > 0: flags.append(f"H2H:{h2h['matches']}")
                if h_fat < 4: flags.append(f"⚡H:{h_fat}gg")
                if a_fat < 4: flags.append(f"⚡A:{a_fat}gg")
                if fl: flags.append(f"🔄Andata:{fl.get('gh1',0)}-{fl.get('ga1',0)}")
                if feat.get("big_match_penalty", 0) > 0: flags.append("🔥BigMatch")
                if flags:
                    print(f"      {' '.join(flags)}")

                print(f"      1:{pred['home']:.1%} X:{pred['draw']:.1%} 2:{pred['away']:.1%} "
                      f"O2.5:{pred['over_25']:.1%} Conf:{pred['confidence']:.1%}")

                all_preds.append({
                    "league":       league_name,
                    "comp_code":    comp_code,
                    "season":       season,
                    "fixture_id":   fid,
                    "home":         hname,
                    "away":         aname,
                    "date":         date_str,
                    "time":         time_str,
                    "stage":        match.get("stage", ""),
                    "matchday":     match.get("matchday", None),
                    "first_leg":    fl if fl else None,
                    "prediction":   pred,
                    "generated_at": datetime.now().isoformat()
                })

                # alert inviato dopo ranking (vedi sotto)

            except Exception as e:
                print(f"   ❌ Errore: {e}")
                traceback.print_exc()

    # ── BACKTESTING ─────────────────────────────────────────
    print("\n🔄 Auto-adattamento...")
    adapted = 0
    for league_name, comp_code in COMPETITIONS.items():  # tutti i campionati
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
                feat   = extract_features(hname, aname, dynamic_elo=dynamic_elo)
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

    # ── TOP 10 ALERT ────────────────────────────────────────
    # Solo previsioni con confidenza > 25% — qualità sopra quantità
    CONF_MIN_ALERT = 0.25
    filtered_alert = [p for p in all_preds if p["prediction"].get("confidence", 0) >= CONF_MIN_ALERT]
    top10 = sorted(filtered_alert, key=lambda x: x["prediction"].get("confidence", 0), reverse=True)[:10]
    if not top10:
        # Fallback: top 5 qualunque confidenza
        top10 = sorted(all_preds, key=lambda x: x["prediction"].get("confidence", 0), reverse=True)[:5]
        print(f"\n📢 Nessuna previsione con conf>{CONF_MIN_ALERT:.0%} — invio top 5 ({top10[0]['prediction'].get('confidence',0):.1%} max)")
    else:
        print(f"\n📢 {len(filtered_alert)} previsioni conf>{CONF_MIN_ALERT:.0%} → invio top {len(top10)}")
    # Invia prima messaggio riepilogativo
    if TELEGRAM_TOKEN and TELEGRAM_CHAT:
        fmt = lambda v: f"{v*100:.1f}%"
        lines = ["⚽ *QUANTUM FOOTBALL AI — TOP 10* ⚛️", "━━━━━━━━━━━━━━━━━"]
        for i, p in enumerate(top10, 1):
            pred = p["prediction"]
            medal = "🥇" if i==1 else "🥈" if i==2 else "🥉" if i==3 else f"#{i}"
            when = f"{p.get('date','')} {p.get('time','')}".strip()
            bo = pred.get("best_out","1")
            bv = pred.get("best_val",0)
            lines.append(f"{medal} {p['home']} vs {p['away']}")
            lines.append(f"   📅{when} · {p['league']}")
            lines.append(f"   Esito:{bo} {fmt(bv)} · Conf:{fmt(pred.get('confidence',0))}")
        try:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT, "text": "\n".join(lines),
                      "parse_mode": "Markdown", "disable_web_page_preview": True},
                timeout=10
            )
            print("   ✅ Riepilogo Top 10 inviato")
        except Exception as e:
            print(f"   ❌ Riepilogo error: {e}")
    # Invia dettaglio Telegram per ognuna
    for i, p in enumerate(top10, 1):
        pred = p["prediction"]
        send_telegram(pred, p["home"], p["away"], p["league"],
                      p.get("date",""), p.get("time",""), rank=i)

    # Invia UN'UNICA email riepilogativa con tutte le Top 10
    if all([SMTP_USER, SMTP_PASS, SMTP_TO]):
        fmt = lambda v: f"{v*100:.1f}%"
        odd = lambda v: f"@{1/max(0.001,v):.2f}"
        rows = ""
        for i, p in enumerate(top10, 1):
            pred = p["prediction"]
            medal = "🥇" if i==1 else "🥈" if i==2 else "🥉" if i==3 else f"#{i}"
            when  = f"{p.get('date','')} {p.get('time','')}".strip()
            bo    = pred.get("best_out","1")
            bname = {"1": p["home"], "X": "Pareggio", "2": p["away"]}.get(bo, bo)
            conf  = pred.get("confidence", 0)
            conf_color = "#34d399" if conf > 0.70 else "#f59e0b" if conf > 0.55 else "#f87171"
            rows += f"""
            <tr style="border-bottom:1px solid #1a2035">
              <td style="padding:10px 12px;color:#f59e0b;font-size:16px">{medal}</td>
              <td style="padding:10px 12px">
                <span style="color:#22d3ee;font-weight:bold">{p['home']}</span>
                <span style="color:#555;margin:0 6px">vs</span>
                <span style="color:#f472b6;font-weight:bold">{p['away']}</span><br>
                <span style="color:#555;font-size:11px">🏆 {p['league']} · 📅 {when}</span>
              </td>
              <td style="padding:10px 8px;text-align:center">
                <span style="color:#22d3ee">{fmt(pred.get('home',0))}</span><br>
                <span style="color:#555;font-size:10px">{odd(pred.get('home',0))}</span>
              </td>
              <td style="padding:10px 8px;text-align:center">
                <span style="color:#f59e0b">{fmt(pred.get('draw',0))}</span><br>
                <span style="color:#555;font-size:10px">{odd(pred.get('draw',0))}</span>
              </td>
              <td style="padding:10px 8px;text-align:center">
                <span style="color:#f472b6">{fmt(pred.get('away',0))}</span><br>
                <span style="color:#555;font-size:10px">{odd(pred.get('away',0))}</span>
              </td>
              <td style="padding:10px 8px;text-align:center;color:#f97316">{fmt(pred.get('over_25',0))}</td>
              <td style="padding:10px 8px;text-align:center;color:#34d399">{fmt(pred.get('btts_y',0))}</td>
              <td style="padding:10px 8px;text-align:center;font-weight:bold;color:{conf_color}">{fmt(conf)}</td>
            </tr>"""

        html = f"""<html><body style="font-family:monospace;background:#050911;color:#fff;padding:24px;margin:0">
<h2 style="color:#22d3ee;letter-spacing:3px">⚛️⚽ QUANTUM FOOTBALL AI</h2>
<p style="color:#888">📅 {datetime.now().strftime('%d/%m/%Y %H:%M')} · Top 10 previsioni per confidenza</p>
<table style="width:100%;border-collapse:collapse;background:#0d1526;border-radius:12px;overflow:hidden">
  <thead>
    <tr style="background:#0a1a30">
      <th style="padding:10px 12px;color:#22d3ee;text-align:left">#</th>
      <th style="padding:10px 12px;color:#22d3ee;text-align:left">Partita</th>
      <th style="padding:10px 8px;color:#22d3ee;text-align:center">1</th>
      <th style="padding:10px 8px;color:#22d3ee;text-align:center">X</th>
      <th style="padding:10px 8px;color:#22d3ee;text-align:center">2</th>
      <th style="padding:10px 8px;color:#f97316;text-align:center">O2.5</th>
      <th style="padding:10px 8px;color:#34d399;text-align:center">BTTS</th>
      <th style="padding:10px 8px;color:#a78bfa;text-align:center">Conf</th>
    </tr>
  </thead>
  <tbody>{rows}</tbody>
</table>
<p style="color:#555;font-size:11px;margin-top:20px">⚛️ IBM Quantum · Auto-Adaptive · GitHub Actions</p>
</body></html>"""

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"⚽ Top 10 Previsioni Quantum — {datetime.now().strftime('%d/%m/%Y')}"
        msg["From"]    = SMTP_USER
        msg["To"]      = SMTP_TO
        msg.attach(MIMEText(html, "html"))
        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASS)
                s.sendmail(SMTP_USER, SMTP_TO, msg.as_string())
            print("   ✅ Email riepilogativa Top 10 inviata")
        except Exception as e:
            print(f"   ❌ Email error: {e}")

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
    save_dynamic_elo(dynamic_elo)
    print(f"✅ ELO dinamico → elo_ratings.json ({len(dynamic_elo)} squadre)")

    # ── HISTORY DATABASE ────────────────────────────────────
    print("\n📚 Aggiornamento database storico...")
    history = load_history()

    # 0. Aggiorna ELO dinamico dai nuovi risultati verificati
    elo_updates = update_elo_ratings(history, dynamic_elo)
    if elo_updates > 0:
        save_dynamic_elo(dynamic_elo)
        print(f"   ⚡ ELO dinamico aggiornato: {elo_updates} partite · {len(dynamic_elo)} squadre")

    # 1. Verifica risultati partite precedenti
    print("   🔍 Verifica risultati partite precedenti...")
    verified = verify_results(history, fetcher, COMPETITIONS)
    print(f"   ✅ {verified} risultati verificati")

    # 2. Registra nuove previsioni
    added = record_predictions(all_preds, history)
    print(f"   ✅ {added} nuove previsioni registrate")

    # 3. Salva database
    save_history(history)
    total_db = len(history["predictions"])
    total_ver = sum(1 for p in history["predictions"] if p.get("result"))
    print(f"   💾 Database: {total_ver} verificate / {total_db} totali")

    # 4. Stats rapide
    month = datetime.now().month
    year  = datetime.now().year
    current_season = f"{year-1}/{year}" if month < 7 else f"{year}/{year+1}"
    stats = calc_stats(history["predictions"], days=7, season=current_season)
    if not stats:  # fallback senza filtro stagione
        stats = calc_stats(history["predictions"], days=7)

    # Statistiche per campionato (stagione corrente, tutti i giorni)
    from collections import defaultdict
    league_stats = defaultdict(lambda: {"total":0,"correct_1x2":0,"correct_over":0})
    for p in history["predictions"]:
        if p.get("result") is None: continue
        if p.get("season") and p["season"] != current_season: continue
        lg = p.get("league","?")
        league_stats[lg]["total"] += 1
        if p.get("correct_1x2"): league_stats[lg]["correct_1x2"] += 1
        if p.get("correct_over"): league_stats[lg]["correct_over"] += 1
    if stats and stats["total"] > 0:
        print(f"   📊 Accuracy 7gg: 1X2={stats['acc_1x2']*100:.1f}% "
              f"Over={stats['acc_over']*100:.1f}% BTTS={stats['acc_btts']*100:.1f}%")

    # 5. Report settimanale (solo domenica)
    if datetime.now().weekday() == 6:
        print("   📬 Domenica — invio report settimanale...")
        send_weekly_report(history)

    print("✅ Pipeline completata!")


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERRORE FATALE: {e}")
        traceback.print_exc()
        sys.exit(1)
