/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

const setUpInstance = require('./set_up_instance');
const execa = require('execa');

(async () => {
  const deploymentId = (
    await execa.command(`buildkite-agent meta-data get "deploymentId"`, {
      shell: true,
    })
  ).stdout;

  const credentials = (
    await execa.command(`buildkite-agent meta-data get "credentials"`, {
      shell: true,
    })
  ).stdout;

  const resources = (
    await execa.command(`buildkite-agent meta-data get "resources"`, {
      shell: true,
    })
  ).stdout;

  return await setUpInstance(deploymentId, JSON.parse(credentials), JSON.parse(resources));
})();
