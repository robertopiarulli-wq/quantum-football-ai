import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════
const GITHUB_FIXTURES = "https://raw.githubusercontent.com/robertopiarulli-wq/quantum-football-ai/main/fixtures_today.json";
const GITHUB_PREDICTIONS = "https://raw.githubusercontent.com/robertopiarulli-wq/quantum-football-ai/main/predictions_output.json";
const GITHUB_HISTORY = "https://raw.githubusercontent.com/robertopiarulli-wq/quantum-football-ai/main/history.json";

const ELO_DB = {
  "Inter":1820,"Napoli":1795,"Milan":1778,"Juventus":1760,"Atalanta":1750,
  "Roma":1720,"Lazio":1710,"Fiorentina":1695,"Torino":1650,"Bologna":1640,
  "Udinese":1610,"Venezia":1620,"Genoa":1600,"Verona":1600,"Parma":1595,
  "Cagliari":1590,"Empoli":1580,"Como":1615,"Lecce":1610,"Monza":1615,
  "Spezia":1570,"Pisa":1545,"Sassuolo":1610,"Cremonese":1560,"Cesena":1520,
  "Catanzaro":1530,"Bari":1550,"Palermo":1560,"Sampdoria":1580,"Cosenza":1520,
  "Sudtirol":1530,"Reggiana":1535,"Modena":1540,"Brescia":1555,"Mantova":1510,
  "Cittadella":1525,"Frosinone":1545,"Juve Stabia":1505,"Salernitana":1540,
  "Carrarese":1500,"Avellino":1490,"Benevento":1510,"Foggia":1465,
  "Man City":1870,"Arsenal":1840,"Liverpool":1835,"Chelsea":1790,
  "Tottenham":1775,"Man United":1760,"Newcastle":1745,"Aston Villa":1740,
  "Real Madrid":1880,"Barcelona":1855,"Atletico":1820,"Sevilla":1740,
  "Bayern":1860,"Bayer Leverkusen":1830,"Dortmund":1800,"RB Leipzig":1790,
  "PSG":1875,"Monaco":1760,"Marseille":1740,"Lille":1720,
  "Ajax":1780,"PSV":1800,"Feyenoord":1790,
  "Benfica":1800,"Porto":1795,"Sporting CP":1785,
  "Galatasaray":1780,"Fenerbahce":1775,"Besiktas":1730,
};

// ── QUANTUM ENGINE ───────────────────────────────────
function hadamard(p){
  const t=Math.acos(Math.sqrt(Math.max(0.01,Math.min(0.99,p))))+(Math.random()-0.5)*0.07;
  return Math.cos(t)**2;
}
function qCircuit(h,d,a){
  let qh=hadamard(h),qd=hadamard(d),qa=hadamard(a);
  const e=0.025*(qh-qa); qh+=e; qa-=e;
  const s=qh+qd+qa; return[qh/s,qd/s,qa/s];
}
function poisson(l,k){let f=1;for(let i=1;i<=k;i++)f*=i;return Math.exp(-l)*Math.pow(l,k)/f;}

function computeMatch(hName,aName){
  const helo=ELO_DB[hName]||1650, aelo=ELO_DB[aName]||1650;
  const hxg=helo>1800?2.1:helo>1700?1.6:1.2;
  const axg=aelo>1800?2.1:aelo>1700?1.6:1.2;
  const hxga=helo>1800?0.9:helo>1700?1.1:1.3;
  const axga=aelo>1800?0.9:aelo>1700?1.1:1.3;
  const ep=1/(1+Math.pow(10,(aelo-helo-60)/400));
  let rH=ep*0.40+0.55*0.35+Math.random()*0.04*0.25;
  let rD=Math.max(0.10,0.27-Math.abs(helo-aelo)*0.00015);
  rH+=(hxg-axg)*0.03;
  let rA=Math.max(0.05,1-rH-rD);
  const[qh,qd,qa]=qCircuit(rH,rD,rA);
  const s=qh+qd+qa;
  const home=qh/s,draw=qd/s,away=qa/s;
  const lh=(hxg+axga)/2,la=(axg+hxga)/2;
  const pOver=Math.max(0.20,Math.min(0.85,1-poisson(lh+la,0)-poisson(lh+la,1)-poisson(lh+la,2)));
  const btts=Math.min(0.85,(1-Math.exp(-lh))*(1-Math.exp(-la)));
  const ent=-(home*Math.log(Math.max(0.001,home))+draw*Math.log(Math.max(0.001,draw))+away*Math.log(Math.max(0.001,away)));
  const conf=1-ent/Math.log(3);
  const bv=Math.max(home,draw,away);
  return{home,draw,away,dc1x:home+draw,dcx2:draw+away,dc12:home+away,
    over25:pOver,under25:1-pOver,bttsY:btts,bttsN:1-btts,
    xg_h:lh.toFixed(2),xg_a:la.toFixed(2),conf,best:bv===home?"1":bv===away?"2":"X",bestP:bv};
}

// ── UI HELPERS ───────────────────────────────────────
const C={bg:"#050911",card:"rgba(255,255,255,0.03)",border:"rgba(255,255,255,0.07)",
  cyan:"#22d3ee",pink:"#f472b6",amber:"#f59e0b",green:"#34d399",purple:"#a78bfa",red:"#f87171"};
const pct=v=>`${(v*100).toFixed(1)}%`;
const oddStr=v=>`@${(1/Math.max(0.01,v)).toFixed(2)}`;
const confColor=c=>c>0.70?C.green:c>0.55?C.amber:C.red;

function Bar({val,color,label}){
  const p=Math.round(val*100);
  return(
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#999",marginBottom:3}}>
        <span>{label}</span>
        <span style={{color:"#fff",fontWeight:800}}>{p}% <span style={{color:"#555",fontSize:9}}>{oddStr(val)}</span></span>
      </div>
      <div style={{background:"rgba(255,255,255,0.05)",borderRadius:99,height:8,overflow:"hidden"}}>
        <div style={{height:"100%",width:p+"%",borderRadius:99,background:`linear-gradient(90deg,${color}55,${color})`,transition:"width 0.8s ease"}}/>
      </div>
    </div>
  );
}

function Wave({w=300}){
  const r=useRef(null),a=useRef(null);
  useEffect(()=>{
    const cv=r.current;if(!cv)return;
    const ctx=cv.getContext("2d");let t=0;
    const draw=()=>{
      ctx.clearRect(0,0,w,36);
      [[C.cyan,1,3],[C.pink,1.3,2.5],[C.purple,0.7,2]].forEach(([c,sp,amp])=>{
        ctx.beginPath();
        for(let x=0;x<w;x++){const y=18+Math.sin(x/w*Math.PI*5*sp+t)*amp*Math.cos(x/w*Math.PI*2);x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
        ctx.strokeStyle=c+"55";ctx.lineWidth=1.5;ctx.stroke();
      });
      t+=0.035;a.current=requestAnimationFrame(draw);
    };
    draw();return()=>cancelAnimationFrame(a.current);
  },[w]);
  return <canvas ref={r} width={w} height={36} style={{display:"block",width:"100%",height:36}}/>;
}

function FixCard({fix,expanded,onToggle}){
  const p=fix.pred;
  if(!p)return null;
  return(
    <div style={{background:C.card,border:`1px solid ${expanded?C.cyan+"44":C.border}`,borderRadius:12,padding:14,cursor:"pointer",transition:"border-color 0.2s"}} onClick={onToggle}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#888",marginBottom:8}}>
        <span style={{color:C.purple,fontSize:9}}>{fix.league}</span>
        <span style={{fontSize:11,fontWeight:600,color:"#aaa",marginLeft:8}}>{fix.date} {fix.time||""}</span>
      </div>
      <div style={{textAlign:"center",fontSize:13,fontWeight:700,marginBottom:10}}>
        <span style={{color:C.cyan}}>{fix.home}</span>
        <span style={{color:"#444",margin:"0 8px"}}>vs</span>
        <span style={{color:C.pink}}>{fix.away}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
        {[["1",p.home,C.cyan],["X",p.draw,C.amber],["2",p.away,C.pink]].map(([l,v,c])=>(
          <div key={l} style={{textAlign:"center",background:`${c}0a`,borderRadius:8,padding:"6px 4px",border:`1px solid ${c}22`}}>
            <div style={{fontSize:8,color:c}}>{l}</div>
            <div style={{fontSize:14,fontWeight:900}}>{pct(v)}</div>
            <div style={{fontSize:8,color:"#555"}}>{oddStr(v)}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#666"}}>
        <span>O2.5 <b style={{color:"#f97316"}}>{pct(p.over25)}</b></span>
        <span>BTTS <b style={{color:C.green}}>{pct(p.bttsY)}</b></span>
        <span>xG <b>{p.xg_h}–{p.xg_a}</b></span>
        <span>Conf <b style={{color:confColor(p.conf)}}>{pct(p.conf)}</b></span>
      </div>
      {fix.pp&&fix.pp.pp_label&&(
        <div style={{marginTop:4,display:"flex",alignItems:"center",gap:8,fontSize:9}}>
          <span style={{color:"#a78bfa",letterSpacing:1}}>⚡ PP</span>
          <span style={{fontWeight:900,color:fix.pp.pp_result==="1"?C.cyan:fix.pp.pp_result==="2"?C.pink:fix.pp.pp_result==="12"?C.amber:fix.pp.pp_result==="1X"?"#34d399":fix.pp.pp_result==="X2"?"#f97316":"#aaa"}}>{fix.pp.pp_label}</span>
          <span style={{color:"#444"}}>I={fix.pp.pp_i_casa>0?"+":""}{fix.pp.pp_i_casa?.toFixed(1)}/{fix.pp.pp_i_ospite>0?"+":""}{fix.pp.pp_i_ospite?.toFixed(1)}</span>
          <span style={{color:"#444"}}>D={fix.pp.pp_D>0?"+":""}{fix.pp.pp_D?.toFixed(1)}</span>
          <span style={{background:"#0a1a2e",borderRadius:4,padding:"1px 6px",color:"#a78bfa"}}>{fix.pp.pp_pct?.toFixed(0)}%</span>
        </div>
      )}
      {expanded&&(
        <div style={{marginTop:12,borderTop:"1px solid "+C.border,paddingTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:8,color:"#555",letterSpacing:2,marginBottom:8}}>⚡ GOAL</div>
            <Bar val={p.over25} color="#f97316" label="Over 2.5"/>
            <Bar val={p.under25} color="#64748b" label="Under 2.5"/>
            <Bar val={p.bttsY} color={C.amber} label="BTTS Sì"/>
          </div>
          <div>
            <div style={{fontSize:8,color:"#555",letterSpacing:2,marginBottom:8}}>🎯 DOPPIA CHANCE</div>
            <Bar val={p.dc1x} color={C.purple} label="1X"/>
            <Bar val={p.dcx2} color={C.pink} label="X2"/>
            <Bar val={p.dc12} color={C.green} label="12"/>
          </div>
          {fix.pp&&fix.pp.pp_label&&(
            <div style={{gridColumn:"1/-1",marginTop:8,padding:"10px 12px",background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:10}}>
              <div style={{fontSize:8,color:"#a78bfa",letterSpacing:2,marginBottom:6}}>⚡ PP INDEX · KPZ / α⁻¹=137 · ULTIME 3 PARTITE</div>
              <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{fontSize:14,fontWeight:900,color:fix.pp.pp_result==="1"?C.cyan:fix.pp.pp_result==="2"?C.pink:fix.pp.pp_result==="12"?C.amber:fix.pp.pp_result==="1X"?"#34d399":fix.pp.pp_result==="X2"?"#f97316":"#aaa"}}>
                  {fix.pp.pp_label}
                </div>
                <div style={{fontSize:9,color:"#555",display:"flex",gap:10}}>
                  <span>I casa: <b style={{color:"#ccc"}}>{fix.pp.pp_i_casa>0?"+":""}{fix.pp.pp_i_casa?.toFixed(2)}</b></span>
                  <span>I ospite: <b style={{color:"#ccc"}}>{fix.pp.pp_i_ospite>0?"+":""}{fix.pp.pp_i_ospite?.toFixed(2)}</b></span>
                  <span>D: <b style={{color:"#a78bfa"}}>{fix.pp.pp_D>0?"+":""}{fix.pp.pp_D?.toFixed(2)}</b></span>
                </div>
                <div style={{marginLeft:"auto",background:"#0a1a2e",borderRadius:6,padding:"4px 10px",textAlign:"center"}}>
                  <div style={{fontSize:8,color:"#555"}}>SCALA</div>
                  <div style={{fontSize:13,fontWeight:900,color:"#a78bfa"}}>{fix.pp.pp_pct?.toFixed(0)}%</div>
                </div>
              </div>
              <div style={{marginTop:8,background:"#0a0f1a",borderRadius:4,height:6,position:"relative"}}>
                <div style={{position:"absolute",left:0,top:0,width:"100%",height:"100%",borderRadius:4,background:"linear-gradient(90deg,#f472b6,#555,#22d3ee)"}}/>
                <div style={{position:"absolute",top:-3,width:3,height:12,background:"#fff",borderRadius:2,
                  left:`${Math.max(0,Math.min(100,fix.pp.pp_pct))}%`,transform:"translateX(-50%)"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:7,color:"#333",marginTop:2}}>
                <span>-13.7 (Ospite domina)</span><span>0 (Equilibrio)</span><span>+13.7 (Casa domina)</span>
              </div>
            </div>
          )}
          {/* OV Score */}
          {expanded&&fix.ov&&fix.ov.score!=null&&(
            <div style={{gridColumn:"1/-1",marginTop:8,padding:"10px 12px",background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:10}}>
              <div style={{fontSize:8,color:"#f59e0b",letterSpacing:2,marginBottom:8}}>💰 OV SCORE — ODDS VALUE</div>
              <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:900,color:fix.ov.score>=70?"#4caf50":fix.ov.score>=50?"#f59e0b":"#f87171"}}>{fix.ov.score?.toFixed(0)}<span style={{fontSize:10,color:"#555"}}>/100</span></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4,flex:1,fontSize:9}}>
                  {fix.ov.pin1&&<div><span style={{color:"#555"}}>Pinnacle: </span><b style={{color:"#22d3ee"}}>{fix.ov.pin1} / {fix.ov.pinX} / {fix.ov.pin2}</b></div>}
                  {fix.ov.b365_1&&<div><span style={{color:"#555"}}>Bet365:   </span><b style={{color:"#f472b6"}}>{fix.ov.b365_1} / {fix.ov.b365_X} / {fix.ov.b365_2}</b></div>}
                  <div style={{display:"flex",gap:10}}>
                    {fix.ov.edge!=null&&<span><span style={{color:"#555"}}>Edge: </span><b style={{color:fix.ov.edge>0?"#4caf50":"#f87171"}}>{fix.ov.edge>0?"+":""}{fix.ov.edge?.toFixed(1)}%</b></span>}
                    {fix.ov.misalign!=null&&<span><span style={{color:"#555"}}>Misalign: </span><b style={{color:"#f59e0b"}}>{fix.ov.misalign?.toFixed(1)}%</b></span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LEAGUES_ORDER=["Serie A","Serie B","Coppa Italia","Champions League","Europa League","Conference League","Premier League","Championship","La Liga","Bundesliga","Ligue 1","Eredivisie","Primeira Liga"];
const BOOT=["⚛️ Init IBM Quantum Runtime","📡 Caricamento calendario dal repo",
  "🧬 Feature Engineering (28 features)","✅ Sistema pronto"];

export default function App(){
  const[bootIdx,setBootIdx]=useState(-1);
  const[ready,setReady]=useState(false);
  const[tab,setTab]=useState("oggi");
  const[fixtures,setFixtures]=useState([]);
  const[fixLoading,setFixLoading]=useState(false);
  const[fixDate,setFixDate]=useState("");
  const[fixError,setFixError]=useState("");
  const[expanded,setExpanded]=useState(null);
  const[filterLeague,setFilterLeague]=useState("Tutti");
  const[rnkSort,setRnkSort]=useState("conf");
  const[rnkExpanded,setRnkExpanded]=useState(null);
  const[multiSort,setMultiSort]=useState("score");
  const[parixSort,setParixSort]=useState("score");
  const[parixExpanded,setParixExpanded]=useState(null);
  const[multiExpanded,setMultiExpanded]=useState(null);
  const[comboExpanded,setComboExpanded]=useState(null);
  const[comboSort,setComboSort]=useState("cassa");
  const[maskStake,setMaskStake]=useState(100);
  const[maskFisse,setMaskFisse]=useState(3);
  const[maskStep,setMaskStep]=useState(3);
  const[maskRiduzione,setMaskRiduzione]=useState(50);
  const[maskEvMin,setMaskEvMin]=useState(10);
  const[maskQuotaMin,setMaskQuotaMin]=useState(1.20);
  const[maskScoreMin,setMaskScoreMin]=useState(30);
  const[maskOvMin,setMaskOvMin]=useState(30);
  const[maskFisseStep1,setMaskFisseStep1]=useState(3);
  const[maskDoppiePerStep,setMaskDoppiePerStep]=useState(1);
  const[maskDoppieStep1,setMaskDoppieStep1]=useState(0);
  const[maskSelectedCombo,setMaskSelectedCombo]=useState(0);
  const[selectedMulti,setSelectedMulti]=useState(0);
  const[topExpanded,setTopExpanded]=useState(null);
  const[homeInput,setHomeInput]=useState("");
  const[awayInput,setAwayInput]=useState("");
  const[manualPred,setManualPred]=useState(null);
  const[manualLoading,setManualLoading]=useState(false);
  const[history,setHistory]=useState([]);
  const[cycles,setCycles]=useState(0);
  const[allPreds,setAllPreds]=useState([]);
  const[histData,setHistData]=useState(null);
  const[histLoading,setHistLoading]=useState(false);
  const[risultatiData,setRisultatiData]=useState(null);
  const[risultatiLoading,setRisultatiLoading]=useState(false);
  const[risultatiSearch,setRisultatiSearch]=useState("");
  const[risultatiDate,setRisultatiDate]=useState("");

  useEffect(()=>{
    let i=0;
    const tick=()=>{setBootIdx(i);i++;if(i<BOOT.length)setTimeout(tick,250+Math.random()*180);else setTimeout(()=>setReady(true),400);};
    setTimeout(tick,300);
  },[]);

  useEffect(()=>{
    if(!ready)return;
    setFixLoading(true);
    fetch(GITHUB_FIXTURES)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(d&&d.fixtures&&d.fixtures.length>0){
          // Filtra partite passate (data < oggi) a monte — vale per tutti i tab
          const now=new Date();
          const todayStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
          const futureFixtures=d.fixtures.filter(f=>{
            if(!f.date) return true;
            const p=f.date.split("/");
            if(p.length!==3) return true;
            return `${p[2]}-${p[1]}-${p[0]}`>=todayStr;
          });
          setFixtures(futureFixtures);
          setFixDate(d.date||"");
          setCycles(d.fixtures.length);
        } else {
          setFixError("Nessuna partita disponibile. Il workflow gira ogni mattina alle 9:00.");
        }
        setFixLoading(false);
      })
      .catch(()=>{
        setFixError("File fixtures_today.json non trovato nel repo. Esegui il workflow manualmente da GitHub Actions.");
        setFixLoading(false);
      });
  },[ready]);

  // Carica predictions_output.json per tab CERCA
  useEffect(()=>{
    if(!ready)return;
    fetch(GITHUB_PREDICTIONS)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(d&&Array.isArray(d))setAllPreds(d);
      })
      .catch(()=>{});
  },[ready]);

  // Carica history.json per tab PERFORMANCE
  useEffect(()=>{
    if(!ready||tab!=="perf"||histData||histLoading)return;
    setHistLoading(true);
    fetch(GITHUB_HISTORY)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(d&&d.predictions){
          const verified=d.predictions.filter(p=>p.result!==null&&p.result!==undefined);
          setHistData(verified);
        }
        setHistLoading(false);
      })
      .catch(()=>setHistLoading(false));
  },[ready,tab,histData,histLoading]);

  // Carica history.json per tab RISULTATI
  useEffect(()=>{
    if(!ready||tab!=="risultati"||risultatiData||risultatiLoading)return;
    setRisultatiLoading(true);
    fetch(GITHUB_HISTORY)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(d&&d.predictions){
          const verified=d.predictions
            .filter(p=>p.result!==null&&p.result!==undefined)
            .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
          setRisultatiData(verified);
        }
        setRisultatiLoading(false);
      })
      .catch(()=>setRisultatiLoading(false));
  },[ready,tab,risultatiData,risultatiLoading]);

  const leagues=useMemo(()=>{
    const s=new Set(fixtures.map(f=>f.league));
    return["Tutti",...LEAGUES_ORDER.filter(l=>s.has(l)),...[...s].filter(l=>!LEAGUES_ORDER.includes(l))];
  },[fixtures]);

  const filtered=useMemo(()=>{
    const base=filterLeague==="Tutti"?fixtures:fixtures.filter(f=>f.league===filterLeague);
    const upcoming=base;
    const toSortKey=f=>{
      if(!f.date) return "9999-99-99"+(f.time||"");
      const p=f.date.split("/");
      return p.length===3?`${p[2]}-${p[1]}-${p[0]}`+(f.time||""):(f.date||"")+(f.time||"");
    };
    return[...upcoming].sort((a,b)=>toSortKey(a).localeCompare(toSortKey(b)));
  },[fixtures,filterLeague]);

  const calcMultipla = f => {
    if(!f.pred) return null;
    const h=f.pred.home||0, x=f.pred.draw||0, a=f.pred.away||0;
    const conf  = f.pred.conf||0;
    const ovNorm = (f.ov?.score||0)/76;  // normalizzato su max osservato 76

    // Quote Pinnacle no-vig
    const nv1 = f.ov?.novig_1!=null ? f.ov.novig_1/100 : null;
    const nvX = f.ov?.novig_X!=null ? f.ov.novig_X/100 : null;
    const nv2 = f.ov?.novig_2!=null ? f.ov.novig_2/100 : null;
    const pin1=f.ov?.pin1, pinX=f.ov?.pinX, pin2=f.ov?.pin2;

    // ── PREVISIONE: solo Poisson puro ──────────────────────
    const sortedP = [["1",h],["X",x],["2",a]].sort((a,b)=>b[1]-a[1]);
    const topP=sortedP[0], secP=sortedP[1];
    const gapP = topP[1]-secP[1];
    let pred_sign, pred_col;
    if(gapP > 0.20){
      pred_sign = "FISSA "+topP[0];
      pred_col  = topP[0]==="1"?C.cyan:topP[0]==="2"?C.pink:C.amber;
    } else {
      const pair=[topP[0],secP[0]].sort().join("");
      pred_sign = pair==="12"?"1-2":pair==="1X"?"1X":"X2";
      pred_col  = pair==="12"?"#a78bfa":pair==="1X"?"#34d399":"#f97316";
    }

    // ── CONCORDANZA Poisson-Pinnacle ────────────────────────
    // Pinnacle rinforza il segno dominante se concorda
    const mktFav = nv1!=null&&nvX!=null&&nv2!=null
      ? (nv1>=nvX&&nv1>=nv2?"1":nv2>=nvX?"2":"X") : null;
    const ourBest = topP[0]==="1"?h:topP[0]==="2"?a:x;
    const mktBest = topP[0]==="1"?nv1:topP[0]==="2"?nv2:nvX;
    const concordStrength = mktFav===topP[0]&&mktBest!=null
      ? Math.max(0,1-Math.abs(ourBest-mktBest)/Math.max(ourBest,0.01))
      : 0.3;

    // ── EV sul segno dominante ──────────────────────────────
    // Per FISSA X (pp_result="X"): EV calcolato sul pareggio, non sul topP Poisson
    const ppRes = (f.pp&&f.pp.pp_result)||"";
    const pinBest = ppRes==="X" ? pinX : (topP[0]==="1"?pin1:topP[0]==="2"?pin2:pinX);
    const evBest  = ppRes==="X" ? x : ourBest;
    const bestEv  = pinBest&&pinBest>0 ? (evBest*pinBest)-1 : null;

    // ── EV normalizzato ─────────────────────────────────────
    // ev>0 → boost (max a EV=25%) | ev<0 → leggera penalità
    const ev_norm = bestEv!=null
      ? (bestEv>=0 ? Math.min(1,bestEv/0.25) : Math.max(-0.3,bestEv/0.20))
      : 0;

    // ── SCORE: CONF×0.55 + OV×0.25 + Concordanza×0.10 + EV×0.10 ──
    const trendBonus = f.ov?.movement_pct!=null
      ? (f.ov.movement_pct<-2?0.05:f.ov.movement_pct>3?-0.03:0) : 0;
    const score = conf*0.60 + ovNorm*0.30 + concordStrength*0.10 + trendBonus;

    // ── LABEL ───────────────────────────────────────────────
    const label    = score>=0.75?"TOP":score>=0.65?"GOOD":score>=0.50?"MEDIUM":"AVOID";
    const labelCol = label==="TOP"?"#4caf50":label==="GOOD"?"#22d3ee":label==="MEDIUM"?"#f59e0b":"#f87171";

    // ── FLAG anomalie ───────────────────────────────────────
    let flag="—", flagCol="#555";
    if(conf>0.60&&(f.ov?.score||0)<40){flag="⚠️ TRAP";flagCol="#f87171";}
    else if((f.ov?.score||0)>65&&conf<0.40){flag="⚡ RISKY";flagCol="#f59e0b";}
    else if(f.ov?.movement_pct!=null&&f.ov.movement_pct<-5){flag="🔥 SHARP";flagCol="#4caf50";}
    else if(mktFav&&mktFav!==topP[0]){flag="⚡ DISCORDA";flagCol="#f59e0b";}

    // ── CONF-PIN (dominanza Pinnacle no-vig) ───────────────
    // Calcolato direttamente da quote Pinnacle — no-vig reale
    // Formula: pmax - media(altri due) su scale 0-100
    const confPin = f.ov?.pin1&&f.ov?.pinX&&f.ov?.pin2 ? (()=>{
      const o1=1/f.ov.pin1, oX=1/f.ov.pinX, o2=1/f.ov.pin2;
      const tot=o1+oX+o2;
      const p1=o1/tot, pX=oX/tot, p2=o2/tot;
      const sv=[p1,pX,p2].sort((a,b)=>b-a);
      return Math.round(Math.max(0,(sv[0]-(sv[1]+sv[2])/2)*100));
    })() : null;

    // ── DECISIONE automatica ────────────────────────────────
    const confPinN = confPin!=null?confPin/100:conf;
    const ovN = (f.ov?.score||0)/100;
    let decisione, decCol;
    // ── CERVELLO DECISIONALE ─────────────────────────────────
    // Partite senza dati Pinnacle → NO DATA
    const hasOV = f.ov && f.ov.score!=null && f.ov.pin1!=null;
    if(!hasOV){
      decisione="⚪ NO DATA"; decCol="#555";
    } else {
      // NO BET solo se ALMENO 2 segnali esplicitamente negativi:
      // EV < -10% | CP < 10 | OV < 30 | score < 0.40
      const negEV  = bestEv!=null && bestEv < -0.10;
      const negCP  = confPin!=null && confPin < 10;
      const negOV  = (f.ov?.score||0) < 30;
      const negSc  = score < 0.40;
      const negCount = (negEV?1:0)+(negCP?1:0)+(negOV?1:0)+(negSc?1:0);

      // Determina quale doppia giocare basandosi sul pred_sign
      const doppiaSign = ()=>{
        if(pred_sign==="FISSA 1") return "1X";
        if(pred_sign==="FISSA 2") return "X2";
        if(pred_sign==="FISSA X") return pred_sign.includes("casa")||sortedP[0][0]==="1"?"1X":"X2";
        if(pred_sign==="1-2") return "1-2";
        if(pred_sign==="1X") return "1X";
        if(pred_sign==="X2") return "X2";
        return "1-2";
      };

      if(negCount >= 2){
        decisione="❌ NO BET"; decCol="#f87171";
      } else if(score>=0.75 && confPinN>=0.50 && (f.ov?.score||0)>=65){
        // SECCO — mostra segno esatto
        const seccSign = pred_sign.replace("FISSA ","");
        decisione=`🔥 ${seccSign}`; decCol="#4caf50";
      } else if(score>=0.65 && (f.ov?.score||0)>=55){
        // 1X/X2 esplicito
        const d1x2 = doppiaSign();
        decisione=`✅ ${d1x2}`; decCol="#22d3ee";
      } else if(score>=0.50 && (f.ov?.score||0)>=35){
        // DOPPIA esplicita
        const ddop = doppiaSign();
        decisione=`⚖️ ${ddop}`; decCol="#f59e0b";
      } else {
        // DOPPIA conservativa esplicita
        const dcons = doppiaSign();
        decisione=`⚖️ ${dcons}*`; decCol="#d97706";
      }
    }

    return {score,label,labelCol,flag,flagCol,
            pred_sign,pred_col,bestEv,concordStrength,mktFav,
            confPin,decisione,decCol,
            ppSc:ppScore(f),conf};
  };

  const movBadge=(mov)=>{
    if(mov==null) return null;
    const abs=Math.abs(mov);
    // mov<0 = quota scesa (buono) → 🔻 verde | mov>0 = quota salita (cattivo) → 🔺 rosso
    const dir=mov<0?"🔻":"🔺";
    const col=mov<0?(abs>=5?"#4caf50":abs>=2?"#81c784":"#aaa"):(abs>=5?"#f87171":abs>=2?"#e57373":"#aaa");
    if(abs<1) return {icon:"➡️",col:"#555",text:"stabile",val:mov};
    return {icon:dir,col,text:`${dir}${abs.toFixed(1)}%`,val:mov};
  };

  const ppScore=f=>{
    if(!f.pred)return 0;
    const h=f.pred.home||0,x=f.pred.draw||0,a=f.pred.away||0;
    const r=(f.pp&&f.pp.pp_result)||"";
    if(r==="1")return h;
    if(r==="2")return a;
    if(r==="X")return x+Math.max(h,a);
    if(r==="1X")return h+x;
    if(r==="X2")return x+a;
    if(r==="12")return h+a;
    return Math.max(h,x,a);
  };
  const ppLabel=f=>{
    if(!f.pred)return"—";
    const h=f.pred.home||0,x=f.pred.draw||0,a=f.pred.away||0;
    const r=(f.pp&&f.pp.pp_result)||"";
    if(r==="1")return h>=0.60?"🎯 FISSA 1":"1";
    if(r==="2")return a>=0.60?"🎯 FISSA 2":"2";
    if(r==="X")return a>h?"X2":"X1";
    if(r==="1X")return"1X";
    if(r==="X2")return"X2";
    if(r==="12")return"12";
    return"—";
  };
  const ranked=useMemo(()=>{
    return[...fixtures].sort((a,b)=>{
    const v=f=>f.pred?rnkSort==="conf"?f.pred.conf:rnkSort==="home"?f.pred.home:rnkSort==="away"?f.pred.away:rnkSort==="draw"?f.pred.draw:rnkSort==="over"?f.pred.over25:rnkSort==="pp"?ppScore(f):rnkSort==="ppd"?Math.abs(f.pp?.pp_D||0):rnkSort==="ov"?(f.ov?.score||0):f.pred.bttsY:0;
      return v(b)-v(a);
    });
  },[fixtures,rnkSort]);

  const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,"");
  const teamMatch=(name,query)=>{
    const n=normalize(name), q=normalize(query);
    return n.includes(q)||q.includes(n)||n.split("").filter((c,i)=>q[i]===c).length/Math.max(n.length,q.length)>0.7;
  };
  const runManual=useCallback(()=>{
    const h=homeInput.trim(),a=awayInput.trim();
    if(!h||!a||h===a)return;
    setManualLoading(true);setManualPred(null);
    setTimeout(()=>{
      // Cerca prima in predictions_output.json (motore Python completo)
      let found=null;
      if(allPreds.length>0){
        found=allPreds.find(p=>teamMatch(p.home,h)&&teamMatch(p.away,a));
        if(!found) found=allPreds.find(p=>teamMatch(p.home,h)||teamMatch(p.away,a)||teamMatch(p.home,a)||teamMatch(p.away,h));
      }
      if(found){
        const pr=found.prediction;
        const pred={
          home:pr.home, draw:pr.draw, away:pr.away,
          over_25:pr.over_25, under_25:pr.under_25,
          btts_y:pr.btts_y, btts_n:pr.btts_n,
          xg_home:pr.xg_home, xg_away:pr.xg_away,
          dc_1x:pr.dc_1x, dc_x2:pr.dc_x2, dc_12:pr.dc_12,
          confidence:pr.confidence, best_out:pr.best_out, best_val:pr.best_val,
          source:"🐍 Motore Python · Dati reali API",
          date:found.date, time:found.time, league:found.league,
          season:found.season||"",
          stage:found.stage||"",
        };
        setManualPred({home:found.home,away:found.away,pred,pp:found.pp||null});
        setHistory(prev=>[{home:found.home,away:found.away,pred,ts:new Date().toLocaleTimeString("it-IT")},...prev.slice(0,29)]);
      } else {
        // Partita non in calendario — mostra messaggio
        setManualPred({home:h,away:a,pred:null,notFound:true});
      }
      setCycles(c=>c+1);
      setManualLoading(false);
    },600);
  },[homeInput,awayInput,allPreds]);

  if(!ready)return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace"}}>
      <div style={{background:"rgba(8,14,28,0.98)",border:"1px solid #22d3ee22",borderRadius:20,padding:"36px 44px",maxWidth:460,width:"92%"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:32,marginBottom:6}}>⚛️⚽</div>
          <div style={{fontSize:16,fontWeight:900,letterSpacing:4,background:"linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>QUANTUM FOOTBALL AI</div>
          <div style={{fontSize:9,color:"#444",letterSpacing:3,marginTop:4}}>CALENDARIO LIVE · QUANTUM ENGINE · AUTO-ADAPTIVE</div>
        </div>
        {BOOT.map((p,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 0",opacity:i<=bootIdx?1:0.15,transition:"opacity 0.3s"}}>
            <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:i<bootIdx?C.green:i===bootIdx?C.amber:"#333"}}/>
            <span style={{fontSize:11,color:i<bootIdx?C.green:i===bootIdx?C.amber:"#555"}}>{p}</span>
            {i<bootIdx&&<span style={{marginLeft:"auto",color:C.green,fontSize:10}}>✓</span>}
          </div>
        ))}
        <div style={{marginTop:14}}><Wave w={360}/></div>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:"#fff",fontFamily:"monospace"}}>
      {/* HEADER */}
      <div style={{borderBottom:"1px solid "+C.border,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(5,9,17,0.95)",backdropFilter:"blur(16px)",position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>⚛️⚽</span>
          <div>
            <div style={{fontSize:12,fontWeight:900,letterSpacing:3,background:"linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>QUANTUM FOOTBALL AI</div>
            <div style={{fontSize:8,color:"#444",letterSpacing:2}}>CALENDARIO AUTOMATICO · QUANTUM ENGINE · AUTO-ADAPTIVE</div>
          </div>
        </div>
        <div style={{display:"flex",gap:14,fontSize:9,color:"#666",alignItems:"center"}}>
          {fixDate&&<span style={{color:C.cyan}}>📅 {fixDate}</span>}
          <span>PARTITE: <span style={{color:C.amber}}>{fixtures.length}</span></span>
          <span>CICLI: <span style={{color:C.purple}}>{cycles}</span></span>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",padding:"0 20px",borderBottom:"1px solid "+C.border,overflowX:"auto"}}>
        {[["oggi","📅 OGGI"],["ranking","📊 RANKING"],["top","🏆 TOP"],["multipla","🎯 MULTIPLA"],["parisix","⚖️ PARISI X"],["combo","🎲 COMBO"],["cerca","🔍 CERCA"],["perf","📈 PERFORMANCE"],["risultati","🏁 RISULTATI"],["log","📋 LOG"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",color:tab===t?C.cyan:"#555",padding:"11px 16px",cursor:"pointer",fontSize:10,letterSpacing:2,whiteSpace:"nowrap",borderBottom:tab===t?`2px solid ${C.cyan}`:"2px solid transparent",fontFamily:"inherit"}}>{l}</button>
        ))}
      </div>

      <div style={{padding:20,maxWidth:1300,margin:"0 auto"}}>

        {/* ══ OGGI ══ */}
        {tab==="oggi"&&(
          <div>
            {fixLoading&&<div style={{textAlign:"center",padding:60,color:C.cyan}}>📡 Caricamento calendario...<div style={{marginTop:14}}><Wave w={300}/></div></div>}
            {fixError&&!fixLoading&&(
              <div style={{background:`${C.amber}0a`,border:`1px solid ${C.amber}33`,borderRadius:12,padding:20,fontSize:10,lineHeight:2,color:"#aaa"}}>
                <b style={{color:C.amber}}>⚠️ {fixError}</b><br/>
                <span style={{color:"#666"}}>Vai su GitHub → Actions → Run workflow per aggiornare manualmente.</span>
              </div>
            )}
            {!fixLoading&&fixtures.length>0&&(
              <div>
                {/* League filter pills */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
                  {leagues.map(l=>(
                    <button key={l} onClick={()=>setFilterLeague(l)} style={{padding:"5px 11px",borderRadius:99,fontSize:9,cursor:"pointer",border:`1px solid ${filterLeague===l?C.cyan:C.border}`,background:filterLeague===l?`${C.cyan}15`:"transparent",color:filterLeague===l?C.cyan:"#666",fontFamily:"inherit"}}>
                      {l} {l!=="Tutti"&&`(${fixtures.filter(f=>f.league===l).length})`}
                    </button>
                  ))}
                </div>
                <div style={{fontSize:9,color:"#555",marginBottom:12,letterSpacing:2}}>
                  {filtered.length} PARTITE · Aggiornato ogni mattina alle 9:00 · 📡 Dati reali API Football
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
                  {filtered.map((fix,i)=>(
                    <FixCard key={fix.fixture_id||i} fix={fix} expanded={expanded===(fix.fixture_id||i)} onToggle={()=>setExpanded(expanded===(fix.fixture_id||i)?null:(fix.fixture_id||i))}/>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ RANKING ══ */}
        {tab==="ranking"&&(
          <div>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
              <div style={{fontSize:9,color:"#555",letterSpacing:2}}>ORDINA PER:</div>
              {[["conf","🎲 Conf"],["home","1️⃣ Casa"],["draw","➖ Pari"],["away","2️⃣ Trasf"],["over","⚽ Over"],["btts","🔁 BTTS"],["pp","⚡ PP Rank"],["ppd","⚡ PP D"],["ov","💰 OV"]].map(([v,l])=>(
                <button key={v} onClick={()=>setRnkSort(v)} style={{padding:"5px 11px",borderRadius:99,fontSize:9,cursor:"pointer",border:`1px solid ${rnkSort===v?C.cyan:C.border}`,background:rnkSort===v?`${C.cyan}15`:"transparent",color:rnkSort===v?C.cyan:"#666",fontFamily:"inherit"}}>{l}</button>
              ))}
            </div>
            {ranked.length===0&&<div style={{textAlign:"center",padding:60,color:"#333",fontSize:10}}>Nessuna partita — esegui il workflow da GitHub Actions</div>}
            {ranked.length>0&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 1fr 62px 62px 62px 62px 62px 72px 62px 70px 62px 55px",gap:6,padding:"7px 10px",fontSize:8,color:"#555",letterSpacing:1,borderBottom:"1px solid "+C.border,marginBottom:4}}>
                  <div>#</div><div style={{fontSize:8,color:"#555"}}>DATA</div><div>CASA</div><div>TRASFERTA</div>
                  <div style={{textAlign:"center"}}>1</div><div style={{textAlign:"center"}}>X</div><div style={{textAlign:"center"}}>2</div>
                  <div style={{textAlign:"center"}}>O2.5</div><div style={{textAlign:"center"}}>BTTS</div><div style={{textAlign:"center"}}>CONF</div><div style={{textAlign:"center",color:rnkSort==="pp"?"#a78bfa":"#555"}}>PP Rank</div><div style={{textAlign:"center",color:rnkSort==="ppd"?"#a78bfa":"#555"}}>PP D</div><div style={{textAlign:"center",color:rnkSort==="ov"?"#f59e0b":"#555"}}>OV</div>
                </div>
                {ranked.map((f,i)=>!f.pred?null:(
                  <React.Fragment key={i}><div onClick={()=>setRnkExpanded(rnkExpanded===i?null:i)} style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 1fr 62px 62px 62px 62px 62px 72px 62px 70px 62px 55px",gap:6,padding:"8px 10px",marginBottom:3,cursor:"pointer",borderRadius:9,background:i<3?`${C.cyan}04`:C.card,border:`1px solid ${i<3?C.cyan+"22":C.border}`,alignItems:"center"}}>
                    <div style={{fontSize:14,color:C.amber,fontWeight:700}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                    <div style={{fontSize:11,color:"#aaa",lineHeight:1.4}}><div style={{fontWeight:700}}>{f.date||"—"}</div><div style={{color:"#777",fontSize:10}}>{f.time||""}</div></div>
                    <div style={{fontSize:13,fontWeight:700,color:C.cyan,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</div>
                    <div style={{fontSize:13,fontWeight:700,color:C.pink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</div>
                    <div style={{textAlign:"center",fontSize:12,color:rnkSort==="home"?C.cyan:"#bbb"}}>{pct(f.pred.home)}</div>
                    <div style={{textAlign:"center",fontSize:12,color:rnkSort==="draw"?C.amber:"#bbb"}}>{pct(f.pred.draw)}</div>
                    <div style={{textAlign:"center",fontSize:12,color:rnkSort==="away"?C.pink:"#bbb"}}>{pct(f.pred.away)}</div>
                    <div style={{textAlign:"center",fontSize:12,color:rnkSort==="over"?"#f97316":"#bbb"}}>{pct(f.pred.over25)}</div>
                    <div style={{textAlign:"center",fontSize:12,color:rnkSort==="btts"?C.green:"#bbb"}}>{pct(f.pred.bttsY)}</div>
                    <div style={{textAlign:"center",fontSize:12,fontWeight:700,color:confColor(f.pred.conf)}}>{pct(f.pred.conf)}</div>
                    <div style={{textAlign:"center",fontSize:10,fontWeight:rnkSort==="pp"?900:400,color:rnkSort==="pp"?"#a78bfa":"#555"}}>
                      {f.pred?(()=>{
                        const lbl=ppLabel(f);
                        const sc=ppScore(f);
                        const r=(f.pp&&f.pp.pp_result)||"";
                        const col=r==="1"?C.cyan:r==="2"?C.pink:r==="X"?C.amber:r==="1X"?"#34d399":r==="X2"?"#f97316":r==="12"?"#a78bfa":"#888";
                        return<span style={{color:col}}><b style={{fontSize:12}}>{lbl}</b><br/><span style={{fontSize:11,color:"#a78bfa",fontWeight:700}}>{(sc*100).toFixed(0)}%</span></span>;
                      })():"—"}
                    </div>
                    <div style={{textAlign:"center",fontSize:11}}>
                      {f.pp?(()=>{
                        const r=f.pp.pp_result||"";
                        const col=r==="1"?C.cyan:r==="2"?C.pink:r==="X"?C.amber:r==="1X"?"#34d399":r==="X2"?"#f97316":r==="12"?"#a78bfa":"#888";
                        return<span style={{color:col,fontWeight:700}}>{f.pp.pp_label?.replace(/[🎯🛡️⚖️🔀]/g,"").trim()}<br/><span style={{fontSize:9,color:"#555"}}>{f.pp.pp_D>0?"+":""}{f.pp.pp_D?.toFixed(1)}</span></span>;
                      })():"—"}
                    </div>
                    <div style={{textAlign:"center",fontSize:11}}>
                      {f.ov&&f.ov.score!=null?(()=>{
                        const sc=f.ov.score;
                        const col=sc>=70?"#4caf50":sc>=50?"#f59e0b":"#f87171";
                        return<span style={{color:col,fontWeight:700}}>{sc.toFixed(0)}<br/><span style={{fontSize:8,color:"#555"}}>{f.ov.edge!=null?(f.ov.edge>0?"+":"")+f.ov.edge.toFixed(1)+"%":""}</span></span>;
                      })():<span style={{color:"#333",fontSize:9}}>—</span>}
                    </div>
                  {(()=>{const mb=movBadge(f.ov?.movement_pct);if(!mb||Math.abs(mb.val)<1)return <div style={{textAlign:"center",color:"#333",fontSize:9}}>—</div>;return <div style={{textAlign:"center"}}><span style={{fontSize:10,fontWeight:700,color:mb.col}}>{mb.icon}{Math.abs(mb.val).toFixed(1)}%</span></div>;})()}
                </div>
                  {rnkExpanded===i&&(<div style={{marginBottom:4}}><FixCard fix={f} expanded={true} onToggle={()=>setRnkExpanded(null)}/></div>)}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ CERCA ══ */}
        {tab==="top"&&(()=>{
          if(!fixtures||fixtures.length===0) return null;

          const topData = fixtures.map(f=>{
            const calc = calcMultipla(f);
            if(!calc||!f.pred) return null;

            const h=f.pred.home||0, x=f.pred.draw||0, a=f.pred.away||0;
            const ppR = ppScore(f)*100;
            const cp  = calc.confPin||0;
            const ov  = f.ov?.score||0;
            const sc  = calc.score*100;

            // Concordanza 3 modelli
            const pTop  = h>=x&&h>=a?"1":a>=x&&a>=h?"2":"X";
            const pGap  = Math.max(h,x,a)-[h,x,a].sort((p,q)=>q-p)[1];
            const ppRes = f.pp?.pp_result||null;
            const mktFav= calc.mktFav||null;
            // pp_result usa notazione doppia (es "1X","X2","12","X")
            // Usa includes() per verificare se il segno è contenuto nel risultato PP
            const c1=ppRes&&ppRes.includes(pTop)?1:0;
            const c2=pTop===mktFav?1:0;
            const c3=ppRes&&mktFav&&ppRes.includes(mktFav)?1:0;
            const conc=c1+c2+c3;
            const concFlag=conc===3?"🟢":conc===2?"🟡":"🔴";

            // Giocata in base a concordanza
            let giocata, pct, pctLabel, evVal;

            const makeFissa=(s)=>{
              const p=s==="1"?h:s==="2"?a:x;
              const pin=s==="1"?f.ov?.pin1:s==="2"?f.ov?.pin2:f.ov?.pinX;
              return {giocata:`FISSA ${s}`,pct:p,pctLabel:`${(p*100).toFixed(1)}%`,
                evVal:pin&&pin>0?(p*pin-1):null};
            };
            const makeDouble=(s1,s2)=>{
              const p1=s1==="1"?h:s1==="X"?x:a;
              const p2=s2==="X"?x:s2==="2"?a:h;
              const lbl=s1+s2==="1X"?"1X":s1+s2==="X2"||s1+s2==="2X"?"X2":"1-2";
              const pin1=s1==="1"?f.ov?.pin1:s1==="X"?f.ov?.pinX:f.ov?.pin2;
              const pin2=s2==="X"?f.ov?.pinX:s2==="2"?f.ov?.pin2:f.ov?.pin1;
              // EV ponderato: media pesata per prob (non semplice media)
              // evita che una quota alta su segno improbabile distorca tutto
              const e1=pin1&&pin1>0?(p1*pin1-1):null;
              const e2=pin2&&pin2>0?(p2*pin2-1):null;
              let evVal=null;
              if(e1!=null&&e2!=null) evVal=(e1*p1+e2*p2)/(p1+p2); // media pesata per prob
              else evVal=e1??e2;
              return {giocata:lbl,pct:p1+p2,
                pctLabel:`${(p1*100).toFixed(1)}%+${(p2*100).toFixed(1)}%=${((p1+p2)*100).toFixed(1)}%`,
                evVal};
            };
            const bestDouble=()=>{
              const opts=[makeDouble("1","X"),makeDouble("X","2"),makeDouble("1","2")];
              return opts.sort((p,q)=>q.pct-p.pct)[0];
            };

            // Solo doppie per tutti — la migliore per PCT
            {const r=bestDouble(); giocata=r.giocata;pct=r.pct;pctLabel=r.pctLabel;evVal=r.evVal;}

            // TopIndex: Pinnacle CP pesa 50% — mercato sharp come riferimento primario
            // Poisson×15% + OV×20% + PPRank×15% + ConfPin×50% + BonusConc
            const bonusConc=conc===3?20:conc===2?10:0;
            const topIdx=sc*0.15+ov*0.20+ppR*0.15+cp*0.50+bonusConc;

            return {f,calc,topIdx,conc,concFlag,giocata,pct,pctLabel,evVal,
                    ppR,cp,ov,sc,pTop,ppRes,mktFav,h,x,a};
          }).filter(Boolean).sort((a,b)=>{
            if(Math.abs(b.topIdx-a.topIdx)<2) return b.conc-a.conc;
            return b.topIdx-a.topIdx;
          });

          const concCounts={3:0,2:0,1:0,0:0};
          topData.forEach(d=>concCounts[d.conc]=(concCounts[d.conc]||0)+1);

          return(
          <div>
            <div style={{background:"rgba(34,211,238,0.06)",border:"1px solid rgba(34,211,238,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
              <div style={{fontSize:10,color:C.cyan,fontWeight:700,letterSpacing:2,marginBottom:4}}>🏆 TOP — CLASSIFICA UNIFICATA</div>
              <div style={{fontSize:9,color:"#888"}}>🟢 Concordanza totale → FISSA · 🟡 Parziale+gap forte → FISSA · 🔴 Discordanza → Doppia migliore · Click per dettagli</div>
            </div>

            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              {[["🟢","Totale (3/3)","#4caf50",3],["🟡","Parziale (2/3)","#f59e0b",2],["🔴","Discordanza","#f87171",1]].map(([flag,lbl,col,k])=>(
                concCounts[k]>0&&<div key={flag} style={{background:`${col}15`,border:`1px solid ${col}44`,borderRadius:8,padding:"3px 10px",fontSize:10,color:col,fontWeight:700}}>
                  {flag} {lbl}: {concCounts[k]}
                </div>
              ))}
              <div style={{fontSize:9,color:"#555",marginLeft:"auto",alignSelf:"center"}}>{topData.length} partite</div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 1fr 40px 90px 110px 60px 55px 55px 55px 55px",gap:6,padding:"6px 10px",fontSize:9,color:"#555",letterSpacing:1,borderBottom:"1px solid rgba(255,255,255,0.07)",marginBottom:4}}>
              <div>#</div><div>DATA</div><div>CASA</div><div>TRASFERTA</div>
              <div style={{textAlign:"center"}}>CONC</div>
              <div style={{textAlign:"center"}}>GIOCATA</div>
              <div style={{textAlign:"center"}}>PCT</div>
              <div style={{textAlign:"center"}}>EV</div>
              <div style={{textAlign:"center"}}>OV</div>
              <div style={{textAlign:"center",fontSize:9,color:"#555"}}>MOV</div>
              <div style={{textAlign:"center"}}>CP</div>
              <div style={{textAlign:"center"}}>TOP IDX</div>
              <div style={{textAlign:"center"}}>LABEL</div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {topData.map(({f,calc,topIdx,conc,concFlag,giocata,pct,pctLabel,evVal,ov,ppR,cp,pTop,ppRes,mktFav,h,x,a},i)=>{
                const concCol=conc===3?"#4caf50":conc===2?"#f59e0b":"#f87171";
                const isFissa=giocata.startsWith("FISSA");
                const isExp=topExpanded===i;
                return(
                <div key={i}>
                  <div onClick={()=>setTopExpanded(isExp?null:i)} style={{display:"grid",
                    gridTemplateColumns:"36px 80px 1fr 1fr 40px 90px 110px 60px 55px 55px 55px 55px",
                    gap:6,padding:"9px 10px",borderRadius:isExp?"9px 9px 0 0":9,cursor:"pointer",
                    background:conc===3?`${C.cyan}08`:conc===2?`${C.amber}05`:C.card,
                    border:`1px solid ${conc===3?C.cyan+"33":conc===2?C.amber+"22":C.border}`,
                    alignItems:"center"}}>
                    <div style={{fontSize:12,color:concCol,fontWeight:700}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                    <div style={{fontSize:10,color:"#aaa",lineHeight:1.4}}>{f.date||"—"}<br/><span style={{fontSize:9,color:"#555"}}>{f.time||""}</span></div>
                    <div style={{fontSize:12,fontWeight:700,color:C.cyan,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</div>
                    <div style={{fontSize:12,fontWeight:700,color:C.pink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</div>
                    <div style={{textAlign:"center",fontSize:16}}>{concFlag}</div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:12,fontWeight:800,color:isFissa?C.cyan:"#a78bfa",
                        background:isFissa?`${C.cyan}15`:"rgba(167,139,250,0.1)",
                        padding:"3px 8px",borderRadius:6}}>{giocata}</span>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:pct>=0.70?"#4caf50":pct>=0.55?"#f59e0b":"#f87171"}}>{pctLabel}</span>
                    </div>
                    <div style={{textAlign:"center"}}>
                      {evVal!=null?<span style={{fontSize:11,fontWeight:700,color:evVal>0?"#4caf50":"#f87171"}}>{evVal>0?"+":""}{(evVal*100).toFixed(1)}%</span>:<span style={{color:"#333",fontSize:9}}>—</span>}
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:ov>=60?"#4caf50":ov>=40?"#f59e0b":"#f87171"}}>{ov||"—"}</span>
                    </div>
                    {(()=>{const mb=movBadge(f.ov?.movement_pct);if(!mb||Math.abs(mb.val)<1)return <div style={{textAlign:"center",color:"#333",fontSize:9}}>—</div>;return <div style={{textAlign:"center"}}><span style={{fontSize:10,fontWeight:700,color:mb.col}}>{mb.icon}{Math.abs(mb.val).toFixed(1)}%</span></div>;})()}
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,fontWeight:700,color:cp>=50?"#4caf50":cp>=25?"#f59e0b":"#f87171"}}>{cp}</div>
                      <div style={{fontSize:8,color:cp>=50?"#4caf50":cp>=25?"#f59e0b":"#f87171"}}>{cp>=50?"ALTO":cp>=25?"MEDIO":"BASSO"}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:13,fontWeight:900,color:calc.labelCol}}>{topIdx.toFixed(0)}</div>
                      <div style={{fontSize:8,color:"#555"}}>/100</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:9,fontWeight:700,color:calc.labelCol,background:`${calc.labelCol}15`,padding:"2px 6px",borderRadius:4}}>{calc.label}</span>
                    </div>
                  </div>

                  {isExp&&(
                  <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${concCol}33`,
                    borderTop:"none",borderRadius:"0 0 9px 9px",padding:"14px 16px",
                    display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                    <div>
                      <div style={{fontSize:12,color:C.cyan,fontWeight:700,marginBottom:8}}>⚡ POISSON</div>
                      {[["1 Casa",h,"1"],["X Pari",x,"X"],["2 Ospite",a,"2"]].map(([lbl,p,s])=>(
                        <div key={lbl} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:12,color:"#888"}}>{lbl}</span>
                          <span style={{fontSize:13,fontWeight:700,color:pTop===s?"#4caf50":"#aaa"}}>{(p*100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{fontSize:12,color:C.amber,fontWeight:700,marginBottom:8}}>⚖️ PP INDEX</div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:12,color:"#888"}}>Risultato</span>
                        <span style={{fontSize:13,fontWeight:700,color:C.amber}}>{ppRes||"—"}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:12,color:"#888"}}>Distanza D</span>
                        <span style={{fontSize:13,fontWeight:700,color:C.amber}}>{f.pp?.pp_D!=null?(f.pp.pp_D>0?"+":"")+f.pp.pp_D.toFixed(2):"—"}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:12,color:"#888"}}>PP Rank</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#a78bfa"}}>{ppLabel(f)} {ppR.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:12,color:"#4caf50",fontWeight:700,marginBottom:8}}>💰 PINNACLE</div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:12,color:"#888"}}>Favorito</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#4caf50"}}>{mktFav||"—"}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#888"}}>CONF-PIN</span>
                        <span style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:13,fontWeight:700,color:cp>=50?"#4caf50":cp>=25?"#f59e0b":"#f87171"}}>{cp}</span>
                          <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,
                            background:cp>=50?"#4caf5022":cp>=25?"#f59e0b22":"#f8717122",
                            color:cp>=50?"#4caf50":cp>=25?"#f59e0b":"#f87171"}}>
                            {cp>=50?"🔴 ALTO":cp>=25?"🟡 MEDIO":"⚪ BASSO"}
                          </span>
                        </span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                        <span style={{fontSize:12,color:"#888"}}>OV Score</span>
                        <span style={{fontSize:13,fontWeight:700,color:ov>=60?"#4caf50":ov>=40?"#f59e0b":"#f87171"}}>{ov||"—"}</span>
                      </div>
                      <div style={{fontSize:11,color:"#555",marginBottom:4}}>CONCORDANZA</div>
                      {[["Poisson vs PP",!!(ppRes&&ppRes.includes(pTop))],["Poisson vs PIN",pTop===mktFav],["PP vs PIN",!!(ppRes&&mktFav&&ppRes.includes(mktFav))]].map(([lbl,ok])=>(
                        <div key={lbl} style={{fontSize:12,color:ok?"#4caf50":"#f87171",marginBottom:3}}>{ok?"✅":"❌"} {lbl}</div>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        );})()}

        {tab==="multipla"&&(()=>{
          if(!fixtures||fixtures.length===0)return(
            <div style={{textAlign:"center",padding:60,color:"#333"}}>
              <div style={{fontSize:40,marginBottom:12}}>🎯</div>
              <div style={{fontSize:11,letterSpacing:3}}>Nessuna partita disponibile</div>
            </div>
          );

          // ── CALCOLO SCORE COMBINATO ──────────────────────────────


          // Calcola e ordina
          const multiplaData = fixtures
            .map(f=>({f, calc:calcMultipla(f)}))
            .filter(({calc})=>calc!==null)
            .sort((a,b)=>{
            if(multiSort==="confpin"){
              const decRank=d=>{
                if(!d) return 0;
                if(d.startsWith("🔥")) return 6;
                if(d.startsWith("✅")) return 5;
                if(d.startsWith("⚖️")&&!d.endsWith("*")) return 4;
                if(d.startsWith("⚖️")&&d.endsWith("*")) return 3;
                if(d.startsWith("❌")) return 2;
                if(d.startsWith("⚪")) return 1;
                return 0;
              };
              const ra=decRank(a.calc.decisione),rb=decRank(b.calc.decisione);
              if(ra!==rb)return rb-ra;
              return(b.calc.confPin||0)-(a.calc.confPin||0);
            }
            return b.calc.score-a.calc.score;
          });

          // Conteggi label
          const counts = {TOP:0,GOOD:0,MEDIUM:0,AVOID:0};
          const decCounts = {"🔥":0,"✅":0,"⚖️":0,"⚖️*":0,"❌":0,"⚪":0};
          multiplaData.forEach(({calc})=>{
            counts[calc.label]=(counts[calc.label]||0)+1;
            const d=calc.decisione||"";
            if(d.startsWith("🔥")) decCounts["🔥"]++;
            else if(d.startsWith("✅")) decCounts["✅"]++;
            else if(d.startsWith("⚖️")&&d.endsWith("*")) decCounts["⚖️*"]++;
            else if(d.startsWith("⚖️")) decCounts["⚖️"]++;
            else if(d.startsWith("❌")) decCounts["❌"]++;
            else if(d.startsWith("⚪")) decCounts["⚪"]++;
          });

          return(
          <div>
            {/* ── LEGENDA ── */}
            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:10,color:"#a78bfa",letterSpacing:2,marginBottom:10,fontWeight:700}}>🧠 COME LEGGERE IL RANKING MULTIPLA</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12,fontSize:11,color:"#888"}}>
                <div><b style={{color:"#fff",fontSize:12}}>SCORE</b><br/>Indice combinato (0-100):<br/>CONF×60% + OV×30% + Concordanza×10%<br/><span style={{color:"#f87171",fontSize:10}}>❌ NO BET solo con 2+ segnali negativi</span></div>
                <div><b style={{color:"#fff",fontSize:12}}>EV</b><br/>Expected Value:<br/>(nostra prob × quota Pinnacle) − 1<br/><span style={{color:"#4caf50"}}>positivo = value bet</span> · <span style={{color:"#f87171"}}>negativo = no bet</span></div>
                <div><b style={{color:"#fff",fontSize:12}}>CONF</b><br/>Confidenza modello:<br/>Segnali ELO + form + trend concordi</div>
                <div><b style={{color:"#fff",fontSize:12}}>OV</b><br/>Odds Value vs Pinnacle no-vig:<br/>Alto = vediamo value che il mercato non vede</div>
                <div><b style={{color:"#fff",fontSize:12}}>PP Rank</b><br/>Score Poisson × PP Index:<br/>Somma % segni indicati dal PP</div>
                <div><b style={{color:"#fff",fontSize:12}}>PP D</b><br/>Risultato + Distanza KPZ/Parisi:<br/>|D|&gt;8=FISSA · 4-8=1-2 · 2-4=1X/X2 · &lt;2=X</div>
                <div><b style={{color:"#f87171",fontSize:12}}>⚠️ TRAP</b><br/>CONF alta + OV basso:<br/>Modello sicuro ma mercato non conferma</div>
                <div><b style={{color:"#f59e0b",fontSize:12}}>⚡ RISKY</b><br/>OV alto + CONF bassa:<br/>Value potenziale ma segnale incerto<br/><span style={{color:"#555",fontSize:10}}>Spesso in campionati difficili (PL, BL1)</span></div>
                <div><b style={{color:"#4caf50",fontSize:12}}>🔥 SHARP</b><br/>Quota Pinnacle in calo:<br/>Denaro smart in entrata — segnale forte</div>
              </div>
            </div>

            {/* ── SORT BUTTONS ── */}
            <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
              <div style={{fontSize:9,color:"#555",letterSpacing:1}}>ORDINA PER:</div>
              {[["score","📊 Score"],["confpin","🎯 CONF-PIN"]].map(([v,l])=>(
                <button key={v} onClick={()=>setMultiSort(v)}
                  style={{padding:"5px 12px",borderRadius:99,fontSize:10,cursor:"pointer",fontFamily:"inherit",
                    border:`1px solid ${multiSort===v?C.cyan:C.border}`,
                    background:multiSort===v?`${C.cyan}15`:"transparent",
                    color:multiSort===v?C.cyan:"#666"}}>
                  {l}
                </button>
              ))}
            </div>

            {/* ── CONTATORI ── */}
            <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
              {[["🔥","🔥 SECCO","#4caf50"],["✅","✅ 1X/X2","#22d3ee"],["⚖️","⚖️ DOPPIA","#f59e0b"],["⚖️*","⚖️ DOPPIA*","#d97706"],["❌","❌ NO BET","#f87171"],["⚪","⚪ NO DATA","#555"]].map(([key,lbl,col])=>(
                decCounts[key]>0&&<div key={key} style={{background:`${col}15`,border:`1px solid ${col}44`,borderRadius:8,padding:"3px 10px",fontSize:10,color:col,fontWeight:700}}>
                  {lbl}: {decCounts[key]}
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              {[["TOP","#4caf50"],["GOOD","#22d3ee"],["MEDIUM","#f59e0b"],["AVOID","#f87171"]].map(([lbl,col])=>(
                <div key={lbl} style={{background:`${col}10`,border:`1px solid ${col}33`,borderRadius:6,padding:"2px 8px",fontSize:9,color:col}}>
                  {lbl}: {counts[lbl]||0}
                </div>
              ))}
              <div style={{fontSize:9,color:"#555",marginLeft:"auto",alignSelf:"center"}}>
                {multiplaData.length} partite · ordinato per {multiSort==="confpin"?"Decisione+CP":"Score"} decrescente
              </div>
            </div>

            {/* ── HEADER TABELLA ── */}
            <div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 1fr 55px 55px 70px 55px 55px 65px 85px 75px",gap:6,padding:"6px 10px",fontSize:9,color:"#555",letterSpacing:1,borderBottom:"1px solid rgba(255,255,255,0.07)",marginBottom:4}}>
              <div>#</div><div>DATA</div><div>CASA</div><div>TRASFERTA</div>
              <div style={{textAlign:"center"}}>SCORE</div>
              <div style={{textAlign:"center"}}>LABEL</div>
              <div style={{textAlign:"center",color:multiSort==="confpin"?"#f59e0b":"#555"}}>DECISIONE</div>
              <div style={{textAlign:"center"}}>EV</div>
              <div style={{textAlign:"center"}}>OV</div>
              <div style={{textAlign:"center",fontSize:9,color:"#555"}}>MOV</div>
              <div style={{textAlign:"center",color:multiSort==="confpin"?"#f59e0b":"#555"}}>CONF-PIN</div>
              <div style={{textAlign:"center"}}>PP Rank</div>
              <div style={{textAlign:"center"}}>PP D</div>
              <div style={{textAlign:"center"}}>FLAG</div>
            </div>

            {/* ── RIGHE ── */}
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {multiplaData.map(({f,calc},i)=>{
                const p=f.pred;
                const pp=f.pp;
                const ppLbl=ppLabel(f);
                const ppD=pp?.pp_D;
                const ppDCol=pp?.pp_result==="1"?C.cyan:pp?.pp_result==="2"?C.pink:pp?.pp_result==="X"?C.amber:pp?.pp_result==="1X"?"#34d399":pp?.pp_result==="X2"?"#f97316":"#888";
                return(
                <React.Fragment key={i}>
                <div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 1fr 55px 55px 70px 55px 55px 65px 85px 75px",gap:6,padding:"10px 10px",borderRadius:multiExpanded===i?"9px 9px 0 0":9,background:i<3?`${calc.labelCol}08`:C.card,border:`1px solid ${i<3?calc.labelCol+"33":C.border}`,alignItems:"center",cursor:"pointer"}}
                  onClick={()=>setMultiExpanded(multiExpanded===i?null:i)}>
                  <div style={{fontSize:12,color:C.amber,fontWeight:700}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                  <div style={{fontSize:10,color:"#aaa",lineHeight:1.4,fontWeight:600}}>{f.date||"—"}<br/><span style={{fontSize:9,color:"#555"}}>{f.time||""}</span></div>
                  <div style={{fontSize:13,fontWeight:700,color:C.cyan,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</div>
                  <div style={{fontSize:13,fontWeight:700,color:C.pink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:13,fontWeight:900,color:calc.labelCol}}>{(calc.score*100).toFixed(0)}</div>
                    <div style={{fontSize:8,color:"#555",marginBottom:3}}>/100</div>
                    <div style={{fontSize:12,fontWeight:900,color:calc.pred_col,background:`${calc.pred_col}15`,padding:"2px 8px",borderRadius:4,display:"inline-block"}}>
                      {calc.pred_sign}
                    </div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <span style={{fontSize:10,fontWeight:700,color:calc.labelCol,background:`${calc.labelCol}15`,padding:"2px 8px",borderRadius:4}}>{calc.label}</span>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <span style={{fontSize:10,fontWeight:700,color:calc.decCol}}>{calc.decisione}</span>
                  </div>
                  <div style={{textAlign:"center"}}>
                    {calc.bestEv!=null?(
                      <span style={{fontSize:11,fontWeight:700,color:calc.bestEv>0?"#4caf50":"#f87171"}}>
                        {calc.bestEv>0?"+":""}{(calc.bestEv*100).toFixed(1)}%
                      </span>
                    ):<span style={{color:"#333",fontSize:9}}>—</span>}
                  </div>
                  <div style={{textAlign:"center"}}>
                    {f.ov?.score!=null?(
                      <span style={{fontSize:11,fontWeight:700,color:f.ov.score>=60?"#4caf50":f.ov.score>=40?"#f59e0b":"#f87171"}}>{f.ov.score?.toFixed(0)}</span>
                    ):<span style={{color:"#333",fontSize:9}}>—</span>}
                  </div>
                  {(()=>{const mb=movBadge(f.ov?.movement_pct);if(!mb||Math.abs(mb.val)<1)return <div style={{textAlign:"center",color:"#333",fontSize:9}}>—</div>;return <div style={{textAlign:"center"}}><span style={{fontSize:10,fontWeight:700,color:mb.col}}>{mb.icon}{Math.abs(mb.val).toFixed(1)}%</span></div>;})()}
                  <div style={{textAlign:"center",fontWeight:multiSort==="confpin"?900:400}}>
                    {calc.confPin!=null?(
                      <span style={{fontSize:11,color:calc.confPin>=60?"#4caf50":calc.confPin>=40?"#f59e0b":"#f87171",fontWeight:700}}>{calc.confPin}</span>
                    ):<span style={{color:"#333",fontSize:9}}>—</span>}
                  </div>
                  <div style={{textAlign:"center",color:ppDCol}}>
                    <div style={{fontSize:11,fontWeight:700}}>{ppLbl}</div>
                    <div style={{fontSize:9,color:"#a78bfa"}}>{(calc.ppSc*100).toFixed(0)}%</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    {pp?(()=>{
                      const res=pp.pp_result||"";
                      const lbl=pp.pp_label?.replace(/[🎯🛡️⚖️🔀⚖]/g,"").trim()||"—";
                      const d=pp.pp_D||0;
                      const col=res==="1"?C.cyan:res==="2"?C.pink:res==="X"?C.amber:res==="1X"?"#34d399":res==="X2"?"#f97316":res==="12"?"#a78bfa":"#888";
                      return<span>
                        <div style={{fontSize:12,fontWeight:900,color:col}}>{lbl}</div>
                        <div style={{fontSize:10,color:"#a78bfa"}}>{d>0?"+":""}{d.toFixed(1)}</div>
                      </span>;
                    })():<span style={{color:"#333"}}>—</span>}
                  </div>
                  <div style={{textAlign:"center",fontSize:10,color:calc.flagCol,fontWeight:700}}>{calc.flag}</div>
                </div>
                {multiExpanded===i&&(
                <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${calc.labelCol}33`,
                  borderTop:"none",borderRadius:"0 0 9px 9px",padding:"14px 16px",
                  display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:0}}>
                  <div>
                    <div style={{fontSize:12,color:C.cyan,fontWeight:700,marginBottom:8}}>⚡ POISSON</div>
                    {[["1 Casa",f.pred?.home,"1"],["X Pari",f.pred?.draw,"X"],["2 Ospite",f.pred?.away,"2"]].map(([lbl,p,s])=>{
                      const pTop=f.pred?.home>=f.pred?.draw&&f.pred?.home>=f.pred?.away?"1":f.pred?.away>=f.pred?.draw?"2":"X";
                      return(<div key={lbl} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:12,color:"#888"}}>{lbl}</span>
                        <span style={{fontSize:13,fontWeight:700,color:pTop===s?"#4caf50":"#aaa"}}>{p!=null?(p*100).toFixed(1)+"%":"—"}</span>
                      </div>);
                    })}
                  </div>
                  <div>
                    <div style={{fontSize:12,color:C.amber,fontWeight:700,marginBottom:8}}>⚖️ PP INDEX</div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:12,color:"#888"}}>Risultato</span>
                      <span style={{fontSize:13,fontWeight:700,color:C.amber}}>{f.pp?.pp_result||"—"}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:12,color:"#888"}}>Distanza D</span>
                      <span style={{fontSize:13,fontWeight:700,color:C.amber}}>{f.pp?.pp_D!=null?(f.pp.pp_D>0?"+":"")+f.pp.pp_D.toFixed(2):"—"}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:12,color:"#888"}}>PP Rank</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#a78bfa"}}>{ppLabel(f)} {(calc.ppSc*100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:12,color:"#4caf50",fontWeight:700,marginBottom:8}}>💰 PINNACLE</div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:12,color:"#888"}}>Favorito</span>
                      <span style={{fontSize:13,fontWeight:700,color:"#4caf50"}}>{calc.mktFav||"—"}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center"}}>
                      <span style={{fontSize:12,color:"#888"}}>CONF-PIN</span>
                      <span style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:13,fontWeight:700,color:calc.confPin>=50?"#4caf50":calc.confPin>=25?"#f59e0b":"#f87171"}}>{calc.confPin}</span>
                        <span style={{fontSize:9,padding:"1px 6px",borderRadius:4,fontWeight:700,
                          background:calc.confPin>=50?"#4caf5022":calc.confPin>=25?"#f59e0b22":"#f8717122",
                          color:calc.confPin>=50?"#4caf50":calc.confPin>=25?"#f59e0b":"#f87171"}}>
                          {calc.confPin>=50?"🔴 ALTO":calc.confPin>=25?"🟡 MEDIO":"⚪ BASSO"}
                        </span>
                      </span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:12,color:"#888"}}>OV Score</span>
                      <span style={{fontSize:13,fontWeight:700,color:f.ov?.score>=60?"#4caf50":f.ov?.score>=40?"#f59e0b":"#f87171"}}>{f.ov?.score||"—"}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:12,color:"#888"}}>MOV</span>
                      {(()=>{const mb=movBadge(f.ov?.movement_pct);return mb&&Math.abs(mb.val)>=1?
                        <span style={{fontSize:12,fontWeight:700,color:mb.col}}>{mb.icon}{Math.abs(mb.val).toFixed(1)}%</span>:
                        <span style={{color:"#555"}}>—</span>;})()}
                    </div>
                  </div>
                </div>
                )}
                </React.Fragment>
                )}
              )}
              {multiplaData.length===0&&<div style={{textAlign:"center",padding:40,color:"#333",fontSize:11}}>Nessuna partita disponibile</div>}
            </div>
          </div>
        );})()}

        {tab==="parisix"&&(()=>{
          if(!fixtures||fixtures.length===0) return null;

          // PCT doppia migliore (stessa logica TOP)
          const bestDouble=(f,h,x,a)=>{
            const d1X={s1:"1",s2:"X",p1:h,p2:x,lbl:"1X",pin1:f.ov?.pin1,pin2:f.ov?.pinX};
            const dX2={s1:"X",s2:"2",p1:x,p2:a,lbl:"X2",pin1:f.ov?.pinX,pin2:f.ov?.pin2};
            const d12={s1:"1",s2:"2",p1:h,p2:a,lbl:"1-2",pin1:f.ov?.pin1,pin2:f.ov?.pin2};
            return [d1X,dX2,d12].map(d=>{
              const e1=d.pin1&&d.pin1>0?(d.p1*d.pin1-1):null;
              const e2=d.pin2&&d.pin2>0?(d.p2*d.pin2-1):null;
              const ev=e1!=null&&e2!=null?(e1*d.p1+e2*d.p2)/(d.p1+d.p2):e1??e2;
              return {...d,pct:d.p1+d.p2,ev};
            }).sort((a,b)=>b.pct-a.pct)[0];
          };

          // Filtra FISSA X (pp_result="X", |D|≤2)
          const parixData = fixtures
            .filter(f=>f.pp&&f.pp.pp_result==="X")
            .map(f=>{
              const calc=calcMultipla(f);
              if(!calc||!f.pred) return null;
              const h=f.pred.home||0,x=f.pred.draw||0,a=f.pred.away||0;
              const ppR=ppScore(f)*100;
              const cp=calc.confPin||0;
              const ov=f.ov?.score||0;
              const bd=bestDouble(f,h,x,a);
              const ppD=f.pp?.pp_D||0;

              // Concordanza
              const pTop=h>=x&&h>=a?"1":a>=x&&a>=h?"2":"X";
              const ppRes=f.pp?.pp_result||null;
              const mktFav=calc.mktFav||null;
              const c1=ppRes&&ppRes.includes(pTop)?1:0;
              const c2=pTop===mktFav?1:0;
              const c3=ppRes&&mktFav&&ppRes.includes(mktFav)?1:0;
              const conc=c1+c2+c3;
              const concFlag=conc===3?"🟢":conc===2?"🟡":"🔴";

              return {f,calc,ppR,cp,ov,bd,ppD,conc,concFlag,h,x,a,pTop,ppRes,mktFav};
            }).filter(Boolean)
            .sort((a,b)=>{
              if(parixSort==="ov") return (b.ov||0)-(a.ov||0);
              if(parixSort==="drank") return Math.abs(b.ppD)-Math.abs(a.ppD);
              if(parixSort==="pct") return (b.bd?.pct||0)-(a.bd?.pct||0);
              if(parixSort==="confpin"){
                const decRank=d=>{
                  if(!d)return 0;
                  if(d.startsWith("🔥"))return 6;
                  if(d.startsWith("✅"))return 5;
                  if(d.startsWith("⚖️")&&!d.endsWith("*"))return 4;
                  if(d.startsWith("⚖️")&&d.endsWith("*"))return 3;
                  if(d.startsWith("❌"))return 2;
                  return 1;
                };
                const ra=decRank(a.calc.decisione),rb=decRank(b.calc.decisione);
                if(ra!==rb)return rb-ra;
                return(b.cp||0)-(a.cp||0);
              }
              return b.calc.score-a.calc.score;
            });

          return(
          <div>
            {/* Header */}
            <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
              <div style={{fontSize:10,color:C.amber,fontWeight:700,letterSpacing:2,marginBottom:4}}>⚖️ PARISI X — FISSA X · |D| ≤ 2</div>
              <div style={{fontSize:9,color:"#888"}}>PP Index: equilibrio assoluto tra le squadre · D compreso tra -2 e +2 · Click sulla riga per dettagli</div>
            </div>

            {/* Sort buttons */}
            <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{fontSize:9,color:"#555",letterSpacing:1}}>ORDINA PER:</div>
              {[["score","📊 Score"],["ov","💰 OV"],["drank","📐 D Rank"],["pct","📈 PCT"],["confpin","🎯 CONF-PIN"]].map(([v,l])=>(
                <button key={v} onClick={()=>setParixSort(v)}
                  style={{padding:"5px 12px",borderRadius:99,fontSize:10,cursor:"pointer",fontFamily:"inherit",
                    border:`1px solid ${parixSort===v?C.amber:C.border}`,
                    background:parixSort===v?`${C.amber}15`:"transparent",
                    color:parixSort===v?C.amber:"#666"}}>
                  {l}
                </button>
              ))}
            </div>

            <div style={{fontSize:9,color:"#555",marginBottom:10}}>{parixData.length} FISSA X · |D|≤2</div>

            {/* Header tabella */}
            <div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 1fr 40px 90px 110px 55px 55px 55px 60px 55px",gap:6,padding:"6px 10px",fontSize:9,color:"#555",letterSpacing:1,borderBottom:"1px solid rgba(255,255,255,0.07)",marginBottom:4}}>
              <div>#</div><div>DATA</div><div>CASA</div><div>TRASFERTA</div>
              <div style={{textAlign:"center"}}>CONC</div>
              <div style={{textAlign:"center"}}>DOPPIA</div>
              <div style={{textAlign:"center",color:parixSort==="pct"?C.amber:"#555"}}>PCT</div>
              <div style={{textAlign:"center",color:parixSort==="ov"?C.amber:"#555"}}>OV</div>
              <div style={{textAlign:"center",color:parixSort==="confpin"?C.amber:"#555"}}>CP</div>
              <div style={{textAlign:"center"}}>SCORE</div>
              <div style={{textAlign:"center",color:parixSort==="drank"?C.amber:"#555"}}>D</div>
              <div style={{textAlign:"center"}}>LABEL</div>
            </div>

            {/* Righe */}
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {parixData.length===0&&<div style={{textAlign:"center",padding:40,color:"#333",fontSize:11}}>Nessuna partita FISSA X oggi</div>}
              {parixData.map(({f,calc,ppR,cp,ov,bd,ppD,conc,concFlag,h,x,a,pTop,ppRes,mktFav},i)=>{
                const concCol=conc===3?"#4caf50":conc===2?"#f59e0b":"#f87171";
                const isExp=parixExpanded===i;
                return(
                <div key={i}>
                  <div onClick={()=>setParixExpanded(isExp?null:i)} style={{display:"grid",
                    gridTemplateColumns:"36px 80px 1fr 1fr 40px 90px 110px 55px 55px 55px 60px 55px",
                    gap:6,padding:"9px 10px",borderRadius:isExp?"9px 9px 0 0":9,cursor:"pointer",
                    background:conc===3?`${C.cyan}08`:conc===2?`${C.amber}05`:C.card,
                    border:`1px solid ${conc===3?C.cyan+"33":conc===2?C.amber+"22":C.border}`,
                    alignItems:"center"}}>
                    <div style={{fontSize:12,color:C.amber,fontWeight:700}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                    <div style={{fontSize:10,color:"#aaa",lineHeight:1.4}}>{f.date||"—"}<br/><span style={{fontSize:9,color:"#555"}}>{f.time||""}</span></div>
                    <div style={{fontSize:12,fontWeight:700,color:C.cyan,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</div>
                    <div style={{fontSize:12,fontWeight:700,color:C.pink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</div>
                    <div style={{textAlign:"center",fontSize:16}}>{concFlag}</div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:12,fontWeight:800,color:"#a78bfa",background:"rgba(167,139,250,0.1)",padding:"3px 8px",borderRadius:6}}>
                        {bd?.lbl||"—"}
                      </span>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:10,fontWeight:700,color:bd&&bd.pct>=0.70?"#4caf50":bd&&bd.pct>=0.55?"#f59e0b":"#f87171"}}>
                        {bd?`${(bd.p1*100).toFixed(1)}%+${(bd.p2*100).toFixed(1)}%=${(bd.pct*100).toFixed(1)}%`:"—"}
                      </span>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:ov>=60?"#4caf50":ov>=40?"#f59e0b":"#f87171"}}>{ov||"—"}</span>
                    </div>
                    {(()=>{const mb=movBadge(f.ov?.movement_pct);if(!mb||Math.abs(mb.val)<1)return <div style={{textAlign:"center",color:"#333",fontSize:9}}>—</div>;return <div style={{textAlign:"center"}}><span style={{fontSize:10,fontWeight:700,color:mb.col}}>{mb.icon}{Math.abs(mb.val).toFixed(1)}%</span></div>;})()}
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:11,fontWeight:700,color:cp>=50?"#4caf50":cp>=25?"#f59e0b":"#f87171"}}>{cp}</div>
                      <div style={{fontSize:8,color:cp>=50?"#4caf50":cp>=25?"#f59e0b":"#f87171"}}>{cp>=50?"ALTO":cp>=25?"MEDIO":"BASSO"}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:12,fontWeight:900,color:calc.labelCol}}>{(calc.score*100).toFixed(0)}</div>
                      <div style={{fontSize:8,color:"#555"}}>/100</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:C.amber}}>{ppD>0?"+":""}{ppD.toFixed(2)}</span>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:9,fontWeight:700,color:calc.labelCol,background:`${calc.labelCol}15`,padding:"2px 6px",borderRadius:4}}>{calc.label}</span>
                    </div>
                  </div>

                  {/* Dettaglio espandibile */}
                  {isExp&&(
                  <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${concCol}33`,
                    borderTop:"none",borderRadius:"0 0 9px 9px",padding:"14px 16px",
                    display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                    <div>
                      <div style={{fontSize:12,color:C.cyan,fontWeight:700,marginBottom:8}}>⚡ POISSON</div>
                      {[["1 Casa",h,"1"],["X Pari",x,"X"],["2 Ospite",a,"2"]].map(([lbl,p,s])=>(
                        <div key={lbl} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                          <span style={{fontSize:12,color:"#888"}}>{lbl}</span>
                          <span style={{fontSize:13,fontWeight:700,color:pTop===s?"#4caf50":"#aaa"}}>{(p*100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{fontSize:12,color:C.amber,fontWeight:700,marginBottom:8}}>⚖️ PP INDEX</div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:12,color:"#888"}}>Risultato</span>
                        <span style={{fontSize:13,fontWeight:700,color:C.amber}}>{ppRes||"—"}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:12,color:"#888"}}>Distanza D</span>
                        <span style={{fontSize:13,fontWeight:700,color:C.amber}}>{f.pp?.pp_D!=null?(f.pp.pp_D>0?"+":"")+f.pp.pp_D.toFixed(2):"—"}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:12,color:"#888"}}>PP Rank</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#a78bfa"}}>{ppLabel(f)} {ppR.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:12,color:"#4caf50",fontWeight:700,marginBottom:8}}>💰 PINNACLE</div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:12,color:"#888"}}>Favorito</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#4caf50"}}>{mktFav||"—"}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center"}}>
                        <span style={{fontSize:12,color:"#888"}}>CONF-PIN</span>
                        <span style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:13,fontWeight:700,color:cp>=50?"#4caf50":cp>=25?"#f59e0b":"#f87171"}}>{cp}</span>
                          <span style={{fontSize:9,padding:"1px 6px",borderRadius:4,fontWeight:700,
                            background:cp>=50?"#4caf5022":cp>=25?"#f59e0b22":"#f8717122",
                            color:cp>=50?"#4caf50":cp>=25?"#f59e0b":"#f87171"}}>
                            {cp>=50?"🔴 ALTO":cp>=25?"🟡 MEDIO":"⚪ BASSO"}
                          </span>
                        </span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                        <span style={{fontSize:12,color:"#888"}}>OV Score</span>
                        <span style={{fontSize:13,fontWeight:700,color:ov>=60?"#4caf50":ov>=40?"#f59e0b":"#f87171"}}>{ov||"—"}</span>
                      </div>
                      <div style={{fontSize:11,color:"#555",marginBottom:4}}>CONCORDANZA</div>
                      {[["Poisson vs PP",!!(ppRes&&ppRes.includes(pTop))],["Poisson vs PIN",pTop===mktFav],["PP vs PIN",!!(ppRes&&mktFav&&ppRes.includes(mktFav))]].map(([lbl,ok])=>(
                        <div key={lbl} style={{fontSize:12,color:ok?"#4caf50":"#f87171",marginBottom:3}}>{ok?"✅":"❌"} {lbl}</div>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        );})()}

        {tab==="combo"&&(()=>{
          if(!fixtures||fixtures.length===0) return null;

          // ── LOGICA SURPRISE INDEX + COMBO ─────────────────────────
          const comboData = fixtures.map(f=>{
            const calc = calcMultipla(f);
            if(!calc||!f.pred) return null;

            const h=f.pred.home||0, x=f.pred.draw||0, a=f.pred.away||0;
            const S = f.ov?.surprise_idx ?? 0.40;  // da Python
            const ppR = ppScore(f)*100;
            const cp = calc.confPin||0;
            const ov = f.ov?.score||0;

            // Pinnacle no-vig probs
            const nv1 = f.ov?.novig_1!=null?f.ov.novig_1/100:null;
            const nvX = f.ov?.novig_X!=null?f.ov.novig_X/100:null;
            const nv2 = f.ov?.novig_2!=null?f.ov.novig_2/100:null;

            // Blended probability: Poisson 60% + Pinnacle 40%
            const bh = nv1!=null?h*0.60+nv1*0.40:h;
            const bx = nvX!=null?x*0.60+nvX*0.40:x;
            const ba = nv2!=null?a*0.60+nv2*0.40:a;

            // Logica decisionale basata su S
            let pick, ppick, pickLabel, coeff;
            const domSign = bh>=bx&&bh>=ba?"1":ba>=bx?"2":"X";

            if(S < 0.35){
              // Sorpresa bassa → FISSA sul dominante
              pick = `FISSA ${domSign}`;
              ppick = domSign==="1"?bh:domSign==="2"?ba:bx;
              coeff = 1.00;
              pickLabel = "fisso";
            } else if(S < 0.65){
              // Sorpresa media → doppia con X
              if(domSign==="1"){pick="1X";ppick=bh+bx;coeff=0.93;}
              else if(domSign==="2"){pick="X2";ppick=bx+ba;coeff=0.93;}
              else {pick=bh>=ba?"1X":"X2";ppick=pick==="1X"?bh+bx:bx+ba;coeff=0.93;}
              pickLabel = "doppia";
            } else {
              // Sorpresa alta → 1-2
              pick="1-2"; ppick=bh+ba; coeff=0.88;
              pickLabel = "doppia larga";
            }

            // Align: quanto siamo vicini a Pinnacle
            const align = nv1!=null ? Math.max(0,1-Math.abs(bh-(nv1??bh))-Math.abs(ba-(nv2??ba))) : 0.70;

            // Score Cassaforte differenziato per tipo:
            // FISSA: S penalizza poco (0.30) + bonus PCT ×1.30 (solida per definizione)
            // DOPPIA: S penalizza normalmente (0.65) + nessun bonus
            // 1-2: S penalizza normalmente + penalità tipo
            const isFissaCombo = pick.startsWith("FISSA");
            const sPenalty = isFissaCombo ? 0.30 : 0.65;
            const pctBonus  = isFissaCombo ? 1.30 : 1.00;
            const peff = ppick * (1 - S * sPenalty) * pctBonus;
            const scoreCassa = peff * coeff * Math.max(0.5, align);

            // S label
            const sLabel = S<0.35?"🟢 STABILE":S<0.65?"🟡 MEDIO":"🔴 ALTO";
            const sCol   = S<0.35?"#4caf50":S<0.65?"#f59e0b":"#f87171";

            // EV individuale sulla quota Pinnacle
            // evInd: solo con dati Pinnacle reali
            const p1r=f.ov?.pin1,pXr=f.ov?.pinX,p2r=f.ov?.pin2;
            const hasPinReal=p1r&&pXr&&p2r;
            const pinPickFn=()=>{
              if(!hasPinReal) return null;
              const s=pick.startsWith("FISSA")?pick.replace("FISSA ",""):null;
              if(s==="1") return p1r;
              if(s==="2") return p2r;
              if(s==="X") return pXr;
              if(pick==="1X") return p1r*pXr/(p1r+pXr);
              if(pick==="X2") return pXr*p2r/(pXr+p2r);
              if(pick==="1-2") return p1r*p2r/(p1r+p2r);
              return null;
            };
            const pinPick=pinPickFn();
            const evInd=pinPick&&pinPick>0?ppick*pinPick-1:null;

            return {f,calc,S,sLabel,sCol,pick,ppick,pickLabel,coeff,align,scoreCassa,ppR,cp,ov,bh,bx,ba,domSign,nv1,nvX,nv2,pinPick,evInd};
          }).filter(d=>{
            // Filtro 1: dati Pinnacle obbligatori
            if(!d.f.ov?.pin1||!d.f.ov?.pinX||!d.f.ov?.pin2) return false;
            // Filtro 2: Score Cassaforte minimo 40
            if(d.scoreCassa*100<40) return false;
            // Filtro 3: concordanza mktFav con pick
            const mf=d.calc?.mktFav;
            if(!mf) return false;
            const pk=d.pick;
            if(pk==="FISSA 1"||pk==="1X") { if(mf!=="1") return false; }
            else if(pk==="FISSA 2"||pk==="X2") { if(mf!=="2") return false; }
            else if(pk==="FISSA X") { if(mf==="1"||mf==="2") return false; }
            // 1-2: escludi se mktFav è X (mercato vede pareggio, noi no)
            else if(pk==="1-2") { if(mf==="X") return false; }
            return true;
          }).sort((a,b)=>
            comboSort==="pct"?b.ppick-a.ppick:b.scoreCassa-a.scoreCassa);

          // ── GENERATORE MULTIPLA: 3 FISSE + 4 DOPPIE ─────────────
          const fissePos  = comboData.filter(d=>d.pick.startsWith("FISSA")&&d.evInd!=null&&d.evInd>0);
          const fisseAll  = comboData.filter(d=>d.pick.startsWith("FISSA"));
          const fisse     = (fissePos.length>=2?fissePos:fisseAll).slice(0,6);
          const doppiePos = comboData.filter(d=>!d.pick.startsWith("FISSA")&&d.evInd!=null&&d.evInd>0);
          const doppieAll = comboData.filter(d=>!d.pick.startsWith("FISSA"));
          const doppie    = (doppiePos.length>=2?doppiePos:doppieAll);

          // Quota reale Pinnacle — usa novig come fallback se pin mancante
          const getPin=(d)=>{
            const p1=d.f.ov?.pin1, pX=d.f.ov?.pinX, p2=d.f.ov?.pin2;
            // Fallback: stima da novig (più affidabile di pinEst)
            const nv1=d.f.ov?.novig_1, nvX=d.f.ov?.novig_X, nv2=d.f.ov?.novig_2;
            const r1=p1||(nv1?100/nv1:null);
            const rX=pX||(nvX?100/nvX:null);
            const r2=p2||(nv2?100/nv2:null);
            if(!r1||!rX||!r2) return null;
            const p1f=r1,pXf=rX,p2f=r2;
            const isFissa=d.pick.startsWith("FISSA");
            const s=isFissa?d.pick.replace("FISSA ",""):null;
            if(s==="1") return p1f;
            if(s==="2") return p2f;
            if(s==="X") return pXf;
            if(d.pick==="1X") return Math.round(p1f*pXf/(p1f+pXf)*100)/100;
            if(d.pick==="X2") return Math.round(pXf*p2f/(pXf+p2f)*100)/100;
            if(d.pick==="1-2") return Math.round(p1f*p2f/(p1f+p2f)*100)/100;
            return null;
          };

          const buildMultipla=(selF,selD)=>{
            const sel=[...selF,...selD];
            if(sel.length===0) return null;
            // Escludi se qualche evento non ha dati Pinnacle reali
            if(sel.some(d=>getPin(d)===null)) return null;
            const pmulti=sel.reduce((acc,d)=>acc*d.ppick,1);
            const qmulti=sel.reduce((acc,d)=>acc*(getPin(d)||1),1);
            const ev=pmulti*qmulti-1;
            const avgCassa=sel.reduce((acc,d)=>acc+d.scoreCassa,0)/sel.length;
            return {sel,pmulti,qmulti,ev,avgCassa,nFisse:selF.length,nDoppie:selD.length};
          };

          // Combinazione principale: top 3 fisse + top 4 doppie
          const multiMain = buildMultipla(fisse.slice(0,3), doppie.slice(0,4));
          // Varianti
          const multi2F4D = buildMultipla(fisse.slice(0,2), doppie.slice(0,4));
          const multi3F3D = buildMultipla(fisse.slice(0,3), doppie.slice(0,3));
          const multi2F3D = buildMultipla(fisse.slice(0,2), doppie.slice(0,3));
          // Deduplica varianti identiche
          const allMultiRaw=[multiMain,multi2F4D,multi3F3D,multi2F3D].filter(Boolean);
          const seen=new Set();
          const allMulti=allMultiRaw.filter(c=>{
            const k=`${c.nFisse}F${c.nDoppie}D`;
            if(seen.has(k))return false;
            seen.add(k);return true;
          });
          const bestCombo = allMulti.filter(c=>c.ev>0).sort((a,b)=>b.ev-a.ev)[0]||multiMain;

          return(
          <div>
            {/* Header */}
            <div style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:14}}>
              <div style={{fontSize:10,color:"#a78bfa",fontWeight:700,letterSpacing:2,marginBottom:4}}>🎲 COMBO — GENERATORE INTELLIGENTE</div>
              <div style={{fontSize:9,color:"#888"}}>Score Cassaforte = PCT×(1-S)×Coeff×Align · S=Indice Sorpresa · Blended: Poisson 60% + Pinnacle 40% · Click per dettagli</div>
            </div>

            {/* Combinazione consigliata */}
            {bestCombo&&(
            <div style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <div style={{fontSize:10,color:"#a78bfa",fontWeight:700,marginBottom:8}}>
                🏆 MULTIPLA CONSIGLIATA — {bestCombo.nFisse} FISSE + {bestCombo.nDoppie} DOPPIE ({bestCombo.sel.length} EVENTI)
              </div>
              {(()=>{const dc=allMulti[selectedMulti]||bestCombo;return(
              <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:8}}>
                <div style={{fontSize:11,color:"#888"}}>P multipla: <span style={{color:dc.pmulti>=0.20?"#4caf50":dc.pmulti>=0.10?"#f59e0b":"#f87171",fontWeight:700}}>{(dc.pmulti*100).toFixed(1)}%</span></div>
                <div style={{fontSize:11,color:"#888"}}>Quota: <span style={{color:"#a78bfa",fontWeight:700}}>{dc.qmulti.toFixed(2)}x</span></div>
                <div style={{fontSize:11,color:"#888"}}>EV: <span style={{color:dc.ev>0?"#4caf50":"#f87171",fontWeight:700}}>{dc.ev>0?"+":""}{(dc.ev*100).toFixed(1)}%</span></div>
                <div style={{fontSize:11,color:"#888"}}>Cassa medio: <span style={{color:"#a78bfa",fontWeight:700}}>{(dc.avgCassa*100).toFixed(0)}</span></div>
              </div>);})()}
              <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
                {(allMulti[selectedMulti]||bestCombo)?.sel?.map((d,i)=>(
                  <div key={i} style={{display:"flex",gap:8,alignItems:"center",fontSize:10,
                    padding:"4px 8px",borderRadius:6,
                    background:d.pick.startsWith("FISSA")?"rgba(34,211,238,0.05)":"rgba(167,139,250,0.05)"}}>
                    <span style={{color:d.pick.startsWith("FISSA")?C.cyan:"#a78bfa",fontWeight:700,minWidth:50}}>{d.pick.startsWith("FISSA")?"🔒 FISSA":"🎯 DOPPIA"}</span>
                    <span style={{color:"#aaa",flex:1}}>{d.f.home} vs {d.f.away}</span>
                    <span style={{color:d.pick.startsWith("FISSA")?C.cyan:"#a78bfa",fontWeight:700,minWidth:40}}>{d.pick}</span>
                    <span style={{color:"#4caf50",minWidth:45}}>{(d.ppick*100).toFixed(1)}%</span>
                    <span style={{color:d.sCol,fontSize:9}}>{d.sLabel.split(" ")[0]} S:{(d.S*100).toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {allMulti.map((c,i)=>(
                  <button key={i} onClick={()=>setSelectedMulti(i)}
                    style={{fontSize:9,cursor:"pointer",fontFamily:"inherit",
                      background:selectedMulti===i?"rgba(167,139,250,0.25)":"rgba(255,255,255,0.03)",
                      border:`1px solid ${selectedMulti===i?"#a78bfa":"#333"}`,
                      borderRadius:6,padding:"5px 12px",
                      color:selectedMulti===i?"#a78bfa":"#555"}}>
                    {c.nFisse}F+{c.nDoppie}D · P:{(c.pmulti*100).toFixed(0)}% · Q:{c.qmulti.toFixed(1)}x · EV:{c.ev>0?"+":""}{(c.ev*100).toFixed(0)}%
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* ── MASCHERA MULTIPLA SCALARE ───────────────────── */}
            <div style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.25)",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:10,color:"#a78bfa",fontWeight:700,letterSpacing:2,marginBottom:12}}>⚙️ MASCHERA MULTIPLA SCALARE</div>

              {/* Input grid */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {[
                  ["💰 Importo totale (€)", maskStake, setMaskStake, 10, 1000, 10, "€"],
                  ["🔒 Fisse step 1", maskFisseStep1, setMaskFisseStep1, 1, 4, 1, ""],
                  ["🎯 Doppie step 1", maskDoppieStep1, setMaskDoppieStep1, 0, 3, 1, ""],
                  ["➕ Doppie per step succ.", maskDoppiePerStep, setMaskDoppiePerStep, 1, 3, 1, ""],
                  ["🔢 N° step", maskStep, setMaskStep, 1, 5, 1, ""],
                  ["📉 Riduzione % per step", maskRiduzione, setMaskRiduzione, 10, 80, 5, "%"],
                ].map(([label,val,setter,min,max,step,unit])=>(
                  <div key={label}>
                    <div style={{fontSize:9,color:"#888",marginBottom:4}}>{label}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <input type="range" min={min} max={max} step={step} value={val}
                        onChange={e=>setter(Number(e.target.value))}
                        style={{flex:1,accentColor:"#a78bfa"}}/>
                      <span style={{fontSize:12,fontWeight:700,color:"#a78bfa",minWidth:40,textAlign:"right"}}>{val}{unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Filtri qualità eventi */}
              <div style={{fontSize:9,color:"#a78bfa",fontWeight:700,letterSpacing:1,marginBottom:8}}>🎯 FILTRI QUALITÀ EVENTI</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:9,color:"#888"}}>📊 EV minimo</span>
                    <span style={{fontSize:11,fontWeight:700,color:maskEvMin>=10?"#4caf50":maskEvMin>=3?"#f59e0b":"#f87171"}}>{maskEvMin}%</span>
                  </div>
                  <input type="range" min={0} max={30} step={1} value={maskEvMin}
                    onChange={e=>setMaskEvMin(Number(e.target.value))}
                    style={{width:"100%",accentColor:"#4caf50"}}/>
                  <div style={{fontSize:8,color:maskEvMin>=10?"#4caf50":maskEvMin>=3?"#f59e0b":"#f87171",marginTop:2}}>
                    {maskEvMin>=10?"🟢 Buono":maskEvMin>=3?"🟠 Accettabile":"⚪ Neutro"}
                  </div>
                </div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:9,color:"#888"}}>💰 Quota minima</span>
                    <span style={{fontSize:11,fontWeight:700,color:maskQuotaMin>=2.0?"#4caf50":maskQuotaMin>=1.5?"#f59e0b":"#f87171"}}>{maskQuotaMin.toFixed(2)}x</span>
                  </div>
                  <input type="range" min={1.0} max={3.0} step={0.05} value={maskQuotaMin}
                    onChange={e=>setMaskQuotaMin(Number(e.target.value))}
                    style={{width:"100%",accentColor:"#f59e0b"}}/>
                  <div style={{fontSize:8,color:maskQuotaMin>=2.0?"#4caf50":maskQuotaMin>=1.5?"#f59e0b":"#f87171",marginTop:2}}>
                    {maskQuotaMin>=2.0?"🟢 Alta":maskQuotaMin>=1.5?"🟡 Media":"🟠 Bassa"}
                  </div>
                </div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:9,color:"#888"}}>🏦 Score minimo</span>
                    <span style={{fontSize:11,fontWeight:700,color:maskScoreMin>=50?"#4caf50":maskScoreMin>=35?"#f59e0b":"#f87171"}}>{maskScoreMin}</span>
                  </div>
                  <input type="range" min={20} max={70} step={5} value={maskScoreMin}
                    onChange={e=>setMaskScoreMin(Number(e.target.value))}
                    style={{width:"100%",accentColor:"#22d3ee"}}/>
                  <div style={{fontSize:8,color:maskScoreMin>=50?"#4caf50":maskScoreMin>=35?"#f59e0b":"#f87171",marginTop:2}}>
                    {maskScoreMin>=50?"🟢 Alto":maskScoreMin>=35?"🟡 Medio":"⚪ Minimo"}
                  </div>
                </div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:9,color:"#888"}}>📈 OV minimo</span>
                    <span style={{fontSize:11,fontWeight:700,color:maskOvMin>=50?"#4caf50":maskOvMin>=35?"#f59e0b":"#f87171"}}>{maskOvMin}</span>
                  </div>
                  <input type="range" min={20} max={70} step={5} value={maskOvMin}
                    onChange={e=>setMaskOvMin(Number(e.target.value))}
                    style={{width:"100%",accentColor:"#f87171"}}/>
                  <div style={{fontSize:8,color:maskOvMin>=50?"#4caf50":maskOvMin>=35?"#f59e0b":"#f87171",marginTop:2}}>
                    {maskOvMin>=50?"🟢 Alto":maskOvMin>=35?"🟡 Medio":"⚪ Minimo"}
                  </div>
                </div>
              </div>

              {/* Legenda */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,padding:"6px 10px",borderRadius:6,background:"rgba(0,0,0,0.2)"}}>
                <div style={{fontSize:8,color:"#888",width:"100%",marginBottom:2,fontWeight:700}}>LEGENDA EV:</div>
                {[["EV>+20%","#4caf50","🟢 Eccellente"],["EV+10→+20%","#f59e0b","🟡 Buono"],["EV+3→+10%","#f97316","🟠 Accettabile"],["EV 0→+3%","#888","⚪ Neutro"],["EV<0%","#f87171","🔴 Escludi"]].map(([lbl,col,desc])=>(
                  <div key={lbl} style={{fontSize:8,color:col,background:`${col}11`,border:`1px solid ${col}33`,borderRadius:3,padding:"2px 6px"}}>{desc} ({lbl})</div>
                ))}
                <div style={{fontSize:8,color:"#888",width:"100%",marginTop:2,fontWeight:700}}>LEGENDA QUOTA:</div>
                {[["≥2.00","#4caf50","🟢 Alta"],["1.50→1.99","#f59e0b","🟡 Media"],["1.20→1.49","#f97316","🟠 Bassa"],["<1.20","#f87171","🔴 Escludi"]].map(([lbl,col,desc])=>(
                  <div key={lbl} style={{fontSize:8,color:col,background:`${col}11`,border:`1px solid ${col}33`,borderRadius:3,padding:"2px 6px"}}>{desc} ({lbl})</div>
                ))}
              </div>

              {/* Calcolo multipla scalare */}
              {(()=>{
                // Solo partite con quote Pinnacle reali
                const hasPin=d=>d.f.ov?.pin1&&d.f.ov?.pinX&&d.f.ov?.pin2;
                // Maschera: priorità EV positivo, fallback a tutti con pin
                // Applica filtri qualità utente
                // Stessa logica standard: EV positivo prioritario, fallback a tutti con filtri base
                const baseFilter=d=>hasPin(d)&&
                  (d.calc?.score||0)*100>=maskScoreMin&&
                  (d.f?.ov?.score||0)>=maskOvMin&&
                  (d.pinPick==null||d.pinPick>=maskQuotaMin);
                const evFilter=d=>baseFilter(d)&&d.evInd!=null&&d.evInd*100>=maskEvMin;

                const fPos=comboData.filter(d=>d.pick.startsWith("FISSA")&&evFilter(d));
                const fAll=comboData.filter(d=>d.pick.startsWith("FISSA")&&baseFilter(d));
                const fissePool=(fPos.length>=maskFisse?fPos:fAll).slice(0,maskFisse);

                const dPos=comboData.filter(d=>!d.pick.startsWith("FISSA")&&evFilter(d));
                const dAll=comboData.filter(d=>!d.pick.startsWith("FISSA")&&baseFilter(d));
                const doppiePool=(dPos.length>=maskStep?dPos:dAll);

                // Distribuzione stake scalare
                const rawStakes = Array.from({length:maskStep+1},(_,i)=>Math.pow(1-maskRiduzione/100,i));
                const totRaw = rawStakes.reduce((a,b)=>a+b,0);
                const stakes = rawStakes.map(s=>Math.round(maskStake*s/totRaw*100)/100);

                // Costruisce ogni step della multipla
                const steps = Array.from({length:maskStep+1},(_,i)=>{
                  const nDoppie=maskDoppieStep1+i*maskDoppiePerStep;
                  if(nDoppie>doppiePool.length) return null;
                  const sel=[...fissePool.slice(0,maskFisseStep1),...doppiePool.slice(0,nDoppie)];
                  if(sel.length===0) return null;
                  const pmulti=sel.reduce((acc,d)=>acc*d.ppick,1);
                  const qmulti=sel.reduce((acc,d)=>{
                    const s=d.pick.startsWith("FISSA")?d.pick.replace("FISSA ",""):null;
                    const p1m=d.f.ov?.pin1,pXm=d.f.ov?.pinX,p2m=d.f.ov?.pin2;
                    if(!p1m||!pXm||!p2m) return acc*1; // nessun dato reale → quota 1 (neutro)
                    const pin=s==="1"?p1m:s==="2"?p2m:s==="X"?pXm:
                              d.pick==="1X"?p1m*pXm/(p1m+pXm):
                              d.pick==="X2"?pXm*p2m/(pXm+p2m):
                              d.pick==="1-2"?p1m*p2m/(p1m+p2m):1.50;
                    return acc*(pin||1.80);
                  },1);
                  const ev=pmulti*qmulti-1;
                  const stake=stakes[i]||0;
                  const rendAtteso=stake*ev;
                  const vincita=stake*(qmulti-1);
                  return {i,sel,pmulti,qmulti,ev,stake,rendAtteso,vincita,
                    label:`M${i+1}: ${maskFisseStep1}F+${nDoppie}D`};
                }).filter(Boolean);

                const stepsFiltered = steps.filter(s=>s.ev*100>=maskEvMin);
                const totalStake = stepsFiltered.reduce((a,s)=>a+s.stake,0);
                const evTot = stepsFiltered.length>0?
                  stepsFiltered.reduce((a,s)=>a+s.rendAtteso,0)/totalStake:0;

                return(
                <div>
                  {fissePool.length===0&&(
                    <div style={{padding:"12px",borderRadius:8,background:"rgba(248,113,113,0.08)",border:"1px solid rgba(248,113,113,0.2)",marginBottom:8,fontSize:11,color:"#f87171"}}>
                      ⚠️ Nessuna fissa supera i filtri impostati. Abbassa EV minimo, quota minima o score minimo.
                    </div>
                  )}
                  {fissePool.length>0&&doppiePool.length===0&&maskStep>0&&(
                    <div style={{padding:"12px",borderRadius:8,background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",marginBottom:8,fontSize:11,color:"#f59e0b"}}>
                      ⚠️ Nessuna doppia supera i filtri. Solo multipla con fisse disponibile.
                    </div>
                  )}
                  {/* Steps table */}
                  <div style={{display:"grid",gridTemplateColumns:"80px 1fr 65px 55px 55px 60px 65px",gap:4,fontSize:9,color:"#555",letterSpacing:1,padding:"4px 8px",borderBottom:"1px solid #222",marginBottom:4}}>
                    <div>MULTIPLA</div><div>EVENTI</div><div style={{textAlign:"center"}}>STAKE</div>
                    <div style={{textAlign:"center"}}>P WIN</div><div style={{textAlign:"center"}}>QUOTA</div>
                    <div style={{textAlign:"center"}}>EV</div><div style={{textAlign:"center"}}>REND ATT</div>
                  </div>
                  {steps.filter(Boolean).map(s=>{
                    const ok=s&&s.ev*100>=maskEvMin;
                    return(
                    <div key={s.i} style={{display:"grid",gridTemplateColumns:"80px 1fr 65px 55px 55px 60px 65px",
                      gap:4,padding:"6px 8px",borderRadius:6,marginBottom:3,
                      background:ok?"rgba(167,139,250,0.05)":"rgba(255,255,255,0.01)",
                      border:`1px solid ${ok?"rgba(167,139,250,0.2)":"#1a1a1a"}`,
                      opacity:ok?1:0.4}}>
                      <div style={{fontSize:10,fontWeight:700,color:ok?"#a78bfa":"#555"}}>{s.label}</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                        {s.sel.map((d,j)=>(
                          <div key={j} style={{fontSize:10,padding:"3px 8px",borderRadius:4,marginBottom:2,
                            background:d.pick.startsWith("FISSA")?"rgba(34,211,238,0.08)":"rgba(167,139,250,0.08)",
                            border:`1px solid ${d.pick.startsWith("FISSA")?"rgba(34,211,238,0.2)":"rgba(167,139,250,0.2)"}`,
                            color:d.pick.startsWith("FISSA")?C.cyan:"#a78bfa",
                            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span>{d.pick.startsWith("FISSA")?"🔒":"🎯"} {d.f.home} vs {d.f.away}</span>
                            <span style={{fontWeight:700,marginLeft:8}}>{d.pick} · {(d.ppick*100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                      <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:"#4caf50"}}>€{s.stake.toFixed(0)}</div>
                      <div style={{textAlign:"center",fontSize:11,color:s.pmulti>=0.25?"#4caf50":"#f59e0b"}}>{(s.pmulti*100).toFixed(0)}%</div>
                      <div style={{textAlign:"center",fontSize:11,color:"#a78bfa"}}>{s.qmulti.toFixed(1)}x</div>
                      <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:s.ev>0?"#4caf50":"#f87171"}}>{s.ev>0?"+":""}{(s.ev*100).toFixed(0)}%</div>
                      <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:s.rendAtteso>0?"#4caf50":"#f87171"}}>€{s.rendAtteso>0?"+":""}{s.rendAtteso.toFixed(1)}</div>
                    </div>
                  )})}

                  {/* Riepilogo */}
                  <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.2)",display:"flex",gap:16,flexWrap:"wrap"}}>
                    <div style={{fontSize:11,color:"#888"}}>Step validi: <span style={{color:"#a78bfa",fontWeight:700}}>{stepsFiltered.length}/{steps.length}</span></div>
                    <div style={{fontSize:11,color:"#888"}}>Stake effettivo: <span style={{color:"#4caf50",fontWeight:700}}>€{totalStake.toFixed(0)}</span></div>
                    <div style={{fontSize:11,color:"#888"}}>EV sistema: <span style={{color:evTot>0?"#4caf50":"#f87171",fontWeight:700}}>{evTot>0?"+":""}{(evTot*100).toFixed(1)}%</span></div>
                    <div style={{fontSize:11,color:"#888"}}>Rend. atteso: <span style={{color:evTot>0?"#4caf50":"#f87171",fontWeight:700}}>€{(totalStake*evTot).toFixed(1)}</span></div>
                  </div>

                  {/* Legenda EV */}
                  <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                    {[["EV>+30%","#4caf50","Eccellente"],["EV+15%→+30%","#22d3ee","Buono"],["EV+5%→+15%","#f59e0b","Accettabile"],["EV<+5%","#f87171","Marginale"]].map(([lbl,col,desc])=>(
                      <div key={lbl} style={{fontSize:9,color:col,background:`${col}11`,border:`1px solid ${col}33`,borderRadius:4,padding:"2px 8px"}}>
                        {lbl} → {desc}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })()}
            </div>

            {/* Sort buttons */}
            <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
              <div style={{fontSize:9,color:"#555",letterSpacing:1}}>ORDINA PER:</div>
              {[["cassa","🏦 Cassaforte"],["pct","📈 PCT pura"]].map(([v,l])=>(
                <button key={v} onClick={()=>setComboSort(v)}
                  style={{padding:"5px 12px",borderRadius:99,fontSize:10,cursor:"pointer",fontFamily:"inherit",
                    border:`1px solid ${comboSort===v?"#a78bfa":C.border}`,
                    background:comboSort===v?"rgba(167,139,250,0.15)":"transparent",
                    color:comboSort===v?"#a78bfa":"#666"}}>
                  {l}
                </button>
              ))}
            </div>

            {/* Header tabella */}
            <div style={{display:"grid",gridTemplateColumns:"36px 80px 1fr 1fr 80px 90px 70px 55px 55px 55px",gap:6,padding:"6px 10px",fontSize:9,color:"#555",letterSpacing:1,borderBottom:"1px solid rgba(255,255,255,0.07)",marginBottom:4}}>
              <div>#</div><div>DATA</div><div>CASA</div><div>TRASFERTA</div>
              <div style={{textAlign:"center"}}>SORPRESA</div>
              <div style={{textAlign:"center"}}>PICK</div>
              <div style={{textAlign:"center"}}>PCT EFF</div>
              <div style={{textAlign:"center"}}>OV</div>
              <div style={{textAlign:"center"}}>ALIGN</div>
              <div style={{textAlign:"center"}}>🏦 CASSA</div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              {comboData.map(({f,calc,S,sLabel,sCol,pick,ppick,pickLabel,scoreCassa,align,ov,bh,bx,ba,domSign,nv1,nvX,nv2,pinPick,evInd},i)=>{
                const isTop=i<(bestCombo?.n||5);
                const isExp=comboExpanded===i;
                return(
                <div key={i}>
                  <div onClick={()=>setComboExpanded(isExp?null:i)} style={{display:"grid",
                    gridTemplateColumns:"36px 80px 1fr 1fr 80px 90px 70px 55px 55px 55px",
                    gap:6,padding:"9px 10px",borderRadius:isExp?"9px 9px 0 0":9,cursor:"pointer",
                    background:isTop?"rgba(167,139,250,0.05)":C.card,
                    border:`1px solid ${isTop?"rgba(167,139,250,0.2)":C.border}`,
                    alignItems:"center"}}>
                    <div style={{fontSize:12,color:isTop?"#a78bfa":"#555",fontWeight:700}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                    <div style={{fontSize:10,color:"#aaa",lineHeight:1.4}}>{f.date||"—"}<br/><span style={{fontSize:9,color:"#555"}}>{f.time||""}</span></div>
                    <div style={{fontSize:12,fontWeight:700,color:C.cyan,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</div>
                    <div style={{fontSize:12,fontWeight:700,color:C.pink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:10,fontWeight:700,color:sCol}}>{sLabel}</div>
                      <div style={{fontSize:9,color:sCol}}>{(S*100).toFixed(0)}/100</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:12,fontWeight:800,color:"#a78bfa",background:"rgba(167,139,250,0.1)",padding:"3px 8px",borderRadius:6}}>{pick}</span>
                      <div style={{fontSize:8,color:"#555",marginTop:2}}>{pickLabel}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:ppick>=0.75?"#4caf50":ppick>=0.60?"#f59e0b":"#f87171"}}>{(ppick*100).toFixed(1)}%</span>
                      {evInd!=null&&<div style={{fontSize:9,color:evInd>0?"#4caf50":"#f87171"}}>{evInd>0?"+":""}{(evInd*100).toFixed(0)}%EV</div>}
                    </div>
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:ov>=60?"#4caf50":ov>=40?"#f59e0b":"#f87171"}}>{ov||"—"}</span>
                    </div>
                    {(()=>{const mb=movBadge(f.ov?.movement_pct);if(!mb||Math.abs(mb.val)<1)return <div style={{textAlign:"center",color:"#333",fontSize:9}}>—</div>;return <div style={{textAlign:"center"}}><span style={{fontSize:10,fontWeight:700,color:mb.col}}>{mb.icon}{Math.abs(mb.val).toFixed(1)}%</span></div>;})()}
                    <div style={{textAlign:"center"}}>
                      <span style={{fontSize:11,fontWeight:700,color:align>=0.85?"#4caf50":align>=0.70?"#f59e0b":"#f87171"}}>{(align*100).toFixed(0)}%</span>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:13,fontWeight:900,color:scoreCassa>=0.50?"#4caf50":scoreCassa>=0.35?"#f59e0b":"#f87171"}}>{(scoreCassa*100).toFixed(0)}</div>
                      <div style={{fontSize:8,color:"#555"}}>/100</div>
                    </div>
                  </div>

                  {isExp&&(
                  <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(167,139,250,0.2)",
                    borderTop:"none",borderRadius:"0 0 9px 9px",padding:"14px 16px",
                    display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                    <div>
                      <div style={{fontSize:12,color:C.cyan,fontWeight:700,marginBottom:8}}>⚡ BLENDED (Poisson+PIN)</div>
                      {[["1 Casa",bh,nv1,"1"],["X Pari",bx,nvX,"X"],["2 Ospite",ba,nv2,"2"]].map(([lbl,bp,pn,s])=>(
                        <div key={lbl} style={{marginBottom:6}}>
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{fontSize:11,color:"#888"}}>{lbl}</span>
                            <span style={{fontSize:13,fontWeight:700,color:domSign===s?"#4caf50":"#aaa"}}>{(bp*100).toFixed(1)}%</span>
                          </div>
                          {pn&&<div style={{fontSize:9,color:"#555",textAlign:"right"}}>PIN: {(pn*100).toFixed(1)}%</div>}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{fontSize:12,color:"#f59e0b",fontWeight:700,marginBottom:8}}>🎲 SURPRISE INDEX</div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:11,color:"#888"}}>S (sorpresa)</span>
                        <span style={{fontSize:13,fontWeight:700,color:sCol}}>{(S*100).toFixed(0)}/100</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:11,color:"#888"}}>Livello</span>
                        <span style={{fontSize:12,fontWeight:700,color:sCol}}>{sLabel}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:11,color:"#888"}}>Pick</span>
                        <span style={{fontSize:12,fontWeight:700,color:"#a78bfa"}}>{pick}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,color:"#888"}}>Tipo</span>
                        <span style={{fontSize:12,color:"#aaa"}}>{pickLabel}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:12,color:"#4caf50",fontWeight:700,marginBottom:8}}>💰 SCORE CASSAFORTE</div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:11,color:"#888"}}>PCT efficace</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#4caf50"}}>{(ppick*(1-S)*100).toFixed(1)}%</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:11,color:"#888"}}>Align Pinnacle</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#4caf50"}}>{(align*100).toFixed(0)}%</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:11,color:"#888"}}>OV Score</span>
                        <span style={{fontSize:13,fontWeight:700,color:ov>=60?"#4caf50":ov>=40?"#f59e0b":"#f87171"}}>{ov||"—"}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,color:"#888"}}>🏦 Cassaforte</span>
                        <span style={{fontSize:14,fontWeight:900,color:scoreCassa>=0.50?"#4caf50":scoreCassa>=0.35?"#f59e0b":"#f87171"}}>{(scoreCassa*100).toFixed(0)}/100</span>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        );})()}

        {tab==="cerca"&&(
          <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:18}}>

            {/* Pannello input */}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              {[["🏠 SQUADRA CASA",homeInput,setHomeInput,C.cyan],["✈️ SQUADRA TRASFERTA",awayInput,setAwayInput,C.pink]].map(([label,val,setVal,col])=>(

                <div key={label} style={{background:C.card,border:`1px solid ${col}33`,borderRadius:14,padding:16}}>

                  <div style={{fontSize:9,color:col,letterSpacing:2,marginBottom:10}}>{label}</div>

                  <input value={val} onChange={e=>{setVal(e.target.value);setManualPred(null);}} placeholder="es: Inter, Liverpool, Real Madrid..." style={{width:"100%",background:"#0a1220",border:`1px solid ${col}55`,color:"#fff",padding:"10px",borderRadius:8,fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",fontWeight:700}}/>

                </div>

              ))}

              <button onClick={runManual} disabled={!homeInput||!awayInput||homeInput===awayInput||manualLoading} style={{padding:"13px",borderRadius:10,fontSize:10,letterSpacing:3,cursor:"pointer",border:`1px solid ${C.cyan}`,background:`${C.cyan}0d`,color:C.cyan,fontFamily:"inherit",fontWeight:900}}>

                {manualLoading?"🔍 CERCO...":"🔍 CERCA PARTITA"}

              </button>

              <div style={{fontSize:9,color:"#444",lineHeight:1.8,padding:10,background:C.card,borderRadius:10}}>

                💡 Cerca qualsiasi squadra nel calendario della settimana.<br/>I dati vengono dal <span style={{color:C.cyan}}>motore Python completo</span> — identici al ranking.

              </div>

              {allPreds.length>0&&<div style={{fontSize:9,color:"#2a5",padding:"6px 10px",background:"#0a2a1a",borderRadius:8}}>✅ {allPreds.length} previsioni caricate</div>}

            </div>


            {/* Risultato */}
            <div>

              {!manualPred&&!manualLoading&&(

                <div style={{background:C.card,border:"1px dashed #1a1a2e",borderRadius:14,padding:60,textAlign:"center",color:"#2a2a4e"}}>

                  <div style={{fontSize:40,marginBottom:12}}>🔍</div>

                  <div style={{fontSize:11,letterSpacing:3}}>CERCA NEL CALENDARIO</div>

                  <div style={{fontSize:9,marginTop:8,color:"#333",lineHeight:1.8}}>Scrivi casa e trasferta per trovare la previsione<br/>generata dal motore Python stanotte</div>

                </div>

              )}

              {manualLoading&&<div style={{textAlign:"center",padding:40,color:C.cyan}}><div style={{fontSize:10,letterSpacing:3,marginBottom:12}}>🔍 CERCO NEL DATABASE...</div><Wave w={400}/></div>}


              {/* Partita NON trovata */}
              {manualPred&&manualPred.notFound&&!manualLoading&&(

                <div style={{background:C.card,border:`1px solid ${C.amber}33`,borderRadius:14,padding:32,textAlign:"center"}}>

                  <div style={{fontSize:32,marginBottom:12}}>⚠️</div>

                  <div style={{fontSize:11,color:C.amber,letterSpacing:2,marginBottom:8}}>PARTITA NON IN CALENDARIO</div>

                  <div style={{fontSize:10,color:"#666",lineHeight:1.8}}>
                    <b style={{color:"#aaa"}}>{manualPred.home}</b> vs <b style={{color:"#aaa"}}>{manualPred.away}</b><br/>

                    non è nei prossimi 7 giorni di calendario.<br/>

                    Il motore prevede solo partite realmente schedulate.

                  </div>

                  <div style={{marginTop:16,fontSize:9,color:"#444"}}>Controlla il tab <span style={{color:C.cyan}}>📅 OGGI</span> per le partite disponibili</div>

                </div>

              )}


              {/* Partita TROVATA */}
              {manualPred&&manualPred.pred&&!manualLoading&&(()=>{
                const p=manualPred.pred;
                const bv=Math.max(p.home,p.draw,p.away);
                const bestLabel=bv===p.home?"1":bv===p.draw?"X":"2";
                const bestCol=bv===p.home?C.cyan:bv===p.draw?C.amber:C.pink;
                return(

                <div style={{display:"flex",flexDirection:"column",gap:12}}>


                  {/* Header */}
                  <div style={{background:`linear-gradient(135deg,${C.cyan}0a,${C.purple}07)`,border:`1px solid ${C.cyan}33`,borderRadius:14,padding:20}}>

                    <div style={{textAlign:"center",marginBottom:16}}>

                      <div style={{fontSize:9,color:"#555",letterSpacing:2,marginBottom:6}}>{p.league||""}{p.season?` · ${p.season}`:""}{p.stage?` · ${p.stage}`:""}</div>

                      <div style={{fontSize:16,fontWeight:900}}><span style={{color:C.cyan}}>{manualPred.home}</span><span style={{color:"#333",margin:"0 12px"}}>vs</span><span style={{color:C.pink}}>{manualPred.away}</span></div>

                      <div style={{fontSize:11,color:"#aaa",fontWeight:600,marginTop:6}}>{p.date?`📅 ${p.date}`:""}{p.time?` 🕐 ${p.time}`:""}</div>

                    </div>


                    {/* 1 X 2 bars */}
                    {[["1",p.home,C.cyan],["X",p.draw,C.amber],["2",p.away,C.pink]].map(([lbl,val,col])=>(

                      <div key={lbl} style={{marginBottom:10}}>

                        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginBottom:3}}>

                          <span style={{color:lbl==="1"?C.cyan:lbl==="X"?C.amber:C.pink}}>{lbl==="1"?manualPred.home:lbl==="2"?manualPred.away:"Pareggio"}</span>

                          <span style={{color:col,fontWeight:900}}>{(val*100).toFixed(1)}%</span>

                        </div>

                        <div style={{background:"#111",borderRadius:4,height:6}}>

                          <div style={{background:col,width:`${val*100}%`,height:"100%",borderRadius:4,transition:"width 0.8s"}}/>

                        </div>

                      </div>

                    ))}


                    {/* Best bet + confidence */}
                    <div style={{display:"flex",gap:10,marginTop:14}}>

                      <div style={{flex:1,background:"#0a1220",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>

                        <div style={{fontSize:8,color:"#555",letterSpacing:2}}>BEST BET</div>

                        <div style={{fontSize:22,fontWeight:900,color:bestCol}}>{bestLabel}</div>

                        <div style={{fontSize:9,color:bestCol}}>{(bv*100).toFixed(1)}%</div>

                      </div>

                      <div style={{flex:1,background:"#0a1220",borderRadius:10,padding:"10px 14px",textAlign:"center"}}>

                        <div style={{fontSize:8,color:"#555",letterSpacing:2}}>CONFIDENZA</div>

                        <div style={{fontSize:22,fontWeight:900,color:p.confidence>0.4?C.green:C.amber}}>{(p.confidence*100).toFixed(1)}%</div>

                      </div>

                    </div>

                  </div>


                  {/* Over/BTTS/DC */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>

                    {[["⚽ OVER 2.5",p.over_25,C.green],["🥅 BTTS SÌ",p.btts_y,C.purple],["🔒 DC 1X",p.dc_1x,C.cyan]].map(([lbl,val,col])=>(

                      val!=null&&<div key={lbl} style={{background:C.card,borderRadius:10,padding:"12px",textAlign:"center"}}>

                        <div style={{fontSize:8,color:"#555",marginBottom:4}}>{lbl}</div>

                        <div style={{fontSize:16,fontWeight:900,color:val>0.55?col:"#555"}}>{(val*100).toFixed(1)}%</div>

                      </div>

                    ))}

                  </div>


                  {/* Source badge */}
                  <div style={{fontSize:9,color:"#2a5",padding:"6px 12px",background:"#0a2a1a",borderRadius:8,textAlign:"center"}}>

                    {p.source||"🐍 Motore Python · Dati reali API · Identico al ranking"}
                  </div>
                  {manualPred.pp&&manualPred.pp.pp_label&&(<div style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:10,padding:"10px 14px",marginTop:8}}><div style={{fontSize:8,color:"#a78bfa",letterSpacing:2,marginBottom:6}}>⚡ PP INDEX · KPZ/PARISI</div><div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:9}}><span style={{fontSize:14,fontWeight:900,color:manualPred.pp.pp_result==="1"?C.cyan:manualPred.pp.pp_result==="2"?C.pink:manualPred.pp.pp_result==="X"?C.amber:"#aaa"}}>{manualPred.pp.pp_label}</span><span>I casa: <b>{manualPred.pp.pp_i_casa?.toFixed(2)}</b></span><span>I ospite: <b>{manualPred.pp.pp_i_ospite?.toFixed(2)}</b></span><span>D: <b style={{color:"#a78bfa"}}>{manualPred.pp.pp_D?.toFixed(2)}</b></span><span>Scala: <b style={{color:"#a78bfa"}}>{manualPred.pp.pp_pct?.toFixed(0)}%</b></span></div></div>)}


                  {/* History */}
                  {history.length>1&&(

                    <div style={{background:C.card,borderRadius:12,padding:14}}>

                      <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:8}}>ULTIME RICERCHE</div>

                      {history.slice(1,6).map((h,i)=>(

                        <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:9,padding:"4px 0",borderTop:"1px solid #111"}}>

                          <span style={{color:"#555"}}>{h.home} vs {h.away}</span>

                          <span style={{color:C.cyan}}>{h.ts}</span>

                        </div>

                      ))}

                    </div>

                  )}

                </div>

              );})()}

            </div>

          </div>

        )}

        {tab==="perf"&&(()=>{
          if(histLoading)return <div style={{textAlign:"center",padding:60,color:C.cyan}}><div style={{fontSize:10,letterSpacing:3,marginBottom:12}}>📊 CARICAMENTO DATI STORICI...</div><Wave w={400}/></div>;
          if(!histData)return <div style={{textAlign:"center",padding:60,color:"#333"}}><div style={{fontSize:40,marginBottom:12}}>📈</div><div style={{fontSize:11,letterSpacing:3}}>Caricamento in corso...</div></div>;

          const v=histData;
          const total=v.length;
          if(total===0)return <div style={{textAlign:"center",padding:60,color:"#333"}}>Nessun dato verificato ancora.</div>;

          const acc1x2=v.filter(p=>p.correct_1x2).length/total;
          const accOver=v.filter(p=>p.correct_over).length/total;
          const accBtts=v.filter(p=>p.correct_btts).length/total;

          // Trend settimanale
          const weekMap={};
          v.forEach(p=>{
            if(!p.verified_at)return;
            const dt=new Date(p.verified_at);
            const yr=dt.getFullYear();
            const wk=Math.ceil((((dt-new Date(yr,0,1))/86400000)+new Date(yr,0,1).getDay()+1)/7);
            const key=`${yr}-W${String(wk).padStart(2,'0')}`;
            if(!weekMap[key])weekMap[key]={total:0,c1x2:0,cover:0};
            weekMap[key].total++;
            if(p.correct_1x2)weekMap[key].c1x2++;
            if(p.correct_over)weekMap[key].cover++;
          });
          const weeks=Object.entries(weekMap).sort((a,b)=>a[0]>b[0]?1:-1).slice(-6);

          // Per campionato
          const lgMap={};
          v.forEach(p=>{
            const lg=p.league||"?";
            if(!lgMap[lg])lgMap[lg]={total:0,c1x2:0,cover:0};
            lgMap[lg].total++;
            if(p.correct_1x2)lgMap[lg].c1x2++;
            if(p.correct_over)lgMap[lg].cover++;
          });
          const leagues2=Object.entries(lgMap).sort((a,b)=>b[1].total-a[1].total);

          // Confidenza bucket
          const confBuckets=[[0,0.20,"<20%"],[0.20,0.25,"20-25%"],[0.25,0.35,"25-35%"],[0.35,0.50,"35-50%"],[0.50,1,"50%+"]];
          const confData=confBuckets.map(([lo,hi,lbl])=>{
            const bp=v.filter(p=>(p.pred_conf||0)>=lo&&(p.pred_conf||0)<hi);
            const acc=bp.length?bp.filter(p=>p.correct_1x2).length/bp.length:0;
            return{lbl,acc,n:bp.length};
          }).filter(d=>d.n>0);

          // Distribuzione risultati vs previsioni
          const res={1:0,X:0,2:0};
          const pred={1:0,X:0,2:0};
          v.forEach(p=>{res[p.result]=(res[p.result]||0)+1;pred[p.pred_best]=(pred[p.pred_best]||0)+1;});

          return(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* KPI globali */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
              {[
                ["🎯 ACC. 1X2",acc1x2,C.cyan],
                ["⚽ OVER 2.5",accOver,C.green],
                ["🔁 BTTS",accBtts,C.purple],
                ["📊 PARTITE",total/100,"#aaa"],
              ].map(([lbl,val,col])=>(
                <div key={lbl} style={{background:C.card,border:`1px solid ${col}33`,borderRadius:14,padding:16,textAlign:"center"}}>
                  <div style={{fontSize:8,color:"#555",letterSpacing:2,marginBottom:6}}>{lbl}</div>
                  <div style={{fontSize:26,fontWeight:900,color:col}}>{lbl==="📊 PARTITE"?total:(val*100).toFixed(1)+"%"}</div>
                  {lbl!=="📊 PARTITE"&&<div style={{fontSize:8,color:val>0.45?C.green:val>0.35?C.amber:"#f44",marginTop:4}}>{val>0.45?"✅ Buono":val>0.35?"⚠️ Ok":"❌ Da migliorare"}</div>}
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

              {/* Trend settimanale */}
              <div style={{background:C.card,borderRadius:14,padding:16}}>
                <div style={{fontSize:9,color:C.cyan,letterSpacing:2,marginBottom:14}}>📈 TREND SETTIMANALE 1X2</div>
                {weeks.map(([wk,ws])=>{
                  const a=ws.c1x2/ws.total;
                  return(
                  <div key={wk} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginBottom:3}}>
                      <span style={{color:"#555"}}>{wk}</span>
                      <span style={{color:a>0.45?C.green:a>0.35?C.amber:"#f55",fontWeight:900}}>{(a*100).toFixed(0)}% <span style={{color:"#444",fontWeight:400}}>({ws.total}p)</span></span>
                    </div>
                    <div style={{background:"#111",borderRadius:4,height:5}}>
                      <div style={{background:a>0.45?C.green:a>0.35?C.amber:"#f55",width:`${a*100}%`,height:"100%",borderRadius:4}}/>
                    </div>
                  </div>
                )})}
              </div>

              {/* Confidenza vs accuracy */}
              <div style={{background:C.card,borderRadius:14,padding:16}}>
                <div style={{fontSize:9,color:C.purple,letterSpacing:2,marginBottom:14}}>🎯 CONFIDENZA vs ACCURACY</div>
                {confData.map(d=>(
                  <div key={d.lbl} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginBottom:3}}>
                      <span style={{color:"#555"}}>Conf {d.lbl}</span>
                      <span style={{color:d.acc>0.5?C.green:d.acc>0.35?C.amber:"#f55",fontWeight:900}}>{(d.acc*100).toFixed(0)}% <span style={{color:"#444",fontWeight:400}}>({d.n}p)</span></span>
                    </div>
                    <div style={{background:"#111",borderRadius:4,height:5}}>
                      <div style={{background:d.acc>0.5?C.green:d.acc>0.35?C.amber:"#f55",width:`${d.acc*100}%`,height:"100%",borderRadius:4}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per campionato */}
            <div style={{background:C.card,borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:C.amber,letterSpacing:2,marginBottom:14}}>🏆 ACCURACY PER CAMPIONATO</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
                {leagues2.map(([lg,s])=>{
                  const a=s.c1x2/s.total;
                  const ao=s.cover/s.total;
                  return(
                  <div key={lg} style={{background:"#0a1220",borderRadius:10,padding:12}}>
                    <div style={{fontSize:9,color:"#aaa",fontWeight:700,marginBottom:6}}>{lg}</div>
                    <div style={{display:"flex",gap:8,marginBottom:6}}>
                      <div style={{flex:1,textAlign:"center"}}>
                        <div style={{fontSize:8,color:"#444"}}>1X2</div>
                        <div style={{fontSize:16,fontWeight:900,color:a>0.5?C.green:a>0.38?C.amber:"#f55"}}>{(a*100).toFixed(0)}%</div>
                      </div>
                      <div style={{flex:1,textAlign:"center"}}>
                        <div style={{fontSize:8,color:"#444"}}>OVER</div>
                        <div style={{fontSize:16,fontWeight:900,color:ao>0.5?C.green:ao>0.38?C.amber:"#f55"}}>{(ao*100).toFixed(0)}%</div>
                      </div>
                      <div style={{flex:1,textAlign:"center"}}>
                        <div style={{fontSize:8,color:"#444"}}>PARTITE</div>
                        <div style={{fontSize:16,fontWeight:900,color:"#555"}}>{s.total}</div>
                      </div>
                    </div>
                    <div style={{background:"#111",borderRadius:3,height:3}}>
                      <div style={{background:a>0.5?C.green:a>0.38?C.amber:"#f55",width:`${a*100}%`,height:"100%",borderRadius:3}}/>
                    </div>
                  </div>
                )})}
              </div>
            </div>

            {/* Distribuzione 1X2 */}
            <div style={{background:C.card,borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#555",letterSpacing:2,marginBottom:14}}>📊 PREVISIONI vs RISULTATI REALI</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                {[["PREVISIONI",pred],["RISULTATI REALI",res]].map(([title,data2])=>(
                  <div key={title}>
                    <div style={{fontSize:8,color:"#444",marginBottom:8}}>{title}</div>
                    {["1","X","2"].map(k=>{
                      const val=(data2[k]||0)/total;
                      const col=k==="1"?C.cyan:k==="X"?C.amber:C.pink;
                      return(
                      <div key={k} style={{marginBottom:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,marginBottom:2}}>
                          <span style={{color:col}}>{k==="1"?"Casa":k==="X"?"Pareggio":"Trasferta"}</span>
                          <span style={{color:col,fontWeight:900}}>{(val*100).toFixed(0)}% ({data2[k]||0})</span>
                        </div>
                        <div style={{background:"#111",borderRadius:3,height:4}}>
                          <div style={{background:col,width:`${val*100}%`,height:"100%",borderRadius:3}}/>
                        </div>
                      </div>
                    )})}
                  </div>
                ))}
              </div>
            </div>

          </div>
        );})()}

        {tab==="risultati"&&(()=>{
          if(risultatiLoading)return(<div style={{textAlign:"center",padding:60,color:C.cyan}}><div style={{fontSize:10,letterSpacing:3,marginBottom:12}}>📊 CARICAMENTO RISULTATI...</div><Wave w={400}/></div>);
          if(!risultatiData)return(<div style={{textAlign:"center",padding:60,color:"#333"}}><div style={{fontSize:40,marginBottom:12}}>🏁</div><div style={{fontSize:11,letterSpacing:3}}>Caricamento...</div></div>);

          // Filtri
          const norm=s=>(s||"").toLowerCase();
          const filtered2=risultatiData.filter(p=>{
            const matchSearch=!risultatiSearch||
              norm(p.home).includes(norm(risultatiSearch))||
              norm(p.away).includes(norm(risultatiSearch))||
              norm(p.league).includes(norm(risultatiSearch));
            const matchDate=!risultatiDate||p.date===risultatiDate;
            return matchSearch&&matchDate;
          });

          // Date disponibili
          const dates=[...new Set(risultatiData.map(p=>p.date||"").filter(Boolean))].sort((a,b)=>b.localeCompare(a));

          const acc1x2=filtered2.length?filtered2.filter(p=>p.correct_1x2).length/filtered2.length:0;
          const accOver=filtered2.length?filtered2.filter(p=>p.correct_over).length/filtered2.length:0;

          return(
          <div>
            {/* Filtri */}
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <input value={risultatiSearch} onChange={e=>setRisultatiSearch(e.target.value)}
                placeholder="🔍 Cerca squadra o campionato..."
                style={{flex:1,minWidth:200,background:"#0a1220",border:`1px solid ${C.border}`,color:"#fff",padding:"8px 12px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}/>
              <select value={risultatiDate} onChange={e=>setRisultatiDate(e.target.value)}
                style={{background:"#0a1220",border:`1px solid ${C.border}`,color:"#fff",padding:"8px 12px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                <option value="">📅 Tutte le date</option>
                {dates.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              {(risultatiSearch||risultatiDate)&&(
                <button onClick={()=>{setRisultatiSearch("");setRisultatiDate("");}}
                  style={{background:"#1a1a2e",border:`1px solid ${C.border}`,color:"#888",padding:"8px 12px",borderRadius:8,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>
                  ✕ Reset
                </button>
              )}
              <div style={{fontSize:9,color:"#555",letterSpacing:1}}>
                {filtered2.length} risultati · 1X2: <span style={{color:acc1x2>0.5?C.green:acc1x2>0.38?C.amber:"#f55"}}>{(acc1x2*100).toFixed(0)}%</span> · Over: <span style={{color:accOver>0.5?C.green:accOver>0.38?C.amber:"#f55"}}>{(accOver*100).toFixed(0)}%</span>
              </div>
            </div>

            {/* Lista risultati */}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {filtered2.slice(0,100).map((p,i)=>{
                const ok=p.correct_1x2;
                const okO=p.correct_over;
                const okB=p.correct_btts;
                const okC=p.correct_combo;
                const ppR=p.pred_combo_leg?`${p.pred_best}+${p.pred_combo_leg}`:"";
                return(
                <div key={i} style={{background:C.card,border:`1px solid ${ok?C.green+"33":"#f5545433"}`,borderRadius:10,padding:"10px 14px",display:"grid",gridTemplateColumns:"80px 1fr 1fr 60px 60px 60px 60px 80px 70px",gap:6,alignItems:"center"}}>
                  <div style={{fontSize:11,color:"#aaa",fontWeight:600}}>{p.date||""}<br/><span style={{fontSize:10,color:"#777"}}>{p.time||""}</span></div>
                  <div style={{fontSize:10,fontWeight:700,color:C.cyan,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.home}</div>
                  <div style={{fontSize:10,fontWeight:700,color:C.pink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.away}</div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:8,color:"#555"}}>PREV</div>
                    <div style={{fontSize:12,fontWeight:900,color:C.amber}}>{p.pred_best}</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:8,color:"#555"}}>REALE</div>
                    <div style={{fontSize:12,fontWeight:900,color:ok?C.green:"#f55"}}>{p.result} {ok?"✅":"❌"}</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:8,color:"#555"}}>GOL</div>
                    <div style={{fontSize:11,fontWeight:700,color:"#aaa"}}>{p.goals_home??"-"}-{p.goals_away??"-"}</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:7,color:"#555"}}>O·B·C</div>
                    <div style={{fontSize:10}}>{okO===true?"✅":okO===false?"❌":"—"} {okB===true?"✅":okB===false?"❌":"—"} {okC===true?"✅":okC===false?"❌":"—"}</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:7,color:"#555"}}>CONF</div>
                    <div style={{fontSize:9,color:confColor(p.pred_conf||0)}}>{((p.pred_conf||0)*100).toFixed(0)}%</div>
                    {ppR&&<div style={{fontSize:7,color:"#a78bfa",marginTop:2}}>{ppR}</div>}
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:7,color:"#555"}}>PP</div>
                    {p.pp_label?(
                      <div style={{fontSize:8,fontWeight:700,color:p.pp_result==="1"?C.cyan:p.pp_result==="2"?C.pink:p.pp_result==="X"?"#f59e0b":p.pp_result==="1X"?"#34d399":p.pp_result==="X2"?"#f97316":"#888"}}>
                        {p.pp_label.replace(/[🎯🛡️⚖️🔀]/g,"").trim()}
                        {p.correct_pp!==null&&p.correct_pp!==undefined&&<span style={{marginLeft:3}}>{p.correct_pp?"✅":"❌"}</span>}
                      </div>
                    ):<div style={{fontSize:8,color:"#444"}}>—</div>}
                  </div>
                </div>
              )})}
              {filtered2.length>100&&<div style={{textAlign:"center",fontSize:9,color:"#555",padding:10}}>Mostrati 100 di {filtered2.length} — usa la ricerca per filtrare</div>}
              {filtered2.length===0&&<div style={{textAlign:"center",padding:40,color:"#333",fontSize:11}}>Nessun risultato trovato</div>}
            </div>
          </div>
        );})()}

        {tab==="log"&&(
          <div>
            <div style={{fontSize:9,color:"#555",letterSpacing:2,marginBottom:14}}>{history.length} ANALISI MANUALI</div>
            {history.length===0&&<div style={{textAlign:"center",padding:60,color:"#333"}}>Nessuna analisi — usa 🔍 CERCA</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
              {history.map((h,i)=>(
                <div key={i} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:8,color:"#444"}}>{h.ts}</span>
                    <span style={{fontSize:8,color:confColor(h.pred.conf)}}>Conf {pct(h.pred.conf)}</span>
                  </div>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>
                    <span style={{color:C.cyan}}>{h.home}</span><span style={{color:"#444",margin:"0 6px"}}>vs</span><span style={{color:C.pink}}>{h.away}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5}}>
                    {[["1",h.pred.home,C.cyan],["X",h.pred.draw,C.amber],["2",h.pred.away,C.pink]].map(([l,v,c])=>(
                      <div key={l} style={{textAlign:"center",background:`${c}0a`,borderRadius:7,padding:"5px 4px"}}>
                        <div style={{fontSize:8,color:c}}>{l}</div>
                        <div style={{fontSize:13,fontWeight:900}}>{pct(v)}</div>
                      </div>
                    ))}
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
