(* GOKI Pack-Net — 12 structural ratios → 6-class softmax (generic / bank /
   exchange / realty / energy / platform). Router, not a closer. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 12
let hid = 24
let n_class = 6
let init_seed = 29

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h x = relu (({ w1 } * x) + { b1; o = [ hid ] }) in
  let%op logits x = ({ w2 } * h x) + { b2; o = [ n_class ] } in
  ignore logits;
  printf "goki_pack_net ready  features=%d  classes=%d\n" n_features n_class
