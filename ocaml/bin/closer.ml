(* GOKI closer — note-rollforward identities N01–N08.
   16-d residual vector → 32 ReLU → 16 ReLU → 1 logit.
   Label is 1 iff a note identity was broken after the complete
   formula was filled. Buybacks / OCI / CIP are in the formula,
   so they are not “true errors”. *)
open Base
open Ocannl
open Stdio
module IDX = Train.IDX
open Nn_blocks.DSL_modules
module Asgns = Ir.Assignments

let n_features = 16
let hid1 = 32
let hid2 = 16
let batch_size = 32
let epochs = 12
let init_seed = 7

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();

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

  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in

  let train_logit = logit x_batch in
  let%op abs_z = abs train_logit in
  let%op bce =
    ((relu train_logit - (train_logit *. y_batch) + log (1.0 + exp (neg abs_z)))
    ++ "... => 0") /. !..batch_size
  in

  (* Autoencoder on closed (y=0) rows only. *)
  let%op enc1 x = relu (({ we1 } * x) + { be1; o = [ 12 ] }) in
  let%op z x = relu (({ we2 } * enc1 x) + { be2; o = [ 6 ] }) in
  let%op recon t =
    ({ wd2 } * relu (({ wd1 } * t) + { bd1; o = [ 12 ] })) + { bd2; o = [ n_features ] }
  in
  let%op ae_mse =
    (((recon (z x_batch) - x_batch) *. (recon (z x_batch) - x_batch))
    ++ "... => 0") /. !..(batch_size * n_features)
  in

  ignore (bce, ae_mse, x_batch, y_batch);
  printf "goki_closer ready  features=%d  hid=%d/%d\n" n_features hid1 hid2
