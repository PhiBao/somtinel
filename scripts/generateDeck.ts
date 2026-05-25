import PptxGenJS from "pptxgenjs";

const pptx = new PptxGenJS();

pptx.defineLayout({ name: "CUSTOM", width: 13.333, height: 7.5 });
pptx.layout = "CUSTOM";

const DARK = "08131b";
const ACCENT = "6EF2C2";
const MUTED = "93AAB7";
const WHITE = "F2F7F9";

function darkSlide(title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: DARK };
  slide.addText(title, {
    x: 0.8, y: 0.6, w: 11.5, h: 1.0,
    fontSize: 36, fontFace: "Segoe UI", color: ACCENT, bold: true,
  });
  return slide;
}

// Slide 1 — Title
{
  const s = pptx.addSlide();
  s.background = { color: DARK };
  s.addText("Somtinel", {
    x: 0.8, y: 1.5, w: 11, h: 1.5,
    fontSize: 60, fontFace: "Segoe UI", color: ACCENT, bold: true,
  });
  s.addText("Agent-Driven Treasury Risk Response\non Somnia Reactivity & Data Streams", {
    x: 0.8, y: 3.2, w: 11, h: 1.2,
    fontSize: 22, fontFace: "Segoe UI", color: MUTED,
  });
  s.addText("Somnia Agentic L1 Hackathon", {
    x: 0.8, y: 5.8, w: 11, h: 0.5,
    fontSize: 16, fontFace: "Segoe UI", color: MUTED,
  });
}

// Slide 2 — Problem
{
  const s = darkSlide("The Problem");
  const items = [
    "Crypto treasuries are too manual for machine-speed environments",
    "Existing automation is off-chain, opaque, and siloed",
    "Risk engines rarely leave verifiable state other agents can consume",
    "Teams need safe auto-execution + human override for exceptions",
  ];
  items.forEach((t, i) => {
    s.addText(t, {
      x: 1.0, y: 2.0 + i * 1.1, w: 11, h: 0.7,
      fontSize: 18, fontFace: "Segoe UI", color: WHITE, bullet: true,
    });
  });
}

// Slide 3 — Architecture
{
  const s = darkSlide("Architecture");
  s.addText(
    "Operator → TreasuryVault.requestWithdrawal()\n" +
    "  → WithdrawalRequested event\n" +
    "  → SomtinelResponder fires in same block\n" +
    "    • Safe: auto-execute immediately\n" +
    "    • Risky: open incident + schedule escalation\n" +
    "  → Off-chain agent watches IncidentOpened\n" +
    "  → Agent publishes typed digest to Somnia Data Streams\n" +
    "  → Dashboard reads state + stream memory",
    {
      x: 1.0, y: 2.0, w: 11, h: 4.5,
      fontSize: 16, fontFace: "Consolas", color: ACCENT, lineSpacing: 32,
    }
  );
}

// Slide 4 — Somnia Primitives Used
{
  const s = darkSlide("Somnia Primitives");
  const primitives = [
    { title: "On-Chain Reactivity", desc: "Same-block autonomous execution via 0x0100 precompile. Handler subscribes to WithdrawalRequested events, fires synthetic transactions deterministically." },
    { title: "System Event Scheduling", desc: "Schedule(uint256) events for time-based incident escalation. One-shot timer fires at review deadline." },
    { title: "Data Streams", desc: "Typed, composable agent memory. Off-chain agent publishes diagnostic records. Dashboard reads stream data — no custom storage contracts needed." },
  ];
  primitives.forEach((p, i) => {
    s.addText(p.title, {
      x: 1.0, y: 2.0 + i * 1.8, w: 11, h: 0.5,
      fontSize: 20, fontFace: "Segoe UI", color: ACCENT, bold: true,
    });
    s.addText(p.desc, {
      x: 1.0, y: 2.5 + i * 1.8, w: 11, h: 0.9,
      fontSize: 15, fontFace: "Segoe UI", color: WHITE,
    });
  });
}

// Slide 5 — Risk Engine
{
  const s = darkSlide("Risk Scoring Engine");
  s.addText("Deterministic, transparent, auditable", {
    x: 1.0, y: 1.8, w: 11, h: 0.5,
    fontSize: 16, fontFace: "Segoe UI", color: MUTED,
  });
  const rows = [
    ["Trusted dest + ≤ 5 STT", "Risk 12", "Auto-execute"],
    ["Trusted dest + > 5 STT", "Risk 58", "Needs Review"],
    ["Unknown dest + ≤ 1 STT", "Risk 44", "Needs Review"],
    ["Unknown dest + > 1 STT", "Risk 88", "Needs Review"],
  ];
  const header = ["Scenario", "Score", "Action"];
  const tableRows: any[] = [
    header.map(h => ({ text: h, options: { bold: true, color: DARK, fill: { color: ACCENT }, fontSize: 14, fontFace: "Segoe UI" } })),
    ...rows.map(r => r.map(c => ({ text: c, options: { color: WHITE, fill: { color: "10212B" }, fontSize: 14, fontFace: "Segoe UI" } }))),
  ];
  s.addTable(tableRows, {
    x: 1.0, y: 2.5, w: 11, h: 3.0,
    border: { type: "none" },
    colW: [6.0, 2.0, 3.0],
    rowH: [0.5, 0.55, 0.55, 0.55, 0.55],
  });
}

// Slide 6 — On-Chain Deployment
{
  const s = darkSlide("Deployed on Somnia Shannon Testnet");
  s.addText("All flows verified on-chain • chainId 50312", {
    x: 1.0, y: 1.8, w: 11, h: 0.5,
    fontSize: 14, fontFace: "Segoe UI", color: MUTED,
  });
  const items = [
    "TreasuryVault: 0xef67...6444",
    "SomtinelResponder: 0x43D8...1e1a",
    "Reactive Subscription #2335572 (3M gas)",
    "Auto-execute ✓  |  Incident creation ✓  |  Owner resolution ✓",
  ];
  items.forEach((t, i) => {
    s.addText(t, {
      x: 1.0, y: 2.5 + i * 0.9, w: 11, h: 0.6,
      fontSize: 16, fontFace: "Consolas", color: ACCENT,
    });
  });
}

// Slide 7 — Security Posture
{
  const s = darkSlide("Security Posture");
  const items = [
    "Handler only accepts calls from 0x0100 (reactivity precompile)",
    "No self-triggering event loops — handler events don't match subscriptions",
    "Default to quarantine, not auto-release",
    "maxFeePerGas = 0 delegates fee choice to protocol limits",
    "Contract holds subscription stake — blast radius is self-contained",
    "Deterministic risk scoring — no external oracle dependency",
  ];
  items.forEach((t, i) => {
    s.addText(t, {
      x: 1.0, y: 2.0 + i * 0.8, w: 11, h: 0.6,
      fontSize: 15, fontFace: "Segoe UI", color: WHITE, bullet: true,
    });
  });
}

// Slide 8 — Why This Wins
{
  const s = darkSlide("Why This Wins");
  const items = [
    "Three Somnia primitives in one cohesive demo",
    "Maps directly to real DAO treasury pain points",
    "Judges see autonomous execution, scheduled escalation, typed agent memory",
    "Architecture is intentionally conservative — quarantine over release",
    "Demonstrates what becomes possible when agent execution moves on-chain",
  ];
  items.forEach((t, i) => {
    s.addText(t, {
      x: 1.0, y: 2.0 + i * 1.0, w: 11, h: 0.7,
      fontSize: 18, fontFace: "Segoe UI", color: WHITE, bullet: true,
    });
  });
}

// Slide 9 — Thank You
{
  const s = pptx.addSlide();
  s.background = { color: DARK };
  s.addText("Thank You", {
    x: 0.8, y: 2.5, w: 11, h: 1.2,
    fontSize: 48, fontFace: "Segoe UI", color: ACCENT, bold: true, align: "center",
  });
  s.addText("github.com/.../Somtinel", {
    x: 0.8, y: 4.2, w: 11, h: 0.6,
    fontSize: 18, fontFace: "Segoe UI", color: MUTED, align: "center",
  });
}

await pptx.writeFile({ fileName: "somtinel-deck.pptx" });
console.log("somtinel-deck.pptx created");
