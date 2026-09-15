(* GOKI Estimate-Net FV — 8 IP fair-value features → 16 ReLU → 8 ReLU → 1.
   Label = |FV|/IP outlier vs ~0.8% peer band. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 8
let hid1 = 16
let hid2 = 8
let init_seed = 43

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in
  ignore logit;
  printf "goki_estimate_fv ready  features=%d\n" n_features
