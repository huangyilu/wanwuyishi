// vite.config.ts
import { defineConfig } from "file:///Users/huangyilu/WorkBuddy/%E7%8E%A9%E6%97%A0%E4%B8%80%E5%A4%B1/node_modules/vitest/dist/config.js";
import react from "file:///Users/huangyilu/WorkBuddy/%E7%8E%A9%E6%97%A0%E4%B8%80%E5%A4%B1/node_modules/@vitejs/plugin-react/dist/index.js";
import { fileURLToPath, URL } from "node:url";
var __vite_injected_original_import_meta_url = "file:///Users/huangyilu/WorkBuddy/%E7%8E%A9%E6%97%A0%E4%B8%80%E5%A4%B1/vite.config.ts";
var vite_config_default = defineConfig({
  // GitHub Pages 项目页部署在 username.github.io/<repo>/ 子路径下，
  // 用相对路径让资源与路由在子路径、以及离线 file:// 下都能加载
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    }
  },
  server: {
    port: 5273,
    strictPort: false
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        // 双端分流的代码分割在 AppShell 的动态 import 里完成，
        // 这里只把体积大且两端都不首屏需要的库单独切出去
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"]
        }
      }
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvaHVhbmd5aWx1L1dvcmtCdWRkeS9cdTczQTlcdTY1RTBcdTRFMDBcdTU5MzFcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9odWFuZ3lpbHUvV29ya0J1ZGR5L1x1NzNBOVx1NjVFMFx1NEUwMFx1NTkzMS92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvaHVhbmd5aWx1L1dvcmtCdWRkeS8lRTclOEUlQTklRTYlOTclQTAlRTQlQjglODAlRTUlQTQlQjEvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoLCBVUkwgfSBmcm9tICdub2RlOnVybCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIC8vIEdpdEh1YiBQYWdlcyBcdTk4NzlcdTc2RUVcdTk4NzVcdTkwRThcdTdGNzJcdTU3MjggdXNlcm5hbWUuZ2l0aHViLmlvLzxyZXBvPi8gXHU1QjUwXHU4REVGXHU1Rjg0XHU0RTBCXHVGRjBDXG4gIC8vIFx1NzUyOFx1NzZGOFx1NUJGOVx1OERFRlx1NUY4NFx1OEJBOVx1OEQ0NFx1NkU5MFx1NEUwRVx1OERFRlx1NzUzMVx1NTcyOFx1NUI1MFx1OERFRlx1NUY4NFx1MzAwMVx1NEVFNVx1NTNDQVx1NzlCQlx1N0VCRiBmaWxlOi8vIFx1NEUwQlx1OTBGRFx1ODBGRFx1NTJBMFx1OEY3RFxuICBiYXNlOiAnLi8nLFxuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vc3JjJywgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTI3MyxcbiAgICBzdHJpY3RQb3J0OiBmYWxzZSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICB0YXJnZXQ6ICdlczIwMjAnLFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICAvLyBcdTUzQ0NcdTdBRUZcdTUyMDZcdTZENDFcdTc2ODRcdTRFRTNcdTc4MDFcdTUyMDZcdTUyNzJcdTU3MjggQXBwU2hlbGwgXHU3Njg0XHU1MkE4XHU2MDAxIGltcG9ydCBcdTkxQ0NcdTVCOENcdTYyMTBcdUZGMENcbiAgICAgICAgLy8gXHU4RkQ5XHU5MUNDXHU1M0VBXHU2MjhBXHU0RjUzXHU3OUVGXHU1OTI3XHU0RTE0XHU0RTI0XHU3QUVGXHU5MEZEXHU0RTBEXHU5OTk2XHU1QzRGXHU5NzAwXHU4OTgxXHU3Njg0XHU1RTkzXHU1MzU1XHU3MkVDXHU1MjA3XHU1MUZBXHU1M0JCXG4gICAgICAgIG1hbnVhbENodW5rczoge1xuICAgICAgICAgIHZlbmRvcjogWydyZWFjdCcsICdyZWFjdC1kb20nLCAncmVhY3Qtcm91dGVyLWRvbSddLFxuICAgICAgICAgIHF1ZXJ5OiBbJ0B0YW5zdGFjay9yZWFjdC1xdWVyeSddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICB0ZXN0OiB7XG4gICAgZW52aXJvbm1lbnQ6ICdub2RlJyxcbiAgICBpbmNsdWRlOiBbJ3NyYy8qKi8qLnRlc3QudHMnXSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUErUyxTQUFTLG9CQUFvQjtBQUM1VSxPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlLFdBQVc7QUFGbUksSUFBTSwyQ0FBMkM7QUFJdk4sSUFBTyxzQkFBUSxhQUFhO0FBQUE7QUFBQTtBQUFBLEVBRzFCLE1BQU07QUFBQSxFQUNOLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxLQUFLLGNBQWMsSUFBSSxJQUFJLFNBQVMsd0NBQWUsQ0FBQztBQUFBLElBQ3REO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLEVBQ2Q7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLGVBQWU7QUFBQSxNQUNiLFFBQVE7QUFBQTtBQUFBO0FBQUEsUUFHTixjQUFjO0FBQUEsVUFDWixRQUFRLENBQUMsU0FBUyxhQUFhLGtCQUFrQjtBQUFBLFVBQ2pELE9BQU8sQ0FBQyx1QkFBdUI7QUFBQSxRQUNqQztBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osYUFBYTtBQUFBLElBQ2IsU0FBUyxDQUFDLGtCQUFrQjtBQUFBLEVBQzlCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
