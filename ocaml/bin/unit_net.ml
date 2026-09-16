(* GOKI Unit-Net — log10(raw), assets, NI, vs existing, pack
   → 4-class softmax (千元 / 万元 / 百万 / 亿). *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 13
let hid = 12
let n_class = 3
let init_seed = 67

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h x = relu (({ w1 } * x) + { b1; o = [ hid ] }) in
  let%op logits x = ({ w2 } * h x) + { b2; o = [ n_class ] } in
  ignore logits;
  printf "goki_unit_net ready  features=%d  classes=%d\n" n_features n_class
