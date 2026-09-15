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

  (* Tabular MLP: "@ " matmul + broadcast bias. No einsum beyond that. *)
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in

  let train_logit = logit x_batch in
  (* Stable BCE-with-logits: max(z,0) - z*y + log(1+exp(-|z|)) *)
  let%op abs_z = abs train_logit in
  let%op bce =
    ((relu train_logit - (train_logit *. y_batch) + log (1.0 + exp (neg abs_z)))
    ++ "... => 0") /. !..batch_size
  in

  let update = Train.grad_update bce in
  let steps = epochs * n_batches in
  let%op learning_rate = 0.12 *. ((1.5 *. !..steps) - !@step_n) /. !..steps in
  let sgd = Train.sgd_update ~learning_rate bce in
  let ctx = Train.init_params (Context.auto ()) bindings bce in
  let ctx, sgd_step =
    Train.to_routine ctx bindings (Asgns.sequence [ update; sgd ])
  in

  (* Autoencoder — clean rows only. *)
  let%op enc1 x = relu (({ we1 } * x) + { be1; o = [ 16 ] }) in
  let%op z x = relu (({ we2 } * enc1 x) + { be2; o = [ 8 ] }) in
  let%op recon t =
    ({ wd2 } * relu (({ wd1 } * t) + { bd1; o = [ 16 ] })) + { bd2; o = [ 38 ] }
  in
  let%op ae_mse =
    (((recon (z x_batch) - x_batch) *. (recon (z x_batch) - x_batch))
    ++ "... => 0") /. !..(batch_size * n_features)
  in

  (* Direct regression: other subjects → 货币资金 / 资产. *)
  let%op cash_hat x =
    ({ wr2 } * relu (({ wr1 } * x) + { br1; o = [ 32 ] })) + { br2; o = [ 1 ] }
  in
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
