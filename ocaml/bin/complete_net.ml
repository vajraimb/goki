(* GOKI Completeness-Net — 26 features (6 pack one-hot + 12 empty flags +
   8 note-identity rels) → 24 ReLU → 12 independent sigmoids.
   Label = which required note slots were dropped. Empty + closed ≠ missing. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 26
let hid = 24
let n_slot = 12
let init_seed = 47

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h x = relu (({ w1 } * x) + { b1; o = [ hid ] }) in
  let%op logits x = ({ w2 } * h x) + { b2; o = [ n_slot ] } in
  ignore logits;
  printf "goki_complete_net ready  features=%d  slots=%d\n" n_features n_slot
