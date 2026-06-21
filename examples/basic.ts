// Example 1: Minimal initialization
import { initialize } from "@agstack/logger";

initialize({
  storage: {
    type: "postgres",
    url: process.env.DATABASE_URL,
  },
});

// Example 2: With AI analysis
import { initialize as init2 } from "@agstack/logger";

init2({
  storage: {
    type: "file",
  },
  ai: {
    enabled: true,
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY,
  },
  notifications: {
    providers: [
      {
        type: "slack",
        name: "alerts",
        config: {
          webhook_url: process.env.SLACK_WEBHOOK_URL!,
        },
      },
    ],
    rules: [
      {
        name: "High Error Rate",
        condition: {
          field: "response.statusCode",
          operator: "gte",
          value: 500,
          window: 300000,
          count: 10,
        },
        providers: ["alerts"],
        throttle: 60000,
      },
    ],
  },
});

// Example 3: Auto-init (no config)
import "@agstack/logger/init";
