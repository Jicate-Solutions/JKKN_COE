/**
 * JKKN COE – Multi-Agent Workflow Runner
 * Runs a chained multi-task execution using the Task tool.
 */

import Task from "@anthropic-ai/sdk/task";

async function runMultiTask() {
  console.log("\n🚀 Starting JKKN COE Multi-Agent Workflow...\n");

  const plan = await Task({
    subagent_type: "task-planner",
    description: "Create execution plan",
    prompt: "Break down feature: Hall Ticket Generation Module with subtasks and dependencies."
  });
  console.log("📝 PLAN\n", plan.output, "\n");

  const architecture = await Task({
    subagent_type: "code-architecture",
    description: "Design architecture",
    prompt: "Design DB schema, API routes, and component structure for Hall Ticket Generation."
  });
  console.log("🏗️ ARCHITECTURE\n", architecture.output, "\n");

  const api = await Task({
    subagent_type: "api-developer",
    description: "Develop backend APIs",
    prompt: "Implement CRUD endpoints for exam registration, verification, and hall ticket generation."
  });
  console.log("🔧 API DEVELOPMENT\n", api.output, "\n");

  const ui = await Task({
    subagent_type: "ui-component-builder",
    description: "Build UI pages",
    prompt: "Create UI forms for exam registration and hall ticket download using JKKN COE UI patterns."
  });
  console.log("🎨 UI COMPONENTS\n", ui.output, "\n");

  const review = await Task({
    subagent_type: "code-reviewer",
    description: "Review generated code",
    prompt: "Review the API and UI implementations for bugs, performance issues, and coding standards."
  });
  console.log("🔍 CODE REVIEW\n", review.output, "\n");

  const docs = await Task({
    subagent_type: "technical-writer",
    description: "Document the module",
    prompt: "Create technical documentation for hall ticket APIs, UI pages, workflows, and usage examples."
  });
  console.log("📘 DOCUMENTATION\n", docs.output, "\n");

  console.log("🎉 Multi-agent workflow completed successfully!\n");
}

runMultiTask();
