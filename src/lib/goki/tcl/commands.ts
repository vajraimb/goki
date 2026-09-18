import { addStep, evalScript, type CommandTable, type Finding, type ProvenanceSource, type StepStatus, type TclRuntime, TclRuntimeError } from "./runtime";
import { evaluateGate, type MappingResidual, type Verdict } from "../verdict";
import { publicationSet, type PubCheck } from "../pub";
import { vouchIssuer } from "../vouch";
import { filingsFor, issuerYearEnd, FILING_KIND_LABEL } from "../filings";
import { evaluateMainRules, noteRulesFor, packOf, PACK_LABEL } from "../packs";
import { classifyGaps } from "../gaps";
import { classifyEsg, esgSet, type EsgCheck } from "../esg";
import { bandIssuer } from "../materiality-net";
import { totalAssets, totalLE } from "../rules";
import { ctxOf } from "../amount";

const VERIFY_CODES: Record<string, string[]> = {
  balance_sheet: ["R01"],
  income_statement: ["R04", "R05"],
  cash_flow: ["R02", "R06"],
  notes: [],
};

const ESG_VERIFY: Record<string, string[]> = {
  file_set: ["E01", "E05"],
  language: ["E02"],
  sync: ["E03", "E04", "E12"],
  climate: ["E07", "E08", "E09"],
  social: ["E10"],
  governance: ["E06", "E11"],
};

function esgOf(rt: TclRuntime): EsgCheck[] {
  if (!rt.esg) rt.esg = esgSet(rt.issuer);
  return rt.esg;
}

function esgStatus(s: EsgCheck["status"]): StepStatus {
  if (s === "pass") return "pass";
  if (s === "pending" || s === "unmapped") return "pending";
  if (s === "missing") return "unable";
  return "fail";
}

function refreshEsgCounts(rt: TclRuntime) {
  const checks = esgOf(rt);
  const fileOpen = checks.filter((c) => c.status === "missing" || c.status === "mismatch").length;
  const unmapped = checks.filter((c) => c.status === "unmapped").length;
  const pending = checks.filter((c) => c.status === "pending").length;
  rt.vars.set("anomalies", String(fileOpen));
  rt.vars.set("blocking", fileOpen > 0 ? "1" : "0");
  let verdict = "pass";
  if (fileOpen) verdict = "unresolved";
  else if (unmapped || pending) verdict = "incomplete";
  rt.vars.set("verdict", verdict);
  let confidence = 0.96;
  if (pending) confidence = Math.min(confidence, 0.7);
  if (unmapped) confidence = Math.min(confidence, 0.62);
  if (fileOpen) confidence = Math.min(confidence, 0.38);
  rt.vars.set("confidence", confidence.toFixed(2));
}

function gateOf(rt: TclRuntime) {
  if (!rt.gate) rt.gate = evaluateGate(rt.issuer);
  return rt.gate;
}

function pubOf(rt: TclRuntime) {
  if (!rt.pub) rt.pub = publicationSet(rt.issuer);
  return rt.pub;
}

function vouchOf(rt: TclRuntime) {
  if (!rt.vouch) rt.vouch = vouchIssuer(rt.issuer);
  return rt.vouch;
}

function verdictStatus(v: Verdict): StepStatus {
  if (v === "pass") return "pass";
  if (v === "incomplete") return "pending";
  if (v === "unable") return "unable";
  return "fail";
}

function pubStatus(s: PubCheck["status"]): StepStatus {
  if (s === "pass") return "pass";
  if (s === "pending") return "pending";
  if (s === "missing") return "unable";
  return "fail";
}

function worstStatus(a: StepStatus, b: StepStatus): StepStatus {
  const rank: Record<StepStatus, number> = { pass: 0, skip: 0, pending: 1, review: 2, fail: 3, unable: 4 };
  return rank[b] > rank[a] ? b : a;
}

function residualNote(r: MappingResidual): string {
  const leftover = Math.round(r.leftover);
  const ub = Math.round(r.leftoverUb);
  if (r.unableReason) return `${r.code} ${r.verdict}：${r.unableReason}（残差 ${leftover}，容差 ${ub}）`;
  if (r.verdict === "pass") return `${r.code} 闭合（残差 ${leftover} ≤ ${ub}）`;
  return `${r.code} ${r.verdict}：残差 ${leftover}，容差 ${ub}`;
}

function refreshCounts(rt: TclRuntime) {
  const gate = gateOf(rt);
  const pub = pubOf(rt);
  const blocking = gate.blockingRules.length;
  const pubOpen = pub.filter((c) => c.status === "mismatch").length;
  const unable = gate.residuals.filter((r) => r.verdict === "unable" && r.kind === "identity" && !r.skipReason).length;
  const anomalies = blocking + pubOpen;
  rt.vars.set("anomalies", String(anomalies));
  rt.vars.set("blocking", gate.blocking ? "1" : "0");
  rt.vars.set("verdict", gate.verdict);
  let confidence = 0.96;
  if (pubOpen > 0) confidence = Math.min(confidence, 0.72);
  if (gate.verdict === "incomplete") confidence = Math.min(confidence, 0.7);
  if (gate.verdict === "unresolved") confidence = Math.min(confidence, 0.38);
  if (gate.verdict === "unable" || unable > 0) confidence = Math.min(confidence, 0.28);
  rt.vars.set("confidence", confidence.toFixed(2));
}

function mappingSource(rt: TclRuntime): ProvenanceSource {
  return { kind: "mapping", label: `${rt.issuer.ticker} 映射表`, ticker: rt.issuer.ticker };
}

export const COMMANDS: CommandTable = {
  esg_report(rt, args, cmd) {
    if (args.length !== 1) throw new TclRuntimeError(cmd.line, "esg_report needs a body");
    const body = cmd.words[1]!;
    evalScript(body.raw, rt, body.line);
  },

  annual_report(rt, args, cmd) {
    if (args.length !== 1) throw new TclRuntimeError(cmd.line, "annual_report needs a body");
    const body = cmd.words[1]!;
    evalScript(body.raw, rt, body.line);
  },

  extract(rt, args, cmd) {
    const target = args[0];
    if (target === "mapping") {
      const { issuer } = rt;
      const assets = totalAssets(issuer.curr);
      const le = totalLE(issuer.curr);
      const pack = packOf(issuer);
      rt.vars.set("pack", pack);
      rt.vars.set("assets", String(Math.round(assets)));
      rt.vars.set("le", String(Math.round(le)));
      rt.vars.set("revenue", String(Math.round(issuer.curr.revenue)));
      rt.vars.set("ni", String(Math.round(issuer.curr.ni)));
      rt.vars.set("cash", String(Math.round(issuer.curr.cash)));
      const src = mappingSource(rt);
      rt.sources.push(src);
      addStep(rt, {
        line: cmd.line,
        cmd: "extract",
        args,
        impl: "hk-bluechips",
        status: "pass",
        note: `${issuer.ticker} ${issuer.name} · ${PACK_LABEL[pack]}包 · 不读 PDF`,
        sources: [src],
        extracted: {
          revenue: Math.round(issuer.curr.revenue),
          ni: Math.round(issuer.curr.ni),
          cash: Math.round(issuer.curr.cash),
          assets: Math.round(assets),
          scale: issuer.sourceScale ?? "million",
        },
      });
      return;
    }
    if (target === "filings") {
      const ye = issuerYearEnd(rt.issuer);
      const files = ye ? filingsFor(rt.issuer.ticker, ye) : filingsFor(rt.issuer.ticker);
      rt.filings = files;
      const sources: ProvenanceSource[] = files.map((f) => ({
        kind: "filing",
        label: `${FILING_KIND_LABEL[f.kind]} · ${f.essTitle}`,
        ticker: f.ticker,
        url: f.url,
      }));
      rt.sources.push(...sources);
      addStep(rt, {
        line: cmd.line,
        cmd: "extract",
        args,
        impl: "filings catalog",
        status: files.length > 0 ? "pass" : "pending",
        note: files.length > 0 ? `目录 ${files.length} 份，模型不读 PDF` : "目录无文件，发布集合保持待核",
        sources,
        extracted: { files: files.length, yearEnd: ye ?? "" },
      });
      return;
    }
    throw new TclRuntimeError(cmd.line, `extract ${target} is not a registered capability`);
  },

  parallel(rt, args, cmd) {
    if (args.length !== 1) throw new TclRuntimeError(cmd.line, "parallel needs a body");
    const body = cmd.words[1]!;
    const prev = rt.group;
    rt.group = `p${rt.clock + 1}`;
    evalScript(body.raw, rt, body.line);
    rt.group = prev;
  },

  verify(rt, args, cmd) {
    const target = args[0];
    const esgCodes = ESG_VERIFY[target ?? ""];
    if (esgCodes) {
      const checks = esgOf(rt).filter((c) => esgCodes.includes(c.id));
      let status: StepStatus = "pass";
      for (const c of checks) status = worstStatus(status, esgStatus(c.status));
      const open = checks.filter((c) => c.status !== "pass");
      addStep(rt, {
        line: cmd.line,
        cmd: "verify",
        args,
        impl: "esgSet",
        status,
        note: open.length ? open.map((c) => `${c.id} ${c.status}`).join(" · ") : `${target} 闭合`,
        sources: [{ kind: "esg", label: target ?? "esg", ticker: rt.issuer.ticker }],
        compared: Object.fromEntries(checks.map((c) => [c.id, c.status])),
      });
      refreshEsgCounts(rt);
      return;
    }
    if (target === "publication_set") {
      const pub = pubOf(rt);
      let status: StepStatus = "pass";
      for (const c of pub) status = worstStatus(status, pubStatus(c.status));
      const bits = pub.map((c) => `${c.id} ${c.status}`).join(" · ");
      addStep(rt, {
        line: cmd.line,
        cmd: "verify",
        args,
        impl: "publicationSet",
        status,
        note: bits || "无检查",
        sources: (rt.filings ?? []).map((f) => ({
          kind: "pub" as const,
          label: f.essTitle,
          ticker: f.ticker,
          url: f.url,
        })),
        compared: Object.fromEntries(pub.map((c) => [c.id, c.status])),
      });
      refreshCounts(rt);
      return;
    }
    if (target === "notes") {
      const vouch = vouchOf(rt);
      const gate = gateOf(rt);
      const noteIds = noteRulesFor(packOf(rt.issuer)).map((d) => d.id);
      const noteRows = gate.residuals.filter(
        (r) => noteIds.includes(r.ruleId) && r.kind === "identity" && !r.skipReason,
      );
      let status: StepStatus = "pass";
      for (const v of vouch) status = worstStatus(status, verdictStatus(v.verdict));
      for (const r of noteRows) status = worstStatus(status, verdictStatus(r.verdict));
      const open = [
        ...vouch.filter((v) => v.verdict !== "pass").map((v) => `${v.id} ${v.verdict}`),
        ...noteRows.filter((r) => r.verdict !== "pass").map((r) => `${r.code} ${r.verdict}`),
      ];
      addStep(rt, {
        line: cmd.line,
        cmd: "verify",
        args,
        impl: "vouchIssuer + note residuals",
        status,
        note: open.length ? open.join(" · ") : `附注核 ${vouch.length} 条闭合`,
        sources: [{ kind: "note", label: "附注槽", ticker: rt.issuer.ticker }],
      });
      refreshCounts(rt);
      return;
    }
    const codes = VERIFY_CODES[target ?? ""];
    if (!codes) throw new TclRuntimeError(cmd.line, `verify ${target} is not a registered capability`);
    const gate = gateOf(rt);
    const rows = gate.residuals.filter((r) => codes.includes(r.code) && !r.skipReason);
    let status: StepStatus = "pass";
    for (const r of rows) status = worstStatus(status, verdictStatus(r.verdict));
    const impl =
      target === "balance_sheet" ? "evaluateGate.R01" : target === "income_statement" ? "evaluateGate.R04/R05" : "evaluateGate.R02/R06";
    addStep(rt, {
      line: cmd.line,
      cmd: "verify",
      args,
      impl,
      status,
      note: rows.length ? rows.map(residualNote).join(" · ") : `${target} 无本期规则`,
      sources: [mappingSource(rt), { kind: "gate", label: impl, ticker: rt.issuer.ticker }],
      compared: Object.fromEntries(rows.map((r) => [r.code, Math.round(r.leftover)])),
    });
    refreshCounts(rt);
  },

  reconcile(rt, args, cmd) {
    if (args[0] !== "identities") throw new TclRuntimeError(cmd.line, "reconcile identities is the only registered target");
    const gate = gateOf(rt);
    const rows = gate.residuals.filter((r) => r.kind === "identity" && !r.skipReason);
    let status: StepStatus = "pass";
    for (const r of rows) status = worstStatus(status, verdictStatus(r.verdict));
    const open = rows.filter((r) => r.verdict !== "pass");
    addStep(rt, {
      line: cmd.line,
      cmd: "reconcile",
      args,
      impl: "evaluateGate leftover vs n×half-tick",
      status,
      note: open.length ? `${open.length} 条开口：${open.map((r) => r.code).join(" ")}` : `硬恒等 ${rows.length} 条闭合`,
      sources: [{ kind: "gate", label: "canonicalizeGate", ticker: rt.issuer.ticker }],
      compared: { open: open.length, identities: rows.length },
    });
    refreshCounts(rt);
  },

  classify(rt, args, cmd) {
    if (args[0] === "esg") {
      const report = classifyEsg(rt.issuer);
      rt.vars.set("open", String(report.open));
      rt.vars.set("unmapped", String(report.unmapped));
      rt.vars.set("unwired", String(report.unwired));
      const bits = [
        report.file ? `披露 ${report.file}` : null,
        report.unmapped ? `映射未齐 ${report.unmapped}` : null,
        report.unwired ? `未接线 ${report.unwired}` : null,
      ].filter(Boolean);
      addStep(rt, {
        line: cmd.line,
        cmd: "classify",
        args,
        impl: "classifyEsg",
        status: report.blocksPublish ? "fail" : report.projectIncomplete ? "pending" : "pass",
        note: bits.length ? bits.join(" · ") : "无开口",
        sources: [{ kind: "esg", label: "gap origin", ticker: rt.issuer.ticker }],
        compared: { file: report.file, unmapped: report.unmapped, unwired: report.unwired },
      });
      refreshEsgCounts(rt);
      return;
    }
    if (args[0] !== "gaps") throw new TclRuntimeError(cmd.line, "classify gaps or classify esg");
    const report = classifyGaps(rt.issuer);
    rt.vars.set("open", String(report.open));
    rt.vars.set("unmapped", String(report.unmapped));
    rt.vars.set("unwired", String(report.unwired));
    rt.vars.set("formula", String(report.formula));
    const bits = [
      report.open ? `真开口 ${report.open}` : null,
      report.unmapped ? `映射未齐 ${report.unmapped}` : null,
      report.formula ? `公式截断 ${report.formula}` : null,
      report.schema ? `无槽 ${report.schema}` : null,
      report.unwired ? `未接线 ${report.unwired}` : null,
      report.file ? `披露 ${report.file}` : null,
    ].filter(Boolean);
    addStep(rt, {
      line: cmd.line,
      cmd: "classify",
      args,
      impl: "classifyGaps",
      status: report.blocksPublish ? "fail" : report.projectIncomplete ? "pending" : "pass",
      note: bits.length ? bits.join(" · ") : "无开口",
      sources: [{ kind: "gate", label: "gap origin", ticker: rt.issuer.ticker }],
      compared: {
        open: report.open,
        unmapped: report.unmapped,
        formula: report.formula,
        unwired: report.unwired,
        file: report.file,
      },
    });
  },

  collect(rt, args, cmd) {
    if (args[0] !== "evidence") throw new TclRuntimeError(cmd.line, "collect evidence is the only registered target");
    addStep(rt, {
      line: cmd.line,
      cmd: "collect",
      args,
      impl: "runtime evidence bag",
      status: rt.sources.length ? "pass" : "pending",
      note: `证据 ${rt.sources.length} 条，步骤 ${rt.steps.length} 步`,
      sources: rt.sources.slice(),
      extracted: { sources: rt.sources.length, steps: rt.steps.length },
    });
  },

  investigate(rt, args, cmd) {
    if (args.length < 2) throw new TclRuntimeError(cmd.line, "investigate needs a body");
    const body = cmd.words[cmd.words.length - 1]!;
    const prev = rt.parent;
    const marker = addStep(rt, {
      line: cmd.line,
      cmd: "investigate",
      args: args.slice(0, -1),
      impl: "control",
      status: "review",
      note: `开口 ${rt.vars.get("anomalies")} 条，进入调查块`,
      sources: [],
    });
    rt.parent = marker.id;
    evalScript(body.raw, rt, body.line);
    rt.parent = prev;
  },

  delegate(rt, args, cmd) {
    const who = args[0] || "none";
    if (who === "none") {
      addStep(rt, {
        line: cmd.line,
        cmd: "delegate",
        args,
        impl: "planner",
        status: "skip",
        note: "规划器未派专家",
        sources: [],
      });
      return;
    }
    if (who === "accounting_specialist") {
      const band = bandIssuer(rt.issuer, evaluateMainRules(rt.issuer));
      rt.advisory = { name: "materiality-net", band };
      addStep(rt, {
        line: cmd.line,
        cmd: "delegate",
        args,
        impl: "materiality-net (advisory)",
        status: "pass",
        note: `咨询带 ${band}。MLP 不进门禁，不改 verdict=${rt.vars.get("verdict")}`,
        sources: [{ kind: "model", label: "materiality-net", ticker: rt.issuer.ticker }],
        model: { name: "materiality-net", output: band },
      });
      return;
    }
    if (who === "disclosure_specialist") {
      if (rt.esg) {
        const open = rt.esg.filter((c) => c.status === "mismatch" || c.status === "missing");
        addStep(rt, {
          line: cmd.line,
          cmd: "delegate",
          args,
          impl: "esgSet (advisory)",
          status: open.length ? "review" : "pass",
          note: open.length ? open.map((c) => `${c.id} ${c.status}`).join(" · ") : "ESG 文件无开口",
          sources: [{ kind: "esg", label: "E file set", ticker: rt.issuer.ticker }],
        });
        return;
      }
      const pub = pubOf(rt);
      const open = pub.filter((c) => c.status === "mismatch" || c.status === "missing");
      addStep(rt, {
        line: cmd.line,
        cmd: "delegate",
        args,
        impl: "publicationSet (advisory)",
        status: open.length ? "review" : "pass",
        note: open.length ? open.map((c) => `${c.id} ${c.status}`).join(" · ") : "发布集合无开口",
        sources: [{ kind: "pub", label: "P4", ticker: rt.issuer.ticker }],
      });
      return;
    }
    throw new TclRuntimeError(cmd.line, `delegate ${who} is not a registered specialist`);
  },

  judge(rt, args, cmd) {
    if (args[0] === "esg") {
      refreshEsgCounts(rt);
      const checks = esgOf(rt);
      const fileOpen = checks.filter((c) => c.status === "missing" || c.status === "mismatch");
      addStep(rt, {
        line: cmd.line,
        cmd: "judge",
        args,
        impl: "esgSet; no financial identities",
        status: fileOpen.length ? "fail" : rt.vars.get("verdict") === "pass" ? "pass" : "pending",
        note: `ESG ${rt.vars.get("verdict")} · 文件开口 ${fileOpen.length} · 置信 ${rt.vars.get("confidence")}`,
        sources: [{ kind: "esg", label: "esgSet", ticker: rt.issuer.ticker }],
        compared: { verdict: rt.vars.get("verdict") ?? "", fileOpen: fileOpen.length },
      });
      return;
    }
    refreshCounts(rt);
    const gate = gateOf(rt);
    const pub = pubOf(rt);
    const ctx = ctxOf(rt.issuer);
    rt.judged = gate.verdict;
    addStep(rt, {
      line: cmd.line,
      cmd: "judge",
      args: [],
      impl: "gate + publication set; MLP excluded",
      status: verdictStatus(gate.verdict),
      note: `门禁 ${gate.verdict} · 咨询 ${rt.advisory?.band ?? "未派"} · 刻度 ${ctx.scale} · 置信 ${rt.vars.get("confidence")}`,
      sources: [{ kind: "gate", label: "evaluateGate", ticker: rt.issuer.ticker }],
      compared: {
        verdict: gate.verdict,
        blocking: gate.blockingRules.length,
        pubMismatch: pub.filter((c) => c.status === "mismatch").length,
      },
    });
  },

  escalate(rt, args, cmd) {
    const reason = args[0] ?? "unspecified";
    rt.escalations.push(reason);
    addStep(rt, {
      line: cmd.line,
      cmd: "escalate",
      args,
      impl: "control",
      status: "review",
      note: reason,
      sources: [],
    });
  },

  checkpoint(rt, args, cmd) {
    const name = args[0] ?? "unnamed";
    if (name === "human_review") rt.awaitingReview = true;
    addStep(rt, {
      line: cmd.line,
      cmd: "checkpoint",
      args,
      impl: "control",
      status: name === "human_review" ? "review" : "pass",
      note: name === "human_review" ? "程序要求人签，未签不能当通过" : name,
      sources: [],
    });
  },

  report(rt, _args, cmd) {
    if (rt.esg) {
      const checks = esgOf(rt);
      const findings: Finding[] = [];
      let n = 0;
      for (const c of checks) {
        if (c.status === "pass") continue;
        n += 1;
        findings.push({
          id: `F${String(n).padStart(2, "0")}`,
          title: `${c.id} ${c.label}`,
          status: esgStatus(c.status),
          note: c.note,
          steps: rt.steps.filter((s) => s.cmd === "verify").map((s) => s.id),
          sources: c.files.filter((f) => f.url).map((f) => ({ kind: "filing" as const, label: f.essTitle, url: f.url })),
        });
      }
      rt.findings = findings;
      rt.reported = true;
      addStep(rt, {
        line: cmd.line,
        cmd: "report",
        args: [],
        impl: "esg findings",
        status: rt.vars.get("verdict") === "unresolved" ? "fail" : rt.vars.get("verdict") === "pass" ? "pass" : "pending",
        note: `ESG 发现 ${findings.length} 条 · ${rt.vars.get("verdict")}`,
        sources: [{ kind: "esg", label: "esgSet", ticker: rt.issuer.ticker }],
      });
      return;
    }
    const gate = gateOf(rt);
    const pub = pubOf(rt);
    const vouch = vouchOf(rt);
    const findings: Finding[] = [];
    let n = 0;
    const stepId = (cmdName: string, arg?: string) =>
      rt.steps.find((s) => s.cmd === cmdName && (arg ? s.args[0] === arg : true))?.id ?? "";

    for (const r of gate.residuals) {
      if (r.skipReason || r.kind !== "identity" || r.verdict === "pass") continue;
      n += 1;
      const target =
        r.code === "R01" ? "balance_sheet" : r.code === "R04" || r.code === "R05" ? "income_statement" : r.code === "R02" || r.code === "R06" ? "cash_flow" : "notes";
      findings.push({
        id: `F${String(n).padStart(2, "0")}`,
        title: `${r.code} ${r.name}`,
        status: verdictStatus(r.verdict),
        note: residualNote(r),
        leftover: r.leftover,
        leftoverUb: r.leftoverUb,
        steps: [stepId("verify", target), stepId("reconcile"), stepId("judge")].filter(Boolean),
        sources: [mappingSource(rt)],
      });
    }
    for (const c of pub) {
      if (c.status === "pass" || c.status === "pending") continue;
      n += 1;
      findings.push({
        id: `F${String(n).padStart(2, "0")}`,
        title: `${c.id} ${c.label}`,
        status: pubStatus(c.status),
        note: c.note,
        steps: [stepId("verify", "publication_set")].filter(Boolean),
        sources: c.files.map((f) => ({ kind: "filing" as const, label: f.essTitle, url: f.url })),
      });
    }
    for (const v of vouch) {
      if (v.verdict === "pass") continue;
      n += 1;
      findings.push({
        id: `F${String(n).padStart(2, "0")}`,
        title: `${v.id} ${v.name}`,
        status: verdictStatus(v.verdict),
        note: v.unableReason ?? `主表 ${Math.round(v.main)} vs 附注 ${Math.round(v.notes)}`,
        leftover: v.leftover,
        leftoverUb: v.leftoverUb,
        steps: [stepId("verify", "notes")].filter(Boolean),
        sources: [{ kind: "note" as const, label: v.name, ticker: rt.issuer.ticker }],
      });
    }
    rt.findings = findings;
    rt.reported = true;
    addStep(rt, {
      line: cmd.line,
      cmd: "report",
      args: [],
      impl: "findings + provenance",
      status: rt.awaitingReview ? "review" : verdictStatus(gate.verdict),
      note: findings.length ? `${findings.length} 条发现` : "无发现",
      sources: rt.sources.slice(),
      extracted: { findings: findings.length, review: rt.awaitingReview ? 1 : 0 },
    });
  },
};
