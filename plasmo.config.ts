import { defineConfig } from "plasmo"

// manifest 以 package.json "manifest" 键为准(与上游原始布局一致,
// 本文件仅兜底 dev 场景;两处取值必须保持一致)。
export default defineConfig({
  manifest: () => ({
    manifest_version: 3,
    permissions: ["storage", "unlimitedStorage", "offscreen", "alarms", "scripting"],
    // 拼多多商家工作台(功能宿主)+ hf-mirror.com(嵌入模型 CDN,
    // 扩展页跨域 fetch 需 host 权限才能绕过 CORS)。
    host_permissions: [
      "https://mms.pinduoduo.com/*",
      "https://hf-mirror.com/*"
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    },
    action: {
      default_title: "拼多多客服快捷回复",
      default_popup: "popup.html"
    },
    web_accessible_resources: [
      {
        resources: ["assets/icon.png"],
        matches: ["https://mms.pinduoduo.com/*"]
      }
    ]
  })
})
