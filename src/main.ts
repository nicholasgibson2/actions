import { resolve } from 'path';
import * as core from '@actions/core';
import { LocalProgramArgs, LocalWorkspace } from '@pulumi/pulumi/x/automation';
import { Commands, makeConfig } from './config';
import { makeEnv } from './libs/envs';
import { addPullRequestMessage } from './libs/pr';
import * as pulumi from './libs/pulumi';
import { invariant, onOutput } from './libs/utils';

export const main = async (): Promise<void> => {
  const config = await makeConfig();
  const environmentVariables = makeEnv();
  core.debug('Configuration is loaded');

  invariant(pulumi.isAvailable(), 'Pulumi CLI is not available.');
  core.debug('Pulumi CLI is available');

  await pulumi.login(environmentVariables, config);

  const workDir = resolve(
    environmentVariables.GITHUB_WORKSPACE,
    config.workDir,
  );
  core.debug(`Working directory resolved at ${workDir}`);

  const stackArgs: LocalProgramArgs = {
    stackName: config.stackName,
    workDir: workDir,
  };

  const stack = await (config.upsert
    ? LocalWorkspace.createOrSelectStack(stackArgs)
    : LocalWorkspace.selectStack(stackArgs));


  if (config.refresh) {
    core.startGroup(`Refresh stack on ${config.stackName}`);
    await stack.refresh({ onOutput });
    core.endGroup();
  }

  core.startGroup(`pulumi ${config.command} on ${config.stackName}`);

  const actions: Record<Commands, () => Promise<string>> = {
    up: () => stack.up({ onOutput, ...config.options }).then((r) => r.stdout),
    update: () =>
      stack.up({ onOutput, ...config.options }).then((r) => r.stdout),
    refresh: () =>
      stack.refresh({ onOutput, ...config.options }).then((r) => r.stdout),
    destroy: () =>
      stack.destroy({ onOutput, ...config.options }).then((r) => r.stdout),
    preview: async () => {
      const { stdout, stderr } = await stack.preview(config.options);
      onOutput(stdout);
      onOutput(stderr);
      return stdout;
    },
  };

  core.debug(`Running action ${config.command}`);
  const output = await actions[config.command]();
  core.debug(`Done running action ${config.command}`);

  core.setOutput('output', output);

  const outputs = await stack.outputs();

  for (const [outKey, outExport] of Object.entries(outputs)) {
    core.setOutput(outKey, outExport.value);
    if (outExport.secret) {
      core.setSecret(outExport.value);
    }
  }

  if (config.commentOnPr) {
    core.debug(`Commenting on pull request`);
    invariant(config.githubToken, 'github-token is missing.');
    addPullRequestMessage(
      `#### :tropical_drink: \`${config.command}\`
\`\`\`
${output}
\`\`\``,
      config.githubToken,
    );
  }

  core.endGroup();
};

(async () => {
  try {
    await main();
  } catch (err) {
    if (err.message.stderr) {
      core.setFailed(err.message.stderr);
    } else {
      core.setFailed(err.message);
    }
  }
})();
