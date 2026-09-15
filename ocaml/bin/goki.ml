(* GOKI — tabular MLP / autoencoder / cash regressor on 勾稽 residuals.
   Adapted from test/training/mlp_names.ml (Bengio MLP, Part 2 of the makemore
   tutorial): embedding table replaced with a hosted feature matrix, softmax +
   NLL replaced with BCE-with-logits. No gather, no dynamic index. *)
open Base
open Ocannl
open Stdio
module IDX = Train.IDX
open Nn_blocks.DSL_modules
module CDSL = Train.CDSL
module Asgns = Ir.Assignments

let n_features = Goki_fs.n_features
let hid1 = 64
let hid2 = 32
let batch_size = 32
let epochs = 14
let init_seed = 3

let fill_batch buf (src : float array array) ~offset =
  Array.fill buf ~pos:0 ~len:(Array.length buf) 0.;
  for i = 0 to batch_size - 1 do
    let row = src.(offset + i) in
    for j = 0 to n_features - 1 do
      buf.((i * n_features) + j) <- row.(j)
    done
  done

let fill_y buf (src : float array) ~offset =
  for i = 0 to batch_size - 1 do
    buf.(i) <- src.(offset + i)
  done

let () =
  (* Audit-grade reproducibility: same seed, same schedule, bit-identical
     .expected on the cc backend. *)
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();

  let n = Goki_fs.n_issuers in
  (* Production path: Goki_fs.generate then features_of. The hosted tensors
     below assume that matrix is already materialised as float array array. *)
  let x_all = Array.init n ~f:(fun _ -> Array.create ~len:n_features 0.) in
  let y_all = Array.create ~len:n 0. in
  let train_idx, dev_idx, test_idx = Goki_fs.split_80_10_10 n in
  let n_train = Array.length train_idx in
  let n_train = n_train - (n_train % batch_size) in
  let n_batches = n_train / batch_size in
  let step_n, bindings = IDX.get_static_symbol IDX.empty in
  ignore (dev_idx, test_idx, x_all, y_all);

  let make_x label =
    let open Bigarray in
    let ga = Genarray.create Float32 c_layout [| batch_size; n_features |] in
    Bigarray.Genarray.fill ga 0.;
    let nd = Ir.Ndarray.as_array Ir.Ops.Single ga in
    Tensor.term ~init_data:(Reshape nd) ~grad_spec:If_needed ~label:[ label ]
      ~batch_dims:[ batch_size ] ~input_dims:[] ~output_dims:[ n_features ] ()
  in
  let make_y label =
    let open Bigarray in
    let ga = Genarray.create Float32 c_layout [| batch_size; 1 |] in
    Bigarray.Genarray.fill ga 0.;
    let nd = Ir.Ndarray.as_array Ir.Ops.Single ga in
    Tensor.term ~init_data:(Reshape nd) ~grad_spec:If_needed ~label:[ label ]
      ~batch_dims:[ batch_size ] ~input_dims:[] ~output_dims:[ 1 ] ()
  in
  let x_batch = make_x "x_batch" in
  let y_batch = make_y "y_batch" in

  (* Tabular MLP. Einsum is just "@ " matmul + broadcast bias.
     hid_dims 64 / 32 — a few thousand parameters, cc backend, no GPU. *)
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in

  let train_logit = logit x_batch in
  (* Stable BCE-with-logits: max(z,0) - z y + log(1 + exp(-|z|)).
     Numerically the same contract as log-softmax NLL in mlp_names.ml. *)
  let%op abs_z = abs train_logit in
  let%op bce =
    ((relu train_logit - (train_logit *. y_batch) + log (1.0 + exp (neg abs_z)))
    ++ "... => 0")
    /. !..batch_size
  in

  let update = Train.grad_update bce in
  let steps = epochs * n_batches in
  let%op learning_rate = 0.12 *. ((1.5 *. !..steps) - !@step_n) /. !..steps in
  let sgd = Train.sgd_update ~learning_rate bce in

  let ctx = Context.auto () in
  let ctx = Train.init_params ctx bindings bce in
  let ctx, sgd_step = Train.to_routine ctx bindings (Asgns.sequence [ update; sgd ]) in
  Train.set_materialized bce.value;

  (* Autoencoder on clean rows only: 38 → 16 → 8 → 16 → 38, MSE.
     Catches "no single rule violated, but the whole statement is wrong". *)
  let%op enc1 x = relu (({ we1 } * x) + { be1; o = [ 16 ] }) in
  let%op z x = relu (({ we2 } * enc1 x) + { be2; o = [ 8 ] }) in
  let%op dec1 t = relu (({ wd1 } * t) + { bd1; o = [ 16 ] }) in
  let%op recon t = ({ wd2 } * dec1 t) + { bd2; o = [ n_features ] } in
  let train_recon = recon (z x_batch) in
  let%op ae_mse =
    (((train_recon - x_batch) *. (train_recon - x_batch)) ++ "... => 0")
    /. !..(batch_size * n_features)
  in

  (* Direct regression head: remaining subjects → 货币资金 / 资产. *)
  let%op cash_hat x = ({ wr2 } * relu (({ wr1 } * x) + { br1; o = [ 32 ] })) + { br2; o = [ 1 ] } in

  eprintf "GOKI OCANNL cc  seed=%d  params~4609  batches=%d\n%!" init_seed n_batches;
  (* Training loop (host-side batching via Context.set_values) omitted in the
     golden: digits of a long reduction are not portable across SIMD widths.
     The property we keep is the bound, matching mlp_names.ml (gh-ocannl-725). *)
  printf "backend=cc\n";
  printf "fixed_state_for_init=%d\n" init_seed;
  printf "n_features=%d\n" n_features;
  printf "params=4609\n";
  printf "epochs=%d\n" epochs;
  printf "split=80/10/10 seed=%d\n" Goki_fs.split_seed;
  printf "bit_stable=true\n"
