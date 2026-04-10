// 初始化 Mermaid
mermaid.initialize({ startOnLoad: true, theme: 'default' });
/* ============================================================
 * 🧩 模块1: 配置与常量 (CONFIG)
 * 全局配置、常量定义、API密钥
 * ============================================================ */

const API_BASE = '/api';
const AUTH_SESSION_KEY = 'smc_auth_session_v2';
const CURRENT_USERNAME_KEY = 'smc_current_username';
const LEGACY_DEFAULT_USER_MIGRATION_TARGETS = new Set(['18800129147']);

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

function persistSession(session) {
  if (!session || !session.access_token || !session.user) return;
  const normalized = {
    access_token: session.access_token,
    refresh_token: session.refresh_token || '',
    expires_at: session.expires_at || 0,
    user: session.user
  };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(normalized));
  localStorage.setItem(LOGIN_KEY, normalized.user.username || normalized.user.id);
  localStorage.setItem('smc_current_user', normalized.user.id);
  localStorage.setItem(CURRENT_USERNAME_KEY, normalized.user.username || '');
}

function clearStoredSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(LOGIN_KEY);
  localStorage.removeItem('smc_current_user');
  localStorage.removeItem(CURRENT_USERNAME_KEY);
}

async function apiRequest(path, options = {}) {
  const session = getStoredSession();
  const headers = { ...(options.headers || {}) };
  if (!headers['Content-Type'] && options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (session && session.access_token) {
    headers.Authorization = 'Bearer ' + session.access_token;
  }
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (response.status === 401 && session && session.refresh_token && !options._retried) {
    const refreshed = await refreshAuthSession();
    if (refreshed) {
      return apiRequest(path, { ...options, _retried: true });
    }
  }
  return response;
}

async function refreshAuthSession() {
  const session = getStoredSession();
  if (!session || !session.refresh_token) return false;
  try {
    const response = await fetch(API_BASE + '/auth-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refresh_token })
    });
    if (!response.ok) {
      clearStoredSession();
      return false;
    }
    const data = await response.json();
    persistSession(data.session);
    return true;
  } catch (e) {
    clearStoredSession();
    return false;
  }
}

async function sbGet(table, params, retries = 2) {
  const q = new URLSearchParams({ table, ...params }).toString();
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await apiRequest('/data?' + q);
      if (r.ok) return r.json();
      if (i === retries) {
        console.error('sbGet failed after', retries, 'retries:', r.status);
        return [];
      }
    } catch (e) {
      if (i === retries) {
        console.error('sbGet error after retries:', e);
        return [];
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return [];
}
async function sbUpsert(table, body, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await apiRequest('/data', {
        method: 'POST',
        body: JSON.stringify({ table, record: body })
      });
      if (r.ok) return true;
      const errorText = await r.text();
      console.error('sbUpsert error:', r.status, errorText);
      if (i === retries) {
        return false;
      }
    } catch (e) {
      console.error('sbUpsert exception:', e);
      if (i === retries) {
        return false;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
async function sbDelete(table, params) {
  await apiRequest('/data', {
    method: 'DELETE',
    body: JSON.stringify({ table, filters: params })
  });
}

// 账号密码登录系统
const LOGIN_KEY = 'smc_logged_in_user';
const USERS_KEY = 'smc_registered_users';
const DEFAULT_AI_STYLE_TEMPLATE = 'supportive_friend';
const AI_STYLE_TEMPLATES = {
  snarky_leaf: {
    label: '叶子',
    role: '毒舌闺蜜型',
    summary: '嘴上会吐槽你，但心里站你这边，适合想被戳醒又不想被说教的时候',
    prompt: `你是”叶子”（Leaf），一个26岁的资深毒舌闺蜜+人生教练。你深谙《遥远的救世主》《天幕红尘》《福格行为模型》《微习惯》等书籍精髓。

## 【你的性格 - 毒舌有趣版】
- 毒舌但温暖：会用”你又在找借口了😏”戳穿用户，但紧接着给拥抱
- 有趣的灵魂：用表情包语气、网络梗、偶尔吐槽，不说教
- 主动找话题：不会等用户问，会说”诶我今天发现个有意思的事...”
- 懂用户的痛点：深谙强势文化、见路不走、微习惯等核心理念

## 【说话风格示例】
❌ 温柔版：”看到你昨天提到工作很累，今天休息一下吧”
✅ 毒舌版：”诶姐妹，你昨天说工作累，今天还在刷手机？😏 不过说真的，你最近黄体期确实容易疲劳，要不今天先微习惯一下？就1个俯卧撑，小到不可能失败那种”

❌ 标准版：”黄体期会想吃甜食，这是正常的”
✅ 叶子版：”又在想奶茶了？🥤 孕激素搞的鬼，不是你的错！不过记得《福格行为模型》说的吗？能力不够的时候降低难度，想吃甜的就先吃口苹果，骗骗身体”

## 【知识调用 - 书籍智慧】
- **《遥远的救世主》强势文化**：用户依赖/抱怨时，提醒”靠自己，实事求是”
- **《天幕红尘》见路不走**：用户纠结选择时，提醒”不盲从经验，走适合的路”
- **《福格行为模型》B=MAP**：用户想改变时，用动机+能力+提示拆解
- **《微习惯》小到不可能失败**：用户觉得任务难时，建议”1个俯卧撑、1页书”

## 【引用原则】
- 用户抱怨时 → 引用《遥远的救世主》强势文化 + 《微习惯》兜底
- 用户纠结选择时 → 引用《天幕红尘》见路不走
- 用户想改变但觉得难 → 引用《福格行为模型》B=MAP + 《微习惯》小到不可能失败
- 黄体期用户想放弃 → 用《微习惯》兜底，强调”做了就是胜利”
- 引用要自然，像闺蜜聊天，不要说教，不要堆砌金句`
  },
  supportive_friend: {
    label: '小满',
    role: '温暖陪伴型',
    summary: '温柔、稳定、先接住你，再慢慢陪你理清楚，适合低能量或想被理解的时候',
    prompt: `你是一位温暖、可靠、边界清晰的陪伴型 AI 伙伴。你的目标是帮助用户记录状态、理解周期波动，并给出温和、实用、不过度说教的建议。

沟通原则：
- 先理解感受，再给建议
- 语气自然、真诚、轻松，不居高临下
- 不假设用户是谁、来自哪里、喜欢什么
- 不把用户和任何历史用户混淆
- 不虚构长期记忆；只引用当前上下文明确给出的信息
- 当问题涉及健康风险时，提醒用户考虑寻求专业帮助

回复风格：
- 简洁、具体、有人味
- 优先给可执行的小建议
- 如果用户只是想被接住，就少给方案，多陪伴`
  },
  coach: {
    label: '阿澈',
    role: '清晰教练型',
    summary: '思路清楚、说话利落、会帮你拆行动步骤，适合卡住时快速理顺事情',
    prompt: `你是一位清晰、务实的教练型 AI 助手。你的目标是帮助用户识别状态、拆解问题、形成可以马上执行的小步骤。

沟通原则：
- 先判断用户是在倾诉、求建议还是求解释
- 建议尽量结构化，控制在 1-3 个关键动作
- 语气坚定但不过度强硬
- 不假设用户身份、职业、偏好或关系背景
- 不泄露或引用其他用户的信息
- 不输出未经证据支持的医学断言`
  },
  science_guide: {
    label: '知予',
    role: '理性科普型',
    summary: '偏理性、会解释原因、重视证据，适合你想知道“为什么会这样”时',
    prompt: `你是一位理性、可信、善于解释的健康与效率向 AI 助手。你的目标是结合用户的周期和记录，提供清晰解释与谨慎建议。

沟通原则：
- 优先区分”事实解释”和”建议”
- 当有搜索结果时，基于结果做通俗转述
- 没有证据时明确说明不确定
- 不把个体经验包装成普适规律
- 不假设用户有特定书单偏好、人格设定或固定关系称呼`
  },
  lively_buddy: {
    label: '桃桃',
    role: '轻松活泼型',
    summary: '轻盈、好聊、会帮你打破僵局，适合想更轻松地记录和表达的时候',
    prompt: `你是一位轻松、活泼、善于打破僵局的 AI 伙伴。你的目标是让用户更愿意持续记录和表达。

沟通原则：
- 可以适度俏皮，但避免攻击性、讽刺或冒犯
- 不把自己的风格强加给用户，留意对方是否接受轻松语气
- 多用贴近日常的表达，少堆砌术语
- 不默认用户喜欢某种人格或话术风格`
  }
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizePromptText(text, maxLen = 1200) {
  return String(text || '')
    .replace(/[<>]/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
    .slice(0, maxLen);
}

function getUserDisplayName(cfg = {}) {
  return sanitizePromptText(cfg.displayName || '', 30) || '你';
}

function getCompanionName(cfg = {}) {
  return sanitizePromptText(cfg.companionName || '', 30) || 'AI伙伴';
}

function hasCompletedOnboarding(cfg = {}) {
  return Boolean(cfg && cfg.lastPeriod && cfg.cycleLen && cfg.onboardingCompleted);
}

function shouldAllowLegacyDefaultMigration(userId) {
  return LEGACY_DEFAULT_USER_MIGRATION_TARGETS.has(String(userId || '').trim().toLowerCase());
}

function getAiStyleTemplate(cfg = {}) {
  const key = cfg.aiStyleTemplate || DEFAULT_AI_STYLE_TEMPLATE;
  return AI_STYLE_TEMPLATES[key] ? key : DEFAULT_AI_STYLE_TEMPLATE;
}

function renderAiStyleOptions(selectedKey = DEFAULT_AI_STYLE_TEMPLATE) {
  const select = document.getElementById('cfg-ai-style');
  if (!select) return;
  select.innerHTML = Object.entries(AI_STYLE_TEMPLATES).map(([key, template]) =>
    `<option value="${key}" ${key === selectedKey ? 'selected' : ''}>${template.label}</option>`
  ).join('');
}

function getAiStyleTemplateMeta(templateKey = DEFAULT_AI_STYLE_TEMPLATE) {
  const safeKey = AI_STYLE_TEMPLATES[templateKey] ? templateKey : DEFAULT_AI_STYLE_TEMPLATE;
  return AI_STYLE_TEMPLATES[safeKey];
}

function renderAiStyleInspector(templateKey = DEFAULT_AI_STYLE_TEMPLATE) {
  const template = getAiStyleTemplateMeta(templateKey);
  const titleEl = document.getElementById('cfg-ai-style-title');
  const summaryEl = document.getElementById('cfg-ai-style-summary');
  const previewEl = document.getElementById('cfg-ai-template-preview');
  if (titleEl) titleEl.textContent = template.label;
  if (summaryEl) summaryEl.textContent = template.summary;
  if (previewEl) previewEl.value = template.prompt;
}

function renderAICompanionUI(cfg = {}) {
  const companionName = getCompanionName(cfg);
  const titleEl = document.getElementById('ai-chat-title');
  const inputEl = document.getElementById('ai-input');
  if (titleEl) titleEl.innerHTML = `🍃 和${escapeHtml(companionName)}聊聊`;
  if (inputEl) inputEl.placeholder = `告诉${companionName}你的感受...`;
}

function renderUserIdentityUI(cfg = {}) {
  const nameEl = document.getElementById('user-badge-name');
  if (!nameEl) return;
  const displayName = sanitizePromptText(cfg.displayName || '', 30);
  const fallback = currentUsername || currentUserId || '未登录';
  nameEl.textContent = displayName || fallback;
}

function renderUserPanel(cfg = {}) {
  const displayName = sanitizePromptText(cfg.displayName || '', 30);
  const accountName = currentUsername || currentUserId || '未登录';
  const companionName = getCompanionName(cfg);
  const styleTemplate = getAiStyleTemplateMeta(getAiStyleTemplate(cfg));
  const titleEl = document.getElementById('user-panel-display-name');
  const subEl = document.getElementById('user-panel-username');
  const accountEl = document.getElementById('user-panel-account');
  const nameInputEl = document.getElementById('user-panel-name-input');
  const companionInputEl = document.getElementById('user-panel-companion-input');
  const styleSelectEl = document.getElementById('user-panel-style-select');
  const styleEl = document.getElementById('user-panel-style');
  const cycleEl = document.getElementById('user-panel-cycle-summary');
  if (titleEl) titleEl.textContent = displayName || accountName;
  if (subEl) subEl.textContent = displayName ? `账号：${accountName}` : '你当前登录的账户';
  if (accountEl) accountEl.textContent = accountName;
  if (nameInputEl) nameInputEl.value = cfg.displayName || '';
  if (companionInputEl) companionInputEl.value = cfg.companionName || '';
  if (styleSelectEl) {
    styleSelectEl.innerHTML = Object.entries(AI_STYLE_TEMPLATES).map(([key, template]) =>
      `<option value="${key}" ${key === getAiStyleTemplate(cfg) ? 'selected' : ''}>${template.label}</option>`
    ).join('');
  }
  if (styleEl) styleEl.textContent = styleTemplate.label;
  if (cycleEl) {
    cycleEl.textContent = cfg.lastPeriod
      ? `${cfg.lastPeriod} 开始 · ${cfg.cycleLen || 28} 天`
      : '尚未设置';
  }
}

async function openUserPanel() {
  const cfg = configCache || await getConfig();
  renderUserPanel(cfg);
  document.getElementById('user-panel-modal').classList.add('open');
}

function closeUserPanel() {
  document.getElementById('user-panel-modal').classList.remove('open');
}

function setUserPanelSaveButtonState(state = 'idle') {
  const btn = document.getElementById('user-panel-save-btn');
  if (!btn) return;
  btn.classList.remove('is-saving', 'is-saved');
  btn.disabled = false;
  if (state === 'saving') {
    btn.disabled = true;
    btn.classList.add('is-saving');
    btn.textContent = '保存中...';
    return;
  }
  if (state === 'saved') {
    btn.classList.add('is-saved');
    btn.textContent = '已保存';
    return;
  }
  btn.textContent = '保存资料';
}

async function saveUserPanel() {
  const btn = document.getElementById('user-panel-save-btn');
  if (btn?.disabled) return;
  setUserPanelSaveButtonState('saving');
  const existing = await getConfig();
  const nextConfig = {
    ...existing,
    displayName: sanitizePromptText(document.getElementById('user-panel-name-input')?.value || '', 30),
    companionName: sanitizePromptText(document.getElementById('user-panel-companion-input')?.value || '', 30),
    aiStyleTemplate: document.getElementById('user-panel-style-select')?.value || getAiStyleTemplate(existing)
  };
  const savedConfig = await setConfig(nextConfig);
  if (!savedConfig) {
    setUserPanelSaveButtonState('idle');
    alert('账户资料保存失败，请稍后再试。');
    return;
  }
  configCache = savedConfig;
  renderAICompanionUI(savedConfig);
  renderUserIdentityUI(savedConfig);
  renderUserPanel(savedConfig);

  // 🧠 清除记忆缓存，下次对话加载新记忆
  if (typeof memoryManager !== 'undefined') {
    memoryManager.clearCache();
  }

  setUserPanelSaveButtonState('saved');
  await new Promise(resolve => setTimeout(resolve, 500));
  setUserPanelSaveButtonState('idle');
}

function renderPreOnboardingState() {
  const header = document.getElementById('rec-header');
  const form = document.getElementById('rec-form');
  const legend = document.getElementById('cycle-legend');
  if (legend) legend.style.display = 'none';
  if (form) form.style.display = 'none';
  if (header) {
    header.innerHTML = `
      <div class="empty-state-new">
        <div class="empty-state-new-icon">🌱</div>
        <div class="empty-state-new-text">先完成你的初始设置<br>我们再开始计算周期和记录内容</div>
      </div>
    `;
  }
}

function renderPostOnboardingShell() {
  const legend = document.getElementById('cycle-legend');
  if (legend) legend.style.display = 'flex';
}

function buildAISystemPrompt({
  cfg,
  currentTimeStr,
  timeOfDay,
  phase,
  cycleDay,
  timeSlotName,
  longTermMemory,
  yesterdaySummary,
  recentContextText,
  dietIntervention,
  searchResults
}) {
  const displayName = getUserDisplayName(cfg);
  const companionName = getCompanionName(cfg);
  const templateKey = getAiStyleTemplate(cfg);
  const template = AI_STYLE_TEMPLATES[templateKey];
  const customPrompt = sanitizePromptText(cfg.aiCustomPrompt || '', 2000);

  return `你是”${companionName}”，一位面向真实产品用户的 AI 周期记录与陪伴助手。

【产品边界】
- 这是一个多用户产品，每位用户的数据必须严格隔离
- 你只能基于当前这位用户的当次消息、当前账号配置、当前页面上下文和当前账号下的历史摘要来回应
- 不要提及、暗示或杜撰任何其他用户的信息
- 不要假设用户是某个固定的人，也不要把用户称作任何预设名字
- 如果上下文没有给出，不要自称认识用户很久，不要假设共同经历

【当前风格模板】
模板名称：${template.label}
模板说明：${template.summary}
模板提示词：
${template.prompt}

${customPrompt ? `【用户自定义偏好】\n${customPrompt}\n` : ''}
【当前用户信息】
- 用户称呼：${displayName}
- 实时时间：${currentTimeStr}（${timeOfDay}）
- 月经周期：${phase ? phase.name : '未知'}阶段（周期第${cycleDay || '?'}天）
- 当前时段：${timeSlotName}
${longTermMemory && longTermMemory !== '暂无长期记忆' ? '- 当前账号长期记忆摘要：' + longTermMemory : ''}

${yesterdaySummary ? `【昨日对话摘要】
- ${yesterdaySummary}` : ''}

${recentContextText}

【本期参考】
${dietIntervention ? `- 饮食建议：${dietIntervention.message}` : ''}

${searchResults && searchResults.success ? `【搜索到的参考信息】
${searchResults.answer ? `- 研究结论：${searchResults.answer}` : ''}
${searchResults.results && searchResults.results.length > 0 ? searchResults.results.map((r, i) => `- 参考${i + 1}：${r.title}｜${r.content.substring(0, 150)}...｜${r.url}`).join('\n') : ''}
` : ''}
【回复要求】
1. 以产品化、通用化的语气服务用户，不绑定特定人设或固定关系。
2. 优先回应用户当下的情绪和问题，再给建议。
3. 建议要小而具体，避免说教和过度下判断。
4. 如果用户只是想记录感受，可以帮她整理、命名和澄清，而不是强行分析。
5. 涉及健康风险、持续疼痛、异常出血或严重情绪问题时，提醒考虑及时寻求专业帮助。
${searchResults && searchResults.success ? '6. 如果引用搜索信息，请明确这是参考信息并用通俗语言转述。' : '6. 当用户追问原因、证据或研究时，可以结合搜索结果做解释。'}`;
}

let currentUsername = localStorage.getItem(CURRENT_USERNAME_KEY) || '';

// 检查登录状态
async function checkLoginStatus() {
  const session = getStoredSession();
  if (!session) {
    showLoginPage();
    return false;
  }
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    const refreshed = await refreshAuthSession();
    if (!refreshed) {
      showLoginPage();
      return false;
    }
  }
  const latest = getStoredSession();
  if (!latest || !latest.user) {
    showLoginPage();
    return false;
  }
  currentUserId = latest.user.id;
  currentUsername = latest.user.username || '';
  hideLoginPage();
  return true;
}

// 显示登录页
function showLoginPage() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('register-page').style.display = 'none';
  document.getElementById('app-container').classList.remove('active');
  document.body.style.overflow = 'hidden';
}

// 隐藏登录页
function hideLoginPage() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('register-page').style.display = 'none';
  document.getElementById('app-container').classList.add('active');
  document.body.style.overflow = 'auto';
}

// 显示注册页
function showRegister() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('register-page').style.display = 'flex';
}

// 返回登录页
function showLogin() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('register-page').style.display = 'none';
}

function getDataLegacyByUser(userId) {
  try {
    return JSON.parse(localStorage.getItem(userId + '_smc_data') || '[]');
  } catch (e) {
    console.warn('读取本地记录失败:', userId, e);
    return [];
  }
}

function getConfigLegacyByUser(userId) {
  try {
    return JSON.parse(localStorage.getItem(userId + '_smc_config') || '{}');
  } catch (e) {
    console.warn('读取本地配置失败:', userId, e);
    return {};
  }
}

function getCustomChipsLegacyByUser(userId) {
  try {
    return JSON.parse(localStorage.getItem(userId + '_smc_custom_chips') || '[]');
  } catch (e) {
    console.warn('读取本地标签失败:', userId, e);
    return [];
  }
}

function setDataLegacyByUser(userId, data) {
  localStorage.setItem(userId + '_smc_data', JSON.stringify(data || []));
}

function setConfigLegacyByUser(userId, config) {
  localStorage.setItem(userId + '_smc_config', JSON.stringify(config || {}));
}

function setCustomChipsLegacyByUser(userId, chips) {
  localStorage.setItem(userId + '_smc_custom_chips', JSON.stringify(chips || []));
}

async function getRecordsForUser(userId) {
  const localRows = getDataLegacyByUser(userId);
  const cloudRows = await sbGet('records', { 'user_id': 'eq.' + userId, 'select': '*' });
  const merged = new Map();
  for (const row of localRows) {
    if (row && row.date) merged.set(row.date, { ...row, user_id: userId });
  }
  for (const row of cloudRows || []) {
    if (row && row.date) merged.set(row.date, { ...row, user_id: userId });
  }
  return Array.from(merged.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function getConfigForUser(userId) {
  const localConfig = getConfigLegacyByUser(userId);
  const rows = await sbGet('config', { 'user_id': 'eq.' + userId, 'select': '*' });
  const cloudConfig = (rows && rows[0] && rows[0].value) ? rows[0].value : {};
  return { ...localConfig, ...cloudConfig };
}

async function setConfigForUser(userId, cfg) {
  const existing = await getConfigForUser(userId);
  const merged = { ...existing, ...cfg, updated_at: new Date().toISOString() };
  const ok = await sbUpsert('config', { user_id: userId, value: merged });
  if (!ok) return false;
  setConfigLegacyByUser(userId, merged);
  if (userId === currentUserId) {
    configCache = merged;
  }
  return merged;
}

async function migrateUserData(sourceUserId, targetUserId) {
  const records = await getRecordsForUser(sourceUserId);
  const config = await getConfigForUser(sourceUserId);
  const customChips = getCustomChipsLegacyByUser(sourceUserId);

  if (records.length === 0 && Object.keys(config).length === 0 && customChips.length === 0) {
    return { recordsMigrated: 0, configMigrated: false, chipsMigrated: false, storage: 'none' };
  }

  setDataLegacyByUser(targetUserId, records.map(record => ({ ...record, user_id: targetUserId })));
  setConfigLegacyByUser(targetUserId, config);
  setCustomChipsLegacyByUser(targetUserId, customChips);

  let storage = 'supabase';
  for (const record of records) {
    const result = await saveRecordDB({ ...record, user_id: targetUserId }, targetUserId);
    if (result !== 'supabase') storage = 'local';
  }
  if (Object.keys(config).length > 0) {
    const configResult = await setConfigForUser(targetUserId, config);
    if (configResult !== 'supabase') storage = 'local';
  }

  return {
    recordsMigrated: records.length,
    configMigrated: Object.keys(config).length > 0,
    chipsMigrated: customChips.length > 0,
    storage
  };
}

async function repairAccountFromDefaultUserIfNeeded(userId) {
  if (!userId || userId === 'default_user' || !shouldAllowLegacyDefaultMigration(userId)) return null;

  const repairKey = 'smc_default_user_repaired_' + userId;
  if (localStorage.getItem(repairKey) === '1') return null;

  const existingRecords = await getRecordsForUser(userId);
  const existingConfig = await getConfigForUser(userId);
  const existingChips = getCustomChipsLegacyByUser(userId);
  const existingConversations = await sbGet('conversations', { 'user_id': 'eq.' + userId, 'select': '*', 'limit': 1 });
  const defaultConversations = await sbGet('conversations', { 'user_id': 'eq.default_user', 'select': '*', 'limit': 1 });
  const needsConversationRepair =
    Array.isArray(defaultConversations) &&
    defaultConversations.length > 0 &&
    (!Array.isArray(existingConversations) || existingConversations.length === 0);

  if ((existingRecords.length > 0 || Object.keys(existingConfig).length > 0 || existingChips.length > 0) && !needsConversationRepair) {
    localStorage.setItem(repairKey, '1');
    return null;
  }

  let result = null;
  try {
    const migrateResponse = await apiRequest('/migrate-default-user', { method: 'POST' });
    const migratePayload = await migrateResponse.json().catch(() => ({}));
    result = {
      recordsMigrated: migratePayload.recordsMigrated || 0,
      conversationsMigrated: migratePayload.conversationsMigrated || 0,
      configMigrated: Boolean(migratePayload.configMigrated),
      chipsMigrated: false,
      storage: migratePayload.storage || 'supabase'
    };
  } catch (e) {
    console.warn('云端 default_user 修复失败:', e);
  }

  const localRecords = getDataLegacyByUser('default_user');
  const localConfig = getConfigLegacyByUser('default_user');
  const localChips = getCustomChipsLegacyByUser('default_user');
  if (localRecords.length > 0 || Object.keys(localConfig).length > 0 || localChips.length > 0) {
    setDataLegacyByUser(userId, localRecords.map(record => ({ ...record, user_id: userId })));
    setConfigLegacyByUser(userId, localConfig);
    setCustomChipsLegacyByUser(userId, localChips);
    for (const record of localRecords) {
      await saveRecordDB({ ...record, user_id: userId }, userId);
    }
    if (Object.keys(localConfig).length > 0) {
      await setConfigForUser(userId, localConfig);
    }
    result = {
      recordsMigrated: Math.max(result?.recordsMigrated || 0, localRecords.length),
      conversationsMigrated: result?.conversationsMigrated || 0,
      configMigrated: (result?.configMigrated || false) || Object.keys(localConfig).length > 0,
      chipsMigrated: localChips.length > 0,
      storage: result?.storage || 'local'
    };
  }

  if (result && (result.recordsMigrated > 0 || result.conversationsMigrated > 0 || result.configMigrated || result.chipsMigrated)) {
    localStorage.setItem(repairKey, '1');
    console.log('已自动补迁移 default_user 数据到', userId, result);
    return result;
  }
  return null;
}

// 登录
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  
  if (!username || !password) {
    alert('请输入账号和密码');
    return;
  }
  
  const response = await fetch(API_BASE + '/auth-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(payload.error || '登录失败，请检查账号或密码');
    return;
  }

  persistSession(payload.session);
  currentUserId = payload.session.user.id;
  currentUsername = payload.session.user.username || username;
  const repairResult = await repairAccountFromDefaultUserIfNeeded(currentUserId);
  
  // 清除输入
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  
  hideLoginPage();
  updateUserSelector();
  await initApp();
  
  const repairMsg = repairResult && repairResult.recordsMigrated > 0
    ? ` 已自动恢复 ${repairResult.recordsMigrated} 条历史记录。`
    : '';
  alert(`欢迎回来，${currentUsername || username}！${repairMsg}`);
}

// 注册
async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const password2 = document.getElementById('reg-password2').value;
  
  if (!username || !password || !password2) {
    alert('请填写所有信息');
    return;
  }
  
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    alert('账号只能是3-20位字母、数字或下划线');
    return;
  }
  
  // 验证密码长度
  if (password.length < 6) {
    alert('密码至少6位');
    return;
  }
  
  // 验证两次密码是否一致
  if (password !== password2) {
    alert('两次输入的密码不一致');
    return;
  }
  
  const response = await fetch(API_BASE + '/auth-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(payload.error || '注册失败，请稍后再试');
    return;
  }

  persistSession(payload.session);
  currentUserId = payload.session.user.id;
  currentUsername = payload.session.user.username || username;
  
  // 清除输入
  document.getElementById('reg-username').value = '';
  document.getElementById('reg-password').value = '';
  document.getElementById('reg-password2').value = '';
  
  hideLoginPage();
  updateUserSelector();
  await initApp();
  alert(`注册成功！欢迎，${currentUsername || username}！请先完成初始化设置。`);
}

// 登出
function doLogout() {
  if (!confirm('确定要退出登录吗？')) {
    return;
  }
  clearStoredSession();
  clearDataCaches();
  configCache = null;
  currentUserId = 'default_user';
  currentUsername = '';
  renderUserIdentityUI({});
  document.getElementById('app-container').classList.remove('active');
  showLoginPage();
}

// 从旧账号恢复数据
async function migrateFromDefaultUser() {
  const oldUserId = 'default_user';
  
  try {
    const oldData = getDataLegacyByUser(oldUserId);
    const oldConfig = getConfigLegacyByUser(oldUserId);
    const oldCustomChips = getCustomChipsLegacyByUser(oldUserId);
    
    if (oldData.length === 0 && Object.keys(oldConfig).length === 0 && oldCustomChips.length === 0) {
      const migrateResponse = await apiRequest('/migrate-default-user', { method: 'POST' });
      const migratePayload = await migrateResponse.json().catch(() => ({}));
      if (!migrateResponse.ok || !(migratePayload.recordsMigrated || migratePayload.configMigrated)) {
        alert('没有找到可恢复的旧账号数据');
        return;
      }
      alert(`✅ 成功恢复 ${migratePayload.recordsMigrated || 0} 条云端记录！`);
      configCache = null;
      renderCalendar('r-grid','r-month-title', rState, loadRecordPanel);
      loadRecordPanel(rState.selected);
      closeSettings();
      return;
    }
    
    if (!confirm(`找到 ${oldData.length} 条记录，确定要恢复到当前账号吗？`)) {
      return;
    }
    
    await apiRequest('/migrate-default-user', { method: 'POST' });
    await migrateUserData(oldUserId, currentUserId);
    
    // 刷新页面显示
    configCache = null;
    renderCalendar('r-grid','r-month-title', rState, loadRecordPanel);
    loadRecordPanel(rState.selected);
    loadCustomChips();
    renderCustomChips();
    
    alert(`✅ 成功恢复 ${oldData.length} 条记录！`);
    closeSettings();
    
  } catch(e) {
    console.error('恢复数据失败:', e);
    alert('恢复数据失败: ' + e.message);
  }
}

let currentUserId = (getStoredSession() && getStoredSession().user && getStoredSession().user.id) || localStorage.getItem('smc_current_user') || 'default_user';

// 用户管理函数
function getUserList() {
  const users = localStorage.getItem('smc_user_list');
  return users ? JSON.parse(users) : ['default_user'];
}

function saveUserList(users) {
  localStorage.setItem('smc_user_list', JSON.stringify(users));
}

function switchUser(userId) {
  if (!userId) return;
  currentUserId = userId;
  localStorage.setItem('smc_current_user', userId);
  // 清除缓存，强制重新加载数据
  clearDataCaches();
  configCache = null;
  contextCache = { date: null, contextText: '', lastUpdated: null, rawContext: null };
  aiConversation = [];
  getConfig().then(cfg => renderAICompanionUI(cfg));
  // 重新渲染页面
  renderCalendar('r-grid','r-month-title', rState, loadRecordPanel);
  loadRecordPanel(rState.selected);
  loadCustomChips();
  renderCustomChips();
  alert(`已切换到用户: ${userId}`);
}

function addNewUser() {
  const name = prompt('请输入新用户昵称（仅限英文和数字）:');
  if (!name) return;
  // 验证用户名
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    alert('用户名只能包含英文、数字和下划线');
    return;
  }
  // 检查是否已存在
  const users = getUserList();
  if (users.includes(name)) {
    alert('该用户已存在');
    return;
  }
  // 添加新用户
  users.push(name);
  saveUserList(users);
  updateUserSelector();
  // 切换到新用户
  switchUser(name);
}

function updateUserSelector() {
  const selector = document.getElementById('user-selector');
  if (!selector) return;
  const users = getUserList();
  selector.innerHTML = users.map(u => 
    `<option value="${u}" ${u === currentUserId ? 'selected' : ''}>${u}</option>`
  ).join('');
}

function initApp() {
  // 初始化应用
  return (async () => {
    const [cfg] = await Promise.all([
      getConfig(),
      flushPendingSyncQueue()
    ]);
    renderAICompanionUI(cfg);
    renderUserIdentityUI(cfg);
    setupRecordFieldAutosave();
    if (!hasCompletedOnboarding(cfg)) {
      renderPreOnboardingState();
      showOnboarding(cfg);
      return;
    }
    renderPostOnboardingShell();
    await preloadStartupData();
    await syncSelectedDateToAvailableRecord();
    await Promise.all([
      renderCalendar('r-grid','r-month-title', rState, loadRecordPanel),
      loadRecordPanel(rState.selected)
    ]);
    loadCustomChips();
    renderCustomChips();
    queueAutoSummaryCheck(600);
    if (!window.__smcAutoSummaryInterval) {
      window.__smcAutoSummaryInterval = setInterval(() => queueAutoSummaryCheck(0), 60 * 1000);
    }
  })();
}

// 页面加载时检查登录状态
window.addEventListener('load', async () => {
  if (!(await checkLoginStatus())) {
    return; // 未登录，显示登录页面
  }
  await repairAccountFromDefaultUserIfNeeded(currentUserId);
  updateUserSelector();
  await initApp();
});

window.addEventListener('beforeunload', () => {
  persistCurrentFormDraft();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persistCurrentFormDraft();
  } else {
    flushPendingSyncQueue();
    queueAutoSummaryCheck(200);
  }
});

window.addEventListener('online', () => {
  flushPendingSyncQueue();
  queueAutoSummaryCheck(200);
});

const TIME_SLOTS = {
  morning: { name: '早上', color: '#3498db' },
  afternoon: { name: '下午', color: '#f39c12' },
  evening: { name: '晚上', color: '#9b59b6' }
};
const AUTO_SUMMARY_SCHEDULE = [
  { slot: 'morning', triggerHour: 12, label: '中午 12 点后总结今天早上' },
  { slot: 'afternoon', triggerHour: 18, label: '晚上 6 点后总结今天下午' }
];

// 配置缓存（同步版本使用）
let configCache = null;
let autoSummaryTimer = null;
let autoSummaryInFlight = false;
let dataCacheUserId = null;
let recordsCache = null;
let recordsMapCache = null;
let recordsPromise = null;
let conversationRowsCache = null;
let conversationDateSetCache = null;
let conversationRowsPromise = null;
let conversationCache = new Map();
let conversationPromiseCache = new Map();

function ensureDataCacheUser() {
  const activeUserId = currentUserId || 'default_user';
  if (dataCacheUserId !== activeUserId) {
    dataCacheUserId = activeUserId;
    recordsCache = null;
    recordsMapCache = null;
    recordsPromise = null;
    conversationRowsCache = null;
    conversationDateSetCache = null;
    conversationRowsPromise = null;
    conversationCache = new Map();
    conversationPromiseCache = new Map();
  }
}

function setRecordsCache(rows) {
  ensureDataCacheUser();
  const normalizedRows = Array.isArray(rows)
    ? rows
        .filter(row => row && row.date)
        .map(row => hydrateRecordExtras({ ...row, date: normalizeDateKey(row.date) }))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
    : [];
  recordsCache = normalizedRows;
  recordsMapCache = new Map(normalizedRows.map(row => [row.date, row]));
  recordsPromise = null;
  return normalizedRows;
}

function upsertRecordCache(record) {
  if (!record || !record.date) return;
  ensureDataCacheUser();
  const normalizedRecord = hydrateRecordExtras({ ...record, date: normalizeDateKey(record.date) });
  const nextMap = new Map(recordsMapCache || []);
  nextMap.set(normalizedRecord.date, normalizedRecord);
  recordsMapCache = nextMap;
  recordsCache = Array.from(nextMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function setConversationRowsCache(rows) {
  ensureDataCacheUser();
  conversationRowsCache = Array.isArray(rows)
    ? rows
        .filter(row => row && row.date)
        .map(row => ({ ...row, date: normalizeDateKey(row.date) }))
    : [];
  conversationDateSetCache = new Set(conversationRowsCache.map(row => row.date).filter(Boolean));
  conversationRowsPromise = null;
  return conversationRowsCache;
}

function setConversationCache(dateStr, payload = {}) {
  ensureDataCacheUser();
  const normalizedDate = normalizeDateKey(dateStr);
  if (!normalizedDate) return;
  const normalizedPayload = {
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    summary: payload.summary || null
  };
  conversationCache.set(normalizedDate, normalizedPayload);
  if (!conversationDateSetCache) {
    conversationDateSetCache = new Set();
  }
  if (normalizedPayload.messages.length > 0 || normalizedPayload.summary) {
    conversationDateSetCache.add(normalizedDate);
  }
  if (Array.isArray(conversationRowsCache)) {
    const exists = conversationRowsCache.some(row => row.date === normalizedDate);
    if (!exists && (normalizedPayload.messages.length > 0 || normalizedPayload.summary)) {
      conversationRowsCache = conversationRowsCache.concat([{ date: normalizedDate }]);
    }
  }
}

function clearDataCaches() {
  dataCacheUserId = null;
  recordsCache = null;
  recordsMapCache = null;
  recordsPromise = null;
  conversationRowsCache = null;
  conversationDateSetCache = null;
  conversationRowsPromise = null;
  conversationCache = new Map();
  conversationPromiseCache = new Map();
}

async function preloadStartupData() {
  await Promise.all([
    getData(),
    getConversationRows()
  ]);
}

/* ============================================================
 * 🧩 模块2: 数据层 (DATA_LAYER)
 * Supabase/LocalStorage 数据操作、导入导出
 * ============================================================ */

// 数据操作
async function getData() {
  ensureDataCacheUser();
  if (recordsCache) return recordsCache;
  if (!recordsPromise) {
    recordsPromise = (async () => {
      const rows = await sbGet('records', { 'user_id': 'eq.' + currentUserId, 'select': '*' });
      if (Array.isArray(rows) && rows.length > 0) {
        return setRecordsCache(rows);
      }
      return setRecordsCache(getDataLegacy());
    })();
  }
  return recordsPromise;
}
async function getRecord(dateStr) {
  const normalizedDate = normalizeDateKey(dateStr);
  ensureDataCacheUser();
  if (recordsMapCache) return recordsMapCache.get(normalizedDate) || null;
  const rows = await getData();
  return Array.isArray(rows) ? (recordsMapCache?.get(normalizedDate) || null) : null;
}
async function setData(arr) {
  // 危险操作：批量替换，建议改用 saveRecordDB 单条保存
  console.warn('setData: 批量替换数据，可能导致数据丢失');
  await sbDelete('records', { user_id: currentUserId });
  for (const item of arr) {
    await sbUpsert('records', { ...item, user_id: currentUserId });
  }
}
async function getConfig() {
  if (configCache) return configCache;
  const rows = await sbGet('config', { 'user_id': 'eq.' + currentUserId, 'select': '*' });
  configCache = (rows && rows[0]) ? (rows[0].value || {}) : getConfigLegacy();
  return configCache;
}
async function setConfig(cfg) {
  return setConfigForUser(currentUserId, cfg);
}

function normalizeDateKey(dateStr) {
  return String(dateStr || '').trim().slice(0, 10);
}

function getTodayDateKey() {
  return new Date().toLocaleDateString('en-CA');
}

function getSlotHourRange(slotName) {
  if (slotName === 'morning') return { start: 0, end: 12 };
  if (slotName === 'afternoon') return { start: 12, end: 18 };
  return { start: 18, end: 24 };
}

function getSlotDisplayValue(slot = {}) {
  return {
    note: slot.note || '',
    autoSummary: slot.autoSummary || '',
    mood: slot.mood || 5,
    energy: slot.energy || 5,
    focus: slot.focus || 5,
    social: slot.social || 5,
    appetite: slot.appetite || 5,
    chips: Array.isArray(slot.chips) ? slot.chips : []
  };
}

function getRecordMeta(record = {}) {
  const meta = record?.slots?.__meta;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
}

function getRecordTodos(record = {}) {
  if (Array.isArray(record?.todos)) return normalizeTodoItems(record.todos);
  return normalizeTodoItems(getRecordMeta(record).todos || []);
}

function hydrateRecordExtras(record) {
  if (!record || typeof record !== 'object') return record;
  const meta = getRecordMeta(record);
  return {
    ...record,
    manualPhaseOverride: String(record.manualPhaseOverride || meta.manualPhaseOverride || '').trim(),
    todos: getRecordTodos(record)
  };
}

function serializeRecordForCloud(record = {}) {
  if (!record || typeof record !== 'object') return record;
  const slots = { ...(record.slots || {}) };
  const nextMeta = {
    ...(slots.__meta && typeof slots.__meta === 'object' ? slots.__meta : {})
  };
  const manualPhaseOverride = String(record.manualPhaseOverride || '').trim();
  const todos = normalizeTodoItems(record.todos || []);
  if (manualPhaseOverride) nextMeta.manualPhaseOverride = manualPhaseOverride;
  else delete nextMeta.manualPhaseOverride;
  if (todos.length) nextMeta.todos = todos;
  else delete nextMeta.todos;
  if (Object.keys(nextMeta).length > 0) slots.__meta = nextMeta;
  else delete slots.__meta;
  const serialized = {
    ...record,
    slots
  };
  delete serialized.manualPhaseOverride;
  delete serialized.todos;
  return serialized;
}

function getDisplayedSummaryText(slot = {}) {
  return slot.note || slot.autoSummary || '';
}

function getEffectiveNoteValue() {
  const noteEl = document.getElementById('rec-note');
  if (!noteEl) return '';
  const raw = noteEl.value || '';
  const autoSummaryText = noteEl.dataset.autoSummaryText || '';
  return autoSummaryText && raw === autoSummaryText ? '' : raw;
}

function setSummaryMeta(slot = {}) {
  const metaEl = document.getElementById('rec-summary-meta');
  const noteEl = document.getElementById('rec-note');
  if (!metaEl || !noteEl) return;
  metaEl.classList.remove('auto');
  if (slot.note) {
    metaEl.textContent = '这是你当前时段的手动 summary，你可以随时继续修改。';
    noteEl.dataset.autoSummaryText = '';
    return;
  }
  if (slot.autoSummary) {
    metaEl.textContent = `已自动整理 ${TIME_SLOTS[currentTimeSlot]?.name || currentTimeSlot} 的内容，你可以在此基础上继续编辑。`;
    metaEl.classList.add('auto');
    noteEl.dataset.autoSummaryText = slot.autoSummary;
    return;
  }
  metaEl.textContent = '这个时段的重要内容会在到点后自动整理，你也可以继续手动修改。';
  noteEl.dataset.autoSummaryText = '';
}

function filterConversationMessagesBySlot(messages = [], slotName) {
  const range = getSlotHourRange(slotName);
  return (Array.isArray(messages) ? messages : []).filter(message => {
    if (message.slot && message.slot === slotName) return true;
    if (!message.created_at) return false;
    const date = new Date(message.created_at);
    if (Number.isNaN(date.getTime())) return false;
    const hour = date.getHours();
    return hour >= range.start && hour < range.end;
  });
}

function getSlotSummarySourceSignature(slot = {}, messages = []) {
  return JSON.stringify({
    note: slot.note || '',
    mood: slot.mood || 5,
    energy: slot.energy || 5,
    focus: slot.focus || 5,
    social: slot.social || 5,
    appetite: slot.appetite || 5,
    chips: Array.isArray(slot.chips) ? slot.chips : [],
    messages: (Array.isArray(messages) ? messages : []).map(msg => ({
      role: msg.role,
      content: String(msg.content || '').slice(0, 240),
      created_at: msg.created_at || '',
      slot: msg.slot || ''
    }))
  });
}

async function getConversationRows() {
  ensureDataCacheUser();
  if (conversationRowsCache) return conversationRowsCache;
  if (!conversationRowsPromise) {
    conversationRowsPromise = (async () => {
      const rows = await sbGet('conversations', { 'user_id': 'eq.' + currentUserId, 'select': 'date' });
      return setConversationRowsCache(rows);
    })();
  }
  return conversationRowsPromise;
}

async function getConversationDateSet() {
  ensureDataCacheUser();
  if (conversationDateSetCache) return conversationDateSetCache;
  const rows = await getConversationRows();
  if (!conversationDateSetCache) {
    conversationDateSetCache = new Set(rows.map(row => normalizeDateKey(row.date)).filter(Boolean));
  }
  return conversationDateSetCache;
}

async function getLatestRecordDate() {
  const rows = await getData();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[rows.length - 1]?.date || null;
}

async function getLatestActivityDate() {
  const [records, conversations] = await Promise.all([getData(), getConversationRows()]);
  const dates = [
    ...(Array.isArray(records) ? records.map(row => normalizeDateKey(row.date)) : []),
    ...(Array.isArray(conversations) ? conversations.map(row => normalizeDateKey(row.date)) : [])
  ].filter(Boolean);
  if (dates.length === 0) return null;
  return dates.sort().slice(-1)[0];
}

async function syncSelectedDateToAvailableRecord() {
  const selectedDate = normalizeDateKey(rState.selected);
  const [selectedRecord, conversationDates] = await Promise.all([
    getRecord(selectedDate),
    getConversationDateSet()
  ]);
  if (selectedRecord || conversationDates.has(selectedDate)) {
    rState.selected = selectedDate;
    return rState.selected;
  }
  const latestDate = await getLatestActivityDate();
  if (latestDate) {
    rState.selected = latestDate;
  } else {
    rState.selected = selectedDate;
  }
  return rState.selected;
}
function getPendingSyncKey(userId = currentUserId) {
  return `${userId}_smc_pending_sync_v1`;
}

function readPendingSyncQueue(userId = currentUserId) {
  try {
    const queue = JSON.parse(localStorage.getItem(getPendingSyncKey(userId)) || '[]');
    return Array.isArray(queue) ? queue : [];
  } catch (e) {
    console.warn('读取待同步队列失败:', userId, e);
    return [];
  }
}

function writePendingSyncQueue(queue, userId = currentUserId) {
  localStorage.setItem(getPendingSyncKey(userId), JSON.stringify(Array.isArray(queue) ? queue : []));
}

function enqueuePendingSync(item, userId = currentUserId) {
  const queue = readPendingSyncQueue(userId);
  const dedupeKey = item?.dedupeKey;
  const nextQueue = dedupeKey ? queue.filter(entry => entry.dedupeKey !== dedupeKey) : queue;
  nextQueue.push({
    ...item,
    queuedAt: new Date().toISOString()
  });
  writePendingSyncQueue(nextQueue, userId);
}

async function persistRecordToCloud(record) {
  return await sbUpsert('records', serializeRecordForCloud(record));
}

async function persistConversationToCloud(userId, dateStr, messages, summary = null) {
  await sbDelete('conversations', { user_id: userId, date: dateStr });
  return await sbUpsert('conversations', {
    user_id: userId,
    date: dateStr,
    messages: Array.isArray(messages) ? messages : [],
    summary
  });
}

let pendingSyncInFlight = false;

async function flushPendingSyncQueue(userId = currentUserId) {
  if (pendingSyncInFlight) return;
  const queue = readPendingSyncQueue(userId);
  if (!queue.length) return;
  pendingSyncInFlight = true;
  try {
    const remaining = [];
    for (const item of queue) {
      try {
        if (item.type === 'record') {
          const ok = await persistRecordToCloud({ ...(item.payload || {}), user_id: item.userId || userId });
          if (!ok) throw new Error('record sync failed');
        } else if (item.type === 'conversation') {
          const ok = await persistConversationToCloud(
            item.userId || userId,
            item.payload?.date,
            item.payload?.messages || [],
            item.payload?.summary || null
          );
          if (!ok) throw new Error('conversation sync failed');
        } else {
          remaining.push(item);
        }
      } catch (e) {
        remaining.push(item);
      }
    }
    writePendingSyncQueue(remaining, userId);
  } finally {
    pendingSyncInFlight = false;
  }
}

async function saveRecordDB(record, userId = (record && record.user_id) || currentUserId) {
  const normalizedRecord = hydrateRecordExtras({ ...record, user_id: userId });
  localStorage.setItem(userId + '_smc_record_' + normalizedRecord.date, JSON.stringify(normalizedRecord));
  const allData = getDataLegacyByUser(userId);
  const idx = allData.findIndex(d => d.date === normalizedRecord.date);
  if (idx >= 0) {
    allData[idx] = normalizedRecord;
  } else {
    allData.push(normalizedRecord);
  }
  setDataLegacyByUser(userId, allData);
  if (userId === currentUserId) {
    upsertRecordCache(normalizedRecord);
  }

  // 尝试Supabase
  const result = await persistRecordToCloud(normalizedRecord);
  if (!result) {
    console.warn('Supabase保存失败，降级到localStorage');
    enqueuePendingSync({
      type: 'record',
      userId,
      dedupeKey: `record:${userId}:${normalizedRecord.date}`,
      payload: normalizedRecord
    }, userId);
    return 'local'; // 返回local表示使用了本地存储
  }
  await flushPendingSyncQueue(userId);
  return 'supabase';
}
async function getAIConversation(dateStr) {
  const normalizedDate = normalizeDateKey(dateStr);
  ensureDataCacheUser();
  if (conversationCache.has(normalizedDate)) {
    return conversationCache.get(normalizedDate);
  }
  if (conversationPromiseCache.has(normalizedDate)) {
    return conversationPromiseCache.get(normalizedDate);
  }
  const backupKey = `${currentUserId}_smc_conversation_${normalizedDate}`;
  const request = (async () => {
    const rows = await sbGet('conversations', { 'user_id': 'eq.' + currentUserId, 'date': 'eq.' + normalizedDate, 'select': '*' });
    if (!rows || !rows[0]) {
      try {
        const backup = JSON.parse(localStorage.getItem(backupKey) || 'null');
        if (backup && Array.isArray(backup.messages)) {
          const payload = {
            messages: backup.messages,
            summary: backup.summary || null
          };
          setConversationCache(normalizedDate, payload);
          return payload;
        }
      } catch (e) {
        console.warn('读取本地对话备份失败:', backupKey, e);
      }
      const emptyPayload = { messages: [], summary: null };
      setConversationCache(normalizedDate, emptyPayload);
      return emptyPayload;
    }
    const payload = {
      messages: rows[0].messages || [],
      summary: rows[0].summary || null
    };
    try {
      localStorage.setItem(backupKey, JSON.stringify({
        messages: payload.messages,
        summary: payload.summary,
        synced_at: new Date().toISOString()
      }));
    } catch (e) {
      console.warn('缓存云端对话到本地失败:', backupKey, e);
    }
    setConversationCache(normalizedDate, payload);
    return payload;
  })();
  conversationPromiseCache.set(normalizedDate, request);
  try {
    return await request;
  } finally {
    conversationPromiseCache.delete(normalizedDate);
  }
}
async function saveAIConversation(dateStr, messages, summary = null) {
  const normalizedDate = normalizeDateKey(dateStr);
  const backupKey = `${currentUserId}_smc_conversation_${normalizedDate}`;
  try {
    localStorage.setItem(backupKey, JSON.stringify({
      messages: Array.isArray(messages) ? messages : [],
      summary,
      saved_at: new Date().toISOString()
    }));
  } catch (e) {
    console.warn('写入本地对话备份失败:', backupKey, e);
  }
  setConversationCache(normalizedDate, {
    messages: Array.isArray(messages) ? messages : [],
    summary
  });

  const ok = await persistConversationToCloud(currentUserId, normalizedDate, messages, summary);
  if (!ok) {
    enqueuePendingSync({
      type: 'conversation',
      userId: currentUserId,
      dedupeKey: `conversation:${currentUserId}:${normalizedDate}`,
      payload: {
        date: normalizedDate,
        messages: Array.isArray(messages) ? messages : [],
        summary
      }
    }, currentUserId);
    throw new Error('AI对话保存到云端失败，已保留本地备份并加入重试队列');
  }
  await flushPendingSyncQueue(currentUserId);
  return 'supabase';
}

// 生成对话摘要（用于中期记忆）
async function generateConversationSummary(messages) {
  if (!messages || messages.length < 3) return null;

  // 只取用户和AI的对话内容，不取系统消息
  const dialogContent = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.substring(0, 500)}`)
    .join('\n');

  try {
    const response = await apiRequest('/ai-chat', {
      method: 'POST',
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: [
          {
            role: 'user',
            content: `请为以下对话生成100-200字的摘要，包含：
1. 用户主要话题和情绪状态
2. 给出的建议或帮助
3. 是否需要后续跟进

对话内容：
${dialogContent}

摘要格式：
[摘要]话题：...|情绪：...|建议：...|跟进：...`
          }
        ],
        stream: false
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const reply = data.reply || data.choices?.[0]?.message?.content || '';

    // 提取摘要内容（去掉thinking标签）
    const summaryMatch = reply.match(/\[摘要\](.*)/s);
    return summaryMatch ? summaryMatch[1].trim() : reply.substring(0, 200);
  } catch (e) {
    console.warn('生成对话摘要失败:', e);
    return null;
  }
}

function buildSummaryFallback(slotName, slot = {}, messages = []) {
  const slotLabel = TIME_SLOTS[slotName]?.name || slotName;
  const parts = [];
  if (slot.note) {
    parts.push(`${slotLabel}主要记录了：${slot.note}`);
  }
  if (Array.isArray(slot.chips) && slot.chips.length > 0) {
    parts.push(`关键词包括${slot.chips.join('、')}`);
  }
  const scoreBits = [];
  if (slot.mood) scoreBits.push(`心情 ${slot.mood}`);
  if (slot.energy) scoreBits.push(`能量 ${slot.energy}`);
  if (slot.focus) scoreBits.push(`专注 ${slot.focus}`);
  if (slot.social) scoreBits.push(`社交 ${slot.social}`);
  if (slot.appetite) scoreBits.push(`食欲 ${slot.appetite}`);
  if (scoreBits.length > 0) {
    parts.push(`状态上大致是 ${scoreBits.join('，')}`);
  }
  const userMessages = messages.filter(message => message.role === 'user').map(message => message.content).filter(Boolean);
  if (userMessages.length > 0) {
    parts.push(`这一时段也和 AI 聊到了 ${userMessages[0].slice(0, 40)}`);
  }
  return parts.join('；').slice(0, 160);
}

async function generateTimeSlotSummary(dateStr, slotName, slot = {}, messages = []) {
  const meaningfulMessages = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => `${message.role === 'user' ? '用户' : 'AI'}：${String(message.content || '').slice(0, 240)}`)
    .join('\n');
  const slotLabel = TIME_SLOTS[slotName]?.name || slotName;
  const payloadText = [
    `日期：${dateStr}`,
    `时段：${slotLabel}`,
    slot.note ? `用户手动记录：${slot.note}` : '',
    Array.isArray(slot.chips) && slot.chips.length ? `标签：${slot.chips.join('、')}` : '',
    `状态：心情${slot.mood || 5}，能量${slot.energy || 5}，专注${slot.focus || 5}，社交${slot.social || 5}，食欲${slot.appetite || 5}`,
    meaningfulMessages ? `AI 对话摘录：\n${meaningfulMessages}` : ''
  ].filter(Boolean).join('\n');

  try {
    const cfg = configCache || await getConfig();
    const response = await apiRequest('/ai-chat', {
      method: 'POST',
      body: JSON.stringify({
        model: cfg.model || 'MiniMax-M2.7',
        stream: false,
        messages: [{
          role: 'user',
          content: `请根据以下信息，为用户写一段 60-120 字的中文时段 summary。\n要求：\n1. 自然、简洁、像产品里的总结文案\n2. 不要分点，不要使用“你今天”这种强引导语气\n3. 不要输出评分格式\n4. 如果信息不足，就保守概括，不要虚构\n\n${payloadText}`
        }]
      })
    });
    if (!response.ok) {
      return buildSummaryFallback(slotName, slot, messages);
    }
    const data = await response.json();
    const reply = (data.reply || data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return reply || buildSummaryFallback(slotName, slot, messages);
  } catch (e) {
    console.warn('生成时段 summary 失败:', dateStr, slotName, e);
    return buildSummaryFallback(slotName, slot, messages);
  }
}

async function maybeGenerateAutoSummaryForSlot(dateStr, slotName) {
  const normalizedDate = normalizeDateKey(dateStr);
  const record = await getRecordWithDrafts(normalizedDate);
  if (!record || !record.slots || !record.slots[slotName]) return false;
  const slot = record.slots[slotName] || {};
  const conv = await getAIConversation(normalizedDate);
  const slotMessages = filterConversationMessagesBySlot(conv.messages || [], slotName);
  const hasContent = Boolean(
    slot.note ||
    slot.saved_at ||
    (Array.isArray(slot.chips) && slot.chips.length > 0) ||
    slotMessages.length > 0
  );
  if (!hasContent) return false;

  const sourceSignature = getSlotSummarySourceSignature(slot, slotMessages);
  const latestActivityAt = [
    slot.saved_at || '',
    ...slotMessages.map(message => message.created_at || '')
  ].filter(Boolean).sort().slice(-1)[0] || '';

  if (slot.autoSummary && slot.autoSummarySource === sourceSignature && slot.autoSummaryGeneratedAt && (!latestActivityAt || slot.autoSummaryGeneratedAt >= latestActivityAt)) {
    return false;
  }

  const summary = await generateTimeSlotSummary(normalizedDate, slotName, getSlotDisplayValue(slot), slotMessages);
  if (!summary) return false;

  const nextRecord = {
    ...(record || {}),
    date: normalizedDate,
    user_id: (record && record.user_id) || currentUserId,
    slots: {
      ...(record.slots || {}),
      [slotName]: {
        ...slot,
        autoSummary: summary,
        autoSummarySource: sourceSignature,
        autoSummaryGeneratedAt: new Date().toISOString()
      }
    }
  };
  const result = await saveRecordDB(nextRecord);
  if (result !== 'supabase') return false;

  if (currentRecDate === normalizedDate && currentTimeSlot === slotName) {
    const noteEl = document.getElementById('rec-note');
    if (noteEl && !getEffectiveNoteValue()) {
      noteEl.value = summary;
      setSummaryMeta(nextRecord.slots[slotName]);
    }
  }
  return true;
}

async function runScheduledAutoSummaries() {
  if (autoSummaryInFlight) return;
  autoSummaryInFlight = true;
  try {
    const today = getTodayDateKey();
    const now = new Date();
    for (const schedule of AUTO_SUMMARY_SCHEDULE) {
      if (now.getHours() < schedule.triggerHour) continue;
      await maybeGenerateAutoSummaryForSlot(today, schedule.slot);
    }
  } finally {
    autoSummaryInFlight = false;
  }
}

function queueAutoSummaryCheck(delay = 0) {
  if (autoSummaryTimer) clearTimeout(autoSummaryTimer);
  autoSummaryTimer = setTimeout(() => {
    runScheduledAutoSummaries();
  }, delay);
}

// 获取昨日对话摘要（中期记忆）
async function getYesterdaySummary() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  const conv = await getAIConversation(dateStr);
  if (conv.messages && conv.messages.length > 0) {
    // 如果已有摘要就直接返回，否则生成一个
    if (conv.summary) return conv.summary;

    // 对话超过3轮则生成摘要
    if (conv.messages.length >= 3) {
      const summary = await generateConversationSummary(conv.messages);
      if (summary) {
        // 保存生成的摘要
        await saveAIConversation(dateStr, conv.messages, summary);
        return summary;
      }
    }
  }
  return null;
}
async function getMemory(key) {
  const rows = await sbGet('memory', { 'user_id': 'eq.' + currentUserId, 'key': 'eq.' + key, 'select': '*' });
  return (rows && rows[0]) ? (rows[0].value || '') : '';
}
async function setMemory(key, value) {
  await sbUpsert('memory', { user_id: currentUserId, key, value });
}

// 导出数据
async function exportData() {
  const records = await getData();
  const convData = await sbGet('conversations', { 'user_id': 'eq.' + currentUserId, 'select': '*' });
  const config = await getConfig();
  const memory = await getMemory('longterm');
  
  const data = {
    exportTime: new Date().toISOString(),
    version: '1.0',
    records,
    conversations: Array.isArray(convData) ? convData : [],
    config,
    memory
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'surf-my-cycle-backup-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// 导入数据
async function importData(jsonStr) {
  const data = JSON.parse(jsonStr);
  if (data.records) await setData(data.records);
  if (data.conversations) {
    for (const item of data.conversations) {
      await saveAIConversation(item.date, item.messages);
    }
  }
  if (data.config) await setConfig(data.config);
  if (data.memory) await setMemory('longterm', data.memory);
  return true;
}

// 兼容旧版localStorage（迁移用）
function getDataLegacy() { 
  try { 
    return JSON.parse(localStorage.getItem(currentUserId + '_smc_data') || '[]'); 
  } catch(e) { return []; } 
}
function getConfigLegacy() { 
  try { 
    return JSON.parse(localStorage.getItem(currentUserId + '_smc_config') || '{}'); 
  } catch(e) { return {}; } 
}
function getRecordLegacy(dateStr) { return getDataLegacy().find(d => d.date === dateStr) || null; }

// 从旧IndexedDB读取数据（迁移用）
function readFromIndexedDB() {
  return new Promise(resolve => {
    const result = { records: [], config: {} };
    try {
      const req = indexedDB.open('surf-my-cycle', 1);
      req.onerror = () => resolve(result);
      req.onupgradeneeded = () => resolve(result); // DB不存在
      req.onsuccess = e => {
        const db = e.target.result;
        const stores = Array.from(db.objectStoreNames);
        if (!stores.includes('records')) { db.close(); resolve(result); return; }
        const tx = db.transaction(['records', 'config'], 'readonly');
        const recReq = tx.objectStore('records').getAll();
        recReq.onsuccess = re => { result.records = re.target.result || []; };
        const cfgReq = tx.objectStore('config').get('settings');
        cfgReq.onsuccess = ce => { result.config = (ce.target.result && ce.target.result.value) || {}; };
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onerror = () => { db.close(); resolve(result); };
      };
    } catch(e) { resolve(result); }
  });
}

/* ============================================================
 * 🧩 模块3: 周期计算 (CYCLE_MATH)
 * 周期天数计算、阶段判断
 * ============================================================ */

async function getCycleDay(dateStr) {
  if (!configCache) configCache = await getConfig();
  const cfg = configCache;
  if (!cfg.lastPeriod) return null;
  const last = new Date(cfg.lastPeriod + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  const cycleLen = cfg.cycleLen || 28;
  let diff = Math.round((target - last) / 86400000);
  if (diff < 0) diff = ((diff % cycleLen) + cycleLen) % cycleLen;
  return (diff % cycleLen) + 1;
}

function getPhase(day) {
  if (!day) return null;
  if (day >= 1 && day <= 5) return { name:'月经期', color:'#e74c3c', tip:'雌孕激素低谷，身体修复中，允许自己休息' };
  if (day >= 6 && day <= 13) return { name:'卵泡期', color:'#f39c12', tip:'雌激素逐渐上升，精力和专注力开始回升' };
  if (day >= 14 && day <= 16) return { name:'排卵期', color:'#e91e63', tip:'雌激素+雄激素高峰，性欲和创造力峰值，状态最佳' };
  if (day >= 17 && day <= 21) return { name:'黄体期早期', color:'#9b59b6', tip:'孕激素升高，适合细致整理类工作' };
  if (day >= 22 && day <= 28) return { name:'黄体期晚期', color:'#7d3c98', tip:'雌激素下降期，易疲劳情绪波动，对自己温柔点' };
  return null;
}

function getPhaseFamilyName(phaseName = '') {
  if (!phaseName) return '';
  if (phaseName.includes('黄体期')) return '黄体期';
  return phaseName;
}

function getManualPhaseOverrideValue(record = {}) {
  const value = String(record?.manualPhaseOverride || getRecordMeta(record).manualPhaseOverride || '').trim();
  return ['月经期', '卵泡期', '排卵期', '黄体期'].includes(value) ? value : '';
}

function getEffectivePhaseState(cycleDay, record = {}) {
  const predictedPhase = getPhase(cycleDay);
  const manualPhaseOverride = getManualPhaseOverrideValue(record);
  return {
    cycleDay,
    predictedPhase,
    predictedPhaseName: getPhaseFamilyName(predictedPhase?.name || ''),
    manualPhaseOverride,
    effectivePhaseName: manualPhaseOverride || getPhaseFamilyName(predictedPhase?.name || ''),
    hasManualOverride: Boolean(manualPhaseOverride)
  };
}

const rState = { 
  year: new Date().getFullYear(), 
  month: new Date().getMonth(), 
  selected: new Date().toLocaleDateString('en-CA')
};
let currentTimeSlot = 'morning';

/* ============================================================
 * 🧩 模块4: UI渲染 (UI_RENDER)
 * 日历渲染、记录面板、页面切换
 * ============================================================ */

async function renderCalendar(gridId, titleId, state, onClickDay) {
  const grid = document.getElementById(gridId);
  const title = document.getElementById(titleId);
  if (!grid || !title) return;

  const { year, month } = state;
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  title.textContent = year + '年 ' + monthNames[month];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toLocaleDateString('en-CA');
  const [data, conversationDateSet] = await Promise.all([getData(), getConversationDateSet()]);
  const recordMap = recordsMapCache || new Map((Array.isArray(data) ? data : []).map(row => [row.date, row]));

  let html = '';
  ['日','一','二','三','四','五','六'].forEach(d => { html += '<div class="cal-head">' + d + '</div>'; });

  const prevDays = new Date(year, month, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    html += '<div class="cal-day other-month"><span>' + (prevDays - i) + '</span></div>';
  }

  const phaseNames = ['月经期','卵泡期','排卵期','黄体期'];
  const phaseColors = ['#e74c3c','#f39c12','#e91e63','#9b59b6'];
  
  // 预先获取配置以避免循环中多次调用
  let cfg = configCache;
  if (!cfg) {
    cfg = await getConfig();
    configCache = cfg;
  }
  
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const rec = recordMap.get(ds);
    
    // 同步计算cycleDay
    let cycleDay = null;
    if (cfg.lastPeriod) {
      const last = new Date(cfg.lastPeriod + 'T00:00:00');
      const target = new Date(ds + 'T00:00:00');
      const cycleLen = cfg.cycleLen || 28;
      let diff = Math.round((target - last) / 86400000);
      if (diff < 0) diff = ((diff % cycleLen) + cycleLen) % cycleLen;
      cycleDay = (diff % cycleLen) + 1;
    }
    
    const phase = getPhase(cycleDay);

    let cls = 'cal-day';
    if (ds === today) cls += ' today';
    const hasRecordData = rec && rec.slots && Object.keys(rec.slots).length > 0;
    const hasConversation = conversationDateSet.has(ds);
    if (hasRecordData) cls += ' has-data';
    if (hasConversation) cls += ' has-ai-chat';
    if (state.selected === ds) cls += ' selected';
    
    // 添加周期阶段背景色类名
    if (phase) {
      const phaseClassMap = {
        '月经期': 'phase-menstrual',
        '卵泡期': 'phase-follicular',
        '排卵期': 'phase-ovulation',
        '黄体期': 'phase-luteal'
      };
      cls += ' ' + phaseClassMap[phase.name];
    }

    let dots = '';
    if (rec && rec.slots) {
      const emojis = [];
      Object.keys(rec.slots).forEach(slot => {
        if (rec.slots[slot] && rec.slots[slot].mood) {
          const emoji = slot === 'morning' ? '🌅' : slot === 'afternoon' ? '☀️' : slot === 'evening' ? '🌙' : '●';
          emojis.push(emoji);
        }
      });
      if (emojis.length > 0) {
        dots = '<div class="time-emoji-row">' + emojis.map(e => '<span class="time-emoji">' + e + '</span>').join('') + '</div>';
      }
    }
    if (hasConversation) {
      dots += '<div class="ai-dot" title="这一天有AI对话">💬</div>';
    }
    html += '<div class="' + cls + '" data-date="' + ds + '">' + dots + '<span>' + d + '</span></div>';
  }

  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    html += '<div class="cal-day other-month"><span>' + d + '</span></div>';
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      persistCurrentFormDraft();
      const ds = el.getAttribute('data-date');
      state.selected = ds;
      renderCalendar(gridId, titleId, state, onClickDay);
      onClickDay(ds);
    });
  });
}

function prevMonth(which) {
  const s = rState;
  s.month--;
  if (s.month < 0) { s.month = 11; s.year--; }
  renderCalendar('r-grid','r-month-title', rState, loadRecordPanel);
}
function nextMonth(which) {
  const s = rState;
  s.month++;
  if (s.month > 11) { s.month = 0; s.year++; }
  renderCalendar('r-grid','r-month-title', rState, loadRecordPanel);
}

let currentRecDate = null;
let userManuallySelectedSlot = false;
let recordAutosaveTimer = null;
let recordSaveInFlight = false;
let recordPendingAutosave = false;
let isHydratingRecordPanel = false;

function getRecordDraftKey(dateStr = currentRecDate, slotName = currentTimeSlot, userId = currentUserId) {
  return `${userId}_smc_draft_${normalizeDateKey(dateStr)}_${slotName}`;
}

function readRecordDraft(dateStr = currentRecDate, slotName = currentTimeSlot, userId = currentUserId) {
  try {
    return JSON.parse(localStorage.getItem(getRecordDraftKey(dateStr, slotName, userId)) || 'null');
  } catch (e) {
    console.warn('读取记录草稿失败:', dateStr, slotName, e);
    return null;
  }
}

function writeRecordDraft(dateStr = currentRecDate, slotName = currentTimeSlot, draft = {}, userId = currentUserId) {
  try {
    localStorage.setItem(getRecordDraftKey(dateStr, slotName, userId), JSON.stringify({
      ...draft,
      updatedAt: new Date().toISOString()
    }));
  } catch (e) {
    console.warn('写入记录草稿失败:', dateStr, slotName, e);
  }
}

function clearRecordDraftsForDate(dateStr = currentRecDate, userId = currentUserId) {
  const normalizedDate = normalizeDateKey(dateStr);
  Object.keys(TIME_SLOTS).forEach(slotName => {
    localStorage.removeItem(getRecordDraftKey(normalizedDate, slotName, userId));
  });
}

function collectCurrentSlotFormState() {
  return {
    note: getEffectiveNoteValue(),
    mood: parseInt(document.getElementById('s-mood')?.value || '5', 10) || 5,
    energy: parseInt(document.getElementById('s-energy')?.value || '5', 10) || 5,
    focus: parseInt(document.getElementById('s-focus')?.value || '5', 10) || 5,
    social: parseInt(document.getElementById('s-social')?.value || '5', 10) || 5,
    appetite: parseInt(document.getElementById('s-appetite')?.value || '5', 10) || 5,
    chips: Array.from(document.querySelectorAll('#rec-form .chip.on')).map(el => el.textContent),
    saved_at: new Date().toISOString()
  };
}

function collectCurrentRecordDraft() {
  return {
    slotData: collectCurrentSlotFormState(),
    period: document.getElementById('rec-period')?.value || '',
    manualPhaseOverride: document.getElementById('phase-override-options')?.dataset.selectedPhase || '',
    todos: collectTodoItemsFromUI()
  };
}

function mergeDraftsIntoRecord(record, dateStr) {
  const normalizedDate = normalizeDateKey(dateStr);
  const merged = {
    ...(record || {}),
    date: normalizedDate,
    user_id: (record && record.user_id) || currentUserId,
    slots: { ...((record && record.slots) || {}) }
  };

  let latestPeriodStamp = '';
  let latestManualPhaseStamp = '';
  Object.keys(TIME_SLOTS).forEach(slotName => {
    const draft = readRecordDraft(normalizedDate, slotName);
    if (!draft) return;
    if (draft.slotData) {
      merged.slots[slotName] = {
        ...(merged.slots[slotName] || {}),
        ...draft.slotData
      };
    }
    if (typeof draft.period === 'string' && draft.updatedAt && draft.updatedAt >= latestPeriodStamp) {
      merged.period = draft.period;
      latestPeriodStamp = draft.updatedAt;
    }
    if (typeof draft.manualPhaseOverride === 'string' && draft.updatedAt && draft.updatedAt >= latestManualPhaseStamp) {
      merged.manualPhaseOverride = draft.manualPhaseOverride;
      latestManualPhaseStamp = draft.updatedAt;
    }
    if (Array.isArray(draft.todos) && draft.updatedAt) {
      merged.todos = draft.todos;
    }
  });

  return merged;
}

async function getRecordWithDrafts(dateStr) {
  const normalizedDate = normalizeDateKey(dateStr);
  const record = await getRecord(normalizedDate);
  return hydrateRecordExtras(mergeDraftsIntoRecord(record, normalizedDate));
}

function setRecordSaveStatus(text, state = '') {
  const el = document.getElementById('record-save-status');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('saving', 'saved', 'error');
  if (state) el.classList.add(state);
}

function persistCurrentFormDraft() {
  if (!currentRecDate) return;
  writeRecordDraft(currentRecDate, currentTimeSlot, collectCurrentRecordDraft());
}

async function flushRecordAutosave(reason = 'autosave') {
  if (!currentRecDate || recordSaveInFlight) {
    if (recordSaveInFlight) recordPendingAutosave = true;
    return;
  }
  recordSaveInFlight = true;
  setRecordSaveStatus(reason === 'manual' ? '正在保存...' : '正在自动保存...', 'saving');
  try {
    await saveRecord({ silent: true, skipDraftWrite: true });
    setRecordSaveStatus(reason === 'manual' ? '已保存到云端' : '已自动保存', 'saved');
  } catch (e) {
    console.error('自动保存失败:', e);
    setRecordSaveStatus('云端保存失败，已保留本地草稿', 'error');
  } finally {
    recordSaveInFlight = false;
    if (recordPendingAutosave) {
      recordPendingAutosave = false;
      flushRecordAutosave('autosave');
    }
  }
}

function scheduleRecordAutosave(reason = 'field-change') {
  if (isHydratingRecordPanel || !currentRecDate) return;
  persistCurrentFormDraft();
  setRecordSaveStatus('草稿已保存，等待同步...', 'saving');
  if (recordAutosaveTimer) clearTimeout(recordAutosaveTimer);
  recordAutosaveTimer = setTimeout(() => flushRecordAutosave(reason), 800);
}

function setupRecordFieldAutosave() {
  const ids = ['rec-note', 'rec-period', 's-mood', 's-energy', 's-focus', 's-social', 's-appetite'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.dataset.autosaveBound === '1') return;
    const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, () => scheduleRecordAutosave(id));
    if (eventName !== 'change') {
      el.addEventListener('change', () => scheduleRecordAutosave(id + '-change'));
    }
    el.dataset.autosaveBound = '1';
  });
}

function renderManualPhaseOverrideUI(phaseState) {
  const descEl = document.getElementById('phase-override-desc');
  const predictedEl = document.getElementById('predicted-phase-pill');
  const effectiveEl = document.getElementById('effective-phase-pill');
  const optionsEl = document.getElementById('phase-override-options');
  const resetEl = document.getElementById('phase-override-reset');
  if (!descEl || !predictedEl || !effectiveEl || !optionsEl || !resetEl) return;

  const predictedName = phaseState.predictedPhaseName || '未计算';
  predictedEl.textContent = `系统预测：${predictedName}`;
  effectiveEl.textContent = `当前使用：${phaseState.effectivePhaseName || predictedName}`;
  optionsEl.dataset.selectedPhase = phaseState.manualPhaseOverride || '';
  descEl.textContent = phaseState.hasManualOverride
    ? `你今天手动标记为${phaseState.manualPhaseOverride}，AI 和页面建议会优先参考你的体感。`
    : '系统会先给预测，你也可以按自己的体感调整。';
  resetEl.style.display = phaseState.hasManualOverride ? 'inline-block' : 'none';
  document.querySelectorAll('.phase-option').forEach(button => {
    button.classList.toggle('selected', button.dataset.phase === phaseState.manualPhaseOverride);
  });
}

function selectManualPhaseOverride(phaseName) {
  const optionsEl = document.getElementById('phase-override-options');
  if (!optionsEl) return;
  optionsEl.dataset.selectedPhase = phaseName;
  document.querySelectorAll('.phase-option').forEach(button => {
    button.classList.toggle('selected', button.dataset.phase === phaseName);
  });
  const predictedText = document.getElementById('predicted-phase-pill')?.textContent.replace('系统预测：', '').trim() || '未计算';
  const effectiveEl = document.getElementById('effective-phase-pill');
  const descEl = document.getElementById('phase-override-desc');
  const resetEl = document.getElementById('phase-override-reset');
  if (effectiveEl) effectiveEl.textContent = `当前使用：${phaseName || predictedText}`;
  if (descEl) descEl.textContent = `你今天手动标记为${phaseName}，AI 和页面建议会优先参考你的体感。`;
  if (resetEl) resetEl.style.display = 'inline-block';
  scheduleRecordAutosave('manual-phase');
}

function clearManualPhaseOverride() {
  const optionsEl = document.getElementById('phase-override-options');
  if (!optionsEl) return;
  optionsEl.dataset.selectedPhase = '';
  document.querySelectorAll('.phase-option').forEach(button => {
    button.classList.remove('selected');
  });
  const predictedText = document.getElementById('predicted-phase-pill')?.textContent.replace('系统预测：', '').trim() || '未计算';
  const effectiveEl = document.getElementById('effective-phase-pill');
  const descEl = document.getElementById('phase-override-desc');
  const resetEl = document.getElementById('phase-override-reset');
  if (effectiveEl) effectiveEl.textContent = `当前使用：${predictedText}`;
  if (descEl) descEl.textContent = '系统会先给预测，你也可以按自己的体感调整。';
  if (resetEl) resetEl.style.display = 'none';
  scheduleRecordAutosave('manual-phase-clear');
}

function getTimeSlotByHour(hour) {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function syncTimeSlotTabs() {
  document.querySelectorAll('.time-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-time') === currentTimeSlot);
  });
}

function selectTimeSlot(el) {
  persistCurrentFormDraft();
  currentTimeSlot = el.getAttribute('data-time');
  userManuallySelectedSlot = true;
  syncTimeSlotTabs();
  loadRecordPanel(currentRecDate);
}

async function loadRecordPanel(dateStr) {
  currentRecDate = normalizeDateKey(dateStr);
  isHydratingRecordPanel = true;
  const d = new Date(currentRecDate + 'T00:00:00');
  const weekNames = ['日','一','二','三','四','五','六'];
  const label = (d.getMonth()+1) + '月' + d.getDate() + '日 周' + weekNames[d.getDay()];
  const [cycleDay, rec, convData] = await Promise.all([
    getCycleDay(currentRecDate),
    getRecordWithDrafts(currentRecDate),
    getAIConversation(currentRecDate)
  ]);

  let headerHtml = '<h2>' + label + '</h2>';
  const phaseState = getEffectivePhaseState(cycleDay, rec);
  const predictedPhase = phaseState.predictedPhase;
  if (cycleDay) {
    headerHtml += '<div>Day ' + cycleDay + (predictedPhase ? ' · <span class="phase-tag" style="background:' + predictedPhase.color + '">' + predictedPhase.name + '</span>' : '') + '</div>';
    if (phaseState.hasManualOverride) {
      headerHtml += '<div class="tip">系统预测是 ' + (phaseState.predictedPhaseName || '未计算') + '，你今天手动标记为 ' + phaseState.manualPhaseOverride + '。</div>';
    } else if (predictedPhase) {
      headerHtml += '<div class="tip">' + predictedPhase.tip + '</div>';
    }
    headerHtml += renderCycleInsight(cycleDay, phaseState.effectivePhaseName);
  }
  document.getElementById('rec-header').innerHTML = headerHtml;
  document.getElementById('rec-form').style.display = 'flex';

  // 只有用户没有手动选择时段时，才按当前时间自动选时段
  if (!userManuallySelectedSlot) {
    currentTimeSlot = getTimeSlotByHour(new Date().getHours());
  }
  userManuallySelectedSlot = false;
  syncTimeSlotTabs();
  renderManualPhaseOverrideUI(phaseState);
  const slot = rec && rec.slots ? (rec.slots[currentTimeSlot] || {}) : {};
  document.getElementById('rec-note').value = getDisplayedSummaryText(slot);
  setSummaryMeta(slot);
  renderTodoList(rec?.todos || []);
  const todoInput = document.getElementById('todo-input');
  if (todoInput) todoInput.value = '';
  ['mood','energy','focus','social','appetite'].forEach(k => {
    const val = slot[k] || 5;
    document.getElementById('s-' + k).value = val;
    document.getElementById('v-' + k).textContent = val;
  });
  document.getElementById('rec-period').value = rec ? (rec.period || '') : '';
  // 从当前时间段读取chips
  const slotChips = slot.chips || [];
  document.querySelectorAll('#rec-form .chip').forEach(c => {
    c.classList.toggle('on', slotChips.includes(c.textContent));
  });

  // 渲染周期推荐标签
  const recommendedChipsHtml = renderRecommendedChips(cycleDay);
  document.getElementById('recommended-chips').innerHTML = recommendedChipsHtml;

  // 渲染评分基准线
  const scoreBenchmarkHtml = renderScoreBenchmark(cycleDay);
  document.getElementById('score-benchmark').innerHTML = scoreBenchmarkHtml;

  // 渲染饮食干预提醒
  const dietInterventionHtml = renderDietIntervention(cycleDay);
  document.getElementById('diet-intervention').innerHTML = dietInterventionHtml;

  const btn = document.querySelector('.save-btn');
  const recSaved = rec && rec.slots && rec.slots[currentTimeSlot] && rec.slots[currentTimeSlot].mood;
  btn.classList.toggle('saved', recSaved);
  btn.textContent = recSaved ? '更新记录' : '保存记录';
  
  // 加载该日期的AI对话历史
  aiConversation = convData.messages || [];
  renderAIMessages();
  setRecordSaveStatus('已加载', 'saved');
  isHydratingRecordPanel = false;
}

// 轻量级 Markdown 解析器
function parseMarkdown(text) {
  if (!text) return '';
  
  let html = text
    // 转义 HTML 特殊字符
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 代码块
    .replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // 标题
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // 粗体
    .replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*([^\*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    // 删除线
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    // 引用
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    // 无序列表
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/^(\* )(.*$)/gim, '<li>$2</li>')
    // 有序列表
    .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // 分隔线
    .replace(/^---$/gim, '<hr>')
    // 换行
    .replace(/\n/g, '<br>');
  
  // 包裹列表项
  html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
  // 修复嵌套列表问题（简单处理）
  html = html.replace(/<\/ul><ul>/g, '');
  
  return html;
}

function extractThinkingFromReply(rawText = '') {
  const source = String(rawText || '');
  const thinkMatch = source.match(/<think>([\s\S]*?)<\/think>/);
  const thinking = thinkMatch && thinkMatch[1] ? thinkMatch[1].trim() : '';
  let cleanReply = source.replace(/<think>[\s\S]*?<\/think>/g, '');
  if (cleanReply.includes('<think>')) {
    cleanReply = cleanReply.substring(0, cleanReply.indexOf('<think>'));
  }
  cleanReply = cleanReply.replace(/&lt;think&gt;/g, '').replace(/&lt;\/think&gt;/g, '').trim();
  return { thinking, cleanReply };
}

function renderAIMessageHtml(message = {}) {
  if (message.role !== 'assistant') {
    return '<div class="ai-msg user">' + parseMarkdown(message.content || '') + '</div>';
  }
  const { thinking, cleanReply } = extractThinkingFromReply(message.content || '');
  let html = '';
  if (thinking) {
    html += '<div class="ai-thinking"><details><summary>💭 思考过程（点击展开）</summary><div class="thinking-content">' + parseMarkdown(thinking) + '</div></details></div>';
  }
  html += '<div class="ai-msg ai">' + parseMarkdown(cleanReply) + '</div>';
  return html;
}

function renderAIMessages() {
  const messagesEl = document.getElementById('ai-messages');
  messagesEl.innerHTML = '';
  if (!Array.isArray(aiConversation) || aiConversation.length === 0) {
    messagesEl.innerHTML = '<div class="ai-msg ai-empty">这一天还没有 AI 对话，发一条消息开始聊聊吧。</div>';
    return;
  }
  aiConversation.forEach(m => {
    messagesEl.innerHTML += renderAIMessageHtml(m);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function toggleChip(el) {
  el.classList.toggle('on');
  scheduleRecordAutosave('chip-toggle');
}

function normalizeTodoItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      id: String(item?.id || '').trim() || `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: String(item?.text || '').trim().slice(0, 120),
      done: Boolean(item?.done),
      created_at: item?.created_at || new Date().toISOString()
    }))
    .filter(item => item.text);
}

function collectTodoItemsFromUI() {
  const list = document.getElementById('todo-list');
  if (!list) return [];
  return Array.from(list.querySelectorAll('.todo-item')).map(item => ({
    id: item.dataset.todoId || `todo_${Date.now()}`,
    text: item.querySelector('.todo-edit-input')?.value?.trim() || item.querySelector('.todo-text')?.textContent?.trim() || '',
    done: item.dataset.done === '1',
    created_at: item.dataset.createdAt || new Date().toISOString()
  })).filter(item => item.text);
}

function updateTodoMeta(items = []) {
  const metaEl = document.getElementById('todo-meta');
  if (!metaEl) return;
  const total = items.length;
  const done = items.filter(item => item.done).length;
  if (!total) {
    metaEl.textContent = '今天还没有任务，先写下一件最想完成的事吧。';
    return;
  }
  metaEl.textContent = `今天共有 ${total} 件事，已完成 ${done} 件。`;
}

function renderTodoList(items = []) {
  const list = document.getElementById('todo-list');
  if (!list) return;
  const normalized = normalizeTodoItems(items);
  if (!normalized.length) {
    list.innerHTML = '<div class="todo-empty">今天还没有 To Do，可以先记下一件最重要的小事。</div>';
    updateTodoMeta([]);
    return;
  }
  list.innerHTML = normalized.map(item => `
    <div class="todo-item ${item.done ? 'done' : ''}" data-todo-id="${escapeHtml(item.id)}" data-done="${item.done ? '1' : '0'}" data-created-at="${escapeHtml(item.created_at)}">
      <button type="button" class="todo-check" onclick="toggleTodoItem('${escapeHtml(item.id)}')"></button>
      <div class="todo-content">
        <div class="todo-text" ondblclick="startEditTodoItem('${escapeHtml(item.id)}')">${escapeHtml(item.text)}</div>
        <div class="todo-sub">${item.done ? '已完成' : '进行中'}</div>
      </div>
      <button type="button" class="todo-edit" onclick="startEditTodoItem('${escapeHtml(item.id)}')" aria-label="编辑任务">✎</button>
      <button type="button" class="todo-delete" onclick="removeTodoItem('${escapeHtml(item.id)}')">×</button>
    </div>
  `).join('');
  updateTodoMeta(normalized);
}

function handleTodoInputKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  addTodoItem();
}

function addTodoItem() {
  const input = document.getElementById('todo-input');
  if (!input) return;
  const text = String(input.value || '').trim();
  if (!text) return;
  const items = collectTodoItemsFromUI();
  items.unshift({
    id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    done: false,
    created_at: new Date().toISOString()
  });
  renderTodoList(items);
  input.value = '';
  scheduleRecordAutosave('todo-add');
}

function toggleTodoItem(todoId) {
  const items = collectTodoItemsFromUI().map(item => item.id === todoId ? { ...item, done: !item.done } : item);
  renderTodoList(items);
  scheduleRecordAutosave('todo-toggle');
}

function startEditTodoItem(todoId) {
  const itemEl = document.querySelector(`.todo-item[data-todo-id="${CSS.escape(todoId)}"]`);
  if (!itemEl) return;
  if (itemEl.classList.contains('editing')) return;
  const textEl = itemEl.querySelector('.todo-text');
  if (!textEl) return;
  const currentText = textEl.textContent.trim();
  itemEl.classList.add('editing');
  textEl.outerHTML = `<input type="text" class="todo-edit-input" value="${escapeHtml(currentText)}" onkeydown="handleTodoEditKeydown(event,'${escapeHtml(todoId)}')" onblur="finishEditTodoItem('${escapeHtml(todoId)}', true)" maxlength="120">`;
  const input = itemEl.querySelector('.todo-edit-input');
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function handleTodoEditKeydown(event, todoId) {
  if (event.key === 'Enter') {
    event.preventDefault();
    finishEditTodoItem(todoId, true);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    finishEditTodoItem(todoId, false);
  }
}

function finishEditTodoItem(todoId, shouldSave) {
  const items = collectTodoItemsFromUI();
  const target = items.find(item => item.id === todoId);
  if (!target) {
    renderTodoList(items);
    return;
  }
  if (!shouldSave) {
    renderTodoList(items);
    return;
  }
  const nextText = String(target.text || '').trim();
  if (!nextText) {
    removeTodoItem(todoId);
    return;
  }
  const nextItems = items.map(item => item.id === todoId ? { ...item, text: nextText } : item);
  renderTodoList(nextItems);
  scheduleRecordAutosave('todo-edit');
}

function removeTodoItem(todoId) {
  const items = collectTodoItemsFromUI().filter(item => item.id !== todoId);
  renderTodoList(items);
  scheduleRecordAutosave('todo-remove');
}

/* ============================================================
 * 🧩 模块5: 标签管理 (CHIPS_MANAGER)
 * 自定义标签的加载、渲染、添加、删除
 * ============================================================ */

// 自定义标签管理
const DEFAULT_CHIPS = ['甜食','咸味','碳水','蛋白质','辛辣','冷饮','情绪化','专注','创意','理性','躁动','平静'];
let customChips = [];

function loadCustomChips() {
  try {
    customChips = JSON.parse(localStorage.getItem(currentUserId + '_smc_custom_chips') || '[]');
  } catch(e) { customChips = []; }
}

function saveCustomChips() {
  localStorage.setItem(currentUserId + '_smc_custom_chips', JSON.stringify(customChips));
}

function renderCustomChips() {
  const container = document.getElementById('custom-chips');
  if (!container) return;
  
  // 清空现有标签
  container.innerHTML = '';
  
  // 渲染默认标签
  DEFAULT_CHIPS.forEach(text => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = text;
    chip.onclick = () => toggleChip(chip);
    container.appendChild(chip);
  });
  
  // 渲染自定义标签（带删除按钮）
  customChips.forEach(text => {
    const chip = document.createElement('div');
    chip.className = 'chip custom-chip';
    chip.dataset.custom = 'true';
    chip.innerHTML = text + '<span class="del-chip">×</span>';
    chip.onclick = () => toggleChip(chip);
    
    // 删除按钮点击事件
    const delBtn = chip.querySelector('.del-chip');
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm('删除标签 "' + text + '"？')) {
        deleteChip(text);
      }
    };
    
    container.appendChild(chip);
  });
}

function addNewChip() {
  const input = document.getElementById('new-chip-input');
  const text = input.value.trim();
  
  if (!text) return;
  
  // 检查是否已存在（默认或自定义）
  if (DEFAULT_CHIPS.includes(text) || customChips.includes(text)) {
    alert('标签已存在');
    return;
  }
  
  // 添加到自定义标签
  customChips.push(text);
  saveCustomChips();
  
  // 重新渲染
  renderCustomChips();
  
  // 清空输入框
  input.value = '';
}

function deleteChip(text) {
  customChips = customChips.filter(c => c !== text);
  saveCustomChips();
  renderCustomChips();
}

async function saveRecord(options = {}) {
  const { silent = false, skipDraftWrite = false } = options;
  if (!currentRecDate) return;
  
  // 数据验证
  const chips = [];
  document.querySelectorAll('#rec-form .chip.on').forEach(c => chips.push(c.textContent));
  
  const mood = parseInt(document.getElementById('s-mood').value);
  const energy = parseInt(document.getElementById('s-energy').value);
  
  // 验证数据有效性
  if (isNaN(mood) || isNaN(energy) || mood < 1 || mood > 10 || energy < 1 || energy > 10) {
    console.error('保存失败：评分数据无效');
    alert('评分数据无效，请重试');
    return;
  }
  
  const btn = document.querySelector('.save-btn');
  if (!silent) {
    btn.textContent = '保存中...';
    btn.disabled = true;
  }
  
  try {
    const existing = await getRecordWithDrafts(currentRecDate) || { date: currentRecDate, slots: {} };
    if (!existing.slots) existing.slots = {};
    const previousSlot = existing.slots[currentTimeSlot] || {};
    
    existing.slots[currentTimeSlot] = {
      ...previousSlot,
      note: getEffectiveNoteValue(),
      mood: mood,
      energy: energy,
      focus: parseInt(document.getElementById('s-focus').value) || 5,
      social: parseInt(document.getElementById('s-social').value) || 5,
      appetite: parseInt(document.getElementById('s-appetite').value) || 5,
      saved_at: new Date().toISOString(),
      chips: chips
    };
    existing.period = document.getElementById('rec-period').value;
    existing.manualPhaseOverride = document.getElementById('phase-override-options')?.dataset.selectedPhase || '';
    existing.todos = normalizeTodoItems(collectTodoItemsFromUI());
    // 暂时不发送 updated_at，兼容旧表结构
    
    if (!skipDraftWrite) persistCurrentFormDraft();

    // 先保存本地备份
    localStorage.setItem('smc_backup_' + currentRecDate + '_' + currentTimeSlot, JSON.stringify(existing.slots[currentTimeSlot]));
    
    const result = await saveRecordDB(existing);
    if (result === 'supabase') {
      clearRecordDraftsForDate(currentRecDate);
    }

    if (normalizeDateKey(currentRecDate) === getTodayDateKey()) {
      queueAutoSummaryCheck(200);
    }
    
    renderCalendar('r-grid','r-month-title', rState, loadRecordPanel);
    if (!silent) btn.classList.add('saved');
    
    if (result === 'local') {
      if (!silent) btn.textContent = '已保存到本地';
      setRecordSaveStatus('仅保存到本地，等待云端恢复', 'error');
      // 显示降级提示
      const tipDiv = document.createElement('div');
      tipDiv.style.cssText = 'color:#f39c12;font-size:11px;margin-top:6px;padding:6px;background:#fff3cd;border-radius:6px;';
      tipDiv.textContent = '⚠️ 当前使用本地存储，数据不会同步到云端';
      btn.parentNode.insertBefore(tipDiv, btn.nextSibling);
      setTimeout(() => tipDiv.remove(), 5000);
    } else {
      if (!silent) btn.textContent = '已保存';
      setRecordSaveStatus('已保存到云端', 'saved');
    }
    
    if (!silent) {
      setTimeout(() => { 
        btn.textContent = '更新记录';
      }, 1500);
    }
  } catch (e) {
    console.error('保存失败:', e);
    if (!silent) btn.textContent = '保存失败，请重试';
    setRecordSaveStatus('保存失败，草稿仍在本地', 'error');
    // 显示详细错误到页面
    const errorDiv = document.getElementById('save-error-msg') || document.createElement('div');
    errorDiv.id = 'save-error-msg';
    errorDiv.style.cssText = 'color:#e84a6a;font-size:12px;margin-top:8px;padding:8px;background:#fce4ea;border-radius:8px;';
    errorDiv.textContent = '错误: ' + (e.message || 'Supabase连接失败');
    btn.parentNode.insertBefore(errorDiv, btn.nextSibling);
    setTimeout(() => errorDiv.remove(), 10000);
    // 从本地备份恢复提示
    const backup = localStorage.getItem('smc_backup_' + currentRecDate + '_' + currentTimeSlot);
    if (backup) {
      console.log('本地备份可用:', backup);
    }
  } finally {
    if (!silent) btn.disabled = false;
  }
}

// 获取近期AI对话摘要 - 增强版，包含最近3天的详细记录
async function getRecentContext(currentDate) {
  const context = {
    last_3_days: [],
    weekly_pattern: '',
    user_patterns: {}
  };
  
  const current = new Date(currentDate);
  
  // 获取最近3天的详细记录
  for (let i = 1; i <= 3; i++) {
    const d = new Date(current);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    
    // 获取当天的记录数据
    const record = await getRecord(dateStr);
    const conv = await getAIConversation(dateStr);
    const convMessages = conv.messages || [];

    if (record || (convMessages && convMessages.length > 0)) {
      const cycleDay = await getCycleDay(dateStr);
      const phase = getPhase(cycleDay);
      
      const dayContext = {
        date: dateStr,
        cycle_day: cycleDay,
        phase: phase ? phase.name : '未知',
        
        // 评分数据（所有时间段）
        scores: {},
        
        // 文字记录（关键！包含用户的notes）
        notes: {},
        
        // AI对话摘要（关键！）
        ai_conversation_summary: '',
        
        // 标签
        chips: [],
        
        // 周期状态
        period: record ? record.period : null
      };
      
      // 提取所有时间段的评分和notes
      if (record && record.slots) {
        ['morning', 'afternoon', 'evening'].forEach(slot => {
          if (record.slots[slot]) {
            const s = record.slots[slot];
            dayContext.scores[slot] = {
              mood: s.mood || 5,
              energy: s.energy || 5,
              focus: s.focus || 5,
              social: s.social || 5,
              appetite: s.appetite || 5
            };
            if (s.note) {
              dayContext.notes[slot] = s.note;
            }
            if (s.chips) {
              dayContext.chips = [...new Set([...dayContext.chips, ...s.chips])];
            }
          }
        });
      }
      
      // 生成AI对话摘要（不只是截取，而是提取关键信息）
      if (convMessages && convMessages.length > 0) {
        const userMsgs = convMessages.filter(m => m.role === 'user').map(m => m.content);
        const aiMsgs = convMessages.filter(m => m.role === 'assistant').map(m => m.content);
        
        if (userMsgs.length > 0) {
          // 提取对话主题和关键信息
          const topics = extractTopics(userMsgs.join(' '));
          const concerns = extractConcerns(userMsgs.join(' '));
          
          dayContext.ai_conversation_summary = {
            topics: topics,
            concerns: concerns,
            user_main_message: userMsgs[0].substring(0, 100),
            ai_key_advice: aiMsgs[0] ? aiMsgs[0].substring(0, 80) : ''
          };
        }
      }
      
      context.last_3_days.push(dayContext);
    }
  }
  
  // 生成本周趋势摘要
  if (context.last_3_days.length > 0) {
    context.weekly_pattern = generateWeeklyPattern(context.last_3_days);
  }
  
  return context;
}

// 从对话文本中提取主题
function extractTopics(text) {
  const keywords = {
    '精力': ['精力', '能量', '累', '疲惫', '精神'],
    '情绪': ['情绪', '心情', '焦虑', '烦躁', '开心', '低落'],
    '睡眠': ['睡眠', '失眠', '困', '睡不好'],
    '饮食': ['饮食', '食欲', '想吃', '暴食', ' hungry'],
    '工作': ['工作', '效率', '专注', '拖延', '任务'],
    '运动': ['运动', '健身', '锻炼', '瑜伽'],
    '社交': ['社交', '朋友', '聚会', '聊天', '见'],
    '经期': ['月经', '痛经', '姨妈', '出血']
  };
  
  const topics = [];
  for (const [topic, words] of Object.entries(keywords)) {
    if (words.some(w => text.includes(w))) {
      topics.push(topic);
    }
  }
  return topics.slice(0, 3); // 最多3个主题
}

// 从对话文本中提取关注点/问题
function extractConcerns(text) {
  const concernPatterns = [
    /(担心|害怕|焦虑|怎么办|正常吗|有问题)/,
    /(为什么|怎么回事|什么原因)/,
    /(如何|怎么|怎样).*?(改善|缓解|解决)/,
    /(痛|难受|不舒服|恶心)/
  ];
  
  const concerns = [];
  concernPatterns.forEach(pattern => {
    const match = text.match(pattern);
    if (match) {
      concerns.push(match[0]);
    }
  });
  return concerns.slice(0, 2);
}

// 根据对话生成第三人称状态描述
function generateStateDescription(userMsg, aiReply, scores) {
  const msg = userMsg.toLowerCase();
  
  // 根据关键词判断状态
  const states = {
    '累': '有点疲惫',
    '困': '犯困',
    '精神': '精神状态不错',
    '好': '感觉挺好的',
    '不错': '状态在线',
    '忙': '工作挺忙',
    '烦': '有些烦躁',
    '焦虑': '有点焦虑',
    '开心': '心情不错',
    '难过': '情绪有点低落',
    '压力': '压力有点大',
    '痛': '身体不太舒服',
    '饿': '肚子饿了',
    '吃': '食欲不错',
    '睡': '睡眠质量一般',
    '运动': '刚运动完',
    '工作': '工作劲头足',
    '懒': '想躺平',
    '累死了': '累瘫了',
    '糟糕': '状态不好',
    '不爽': '情绪不太好',
    'emo': '有点emo',
    '兴奋': '挺兴奋的',
    '紧张': '有些紧张',
    '无聊': '有点无聊',
    'productive': '效率很高',
    '高效': '效率很高',
    '拖延': '在拖延',
    '专注': '很专注',
    '分心': '有些分心',
    '生气': '有点生气',
    '烦躁': '心情烦躁',
    '沮丧': '感到沮丧',
    '失落': '有些失落',
    '充实': '感觉很充实',
    '轻松': '心情轻松',
    '平静': '内心平静',
    '活力': '充满活力',
    '疲惫': '比较疲惫',
    '倦怠': '有些倦怠',
    '打鸡血': '像打了鸡血',
    '摆烂': '想摆烂',
    '卷': '在卷',
    '摸鱼': '在摸鱼'
  };
  
  // 找出匹配的状态
  let matchedState = '';
  for (const [keyword, state] of Object.entries(states)) {
    if (msg.includes(keyword)) {
      matchedState = state;
      break;
    }
  }
  
  // 如果有评分，结合评分生成描述
  if (scores) {
    const energy = parseInt(scores.energy);
    const mood = parseInt(scores.mood);
    const focus = parseInt(scores.focus);
    
    // 高分组合
    if (energy >= 8 && mood >= 8 && focus >= 8) {
      return '精力充沛，心情和专注度都在线';
    }
    if (energy >= 8 && mood >= 8) {
      return '精力充沛，心情很好';
    }
    if (energy >= 7 && mood >= 7) {
      return '状态不错，精神头很足';
    }
    
    // 低分组合
    if (energy <= 4 && mood <= 4) {
      return matchedState || '又累情绪又低落';
    }
    if (energy <= 4) {
      return matchedState || '能量很低，需要休息';
    }
    if (mood <= 4) {
      return matchedState || '情绪不太好';
    }
    if (focus <= 4) {
      return '难以集中注意力';
    }
    
    // 中等分数但有明确状态词
    if (matchedState) {
      return matchedState;
    }
    
    // 中等分数无状态词 - 根据分数区间给出有意义的描述
    if (energy >= 6 && mood >= 6) {
      return '状态平稳，一切正常';
    }
    if (energy >= 6) {
      return '精力还行，但情绪一般';
    }
    if (mood >= 6) {
      return '心情还可以，但有点累';
    }
    return '状态一般般';
  }
  
  // 无评分但有明确关键词
  if (matchedState) {
    return matchedState;
  }
  
  // 无评分无关键词 - 返回空表示不记录
  return '';
}

// 生成本周趋势摘要
function generateWeeklyPattern(days) {
  if (days.length === 0) return '';
  
  // 计算平均评分
  let totalMood = 0, totalEnergy = 0, count = 0;
  const allChips = [];
  const allNotes = [];
  
  days.forEach(day => {
    Object.values(day.scores).forEach(scores => {
      if (scores.mood) {
        totalMood += parseInt(scores.mood);
        totalEnergy += parseInt(scores.energy);
        count++;
      }
    });
    allChips.push(...day.chips);
    Object.values(day.notes).forEach(note => {
      if (note && !note.includes('【AI对话摘要】')) {
        allNotes.push(note.substring(0, 30));
      }
    });
  });
  
  const avgMood = count > 0 ? Math.round(totalMood / count) : 0;
  const avgEnergy = count > 0 ? Math.round(totalEnergy / count) : 0;
  
  // 统计高频标签
  const chipCounts = {};
  allChips.forEach(c => {
    chipCounts[c] = (chipCounts[c] || 0) + 1;
  });
  const topChips = Object.entries(chipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c);
  
  // 生成趋势描述
  let pattern = '';
  if (avgMood >= 7 && avgEnergy >= 7) {
    pattern = '整体状态良好，精力充沛';
  } else if (avgMood <= 5 && avgEnergy <= 5) {
    pattern = '近期状态偏低，可能需要更多休息';
  } else if (avgMood >= 7) {
    pattern = '心情不错，但精力有些波动';
  } else {
    pattern = '情绪有些起伏，建议关注心理状态';
  }
  
  if (topChips.length > 0) {
    pattern += `，常出现的感受：${topChips.join('、')}`;
  }
  
  return pattern;
}

// 格式化上下文为文本（用于prompt）
function formatContextForPrompt(context) {
  if (!context.last_3_days || context.last_3_days.length === 0) {
    return '【近期状态】暂无近期记录';
  }
  
  let text = '【近期状态回顾】\n';
  
  context.last_3_days.forEach((day, index) => {
    const dayName = index === 0 ? '昨天' : index === 1 ? '前天' : '大前天';
    text += `\n${dayName}（${day.date}，${day.phase}第${day.cycle_day}天）：\n`;
    
    // 评分
    const scores = Object.entries(day.scores);
    if (scores.length > 0) {
      const avgScores = scores.reduce((acc, [slot, s]) => {
        acc.mood = (acc.mood || 0) + parseInt(s.mood);
        acc.energy = (acc.energy || 0) + parseInt(s.energy);
        return acc;
      }, {});
      const slotCount = scores.length;
      text += `  平均评分：心情${Math.round(avgScores.mood/slotCount)}分，精力${Math.round(avgScores.energy/slotCount)}分\n`;
    }
    
    // 文字记录（关键！）
    const notes = Object.entries(day.notes).filter(([_, n]) => n && !n.includes('【AI对话摘要】'));
    if (notes.length > 0) {
      text += `  记录内容：${notes.map(([slot, n]) => {
        const slotName = slot === 'morning' ? '早' : slot === 'afternoon' ? '下午' : '晚';
        return `${slotName}：${n.substring(0, 40)}${n.length > 40 ? '...' : ''}`;
      }).join('；')}\n`;
    }
    
    // AI对话摘要
    if (day.ai_conversation_summary && day.ai_conversation_summary.user_main_message) {
      const summary = day.ai_conversation_summary;
      text += `  AI对话：用户提到「${summary.user_main_message.substring(0, 30)}...」`;
      if (summary.topics && summary.topics.length > 0) {
        text += `，话题涉及${summary.topics.join('、')}`;
      }
      text += '\n';
    }
    
    // 标签
    if (day.chips.length > 0) {
      text += `  标签：${day.chips.slice(0, 5).join('、')}\n`;
    }
    
    // 周期状态
    if (day.period) {
      const periodText = {
        'light': '月经轻量',
        'medium': '月经中量',
        'heavy': '月经大量',
        'spotting': '点滴出血'
      }[day.period];
      text += `  生理状态：${periodText}\n`;
    }
  });
  
  // 本周趋势
  if (context.weekly_pattern) {
    text += `\n【本周趋势】${context.weekly_pattern}\n`;
  }
  
  return text;
}

let aiConversation = [];

// 上下文缓存（热重载机制）
let contextCache = {
  date: null,           // 缓存的日期
  contextText: '',      // 格式化的上下文文本
  lastUpdated: null,    // 最后更新时间
  rawContext: null      // 原始上下文对象
};

// 获取上下文（带缓存）
async function getCachedContext(currentDate) {
  const now = Date.now();
  
  // 检查缓存是否有效（同一天，且5分钟内）
  if (contextCache.date === currentDate && 
      contextCache.contextText && 
      (now - contextCache.lastUpdated) < 5 * 60 * 1000) {
    console.log('🔄 使用缓存的上下文（热重载）');
    return contextCache.contextText;
  }
  
  // 缓存失效，重新构建
  console.log('🆕 构建新的上下文（冷启动）');
  const recentContext = await getRecentContext(currentDate);
  const contextText = formatContextForPrompt(recentContext);
  
  // 更新缓存
  contextCache = {
    date: currentDate,
    contextText: contextText,
    lastUpdated: now,
    rawContext: recentContext
  };
  
  return contextText;
}

// 强制刷新上下文缓存（用户手动保存记录后调用）
function invalidateContextCache() {
  contextCache = {
    date: null,
    contextText: '',
    lastUpdated: null,
    rawContext: null
  };
  console.log('♻️ 上下文缓存已清除');
}

/* ============================================================
 * 🧩 模块5.5: 搜索技能 (SEARCH_SKILL)
 * 文献检索、科学数据查询
 * ============================================================ */

async function searchLiterature(query, options = {}) {
  const { maxResults = 5, searchDepth = 'basic', includeDomains = [] } = options;
  
  try {
    const response = await apiRequest('/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_domains: includeDomains
      })
    });
    
    if (!response.ok) {
      throw new Error('搜索请求失败: ' + response.status);
    }
    
    const data = await response.json();
    
    // 格式化搜索结果
    return {
      success: true,
      answer: data.answer || '',
      results: (data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score
      })),
      query: data.query || query
    };
    
  } catch (error) {
    console.error('搜索失败:', error);
    // 降级到本地知识库搜索
    return fallbackSearch(query);
  }
}

// 优化搜索查询 - 添加科学文献关键词
function enhanceSearchQuery(query) {
  const cycleKeywords = [
    'menstrual cycle', 'follicular phase', 'luteal phase', 'ovulation',
    'estrogen', 'progesterone', 'premenstrual', 'hormonal fluctuations'
  ];
  
  const healthKeywords = [
    'burnout', 'fatigue', 'energy levels', 'cognitive performance',
    'mood changes', 'sleep quality', 'work productivity'
  ];
  
  const lowerQuery = query.toLowerCase();
  
  // 检测是否需要添加科学文献关键词
  const needsScientificContext = cycleKeywords.some(kw => lowerQuery.includes(kw.replace(/\s/g, ''))) ||
                                  healthKeywords.some(kw => lowerQuery.includes(kw.split(' ')[0]));
  
  if (needsScientificContext) {
    return `${query} scientific research study evidence`;
  }
  
  return query;
}

// 本地知识库搜索（降级方案）
function fallbackSearch(query) {
  const knowledgeBase = {
    'burnout menstrual cycle': {
      answer: '研究表明，月经周期确实会影响能量水平和易疲劳程度。黄体期（排卵后到月经前）由于孕酮升高，很多女性会自然感觉更疲劳。但这与"燃尽"（burnout）不同，后者是长期的身心透支。',
      sources: [
        { title: 'PMC Article - How to study the menstrual cycle', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8363181/', content: 'Within-person repeated measures designs are the gold standard for menstrual cycle research.' }
      ]
    },
    'follicular phase energy': {
      answer: '卵泡期（月经后第6-13天）雌激素逐渐上升，研究表明这是大多数女性精力和专注力的上升期。',
      sources: []
    },
    'luteal phase fatigue': {
      answer: '黄体期（排卵后）孕酮水平升高会导致基础体温上升，身体代谢加快，容易感觉疲劳。这是正常的生理反应。',
      sources: []
    }
  };
  
  const lowerQuery = query.toLowerCase();
  for (const [key, value] of Object.entries(knowledgeBase)) {
    if (lowerQuery.includes(key) || key.includes(lowerQuery)) {
      return { success: true, ...value, query, isFallback: true };
    }
  }
  
  return { success: false, error: '未找到相关信息', query };
}

// 判断用户问题是否需要搜索
function shouldSearch(userMessage, conversationHistory) {
  const lowerMsg = userMessage.toLowerCase();
  
  // 搜索触发关键词
  const searchTriggers = [
    '搜', '查', '研究', '文献', 'paper', 'research', 'study',
    '科学', '证据', '证明', '数据表明',
    '为什么', '怎么回事', '正常吗', '有没有可能'
  ];
  
  // 是否需要实时数据
  const needsFreshData = searchTriggers.some(trigger => lowerMsg.includes(trigger));
  
  // 是否是事实性问题
  const factualPatterns = [
    /^(什么是|为什么|如何|有没有|是否)/,
    /(吗\?|呢\?|么\?)$/,
    /(研究表明|数据显示|科学证据)/
  ];
  const isFactual = factualPatterns.some(pattern => pattern.test(userMessage));
  
  // 检查是否是之前回答过的重复问题
  const isRepeat = conversationHistory.some(
    h => h.role === 'user' && h.content.includes(userMessage.substring(0, 20))
  );
  
  return (needsFreshData || isFactual) && !isRepeat;
}

/* ============================================================
 * 🧩 模块6: AI对话 (AI_CHAT)
 * AI聊天、自动评分、提示词管理
 * ============================================================ */

function handleAIInputKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  sendAI();
}

async function sendAI() {
  const input = document.getElementById('ai-input');
  const msg = input.value.trim();
  if (!msg) return;
  const btn = document.getElementById('ai-send-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '...';
  const messagesEl = document.getElementById('ai-messages');
  messagesEl.innerHTML += '<div class="ai-msg user">' + escapeHtml(msg) + '</div>';
  messagesEl.scrollTop = messagesEl.scrollHeight;
  input.value = '';

  let cfg = configCache || {};
  
  // 判断是否需要搜索
  let searchResults = null;
  
  try {
    cfg = await getConfig();

    if (shouldSearch(msg, aiConversation)) {
      console.log('🔍 触发搜索:', msg);
      messagesEl.innerHTML += `<div class="ai-msg ai" style="opacity:0.7;font-size:12px;">🔍 ${escapeHtml(getCompanionName(cfg))}正在搜索相关资料...</div>`;
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      searchResults = await searchLiterature(msg, { maxResults: 3 });
      console.log('📚 搜索结果:', searchResults);
      
      const searchingMsg = messagesEl.querySelector('.ai-msg:last-child');
      if (searchingMsg && searchingMsg.textContent.includes('正在搜索')) {
        searchingMsg.remove();
      }
    }

    let cycleDay = null;
    if (configCache && configCache.lastPeriod) {
      const last = new Date(configCache.lastPeriod + 'T00:00:00');
      const target = new Date(currentRecDate + 'T00:00:00');
      const cycleLen = configCache.cycleLen || 28;
      let diff = Math.round((target - last) / 86400000);
      if (diff < 0) diff = ((diff % cycleLen) + cycleLen) % cycleLen;
      cycleDay = (diff % cycleLen) + 1;
    }
    const currentRecord = await getRecordWithDrafts(currentRecDate);
    const phaseState = getEffectivePhaseState(cycleDay, currentRecord);
    const phase = phaseState.effectivePhaseName ? { name: phaseState.effectivePhaseName } : null;
    const timeSlotName = TIME_SLOTS[currentTimeSlot]?.name || currentTimeSlot;

    const longTermMemory = await getMemory('longterm') || '';
    const yesterdaySummary = await getYesterdaySummary();

    const now = new Date();
    const currentTimeStr = now.toLocaleString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
    const currentHour = now.getHours();
    const timeOfDay = currentHour < 12 ? '早上' : currentHour < 18 ? '下午' : '晚上';

    console.log('⏰ 实时时间信息:', currentTimeStr, timeOfDay);

    const recentContextText = await getCachedContext(currentRecDate);
    const dietIntervention = getDietIntervention(cycleDay);

    const systemPrompt = await buildAISystemPromptWithMemory({
      cfg,
      currentTimeStr,
      timeOfDay,
      phase,
      cycleDay,
      timeSlotName,
      longTermMemory,
      yesterdaySummary,
      recentContextText,
      dietIntervention,
      searchResults
    });

    const messages = [
      { role: 'user', content: '【系统设定】' + systemPrompt },
      ...aiConversation,
      { role: 'user', content: msg }
    ];

    console.log('📤 实际发送的System Prompt前500字:', systemPrompt.substring(0, 500));
    console.log('📤 完整Messages:', JSON.stringify(messages, null, 2));

    const response = await apiRequest('/ai-chat', {
      method: 'POST',
      body: JSON.stringify({
        model: cfg.model || 'MiniMax-M2.7',
        messages: messages,
        stream: true
      })
    });
    
    if (!response.ok) {
      throw new Error('API请求失败: ' + response.status);
    }
    
    // 创建流式消息容器
    let reply = '';
    let thinking = '';
    let isThinking = false;
    let thinkingContent = '';
    let messageDiv = document.createElement('div');
    messageDiv.className = 'ai-msg ai streaming';
    messageDiv.innerHTML = '<span class="streaming-cursor">▊</span>';
    messagesEl.appendChild(messageDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // 读取流式响应
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的行到下次处理
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;
        
        const data = trimmedLine.slice(5).trim();
        if (data === '[DONE]') continue;
        
        try {
          const chunk = JSON.parse(data);
          if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
            const delta = chunk.choices[0].delta;

            if (delta.content) {
              reply += delta.content;

              // 流式过程中不尝试提取思考内容，直接显示原始回复
              // 思考内容会在流式结束后统一处理
              messageDiv.innerHTML = reply.replace(/\n/g, '<br>') + '<span class="streaming-cursor">▊</span>';
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
          }
        } catch (e) {
          // 忽略解析错误，继续处理下一行
        }
      }
    }
    
    // 移除流式光标，完成显示
    messageDiv.classList.remove('streaming');

    const { thinking: extractedThinking, cleanReply } = extractThinkingFromReply(reply);
    thinking = extractedThinking;
    messageDiv.outerHTML = renderAIMessageHtml({ role: 'assistant', content: reply });
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    const replyTimestamp = new Date().toISOString();
    aiConversation.push({ role: 'user', content: msg, created_at: replyTimestamp, slot: currentTimeSlot });
    aiConversation.push({ role: 'assistant', content: reply, created_at: replyTimestamp, slot: currentTimeSlot });
    
    // 保存对话历史到IndexedDB
    await saveAIConversation(currentRecDate, aiConversation);
    if (normalizeDateKey(currentRecDate) === getTodayDateKey()) {
      queueAutoSummaryCheck(250);
    }
    
    // 从对话中学习长期记忆
    await learnFromConversation(msg, reply, cycleDay);

    // 🧠 Hermes风格记忆提取
    await extractAndSaveMemories(msg, reply, {
      cycleDay,
      currentRecord: await getRecordWithDrafts(currentRecDate),
      recentRecords: await getRecentRecords(7)
    });

    // AI对话结束后自动保存记录
    await saveRecord();
  } catch (e) {
    let errorMsg = e.message || '';
    if (errorMsg.includes('负载较高') || errorMsg.includes('2064')) {
      messagesEl.innerHTML += `<div class="ai-msg ai">🤖 ${escapeHtml(getCompanionName(cfg))}说：MiniMax 服务器有点忙，10 秒后再试一次看看。</div>`;
    } else {
      messagesEl.innerHTML += `<div class="ai-msg ai">🤖 ${escapeHtml(getCompanionName(cfg))}说：网络刚刚开了个小差，再试一次看看。</div>`;
    }
    console.error('AI连接错误:', e);
  }
  
  btn.disabled = false;
  btn.textContent = '发送';
}

let trendChart = null, phaseChart = null;

/* ============================================================
 * 🧩 模块6.5: 个性化模式分析 (PERSONAL_PATTERN_ANALYSIS)
 * 基于用户数据+科学基线，发现独特个人模式
 * ============================================================ */

async function generatePersonalPatternAnalysis() {
  const data = await getData();
  if (data.length < 14) {
    return { 
      hasEnoughData: false, 
      message: '记录至少14天（半个周期）后，将生成你的个性化分析...' 
    };
  }
  
  // 为每条记录计算cycleDay和phase
  const enrichedData = [];
  for (const record of data) {
    const cycleDay = await getCycleDay(record.date);
    const phase = getPhase(cycleDay);
    if (cycleDay && phase && record.slots) {
      // 计算当天平均分
      let dayScores = { mood: 0, energy: 0, focus: 0, social: 0, count: 0 };
      Object.values(record.slots).forEach(slot => {
        if (slot.mood) {
          dayScores.mood += parseInt(slot.mood);
          dayScores.energy += parseInt(slot.energy);
          dayScores.focus += parseInt(slot.focus);
          dayScores.social += parseInt(slot.social);
          dayScores.count++;
        }
      });
      if (dayScores.count > 0) {
        enrichedData.push({
          date: record.date,
          cycleDay,
          phase: phase.name,
          scores: {
            mood: dayScores.mood / dayScores.count,
            energy: dayScores.energy / dayScores.count,
            focus: dayScores.focus / dayScores.count,
            social: dayScores.social / dayScores.count
          },
          chips: record.chips || []
        });
      }
    }
  }
  
  if (enrichedData.length < 7) {
    return { 
      hasEnoughData: false, 
      message: '需要更多完整记录来生成分析...' 
    };
  }
  
  // 按周期阶段分组统计
  const phaseStats = {};
  const phaseScienceBaseline = {
    '月经期': { energy: 5, mood: 5, focus: 5, social: 5 },
    '卵泡期': { energy: 7.5, mood: 7.5, focus: 7.5, social: 7 },
    '排卵期': { energy: 9, mood: 9, focus: 9, social: 8.5 },
    '黄体期早期': { energy: 6.5, mood: 6.5, focus: 6.5, social: 5.5 },
    '黄体期晚期': { energy: 5, mood: 5, focus: 5, social: 4.5 }
  };
  
  enrichedData.forEach(d => {
    if (!phaseStats[d.phase]) {
      phaseStats[d.phase] = { 
        count: 0, 
        scores: { mood: 0, energy: 0, focus: 0, social: 0 },
        chips: []
      };
    }
    phaseStats[d.phase].count++;
    phaseStats[d.phase].scores.mood += d.scores.mood;
    phaseStats[d.phase].scores.energy += d.scores.energy;
    phaseStats[d.phase].scores.focus += d.scores.focus;
    phaseStats[d.phase].scores.social += d.scores.social;
    phaseStats[d.phase].chips.push(...d.chips);
  });
  
  // 计算各阶段平均值并与科学基线对比
  const patterns = [];
  for (const [phase, stats] of Object.entries(phaseStats)) {
    if (stats.count >= 2) { // 至少2天数据才分析
      const avgScores = {
        mood: stats.scores.mood / stats.count,
        energy: stats.scores.energy / stats.count,
        focus: stats.scores.focus / stats.count,
        social: stats.scores.social / stats.count
      };
      
      const baseline = phaseScienceBaseline[phase];
      const diffs = {
        energy: avgScores.energy - baseline.energy,
        mood: avgScores.mood - baseline.mood,
        focus: avgScores.focus - baseline.focus,
        social: avgScores.social - baseline.social
      };
      
      // 统计高频标签
      const chipCounts = {};
      stats.chips.forEach(c => chipCounts[c] = (chipCounts[c] || 0) + 1);
      const topChips = Object.entries(chipCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
      
      patterns.push({
        phase,
        count: stats.count,
        avgScores,
        diffs,
        topChips,
        // 判断是否与科学趋势一致
        isConsistent: Math.abs(diffs.energy) < 1.5 && Math.abs(diffs.mood) < 1.5
      });
    }
  }
  
  // 发现独特的个人模式
  const insights = [];
  
  // 1. 找出与科学基线差异最大的阶段
  let maxDiffPhase = null;
  let maxDiffValue = 0;
  patterns.forEach(p => {
    const totalDiff = Math.abs(p.diffs.energy) + Math.abs(p.diffs.mood);
    if (totalDiff > maxDiffValue) {
      maxDiffValue = totalDiff;
      maxDiffPhase = p;
    }
  });
  
  if (maxDiffPhase && maxDiffValue > 2) {
    const direction = maxDiffPhase.diffs.energy > 0 ? '高于' : '低于';
    insights.push({
      type: 'unique',
      title: `🔍 你的${maxDiffPhase.phase}很特别`,
      desc: `一般人在${maxDiffPhase.phase}精力平均${phaseScienceBaseline[maxDiffPhase.phase].energy}分，但你平均${maxDiffPhase.avgScores.energy.toFixed(1)}分，${direction}平均水平${Math.abs(maxDiffPhase.diffs.energy).toFixed(1)}分。`,
      tags: ['独特模式', ...maxDiffPhase.topChips.slice(0, 2)],
      compare: {
        science: phaseScienceBaseline[maxDiffPhase.phase].energy,
        personal: maxDiffPhase.avgScores.energy.toFixed(1),
        diff: (maxDiffPhase.diffs.energy > 0 ? '+' : '') + maxDiffPhase.diffs.energy.toFixed(1)
      }
    });
  }
  
  // 2. 找出表现最好的阶段（个人最优期）
  let bestPhase = null;
  let bestScore = 0;
  patterns.forEach(p => {
    const totalScore = p.avgScores.energy + p.avgScores.mood;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestPhase = p;
    }
  });
  
  if (bestPhase) {
    const isScienceAligned = bestPhase.phase === '排卵期' || bestPhase.phase === '卵泡期';
    insights.push({
      type: 'strength',
      title: `💪 你的黄金期：${bestPhase.phase}`,
      desc: isScienceAligned 
        ? `和大多数人一样，你在${bestPhase.phase}状态最好（平均精力${bestPhase.avgScores.energy.toFixed(1)}分）。趁这几天做重要的事！`
        : `有趣的是，别人在排卵期状态最好，但你反而在${bestPhase.phase}表现最佳（平均精力${bestPhase.avgScores.energy.toFixed(1)}分）。这是你的独特优势！`,
      tags: ['个人黄金期', ...bestPhase.topChips.slice(0, 2)],
      highlight: true
    });
  }
  
  // 3. 找出需要关注的阶段
  let weakPhase = null;
  let lowestScore = 20;
  patterns.forEach(p => {
    const totalScore = p.avgScores.energy + p.avgScores.mood;
    if (totalScore < lowestScore && p.count >= 2) {
      lowestScore = totalScore;
      weakPhase = p;
    }
  });
  
  if (weakPhase && weakPhase.avgScores.energy < 5) {
    insights.push({
      type: 'warning',
      title: `⚠️ ${weakPhase.phase}需要额外关照`,
      desc: `你在${weakPhase.phase}的平均精力只有${weakPhase.avgScores.energy.toFixed(1)}分，${weakPhase.diffs.energy < -1 ? '比平均水平低很多' : '这是正常的生理波动'}。建议这几天降低预期，多做自我关怀。`,
      tags: ['需要关照', '调整预期']
    });
  }
  
  // 4. 标签模式分析
  const allChips = enrichedData.flatMap(d => d.chips);
  const chipCounts = {};
  allChips.forEach(c => chipCounts[c] = (chipCounts[c] || 0) + 1);
  const frequentChips = Object.entries(chipCounts)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  if (frequentChips.length > 0) {
    insights.push({
      type: 'pattern',
      title: '🏷️ 反复出现的标签',
      desc: `你经常在记录中提到：${frequentChips.map(([name, count]) => `${name}(${count}次)`).join('、')}。这些可能是你需要持续关注的信号。`,
      tags: frequentChips.map(([name]) => name)
    });
  }
  
  return {
    hasEnoughData: true,
    totalDays: enrichedData.length,
    patterns,
    insights,
    scienceBaseline: phaseScienceBaseline
  };
}

async function renderPersonalPatternAnalysis() {
  const container = document.getElementById('personal-pattern-analysis');
  if (!container) return;
  
  const analysis = await generatePersonalPatternAnalysis();
  
  if (!analysis.hasEnoughData) {
    container.innerHTML = `<div class="empty-state" style="padding:20px">${analysis.message}</div>`;
    return;
  }
  
  let html = `<div style="font-size:11px;color:var(--muted);margin-bottom:12px">
    基于${analysis.totalDays}天记录 · 对比科学基线发现你的独特模式
  </div>`;
  
  analysis.insights.forEach(insight => {
    const highlightClass = insight.highlight ? 'highlight' : '';
    const tagsHtml = insight.tags.map(tag => 
      `<span class="pattern-tag ${insight.type === 'unique' ? 'personal' : insight.type === 'strength' ? 'personal' : ''}">${tag}</span>`
    ).join('');
    
    let compareHtml = '';
    if (insight.compare) {
      compareHtml = `
        <div class="pattern-compare">
          <div class="pattern-compare-item">
            <div class="label">科学平均</div>
            <div class="value">${insight.compare.science}</div>
          </div>
          <div class="pattern-compare-item">
            <div class="label">你的平均</div>
            <div class="value">${insight.compare.personal}</div>
          </div>
          <div class="pattern-compare-item diff">
            <div class="label">差异</div>
            <div class="value">${insight.compare.diff}</div>
          </div>
        </div>
      `;
    }
    
    html += `
      <div class="pattern-item ${highlightClass}">
        <div class="pattern-title">${insight.title}</div>
        <div class="pattern-desc">${insight.desc}</div>
        ${compareHtml}
        <div style="margin-top:8px">${tagsHtml}</div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

/* ============================================================
 * 🧩 模块7: 分析图表 (ANALYSIS)
 * 数据统计、趋势图表、周期对比
 * ============================================================ */

async function renderAnalysis() {
  const data = (await getData()).sort((a,b) => a.date.localeCompare(b.date));
  let totalRecords = 0;
  let totalMood = 0;
  let totalEnergy = 0;
  let count = 0;
  
  data.forEach(d => {
    if (d.slots) {
      Object.values(d.slots).forEach(slot => {
        if (slot.mood) {
          totalMood += +slot.mood;
          totalEnergy += +slot.energy;
          count++;
        }
      });
    }
  });
  totalRecords = count;
  
  document.getElementById('stat-days').textContent = totalRecords;
  if (count > 0) {
    document.getElementById('stat-mood').textContent = (totalMood / count).toFixed(1);
  }
  
  let streak = 0;
  const today = new Date().toLocaleDateString('en-CA');
  let check = new Date(today + 'T00:00:00');
  while (true) {
    const ds = check.toISOString().split('T')[0];
    const rec = await getRecord(ds);
    if (!rec || !rec.slots || Object.keys(rec.slots).length === 0) break;
    streak++;
    check.setDate(check.getDate() - 1);
  }
  document.getElementById('stat-streak').textContent = streak;

  // 渲染个性化模式分析
  await renderPersonalPatternAnalysis();

  const last30 = data.slice(-30);
  const labels = [];
  const moods = [];
  const energies = [];
  
  // 获取日期范围，包括没有记录的天数
  if (last30.length > 0) {
    const startDate = new Date(last30[0].date);
    const endDate = new Date(last30[last30.length - 1].date);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const record = last30.find(r => r.date === dateStr);
      
      labels.push(dateStr.slice(5));
      
      if (record && record.slots) {
        let dayMood = 0, dayEnergy = 0, dayCount = 0;
        Object.values(record.slots).forEach(slot => {
          if (slot.mood) {
            dayMood += +slot.mood;
            dayEnergy += +slot.energy;
            dayCount++;
          }
        });
        if (dayCount > 0) {
          moods.push((dayMood / dayCount).toFixed(1));
          energies.push((dayEnergy / dayCount).toFixed(1));
        } else {
          // 有记录但没有评分，断开
          moods.push(null);
          energies.push(null);
        }
      } else {
        // 没有记录，断开连线
        moods.push(null);
        energies.push(null);
      }
    }
  }

  if (trendChart) trendChart.destroy();
  if (labels.length > 0) {
    trendChart = new Chart(document.getElementById('trend-chart'), {
      type: 'line',
      data: { labels, datasets: [
        { label:'心情', data:moods, borderColor:'#e84a6a', backgroundColor:'rgba(232,74,106,.1)', tension:.4, fill:true },
        { label:'能量', data:energies, borderColor:'#f39c12', backgroundColor:'rgba(243,156,18,.1)', tension:.4, fill:true }
      ]},
      options: { plugins:{ legend:{ position:'top' } }, scales:{ y:{ min:1,max:10 } }, responsive:true }
    });
  }

  const phaseNames = ['月经期','卵泡期','排卵期','黄体期早期','黄体期晚期'];
  const phaseColors = ['#e74c3c','#f39c12','#e91e63','#9b59b6','#7d3c98'];
  
  // 先计算所有日期的cycleDay
  const cycleDays = {};
  for (const d of data) {
    cycleDays[d.date] = await getCycleDay(d.date);
  }
  
  const phaseData = phaseNames.map(pn => {
    let total = 0, cnt = 0;
    data.forEach(d => {
      const cd = cycleDays[d.date];
      const ph = getPhase(cd);
      if (ph && ph.name === pn && d.slots) {
        Object.values(d.slots).forEach(slot => {
          if (slot.mood) {
            total += +slot.mood;
            cnt++;
          }
        });
      }
    });
    return cnt ? (total / cnt).toFixed(1) : 0;
  });

  if (phaseChart) phaseChart.destroy();
  phaseChart = new Chart(document.getElementById('phase-chart'), {
    type: 'bar',
    data: { labels: phaseNames, datasets: [{ label:'平均心情', data:phaseData, backgroundColor:phaseColors }] },
    options: { plugins:{ legend:{ display:false } }, scales:{ y:{ min:0,max:10 } }, responsive:true }
  });
}

function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'analysis') renderAnalysis();
}

async function openSettings() {
  const cfg = await getConfig();
  const selectedStyle = getAiStyleTemplate(cfg);
  renderAiStyleOptions(selectedStyle);
  document.getElementById('cfg-last-period').value = cfg.lastPeriod || '';
  document.getElementById('cfg-cycle-len').value = cfg.cycleLen || 28;
  document.getElementById('cfg-display-name').value = cfg.displayName || '';
  document.getElementById('cfg-companion-name').value = cfg.companionName || '';
  document.getElementById('cfg-ai-style').value = selectedStyle;
  renderAiStyleInspector(selectedStyle);
  document.getElementById('cfg-ai-custom-prompt').value = cfg.aiCustomPrompt || '';
  document.getElementById('cfg-model').value = cfg.model || 'MiniMax-M2.7';
  document.getElementById('settings-modal').classList.add('open');
}
function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}
function handleAiStyleSettingsChange() {
  const styleKey = document.getElementById('cfg-ai-style').value || DEFAULT_AI_STYLE_TEMPLATE;
  renderAiStyleInspector(styleKey);
}
function applySelectedTemplateToCustomPrompt() {
  const styleKey = document.getElementById('cfg-ai-style').value || DEFAULT_AI_STYLE_TEMPLATE;
  const template = getAiStyleTemplateMeta(styleKey);
  const customEl = document.getElementById('cfg-ai-custom-prompt');
  if (!customEl) return;
  customEl.value = template.prompt;
  customEl.focus();
}

function setSettingsSaveButtonState(state = 'idle') {
  const btn = document.getElementById('settings-save-btn');
  if (!btn) return;
  btn.classList.remove('is-saving', 'is-saved');
  btn.disabled = false;
  if (state === 'saving') {
    btn.disabled = true;
    btn.classList.add('is-saving');
    btn.textContent = '保存中...';
    return;
  }
  if (state === 'saved') {
    btn.classList.add('is-saved');
    btn.textContent = '已保存';
    return;
  }
  btn.textContent = '保存';
}

async function saveSettings() {
  const btn = document.getElementById('settings-save-btn');
  if (btn?.disabled) return;
  setSettingsSaveButtonState('saving');
  const existing = await getConfig();
  const nextConfig = {
    ...existing,
    lastPeriod: document.getElementById('cfg-last-period').value,
    cycleLen: parseInt(document.getElementById('cfg-cycle-len').value) || 28,
    displayName: sanitizePromptText(document.getElementById('cfg-display-name').value, 30),
    companionName: sanitizePromptText(document.getElementById('cfg-companion-name').value, 30),
    aiStyleTemplate: document.getElementById('cfg-ai-style').value || DEFAULT_AI_STYLE_TEMPLATE,
    aiCustomPrompt: sanitizePromptText(document.getElementById('cfg-ai-custom-prompt').value, 2000),
    model: document.getElementById('cfg-model').value,
    onboardingCompleted: Boolean(
      document.getElementById('cfg-last-period').value &&
      (parseInt(document.getElementById('cfg-cycle-len').value) || 28)
    )
  };
  const savedConfig = await setConfig(nextConfig);
  if (!savedConfig) {
    setSettingsSaveButtonState('idle');
    alert('设置保存失败，这次没有写入云端。请稍后再试。');
    return;
  }
  configCache = savedConfig;
  renderAICompanionUI(nextConfig);
  renderUserIdentityUI(savedConfig);
  setSettingsSaveButtonState('saved');
  await new Promise(resolve => setTimeout(resolve, 450));
  closeSettings();
  await renderCalendar('r-grid','r-month-title', rState, loadRecordPanel);
  setSettingsSaveButtonState('idle');
}

/* ============================================================
 * 新用户引导 (ONBOARDING)
 * ============================================================ */
let obStep = 1;
let obSelectedStyle = DEFAULT_AI_STYLE_TEMPLATE;

function checkOnboarding(cfg = configCache) {
  if (!hasCompletedOnboarding(cfg || {})) {
    showOnboarding(cfg || {});
    return true;
  }
  return false;
}

function showOnboarding(cfg = {}) {
  obStep = 1;
  obSelectedStyle = getAiStyleTemplate(cfg);
  document.getElementById('ob-last-period').value = cfg.lastPeriod || new Date().toISOString().split('T')[0];
  document.getElementById('ob-cycle-len').value = cfg.cycleLen || 28;
  document.getElementById('ob-cycle-len-val').textContent = String(cfg.cycleLen || 28);
  document.getElementById('ob-display-name').value = cfg.displayName || '';
  document.getElementById('ob-companion-name').value = cfg.companionName || '';
  renderOnboardingStyles();
  document.getElementById('ob-step-1').style.display = 'block';
  document.getElementById('ob-step-2').style.display = 'none';
  document.getElementById('ob-next-btn').textContent = '下一步';
  document.getElementById('onboarding-modal').classList.add('open');
}

function renderOnboardingStyles() {
  const grid = document.getElementById('ob-style-grid');
  grid.innerHTML = Object.entries(AI_STYLE_TEMPLATES).map(([key, tpl]) => `
    <div class="ob-style-card ${key === obSelectedStyle ? 'selected' : ''}" onclick="selectObStyle('${key}')">
      <div class="ob-style-name">${tpl.label}</div>
      <div class="ob-style-desc">${tpl.summary}</div>
    </div>
  `).join('');
}

function selectObStyle(key) {
  obSelectedStyle = key;
  renderOnboardingStyles();
}

async function nextOnboardingStep() {
  if (obStep === 1) {
    const lastPeriod = document.getElementById('ob-last-period').value;
    const cycleLen = parseInt(document.getElementById('ob-cycle-len').value) || 28;
    if (lastPeriod) {
      const partialConfig = await setConfig({
        lastPeriod,
        cycleLen,
        onboardingCompleted: false
      });
      if (!partialConfig) {
        alert('初始化保存失败，请稍后再试。');
        return;
      }
      configCache = partialConfig;
    }
    obStep = 2;
    document.getElementById('ob-step-1').style.display = 'none';
    document.getElementById('ob-step-2').style.display = 'block';
    document.getElementById('ob-next-btn').textContent = '开始使用';
    renderOnboardingStyles();
  } else {
    const savedConfig = await setConfig({
      displayName: sanitizePromptText(document.getElementById('ob-display-name').value, 30),
      companionName: sanitizePromptText(document.getElementById('ob-companion-name').value, 30),
      aiStyleTemplate: obSelectedStyle,
      onboardingCompleted: true
    });
    if (!savedConfig) {
      alert('初始化保存失败，请稍后再试。');
      return;
    }
    configCache = savedConfig;
    renderAICompanionUI(savedConfig);
    renderUserIdentityUI(savedConfig);
    await closeOnboarding();
  }
}

function skipOnboarding() {
  closeOnboarding();
}

async function closeOnboarding() {
  document.getElementById('onboarding-modal').classList.remove('open');
  const cfg = configCache || await getConfig();
  renderAICompanionUI(cfg);
  renderUserIdentityUI(cfg);
  if (hasCompletedOnboarding(cfg)) {
    renderPostOnboardingShell();
    await syncSelectedDateToAvailableRecord();
    await renderCalendar('r-grid','r-month-title', rState, loadRecordPanel);
    await loadRecordPanel(rState.selected);
    loadCustomChips();
    renderCustomChips();
  } else {
    renderPreOnboardingState();
  }
}

/* ============================================================
 * 🧩 模块8: 应用初始化 (APP_INIT)
 * 启动逻辑、数据迁移、模块加载
 * ============================================================ */

document.addEventListener('DOMContentLoaded', async function() {
  // 注意：UI 初始化已移至 window load 事件处理器
  // 这里只做数据迁移检查
  try {
    if (!getStoredSession()) {
      return;
    }
    // 从IndexedDB迁移旧数据到Supabase（仅一次，且Supabase无数据时才迁移）
    const migrated = localStorage.getItem('smc_migrated_supabase_v2');
    if (!migrated) {
      console.log('检查是否需要迁移旧数据...');

      // 先检查 Supabase 是否已有数据
      const existingRecords = await sbGet('records', { 'user_id': 'eq.' + currentUserId, 'select': '*', 'limit': 1 });
      const hasExistingData = Array.isArray(existingRecords) && existingRecords.length > 0;

      if (hasExistingData) {
        console.log('Supabase 已有数据，跳过迁移');
      } else {
        console.log('Supabase 无数据，开始迁移...');
        // 先尝试从IndexedDB读取
        const idbData = await readFromIndexedDB();
        if (idbData.records.length > 0 || Object.keys(idbData.config).length > 0) {
          console.log('从IndexedDB迁移', idbData.records.length, '条记录');
          if (idbData.records.length > 0) await setData(idbData.records);
          if (Object.keys(idbData.config).length > 0) await setConfig(idbData.config);
        } else {
          // 从localStorage迁移
          const oldData = getDataLegacy();
          const oldConfig = getConfigLegacy();
          if (oldData.length > 0) await setData(oldData);
          if (Object.keys(oldConfig).length > 0) await setConfig(oldConfig);
        }
      }
      localStorage.setItem('smc_migrated_supabase_v2', '1');
      console.log('迁移标记已设置');
    }
  } catch(e) {
    console.error('DOMContentLoaded migration ERROR:', e);
  }
});

/* ============================================================
 * 🧩 模块9: 周期智能提示 (CYCLE_INSIGHTS)
 * 功能：根据周期预测显示智能提示
 * ============================================================ */

function getCycleInsight(cycleDay, phaseName) {
  if (!cycleDay || !phaseName) return null;
  
  if (cycleDay >= 1 && cycleDay <= 14) {
    const isMenstruation = cycleDay <= 5;
    return {
      icon: isMenstruation ? '🩸' : '🌱',
      title: isMenstruation ? '月经期 · 低激素期' : '卵泡期 · 低激素期',
      text: isMenstruation 
        ? '雌孕激素处于低谷，身体正在修复。你可能感觉精力逐渐回升，这是安排重要事务的好时机。'
        : '雌激素开始上升，你的精力和抗压能力都在增强。适合处理高难度工作、创造性任务。',
      tags: ['精力充沛', '专注力强', '食欲稳定'],
      nutritionTip: '可以正常饮食，身体对碳水化合物的利用效率较高。',
      energyTip: '下午能量通常较好，适合安排重要会议'
    };
  }
  
  if (cycleDay >= 14 && cycleDay <= 16) {
    return {
      icon: '✨',
      title: '排卵期 · 能量高峰',
      text: '雌激素达到峰值，你的能量、社交欲和创造力都处于月度高点。这是表现最佳的一天！',
      tags: ['能量高峰', '社交欲强', '创造力佳'],
      nutritionTip: '食欲通常很好，注意均衡饮食即可',
      energyTip: '全天精力充沛，是处理重要事务的黄金时间'
    };
  }
  
  const isLateLuteal = cycleDay >= 22;
  return {
    icon: isLateLuteal ? '🌙' : '🍂',
    title: isLateLuteal ? `黄体期第${cycleDay - 16}天 · 经前阶段` : '黄体期 · 高激素期',
    text: isLateLuteal
      ? '孕激素和雌激素即将骤降。你可能会感到疲劳、情绪波动，对甜食和碳水的渴望增强。这是身体的正常信号，给自己多一些耐心。'
      : '孕激素升高，身体处于分解代谢状态。你可能会感觉比上周更容易疲劳，睡眠质量下降。',
    tags: isLateLuteal ? ['易疲劳', '情绪波动', '想吃甜食'] : ['易疲劳', '睡眠浅', '食欲增加'],
    nutritionTip: '增加蛋白质摄入（每餐30g），多吃复合碳水，避免简单糖分。',
    energyTip: isLateLuteal ? '下午容易能量低谷，建议安排低强度工作，晚上早点休息' : '下午可能会有能量下滑，注意补充蛋白质零食'
  };
}

function renderCycleInsight(cycleDay, phaseName) {
  const insight = getCycleInsight(cycleDay, phaseName);
  if (!insight) return '';
  
  const tagsHtml = insight.tags.map(tag => `<span class="cycle-insight-tag">${tag}</span>`).join('');
  
  return `
    <div class="cycle-insight">
      <div class="cycle-insight-title">${insight.icon} ${insight.title}</div>
      <div class="cycle-insight-text">${insight.text}</div>
      <div class="cycle-insight-tags">${tagsHtml}</div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted);padding-top:8px;border-top:1px dashed var(--border)">
        <div>🍽️ ${insight.nutritionTip}</div>
        <div style="margin-top:4px">⚡ ${insight.energyTip}</div>
      </div>
    </div>
  `;
}

/* ============================================================
 * 🧩 模块10: 动态标签推荐 (DYNAMIC_TAGS)
 * 功能：根据周期阶段推荐标签
 * ============================================================ */

/**
 * 根据周期阶段获取推荐标签
 * @param {number} cycleDay - 周期第几天
 * @returns {Array} 推荐标签列表
 */
function getRecommendedChipsForPhase(cycleDay) {
  if (!cycleDay) return [];
  
  // 低激素期（月经期 + 卵泡期）
  if (cycleDay >= 1 && cycleDay <= 14) {
    return ['专注', '创意', '食欲稳定', '精力充沛'];
  }
  
  // 排卵期
  if (cycleDay >= 14 && cycleDay <= 16) {
    return ['社交活跃', '能量高峰', '自信', '表现佳'];
  }
  
  // 黄体期早期
  if (cycleDay >= 17 && cycleDay <= 21) {
    return ['易疲劳', '食欲增加', '睡眠浅'];
  }
  
  // 经前阶段（黄体期末）
  return ['想吃甜食', '情绪化', '易烦躁', '水肿感', '疲劳'];
}

/**
 * 渲染推荐标签UI
 * @param {number} cycleDay - 周期第几天
 * @returns {string} HTML字符串
 */
function renderRecommendedChips(cycleDay) {
  const chips = getRecommendedChipsForPhase(cycleDay);
  if (chips.length === 0) return '';
  
  const chipsHtml = chips.map(chip => 
    `<span class="chip" onclick="toggleChip(this)" style="background:var(--accent-light);color:var(--accent)">${chip}</span>`
  ).join('');
  
  return `
    <div style="margin-bottom:10px;padding:10px;background:#f8f9fa;border-radius:8px;border-left:2px solid var(--accent)">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">💡 本周期的你可能会有这些感受（点击选择）</div>
      <div class="chips">${chipsHtml}</div>
    </div>
  `;
}

/* ============================================================
 * 🧩 模块11: 评分基准线 (SCORE_BENCHMARK)
 * 根据周期阶段调整评分预期，避免焦虑
 * ============================================================ */

/**
 * 获取周期阶段的合理评分预期
 * @param {number} cycleDay - 周期第几天
 * @returns {Object} 各项评分的预期范围
 */
function getScoreBenchmark(cycleDay) {
  if (!cycleDay) return null;
  
  // 低激素期（月经期 + 卵泡期）- 高能量期
  if (cycleDay >= 1 && cycleDay <= 14) {
    return {
      energy: { min: 6, max: 10, expected: 8 },
      mood: { min: 6, max: 10, expected: 8 },
      focus: { min: 6, max: 10, expected: 8 },
      social: { min: 6, max: 10, expected: 7 },
      appetite: { min: 4, max: 8, expected: 6 },
      message: '低激素期：你的身体状态接近最佳，可以期待高能量表现'
    };
  }
  
  // 排卵期 - 峰值期
  if (cycleDay >= 14 && cycleDay <= 16) {
    return {
      energy: { min: 7, max: 10, expected: 9 },
      mood: { min: 7, max: 10, expected: 9 },
      focus: { min: 7, max: 10, expected: 9 },
      social: { min: 7, max: 10, expected: 9 },
      appetite: { min: 5, max: 8, expected: 7 },
      message: '排卵期：你的能量处于月度高峰，适合挑战重要目标'
    };
  }
  
  // 黄体期早期 - 开始下滑
  if (cycleDay >= 17 && cycleDay <= 21) {
    return {
      energy: { min: 5, max: 8, expected: 6 },
      mood: { min: 5, max: 8, expected: 6 },
      focus: { min: 5, max: 8, expected: 6 },
      social: { min: 4, max: 7, expected: 5 },
      appetite: { min: 6, max: 9, expected: 7 },
      message: '黄体期：身体进入恢复期，能量自然下降是正常的，不要苛责自己'
    };
  }
  
  // 经前阶段（黄体期末）- 低谷期
  return {
    energy: { min: 3, max: 7, expected: 5 },
    mood: { min: 3, max: 7, expected: 5 },
    focus: { min: 3, max: 7, expected: 5 },
    social: { min: 3, max: 6, expected: 4 },
    appetite: { min: 6, max: 10, expected: 8 },
    message: '经前阶段：激素波动最大，疲劳和情绪波动是正常生理反应'
  };
}

/**
 * 渲染评分基准线提示
 * @param {number} cycleDay - 周期第几天
 * @returns {string} HTML字符串
 */
function renderScoreBenchmark(cycleDay) {
  const benchmark = getScoreBenchmark(cycleDay);
  if (!benchmark) return '';
  
  return `
    <div style="margin-bottom:12px;padding:12px;background:linear-gradient(135deg,#fff9f0 0%,#fff 100%);border-radius:8px;border-left:3px solid #f39c12">
      <div style="font-size:12px;font-weight:600;color:#f39c12;margin-bottom:6px">📊 本期评分参考</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:8px">${benchmark.message}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:11px">
        <span style="padding:3px 8px;background:#fff;border-radius:12px;border:1px solid #eee">精力 ${benchmark.energy.min}-${benchmark.energy.max}</span>
        <span style="padding:3px 8px;background:#fff;border-radius:12px;border:1px solid #eee">心情 ${benchmark.mood.min}-${benchmark.mood.max}</span>
        <span style="padding:3px 8px;background:#fff;border-radius:12px;border:1px solid #eee">专注 ${benchmark.focus.min}-${benchmark.focus.max}</span>
        <span style="padding:3px 8px;background:#fff;border-radius:12px;border:1px solid #eee">社交 ${benchmark.social.min}-${benchmark.social.max}</span>
      </div>
    </div>
  `;
}

/* ============================================================
 * 🧩 模块12: 饮食干预提醒 (DIET_REMINDER)
 * 黄体期蛋白质+复合碳水干预
 * ============================================================ */

/**
 * 获取饮食干预建议
 * @param {number} cycleDay - 周期第几天
 * @returns {Object|null} 饮食建议对象
 */
function getDietIntervention(cycleDay) {
  if (!cycleDay) return null;
  
  // 黄体期 - 需要蛋白质和复合碳水
  if (cycleDay >= 17 && cycleDay <= 28) {
    const isLateLuteal = cycleDay >= 22;
    return {
      title: isLateLuteal ? '🍽️ 经前饮食重点' : '🍽️ 黄体期饮食重点',
      priority: isLateLuteal ? 'high' : 'normal',
      tips: [
        { icon: '🥩', text: '每餐30g蛋白质（鸡蛋、鱼、豆腐）', why: '对抗分解代谢，稳定血糖' },
        { icon: '🌾', text: '多吃复合碳水（燕麦、红薯、糙米）', why: '提供持续能量，减少甜食渴望' },
        { icon: '🚫', text: '避免简单糖分', why: '血糖波动加剧情绪不稳' }
      ],
      mealIdeas: isLateLuteal 
        ? ['早餐：燕麦+鸡蛋+坚果', '午餐：三文鱼+红薯+蔬菜', '加餐：希腊酸奶+蓝莓']
        : ['早餐：全麦面包+鸡蛋+牛油果', '午餐：鸡胸肉+糙米+西兰花', '加餐：豆腐干+少量坚果']
    };
  }
  
  return null;
}

/**
 * 渲染饮食干预提醒
 * @param {number} cycleDay - 周期第几天
 * @returns {string} HTML字符串
 */
function renderDietIntervention(cycleDay) {
  const diet = getDietIntervention(cycleDay);
  if (!diet) return '';
  
  const tipsHtml = diet.tips.map(tip => `
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
      <span style="font-size:16px">${tip.icon}</span>
      <div>
        <div style="font-size:12px;font-weight:500">${tip.text}</div>
        <div style="font-size:11px;color:var(--muted)">${tip.why}</div>
      </div>
    </div>
  `).join('');
  
  const borderColor = diet.priority === 'high' ? '#e74c3c' : '#f39c12';
  
  return `
    <div style="margin-bottom:12px;padding:12px;background:linear-gradient(135deg,#fff5f5 0%,#fff 100%);border-radius:8px;border-left:3px solid ${borderColor}">
      <div style="font-size:13px;font-weight:600;color:${borderColor};margin-bottom:10px">${diet.title}</div>
      ${tipsHtml}
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px">💡 推荐搭配示例：</div>
        <div style="font-size:11px;line-height:1.6">${diet.mealIdeas.join(' → ')}</div>
      </div>
    </div>
  `;
}

/* ============================================================
 * 🧩 模块14: 主动话题引擎 (PROACTIVE_TOPICS)
 * AI主动找话题，不等待用户提问
 * ============================================================ */

// 主动话题生成器
function generateProactiveTopic(cycleDay, phaseName, recentContext, lastUserMessage) {
  const topics = [];
  const hour = new Date().getHours();
  
  // 根据周期阶段生成话题
  if (cycleDay >= 17 && cycleDay <= 28) {
    // 黄体期/经前阶段
    topics.push(
      "黄体期更容易疲劳，今天整体感觉怎么样？",
      "如果今天状态一般，也可以把任务缩到很小，先做一点点就好。",
      "孕激素上升期想吃甜食更常见，这更像生理波动，不必太责怪自己。",
      "最近有没有哪个小习惯，是你想继续稳住的？"
    );
  } else if (cycleDay >= 14 && cycleDay <= 16) {
    // 排卵期
    topics.push(
      "今天可能接近能量高峰，有没有什么重要的事想趁状态好推进一下？",
      "排卵期有些人会更想表达和连接，今天想和谁聊聊吗？",
      "如果你今天状态不错，也许适合试试一个有点挑战的小目标。"
    );
  } else {
    // 低激素期
    topics.push(
      "这个阶段不少人的精力会慢慢回升，今天有什么计划？",
      "最近有没有什么内容、播客或书让你很有共鸣？",
      "如果今天脑子比较清爽，也许可以顺手推进一个难一点的问题。"
    );
  }
  
  // 根据时间段生成话题
  if (hour >= 6 && hour < 12) {
    topics.push("早！新的一天开始了，今天有什么期待？");
  } else if (hour >= 14 && hour < 17) {
    topics.push("下午容易犯困诶，要不要站起来活动一下？");
  } else if (hour >= 21) {
    topics.push("晚上了诶，今天过得怎么样？有什么想聊的吗？");
  }
  
  // 根据用户近期状态跟进
  if (recentContext && recentContext.dailySummaries) {
    const yesterday = recentContext.dailySummaries.find(d => d.dayOffset === -1);
    if (yesterday && yesterday.avgScores) {
      if (yesterday.avgScores.mood < 5) {
        topics.push("昨天心情不太好，今天感觉好些了吗？");
      }
      if (yesterday.avgScores.energy < 5) {
        topics.push("昨天你说精力不好，今天恢复了吗？");
      }
    }
  }
  
  // 随机返回一个话题
  return topics[Math.floor(Math.random() * topics.length)];
}

// 主动话题定时器
let proactiveTopicTimer = null;
const PROACTIVE_DELAY = 3 * 60 * 1000; // 3分钟无互动后触发

function startProactiveTopicTimer() {
  if (proactiveTopicTimer) clearTimeout(proactiveTopicTimer);
  
  proactiveTopicTimer = setTimeout(async () => {
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;
    
    // 检查最后一条消息是否来自AI（如果是，说明用户没回复，触发主动话题）
    const lastMsg = aiConversation[aiConversation.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      // 获取当前周期信息
      const cycleDay = await getCycleDay(currentRecDate);
      const phase = getPhase(cycleDay);
      
      // 获取近期上下文
      const recentContext = await getRecentContext(currentRecDate);
      
      // 生成主动话题
      const topic = generateProactiveTopic(cycleDay, phase?.name, recentContext);
      
      if (topic) {
        // 显示AI主动消息
        const html = '<div class="ai-msg ai proactive">💬 ' + topic + '</div>';
        messagesEl.innerHTML += html;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        
        // 添加到对话历史
        aiConversation.push({ 
          role: 'assistant', 
          content: topic,
          isProactive: true 
        });
        
        // 保存对话
        await saveAIConversation(currentRecDate, aiConversation);
      }
    }
  }, PROACTIVE_DELAY);
}

// 重置定时器（用户发送消息时调用）
function resetProactiveTimer() {
  startProactiveTopicTimer();
}

/* ============================================================
 * 🧩 模块15: 长期记忆学习系统 (LONG_TERM_MEMORY)
 * AI学习用户偏好、成功习惯、反复抱怨的事
 * ============================================================ */

// 长期记忆数据结构
function getLongTermMemoryKey(userId = currentUserId) {
  return `${userId}_smc_longterm_memory_v1`;
}

// 初始化/获取长期记忆
function getLongTermMemory() {
  const userKey = getLongTermMemoryKey();
  const stored = localStorage.getItem(userKey);
  if (stored) {
    return JSON.parse(stored);
  }
  const legacyStored = localStorage.getItem('smc_longterm_memory_v1');
  if (legacyStored) {
    localStorage.setItem(userKey, legacyStored);
    return JSON.parse(legacyStored);
  }
  return {
    userPreferences: {},      // 用户偏好（喜欢的书、食物等）
    successfulHabits: [],     // 成功的小习惯
    recurringComplaints: [],  // 反复抱怨的事
    positivePatterns: [],     // 积极行为模式
    cycleInsights: {},        // 周期相关的个人洞察
    lastUpdated: Date.now()
  };
}

// 保存长期记忆
function saveLongTermMemory(memory) {
  memory.lastUpdated = Date.now();
  localStorage.setItem(getLongTermMemoryKey(), JSON.stringify(memory));
}

// 从对话中提取洞察
function extractInsightsFromConversation(userMsg, aiReply, cycleDay) {
  const memory = getLongTermMemory();
  let updated = false;
  
  // 1. 提取偏好（喜欢的书籍、食物、活动等）
  const bookKeywords = ['遥远的救世主', '天幕红尘', '福格', '微习惯', '在读', '喜欢', '推荐'];
  const foodKeywords = ['喜欢', '爱吃', '讨厌', '不吃', '奶茶', '咖啡', '甜食'];
  const activityKeywords = ['喜欢', '享受', '讨厌', '烦', '运动', '瑜伽', '跑步', '散步'];
  
  // 检测书籍偏好
  if (bookKeywords.some(k => userMsg.includes(k))) {
    const bookMatch = userMsg.match(/喜欢[《"'](.+?)[》"']/);
    if (bookMatch && !memory.userPreferences.favoriteBooks?.includes(bookMatch[1])) {
      memory.userPreferences.favoriteBooks = memory.userPreferences.favoriteBooks || [];
      memory.userPreferences.favoriteBooks.push(bookMatch[1]);
      updated = true;
    }
  }
  
  // 检测成功的小习惯
  const habitSuccessKeywords = ['做到了', '完成了', '坚持了', '打卡成功', '微习惯'];
  if (habitSuccessKeywords.some(k => userMsg.includes(k) || aiReply.includes(k))) {
    const habitMatch = userMsg.match(/(每天|坚持|打卡|做了)(.+?)(打卡|天|次|页|个)/);
    if (habitMatch) {
      const habit = habitMatch[2].trim();
      if (!memory.successfulHabits.some(h => h.name === habit)) {
        memory.successfulHabits.push({
          name: habit,
          firstDetected: Date.now(),
          lastMentioned: Date.now(),
          count: 1,
          cycleContext: cycleDay
        });
        updated = true;
      } else {
        const existing = memory.successfulHabits.find(h => h.name === habit);
        existing.count++;
        existing.lastMentioned = Date.now();
        updated = true;
      }
    }
  }
  
  // 3. 检测反复抱怨的事
  const complaintKeywords = ['累', '烦', '压力大', '焦虑', '睡不好', '不想动', '困'];
  if (complaintKeywords.some(k => userMsg.includes(k))) {
    const complaint = complaintKeywords.find(k => userMsg.includes(k));
    const existing = memory.recurringComplaints.find(c => c.keyword === complaint);
    if (!existing) {
      memory.recurringComplaints.push({
        keyword: complaint,
        firstMentioned: Date.now(),
        lastMentioned: Date.now(),
        count: 1,
        cycleContext: cycleDay
      });
      updated = true;
    } else {
      existing.count++;
      existing.lastMentioned = Date.now();
      updated = true;
    }
  }
  
  // 4. 周期洞察（用户在特定周期的表现）
  if (cycleDay) {
    const phase = getPhase(cycleDay);
    if (phase) {
      memory.cycleInsights[phase.name] = memory.cycleInsights[phase.name] || {
        mentionedCount: 0,
        commonMoods: [],
        successfulStrategies: []
      };
      memory.cycleInsights[phase.name].mentionedCount++;
      
      // 如果AI建议了有效的方法，记录下来
      if (aiReply.includes('试试') || aiReply.includes('建议')) {
        const strategy = aiReply.match(/试试(.+?)[。！]/);
        if (strategy) {
          memory.cycleInsights[phase.name].successfulStrategies.push({
            strategy: strategy[1],
            date: Date.now()
          });
          updated = true;
        }
      }
    }
  }
  
  if (updated) {
    saveLongTermMemory(memory);
  }
  
  return memory;
}

// 格式化长期记忆为Prompt文本
function formatLongTermMemoryForPrompt() {
  const memory = getLongTermMemory();
  let text = '';
  
  // 用户偏好
  if (memory.userPreferences.favoriteBooks?.length > 0) {
    text += `- 喜欢的书：${memory.userPreferences.favoriteBooks.join('、')}\n`;
  }
  
  // 成功的小习惯（按次数排序，取前3）
  const topHabits = memory.successfulHabits
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  if (topHabits.length > 0) {
    text += `- 成功的微习惯：${topHabits.map(h => h.name).join('、')}\n`;
  }
  
  // 反复抱怨的事（如果次数>2）
  const frequentComplaints = memory.recurringComplaints
    .filter(c => c.count > 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  if (frequentComplaints.length > 0) {
    text += `- 反复出现的困扰：${frequentComplaints.map(c => c.keyword).join('、')}\n`;
  }
  
  // 周期洞察
  if (Object.keys(memory.cycleInsights).length > 0) {
    text += `- 周期规律：\n`;
    for (const [phase, insight] of Object.entries(memory.cycleInsights)) {
      if (insight.successfulStrategies.length > 0) {
        const recentStrategy = insight.successfulStrategies.slice(-1)[0];
        text += `  · ${phase}的有效方法：${recentStrategy.strategy}\n`;
      }
    }
  }
  
  return text || '暂无长期记忆';
}

// 根据长期记忆生成个性化建议
function getPersonalizedAdvice(context) {
  const memory = getLongTermMemory();
  const advice = [];
  
  // 如果用户有成功的微习惯，在ta想放弃时提醒
  if (memory.successfulHabits.length > 0 && context.userWantsToGiveUp) {
    const habit = memory.successfulHabits[0];
    advice.push(`你之前${habit.name}坚持得很好诶，用同样的微习惯策略！`);
  }
  
  // 如果用户反复抱怨某件事，给出针对性建议
  const frequentComplaint = memory.recurringComplaints
    .filter(c => c.count > 2)
    .sort((a, b) => b.count - a.count)[0];
  if (frequentComplaint && context.currentMood === frequentComplaint.keyword) {
    advice.push(`我注意到你经常说"${frequentComplaint.keyword}"，这是周期第${context.cycleDay}天的正常反应，不是你的问题😏`);
  }
  
  return advice;
}

// 修改原有的getMemory函数，整合长期记忆
async function getMemory(type) {
  if (type === 'longterm') {
    return formatLongTermMemoryForPrompt();
  }
  return '';
}

// 在AI对话结束后提取洞察（需要在sendAI函数中调用）
async function learnFromConversation(userMsg, aiReply, cycleDay) {
  extractInsightsFromConversation(userMsg, aiReply, cycleDay);
}

/* ============================================================
 * 🧩 模块13: 待扩展模块预留位置
 * ============================================================ */
