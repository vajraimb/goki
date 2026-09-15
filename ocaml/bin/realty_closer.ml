(* GOKI realty closer — HKAS 40 investment property + properties for sale.
   16-d → 32 ReLU → 16 ReLU → 1 logit. Slots: N01 equity, P01 IP roll,
   P02 properties for sale, N03 cash, N04 debt, N05 tax, P03 gearing
   (analytic), P04 FV/IP (analytic). PPE cost rollforward is masked. *)
open Base
open Ocannl
open Stdio
module IDX = Train.IDX
open Nn_blocks.DSL_modules

let n_features = 16
let hid1 = 32
let hid2 = 16
let init_seed = 13

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in
  ignore logit;
  printf "goki_realty_closer ready  features=%d  (P01 IP / P02 properties for sale)\n" n_features
