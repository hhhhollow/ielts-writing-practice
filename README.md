# IELTS Writing Practice

一个本地优先的雅思写作计时练习工具。无需账号或后端，练习内容保存在浏览器中。

## 功能

- Cambridge IELTS 18–21 共 16 套 Task 1 / Task 2 真题
- Task 1 / Task 2 切换、目标词数和实时统计
- 计时、自动草稿、历史记录与版本恢复
- 拼写检查、文本荧光标记、打印和 HTML 备份
- Task 1 图片粘贴、拖放和替换

## 使用

直接打开 `index.html` 即可。为了获得更稳定的浏览器存储行为，也可以启动本地静态服务器：

```bash
npm start
```

## 项目结构

```text
index.html                 页面结构
assets/app.js              练习、计时和本地存储逻辑
assets/styles.css          页面与打印样式
assets/questions/          Task 1 题目图片
data/question-bank.js      结构化题库
import-question-bank.js    Markdown 题库导入工具
tests/                     数据与资源完整性测试
```

## 校验

```bash
npm test
npm run check
```

## 更新题库

先安装开发依赖，再导入符合现有标题格式的 Markdown 文件：

```bash
npm install
npm run import:questions -- ./question-bank.md
```

也可以指定输出位置：

```bash
node import-question-bank.js ./question-bank.md \
  --output data/question-bank.js \
  --images assets/questions
```
