(* GOKI Map-Net — lexicon hits + pack one-hot + statement section
   → 40 ReLU → 35-class softmax. No embedding table, no gather.
   Label = canonical YearBooks / NoteBooks slot. *)
open Base
open Ocannl
open Stdio
open Nn_blocks.DSL_modules

let n_features = 133
let hid = 40
let n_class = 35
let init_seed = 53

let () =
  Utils.settings.fixed_state_for_init <- Some init_seed;
  Tensor.unsafe_reinitialize ();
  let%op h x = relu (({ w1 } * x) + { b1; o = [ hid ] }) in
  let%op logits x = ({ w2 } * h x) + { b2; o = [ n_class ] } in
  ignore logits;
  printf "goki_map_net ready  features=%d  classes=%d\n" n_features n_class
