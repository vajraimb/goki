(* GOKI Estimate-Net SBC — share-based payment / opex.
   Tencent ~14% and Meituan ~5% are in-distribution. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_in = 8
let hid1 = 16
let hid2 = 8
let init_seed = 51

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logits x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in
  ignore logits;
  printf "goki_estimate_sbc ready  in=%d\n" n_in
