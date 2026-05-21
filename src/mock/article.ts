export const ARTICLE_MARKDOWN = `# React Hooks 原理：从 useState 到 Fiber 的执行栈

Hooks 表面上是几个普通的函数调用，本质却是一套精心设计的"链式状态机"。要真正理解它，你需要回到 React 的渲染模型——**Fiber 架构**——以及 Hooks 在每次渲染时所依赖的"调用顺序契约"。

## 一、为什么 Hooks 必须按相同顺序调用？

很多开发者最早接触 Hooks 时都被一条铁律困扰：**不能在条件分支或循环里调用 Hook**。这不是 React 故意刁难，而是底层数据结构决定的物理约束。

每个函数组件在 Fiber 节点上挂着一条 **Hooks 链表**。第一次渲染时，React 按调用顺序依次创建 hook 节点：useState → useEffect → useRef，每个节点记录自己的状态值。第二次渲染时，React 不会"按名字"找回这些 hook，而是按**调用顺序**复用上次的节点。如果你在 if 分支里跳过了一个 useState，整条链表的下标就会错位，下一个 hook 会读到错误的状态。

## 二、useState 内部到底做了什么？

useState 不是魔法，而是一个返回 \`[state, dispatch]\` 元组的工厂函数。它的内部大致等价于：

\`\`\`js
function useState(initial) {
  const hook = getCurrentHook();
  if (hook.state === undefined) {
    hook.state = typeof initial === 'function' ? initial() : initial;
  }
  const setState = (next) => scheduleUpdate(hook, next);
  return [hook.state, setState];
}
\`\`\`

关键在于 \`getCurrentHook()\`——它从当前 Fiber 节点的 hooks 链表里按指针取出下一个节点。每次 render 开始时指针归零，每次 hook 调用让指针 +1。这就是"顺序契约"在代码里的真实样子。

## 三、useEffect 与渲染的时序

useEffect 并不是在 render 期间执行的，而是在 React **提交完 DOM 变更之后**异步触发的。渲染阶段只是把 effect 的 create/destroy 函数登记到 Fiber 上，真正的执行被推到 commit 阶段之后的微任务里。

这意味着 effect 的依赖比较、清理函数的调用顺序，全部依赖 Fiber 在 commit 阶段构造的"待处理 effect 链表"。当一个组件被卸载时，React 会按链表倒序调用所有 cleanup——这也是为什么订阅事件时记得返回清理函数如此重要。

## 四、闭包陷阱：旧 state 是从哪里来的？

最经典的 Hooks 陷阱：在 useEffect 或 setTimeout 回调里读到了"过期"的 state。这并不是 React 的 bug，而是 JavaScript 闭包的天性。

每次组件渲染都会生成一份全新的函数闭包，里面"冻结"了那次渲染时的 state 值。如果你在异步回调里读 state，读到的就是回调被创建时那次渲染的快照，而不是最新值。解决办法要么是用 \`setState(prev => ...)\` 拿到最新值，要么是用 ref 把"最新值"挂出来跨渲染共享。

## 五、自定义 Hook：组合而非继承

Hooks 真正的威力在于**组合**。一个自定义 Hook 不过是普通函数，但因为它内部调用了其他 Hook，就自动获得了与组件生命周期对齐的能力。useDebounce、useLocalStorage、useFetch——所有这些社区方案，本质都是把多个原生 Hook 编织成一个语义化更高的接口。

这种横向组合替代了 class 时代的 mixin、HOC、render props，是 React 团队认为"函数式组件 + Hooks"优于"class + 生命周期"的核心论据。

---

> 看到这里，你大概已经在脑子里冒出了几个问题：什么是闭包？Fiber 到底长什么样？为什么 useEffect 的 cleanup 要倒序执行？
>
> 现在你不需要立刻去 Google 这些问题——选中那段你不懂的文字，点击"❓ 深入追问"，把每个问题压入它自己的栈层。读完答案，再 \`return\` 回主干，继续读下去。
`;
