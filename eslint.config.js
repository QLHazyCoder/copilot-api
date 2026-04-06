import config from "@echristian/eslint-config"

const baseConfig = config()

export default [
  ...(Array.isArray(baseConfig) ? baseConfig : [baseConfig]),
  {
    ignores: [
      ".claude-plugin/**",
      "claude-plugin/**",
      "copilot-api/**",
      "plugins/**",
    ],
  },
]
