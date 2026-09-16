(* GOKI telco closer — PPE+CIP, spectrum/intangibles, contract
   assets/liabilities, bank deposits. 16-d → 32 → 16 → 1. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 16
let hid1 = 32
let hid2 = 16
let init_seed = 31

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h1 x = relu (({ w1 } * x) + { b1; o = [ hid1 ] }) in
  let%op h2 x = relu (({ w2 } * h1 x) + { b2; o = [ hid2 ] }) in
  let%op logit x = ({ w3 } * h2 x) + { b3; o = [ 1 ] } in
  ignore logit;
  printf "goki_telco_closer ready  features=%d  (C01 network / C02 intan / C04 CL)\n" n_features
