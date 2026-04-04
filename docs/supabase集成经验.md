# Supabase 集成开发经验报告

## 核心问题

### 1. 外部库 CDN 阻塞脚本执行
- **现象**：日历不显示，所有 JS 函数 `undefined`
- **根因**：Supabase CDN 加载时阻塞了后续 inline script 的执行
- **解决**：去掉 CDN，改用原生 `fetch` 直接调用 Supabase REST API

### 2. 数据迁移路径遗漏
- **现象**：切换到 Supabase 后数据丢失
- **根因**：只从 localStorage 迁移，忽略了 IndexedDB 里的旧数据
- **解决**：增加 `readFromIndexedDB()` 函数，优先读取 IndexedDB 再回退到 localStorage

### 3. CORS 与本地文件协议
- **现象**：用户担心 file:// 打开无法访问后端
- **实际**：Supabase 允许 `Origin: null`，file:// 完全可用
- **结论**：无需部署服务器，直接双击 HTML 即可使用

## 技术方案

```javascript
// 纯 fetch 调用 Supabase，零依赖
const SB_HEADERS = { 
  'apikey': KEY, 
  'Authorization': 'Bearer ' + KEY 
};
async function sbGet(table, params) {
  const r = await fetch(URL + '/rest/v1/' + table + '?' + new URLSearchParams(params), 
    { headers: SB_HEADERS });
  return r.ok ? r.json() : [];
}
```

## 协作经验

### 做得好的
- 通过 `agent-browser` 截图验证，快速定位视觉问题
- 用 curl 直接测试 Supabase API，隔离前后端问题
- 采用 REST API 直连方案，消除外部依赖风险

### 需改进
- **提前验证**：修改后应立即用浏览器截图确认，而不是等用户反馈
- **终端交互**：`npx` 命令需要用户确认时，应提前说明需按 Y
- **数据迁移**：切换存储层时必须检查所有可能的数据位置

## 关键认知

1. **浏览器存储层级**：localStorage → IndexedDB → 云端数据库，迁移要层层覆盖
2. **CORS 实际行为**：`file://` 协议 Origin 为 `null`，多数 BaaS 平台允许
3. **CDN 风险**：第三方脚本加载失败会阻塞整个页面，关键功能应内联或自主托管

## 交付标准

- ✅ 功能可用（截图验证）
- ✅ 数据持久化（API 测试）
- ✅ 降级兼容（迁移逻辑）
