(* GOKI energy closer — oil & gas / generation PPE + decommissioning.
   16-d → 32 ReLU → 16 ReLU → 1 logit. Slots: N01, E01 PPE/DD&A,
   E02 ARO, N03 cash, N04 debt, E03 ROU, E04 DD&A rate, E05 fuel clause. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 16
let hid1 = 32
let hid2 = 16
let init_seed = 17

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in
  ignore logit;
  printf "goki_energy_closer ready  features=%d  (E01 PPE / E02 ARO)\n" n_features
