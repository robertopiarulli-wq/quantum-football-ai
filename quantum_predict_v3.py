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
ODDS_API_KEY      = os.getenv("ODDS_API_KEY", "")
SUPABASE_URL      = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY      = os.getenv("SUPABASE_KEY", "")
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
                # PP Index raw data — ultime 5 partite casa/trasferta
                "last3_home_results": s["home_results"][-5:],
                "last3_home_gf":      s["home_gf"][-5:],
                "last3_home_gc":      s["home_gc"][-5:],
                "last3_away_results": s["away_results"][-5:],
                "last3_away_gf":      s["away_gf"][-5:],
                "last3_away_gc":      s["away_gc"][-5:],
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
#  ODDS API — The Odds API (the-odds-api.com)
#  Scarica quote Pinnacle + Bet365 per calcolo OV Score
# ═══════════════════════════════════════

# Mappa campionati football-data.org → sport_key The Odds API
ODDS_SPORT_MAP = {
    "SA":  "soccer_italy_serie_a",
    "PL":  "soccer_epl",
    "PD":  "soccer_spain_la_liga",
    "BL1": "soccer_germany_bundesliga",
    "FL1": "soccer_france_ligue_one",
    "CL":  "soccer_uefa_champs_league",
    "DED": "soccer_netherlands_eredivisie",
    "PPL": "soccer_portugal_primeira_liga",
    "ELC": "soccer_england_efl_champ",
}

def fetch_odds(comp_code, api_key):
    """Scarica quote h2h (1X2) da Pinnacle e Bet365 per un campionato."""
    if not api_key:
        return {}
    sport = ODDS_SPORT_MAP.get(comp_code)
    if not sport:
        return {}
    try:
        time.sleep(2)
        r = requests.get(
            f"https://api.the-odds-api.com/v4/sports/{sport}/odds",
            params={
                "apiKey":   api_key,
                "regions":  "eu,uk",
                "markets":  "h2h",
                "oddsFormat": "decimal",
                "bookmakers": "pinnacle,bet365",
            },
            timeout=15
        )
        remaining = r.headers.get("x-requests-remaining", "?")
        if r.status_code == 200:
            print(f"   💰 Odds API: {len(r.json())} partite · {remaining} req rimanenti")
            return parse_odds(r.json())
        elif r.status_code == 422:
            return {}  # Sport non disponibile
        else:
            print(f"   ⚠️  Odds API {comp_code}: {r.status_code}")
            return {}
    except Exception as e:
        print(f"   ⚠️  Odds API error: {e}")
        return {}

def parse_odds(odds_data):
    """
    Converte risposta Odds API in mappa:
    {(home_team, away_team): {pinnacle: {1,X,2}, bet365: {1,X,2}}}
    """
    result = {}
    # Debug: mostra bookmakers disponibili nel primo game
    if odds_data:
        books_found = [b["key"] for b in odds_data[0].get("bookmakers", [])]
        print(f"   📊 Bookmakers disponibili: {books_found}")
    for game in odds_data:
        home = game.get("home_team", "")
        away = game.get("away_team", "")
        key = (home, away)
        result[key] = {"pinnacle": {}, "bet365": {}, "commence_time": game.get("commence_time","")}
        for book in game.get("bookmakers", []):
            bk = book["key"]
            if bk not in ("pinnacle", "bet365"):
                continue
            for market in book.get("markets", []):
                if market["key"] != "h2h":
                    continue
                for outcome in market.get("outcomes", []):
                    name = outcome["name"]
                    price = outcome["price"]
                    if name == home:
                        result[key][bk]["1"] = price
                    elif name == away:
                        result[key][bk]["2"] = price
                    else:
                        result[key][bk]["X"] = price
    return result

def match_odds_key(hname, aname, odds_map):
    """Trova la partita nella mappa odds con fuzzy match sui nomi squadra."""
    # Exact match
    if (hname, aname) in odds_map:
        return odds_map[(hname, aname)]
    # Fuzzy: cerca substring nei nomi
    hn = hname.lower().split()[:2]
    an = aname.lower().split()[:2]
    for (oh, oa), data in odds_map.items():
        oh_l = oh.lower()
        oa_l = oa.lower()
        if any(w in oh_l for w in hn) and any(w in oa_l for w in an):
            return data
    return None

def calc_no_vig(pin):
    """
    Rimuove il vig da Pinnacle e calcola le probabilità vere di mercato.
    Pinnacle ha margine ~2% — le prob no-vig sono le più accurate disponibili.
    """
    o1 = pin.get("1")
    oX = pin.get("X")
    o2 = pin.get("2")
    if not (o1 and oX and o2 and o1>0 and oX>0 and o2>0):
        return {}
    overround = 1/o1 + 1/oX + 1/o2
    return {
        "1": round((1/o1) / overround, 4),
        "X": round((1/oX) / overround, 4),
        "2": round((1/o2) / overround, 4),
        "overround": round(overround, 4),
        "vig_pct": round((overround - 1) * 100, 2),
    }

def calc_ov_score(pred, odds_data, best_out, movement=None):
    """
    OV Score (0-100) basato su Pinnacle no-vig + movimento storico.

    1. Value vs Pinnacle no-vig (40%)
       Nostra prob > prob vera di mercato → value reale

    2. Coerenza modello-Pinnacle (30%)
       Il nostro best_out concorda con il favorito Pinnacle no-vig?

    3. Sharp movement da Supabase (20%)
       Quota Pinnacle scende = denaro smart in entrata

    4. Liquidità mercato (10%)
       Vig basso = mercato liquido e affidabile
    """
    if not odds_data:
        return None, {}

    pin = odds_data.get("pinnacle", {})
    if not pin or not pin.get("1"):
        return None, {}

    # Calcola no-vig Pinnacle
    no_vig = calc_no_vig(pin)
    if not no_vig:
        return None, {}

    details = {
        "pinnacle_1": pin.get("1"),
        "pinnacle_X": pin.get("X"),
        "pinnacle_2": pin.get("2"),
        "novig_1": round(no_vig["1"]*100, 1),
        "novig_X": round(no_vig["X"]*100, 1),
        "novig_2": round(no_vig["2"]*100, 1),
        "vig_pct": no_vig.get("vig_pct"),
    }

    # Mappa best_out → probabilità
    key_map = {"1": "home", "X": "draw", "2": "away"}
    our_prob = pred.get(key_map.get(best_out, "home"), 0)
    mkt_prob = no_vig.get(best_out, 0)

    # 1. Value vs Pinnacle no-vig
    value_edge = our_prob - mkt_prob
    score_value = min(1.0, max(0.0, value_edge / 0.08))  # 8% edge = score massimo
    details["our_prob"]   = round(our_prob * 100, 1)
    details["mkt_prob"]   = round(mkt_prob * 100, 1)
    details["value_edge"] = round(value_edge * 100, 1)

    # 2. Coerenza modello-Pinnacle
    # Favorito Pinnacle = segno con prob no-vig più alta
    mkt_fav = max(no_vig, key=lambda k: no_vig[k] if k in ("1","X","2") else -1)
    if mkt_fav == best_out:
        score_coherence = 1.0
    elif value_edge > 0:
        score_coherence = 0.5  # non favorito ma value positivo
    else:
        score_coherence = 0.0
    details["market_favorite"] = mkt_fav

    # 3. Sharp movement (da Supabase storico)
    score_movement = 0.0
    if movement and movement.get("snapshots", 0) >= 2:
        mv = movement.get("movement_pct", 0)
        is_sharp = movement.get("is_sharp", False)
        if is_sharp:
            score_movement = 1.0
        elif mv < -5:
            score_movement = 0.8
        elif mv < -2:
            score_movement = 0.5
        elif mv > 3:
            score_movement = 0.1  # quota sale = segnale negativo
        details["movement_pct"] = mv
        details["is_sharp"] = is_sharp
        details["snapshots"] = movement.get("snapshots")
        details["open_home"] = movement.get("open_home")

    # 4. Liquidità (vig basso = mercato liquido)
    vig = no_vig.get("vig_pct", 5)
    score_liquidity = max(0.0, min(1.0, (5 - vig) / 3))  # vig 2% = max, 5% = 0

    # Composizione finale
    ov_raw = (score_value     * 0.40 +
              score_coherence * 0.30 +
              score_movement  * 0.20 +
              score_liquidity * 0.10)

    ov_score = round(ov_raw * 100, 1)
    details["ov_score"] = ov_score
    details["components"] = {
        "value":     round(score_value * 40, 1),
        "coherence": round(score_coherence * 30, 1),
        "movement":  round(score_movement * 20, 1),
        "liquidity": round(score_liquidity * 10, 1),
    }
    return ov_score, details

# ═══════════════════════════════════════
#  SUPABASE — Storico quote per CLV e variazioni
# ═══════════════════════════════════════

def supabase_request(method, endpoint, data=None, params=None):
    """Chiamata HTTP diretta a Supabase REST API."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, headers=headers, params=params, timeout=10)
        elif method == "POST":
            r = requests.post(url, headers=headers, json=data, timeout=10)
        elif method == "PATCH":
            r = requests.patch(url, headers=headers, json=data, params=params, timeout=10)
        r.raise_for_status()
        return r.json() if r.text else []
    except Exception as e:
        print(f"   ⚠️  Supabase error: {e}")
        return None

def save_odds_to_supabase(fixture_id, home, away, league, match_date,
                           bookmaker, odd_home, odd_draw, odd_away):
    """Salva snapshot quote in Supabase — una riga per bookmaker per partita."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    # Controlla se esiste già un record per oggi
    today = datetime.now().strftime("%Y-%m-%d")
    existing = supabase_request("GET", "odds", params={
        "match_id": f"eq.{fixture_id}",
        "bookmaker": f"eq.{bookmaker}",
        "created_at": f"gte.{today}",
        "select": "id",
        "limit": "1",
    })
    if existing:
        return  # già salvato oggi

    supabase_request("POST", "odds", data={
        "match_id":  fixture_id,
        "bookmaker": bookmaker,
        "odd_home":  odd_home,
        "odd_draw":  odd_draw,
        "odd_away":  odd_away,
        "created_at": datetime.now().isoformat(),
    })

def get_odds_history(fixture_id, bookmaker="pinnacle"):
    """Recupera storico quote per una partita da Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    result = supabase_request("GET", "odds", params={
        "match_id":  f"eq.{fixture_id}",
        "bookmaker": f"eq.{bookmaker}",
        "order":     "created_at.asc",
        "select":    "odd_home,odd_draw,odd_away,created_at",
    })
    rows = result or []
    if rows:
        print(f"      📊 Supabase {bookmaker}: {len(rows)} snapshot per fixture {fixture_id}")
    return rows

def calc_odds_movement(history):
    """
    Calcola variazione quote nel tempo.
    Ritorna: {movement_pct, direction, velocity, is_sharp}
    """
    if len(history) < 2:
        return {}
    first = history[0]
    last  = history[-1]
    # Variazione % sulla quota home
    if first["odd_home"] and first["odd_home"] > 0:
        move_pct = (last["odd_home"] - first["odd_home"]) / first["odd_home"] * 100
    else:
        move_pct = 0

    # Velocità: ore tra prima e ultima rilevazione
    try:
        t1 = datetime.fromisoformat(first["created_at"])
        t2 = datetime.fromisoformat(last["created_at"])
        hours = max(0.1, (t2 - t1).total_seconds() / 3600)
        velocity = abs(move_pct) / hours  # % per ora
    except Exception:
        velocity = 0

    # Sharp signal: quota scende > 5% in < 24h
    is_sharp = (move_pct < -5 and hours < 24)

    return {
        "open_home": first["odd_home"],
        "open_draw": first["odd_draw"],
        "open_away": first["odd_away"],
        "close_home": last["odd_home"],
        "close_draw": last["odd_draw"],
        "close_away": last["odd_away"],
        "movement_pct": round(move_pct, 2),
        "velocity": round(velocity, 3),
        "hours_tracked": round(hours, 1),
        "snapshots": len(history),
        "is_sharp": is_sharp,
        "direction": "down" if move_pct < -2 else "up" if move_pct > 2 else "stable",
    }

def calc_clv(our_prob, closing_odds):
    """
    Closing Line Value: nostra prob vs quota di chiusura.
    Positivo = abbiamo anticipato il mercato.
    """
    if not closing_odds or closing_odds <= 0:
        return None
    implied = 1 / closing_odds
    clv = our_prob - implied
    return round(clv * 100, 2)  # in %

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
#  PP INDEX — Modello KPZ / Costante α⁻¹=137
#  Basato sulle ultime 3 partite (270 minuti ≈ 137×2)
#  Scala: -13.7 → +13.7 (range 27.4)
# ═══════════════════════════════════════

def calc_pp_index(results_list, gf_list, gc_list, is_home):
    """
    Calcola l'Indice PP per una squadra sulle ultime 5 partite.
    Formula: I = (Punti × 0.6) + (GF × peso_gf) - (GS × peso_gs)
    Pesi:
      Casa:       GF × 0.30,  GS × 0.15 (fragilità domestica pesa di più)
      Trasferta:  GF × 0.36,  GS × 0.10
    Scala: max teorico ≈ +13.7, min teorico ≈ -13.7 (5 partite)
    """
    if not results_list:
        return 0.0

    # Punti dalle ultime 5 partite
    points = sum(3 if r == "W" else 1 if r == "D" else 0 for r in results_list[-5:])

    # Gol fatti e subiti ultime 5
    gf = sum(gf_list[-5:]) if gf_list else 0
    gs = sum(gc_list[-5:]) if gc_list else 0

    if is_home:
        peso_gf = 0.30
        peso_gs = 0.15
    else:
        peso_gf = 0.36
        peso_gs = 0.10

    I = (points * 0.6) + (gf * peso_gf) - (gs * peso_gs)
    return round(I, 3)


def calc_pp_distance(i_casa, i_ospite):
    """
    Distanza lineare D con metodo Parisi.
    - Segni concordi: D = I_casa - I_ospite  (es. -9 e -7 → D = -2)
    - Segni discordi: D = |I_casa| + |I_ospite| con segno del positivo
      (es. casa +4, ospite -9 → D = +13; casa -9, ospite +4 → D = -13)
    La predominanza è sempre di chi ha I più alto (meno negativo o più positivo).
    """
    if (i_casa >= 0 and i_ospite >= 0) or (i_casa < 0 and i_ospite < 0):
        return round(i_casa - i_ospite, 3)
    else:
        dist = abs(i_casa) + abs(i_ospite)
        return round(dist if i_casa >= 0 else -dist, 3)


def pp_prediction(hname, aname, form_map):
    """
    Previsione PP (KPZ/Parisi) — ultime 5 partite, scala ±13.7

    Tabella decisionale (D = I_casa - I_ospite con metodo Parisi):

    |D| > 8:
      I_casa > I_ospite  → FISSA 1
      I_ospite > I_casa  → FISSA 2

    4 < |D| ≤ 8:
      → Doppia 1-2

    2 < |D| ≤ 4:
      I_casa > I_ospite  → Doppia 1X
      I_ospite > I_casa  → Doppia X2

    |D| ≤ 2:
      → FISSA X
    """
    hdata = form_map.get(hname, {})
    adata = form_map.get(aname, {})

    i_casa = calc_pp_index(
        hdata.get("last3_home_results", []),
        hdata.get("last3_home_gf", []),
        hdata.get("last3_home_gc", []),
        is_home=True
    )
    i_ospite = calc_pp_index(
        adata.get("last3_away_results", []),
        adata.get("last3_away_gf", []),
        adata.get("last3_away_gc", []),
        is_home=False
    )

    D = calc_pp_distance(i_casa, i_ospite)
    abs_D = abs(D)

    # Chi predomina — sempre chi ha I più alto
    casa_predomina = i_casa >= i_ospite

    if abs_D > 8:
        if casa_predomina:
            pp_result, pp_label = "1",  "🎯 FISSA 1"
        else:
            pp_result, pp_label = "2",  "🎯 FISSA 2"

    elif abs_D > 4:
        pp_result, pp_label = "12", "🔀 1-2"

    elif abs_D > 2:
        if casa_predomina:
            pp_result, pp_label = "1X", "🛡️ 1X"
        else:
            pp_result, pp_label = "X2", "🛡️ X2"

    else:
        pp_result, pp_label = "X",  "⚖️ FISSA X"

    return {
        "pp_i_casa":   i_casa,
        "pp_i_ospite": i_ospite,
        "pp_D":        D,
        "pp_result":   pp_result,
        "pp_label":    pp_label,
        "pp_pct":      round((D + 13.7) / 27.4 * 100, 1),
    }


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
# Accuracy storica reale del nostro modello per campionato (da history.json)
# Aggiornare periodicamente dai dati reali
# Accuracy aggiornata su 225 partite verificate — 23/03/2026
LEAGUE_ACCURACY = {
    "SA":  0.48,  # Serie A — stabile
    "PL":  0.26,  # Premier League — difficile
    "PD":  0.52,  # La Liga — buono
    "BL1": 0.44,  # Bundesliga — in miglioramento
    "FL1": 0.35,  # Ligue 1 — in calo
    "CL":  0.75,  # Champions League — eccellente
    "DED": 0.39,  # Eredivisie — in miglioramento
    "PPL": 0.31,  # Primeira Liga — in calo
    "ELC": 0.38,  # Championship
    "SB":  0.40,  # Serie B (stima)
}
LEAGUE_ACCURACY_DEFAULT = 0.41  # media globale aggiornata

# Quale metrica secondaria funziona meglio per campionato (da dati reali)
# "O" = Over/Under più affidabile, "B" = BTTS più affidabile
LEAGUE_SECONDARY = {
    "SA":  "B",   # BTTS 52% vs Over 32%
    "PL":  "O",   # Over 58% vs BTTS 42%
    "PD":  "B",   # BTTS 70% vs Over 52%
    "BL1": "B",   # BTTS 56% vs Over 36%
    "FL1": "O",   # Over 62% vs BTTS 24%
    "CL":  "O",   # Over 75% vs BTTS 50%
    "DED": "B",   # BTTS 64% vs Over 50%
    "PPL": "O",   # Over 68% vs BTTS 59%
    "ELC": "O",   # Over 50% vs BTTS 46%
    "SB":  "B",   # default
}

LEAGUE_PROFILE = {
    # draw_bias: calibrato su dati reali — SA 14%, PL 47%, PPL 41%, BL1 30%, FL1 28%
    # home_elo_bonus: vantaggio casa in punti ELO
    "SA":  {"draw_bias": -0.03, "home_bias": +0.02, "goals_factor": 0.95, "home_elo_bonus": 65},  # SA: draw rate basso 14%
    "PL":  {"draw_bias": +0.08, "home_bias": +0.00, "goals_factor": 1.10, "home_elo_bonus": 55},  # PL: draw rate alto 47%
    "PD":  {"draw_bias": +0.03, "home_bias": +0.03, "goals_factor": 1.00, "home_elo_bonus": 60},  # PD: 32%
    "BL1": {"draw_bias": +0.04, "home_bias": +0.01, "goals_factor": 1.15, "home_elo_bonus": 55},  # BL1: 30%
    "FL1": {"draw_bias": +0.03, "home_bias": +0.02, "goals_factor": 1.05, "home_elo_bonus": 60},  # FL1: 28%
    "CL":  {"draw_bias": -0.03, "home_bias": -0.01, "goals_factor": 1.05, "home_elo_bonus": 30},  # CL: 12%
    "EL":  {"draw_bias": -0.01, "home_bias": -0.01, "goals_factor": 1.05, "home_elo_bonus": 35},
    "SB":  {"draw_bias": +0.04, "home_bias": +0.03, "goals_factor": 0.90, "home_elo_bonus": 70},
    "DED": {"draw_bias": +0.02, "home_bias": +0.01, "goals_factor": 1.10, "home_elo_bonus": 55},  # DED: 26%
    "PPL": {"draw_bias": +0.07, "home_bias": +0.03, "goals_factor": 0.95, "home_elo_bonus": 60},  # PPL: draw rate alto 41%
    "ELC": {"draw_bias": +0.02, "home_bias": +0.01, "goals_factor": 1.00, "home_elo_bonus": 58},  # ELC: 24%
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

    # ── CALCOLO TUTTE LE PROBABILITÀ O/U ─────────────────────
    def poisson_prob(lam, k):
        return math.exp(-lam) * lam**k / math.factorial(k)

    lam = lh + la
    p_o15 = max(0.10, min(0.95, 1 - poisson_prob(lam, 0) - poisson_prob(lam, 1)))
    p_o25 = pover
    p_u25 = 1 - pover
    p_u35 = max(0.10, min(0.95,
        poisson_prob(lam,0)+poisson_prob(lam,1)+poisson_prob(lam,2)+poisson_prob(lam,3)
    ))
    p_o35 = 1 - p_u35

    # ── LOGICA COMBO: FISSA + SECONDA GAMBA ──────────────────
    # Seconda gamba = la più probabile tra O/U e BTTS
    # con soglia minima 60% e regole su xG

    COMBO_THRESHOLD = 0.60

    # BTTS valido solo se entrambe le squadre hanno xG > 1.5
    btts_valid = lh > 1.5 and la > 1.5
    btts_candidate = p_o15 if not btts_valid else pbtts  # placeholder

    # Preferenza seconda gamba per campionato (da dati storici reali)
    comp_code_combo = f.get("comp_code", "")
    secondary_pref = LEAGUE_SECONDARY.get(comp_code_combo, "O")  # "O"=Over/Under, "B"=BTTS

    # Costruisci candidati Over/Under
    ou_candidates = [
        ("O1.5", p_o15),
        ("O2.5", p_o25),
        ("U2.5", p_u25),
        ("U3.5", p_u35),
    ]
    # Candidato BTTS solo se xG entrambe > 1.5
    btts_candidate = [("BTTS", pbtts)] if btts_valid else []

    # Ordina per probabilità
    best_ou = sorted(ou_candidates, key=lambda x: -x[1])[0]
    best_btts = btts_candidate[0] if btts_candidate else None

    # Scegli seconda gamba in base alla preferenza del campionato
    if secondary_pref == "B" and best_btts and best_btts[1] >= COMBO_THRESHOLD:
        # Campionato BTTS-friendly: usa BTTS se supera soglia
        combo_leg, combo_prob = best_btts
    elif secondary_pref == "B" and best_btts:
        # BTTS non supera soglia — confronta con miglior O/U
        if best_btts[1] > best_ou[1]:
            combo_leg, combo_prob = best_btts
        else:
            combo_leg, combo_prob = best_ou
    else:
        # Campionato Over-friendly: usa miglior O/U
        combo_leg, combo_prob = best_ou

    # Verifica soglia certezza
    valid_candidates = [(lbl, p) for lbl, p in ou_candidates + (btts_candidate) if p >= COMBO_THRESHOLD]
    if not valid_candidates:
        # Nessuno supera soglia — usa comunque il migliore
        all_cands = ou_candidates + btts_candidate
        combo_leg, combo_prob = sorted(all_cands, key=lambda x: -x[1])[0]

    # Fissa = best_out (calcolato dopo, ma usiamo h/d/a già disponibili)
    # Determiniamo qui per uso in combo
    gap_12_temp = abs(h - a)
    ldb_temp = LEAGUE_PROFILE.get(f.get("comp_code",""), {}).get("draw_bias", 0)
    gap_thr_temp = 0.20 + (ldb_temp * 2)
    if d >= 0.25 and gap_12_temp < gap_thr_temp:
        fissa = "X"
        fissa_prob = d
    else:
        fissa = "1" if max(h,d,a)==h else ("X" if max(h,d,a)==d else "2")
        fissa_prob = max(h,d,a)

    combo_label = f"{fissa}+{combo_leg}"
    combo_score = round(fissa_prob * combo_prob, 4)
    combo_certain = combo_prob >= COMBO_THRESHOLD
    # ═══════════════════════════════════════
    # NUOVA CONFIDENZA — basata sul consenso dei segnali
    # Non misura lo squilibrio ELO ma la coerenza tra tutti i fattori
    # ═══════════════════════════════════════

    # 1. ACCORDO ELO vs FORM
    # Il vincitore previsto da ELO concorda con la form reale?
    elo_dir  = 1 if h > a else (-1 if a > h else 0)
    form_dir = 1 if f.get("form_diff", 0) > 0.05 else (-1 if f.get("form_diff", 0) < -0.05 else 0)
    if elo_dir == 0 or form_dir == 0:
        elo_form_agreement = 0.5   # neutro
    elif elo_dir == form_dir:
        elo_form_agreement = 1.0   # concordano
    else:
        elo_form_agreement = 0.0   # discordano

    # 2. FORZA DEL SEGNALE DOMINANTE
    # Quanto è netto il vantaggio? (non solo ELO ma anche form e xG)
    best_prob = max(h, d, a)
    signal_strength = min(1.0, max(0.0, (best_prob - 0.33) / 0.40))  # 0 a 33%, 1 a 73%+

    # 3. TREND DELLA SQUADRA FAVORITA
    if h >= a:
        fav_trend = f.get("h_trend", 0.0)
    else:
        fav_trend = f.get("a_trend", 0.0)
    trend_score = min(1.0, max(0.0, (fav_trend + 0.5)))  # normalizza da [-0.5,0.5] a [0,1]

    # 4. STANCHEZZA ASSENTE
    h_fat = f.get("h_fatigue_days", 99)
    a_fat = f.get("a_fatigue_days", 99)
    fatigue_penalty = 0.0
    if h_fat < 3 or a_fat < 3:
        fatigue_penalty = 0.15
    elif h_fat < 4 or a_fat < 4:
        fatigue_penalty = 0.08

    # 5. ACCURACY STORICA DEL CAMPIONATO
    comp = f.get("comp_code", "")
    league_base = LEAGUE_ACCURACY.get(comp, LEAGUE_ACCURACY_DEFAULT)
    # Normalizza: 0.27 (PL) → 0.0, 0.75 (CL) → 1.0
    league_score = (league_base - 0.27) / (0.75 - 0.27)
    league_score = max(0.0, min(1.0, league_score))

    # 6. H2H COERENTE (bonus se disponibile e concorda)
    h2h_bonus = 0.05 if f.get("h2h_matches", 0) >= 3 else 0.0

    # 7. BIG MATCH PENALTY (entrambe top, risultato imprevedibile)
    bmp = f.get("big_match_penalty", 0.0)

    # COMPOSIZIONE FINALE
    # I 4 segnali producono valori in range [0,1]
    # La somma ponderata sta naturalmente in [0,1]
    # Ogni segnale contribuisce in modo diverso per ogni partita
    score = (
        signal_strength    * 0.40 +   # forza del segnale dominante (principale)
        elo_form_agreement * 0.30 +   # accordo ELO vs form
        trend_score        * 0.15 +   # trend squadra favorita
        league_score       * 0.15     # affidabilità storica campionato
    ) + h2h_bonus - fatigue_penalty - bmp

    score = max(0.0, min(1.0, score))

    # Mappa score [0,1] → confidenza finale [conf_min, conf_max]
    # conf_min e conf_max dipendono dall'accuracy storica del campionato
    # PL (acc=0.27): conf_min=0.10, conf_max=0.38
    # SA (acc=0.50): conf_min=0.18, conf_max=0.62
    # CL (acc=0.75): conf_min=0.25, conf_max=0.85
    conf_min = max(0.05, league_base * 0.45)
    conf_max = min(0.85, league_base * 1.25)
    raw_conf = conf_min + score * (conf_max - conf_min)

    # NON applichiamo calibrate_confidence — la nuova formula incorpora già
    # l'accuracy storica per campionato. La calibrazione appiattiva tutto al ceiling.
    conf = round(raw_conf, 4)
    # Fix draw prediction — logica pulita basata su probabilità assolute
    # X solo quando draw è genuinamente il segnale più forte
    gap_12 = abs(h - a)
    if d >= 0.30 and d == max(h, d, a):
        # Draw è il valore più alto → X chiaro
        bo = "X"
        bv = d
    elif d >= 0.27 and gap_12 < 0.06:
        # Draw molto alto E le due squadre quasi identiche → X
        bo = "X"
        bv = d
    else:
        # Vince chi ha la probabilità più alta (1 o 2)
        bv = max(h, d, a)
        bo = "1" if bv == h else ("2" if bv == a else "X")
    return {**base,
            "dc_1x": h+d, "dc_x2": d+a, "dc_12": h+a,
            "over_25": pover, "under_25": 1-pover,
            "over_15": round(p_o15, 4), "under_35": round(p_u35, 4),
            "over_35": round(p_o35, 4),
            "btts_y": pbtts, "btts_n": 1-pbtts,
            "xg_home": round(lh, 2), "xg_away": round(la, 2),
            "combo_label":   combo_label,
            "combo_leg":     combo_leg,
            "combo_prob":    round(combo_prob, 4),
            "combo_score":   combo_score,
            "combo_certain": combo_certain,
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
def send_telegram(pred, hname, aname, comp, date_str="", time_str="", rank=1, pp=None):
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
        f"{'🎯' if pred.get('combo_certain') else '💡'} "
        f"*COMBO: {pred.get('combo_label','—')}* "
        f"({fmt(pred.get('combo_prob',0))})\n"
        f"_Generato: {datetime.now().strftime('%d/%m/%Y %H:%M')}_"
    )
    if pp:
        msg += (
            f"\n⚡ *PP Index:* {pp.get('pp_label','—')} "
            f"(I={pp.get('pp_i_casa',0):+.1f}/{pp.get('pp_i_ospite',0):+.1f} "
            f"D={pp.get('pp_D',0):+.1f} · {pp.get('pp_pct',50):.0f}%)"
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
                "pred_combo_label": pred.get("combo_label", ""),
                "pred_combo_leg":   pred.get("combo_leg", ""),
                "pred_combo_prob":  round(pred.get("combo_prob", 0), 4),
                "pred_over15":  round(pred.get("over_15", 0), 4),
                "pred_under35": round(pred.get("under_35", 0), 4),
                "correct_combo": None,  # da verificare dopo
                # OV Score — Odds Value
                "ov_score":    p.get("ov_score"),
                "ov_edge":     p.get("ov_details", {}).get("value_edge"),
                "ov_misalign": p.get("ov_details", {}).get("misalign_pct"),
                "ov_movement": p.get("ov_details", {}).get("movement_pct"),
                "ov_is_sharp": p.get("ov_details", {}).get("is_sharp"),
                "clv":         None,  # compilato dopo verifica risultato
                # PP Index — modello KPZ/Parisi
                "pp_result":   p.get("pp", {}).get("pp_result", ""),
                "pp_label":    p.get("pp", {}).get("pp_label", ""),
                "pp_i_casa":   p.get("pp", {}).get("pp_i_casa", None),
                "pp_i_ospite": p.get("pp", {}).get("pp_i_ospite", None),
                "pp_D":        p.get("pp", {}).get("pp_D", None),
                "pp_pct":      p.get("pp", {}).get("pp_pct", None),
                "correct_pp":  None,  # da verificare dopo
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
                    # Verifica combo
                    combo_leg = p.get("pred_combo_leg", "")
                    if combo_leg and p.get("pred_best"):
                        fissa_ok = (p["pred_best"] == outcome)
                        if combo_leg == "O1.5":
                            leg_ok = (gh + ga) > 1
                        elif combo_leg == "O2.5":
                            leg_ok = actual_over
                        elif combo_leg == "U2.5":
                            leg_ok = not actual_over
                        elif combo_leg == "U3.5":
                            leg_ok = (gh + ga) <= 3
                        elif combo_leg == "BTTS":
                            leg_ok = actual_btts
                        else:
                            leg_ok = False
                        p["correct_combo"] = fissa_ok and leg_ok
                    # Verifica PP Index
                    pp_result = p.get("pp_result", "")
                    if pp_result:
                        if pp_result in ("1", "2"):
                            p["correct_pp"] = (outcome == pp_result)
                        elif pp_result == "X":
                            p["correct_pp"] = (outcome == "X")
                        elif pp_result == "1X":
                            p["correct_pp"] = (outcome in ("1", "X"))
                        elif pp_result == "X2":
                            p["correct_pp"] = (outcome in ("X", "2"))
                        elif pp_result == "12":
                            p["correct_pp"] = (outcome in ("1", "2"))
                        else:
                            p["correct_pp"] = None
                    p["verified_at"] = datetime.now().isoformat()
                    # CLV — Closing Line Value
                    if SUPABASE_URL and SUPABASE_KEY:
                        try:
                            pin_hist = get_odds_history(fid, "pinnacle")
                            if pin_hist:
                                mv = calc_odds_movement(pin_hist)
                                closing = mv.get("close_home") if outcome=="1" else (mv.get("close_draw") if outcome=="X" else mv.get("close_away"))
                                our_prob = p.get("pred_home" if outcome=="1" else "pred_draw" if outcome=="X" else "pred_away", 0)
                                p["clv"] = calc_clv(our_prob, closing)
                                p["odds_movement_pct"] = mv.get("movement_pct")
                                p["odds_is_sharp"] = mv.get("is_sharp")
                        except Exception:
                            pass
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

        # ── QUOTE BOOKMAKER (Odds API) ───────────────────────
        odds_map = {}
        if ODDS_API_KEY and comp_code in ODDS_SPORT_MAP:
            odds_map = fetch_odds(comp_code, ODDS_API_KEY)

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
                pp   = pp_prediction(hname, aname, form_map)

                # OV Score — Odds Value
                # Usa fixture_id per leggere da Supabase (più affidabile del fuzzy match)
                ov_score, ov_details = None, {}
                odds_data = match_odds_key(hname, aname, odds_map)

                # Salva in Supabase se fuzzy match ha trovato le quote
                if odds_data:
                    pin = odds_data.get("pinnacle", {})
                    b365 = odds_data.get("bet365", {})
                    if pin and pin.get("1"):
                        save_odds_to_supabase(
                            fid, hname, aname, league_name,
                            date_str, "pinnacle",
                            pin.get("1"), pin.get("X"), pin.get("2")
                        )
                    if b365 and b365.get("1"):
                        save_odds_to_supabase(
                            fid, hname, aname, league_name,
                            date_str, "bet365",
                            b365.get("1"), b365.get("X"), b365.get("2")
                        )

                # Quote LIVE dall'Odds API (priorità massima — più aggiornate)
                # Storico Supabase usato solo per calcolo movimento
                pin_rows = get_odds_history(fid, "pinnacle")

                # Determina fonte quote: live > Supabase
                if odds_data and odds_data.get("pinnacle") and odds_data["pinnacle"].get("1"):
                    # Quote live dall'Odds API — sempre aggiornate
                    odds_data_final = odds_data
                elif pin_rows:
                    # Fallback: ultima quota da Supabase
                    def row_to_odds(rows):
                        if not rows: return {}
                        last = rows[-1]
                        return {"1": last.get("odd_home"), "X": last.get("odd_draw"), "2": last.get("odd_away")}
                    odds_data_final = {"pinnacle": row_to_odds(pin_rows), "bet365": {}}
                else:
                    odds_data_final = {}

                if odds_data_final.get("pinnacle", {}).get("1"):
                    movement = calc_odds_movement(pin_rows) if pin_rows else {}
                    ov_score, ov_details = calc_ov_score(
                        pred, odds_data_final, pred.get("best_out", "1"),
                        movement=movement
                    )
                    if ov_score is not None:
                        edge = ov_details.get('value_edge', 0)
                        mkt = ov_details.get('mkt_prob', 0)
                        vig = ov_details.get('vig_pct', 0)
                        print(f"      OV: {ov_score:.0f}/100 · Edge:{edge:+.1f}% · Mkt:{mkt:.1f}% · Vig:{vig:.1f}%")

                # ── SURPRISE INDEX ─────────────────────────────────────
                # S = Gap×0.40 + Instabilità×0.35 + OV_divergenza×0.25
                def calc_surprise(pred_local, ov_det, fm, hn, an):
                    try:
                        # 1. GAP: |prob_poisson - prob_pinnacle| sul segno dominante
                        h_p = pred_local.get("home_win", 0.33)
                        x_p = pred_local.get("draw", 0.33)
                        a_p = pred_local.get("away_win", 0.33)
                        dom_prob = max(h_p, x_p, a_p)
                        if ov_det:
                            nv = {"1": (ov_det.get("novig_1") or 33)/100,
                                  "X": (ov_det.get("novig_X") or 33)/100,
                                  "2": (ov_det.get("novig_2") or 33)/100}
                            dom_sign = "1" if h_p>=x_p and h_p>=a_p else "2" if a_p>=x_p else "X"
                            pin_prob = nv.get(dom_sign, 0.33)
                            gap = min(1.0, abs(dom_prob - pin_prob) / max(dom_prob, 0.01))
                        else:
                            gap = 0.3  # default senza Pinnacle
                        # 2. INSTABILITÀ: varianza risultati ultime 5 (W=1, D=0.5, L=0)
                        def result_variance(team):
                            td = fm.get(team, {})
                            results = td.get("results", [])[-5:]
                            if len(results) < 2:
                                return 0.25
                            vals = [1.0 if r=="W" else 0.5 if r=="D" else 0.0 for r in results]
                            mean = sum(vals)/len(vals)
                            var = sum((v-mean)**2 for v in vals)/len(vals)
                            return min(1.0, var * 4)  # normalizza (max var = 0.25 → *4 = 1.0)
                        inst_h = result_variance(hn)
                        inst_a = result_variance(an)
                        instability = (inst_h + inst_a) / 2
                        # 3. OV DIVERGENZA: quanto il mercato si discosta dal nostro modello
                        misalign = abs(ov_det.get("misalign_pct", 0)) / 100 if ov_det else 0.2
                        ov_div = min(1.0, misalign * 3)
                        # Formula finale
                        s = round(gap*0.40 + instability*0.35 + ov_div*0.25, 3)
                        return s
                    except Exception:
                        return 0.40  # default neutro

                surprise_idx = calc_surprise(pred, ov_details, form_map, hname, aname)

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
                    "first_leg":    first_leg if first_leg else None,
                    "prediction":   pred,
                    "pp":           pp,
                    "ov_score":     ov_score,
                    "ov_details":   ov_details,
                    "surprise_idx": surprise_idx,
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

    if not all_preds:
        print("\n📢 Nessuna partita in calendario oggi — alert saltato")
    else:
        filtered_alert = [p for p in all_preds if p["prediction"].get("confidence", 0) >= CONF_MIN_ALERT]
        top10 = sorted(filtered_alert, key=lambda x: x["prediction"].get("confidence", 0), reverse=True)[:10]
        if not top10:
            top10 = sorted(all_preds, key=lambda x: x["prediction"].get("confidence", 0), reverse=True)[:5]
            max_conf = top10[0]['prediction'].get('confidence', 0) if top10 else 0
            print(f"\n📢 Nessuna previsione con conf>{CONF_MIN_ALERT:.0%} — invio top {len(top10)} ({max_conf:.1%} max)")
        else:
            print(f"\n📢 {len(filtered_alert)} previsioni conf>{CONF_MIN_ALERT:.0%} → invio top {len(top10)}")
        if top10:
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
                              p.get("date",""), p.get("time",""), rank=i, pp=p.get("pp"))

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
                      <td style="padding:10px 8px;text-align:center;font-weight:bold;color:{'#4caf50' if pred.get('combo_certain') else '#f59e0b'}">
                        {pred.get('combo_label','—')}<br>
                        <span style="font-size:10px;color:#888">{fmt(pred.get('combo_prob',0))}</span>
                      </td>
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
              <th style="padding:10px 8px;color:#4caf50;text-align:center">🎯 COMBO</th>
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
                "combo":  pred.get("combo_label", ""),
                "comboP": round(pred.get("combo_prob", 0), 4),
            },
            "pp": p.get("pp", {}),
            "ov": {
                "score":    p.get("ov_score"),
                "pin1":     p.get("ov_details", {}).get("pinnacle_1"),
                "pinX":     p.get("ov_details", {}).get("pinnacle_X"),
                "pin2":     p.get("ov_details", {}).get("pinnacle_2"),
                "novig_1":  p.get("ov_details", {}).get("novig_1"),
                "novig_X":  p.get("ov_details", {}).get("novig_X"),
                "novig_2":  p.get("ov_details", {}).get("novig_2"),
                "mkt_prob": p.get("ov_details", {}).get("mkt_prob"),
                "vig_pct":  p.get("ov_details", {}).get("vig_pct"),
                "edge":     p.get("ov_details", {}).get("value_edge"),
                "misalign": p.get("ov_details", {}).get("misalign_pct"),
                "market_fav": p.get("ov_details", {}).get("market_favorite"),
                "components": p.get("ov_details", {}).get("components", {}),
                "surprise_idx": p.get("surprise_idx", 0.40),
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
