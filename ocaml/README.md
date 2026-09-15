# GOKI — 勾稽底稿 (OCANNL)

Full-OCaml pipeline for financial-statement **tie-in residual audit**.
No Python. Feature matrix is a hosted `TDSL` tensor; there is no embedding
lookup and no dynamic gather.

```
opam pin add ocannl https://github.com/ahrefs/ocannl.git
OCANNL_BACKEND=cc dune exec bin/goki.exe
```

The CPU `cc` backend is the intended runtime: ~4.6k parameters, SIMD packed
FMA, bit-stable under `Utils.settings.fixed_state_for_init <- Some 3`.

## Layout

| File | Role |
|---|---|
| `lib/fs.ml` | Synthetic issuers, 10 勾稽 rules, 38-d feature matrix, 80/10/10 split |
| `bin/goki.ml` | Three OCANNL models (triage MLP + BCE, autoencoder, cash regressor) |
| `goki.expected` | Golden file — bounds, not digits. Replay must be bit-identical. |

## Models

1. **Triage MLP** `38 → 64 ReLU → 32 ReLU → 1 logit`, BCE-with-logits.
   Ranks “true error vs explainable rounding / reclass”. The model does not
   replace the rules; it sorts the exception queue.
2. **Autoencoder** `38 → 16 → 8 → 16 → 38`, MSE, trained on clean rows only.
3. **Cash regressor** other line items → 货币资金 / 资产, residual threshold.

## Why OCANNL here

The workpaper has to answer “where did this number come from” five years later.
The compiled `.cd → .ll → .c` routine is the audit trail; a fused PyTorch
kernel is not.
