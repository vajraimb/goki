(* GOKI platform closer — buybacks, ROU, intangibles, term deposits.
   16-d → 32 ReLU → 16 ReLU → 1 logit. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 16
let hid1 = 32
let hid2 = 16
let init_seed = 19

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in
  ignore logit;
  printf "goki_platform_closer ready  features=%d  (N01 buyback / N07 ROU / T01 liquidity)\n"
    n_features
