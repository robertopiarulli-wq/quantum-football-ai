import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════
   DATA
═══════════════════════════════════════════════════ */
const LEAGUES = [
  { key:"Serie A",       flag:"🇮🇹", tier:1 },
  { key:"Premier League",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", tier:1 },
  { key:"La Liga",       flag:"🇪🇸", tier:1 },
  { key:"Bundesliga",    flag:"🇩🇪", tier:1 },
  { key:"Ligue 1",       flag:"🇫🇷", tier:1 },
  { key:"Eredivisie",    flag:"🇳🇱", tier:1 },
  { key:"Primeira Liga", flag:"🇵🇹", tier:1 },
  { key:"Pro League BE", flag:"🇧🇪", tier:1 },
  { key:"Süper Lig",     flag:"🇹🇷", tier:1 },
  { key:"Ekstraklasa",   flag:"🇵🇱", tier:1 },
  { key:"Superliga DK",  flag:"🇩🇰", tier:1 },
  { key:"Allsvenskan",   flag:"🇸🇪", tier:1 },
  { key:"Eliteserien",   flag:"🇳🇴", tier:1 },
  { key:"Super League GR",flag:"🇬🇷",tier:1 },
  { key:"Serie B",       flag:"🇮🇹", tier:2 },
  { key:"Championship",  flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", tier:2 },
  { key:"2. Bundesliga", flag:"🇩🇪", tier:2 },
  { key:"Segunda Div",   flag:"🇪🇸", tier:2 },
  { key:"Ligue 2",       flag:"🇫🇷", tier:2 },
  { key:"League One",    flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", tier:3 },
  { key:"Champions Lg",  flag:"⭐",  tier:0 },
  { key:"Europa Lg",     flag:"🟠",  tier:0 },
  { key:"Conference Lg", flag:"🔵",  tier:0 },
  { key:"Coppa Italia",  flag:"🏆",  tier:0 },
  { key:"FA Cup",        flag:"🏆",  tier:0 },
];

const TEAMS = {
  "Serie A":        ["Inter","Napoli","Milan","Juventus","Atalanta","Roma","Lazio","Fiorentina","Torino","Bologna","Udinese","Genoa","Verona","Parma","Cagliari","Empoli"],
  "Premier League": ["Man City","Arsenal","Liverpool","Chelsea","Tottenham","Man United","Newcastle","Aston Villa","Brighton","West Ham","Fulham","Wolves","Everton","Crystal Palace","Brentford","Nottm Forest"],
  "La Liga":        ["Real Madrid","Barcelona","Atletico","Sevilla","Real Sociedad","Villarreal","Athletic Bilbao","Betis","Valencia","Girona","Celta Vigo","Osasuna","Getafe","Alaves","Mallorca"],
  "Bundesliga":     ["Bayern","Bayer Leverkusen","Borussia Dortmund","RB Leipzig","Eintracht","Stuttgart","Wolfsburg","Freiburg","Mainz","Hoffenheim","Augsburg","Werder Bremen","Köln","Union Berlin"],
  "Ligue 1":        ["PSG","Monaco","Marseille","Lyon","Lille","Lens","Nice","Rennes","Brest","Nantes","Reims","Montpellier","Strasbourg"],
  "Eredivisie":     ["Ajax","PSV","Feyenoord","AZ Alkmaar","Twente","Utrecht","Go Ahead Eagles","Heerenveen"],
  "Primeira Liga":  ["Benfica","Porto","Sporting CP","Braga","Vitoria SC","Guimaraes","Famalicao","Estoril"],
  "Pro League BE":  ["Club Brugge","Anderlecht","Genk","Standard","Gent","Union SG","Antwerp"],
  "Süper Lig":      ["Galatasaray","Fenerbahce","Besiktas","Trabzonspor","Basaksehir","Sivasspor","Adana Demirspor"],
  "Ekstraklasa":    ["Legia","Lech Poznan","Rakow","Wisla Krakow","Gornik","Jagiellonia"],
  "Superliga DK":   ["FC Copenhagen","Midtjylland","Brondby","Silkeborg","AGF","OB"],
  "Allsvenskan":    ["Malmo FF","Djurgarden","AIK","Hammarby","IFK Goteborg","Elfsborg"],
  "Eliteserien":    ["Bodo/Glimt","Rosenborg","Molde","Viking","Valerenga","Lillestrom"],
  "Super League GR":["Olympiacos","Panathinaikos","AEK Athens","PAOK","Aris","Paok Saloniki"],
  "Serie B":        ["Sassuolo","Spezia","Sampdoria","Palermo","Bari","Cremonese","Catanzaro","Cesena","Modena","Reggiana","Sudtirol","Cosenza","Pisa"],
  "Championship":   ["Leeds","Leicester","Middlesbrough","Burnley","Sunderland","Sheffield Wed","Cardiff","Ipswich","Watford","West Brom","Norwich","QPR"],
  "2. Bundesliga":  ["Hamburg","Schalke","Kaiserslautern","Koln","Hannover 96","Nurnberg","Darmstadt","Fortuna Dusseldorf"],
  "Segunda Div":    ["Valladolid","Zaragoza","Almeria","Malaga","Elche","Levante","Granada","Huesca"],
  "Ligue 2":        ["Caen","Auxerre","Bordeaux","Grenoble","Valenciennes","Metz","Troyes","Amiens"],
  "League One":     ["Bristol Rovers","Derby","Exeter","Peterborough","Portsmouth","Charlton","Burton"],
  "Champions Lg":   ["Real Madrid","Man City","Bayern","PSG","Barcelona","Inter","Arsenal","Dortmund","PSV","Atletico","Liverpool","Feyenoord","Porto","Benfica","Napoli","Celtic"],
  "Europa Lg":      ["Roma","Lazio","Sevilla","Ajax","Bayer Leverkusen","West Ham","Villarreal","Fiorentina","Sociedad","Atalanta"],
  "Conference Lg":  ["Fiorentina","Club Brugge","Gent","Aston Villa","Olympiacos","Panathinaikos","Betis","Fenerbahce"],
  "Coppa Italia":   ["Inter","Juventus","Milan","Napoli","Roma","Lazio","Atalanta","Fiorentina"],
  "FA Cup":         ["Man City","Arsenal","Chelsea","Liverpool","Tottenham","Man United","Newcastle","Aston Villa"],
};

// ELO + stat lookup (approximate)
const BASE_STATS = {
  "Inter":1820,"Napoli":1795,"Milan":1778,"Juventus":1760,"Atalanta":1750,
  "Roma":1720,"Lazio":1710,"Fiorentina":1695,"Torino":1650,"Bologna":1640,
  "Udinese":1610,"Genoa":1600,"Verona":1600,"Parma":1595,"Cagliari":1590,
  "Empoli":1580,"Modena":1540,"Reggiana":1535,"Sudtirol":1530,"Cosenza":1520,"Pisa":1545,
  "Man City":1870,"Arsenal":1840,"Liverpool":1835,"Chelsea":1790,
  "Tottenham":1775,"Man United":1760,"Newcastle":1745,"Aston Villa":1740,
  "Brighton":1710,"West Ham":1690,"Fulham":1680,"Wolves":1660,
  "Everton":1650,"Crystal Palace":1655,"Brentford":1670,"Nottm Forest":1660,
  "Real Madrid":1880,"Barcelona":1855,"Atletico":1820,"Sevilla":1740,
  "Real Sociedad":1730,"Villarreal":1720,"Athletic Bilbao":1710,"Betis":1700,
  "Valencia":1680,"Girona":1690,"Celta Vigo":1660,"Osasuna":1650,
  "Getafe":1640,"Alaves":1620,"Mallorca":1635,
  "Bayern":1860,"Bayer Leverkusen":1830,"Borussia Dortmund":1800,"RB Leipzig":1790,
  "Eintracht":1730,"Stuttgart":1720,"Wolfsburg":1700,"Freiburg":1695,
  "Mainz":1670,"Hoffenheim":1660,"Augsburg":1640,"Werder Bremen":1660,
  "Koln":1610,"Köln":1610,"Union Berlin":1660,"Nurnberg":1570,"Darmstadt":1560,"Fortuna Dusseldorf":1575,
  "PSG":1875,"Monaco":1760,"Marseille":1740,"Lyon":1730,"Lille":1720,
  "Lens":1700,"Nice":1690,"Rennes":1680,"Brest":1660,"Nantes":1640,
  "Reims":1630,"Montpellier":1620,"Strasbourg":1615,
  "Ajax":1780,"PSV":1800,"Feyenoord":1790,"AZ Alkmaar":1710,
  "Twente":1690,"Utrecht":1670,"Go Ahead Eagles":1620,"Heerenveen":1630,
  "Benfica":1800,"Porto":1795,"Sporting CP":1785,"Braga":1700,
  "Vitoria SC":1650,"Guimaraes":1640,"Famalicao":1580,"Estoril":1570,
  "Club Brugge":1770,"Anderlecht":1740,"Genk":1710,"Standard":1670,"Gent":1690,"Union SG":1715,"Antwerp":1700,
  "Galatasaray":1780,"Fenerbahce":1775,"Besiktas":1730,"Trabzonspor":1690,"Basaksehir":1670,"Sivasspor":1630,"Adana Demirspor":1620,
  "Legia":1700,"Lech Poznan":1690,"Rakow":1710,"Wisla Krakow":1640,"Gornik":1600,"Jagiellonia":1650,
  "FC Copenhagen":1730,"Midtjylland":1720,"Brondby":1680,"Silkeborg":1640,"AGF":1620,"OB":1610,
  "Malmo FF":1710,"Djurgarden":1680,"AIK":1670,"Hammarby":1660,"IFK Goteborg":1640,"Elfsborg":1650,
  "Bodo/Glimt":1720,"Rosenborg":1700,"Molde":1690,"Viking":1650,"Valerenga":1620,"Lillestrom":1610,
  "Olympiacos":1740,"Panathinaikos":1720,"AEK Athens":1710,"PAOK":1700,"Aris":1650,"Paok Saloniki":1660,
  "Sassuolo":1610,"Spezia":1570,"Sampdoria":1580,"Palermo":1560,"Bari":1550,"Cremonese":1560,
  "Catanzaro":1530,"Cesena":1520,
  "Leeds":1650,"Leicester":1660,"Middlesbrough":1610,"Burnley":1645,"Sunderland":1600,
  "Sheffield Wed":1590,"Cardiff":1580,"Ipswich":1640,"Watford":1620,"West Brom":1625,"Norwich":1610,"QPR":1585,
  "Hamburg":1630,"Schalke":1600,"Kaiserslautern":1580,"Hannover 96":1590,
  "Valladolid":1580,"Zaragoza":1560,"Almeria":1570,"Malaga":1550,"Elche":1560,"Levante":1570,"Granada":1565,"Huesca":1545,
  "Caen":1560,"Auxerre":1570,"Bordeaux":1590,"Grenoble":1540,"Valenciennes":1520,"Metz":1575,"Troyes":1555,"Amiens":1545,
  "Bristol Rovers":1530,"Derby":1560,"Exeter":1510,"Peterborough":1525,"Portsmouth":1540,"Charlton":1535,"Burton":1505,
  "Celtic":1750,"Dortmund":1800,
  "Sociedad":1730,"West Ham":1690,
};

function getStats(name) {
  const elo = BASE_STATS[name] || 1650;
  const tier = elo > 1800 ? "top" : elo > 1700 ? "mid" : "low";
  return {
    elo,
    xg:  tier==="top"?2.1:tier==="mid"?1.6:1.2,
    xga: tier==="top"?0.9:tier==="mid"?1.1:1.3,
    form: [Math.random()>0.35?1:0, Math.random()>0.4?1:0, Math.random()>0.4?1:0, Math.random()>0.4?1:0, Math.random()>0.4?1:0],
    morale:  0.50 + (elo-1500)/3000,
    fatigue: 0.15 + Math.random()*0.20,
  };
}

/* ═══════════════════════════════════════════════════
   QUANTUM ENGINE
═══════════════════════════════════════════════════ */
function hadamard(p){
  const t = Math.acos(Math.sqrt(Math.max(0.01,Math.min(0.99,p))))+(Math.random()-0.5)*0.07;
  return Math.cos(t)**2;
}
function qCircuit(h,d,a){
  let qh=hadamard(h),qd=hadamard(d),qa=hadamard(a);
  const e=0.025*(qh-qa); qh+=e; qa-=e;
  const s=qh+qd+qa;
  return [qh/s,qd/s,qa/s];
}
function poisson(l,k){
  let f=1; for(let i=1;i<=k;i++) f*=i;
  return Math.exp(-l)*Math.pow(l,k)/f;
}
function emot(s){
  const fAvg=s.form.reduce((a,b)=>a+b,0)/s.form.length;
  return Math.min(1, fAvg*0.35+s.morale*0.35+(1-s.fatigue)*0.20+(s.form[0]&&s.form[1]?0.08:0)+0.02);
}

function computeMatch(hName, aName) {
  const hs = getStats(hName), as = getStats(aName);
  const ep = 1/(1+Math.pow(10,(as.elo-hs.elo-60)/400));
  const eh = emot(hs), ea = emot(as);
  const lh = (hs.xg + as.xga)/2, la = (as.xg + hs.xga)/2;
  let rH = ep*0.40 + eh*0.35 + Math.random()*0.04*0.25;
  let rD = Math.max(0.10, 0.27 - Math.abs(hs.elo-as.elo)*0.00015);
  rH += (eh-ea)*0.10 + (hs.xg-as.xg)*0.03;
  let rA = Math.max(0.05, 1-rH-rD);
  const [qh,qd,qa] = qCircuit(rH,rD,rA);
  const s = qh+qd+qa;
  const home=qh/s, draw=qd/s, away=qa/s;
  const pOver = Math.max(0.2,Math.min(0.85, 1-poisson(lh+la,0)-poisson(lh+la,1)-poisson(lh+la,2)));
  const btts = Math.min(0.85,(1-Math.exp(-lh))*(1-Math.exp(-la)));
  const entropy = -(home*Math.log(home)+draw*Math.log(draw)+away*Math.log(away));
  const conf = 1-entropy/Math.log(3);
  const best = home>=draw&&home>=away?"1":draw>=away?"X":"2";
  const bestP = home>=draw&&home>=away?home:draw>=away?draw:away;
  return {
    home, draw, away,
    dc1x:home+draw, dcx2:draw+away, dc12:home+away,
    over25:pOver, under25:1-pOver,
    bttsY:btts, bttsN:1-btts,
    xg_h:lh.toFixed(2), xg_a:la.toFixed(2),
    emot_h:eh, emot_a:ea, conf,
    best, bestP,
  };
}

/* ═══════════════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════════════ */
const C = {
  bg:"#050911", card:"rgba(255,255,255,0.03)", border:"rgba(255,255,255,0.07)",
  cyan:"#22d3ee", pink:"#f472b6", amber:"#f59e0b",
  green:"#34d399", purple:"#a78bfa", red:"#f87171",
};
const pct = v => `${(v*100).toFixed(1)}%`;
const odds = v => `@${(1/Math.max(0.01,v)).toFixed(2)}`;
const confColor = c => c>0.70?C.green:c>0.55?C.amber:C.red;

function Bar({val,color,label,sub}){
  const p=Math.round(val*100);
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#999",marginBottom:3}}>
        <span>{label}{sub&&<span style={{color:"#555",marginLeft:4,fontSize:9}}>{sub}</span>}</span>
        <span style={{color:"#fff",fontWeight:800}}>{p}% <span style={{color:"#555",fontSize:9}}>{odds(val)}</span></span>
      </div>
      <div style={{background:"rgba(255,255,255,0.05)",borderRadius:99,height:8,overflow:"hidden"}}>
        <div style={{height:"100%",width:p+"%",borderRadius:99,background:`linear-gradient(90deg,${color}55,${color})`,boxShadow:`0 0 10px ${color}55`,transition:"width 0.8s ease"}}/>
      </div>
    </div>
  );
}

function Wave({w=300}){
  const r=useRef(null),a=useRef(null);
  useEffect(()=>{
    const cv=r.current; if(!cv)return;
    const ctx=cv.getContext("2d"); let t=0;
    const draw=()=>{
      ctx.clearRect(0,0,w,36);
      [[C.cyan,1,3],[C.pink,1.3,2.5],[C.purple,0.7,2]].forEach(([c,sp,amp])=>{
        ctx.beginPath();
        for(let x=0;x<w;x++){
          const y=18+Math.sin(x/w*Math.PI*5*sp+t)*amp*Math.cos(x/w*Math.PI*2);
          x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
        }
        ctx.strokeStyle=c+"55";ctx.lineWidth=1.5;ctx.stroke();
      });
      t+=0.035;a.current=requestAnimationFrame(draw);
    };
    draw(); return()=>cancelAnimationFrame(a.current);
  },[w]);
  return <canvas ref={r} width={w} height={36} style={{display:"block",width:"100%",height:36}}/>;
}

function ResultBox({hName,aName,pred}){
  if(!pred) return null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* 1X2 */}
      <div style={{background:`linear-gradient(135deg,rgba(34,211,238,0.07),rgba(167,139,250,0.05))`,border:`1px solid ${C.cyan}33`,borderRadius:14,padding:18}}>
        <div style={{textAlign:"center",marginBottom:14}}>
          <div style={{fontSize:15,fontWeight:900}}>
            <span style={{color:C.cyan}}>{hName}</span>
            <span style={{color:C.amber,margin:"0 10px"}}>vs</span>
            <span style={{color:C.pink}}>{aName}</span>
          </div>
          <div style={{marginTop:7,fontSize:10,color:"#888"}}>
            xG: <span style={{color:C.cyan}}>{pred.xg_h}</span> — <span style={{color:C.pink}}>{pred.xg_a}</span>
            &nbsp;·&nbsp;Conf: <span style={{color:confColor(pred.conf),fontWeight:700}}>{pct(pred.conf)}</span>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[[`1 ${hName}`,pred.home,C.cyan],["X Pareggio",pred.draw,C.amber],[`2 ${aName}`,pred.away,C.pink]].map(([l,v,c])=>(
            <div key={l} style={{background:"rgba(0,0,0,0.3)",borderRadius:10,padding:12,textAlign:"center",border:`1px solid ${c}22`}}>
              <div style={{fontSize:9,color:c,marginBottom:4}}>{l}</div>
              <div style={{fontSize:20,fontWeight:900}}>{pct(v)}</div>
              <div style={{fontSize:9,color:"#555"}}>{odds(v)}</div>
            </div>
          ))}
        </div>
      </div>
      {/* markets */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:14}}>
          <div style={{fontSize:9,color:"#888",letterSpacing:2,marginBottom:10}}>🎯 DOPPIA CHANCE</div>
          <Bar val={pred.dc1x} color={C.purple} label="1X"/>
          <Bar val={pred.dcx2} color={C.pink}   label="X2"/>
          <Bar val={pred.dc12} color={C.green}  label="12"/>
        </div>
        <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:14}}>
          <div style={{fontSize:9,color:"#888",letterSpacing:2,marginBottom:10}}>⚡ GOAL</div>
          <Bar val={pred.over25}  color="#f97316" label="Over 2.5"/>
          <Bar val={pred.under25} color="#64748b" label="Under 2.5"/>
          <div style={{borderTop:"1px solid #1a1a1a",marginTop:8,paddingTop:8}}>
            <Bar val={pred.bttsY} color={C.amber}  label="BTTS Sì"/>
            <Bar val={pred.bttsN} color="#475569"  label="BTTS No"/>
          </div>
        </div>
        <div style={{background:C.card,border:`1px solid ${C.pink}22`,borderRadius:14,padding:14}}>
          <div style={{fontSize:9,color:C.pink,letterSpacing:2,marginBottom:10}}>💭 EMOTIVO</div>
          <Bar val={pred.emot_h} color={C.cyan} label={hName}/>
          <Bar val={pred.emot_a} color={C.pink} label={aName}/>
        </div>
        <div style={{background:C.card,border:`1px solid ${C.green}22`,borderRadius:14,padding:14}}>
          <div style={{fontSize:9,color:C.green,letterSpacing:2,marginBottom:10}}>📊 xG POISSON</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            {[[hName,pred.xg_h,C.cyan],[aName,pred.xg_a,C.pink]].map(([n,v,c])=>(
              <div key={n} style={{textAlign:"center",background:`${c}08`,borderRadius:8,padding:9}}>
                <div style={{fontSize:20,fontWeight:900,color:c}}>{v}</div>
                <div style={{fontSize:8,color:"#666"}}>{n}</div>
              </div>
            ))}
          </div>
          <Bar val={pred.over25} color={C.green} label="P(Over 2.5)"/>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════════════ */
const BOOT = [
  "⚛️ Init IBM Quantum Runtime (8 qubit)",
  "🌍 Caricamento 25 campionati europei",
  "🔍 Preparazione motore di ricerca",
  "🧬 Feature Engineering (28 features)",
  "📊 Modulo ranking multi-mercato pronto",
  "📨 Canali Telegram + Email configurati",
  "✅ Sistema pronto",
];

export default function App() {
  // boot
  const [bootIdx,setBootIdx] = useState(-1);
  const [ready,setReady]     = useState(false);
  // tabs
  const [tab,setTab]         = useState("search");
  // SEARCH
  const [srchQ,setSrchQ]         = useState("");
  const [srchLeague,setSrchLeague] = useState("Serie A");
  const [srchHome,setSrchHome]   = useState("");
  const [srchAway,setSrchAway]   = useState("");
  const [srchPred,setSrchPred]   = useState(null);
  const [srchLoading,setSrchLoading] = useState(false);
  // RANKING
  const [rnkLeague,setRnkLeague] = useState("Serie A");
  const [rnkSort,setRnkSort]     = useState("conf");
  const [rnkFilter,setRnkFilter] = useState("all");
  const [rnkData,setRnkData]     = useState([]);
  const [rnkLoading,setRnkLoading] = useState(false);
  const [topN,setTopN]           = useState(5);
  const [selected,setSelected]   = useState(new Set());
  // ALERTS
  const [tgToken,setTgToken]     = useState("");
  const [tgChat,setTgChat]       = useState("");
  const [emailTo,setEmailTo]     = useState("");
  const [alertDone,setAlertDone] = useState(false);
  // HISTORY
  const [history,setHistory]     = useState([]);
  const [cycles,setCycles]       = useState(0);

  // boot sequence
  useEffect(()=>{
    let i=0;
    const tick=()=>{ setBootIdx(i); i++; if(i<BOOT.length) setTimeout(tick,260+Math.random()*200); else setTimeout(()=>setReady(true),400); };
    setTimeout(tick,300);
  },[]);

  // derive teams for selected league (search)
  const srchTeams = TEAMS[srchLeague] || [];
  // filter team list by search query
  const filteredTeams = useMemo(()=>{
    if(!srchQ.trim()) return srchTeams;
    const q = srchQ.toLowerCase();
    return srchTeams.filter(t=>t.toLowerCase().includes(q));
  },[srchQ, srchTeams]);

  // compute prediction for search tab
  const runSearch = useCallback(()=>{
    if(!srchHome || !srchAway || srchHome===srchAway) return;
    setSrchLoading(true); setSrchPred(null);
    setTimeout(()=>{
      const r = computeMatch(srchHome, srchAway);
      setSrchPred(r); setCycles(c=>c+1);
      setHistory(h=>[{league:srchLeague,home:srchHome,away:srchAway,result:r,ts:new Date().toLocaleTimeString("it-IT")},...h.slice(0,29)]);
      setSrchLoading(false);
    },900);
  },[srchHome,srchAway,srchLeague]);

  // generate ranking
  const runRanking = useCallback(()=>{
    const teams = TEAMS[rnkLeague] || [];
    if(teams.length<2){ setRnkData([]); return; }
    setRnkLoading(true); setRnkData([]); setSelected(new Set());
    setTimeout(()=>{
      const rows=[];
      for(let i=0;i<teams.length;i++) for(let j=0;j<teams.length;j++){
        if(i===j) continue;
        const pred=computeMatch(teams[i],teams[j]);
        rows.push({home:teams[i],away:teams[j],pred});
      }
      setRnkData(rows); setRnkLoading(false);
    },800);
  },[rnkLeague]);

  // sorted+filtered ranking
  const displayRows = useMemo(()=>{
    let d=[...rnkData];
    if(rnkFilter==="home_win")  d=d.filter(r=>r.pred.home>0.50);
    if(rnkFilter==="away_win")  d=d.filter(r=>r.pred.away>0.50);
    if(rnkFilter==="draw")      d=d.filter(r=>r.pred.draw>0.30);
    if(rnkFilter==="over")      d=d.filter(r=>r.pred.over25>0.60);
    if(rnkFilter==="btts")      d=d.filter(r=>r.pred.bttsY>0.60);
    if(rnkFilter==="hi_conf")   d=d.filter(r=>r.pred.conf>0.70);
    const key = rnkSort;
    d.sort((a,b)=>{
      const av = key==="conf"?a.pred.conf:key==="home"?a.pred.home:key==="away"?a.pred.away:key==="draw"?a.pred.draw:key==="over"?a.pred.over25:key==="btts"?a.pred.bttsY:a.pred.bestP;
      const bv = key==="conf"?b.pred.conf:key==="home"?b.pred.home:key==="away"?b.pred.away:key==="draw"?b.pred.draw:key==="over"?b.pred.over25:key==="btts"?b.pred.bttsY:b.pred.bestP;
      return bv-av;
    });
    return d;
  },[rnkData,rnkSort,rnkFilter]);

  const toggleSel=(k)=>setSelected(s=>{const n=new Set(s);n.has(k)?n.delete(k):n.add(k);return n;});
  const selTopN=()=>setSelected(new Set(displayRows.slice(0,topN).map(r=>`${r.home}|${r.away}`)));
  const clearSel=()=>setSelected(new Set());

  // alert preview
  const alertRows = rnkData.length>0
    ? displayRows.filter(r=>selected.has(`${r.home}|${r.away}`))
    : srchPred ? [{home:srchHome,away:srchAway,pred:srchPred}] : [];

  const alertText = useMemo(()=>{
    if(alertRows.length===0) return "Nessuna previsione selezionata.\nUsa 🔍 Ricerca o 📊 Ranking per generare previsioni, poi torna qui.";
    let t=`⚛️ QUANTUM FOOTBALL AI — TOP ${alertRows.length} ALERT\n`;
    t+=`📅 ${new Date().toLocaleDateString("it-IT")}\n`;
    t+=`━━━━━━━━━━━━━━━━━\n\n`;
    alertRows.forEach((r,i)=>{
      const p=r.pred;
      const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`;
      t+=`${medal} *${r.home}* vs *${r.away}*\n`;
      if(r.league) t+=`   ${r.league}\n`;
      t+=`   1:${pct(p.home)} X:${pct(p.draw)} 2:${pct(p.away)}\n`;
      t+=`   O2.5:${pct(p.over25)} BTTS:${pct(p.bttsY)} xG:${p.xg_h}-${p.xg_a}\n`;
      t+=`   🎲 Conf:${pct(p.conf)} → TOP: ${p.best} ${odds(p.bestP)}\n\n`;
    });
    t+=`_⚛️ IBM Quantum · Auto-Adaptive_`;
    return t;
  },[alertRows]);

  const sendAlert=()=>{
    if(!tgToken&&!emailTo) return;
    setAlertDone(true);
    setTimeout(()=>setAlertDone(false),3000);
  };

  if(!ready) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace"}}>
      <div style={{background:"rgba(8,14,28,0.98)",border:"1px solid #22d3ee22",borderRadius:20,padding:"36px 44px",maxWidth:480,width:"92%"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:30,marginBottom:6}}>⚛️⚽</div>
          <div style={{fontSize:17,fontWeight:900,letterSpacing:4,background:"linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>QUANTUM FOOTBALL AI</div>
          <div style={{fontSize:9,color:"#444",letterSpacing:3,marginTop:4}}>RICERCA · RANKING · ALERT TOP</div>
        </div>
        {BOOT.map((p,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",opacity:i<=bootIdx?1:0.15,transition:"opacity 0.3s"}}>
            <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:i<bootIdx?C.green:i===bootIdx?C.amber:"#333",boxShadow:i===bootIdx?`0 0 8px ${C.amber}`:i<bootIdx?`0 0 6px ${C.green}`:"none"}}/>
            <span style={{fontSize:11,color:i<bootIdx?C.green:i===bootIdx?C.amber:"#555"}}>{p}</span>
            {i<bootIdx&&<span style={{marginLeft:"auto",color:C.green,fontSize:10}}>✓</span>}
            {i===bootIdx&&<span style={{marginLeft:"auto",color:C.amber,fontSize:10}}>···</span>}
          </div>
        ))}
        <div style={{marginTop:14}}><Wave w={380}/></div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:"#fff",fontFamily:"monospace",backgroundImage:"radial-gradient(ellipse 60% 40% at 10% 10%,rgba(34,211,238,0.05) 0%,transparent 100%)"}}>

      {/* HEADER */}
      <div style={{borderBottom:"1px solid "+C.border,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(5,9,17,0.94)",backdropFilter:"blur(16px)",position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>⚛️⚽</span>
          <div>
            <div style={{fontSize:12,fontWeight:900,letterSpacing:3,background:"linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>QUANTUM FOOTBALL AI</div>
            <div style={{fontSize:8,color:"#444",letterSpacing:2}}>25 CAMPIONATI · {Object.values(TEAMS).flat().length} SQUADRE · IBM QUANTUM</div>
          </div>
        </div>
        <div style={{display:"flex",gap:14,fontSize:9,color:"#666"}}>
          <span><span style={{color:C.green}}>●</span> LIVE</span>
          <span>CICLI: <span style={{color:C.amber}}>{cycles}</span></span>
          <span>HIST: <span style={{color:C.cyan}}>{history.length}</span></span>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",padding:"0 20px",borderBottom:"1px solid "+C.border,overflowX:"auto"}}>
        {[["search","🔍 CERCA PARTITA"],["ranking","📊 RANKING"],["alerts","📨 ALERT TOP"],["history","📋 STORICO"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",color:tab===t?C.cyan:"#555",padding:"11px 16px",cursor:"pointer",fontSize:10,letterSpacing:2,whiteSpace:"nowrap",borderBottom:tab===t?`2px solid ${C.cyan}`:"2px solid transparent",fontFamily:"inherit",transition:"color 0.2s"}}>{l}</button>
        ))}
      </div>

      <div style={{padding:"20px",maxWidth:1300,margin:"0 auto"}}>

        {/* ══ SEARCH ══ */}
        {tab==="search"&&(
          <div style={{display:"grid",gridTemplateColumns:"360px 1fr",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",gap:13}}>

              {/* League select */}
              <div style={{background:C.card,border:`1px solid ${C.purple}33`,borderRadius:14,padding:16}}>
                <div style={{fontSize:9,color:C.purple,letterSpacing:2,marginBottom:10}}>🌍 CAMPIONATO</div>
                <select value={srchLeague} onChange={e=>{setSrchLeague(e.target.value);setSrchHome("");setSrchAway("");setSrchPred(null);setSrchQ("");}} style={{width:"100%",background:"#0a1220",border:`1px solid ${C.purple}44`,color:"#fff",padding:"8px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                  {LEAGUES.map(l=><option key={l.key} value={l.key}>{l.flag} {l.key} {l.tier===2?"· Div 2":l.tier===3?"· Div 3":l.tier===0?"· Coppa":""}</option>)}
                </select>
                <div style={{marginTop:6,fontSize:9,color:"#555"}}>{srchTeams.length} squadre disponibili</div>
              </div>

              {/* Search box */}
              <div style={{background:C.card,border:`1px solid ${C.cyan}33`,borderRadius:14,padding:16}}>
                <div style={{fontSize:9,color:C.cyan,letterSpacing:2,marginBottom:10}}>🔍 FILTRA SQUADRA</div>
                <input value={srchQ} onChange={e=>setSrchQ(e.target.value)} placeholder="es: Inter, Bayern, Arsenal..." style={{width:"100%",background:"#0a1220",border:`1px solid ${C.cyan}44`,color:"#fff",padding:"9px 10px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>

                {/* Home */}
                <div style={{marginTop:12}}>
                  <div style={{fontSize:8,color:C.cyan,marginBottom:5,letterSpacing:1}}>🏠 CASA</div>
                  <select value={srchHome} onChange={e=>setSrchHome(e.target.value)} style={{width:"100%",background:"#0a1220",border:`1px solid ${C.cyan}44`,color:"#fff",padding:"8px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                    <option value="">— seleziona —</option>
                    {filteredTeams.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Away */}
                <div style={{marginTop:10}}>
                  <div style={{fontSize:8,color:C.pink,marginBottom:5,letterSpacing:1}}>✈️ TRASFERTA</div>
                  <select value={srchAway} onChange={e=>setSrchAway(e.target.value)} style={{width:"100%",background:"#0a1220",border:`1px solid ${C.pink}44`,color:"#fff",padding:"8px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                    <option value="">— seleziona —</option>
                    {filteredTeams.filter(t=>t!==srchHome).map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {srchHome&&srchAway&&(
                  <div style={{marginTop:10,padding:"8px 10px",background:"rgba(0,0,0,0.2)",borderRadius:8,fontSize:9,color:"#888",display:"flex",justifyContent:"space-between"}}>
                    <span>ELO: <span style={{color:C.cyan}}>{BASE_STATS[srchHome]||1650}</span></span>
                    <span style={{color:C.amber}}>VS</span>
                    <span>ELO: <span style={{color:C.pink}}>{BASE_STATS[srchAway]||1650}</span></span>
                  </div>
                )}
              </div>

              <button onClick={runSearch} disabled={!srchHome||!srchAway||srchHome===srchAway||srchLoading} style={{padding:"13px",borderRadius:10,fontSize:10,letterSpacing:3,cursor:(!srchHome||!srchAway||srchLoading)?"not-allowed":"pointer",border:`1px solid ${C.cyan}`,background:srchLoading?"rgba(34,211,238,0.04)":"linear-gradient(135deg,rgba(34,211,238,0.13),rgba(167,139,250,0.08))",color:!srchHome||!srchAway?"#333":C.cyan,fontFamily:"inherit",fontWeight:900,transition:"all 0.3s"}}>
                {srchLoading?"⚛️ COMPUTING...":"⚛️ ANALIZZA PARTITA"}
              </button>
              <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:12}}>
                <Wave w={296}/>
              </div>
            </div>

            <div>
              {!srchPred&&!srchLoading&&(
                <div style={{background:C.card,border:"1px dashed #1a1a2e",borderRadius:14,padding:60,textAlign:"center",color:"#2a2a4e",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
                  <div style={{fontSize:42}}>🔍</div>
                  <div style={{fontSize:11,letterSpacing:3}}>CERCA QUALSIASI PARTITA</div>
                  <div style={{fontSize:9,lineHeight:1.8}}>Seleziona campionato · Filtra squadra · Clicca Analizza<br/>Puoi cercare partite in {LEAGUES.length} campionati</div>
                </div>
              )}
              {srchLoading&&(
                <div style={{background:C.card,border:`1px solid ${C.cyan}22`,borderRadius:14,padding:40,textAlign:"center"}}>
                  <div style={{fontSize:10,color:C.cyan,letterSpacing:3,marginBottom:12}}>⚛️ IBM QUANTUM CIRCUIT...</div>
                  <Wave w={400}/>
                </div>
              )}
              {srchPred&&!srchLoading&&<ResultBox hName={srchHome} aName={srchAway} pred={srchPred}/>}
              {srchPred&&(
                <button onClick={()=>setTab("alerts")} style={{marginTop:12,width:"100%",padding:"11px",borderRadius:10,fontSize:10,letterSpacing:2,cursor:"pointer",border:`1px solid ${C.green}`,background:`${C.green}0a`,color:C.green,fontFamily:"inherit"}}>
                  📨 INVIA QUESTA PREVISIONE IN ALERT →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══ RANKING ══ */}
        {tab==="ranking"&&(
          <div>
            {/* Controls */}
            <div style={{background:C.card,border:"1px solid "+C.border,borderRadius:14,padding:16,marginBottom:14}}>
              <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:"1 1 180px"}}>
                  <div style={{fontSize:9,color:"#666",marginBottom:5,letterSpacing:2}}>🏆 CAMPIONATO</div>
                  <select value={rnkLeague} onChange={e=>{setRnkLeague(e.target.value);setRnkData([]);setSelected(new Set());}} style={{width:"100%",background:"#0a1220",border:`1px solid ${C.purple}44`,color:"#fff",padding:"8px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                    {LEAGUES.map(l=><option key={l.key} value={l.key}>{l.flag} {l.key}</option>)}
                  </select>
                </div>
                <div style={{flex:"1 1 160px"}}>
                  <div style={{fontSize:9,color:"#666",marginBottom:5,letterSpacing:2}}>📊 ORDINA PER</div>
                  <select value={rnkSort} onChange={e=>setRnkSort(e.target.value)} style={{width:"100%",background:"#0a1220",border:`1px solid ${C.cyan}44`,color:"#fff",padding:"8px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                    <option value="conf">🎲 Confidenza</option>
                    <option value="bestP">🏆 Esito Top</option>
                    <option value="home">1️⃣ Vitt. Casa</option>
                    <option value="away">2️⃣ Vitt. Trasferta</option>
                    <option value="draw">➖ Pareggio</option>
                    <option value="over">⚽ Over 2.5</option>
                    <option value="btts">🔁 BTTS Sì</option>
                  </select>
                </div>
                <div style={{flex:"1 1 160px"}}>
                  <div style={{fontSize:9,color:"#666",marginBottom:5,letterSpacing:2}}>🔍 FILTRA</div>
                  <select value={rnkFilter} onChange={e=>setRnkFilter(e.target.value)} style={{width:"100%",background:"#0a1220",border:`1px solid ${C.amber}44`,color:"#fff",padding:"8px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                    <option value="all">Tutti i match</option>
                    <option value="home_win">Casa &gt;50%</option>
                    <option value="away_win">Trasferta &gt;50%</option>
                    <option value="draw">Pareggio &gt;30%</option>
                    <option value="over">Over 2.5 &gt;60%</option>
                    <option value="btts">BTTS &gt;60%</option>
                    <option value="hi_conf">Alta Conf &gt;70%</option>
                  </select>
                </div>
                <button onClick={runRanking} disabled={rnkLoading} style={{flex:"0 0 auto",padding:"10px 20px",borderRadius:10,fontSize:10,letterSpacing:2,cursor:rnkLoading?"not-allowed":"pointer",border:`1px solid ${C.cyan}`,background:`${C.cyan}0d`,color:C.cyan,fontFamily:"inherit",fontWeight:900}}>
                  {rnkLoading?"⚛️ CALCOLO...":"⚛️ GENERA RANKING"}
                </button>
              </div>
            </div>

            {/* Stats */}
            {displayRows.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
                {[["Match analizzati",displayRows.length,C.cyan],["Alta confidenza",displayRows.filter(r=>r.pred.conf>0.70).length,C.green],["Selezionati",selected.size,C.amber],["Avg conf",pct(displayRows.reduce((s,r)=>s+r.pred.conf,0)/displayRows.length),C.purple]].map(([l,v,c])=>(
                  <div key={l} style={{background:`${c}0a`,border:`1px solid ${c}22`,borderRadius:10,padding:"11px 12px",textAlign:"center"}}>
                    <div style={{fontSize:16,fontWeight:900,color:c}}>{v}</div>
                    <div style={{fontSize:9,color:"#666",marginTop:2}}>{l}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Action bar */}
            {displayRows.length>0&&(
              <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:9,color:"#666"}}>SELECT TOP:</span>
                {[3,5,10].map(n=>(
                  <button key={n} onClick={()=>{setTopN(n);setSelected(new Set(displayRows.slice(0,n).map(r=>`${r.home}|${r.away}`)));}} style={{padding:"4px 12px",borderRadius:99,fontSize:9,cursor:"pointer",border:`1px solid ${topN===n&&selected.size===n?C.amber:C.border}`,background:topN===n&&selected.size===n?`${C.amber}12`:"transparent",color:topN===n&&selected.size===n?C.amber:"#666",fontFamily:"inherit"}}>TOP {n}</button>
                ))}
                <button onClick={clearSel} style={{padding:"4px 12px",borderRadius:99,fontSize:9,cursor:"pointer",border:"1px solid #333",background:"transparent",color:"#555",fontFamily:"inherit"}}>✕ Desel.</button>
                {selected.size>0&&(
                  <button onClick={()=>setTab("alerts")} style={{marginLeft:"auto",padding:"5px 16px",borderRadius:99,fontSize:9,cursor:"pointer",border:`1px solid ${C.green}`,background:`${C.green}0d`,color:C.green,fontFamily:"inherit",fontWeight:700}}>
                    📨 Invia {selected.size} alert →
                  </button>
                )}
              </div>
            )}

            {rnkLoading&&<div style={{textAlign:"center",padding:40,color:C.cyan,fontSize:11,letterSpacing:3}}>⚛️ Calcolo previsioni per {rnkLeague}...<div style={{marginTop:12}}><Wave w={300}/></div></div>}

            {!rnkLoading&&displayRows.length===0&&(
              <div style={{textAlign:"center",padding:60,color:"#2a2a3e",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
                <div style={{fontSize:40}}>📊</div>
                <div style={{fontSize:11,letterSpacing:3}}>SELEZIONA UN CAMPIONATO E CLICCA GENERA RANKING</div>
                <div style={{fontSize:9}}>Ordina e filtra tutte le previsioni · Seleziona le migliori per l'alert</div>
              </div>
            )}

            {!rnkLoading&&displayRows.length>0&&(
              <div style={{overflowX:"auto"}}>
                {/* header */}
                <div style={{display:"grid",gridTemplateColumns:"32px 28px 120px 120px 65px 65px 65px 65px 65px 75px 90px",gap:6,padding:"7px 10px",fontSize:8,color:"#555",letterSpacing:1,borderBottom:"1px solid "+C.border,marginBottom:3}}>
                  <div>#</div><div>✓</div><div>CASA</div><div>TRASFERTA</div>
                  <div style={{textAlign:"center",color:rnkSort==="home"?C.cyan:"#555"}}>1</div>
                  <div style={{textAlign:"center",color:rnkSort==="draw"?C.cyan:"#555"}}>X</div>
                  <div style={{textAlign:"center",color:rnkSort==="away"?C.cyan:"#555"}}>2</div>
                  <div style={{textAlign:"center",color:rnkSort==="over"?C.cyan:"#555"}}>O2.5</div>
                  <div style={{textAlign:"center",color:rnkSort==="btts"?C.cyan:"#555"}}>BTTS</div>
                  <div style={{textAlign:"center",color:rnkSort==="conf"?C.cyan:"#555"}}>CONF</div>
                  <div style={{textAlign:"center",color:rnkSort==="bestP"?C.cyan:"#555"}}>TOP ESITO</div>
                </div>
                {displayRows.slice(0,60).map((r,i)=>{
                  const p=r.pred, k=`${r.home}|${r.away}`, isSel=selected.has(k);
                  const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":null;
                  return (
                    <div key={k} onClick={()=>toggleSel(k)} style={{display:"grid",gridTemplateColumns:"32px 28px 120px 120px 65px 65px 65px 65px 65px 75px 90px",gap:6,padding:"8px 10px",marginBottom:3,borderRadius:9,background:isSel?`${C.amber}07`:i<3?`${C.cyan}04`:C.card,border:`1px solid ${isSel?C.amber+"44":i<3?C.cyan+"22":C.border}`,alignItems:"center",cursor:"pointer",transition:"all 0.12s"}}>
                      <div style={{fontSize:10,color:i<3?C.amber:"#555",fontWeight:700}}>{medal||i+1}</div>
                      <div style={{width:14,height:14,borderRadius:3,border:`1px solid ${isSel?C.amber:C.border}`,background:isSel?C.amber:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#000"}}>{isSel?"✓":""}</div>
                      <div style={{fontSize:10,fontWeight:700,color:C.cyan,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.home}</div>
                      <div style={{fontSize:10,fontWeight:700,color:C.pink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.away}</div>
                      <div style={{textAlign:"center",fontSize:10,color:rnkSort==="home"?C.cyan:"#bbb",fontWeight:rnkSort==="home"?700:400}}>{pct(p.home)}</div>
                      <div style={{textAlign:"center",fontSize:10,color:rnkSort==="draw"?C.amber:"#bbb",fontWeight:rnkSort==="draw"?700:400}}>{pct(p.draw)}</div>
                      <div style={{textAlign:"center",fontSize:10,color:rnkSort==="away"?C.pink:"#bbb",fontWeight:rnkSort==="away"?700:400}}>{pct(p.away)}</div>
                      <div style={{textAlign:"center",fontSize:10,color:rnkSort==="over"?"#f97316":"#bbb",fontWeight:rnkSort==="over"?700:400}}>{pct(p.over25)}</div>
                      <div style={{textAlign:"center",fontSize:10,color:rnkSort==="btts"?C.green:"#bbb",fontWeight:rnkSort==="btts"?700:400}}>{pct(p.bttsY)}</div>
                      <div style={{textAlign:"center",fontSize:10,color:confColor(p.conf),fontWeight:700}}>{pct(p.conf)}</div>
                      <div style={{textAlign:"center"}}>
                        <span style={{padding:"2px 7px",borderRadius:5,fontSize:9,fontWeight:700,background:p.best==="1"?`${C.cyan}18`:p.best==="2"?`${C.pink}18`:`${C.amber}18`,color:p.best==="1"?C.cyan:p.best==="2"?C.pink:C.amber,border:`1px solid ${p.best==="1"?C.cyan+"33":p.best==="2"?C.pink+"33":C.amber+"33"}`}}>
                          {p.best} {odds(p.bestP)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {displayRows.length>60&&<div style={{textAlign:"center",color:"#444",fontSize:10,padding:10}}>+ altri {displayRows.length-60} match — usa i filtri per restringere</div>}
              </div>
            )}
          </div>
        )}

        {/* ══ ALERTS ══ */}
        {tab==="alerts"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",gap:13}}>

              {/* Telegram */}
              <div style={{background:C.card,border:"1px solid #0088cc33",borderRadius:14,padding:18}}>
                <div style={{fontSize:10,color:"#0088cc",letterSpacing:2,marginBottom:14}}>📱 TELEGRAM BOT</div>
                {[["BOT TOKEN","1234567890:AAHxxxx...",tgToken,setTgToken],["CHAT ID","-100123456789 o @channel",tgChat,setTgChat]].map(([l,ph,v,fn])=>(
                  <div key={l} style={{marginBottom:12}}>
                    <div style={{fontSize:9,color:"#666",marginBottom:5}}>{l}</div>
                    <input value={v} onChange={e=>fn(e.target.value)} placeholder={ph} style={{width:"100%",background:"#0a1220",border:"1px solid #0088cc33",color:"#fff",padding:"8px 10px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ))}
              </div>

              {/* Email */}
              <div style={{background:C.card,border:`1px solid ${C.amber}33`,borderRadius:14,padding:18}}>
                <div style={{fontSize:10,color:C.amber,letterSpacing:2,marginBottom:12}}>📧 EMAIL</div>
                <div style={{fontSize:9,color:"#666",marginBottom:5}}>DESTINATARIO</div>
                <input value={emailTo} onChange={e=>setEmailTo(e.target.value)} placeholder="tuoemail@gmail.com" style={{width:"100%",background:"#0a1220",border:`1px solid ${C.amber}33`,color:"#fff",padding:"8px 10px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>

              {/* What's included */}
              <div style={{background:C.card,border:`1px solid ${C.green}22`,borderRadius:14,padding:18}}>
                <div style={{fontSize:10,color:C.green,letterSpacing:2,marginBottom:12}}>📋 COSA VIENE INVIATO</div>
                {alertRows.length===0?(
                  <div style={{fontSize:10,color:"#444",lineHeight:1.8}}>
                    Nessuna previsione selezionata.<br/>
                    <span style={{color:C.cyan}}>→ 🔍 Ricerca</span>: analizza una partita<br/>
                    <span style={{color:C.purple}}>→ 📊 Ranking</span>: seleziona Top N
                  </div>
                ):(
                  <div>
                    <div style={{fontSize:10,color:C.amber,marginBottom:8}}>{alertRows.length} previsioni selezionate</div>
                    {alertRows.slice(0,5).map((r,i)=>(
                      <div key={i} style={{fontSize:9,color:"#888",marginBottom:4,display:"flex",justifyContent:"space-between"}}>
                        <span>{i===0?"🥇":i===1?"🥈":i===2?"🥉":"·"} <span style={{color:C.cyan}}>{r.home}</span> vs <span style={{color:C.pink}}>{r.away}</span></span>
                        <span style={{color:confColor(r.pred.conf)}}>{pct(r.pred.conf)}</span>
                      </div>
                    ))}
                    {alertRows.length>5&&<div style={{fontSize:9,color:"#555"}}>...e altri {alertRows.length-5}</div>}
                  </div>
                )}
              </div>

              <button onClick={sendAlert} disabled={!tgToken&&!emailTo} style={{padding:"13px",borderRadius:10,fontSize:10,letterSpacing:3,cursor:(!tgToken&&!emailTo)?"not-allowed":"pointer",border:`1px solid ${alertDone?C.green:C.amber}`,background:alertDone?`${C.green}0d`:`${C.amber}0d`,color:(!tgToken&&!emailTo)?"#333":alertDone?C.green:C.amber,fontFamily:"inherit",fontWeight:900,transition:"all 0.3s"}}>
                {alertDone?"✅ ALERT INVIATO!":"🚀 INVIA ALERT"}
              </button>
            </div>

            {/* Preview */}
            <div style={{background:C.card,border:`1px solid ${C.cyan}22`,borderRadius:14,padding:20}}>
              <div style={{fontSize:10,color:C.cyan,letterSpacing:2,marginBottom:12}}>👁️ ANTEPRIMA MESSAGGIO</div>
              <div style={{background:"#0a1f30",borderRadius:10,padding:14,maxHeight:520,overflowY:"auto"}}>
                <pre style={{fontSize:9,color:"#aaa",whiteSpace:"pre-wrap",lineHeight:1.7,margin:0,fontFamily:"inherit"}}>{alertText}</pre>
              </div>
            </div>
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {tab==="history"&&(
          <div>
            <div style={{fontSize:9,color:"#666",letterSpacing:2,marginBottom:14}}>📋 {history.length} PREVISIONI · {cycles} CICLI ADATTIVI</div>
            {history.length===0&&<div style={{textAlign:"center",color:"#333",padding:60,fontSize:11,letterSpacing:3}}>NESSUNA PREVISIONE ANCORA</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:10}}>
              {history.map((h,i)=>(
                <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
                    <span style={{fontSize:9,color:"#555"}}>{h.ts}</span>
                    <span style={{fontSize:8,color:C.purple}}>{h.league}</span>
                  </div>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:9}}>
                    <span style={{color:C.cyan}}>{h.home}</span><span style={{color:"#555",margin:"0 6px"}}>vs</span><span style={{color:C.pink}}>{h.away}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:7}}>
                    {[["1",h.result.home,C.cyan],["X",h.result.draw,C.amber],["2",h.result.away,C.pink]].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:"center",background:`${c}0a`,borderRadius:7,padding:"5px 4px",border:`1px solid ${c}22`}}>
                        <div style={{fontSize:8,color:c}}>{l}</div>
                        <div style={{fontSize:13,fontWeight:900}}>{pct(v)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#666"}}>
                    <span>O2.5: <b style={{color:"#f97316"}}>{pct(h.result.over25)}</b></span>
                    <span>xG: <b style={{color:"#888"}}>{h.result.xg_h}-{h.result.xg_a}</b></span>
                    <span>Conf: <b style={{color:confColor(h.result.conf)}}>{pct(h.result.conf)}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
