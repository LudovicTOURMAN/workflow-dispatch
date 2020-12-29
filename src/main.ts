// ----------------------------------------------------------------------------
// Copyright (c) Ben Coleman, 2020
// Licensed under the MIT License.
//
// Workflow Dispatch Action - Main task code
// ----------------------------------------------------------------------------

import * as core from '@actions/core'
import * as github from '@actions/github'
import { formatDuration, getArgs, isTimedOut, sleep } from './utils';
import { WorkflowHandler, WorkflowRunConclusion, WorkflowRunResult, WorkflowRunStatus } from './workflow-handler';

async function waitForCompletionOrTimeout(workflowHandler: WorkflowHandler, checkStatusInterval: number, waitForCompletionTimeout: number) {
  const start = Date.now();
  let first = true;
  let status;
  let result;
  do {
    await sleep(checkStatusInterval);
    try {
      result = await workflowHandler.getWorkflowRunStatus();
      status = result.status;
      if (first) {
        core.info(`You can follow the running workflow here: ${result.url}`);
        first = false;
      }
      core.debug(`Worflow is running for ${formatDuration(Date.now() - start)}. Current status=${status}`)
    } catch(e) {
      core.warning(`Failed to get workflow status: ${e.message}`);
    }
  } while (status !== WorkflowRunStatus.COMPLETED && !isTimedOut(start, waitForCompletionTimeout));
  return { result, start }
}

function computeConclusion(start: number, waitForCompletionTimeout: number, result?: WorkflowRunResult) {
  if (isTimedOut(start, waitForCompletionTimeout)) {
    core.info(`Workflow wait timed out`);
    core.setOutput('workflow-conclusion', WorkflowRunConclusion.TIMED_OUT);
    throw new Error('Workflow run has failed due to timeout');
  }

  core.info(`Workflow completed with conclusion=${result?.conclusion}`);
  const conclusion = result?.conclusion;
  core.setOutput('workflow-conclusion', conclusion);

  if (conclusion === WorkflowRunConclusion.FAILURE)   throw new Error('Workflow run has failed');
  if (conclusion === WorkflowRunConclusion.CANCELLED) throw new Error('Workflow run was cancelled');
  if (conclusion === WorkflowRunConclusion.TIMED_OUT) throw new Error('Workflow run has failed due to timeout');
}

//
// Main task function (async wrapper)
//
async function run(): Promise<void> {
  try {
    const args = getArgs();
    const workflowHandler = new WorkflowHandler(args.token, args.workflowRef, args.owner, args.repo, args.ref);

    // Trigger workflow run
    workflowHandler.triggerWorkflow(args.inputs);
    core.info(`Workflow triggered 🚀`);

    if (!args.waitForCompletion) {
      return;
    }

    core.info(`Waiting for workflow completion`);
    const { result, start } = await waitForCompletionOrTimeout(workflowHandler, args.checkStatusInterval, args.waitForCompletionTimeout);

    computeConclusion(start, args.waitForCompletionTimeout, result);

  } catch (error) {
    core.setFailed(error.message);
  }
}

//
// Call the main task run function
//
run()