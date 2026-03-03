"""
QUANTUM FOOTBALL AI — Backend Python
GitHub Actions Cloud Pipeline
Dipendenze obbligatorie: requests numpy
Dipendenze opzionali:    qiskit qiskit-aer qiskit-ibm-runtime
"""

import os
import sys
import json
import math
import smtplib
import traceback
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests
import numpy as np

# ═══════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════
API_FOOTBALL_KEY  = os.getenv("API_FOOTBALL_KEY", "")
IBM_QUANTUM_TOKEN = os.getenv("IBM_QUANTUM_TOKEN", "")
TELEGRAM_TOKEN    = os.getenv("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT     = os.getenv("TELEGRAM_CHAT", "")
SMTP_HOST         = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT         = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER         = os.getenv("SMTP_USER", "")
SMTP_PASS         = os.getenv("SMTP_PASS", "")
SMTP_TO           = os.getenv("SMTP_TO", "")
SEASON            = 2024

# Check qiskit availability at startup (non-blocking)
try:
    from qiskit import QuantumCircuit, transpile
    from qiskit_aer import AerSimulator
    QISKIT_AVAILABLE = True
    print("✅ Qiskit disponibile — modalità quantum attiva")
except Exception:
    QISKIT_AVAILABLE = False
    print("⚠️  Qiskit non disponibile — modalità classica attiva")

DAILY_LEAGUES = {
    "Serie A":          135,
    "Premier League":   39,
    "La Liga":          140,
    "Bundesliga":       78,
    "Ligue 1":          61,
    "Serie B":          136,
    "Championship":     40,
    "Champions League": 2,
    "Europa League":    3,
    "Conference League":848,
}

ELO_DB = {
    "Inter":1820, "Napoli":1795, "Milan":1778, "Juventus":1760,
    "Atalanta":1750, "Roma":1720, "Lazio":1710, "Fiorentina":1695,
    "Man City":1870, "Arsenal":1840, "Liverpool":1835, "Chelsea":1790,
    "Tottenham":1775, "Man United":1760, "Newcastle":1745,
    "Real Madrid":1880, "Barcelona":1855, "Atletico":1820,
    "Bayern":1860, "Bayer Leverkusen":1830, "Dortmund":1800,
    "PSG":1875, "Monaco":1760, "Marseille":1740, "Lille":1720,
    "Benfica":1800, "Porto":1795, "Sporting CP":1785,
    "Ajax":1780, "PSV":1800, "Feyenoord":1790,
}


# ═══════════════════════════════════════════════════
#  FETCHER
# ═══════════════════════════════════════════════════
class FootballDataFetcher:
    BASE = "https://v3.football.api-sports.io"

    def __init__(self, api_key):
        self.headers   = {"x-apisports-key": api_key}
        self.available = bool(api_key)

    def _get(self, ep, params):
        r = requests.get(f"{self.BASE}/{ep}", headers=self.headers,
                         params=params, timeout=15)
        r.raise_for_status()
        return r.json()

    def get_fixtures(self, league_id):
        if not self.available:
            return []
        today   = datetime.now().strftime("%Y-%m-%d")
        in3days = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        try:
            data = self._get("fixtures", {
                "league": league_id, "season": SEASON,
                "from": today, "to": in3days
            })
            return data.get("response", [])
        except Exception as e:
            print(f"   ⚠️  get_fixtures error: {e}")
            return []

    def get_past_results(self, league_id, last_n=10):
        if not self.available:
            return []
        try:
            data = self._get("fixtures", {
                "league": league_id, "season": SEASON,
                "status": "FT", "last": last_n
            })
            return data.get("response", [])
        except Exception as e:
            print(f"   ⚠️  get_past_results error: {e}")
            return []

    def get_team_stats(self, team_id, league_id):
        if not self.available:
            return {}
        try:
            data = self._get("teams/statistics", {
                "team": team_id, "league": league_id, "season": SEASON
            })
            return data.get("response", {})
        except Exception as e:
            print(f"   ⚠️  get_team_stats error: {e}")
            return {}


# ═══════════════════════════════════════════════════
#  FEATURE ENGINEERING
# ═══════════════════════════════════════════════════
class FeatureEngineer:

    def _form(self, s):
        m = {"W": 1.0, "D": 0.5, "L": 0.0}
        chars = list(str(s or "WDWLW"))[-5:]
        return float(np.mean([m.get(c, 0.5) for c in chars]))

    def _momentum(self, s):
        chars   = list(reversed(list(str(s or "WDWLW"))))
        scores  = [1.0 if c=="W" else 0.5 if c=="D" else 0.0 for c in chars]
        weights = [0.5 ** i for i in range(len(scores))]
        total   = sum(weights)
        return sum(sc * w for sc, w in zip(scores, weights)) / total if total else 0.5

    def _sf(self, d, *keys, default=1.5):
        for k in keys:
            if not isinstance(d, dict):
                return float(default)
            d = d.get(k)
            if d is None:
                return float(default)
        try:
            return float(d)
        except (TypeError, ValueError):
            return float(default)

    def extract(self, hs, as_, he, ae, ih=0, ia=0):
        hxg  = self._sf(hs, "goals", "for",     "average", "home", default=1.5)
        axg  = self._sf(as_,"goals", "for",     "average", "away", default=1.2)
        hxga = self._sf(hs, "goals", "against", "average", "home", default=1.2)
        axga = self._sf(as_,"goals", "against", "average", "away", default=1.3)
        hf   = str(hs.get("form") or "WDWLW")
        af   = str(as_.get("form") or "DWWLL")
        ep   = 1 / (1 + 10 ** ((ae - he - 60) / 400))
        return {
            "elo_home":      he,
            "elo_away":      ae,
            "elo_diff":      he - ae,
            "elo_win_prob":  ep,
            "xg_home":       hxg,
            "xg_away":       axg,
            "xga_home":      hxga,
            "xga_away":      axga,
            "xg_diff":       hxg - axg,
            "form_home":     self._form(hf),
            "form_away":     self._form(af),
            "form_diff":     self._form(hf) - self._form(af),
            "momentum_home": self._momentum(hf),
            "momentum_away": self._momentum(af),
            "injuries_home": ih,
            "injuries_away": ia,
            "lambda_home":   (hxg + axga) / 2,
            "lambda_away":   (axg + hxga) / 2,
        }


# ═══════════════════════════════════════════════════
#  QUANTUM / CLASSICAL ENGINE
# ═══════════════════════════════════════════════════
def classical_predict(features):
    ep   = features["elo_win_prob"]
    fd   = features.get("form_diff", 0)
    xgd  = features.get("xg_diff", 0)
    draw = max(0.12, 0.28 - abs(features.get("elo_diff", 0)) * 0.0002)
    home = max(0.05, ep + fd * 0.1 + xgd * 0.03 - draw / 2)
    away = max(0.05, 1 - home - draw)
    n    = home + draw + away
    return {
        "home": home/n, "draw": draw/n, "away": away/n,
        "quantum_used": False, "hardware": False, "shots": 0
    }


def quantum_predict(features):
    if not QISKIT_AVAILABLE:
        return classical_predict(features)
    try:
        ep  = features["elo_win_prob"]
        xgd = features["xg_diff"]
        fd  = features["form_diff"]

        th = 2 * math.asin(math.sqrt(max(0.01, min(0.99, ep))))
        ta = 2 * math.asin(math.sqrt(max(0.01, min(0.99, 1 - ep))))

        qc = QuantumCircuit(3, 3)
        qc.h(0); qc.h(1); qc.h(2)
        qc.ry(th, 0); qc.ry(ta, 2)
        qc.rz(fd * 0.4, 0); qc.rz(-fd * 0.4, 2)
        qc.rz(xgd * 0.3, 0)
        qc.cx(0, 1); qc.cx(2, 1)
        qc.measure([0, 1, 2], [0, 1, 2])

        used_hw = False
        if IBM_QUANTUM_TOKEN:
            try:
                from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2
                svc    = QiskitRuntimeService(channel="ibm_quantum", token=IBM_QUANTUM_TOKEN)
                bk     = svc.least_busy(min_num_qubits=3, operational=True, simulator=False)
                job    = SamplerV2(bk).run([qc], shots=4096)
                counts = job.result()[0].data.c.get_counts()
                used_hw = True
            except Exception as e:
                print(f"   IBM HW unavailable ({e}), using AerSim")
                sim    = AerSimulator()
                counts = sim.run(transpile(qc, sim), shots=8192).result().get_counts()
        else:
            sim    = AerSimulator()
            counts = sim.run(transpile(qc, sim), shots=8192).result().get_counts()

        total = sum(counts.values())
        hc    = sum(v for k, v in counts.items() if k.count("1") <= 1)
        ac    = sum(v for k, v in counts.items() if k.count("0") <= 1)
        dc    = max(1, total - hc - ac)
        ph, pd, pa = hc/total, dc/total, ac/total
        n = ph + pd + pa
        return {
            "home": ph/n, "draw": pd/n, "away": pa/n,
            "quantum_used": True, "hardware": used_hw, "shots": total
        }
    except Exception as e:
        print(f"   ⚠️  Quantum error ({e}), fallback classico")
        return classical_predict(features)


def full_prediction(features):
    base = quantum_predict(features)
    h, d, a = base["home"], base["draw"], base["away"]
    lh = features["lambda_home"]
    la = features["lambda_away"]

    pover = max(0.20, min(0.85,
        1 - sum(math.exp(-(lh+la)) * (lh+la)**k / math.factorial(k)
                for k in range(3))
    ))
    pbtts = max(0.15, min(0.82,
        (1 - math.exp(-lh)) * (1 - math.exp(-la))
    ))
    ent  = -(h*math.log(max(0.001,h)) + d*math.log(max(0.001,d)) + a*math.log(max(0.001,a)))
    conf = 1 - ent / math.log(3)
    bv   = max(h, d, a)
    bo   = "1" if bv == h else ("2" if bv == a else "X")

    return {
        **base,
        "dc_1x":      h + d,
        "dc_x2":      d + a,
        "dc_12":      h + a,
        "over_25":    pover,
        "under_25":   1 - pover,
        "btts_y":     pbtts,
        "btts_n":     1 - pbtts,
        "xg_home":    round(lh, 2),
        "xg_away":    round(la, 2),
        "confidence": conf,
        "best_out":   bo,
        "best_val":   bv,
    }


# ═══════════════════════════════════════════════════
#  ADAPTIVE MODEL
# ═══════════════════════════════════════════════════
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
        if predicted.get("quantum_used"):
            self.weights["quantum"]   = max(0.05, min(0.60, self.weights["quantum"]   + adj))
            self.weights["elo"]       = max(0.20, min(0.60, self.weights["elo"]       - adj * 0.5))
            self.weights["emotional"] = max(0.10, min(0.50, self.weights["emotional"] - adj * 0.5))
        t = self.weights["elo"] + self.weights["emotional"] + self.weights["quantum"]
        for k in ("elo", "emotional", "quantum"):
            self.weights[k] /= t
        self.save()


# ═══════════════════════════════════════════════════
#  TELEGRAM
# ═══════════════════════════════════════════════════
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
        f"📊 *1X2*\n"
        f"  1: {fmt(pred['home'])} {odd(pred['home'])}\n"
        f"  X: {fmt(pred['draw'])} {odd(pred['draw'])}\n"
        f"  2: {fmt(pred['away'])} {odd(pred['away'])}\n\n"
        f"🎯 *DOPPIA CHANCE*\n"
        f"  1X:{fmt(pred['dc_1x'])} · X2:{fmt(pred['dc_x2'])} · 12:{fmt(pred['dc_12'])}\n\n"
        f"⚡ *GOAL*\n"
        f"  Over 2.5:{fmt(pred['over_25'])} · BTTS Sì:{fmt(pred['btts_y'])}\n\n"
        f"📈 xG: *{pred['xg_home']}* — *{pred['xg_away']}*\n"
        f"🎲 Conf: *{fmt(pred['confidence'])}* {icon}\n"
        f"🏆 Top: *{pred['best_out']}* {odd(pred['best_val'])}\n"
        f"━━━━━━━━━━━━━━━━━\n"
        f"_{datetime.now().strftime('%d/%m/%Y %H:%M')}_"
    )
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT, "text": msg,
                  "parse_mode": "Markdown", "disable_web_page_preview": True},
            timeout=10
        )
        print(f"   {'✅' if r.ok else '❌'} Telegram: {hname} vs {aname}")
    except Exception as e:
        print(f"   ❌ Telegram error: {e}")


# ═══════════════════════════════════════════════════
#  EMAIL
# ═══════════════════════════════════════════════════
def send_email(pred, hname, aname, comp):
    if not all([SMTP_USER, SMTP_PASS, SMTP_TO]):
        return
    fmt  = lambda v: f"{v*100:.1f}%"
    odd  = lambda v: f"@{1/max(0.001,v):.2f}"
    rows = [
        (f"1 {hname}",  pred["home"]),
        ("X Pareggio",  pred["draw"]),
        (f"2 {aname}",  pred["away"]),
        ("Doppia 1X",   pred["dc_1x"]),
        ("Doppia X2",   pred["dc_x2"]),
        ("Over 2.5",    pred["over_25"]),
        ("BTTS Sì",     pred["btts_y"]),
    ]
    trs = "\n".join(
        f"<tr><td style='padding:8px 12px'>{l}</td>"
        f"<td style='text-align:center'>{fmt(v)}</td>"
        f"<td style='text-align:center;color:#888'>{odd(v)}</td></tr>"
        for l, v in rows
    )
    html = f"""<html><body style="font-family:monospace;background:#050911;color:#fff;padding:24px">
<h2 style="color:#22d3ee">⚛️ QUANTUM FOOTBALL AI</h2>
<p style="color:#888">{comp} · {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
<h3><span style="color:#22d3ee">{hname}</span>
<span style="color:#f59e0b;margin:0 10px">vs</span>
<span style="color:#f472b6">{aname}</span></h3>
<p>xG: <b style="color:#22d3ee">{pred['xg_home']}</b> — <b style="color:#f472b6">{pred['xg_away']}</b>
&nbsp;·&nbsp; Conf: <b style="color:#34d399">{fmt(pred['confidence'])}</b></p>
<table style="width:100%;border-collapse:collapse;background:#0d1526">
<tr><th style="padding:10px;color:#22d3ee;text-align:left">Mercato</th>
<th style="padding:10px;color:#22d3ee">Prob.</th>
<th style="padding:10px;color:#22d3ee">Quota</th></tr>
{trs}
</table>
<p style="color:#555;font-size:11px;margin-top:20px">
⚛️ IBM Quantum · Auto-Adaptive · GitHub Actions</p>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"⚽ {hname} vs {aname} | {comp} | Quantum AI"
    msg["From"]    = SMTP_USER
    msg["To"]      = SMTP_TO
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SMTP_USER, SMTP_TO, msg.as_string())
        print(f"   ✅ Email: {hname} vs {aname}")
    except Exception as e:
        print(f"   ❌ Email error: {e}")


# ═══════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════
def main():
    print("=" * 60)
    print("⚛️  QUANTUM FOOTBALL AI — Cloud Pipeline")
    print(f"   {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"   Quantum: {'✅ Qiskit' if QISKIT_AVAILABLE else '⚡ Classico'}")
    print("=" * 60)

    fetcher  = FootballDataFetcher(API_FOOTBALL_KEY)
    engineer = FeatureEngineer()
    model    = AdaptiveModel("weights.json")

    print(f"\n🔧 Pesi modello: {model.weights}")
    if not API_FOOTBALL_KEY:
        print("⚠️  API_FOOTBALL_KEY mancante — fixture mock per test")

    all_predictions = []

    # ── PREVISIONI ──────────────────────────────────────────
    for league_name, league_id in DAILY_LEAGUES.items():
        print(f"\n📅 {league_name} (ID:{league_id})")
        try:
            fixtures = fetcher.get_fixtures(league_id)
        except Exception as e:
            print(f"   ⚠️  {e}")
            fixtures = []

        if not fixtures:
            fixtures = [{
                "teams":   {"home": {"id": 505, "name": "Inter"},
                            "away": {"id": 492, "name": "Napoli"}},
                "fixture": {"id": 999001, "date": datetime.now().isoformat()}
            }]

        for fix in fixtures[:3]:
            try:
                ht     = fix["teams"]["home"]
                at     = fix["teams"]["away"]
                hname  = ht["name"]
                aname  = at["name"]
                fix_id = fix["fixture"]["id"]
                print(f"   ⚽ {hname} vs {aname}")

                try:
                    hs  = fetcher.get_team_stats(ht["id"], league_id)
                    as_ = fetcher.get_team_stats(at["id"], league_id)
                except Exception:
                    hs  = {"form": "WWDLW"}
                    as_ = {"form": "WLDWW"}

                eh   = ELO_DB.get(hname, 1700)
                ea   = ELO_DB.get(aname, 1700)
                feat = engineer.extract(hs, as_, eh, ea)
                pred = full_prediction(feat)

                print(f"      1:{pred['home']:.1%}  X:{pred['draw']:.1%}  2:{pred['away']:.1%}  "
                      f"O2.5:{pred['over_25']:.1%}  Conf:{pred['confidence']:.1%}  "
                      f"Q:{'✓' if pred['quantum_used'] else '∿'}")

                all_predictions.append({
                    "league":       league_name,
                    "fixture_id":   fix_id,
                    "home":         hname,
                    "away":         aname,
                    "prediction":   pred,
                    "generated_at": datetime.now().isoformat()
                })

                send_telegram(pred, hname, aname, league_name)
                send_email(pred, hname, aname, league_name)

            except Exception as e:
                print(f"   ❌ Errore fixture: {e}")
                traceback.print_exc()
                continue

    # ── BACKTESTING ─────────────────────────────────────────
    print("\n🔄 Auto-adattamento...")
    adapted = 0
    for league_name, league_id in list(DAILY_LEAGUES.items())[:5]:
        try:
            past = fetcher.get_past_results(league_id, last_n=10)
            for result in past:
                gh = result.get("goals", {}).get("home")
                ga = result.get("goals", {}).get("away")
                if gh is None or ga is None:
                    continue
                actual = "1" if gh > ga else ("2" if ga > gh else "X")
                mp     = classical_predict({
                    "elo_win_prob": 0.45, "elo_diff": 0,
                    "form_diff": 0, "xg_diff": 0
                })
                model.update(mp, actual)
                adapted += 1
        except Exception as e:
            print(f"   ⚠️  Skip {league_name}: {e}")

    print(f"   Aggiornamenti: {adapted}")
    print(f"🔧 Pesi finali: {model.weights}")

    # ── SALVA OUTPUT ─────────────────────────────────────────
    with open("predictions_output.json", "w") as f:
        json.dump(all_predictions, f, indent=2, default=str)

    print(f"\n✅ {len(all_predictions)} previsioni → predictions_output.json")
    print("✅ Pipeline completata!")


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ ERRORE FATALE: {e}")
        traceback.print_exc()
        sys.exit(1)
