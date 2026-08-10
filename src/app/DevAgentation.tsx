/**
 * 本地开发专用的「元素定位浮层」(agentation)。
 *
 * 作用：在页面右下角挂一个工具条，点任意元素就能生成带
 * CSS 选择器 / React 组件路径 / 坐标的结构化描述，方便把
 * "右下角那个按钮" 这种模糊描述变成可精确定位的代码引用。
 *
 * 关键约束：只在开发模式加载（`import.meta.env.DEV`）。
 * 生产构建里 `import.meta.env.DEV` 会被 Vite 静态替换成 false，
 * 整段动态 import 被摇树剔除，agentation 永远不会进入
 * GitHub Pages 的产物包。
 */
import { useEffect, useState, type ComponentType } from 'react';

export function DevAgentation() {
  const [Agentation, setAgentation] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    import('agentation')
      .then((m) => {
        if (alive) setAgentation(() => m.Agentation);
      })
      .catch(() => {
        // 开发态加载失败不应影响应用本身
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!Agentation) return null;
  return <Agentation />;
}
