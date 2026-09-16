(* GOKI Estimate-Net DD&A — da/PPE vs prior. Outlier if the
   depletion rate jumps. Oil ~12%, power ~6% are both normal. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_in = 8
let hid1 = 16
let hid2 = 8
let init_seed = 47

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logits x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in
  ignore logits;
  printf "goki_estimate_dda ready  in=%d\n" n_in
