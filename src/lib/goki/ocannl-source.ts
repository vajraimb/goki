export const OCAMLL_FILES: { path: string; title: string; body: string }[] = [
  {
    path: "bin/goki.ml",
    title: "Triage MLP · BCE-with-logits",
    body: `(* GOKI — tabular MLP on 勾稽 residuals.
   Adapted from test/training/mlp_names.ml: embedding replaced with a hosted
   feature matrix, softmax + NLL replaced with BCE-with-logits. *)
open Base
open Ocannl
open Stdio
module IDX = Train.IDX
open Nn_blocks.DSL_modules
module Asgns = Ir.Assignments

let n_features = 38
let hid1 = 64
let hid2 = 32
let batch_size = 32
let epochs = 28
let init_seed = 3

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();

  let make_x label =
    let open Bigarray in
    let ga = Genarray.create Float32 c_layout [| batch_size; n_features |] in
    let nd = Ir.Ndarray.as_array Ir.Ops.Single ga in
    Tensor.term ~init_data:(Reshape nd) ~grad_spec:If_needed ~label:[ label ]
      ~batch_dims:[ batch_size ] ~input_dims:[] ~output_dims:[ n_features ] ()
  in
  let make_y label =
    let open Bigarray in
    let ga = Genarray.create Float32 c_layout [| batch_size; 1 |] in
    let nd = Ir.Ndarray.as_array Ir.Ops.Single ga in
    Tensor.term ~init_data:(Reshape nd) ~grad_spec:If_needed ~label:[ label ]
      ~batch_dims:[ batch_size ] ~input_dims:[] ~output_dims:[ 1 ] ()
  in
  let x_batch = make_x "x_batch" in
  let y_batch = make_y "y_batch" in

  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in
`,
  },
  {
    path: "bin/closer.ml",
    title: "Closer-Net · 附注完整恒等",
    body: `(* 16-d note residual vector. Identities N01–N08 include OCI, buybacks,
   CIP, disposals, FX. Label = 1 only after the complete formula is filled
   and still broken. *)
let n_features = 16
let hid1 = 32
let hid2 = 16
let init_seed = 7

let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] })
let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] })
let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] }

(* N01 ΔRE − (NI − div + OCI − buyback + SBP + NCI + other) *)
(* N02 PPE − (beg + add + CIP − DA − disp − impair + FX + reval) *)
(* N03 Δcash − (netCf + fxCash) *)
(* N04 debt − (beg + draw − repay + fxDebt) *)
(* N05 taxPay − (beg + tax − paid + deferred) *)
(* N06–N08 intangibles / ROU / provisions *)
`,
  },
  {
    path: "bin/bank_closer.ml",
    title: "Bank-Closer · ECL / 贷款净额",
    body: `(* Same 16→32→16→1 as generic closer. Slots are bank identities.
   B01 ECL_end − (beg + charge − writeoff + recover + FX)
   B02 loansGross − ECL − net_loans
   B03 Δ(net_loans / deposits)   analytic
   B04 Δ(ECL / loansGross)       analytic
   PPE / GP / inventory are masked. Label = 1 only if a filled
   identity still breaks. *)
let n_features = 16
let hid1 = 32
let hid2 = 16
let init_seed = 11
`,
  },
  {
    path: "bin/pack_net.ml",
    title: "Pack-Net · 12→24→6 softmax",
    body: `(* Structural ratios → rule pack. Not a closer. *)
let n_features = 12
let hid = 24
let n_class = 6
let init_seed = 29
let%op h x = relu (({ w1 } * x) + { b1; o = [ hid ] })
let%op logits x = ({ w2 } * h x) + { b2; o = [ n_class ] }
`,
  },
  {
    path: "bin/realty_closer.ml",
    title: "Realty-Closer · 投资物业 / 待售",
    body: `(* P01 IP_end − (beg + add + transfer + FV − disp)
   P02 inv − (beg + devCost − COGS − transfer)
   P04 FV/IP analytic for Estimate-Net. PPE cost roll masked. *)
let n_features = 16
let init_seed = 13
`,
  },
  {
    path: "bin/energy_closer.ml",
    title: "Energy-Closer · 折耗 / 弃置",
    body: `(* E01 PPE − (beg + capex − DD&A − impair)
   E02 ARO − (beg + charge + unwind − use)
   E05 fuel clause / revenue analytic. *)
let n_features = 16
let init_seed = 17
`,
  },
  {
    path: "lib/fs.ml",
    title: "Rules · features · split",
    body: `(* 10 勾稽 rules → 30 residual features + 8 industry one-hots = 38.
   Category encoding is one-hot in OCaml: OCANNL has no gather. *)
let features_of iss =
  let r0 = assets curr - le curr in
  let r1 = (curr.cash - prior.cash) - curr.net_cf in
  let r2 = (curr.re - prior.re) - (curr.ni - curr.dividends) in
  let r3 = curr.pretax - curr.tax - curr.ni in
  let r4 = curr.revenue - curr.cogs - curr.gp in
  let r5 = curr.cfo - (curr.ni + curr.da - d_ar - d_inv + d_ap) in
  let r6 = curr.ppe - (prior.ppe + curr.capex - curr.da) in
  let r7 = curr.tax_pay - (prior.tax_pay + curr.tax - curr.tax_paid) in
  let r8 = curr.ar /. curr.revenue - prior.ar /. prior.revenue in
  let r9 = curr.inv /. curr.cogs - prior.inv /. prior.cogs in
  (* each rule emits (signed log1p residual, relative residual, yoy) *)
`,
  },
];
