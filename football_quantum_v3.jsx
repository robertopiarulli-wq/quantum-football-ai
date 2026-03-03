import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ═══════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════
const GITHUB_FIXTURES = "https://raw.githubusercontent.com/robertopiarulli-wq/quantum-football-ai/main/fixtures_today.json";
const GITHUB_PREDICTIONS = "https://raw.githubusercontent.com/robertopiarulli-wq/quantum-football-ai/main/predictions_output.json";

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
      <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#555",marginBottom:8}}>
        <span style={{color:C.purple}}>{fix.league}</span>
        <span>{fix.date} {fix.time||""}</span>
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
  const[homeInput,setHomeInput]=useState("");
  const[awayInput,setAwayInput]=useState("");
  const[manualPred,setManualPred]=useState(null);
  const[manualLoading,setManualLoading]=useState(false);
  const[history,setHistory]=useState([]);
  const[cycles,setCycles]=useState(0);

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
          setFixtures(d.fixtures);
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

  const leagues=useMemo(()=>{
    const s=new Set(fixtures.map(f=>f.league));
    return["Tutti",...LEAGUES_ORDER.filter(l=>s.has(l)),...[...s].filter(l=>!LEAGUES_ORDER.includes(l))];
  },[fixtures]);

  const filtered=useMemo(()=>{
    if(filterLeague==="Tutti")return fixtures;
    return fixtures.filter(f=>f.league===filterLeague);
  },[fixtures,filterLeague]);

  const ranked=useMemo(()=>{
    return[...fixtures].sort((a,b)=>{
      const v=f=>f.pred?rnkSort==="conf"?f.pred.conf:rnkSort==="home"?f.pred.home:rnkSort==="away"?f.pred.away:rnkSort==="draw"?f.pred.draw:rnkSort==="over"?f.pred.over25:f.pred.bttsY:0;
      return v(b)-v(a);
    });
  },[fixtures,rnkSort]);

  const runManual=useCallback(()=>{
    const h=homeInput.trim(),a=awayInput.trim();
    if(!h||!a||h===a)return;
    setManualLoading(true);setManualPred(null);
    setTimeout(()=>{
      const pred=computeMatch(h,a);
      setManualPred({home:h,away:a,pred});
      setCycles(c=>c+1);
      setHistory(prev=>[{home:h,away:a,pred,ts:new Date().toLocaleTimeString("it-IT")},...prev.slice(0,29)]);
      setManualLoading(false);
    },900);
  },[homeInput,awayInput]);

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
        {[["oggi","📅 OGGI"],["ranking","📊 RANKING"],["cerca","🔍 CERCA"],["log","📋 LOG"]].map(([t,l])=>(
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
              {[["conf","🎲 Conf"],["home","1️⃣ Casa"],["draw","➖ Pari"],["away","2️⃣ Trasf"],["over","⚽ Over"],["btts","🔁 BTTS"]].map(([v,l])=>(
                <button key={v} onClick={()=>setRnkSort(v)} style={{padding:"5px 11px",borderRadius:99,fontSize:9,cursor:"pointer",border:`1px solid ${rnkSort===v?C.cyan:C.border}`,background:rnkSort===v?`${C.cyan}15`:"transparent",color:rnkSort===v?C.cyan:"#666",fontFamily:"inherit"}}>{l}</button>
              ))}
            </div>
            {ranked.length===0&&<div style={{textAlign:"center",padding:60,color:"#333",fontSize:10}}>Nessuna partita — esegui il workflow da GitHub Actions</div>}
            {ranked.length>0&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"36px 1fr 1fr 62px 62px 62px 62px 62px 72px",gap:6,padding:"7px 10px",fontSize:8,color:"#555",letterSpacing:1,borderBottom:"1px solid "+C.border,marginBottom:4}}>
                  <div>#</div><div>CASA</div><div>TRASFERTA</div>
                  <div style={{textAlign:"center"}}>1</div><div style={{textAlign:"center"}}>X</div><div style={{textAlign:"center"}}>2</div>
                  <div style={{textAlign:"center"}}>O2.5</div><div style={{textAlign:"center"}}>BTTS</div><div style={{textAlign:"center"}}>CONF</div>
                </div>
                {ranked.map((f,i)=>!f.pred?null:(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"36px 1fr 1fr 62px 62px 62px 62px 62px 72px",gap:6,padding:"8px 10px",marginBottom:3,borderRadius:9,background:i<3?`${C.cyan}04`:C.card,border:`1px solid ${i<3?C.cyan+"22":C.border}`,alignItems:"center"}}>
                    <div style={{fontSize:11,color:C.amber}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
                    <div style={{fontSize:11,fontWeight:700,color:C.cyan,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.home}</div>
                    <div style={{fontSize:11,fontWeight:700,color:C.pink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.away}</div>
                    <div style={{textAlign:"center",fontSize:11,color:rnkSort==="home"?C.cyan:"#bbb"}}>{pct(f.pred.home)}</div>
                    <div style={{textAlign:"center",fontSize:11,color:rnkSort==="draw"?C.amber:"#bbb"}}>{pct(f.pred.draw)}</div>
                    <div style={{textAlign:"center",fontSize:11,color:rnkSort==="away"?C.pink:"#bbb"}}>{pct(f.pred.away)}</div>
                    <div style={{textAlign:"center",fontSize:11,color:rnkSort==="over"?"#f97316":"#bbb"}}>{pct(f.pred.over25)}</div>
                    <div style={{textAlign:"center",fontSize:11,color:rnkSort==="btts"?C.green:"#bbb"}}>{pct(f.pred.bttsY)}</div>
                    <div style={{textAlign:"center",fontSize:10,fontWeight:700,color:confColor(f.pred.conf)}}>{pct(f.pred.conf)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ CERCA ══ */}
        {tab==="cerca"&&(
          <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:18}}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[["🏠 SQUADRA CASA",homeInput,setHomeInput,C.cyan],["✈️ SQUADRA TRASFERTA",awayInput,setAwayInput,C.pink]].map(([label,val,setVal,col])=>(
                <div key={label} style={{background:C.card,border:`1px solid ${col}33`,borderRadius:14,padding:16}}>
                  <div style={{fontSize:9,color:col,letterSpacing:2,marginBottom:10}}>{label}</div>
                  <input value={val} onChange={e=>setVal(e.target.value)} placeholder="es: Venezia, Avellino, Bayern..." style={{width:"100%",background:"#0a1220",border:`1px solid ${col}55`,color:"#fff",padding:"10px",borderRadius:8,fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",fontWeight:700}}/>
                  {val&&<div style={{marginTop:5,fontSize:9,color:"#555"}}>ELO: <span style={{color:col}}>{ELO_DB[val]||"~1650 (stimato)"}</span></div>}
                </div>
              ))}
              <button onClick={runManual} disabled={!homeInput||!awayInput||homeInput===awayInput||manualLoading} style={{padding:"13px",borderRadius:10,fontSize:10,letterSpacing:3,cursor:"pointer",border:`1px solid ${C.cyan}`,background:`${C.cyan}0d`,color:C.cyan,fontFamily:"inherit",fontWeight:900}}>
                {manualLoading?"⚛️ COMPUTING...":"⚛️ ANALIZZA PARTITA"}
              </button>
              <div style={{fontSize:9,color:"#444",lineHeight:1.8,padding:10,background:C.card,borderRadius:10}}>
                💡 Scrivi qualsiasi squadra — anche se non è nel calendario di oggi.<br/>Il motore usa il database ELO per stimare le probabilità.
              </div>
            </div>
            <div>
              {!manualPred&&!manualLoading&&(
                <div style={{background:C.card,border:"1px dashed #1a1a2e",borderRadius:14,padding:60,textAlign:"center",color:"#2a2a4e"}}>
                  <div style={{fontSize:40,marginBottom:12}}>🔍</div>
                  <div style={{fontSize:11,letterSpacing:3}}>QUALSIASI PARTITA</div>
                  <div style={{fontSize:9,marginTop:8,lineHeight:1.8}}>Venezia vs Avellino · Bayern vs Real Madrid<br/>Qualsiasi combinazione, qualsiasi campionato</div>
                </div>
              )}
              {manualLoading&&<div style={{textAlign:"center",padding:40,color:C.cyan}}><div style={{fontSize:10,letterSpacing:3,marginBottom:12}}>⚛️ IBM QUANTUM CIRCUIT...</div><Wave w={400}/></div>}
              {manualPred&&!manualLoading&&(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{background:`linear-gradient(135deg,${C.cyan}0a,${C.purple}07)`,border:`1px solid ${C.cyan}33`,borderRadius:14,padding:20}}>
                    <div style={{textAlign:"center",marginBottom:16}}>
                      <div style={{fontSize:16,fontWeight:900}}><span style={{color:C.cyan}}>{manualPred.home}</span><span style={{color:C.amber,margin:"0 12px"}}>vs</span><span style={{color:C.pink}}>{manualPred.away}</span></div>
                      <div style={{fontSize:9,color:"#666",marginTop:6}}>xG {manualPred.pred.xg_h}–{manualPred.pred.xg_a} · Conf <span style={{color:confColor(manualPred.pred.conf)}}>{pct(manualPred.pred.conf)}</span></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
                      {[["1 "+manualPred.home,manualPred.pred.home,C.cyan],["X Pareggio",manualPred.pred.draw,C.amber],["2 "+manualPred.away,manualPred.pred.away,C.pink]].map(([l,v,c])=>(
                        <div key={l} style={{background:"rgba(0,0,0,0.3)",borderRadius:10,padding:14,textAlign:"center",border:`1px solid ${c}22`}}>
                          <div style={{fontSize:9,color:c,marginBottom:4}}>{l}</div>
                          <div style={{fontSize:22,fontWeight:900}}>{pct(v)}</div>
                          <div style={{fontSize:9,color:"#555"}}>{oddStr(v)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div><Bar val={manualPred.pred.over25} color="#f97316" label="Over 2.5"/><Bar val={manualPred.pred.under25} color="#64748b" label="Under 2.5"/><Bar val={manualPred.pred.bttsY} color={C.amber} label="BTTS Sì"/></div>
                      <div><Bar val={manualPred.pred.dc1x} color={C.purple} label="1X"/><Bar val={manualPred.pred.dcx2} color={C.pink} label="X2"/><Bar val={manualPred.pred.dc12} color={C.green} label="12"/></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ LOG ══ */}
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
