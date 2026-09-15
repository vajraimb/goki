# GOKI · 勾稽底稿

财务报表勾稽关系审计工作底稿。合成样本上用小 MLP 把「注入的真错误」从舍入/重分类里分出来；港股蓝筹实报只跑规则，硬恒等必须闭合，口径残差要能被附注吃掉。

OCaml / OCANNL（cc 后端）是训练图的权威实现；浏览器里是同一张图的 FMA 副本，seed = 3 可对黄金文件。

## 做什么

- 两年科目 → 十条勾稽 → 38 维特征（残差 log / 相对残差 / 同比 + 行业）
- 三头网络（仅合成样本）
  - MLP `38 → 64 → 32 → 1`，4,609 参数，BCE，p(真错误)
  - 自编码器 `38 → 16 → 8`，干净样本上训
  - 现金回归：结构比率 → 现金/资产
- 港股蓝筹 FY2025：映射进同一套科目，**不进 MLP**。例外只在 R01 / R04 / R05 断裂时打。

模型不读 PDF。实报数字是映射表里的披露数，经「百万 → 万元 + 塞子闭合 R01」之后交给规则。说明见 [`docs/goki-model-note.html`](docs/goki-model-note.html) 与 [`public/goki-model-note.pdf`](public/goki-model-note.pdf)。

## 十条勾稽

| 代码 | 名称 | 种类 |
|---|---|---|
| R01 | 资产负债恒等 | 硬 |
| R02 | 货币资金滚存 | 口径 |
| R03 | 未分配利润滚存 | 口径（缺 OCI / 回购 / 储备） |
| R04 | 净利润桥 | 硬 |
| R05 | 毛利勾稽 | 硬 |
| R06 | 间接法现金流 | 口径 |
| R07 | 固定资产滚存 | 口径（缺处置 / 在建 / 重估） |
| R08 | 应交税费滚存 | 口径 |
| R09 | 应收／收入周转 | 分析性 |
| R10 | 存货／成本周转 | 分析性 |

## 本地跑

```bash
npm install
npm run dev
```

需要 Node 22。前端是 TanStack Start + React 19 + Tailwind v4。

OCaml 侧：

```bash
opam pin add ocannl https://github.com/ahrefs/ocannl.git
cd ocaml
OCANNL_BACKEND=cc dune exec bin/goki.exe
```

详见 [`ocaml/README.md`](ocaml/README.md)。

## 目录

```
src/lib/goki/     规则、特征、MLP 副本、港股映射
src/routes/       队列 / 发行人底稿 / 港股 / 规则 / 实验室
ocaml/            OCANNL 训练图与黄金文件
docs/             模型说明 HTML
public/           品牌图与模型说明 PDF
```

## 许可

源码按仓库现状提供，年报数字来自发行人已公开的 FY2025 业绩。本工具是工作底稿，不构成鉴证意见。
