import { demoCampaign } from '../demo.js';

export default demoCampaign({
  title: 'Lumen Learning', duration: 42,
  labels: ['Choose a topic', 'Preview the outline', 'Practice actively', 'Connect ideas', 'Review and repeat'],
  captions: [
    ['从一个问题开始', 'Start with a question'],
    ['先看结构，再学细节', 'See the outline before the detail'],
    ['把理解变成练习', 'Turn understanding into practice'],
    ['连接概念，而非堆积笔记', 'Connect ideas, not just notes'],
    ['复习，让知识留下来', 'Review with intention'],
  ],
});
