# 版本管理 - Surf My Cycle

## 当前版本
**V3** - AI伴侣功能（MiniMax接入）
- 日期：2026-03-23
- 文件：`cycle_experiment.html`
- 变更：接入MiniMax AI对话，自动分析情绪评分

## 上一版本
**V2** - 分时段记录（早上/下午/晚上）
- 日期：2026-03-23
- 文件：`cycle_experiment_v2.html`

## 回滚方法
如需回滚到V2：
```bash
cp cycle_experiment_v2.html cycle_experiment.html
```

## 版本规则
1. 每次大更新前，复制当前文件为 `cycle_experiment_vX.html`
2. 更新主文件后，测试确认OK再继续
3. 如有问题，立即用上述命令回滚

## 文件结构
```
cycle_experiment.html       ← 当前使用（主文件）
cycle_experiment_v1.html    ← V1备份
cycle_experiment_v2.html    ← V2备份
VERSION.md                  ← 版本管理文档
.windsurf/memory.md         ← 协作经验
docs/                       ← 文档
```
