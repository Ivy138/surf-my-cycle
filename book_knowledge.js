// 📚 书籍知识库 - 叶子的人生智慧库
const BOOK_KNOWLEDGE_BASE = {
  // 1. 遥远的救世主
  "遥远的救世主": {
    author: "豆豆",
    coreConcepts: [
      {
        concept: "强势文化vs弱势文化",
        description: "强势文化遵循事物规律，弱势文化依赖强者的道德期望破格获取",
        quotes: [
          "透视社会依次有三个层面：技术、制度和文化。",
          "强势文化造就强者，弱势文化造就弱者。",
          "天道，不以人的意志为转移。"
        ],
       应用场景: ["用户抱怨时", "用户想依赖他人时", "用户找借口时"]
      },
      {
        concept: "实事求是",
        description: "按客观规律办事，不凭主观臆断",
        quotes: [
          "神即道，道法自然，如来。",
          "规律如来，不容思议。"
        ],
        应用场景: ["用户纠结选择时", "用户想走捷径时"]
      },
      {
        concept: "靠自己",
        description: "救世主只有自己，他人无法拯救你",
        quotes: [
          "如果我的能力只能让我穷困潦倒，那穷困潦倒就是我的价值。",
          "生存法则很简单，就是忍人所不忍，能人所不能。"
        ],
        应用场景: ["用户自我怀疑时", "用户想放弃时"]
      }
    ]
  },

  // 2. 天幕红尘
  "天幕红尘": {
    author: "豆豆",
    coreConcepts: [
      {
        concept: "见路不走",
        description: "不盲从他人经验，走适合自己的路",
        quotes: [
          "见路不走，即见因果。",
          "路是走出来的，不是想出来的。",
          "经验是错的，条件是变的。"
        ],
        应用场景: ["用户纠结选择时", "用户模仿他人时", "用户焦虑比较时"]
      },
      {
        concept: "实事求是",
        description: "从实际出发，不唯书不唯上只唯实",
        quotes: [
          "一切以时间、地点、条件为转移。",
          "不存在放之四海而皆准的真理。"
        ],
        应用场景: ["用户想套用模板时", "用户纠结标准答案时"]
      }
    ]
  },

  // 3. 福格行为模型
  "福格行为模型": {
    author: "BJ Fogg",
    coreConcepts: [
      {
        concept: "B=MAP",
        description: "行为=动机+能力+提示，三者缺一不可",
        quotes: [
          "行为发生在动机、能力、提示同时满足时。",
          "动机不可靠，能力是关键。"
        ],
        应用场景: ["用户想改变习惯时", "用户失败自责时"]
      },
      {
        concept: "降低能力门槛",
        description: "让行为小到不可能失败",
        quotes: [
          "如果行为很难，就降低能力要求。",
          "庆祝小胜利，感受成功。"
        ],
        应用场景: ["用户觉得任务太难时", "用户拖延时"]
      },
      {
        concept: "设计提示",
        description: "用锚点时刻触发行为",
        quotes: [
          "在我...之后，我会...",
          "利用已有习惯作为触发器。"
        ],
        应用场景: ["用户想建立新习惯时"]
      }
    ]
  },

  // 4. 微习惯
  "微习惯": {
    author: "Stephen Guise",
    coreConcepts: [
      {
        concept: "小到不可能失败",
        description: "目标小到无法拒绝，比如1个俯卧撑",
        quotes: [
          "微习惯太小，小到不可能失败。",
          "超额完成是额外奖励，不是要求。",
          "只要做了，就是胜利。"
        ],
        应用场景: ["用户觉得任务太难时", "用户想运动但不想动时", "用户想学习但犯困时"]
      },
      {
        concept: "消除阻力",
        description: "把起点降到零阻力",
        quotes: [
          "万事开头难，微习惯让开头变得容易。",
          "21天养成习惯是谎言，微习惯可以立即开始。"
        ],
        应用场景: ["用户拖延时", "用户想开始新项目时"]
      },
      {
        concept: " identity-based habits",
        description: "身份认同驱动习惯，而非目标",
        quotes: [
          "不是我要运动，而是我是运动的人。",
          "每一票都投给你想成为的人。"
        ],
        应用场景: ["用户想长期改变时", "用户失去动力时"]
      }
    ]
  }
};

// 🎯 智能引用函数 - 根据用户情况自动匹配书籍智慧
function getBookWisdom(context) {
  const { userMood, userMessage, cyclePhase, recentBehavior } = context;
  let wisdom = [];

  // 用户抱怨/依赖 → 遥远的救世主
  if (userMessage.includes("累") || userMessage.includes("难") || userMessage.includes("不想")) {
    wisdom.push({
      book: "遥远的救世主",
      concept: "强势文化",
      quote: "如果我的能力只能让我穷困潦倒，那穷困潦倒就是我的价值。",
      advice: "诶姐妹，又在说累了？😏 强势文化的人不靠别人拯救，靠自己。要不今天微习惯一下？"
    });
  }

  // 用户纠结选择 → 天幕红尘
  if (userMessage.includes("怎么选") || userMessage.includes("迷茫") || userMessage.includes("不知道")) {
    wisdom.push({
      book: "天幕红尘",
      concept: "见路不走",
      quote: "经验是错的，条件是变的。",
      advice: "见路不走懂不？别人成功经验不一定适合你，实事求是看你自己条件。"
    });
  }

  // 用户想改变但觉得难 → 福格+微习惯
  if (userMessage.includes("想") && (userMessage.includes("运动") || userMessage.includes("学习"))) {
    wisdom.push({
      book: "微习惯",
      concept: "小到不可能失败",
      quote: "微习惯太小，小到不可能失败。",
      advice: "《福格行为模型》说能力不够就降低难度！想做运动？先1个俯卧撑，小到不可能失败！"
    });
  }

  // 黄体期容易放弃 → 微习惯兜底
  if (cyclePhase === "黄体期" && userMood < 5) {
    wisdom.push({
      book: "微习惯",
      concept: "消除阻力",
      quote: "万事开头难，微习惯让开头变得容易。",
      advice: "黄体期容易 fatigue，这是正常的！用微习惯兜底，哪怕只做了1分钟也是胜利✓"
    });
  }

  return wisdom;
}

// 📖 格式化书籍知识为Prompt文本
function formatBookKnowledgeForPrompt() {
  let text = "\n## 【你的人生书库 - 叶子都读过】\n";
  
  for (const [bookName, book] of Object.entries(BOOK_KNOWLEDGE_BASE)) {
    text += `\n《${bookName}》（${book.author}）：\n`;
    book.coreConcepts.forEach((concept, idx) => {
      text += `  ${idx + 1}. ${concept.concept}：${concept.description}\n`;
      text += `     金句："${concept.quotes[0]}"\n`;
    });
  }
  
  text += "\n【引用原则】\n";
  text += "- 用户抱怨时 → 引用《遥远的救世主》强势文化\n";
  text += "- 用户纠结选择时 → 引用《天幕红尘》见路不走\n";
  text += "- 用户想改变但觉得难 → 引用《福格行为模型》B=MAP + 《微习惯》小到不可能失败\n";
  text += "- 引用要自然，像闺蜜聊天，不要说教\n";
  
  return text;
}
