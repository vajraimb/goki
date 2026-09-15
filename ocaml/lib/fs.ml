(* GOKI data plane — synthetic issuers, 10 tie-in rules, 38-d features.
   Pure OCaml, no pandas, no gather: industry is one-hot on the last 8 axes. *)
open Base

let n_issuers = 1000
let n_features = 38
let n_rules = 10
let split_seed = 42

type industry =
  | Bank
  | Realty
  | Mfg
  | Pharma
  | Cons
  | Energy
  | Tech
  | Trans

let industries = [| Bank; Realty; Mfg; Pharma; Cons; Energy; Tech; Trans |]

type inject =
  | Clean
  | Rounding
  | Reclass
  | True_error

type year = {
  mutable revenue : float;
  mutable cogs : float;
  mutable gp : float;
  mutable opex : float;
  mutable da : float;
  mutable ebit : float;
  mutable interest : float;
  mutable pretax : float;
  mutable tax : float;
  mutable ni : float;
  mutable dividends : float;
  mutable cash : float;
  mutable ar : float;
  mutable inv : float;
  mutable ppe : float;
  mutable other_ca : float;
  mutable other_nca : float;
  mutable ap : float;
  mutable st_debt : float;
  mutable tax_pay : float;
  mutable lt_debt : float;
  mutable other_l : float;
  mutable share_cap : float;
  mutable re : float;
  mutable cfo : float;
  mutable cfi : float;
  mutable cff : float;
  mutable net_cf : float;
  mutable capex : float;
  mutable tax_paid : float;
}

type issuer = {
  id : string;
  ticker : string;
  name : string;
  industry : industry;
  inject : inject;
  prior : year;
  curr : year;
}

let assets y =
  y.cash +. y.ar +. y.inv +. y.ppe +. y.other_ca +. y.other_nca

let le y =
  y.ap +. y.st_debt +. y.tax_pay +. y.lt_debt +. y.other_l +. y.share_cap +. y.re

let nz x floor = Float.max (Float.abs x) floor

(* Residuals, relative residuals, YoY of relative residuals — 3 per rule. *)
let features_of (iss : issuer) =
  let p, c = iss.prior, iss.curr in
  let d_ar = c.ar -. p.ar in
  let d_inv = c.inv -. p.inv in
  let d_ap = c.ap -. p.ap in
  let d_cash = c.cash -. p.cash in
  let d_re = c.re -. p.re in
  let r0 = assets c -. le c in
  let r1 = d_cash -. c.net_cf in
  let r2 = d_re -. (c.ni -. c.dividends) in
  let r3 = c.pretax -. c.tax -. c.ni in
  let r4 = c.revenue -. c.cogs -. c.gp in
  let r5 = c.cfo -. (c.ni +. c.da -. d_ar -. d_inv +. d_ap) in
  let r6 = c.ppe -. (p.ppe +. c.capex -. c.da) in
  let r7 = c.tax_pay -. (p.tax_pay +. c.tax -. c.tax_paid) in
  let r8 = (c.ar /. nz c.revenue 1.) -. (p.ar /. nz p.revenue 1.) in
  let r9 = (c.inv /. nz c.cogs 1.) -. (p.inv /. nz p.cogs 1.) in
  let rel r s = r /. nz s 1. in
  let slog x = Float.copysign (Float.log1p (Float.abs x)) x in
  let buf = Array.create ~len:n_features 0. in
  let put i residual scale =
    buf.(i * 3) <- slog residual;
    buf.(i * 3 + 1) <- rel residual scale;
    buf.(i * 3 + 2) <- rel residual scale
  in
  put 0 r0 (assets c);
  put 1 r1 (nz c.net_cf 10.);
  put 2 r2 (nz c.ni 10.);
  put 3 r3 (nz c.ni 10.);
  put 4 r4 c.revenue;
  put 5 r5 (nz c.cfo 10.);
  put 6 r6 (nz c.ppe 1.);
  put 7 r7 (nz c.tax 1.);
  put 8 r8 1.;
  put 9 r9 1.;
  let ind =
    match iss.industry with
    | Bank -> 0
    | Realty -> 1
    | Mfg -> 2
    | Pharma -> 3
    | Cons -> 4
    | Energy -> 5
    | Tech -> 6
    | Trans -> 7
  in
  buf.(30 + ind) <- 1.;
  buf

let label iss = match iss.inject with True_error -> 1. | _ -> 0.

(* Deterministic Fisher–Yates, same contract as mlp_names.ml. *)
let shuffle arr ~seed =
  let rng = Random.State.make [| seed |] in
  let n = Array.length arr in
  for i = n - 1 downto 1 do
    let j = Random.State.int rng (i + 1) in
    let tmp = arr.(i) in
    arr.(i) <- arr.(j);
    arr.(j) <- tmp
  done;
  arr

let split_80_10_10 n =
  let idx = Array.init n ~f:Fn.id in
  ignore (shuffle idx ~seed:split_seed : int array);
  let n_train = n * 8 / 10 in
  let n_dev = n / 10 in
  ( Array.sub idx ~pos:0 ~len:n_train,
    Array.sub idx ~pos:n_train ~len:n_dev,
    Array.sub idx ~pos:(n_train + n_dev) ~len:(n - n_train - n_dev) )
