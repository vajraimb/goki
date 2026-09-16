(* GOKI Materiality-Net — residual, rel, scale, NI, assets,
   analytic/hard flags, pack one-hot → 3-class softmax
   (pass / review / exception). *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 14
let hid = 16
let n_class = 3
let init_seed = 61

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h x = relu (({ w1 } * x) + { b1; o = [ hid ] }) in
  let%op logits x = ({ w2 } * h x) + { b2; o = [ n_class ] } in
  ignore logits;
  printf "goki_materiality ready  features=%d  classes=%d\n" n_features n_class
